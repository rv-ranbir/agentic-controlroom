import type { GraphEdge, GraphNode, GraphState } from "../graph.js";
import { runGraph } from "../graph.js";
import { chainRoundRobin } from "./roundRobin.js";
import type { ChatLog } from "../../chatroom/log.js";
import type { MeetingParticipant } from "../meeting.js";

export interface DebateOptions {
  maxRounds?: number;
  streamActivity?: boolean;
}

export type DebateResult = "consensus" | "no-consensus";

const CONSENSUS = /STATUS:\s*CONSENSUS/;

// M12 phase 2, part 2 — the new topology devQa's fixed loop and meetingGraph's
// round-robin couldn't express: several analysts give input, one manager
// judges whether they agree, loops for another round if not. Analyst chaining
// reuses roundRobin.ts (same helper meetingGraph.ts uses); the manager's
// consensus check reuses the same "agent reply matched a regex" edge-condition
// style devQa.ts already established for APPROVED. See
// docs/graph-orchestrator-design.md.
export async function runDebateGraph(
  topic: string,
  log: ChatLog,
  analysts: MeetingParticipant[],
  manager: MeetingParticipant,
  opts: DebateOptions = {},
): Promise<DebateResult> {
  const maxRounds = opts.maxRounds ?? 3;
  const names = analysts.map((a) => a.agent.name).join(", ");
  log.post("orchestrator", "system", `Debate started — analysts: ${names}; manager: ${manager.agent.name}\nTopic: ${topic}`);

  const analystIds = analysts.map((a) => a.agent.id);
  const analystNodes: GraphNode<DebateResult>[] = analysts.map((a) => ({
    kind: "agent",
    id: a.agent.id,
    role: a.agent,
    backend: a.backend,
    buildPrompt: (state: GraphState) => {
      if (!state.sessions.has(a.agent.id)) {
        return `You're one of several analysts weighing in on:\n\n${topic}\n\nGive your position and reasoning in a few sentences.`;
      }
      const tail = log.tail(50).map((m) => `[${m.role}] ${m.message}`).join("\n\n");
      return `Debate so far:\n${tail}\n\nRestate or revise your position given what the others said, in a few sentences.`;
    },
    streamActivity: opts.streamActivity,
  }));

  const managerNode: GraphNode<DebateResult> = {
    kind: "agent",
    id: "manager",
    role: manager.agent,
    backend: manager.backend,
    buildPrompt: () => {
      const tail = log.tail(50).map((m) => `[${m.role}] ${m.message}`).join("\n\n");
      return `Debate so far:\n${tail}\n\nDo the analysts substantially agree? If yes, state the consensus decision and end with "STATUS: CONSENSUS". If they still disagree, end with "STATUS: CONTINUE_DEBATE".`;
    },
    streamActivity: opts.streamActivity,
  };

  const nodes: GraphNode<DebateResult>[] = [
    ...analystNodes,
    managerNode,
    { kind: "gate", id: "roundGate", run: (state: GraphState) => { state.round += 1; } },
    {
      kind: "terminal",
      id: "tConsensus",
      result: "consensus",
      onEnter: (_state, log) => {
        log.status("");
        for (const a of analysts) log.agentState(a.agent.id, "idle");
        log.agentState(manager.agent.id, "idle");
        log.post("orchestrator", "system", "Consensus reached.");
      },
    },
    {
      kind: "terminal",
      id: "tNoConsensus",
      result: "no-consensus",
      onEnter: (_state, log) => {
        log.status("");
        for (const a of analysts) log.agentState(a.agent.id, "idle");
        log.agentState(manager.agent.id, "idle");
        log.post("orchestrator", "system", `No consensus after ${maxRounds} rounds.`);
      },
    },
  ];

  const consensus = (state: GraphState) => CONSENSUS.test(String(state.data.lastReply ?? ""));

  const edges: GraphEdge[] = [
    ...chainRoundRobin(analystIds, "manager"),
    { from: "manager", to: "tConsensus", condition: consensus },
    { from: "manager", to: "roundGate", condition: () => true },
    { from: "roundGate", to: analystIds[0], condition: (state) => state.round <= maxRounds },
    { from: "roundGate", to: "tNoConsensus", condition: () => true },
  ];

  return runGraph(analystIds[0], nodes, edges, log, { maxSteps: (analystIds.length + 2) * maxRounds + 4 });
}
