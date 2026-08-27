import { execFileSync } from "node:child_process";
import type { ProviderAdapter, SpawnContext, ParserState } from "../providerAdapter.js";
import { classifyLine, bufferedParse } from "../streamBlocks.js";
import { resolveLauncher } from "../cursorCliBackend.js";

const bin = process.env.CURSOR_AGENT_BIN ?? "cursor-agent";

export const cursorAdapter: ProviderAdapter = {
  id: "cursor",

  async detect() {
    let version: string | undefined;
    try {
      const out = execFileSync(bin, ["--version"], { shell: process.platform === "win32", timeout: 5000 }).toString();
      version = out.trim();
    } catch {
      return { available: false };
    }
    let authed = false;
    try {
      // `cursor-agent status` is a documented, cheap auth check (docs/m0-cli-doctor.md).
      const out = execFileSync(bin, ["status"], { shell: process.platform === "win32", timeout: 5000 }).toString();
      authed = /logged in/i.test(out);
    } catch {
      authed = false;
    }
    return { available: true, version, authed };
  },

  spawnArgs(ctx: SpawnContext) {
    const launcher = resolveLauncher(bin);
    const args = ["-p", "--trust", "--output-format", ctx.streaming ? "stream-json" : "json"];
    if (ctx.model) args.push("--model", ctx.model);
    if (ctx.resumeSessionId) args.push("--resume", ctx.resumeSessionId);
    args.push(...(ctx.extraArgs ?? []));
    return {
      bin: launcher.cmd,
      args: [...launcher.prefixArgs, ...args],
      env: { ...process.env, CURSOR_INVOKED_AS: "cursor-agent" } as Record<string, string>,
    };
  },

  parse(chunk: string, state: ParserState) {
    return bufferedParse(chunk, state, classifyLine);
  },
};
