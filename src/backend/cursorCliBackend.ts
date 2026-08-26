import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { AgentBackend, RoleConfig, StartResult } from "./agentBackend.js";

// Windows installs cursor-agent as a .cmd->powershell shim; spawning that through a
// shell mangles multiline prompts and is an injection risk. Resolve the real
// node.exe + index.js it wraps and spawn those directly instead.
function resolveLauncher(bin: string): { cmd: string; prefixArgs: string[]; shell: boolean } {
  if (process.platform !== "win32") return { cmd: bin, prefixArgs: [], shell: false };
  if (bin !== "cursor-agent") return { cmd: bin, prefixArgs: [], shell: bin.endsWith(".cmd") };
  const root = join(process.env.LOCALAPPDATA ?? "", "cursor-agent", "versions");
  try {
    // ponytail: lexical sort works because versions are zero-padded YYYY.MM.DD
    for (const v of readdirSync(root).sort().reverse()) {
      const node = join(root, v, "node.exe");
      const idx = join(root, v, "index.js");
      if (existsSync(node) && existsSync(idx)) return { cmd: node, prefixArgs: [idx], shell: false };
    }
  } catch {
    // fall through to shell shim
  }
  return { cmd: bin, prefixArgs: [], shell: true };
}

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
  private launcher: { cmd: string; prefixArgs: string[]; shell: boolean };
  private model?: string;
  private cwd: string;

  constructor(opts: CursorCliOptions = {}) {
    this.bin = opts.bin ?? process.env.CURSOR_AGENT_BIN ?? "cursor-agent";
    this.launcher = resolveLauncher(this.bin);
    this.model = opts.model;
    this.cwd = opts.cwd ?? process.cwd();
  }

  private exec(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.launcher.cmd, [...this.launcher.prefixArgs, ...args], {
        cwd: this.cwd,
        windowsHide: true,
        shell: this.launcher.shell,
        env: { ...process.env, CURSOR_INVOKED_AS: "cursor-agent" },
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
    // --trust: headless runs are always pointed at a directory the user chose
    const args = ["-p", "--trust", "--output-format", "json"];
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
