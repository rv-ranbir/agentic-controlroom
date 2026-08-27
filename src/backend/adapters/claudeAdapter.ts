import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { ProviderAdapter, SpawnContext, ParserState } from "../providerAdapter.js";
import { classifyLine, bufferedParse } from "../streamBlocks.js";

const bin = process.env.CLAUDE_BIN ?? "claude";

export const claudeAdapter: ProviderAdapter = {
  id: "claude",

  async detect() {
    let version: string | undefined;
    try {
      // claude ships a real .ps1/node entry on Windows too; --version is a
      // fixed flag (no untrusted content), so shell:true here is safe.
      const out = execFileSync(bin, ["--version"], { shell: process.platform === "win32", timeout: 5000 }).toString();
      version = out.trim();
    } catch {
      return { available: false };
    }
    // No dedicated `claude auth status` subcommand — credential-file presence
    // is the cheap check (per docs/m0-cli-doctor.md); a real spawn is ground
    // truth, but that's a full process, not a detect()-time probe.
    const authed = existsSync(join(homedir(), ".claude", ".credentials.json"));
    return { available: true, version, authed };
  },

  spawnArgs(ctx: SpawnContext) {
    const args = ["-p", "--output-format", ctx.streaming ? "stream-json" : "json", "--permission-mode", "acceptEdits"];
    if (ctx.streaming) args.push("--verbose"); // claude requires --verbose with stream-json in -p mode
    if (ctx.model) args.push("--model", ctx.model);
    if (ctx.resumeSessionId) args.push("--resume", ctx.resumeSessionId);
    args.push(...(ctx.extraArgs ?? []));
    return { bin, args, env: { ...process.env } as Record<string, string> };
  },

  parse(chunk: string, state: ParserState) {
    return bufferedParse(chunk, state, classifyLine);
  },
};
