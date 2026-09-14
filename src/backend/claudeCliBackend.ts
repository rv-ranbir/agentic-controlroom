import {cliUsage} from '../harness/usage.js';
import { spawn } from "node:child_process";
import type { AgentBackend, OnLine, OnProcess, RoleConfig, StartResult } from "./agentBackend.js";
import { lineCollector, parseAgentOutput } from "./cursorCliBackend.js";

export function claudeResult(output:string):StartResult {
  const usage=cliUsage('claude',output);
  for(const line of output.trim().split('\n').reverse()) {
    let record;try{record=JSON.parse(line);}catch{continue;}
    if(record?.type==='result') {
      if(record.is_error===true)throw Object.assign(new Error('Claude reported an unsuccessful run.'),{usage});
      break;
    }
  }
  const {reply,sessionId}=parseAgentOutput(output);
  return {sessionId:sessionId??'',reply,usage};
}

export interface ClaudeCliOptions {
  bin?: string;
  model?: string;
  cwd?: string;
  /** Claude Code permission mode for headless runs. */
  permissionMode?: string;
  /** Extra CLI flags from the agent's "CLI flags" field, appended after the standard args. */
  extraArgs?: string[];
  /** Extra env vars for the spawned process (e.g. decrypted project secrets). Merged over process.env. */
  env?: Record<string, string>;
}

/**
 * Backend for the Claude Code CLI (`claude`), using the user's existing
 * Claude subscription/login. Prompt is written to stdin, so argv carries only
 * static flags — safe to spawn through a shell shim on Windows.
 */
export class ClaudeCliBackend implements AgentBackend {
  private bin: string;
  private model?: string;
  private cwd: string;
  private permissionMode: string;
  private extraArgs: string[];
  private env?: Record<string, string>;

  constructor(opts: ClaudeCliOptions = {}) {
    this.bin = opts.bin ?? process.env.CLAUDE_BIN ?? "claude";
    this.model = opts.model;
    this.cwd = opts.cwd ?? process.cwd();
    this.permissionMode = opts.permissionMode ?? "acceptEdits";
    this.extraArgs = opts.extraArgs ?? [];
    this.env = opts.env;
  }

  private exec(args: string[], stdin: string, onLine?: OnLine, onProcess?: OnProcess): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.bin, args, {
        cwd: this.cwd,
        windowsHide: true,
        shell: process.platform === "win32",
        // non-Windows: own process group, so a caller can kill the whole tree via
        // process.kill(-pid). Windows tree-kill goes through `taskkill /t` instead
        // (needed there regardless, since shell:true wraps the real process anyway).
        detached: process.platform !== "win32",
        env: this.env,
      });
      onProcess?.(child);
      const out = lineCollector(onLine);
      let stderr = "";
      child.stdout.on("data", (d) => out.push(String(d)));
      child.stderr.on("data", (d) => (stderr += d));
      child.on("error", (err) =>
        reject(
          new Error(
            `Failed to launch "${this.bin}": ${err.message}. Install Claude Code or set CLAUDE_BIN to its full path.`,
          ),
        ),
      );
      child.on("close", (code) => {
        if (code === 0) resolve(out.done());
        else reject(Object.assign(new Error(`${this.bin} exited with code ${code}: ${stderr.trim().slice(0, 500)}`),{usage:cliUsage("claude",out.done())}));
      });
      child.stdin.write(stdin);
      child.stdin.end();
    });
  }

  private baseArgs(streaming: boolean): string[] {
    const args = ["-p", "--output-format", streaming ? "stream-json" : "json", "--permission-mode", this.permissionMode];
    if (streaming) args.push("--verbose"); // claude requires --verbose with stream-json in -p mode
    if (this.model) args.push("--model", this.model);
    args.push(...this.extraArgs);
    return args;
  }

  // role prompt goes through stdin with the task — argv stays static flags only
  // (Windows shell shim would mangle multiline argv content)
  async start(role: RoleConfig, prompt: string, onLine?: OnLine, onProcess?: OnProcess): Promise<StartResult> {
    const out = await this.exec(this.baseArgs(!!onLine), `${role.systemPrompt}\n\n${prompt}`, onLine, onProcess);
    return claudeResult(out);
  }

  async resume(sessionId: string, prompt: string, role: RoleConfig, onLine?: OnLine, onProcess?: OnProcess): Promise<import("./agentBackend.js").ReplyResult> {
    const args = sessionId ? [...this.baseArgs(!!onLine), "--resume", sessionId] : this.baseArgs(!!onLine);
    const stdin = sessionId ? prompt : `${role.systemPrompt}\n\n${prompt}`;
    const out = await this.exec(args, stdin, onLine, onProcess);
    const {reply,usage}=claudeResult(out);return {reply,usage};
  }
}
