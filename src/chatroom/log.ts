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
