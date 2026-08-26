#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ChatLog } from "./chatroom/log.js";
import { CursorCliBackend } from "./backend/cursorCliBackend.js";
import { runRoom } from "./orchestrator/orchestrator.js";
import type { RoleConfig } from "./backend/agentBackend.js";

const task = process.argv.slice(2).join(" ").trim();
if (!task) {
  console.error('Usage: agent-room "<task description>"');
  process.exit(1);
}

const rolesDir = new URL("../roles/", import.meta.url);
function loadRole(id: string, name: string, file: string): RoleConfig {
  return { id, name, systemPrompt: readFileSync(new URL(file, rolesDir), "utf8") };
}

const COLORS: Record<string, string> = {
  Dev: "\x1b[36m",
  QA: "\x1b[33m",
  system: "\x1b[90m",
};
const RESET = "\x1b[0m";

const log = new ChatLog(join(process.cwd(), ".agent-room", "log.jsonl"));
log.on("message", (m) => {
  const color = COLORS[m.role] ?? "\x1b[35m";
  console.log(`${color}[${m.role}]${RESET} ${m.message}\n`);
});

const backend = new CursorCliBackend({
  model: process.env.AGENT_ROOM_MODEL,
  cwd: process.cwd(),
});

const result = await runRoom(
  task,
  backend,
  log,
  loadRole("dev", "Dev", "dev.md"),
  loadRole("qa", "QA", "qa.md"),
  { maxRounds: Number(process.env.AGENT_ROOM_MAX_ROUNDS ?? 3) },
);

process.exit(result === "approved" ? 0 : 2);
