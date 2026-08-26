#!/usr/bin/env node
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ChatLog } from "./chatroom/log.js";
import { CursorCliBackend } from "./backend/cursorCliBackend.js";
import { runRoom } from "./orchestrator/orchestrator.js";
import { loadRole } from "./roles.js";

const task = process.argv.slice(2).join(" ").trim();
if (!task) {
  console.error('Usage: agent-room "<task description>"');
  process.exit(1);
}

const rolesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "roles");

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
  loadRole(rolesDir, "dev", "Dev", "dev.md"),
  loadRole(rolesDir, "qa", "QA", "qa.md"),
  { maxRounds: Number(process.env.AGENT_ROOM_MAX_ROUNDS ?? 3) },
);

process.exit(result === "approved" ? 0 : 2);
