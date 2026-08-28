import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { AgentBackend, OnLine, OnProcess, RoleConfig, StartResult } from "./agentBackend.js";

export interface CursorCliOptions {
  bin?: string;
  model?: string;
  cwd?: string;
  /** Extra CLI flags from the agent's "CLI flags" field, appended after the standard args. */
  extraArgs?: string[];
  /** Extra env vars for the spawned process (e.g. decrypted project secrets). Merged over process.env. */
  env?: Record<string, string>;
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

/** Collects stdout while forwarding each complete line to onLine as it arrives. */
export function lineCollector(onLine?: OnLine): { push: (chunk: string) => void; done: () => string } {
  let all = "";
  let pending = "";
  return {
    push(chunk: string) {
      all += chunk;
      if (!onLine) return;
      pending += chunk;
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const l of lines) if (l.trim()) onLine(l);
    },
    done() {
      if (onLine && pending.trim()) onLine(pending);
      return all;
    },
  };
}

// Windows installs cursor-agent as a .cmd->powershell shim; spawning that through a
// shell mangles multiline prompts and is an injection risk. Resolve the real
// node.exe + index.js it wraps and spawn those directly instead.
export function resolveLauncher(bin: string): { cmd: string; prefixArgs: string[]; shell: boolean } {
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

export class CursorCliBackend implements AgentBackend {
  private bin: string;
  private launcher: { cmd: string; prefixArgs: string[]; shell: boolean };
  private model?: string;
  private cwd: string;
  private extraArgs: string[];
  private env?: Record<string, string>;

  constructor(opts: CursorCliOptions = {}) {
    this.bin = opts.bin ?? process.env.CURSOR_AGENT_BIN ?? "cursor-agent";
    this.launcher = resolveLauncher(this.bin);
    this.model = opts.model;
    this.cwd = opts.cwd ?? process.cwd();
    this.extraArgs = opts.extraArgs ?? [];
    this.env = opts.env;
  }

  private exec(args: string[], onLine?: OnLine, onProcess?: OnProcess): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.launcher.cmd, [...this.launcher.prefixArgs, ...args], {
        cwd: this.cwd,
        windowsHide: true,
        shell: this.launcher.shell,
        // non-Windows: own process group, so a caller can kill the whole tree via
        // process.kill(-pid). Windows tree-kill goes through `taskkill /t` instead.
        detached: process.platform !== "win32",
        env: { ...process.env, CURSOR_INVOKED_AS: "cursor-agent", ...this.env },
      });
      onProcess?.(child);
      const out = lineCollector(onLine);
      let stderr = "";
      child.stdout.on("data", (d) => out.push(String(d)));
      child.stderr.on("data", (d) => (stderr += d));
      child.on("error", (err) =>
        reject(
          new Error(
            `Failed to launch "${this.bin}": ${err.message}. Install the Cursor CLI (https://cursor.com/docs/cli/overview) or set CURSOR_AGENT_BIN to its full path.`,
          ),
        ),
      );
      child.on("close", (code) => {
        if (code === 0) resolve(out.done());
        else reject(new Error(`${this.bin} exited with code ${code}: ${stderr.trim().slice(0, 500)}`));
      });
    });
  }

  private baseArgs(streaming: boolean): string[] {
    // --trust: headless runs are always pointed at a directory the user chose
    const args = ["-p", "--trust", "--output-format", streaming ? "stream-json" : "json"];
    if (this.model) args.push("--model", this.model);
    args.push(...this.extraArgs);
    return args;
  }

  async start(role: RoleConfig, prompt: string, onLine?: OnLine, onProcess?: OnProcess): Promise<StartResult> {
    const out = await this.exec([...this.baseArgs(!!onLine), `${role.systemPrompt}\n\n${prompt}`], onLine, onProcess);
    const { reply, sessionId } = parseAgentOutput(out);
    // ponytail: missing session id tolerated — orchestrator prompts always carry the
    // chatroom tail, so a stateless fallback still coordinates, just without CLI-side history.
    return { sessionId: sessionId ?? "", reply };
  }

  async resume(sessionId: string, prompt: string, role: RoleConfig, onLine?: OnLine, onProcess?: OnProcess): Promise<{ reply: string }> {
    const args = sessionId
      ? [...this.baseArgs(!!onLine), "--resume", sessionId, prompt]
      : [...this.baseArgs(!!onLine), `${role.systemPrompt}\n\n${prompt}`];
    const out = await this.exec(args, onLine, onProcess);
    return { reply: parseAgentOutput(out).reply };
  }
}
