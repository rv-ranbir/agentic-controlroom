import type { AgentBackend, RoleConfig } from "../../backend/agentBackend.js";
import type { ChatLog } from "../../chatroom/log.js";
import { isQuestionLike } from "../needsInput.js";
import { runGraph, type GraphEdge, type GraphNode, type GraphState, type RoomResult } from "../graph.js";

export interface DevQaOptions {
  maxRounds?: number;
  tailSize?: number;
  streamActivity?: boolean;
}

const APPROVED = /STATUS:\s*APPROVED/;

// orchestrator.ts's Dev/QA loop, expressed as a graph (M12 phase 1 parity proof).
// Same prompts, same isQuestionLike()/APPROVED conditions, same log.status/
// agentState/post call shape as the loop this replaces — see
// docs/graph-orchestrator-design.md for why this exists.
export async function runDevQaGraph(
  task: string,
  backend: AgentBackend,
  log: ChatLog,
  dev: RoleConfig,
  qa: RoleConfig,
  opts: DevQaOptions = {},
): Promise<RoomResult> {
  const maxRounds = opts.maxRounds ?? 3;
  const tailSize = opts.tailSize ?? 20;
  const chatroomTail = () =>
    log
      .tail(tailSize)
      .map((m) => `[${m.role}] ${m.message}`)
      .join("\n\n");
  const needsInputMsg = (role: RoleConfig) => `${role.name} needs input — reply to them directly to continue.`;

  const questionLike = (state: GraphState) => isQuestionLike(String(state.data.lastReply ?? ""));
  const approved = (state: GraphState) => APPROVED.test(String(state.data.lastReply ?? ""));
  const otherwise = () => true;
  // "qa" hasn't started yet iff this is dev's very first completed turn (the initial
  // task) — every later dev turn is a revision after QA requested changes, and
  // orchestrator.ts's `for` loop only advances `round` once per revision, right
  // before QA runs again. The round gate models exactly that advance point.
  const devFirstTurn = (state: GraphState) => !state.sessions.has("qa");

  const nodes: GraphNode[] = [
    {
      kind: "agent",
      id: "dev",
      role: dev,
      backend,
      beforeRun: (_state, log) => log.agentState(qa.id, "idle"),
      buildPrompt: (state) =>
        state.sessions.has("dev")
          ? `Chatroom so far:\n${chatroomTail()}\n\nQA requested changes. Address the findings above in the repository, then end your message with "STATUS: READY_FOR_REVIEW".`
          : `Task:\n${task}\n\nWork on this task in the current repository. When done, summarize what you changed and end your message with "STATUS: READY_FOR_REVIEW".`,
      streamActivity: opts.streamActivity,
    },
    {
      kind: "agent",
      id: "qa",
      role: qa,
      backend,
      beforeRun: (_state, log) => log.agentState(dev.id, "idle"),
      buildPrompt: () =>
        `Chatroom so far:\n${chatroomTail()}\n\nReview the developer's work in the current repository. Verify the changes actually exist and do what the developer claims. End your message with "STATUS: APPROVED" or "STATUS: CHANGES_REQUESTED" followed by your findings.`,
      streamActivity: opts.streamActivity,
    },
    {
      kind: "gate",
      id: "roundGate",
      run: (state) => { state.round += 1; },
    },
    {
      kind: "terminal",
      id: "tNeedsInputDev",
      result: "needs-input",
      onEnter: (_state, log) => {
        log.status("");
        log.agentState(dev.id, "needs");
        log.agentState(qa.id, "idle");
        log.post("orchestrator", "system", needsInputMsg(dev));
      },
    },
    {
      kind: "terminal",
      id: "tNeedsInputQa",
      result: "needs-input",
      onEnter: (_state, log) => {
        log.status("");
        log.agentState(qa.id, "needs");
        log.agentState(dev.id, "idle");
        log.post("orchestrator", "system", needsInputMsg(qa));
      },
    },
    {
      kind: "terminal",
      id: "tApproved",
      result: "approved",
      onEnter: (_state, log) => {
        log.status("");
        log.agentState(dev.id, "done");
        log.agentState(qa.id, "done");
        log.post("orchestrator", "system", "QA approved. Done.");
      },
    },
    {
      kind: "terminal",
      id: "tMaxRounds",
      result: "max-rounds",
      onEnter: (_state, log) => {
        log.status("");
        log.agentState(dev.id, "idle");
        log.agentState(qa.id, "idle");
        log.post("orchestrator", "system", `Max rounds (${maxRounds}) reached without QA approval.`);
      },
    },
  ];

  const edges: GraphEdge[] = [
    { from: "dev", to: "tNeedsInputDev", condition: questionLike },
    { from: "dev", to: "qa", condition: devFirstTurn },
    { from: "dev", to: "roundGate", condition: otherwise },

    { from: "qa", to: "tApproved", condition: approved },
    { from: "qa", to: "tNeedsInputQa", condition: questionLike },
    { from: "qa", to: "dev", condition: otherwise },

    { from: "roundGate", to: "qa", condition: (state) => state.round <= maxRounds },
    { from: "roundGate", to: "tMaxRounds", condition: otherwise },
  ];

  log.post("orchestrator", "system", `Task: ${task}`);
  return runGraph("dev", nodes, edges, log, { maxSteps: maxRounds * 4 + 4 });
}
