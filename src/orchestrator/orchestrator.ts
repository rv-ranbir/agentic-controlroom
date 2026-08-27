import type { AgentBackend, RoleConfig } from "../backend/agentBackend.js";
import type { ChatLog } from "../chatroom/log.js";
import { isQuestionLike } from "./needsInput.js";

export interface OrchestratorOptions {
  maxRounds?: number;
  tailSize?: number;
  /** Stream each agent's raw work lines into log.activity (for live activity panes). */
  streamActivity?: boolean;
}

export type RoomResult = "approved" | "max-rounds" | "needs-input";

const APPROVED = /STATUS:\s*APPROVED/;

export async function runRoom(
  task: string,
  backend: AgentBackend,
  log: ChatLog,
  dev: RoleConfig,
  qa: RoleConfig,
  opts: OrchestratorOptions = {},
): Promise<RoomResult> {
  const maxRounds = opts.maxRounds ?? 3;
  const tailSize = opts.tailSize ?? 20;
  const onLineFor = (agentId: string) =>
    opts.streamActivity ? (line: string) => log.activity(agentId, line) : undefined;
  const chatroomTail = () =>
    log
      .tail(tailSize)
      .map((m) => `[${m.role}] ${m.message}`)
      .join("\n\n");

  log.post("orchestrator", "system", `Task: ${task}`);

  log.status(`${dev.name} is working…`);
  log.agentState(dev.id, "working");
  log.agentState(qa.id, "idle");
  const devStart = await backend.start(
    dev,
    `Task:\n${task}\n\nWork on this task in the current repository. When done, summarize what you changed and end your message with "STATUS: READY_FOR_REVIEW".`,
    onLineFor(dev.id),
  );
  log.post(dev.id, dev.name, devStart.reply);
  if (isQuestionLike(devStart.reply)) {
    log.status("");
    log.agentState(dev.id, "needs");
    log.agentState(qa.id, "idle");
    log.post("orchestrator", "system", `${dev.name} needs input — reply to them directly to continue.`);
    return "needs-input";
  }

  let qaSessionId: string | undefined;
  for (let round = 1; round <= maxRounds; round++) {
    const qaPrompt = `Chatroom so far:\n${chatroomTail()}\n\nReview the developer's work in the current repository. Verify the changes actually exist and do what the developer claims. End your message with "STATUS: APPROVED" or "STATUS: CHANGES_REQUESTED" followed by your findings.`;
    log.status(`${qa.name} is reviewing…`);
    log.agentState(dev.id, "idle");
    log.agentState(qa.id, "working");
    let qaReply: string;
    if (qaSessionId === undefined) {
      const r = await backend.start(qa, qaPrompt, onLineFor(qa.id));
      qaSessionId = r.sessionId;
      qaReply = r.reply;
    } else {
      qaReply = (await backend.resume(qaSessionId, qaPrompt, qa, onLineFor(qa.id))).reply;
    }
    log.post(qa.id, qa.name, qaReply);

    if (APPROVED.test(qaReply)) {
      log.status("");
      log.agentState(dev.id, "done");
      log.agentState(qa.id, "done");
      log.post("orchestrator", "system", "QA approved. Done.");
      return "approved";
    }

    if (isQuestionLike(qaReply)) {
      log.status("");
      log.agentState(qa.id, "needs");
      log.agentState(dev.id, "idle");
      log.post("orchestrator", "system", `${qa.name} needs input — reply to them directly to continue.`);
      return "needs-input";
    }

    log.status(`${dev.name} is working…`);
    log.agentState(dev.id, "working");
    log.agentState(qa.id, "idle");
    const devReply = (
      await backend.resume(
        devStart.sessionId,
        `Chatroom so far:\n${chatroomTail()}\n\nQA requested changes. Address the findings above in the repository, then end your message with "STATUS: READY_FOR_REVIEW".`,
        dev,
        onLineFor(dev.id),
      )
    ).reply;
    log.post(dev.id, dev.name, devReply);
    if (isQuestionLike(devReply)) {
      log.status("");
      log.agentState(dev.id, "needs");
      log.agentState(qa.id, "idle");
      log.post("orchestrator", "system", `${dev.name} needs input — reply to them directly to continue.`);
      return "needs-input";
    }
  }

  log.status("");
  log.agentState(dev.id, "idle");
  log.agentState(qa.id, "idle");
  log.post("orchestrator", "system", `Max rounds (${maxRounds}) reached without QA approval.`);
  return "max-rounds";
}
