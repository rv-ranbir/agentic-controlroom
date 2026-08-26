import type { AgentBackend, RoleConfig } from "../backend/agentBackend.js";
import type { ChatLog } from "../chatroom/log.js";

export interface OrchestratorOptions {
  maxRounds?: number;
  tailSize?: number;
}

export type RoomResult = "approved" | "max-rounds";

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
  const chatroomTail = () =>
    log
      .tail(tailSize)
      .map((m) => `[${m.role}] ${m.message}`)
      .join("\n\n");

  log.post("orchestrator", "system", `Task: ${task}`);

  log.status(`${dev.name} is working…`);
  const devStart = await backend.start(
    dev,
    `Task:\n${task}\n\nWork on this task in the current repository. When done, summarize what you changed and end your message with "STATUS: READY_FOR_REVIEW".`,
  );
  log.post(dev.id, dev.name, devStart.reply);

  let qaSessionId: string | undefined;
  for (let round = 1; round <= maxRounds; round++) {
    const qaPrompt = `Chatroom so far:\n${chatroomTail()}\n\nReview the developer's work in the current repository. Verify the changes actually exist and do what the developer claims. End your message with "STATUS: APPROVED" or "STATUS: CHANGES_REQUESTED" followed by your findings.`;
    log.status(`${qa.name} is reviewing…`);
    let qaReply: string;
    if (qaSessionId === undefined) {
      const r = await backend.start(qa, qaPrompt);
      qaSessionId = r.sessionId;
      qaReply = r.reply;
    } else {
      qaReply = (await backend.resume(qaSessionId, qaPrompt, qa)).reply;
    }
    log.post(qa.id, qa.name, qaReply);

    if (APPROVED.test(qaReply)) {
      log.status("");
      log.post("orchestrator", "system", "QA approved. Done.");
      return "approved";
    }

    log.status(`${dev.name} is working…`);
    const devReply = (
      await backend.resume(
        devStart.sessionId,
        `Chatroom so far:\n${chatroomTail()}\n\nQA requested changes. Address the findings above in the repository, then end your message with "STATUS: READY_FOR_REVIEW".`,
        dev,
      )
    ).reply;
    log.post(dev.id, dev.name, devReply);
  }

  log.status("");
  log.post("orchestrator", "system", `Max rounds (${maxRounds}) reached without QA approval.`);
  return "max-rounds";
}
