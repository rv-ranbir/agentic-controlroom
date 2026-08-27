import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { EventEmitter } from "node:events";

export interface ChatMessage {
  ts: string;
  agentId: string;
  role: string;
  message: string;
}

export class ChatLog extends EventEmitter {
  constructor(private file: string) {
    super();
    mkdirSync(dirname(file), { recursive: true });
  }

  post(agentId: string, role: string, message: string): ChatMessage {
    const msg: ChatMessage = { ts: new Date().toISOString(), agentId, role, message };
    appendFileSync(this.file, JSON.stringify(msg) + "\n");
    this.emit("message", msg);
    return msg;
  }

  // ephemeral "Dev is working…" style indicator — emitted, never persisted
  status(text: string): void {
    this.emit("status", text);
  }

  // ephemeral per-agent state for UIs (roster dots) — emitted, never persisted.
  // "needs" is a heuristic guess (the agent's reply looks like a question) — see
  // isQuestionLike() in src/orchestrator/needsInput.ts; it can be wrong in both directions.
  agentState(agentId: string, state: "idle" | "working" | "done" | "needs"): void {
    this.emit("agentState", { agentId, state });
  }

  // ephemeral raw activity line (tool calls, stream events) from a working agent
  activity(agentId: string, line: string): void {
    this.emit("activity", { agentId, line });
  }

  tail(n: number): ChatMessage[] {
    if (!existsSync(this.file)) return [];
    return readFileSync(this.file, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .slice(-n)
      .map((l) => JSON.parse(l) as ChatMessage);
  }
}
