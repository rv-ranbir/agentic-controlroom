import { spawn } from "node:child_process";
import type { AgentBackend, RoleConfig, StartResult } from "./agentBackend.js";

export interface CursorCliOptions {
  bin?: string;
  model?: string;
  cwd?: string;
}

export function parseAgentOutput(stdout: string): { reply: string; sessionId?: string } {
  const lines = stdout.trim().split("\n").filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const obj = JSON.parse(lines[i]);
      const reply = obj.result ?? obj.text ?? obj.message;
      if (typeof reply === "string") {
        const sessionId = obj.session_id ?? obj.sessionId ?? obj.chat_id;
        return { reply, sessionId: typeof sessionId === "string" ? sessionId : undefined };
      }
    } catch {
      // not JSON, keep scanning upward
    }
  }
  return { reply: stdout.trim() };
}

export class CursorCliBackend implements AgentBackend {
  private bin: string;
  private model?: string;
  private cwd: string;

  constructor(opts: CursorCliOptions = {}) {
    this.bin = opts.bin ?? process.env.CURSOR_AGENT_BIN ?? "cursor-agent";
    this.model = opts.model;
    this.cwd = opts.cwd ?? process.cwd();
  }

  private exec(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.bin, args, {
        cwd: this.cwd,
        windowsHide: true,
        shell: process.platform === "win32",
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += d));
      child.stderr.on("data", (d) => (stderr += d));
      child.on("error", (err) =>
        reject(
          new Error(
            `Failed to launch "${this.bin}": ${err.message}. Install the Cursor CLI (https://cursor.com/docs/cli/overview) or set CURSOR_AGENT_BIN to its full path.`,
          ),
        ),
      );
      child.on("close", (code) => {
        if (code === 0) resolve(stdout);
        else reject(new Error(`${this.bin} exited with code ${code}: ${stderr.trim().slice(0, 500)}`));
      });
    });
  }

  private baseArgs(): string[] {
    const args = ["-p", "--output-format", "json"];
    if (this.model) args.push("--model", this.model);
    return args;
  }

  async start(role: RoleConfig, prompt: string): Promise<StartResult> {
    const out = await this.exec([...this.baseArgs(), `${role.systemPrompt}\n\n${prompt}`]);
    const { reply, sessionId } = parseAgentOutput(out);
    // ponytail: missing session id tolerated — orchestrator prompts always carry the
    // chatroom tail, so a stateless fallback still coordinates, just without CLI-side history.
    return { sessionId: sessionId ?? "", reply };
  }

  async resume(sessionId: string, prompt: string, role: RoleConfig): Promise<{ reply: string }> {
    const args = sessionId
      ? [...this.baseArgs(), "--resume", sessionId, prompt]
      : [...this.baseArgs(), `${role.systemPrompt}\n\n${prompt}`];
    const out = await this.exec(args);
    return { reply: parseAgentOutput(out).reply };
  }
}
