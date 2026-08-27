import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChatLog } from "../chatroom/log.js";
import { runRoom } from "./orchestrator.js";
import type { AgentBackend, RoleConfig } from "../backend/agentBackend.js";

const dev: RoleConfig = { id: "dev", name: "Developer", systemPrompt: "You are Dev." };
const qa: RoleConfig = { id: "qa", name: "QA", systemPrompt: "You are QA." };

function tmpLog(): ChatLog {
  const dir = mkdtempSync(join(tmpdir(), "agent-room-orchestrator-test-"));
  return new ChatLog(join(dir, "log.jsonl"));
}

// Canned replies keyed by role id, each an ordered queue: first start()/resume()
// for that role consumes replies[roleId][0], the next replies[roleId][1], etc.
// (mirrors the real flow: each role's first turn goes through start(), every
// later turn for that same role goes through resume()).
function fakeBackend(replies: Record<string, string[]>): AgentBackend {
  const calls: Record<string, number> = {};
  const next = (roleId: string) => {
    const i = calls[roleId] ?? 0;
    calls[roleId] = i + 1;
    const queue = replies[roleId] ?? [];
    return queue[i] ?? queue[queue.length - 1] ?? "";
  };
  return {
    async start(role) {
      return { sessionId: `${role.id}-s1`, reply: next(role.id) };
    },
    async resume(_sessionId, _prompt, role) {
      return { reply: next(role.id) };
    },
  };
}

test("runRoom returns needs-input and sets agentState when dev's first reply looks like a question", async () => {
  const log = tmpLog();
  const states: { agentId: string; state: string }[] = [];
  log.on("agentState", (s) => states.push(s));
  const backend = fakeBackend({ dev: ["Should I use Redis or an in-memory cache for this?"] });

  const result = await runRoom("add caching", backend, log, dev, qa);

  assert.equal(result, "needs-input");
  assert.ok(states.some((s) => s.agentId === "dev" && s.state === "needs"), JSON.stringify(states));
});

test("runRoom returns needs-input when QA's review reply looks like a question, not a false CHANGES_REQUESTED", async () => {
  const log = tmpLog();
  const states: { agentId: string; state: string }[] = [];
  log.on("agentState", (s) => states.push(s));
  const backend = fakeBackend({
    dev: ["Added the endpoint. STATUS: READY_FOR_REVIEW"],
    qa: ["Which auth scheme should this endpoint use — session cookie or bearer token?"],
  });

  const result = await runRoom("add an endpoint", backend, log, dev, qa);

  assert.equal(result, "needs-input");
  assert.ok(states.some((s) => s.agentId === "qa" && s.state === "needs"), JSON.stringify(states));
});

test("runRoom still returns approved when QA approves outright (no false needs-input)", async () => {
  const log = tmpLog();
  const backend = fakeBackend({
    dev: ["Added the endpoint. STATUS: READY_FOR_REVIEW"],
    qa: ["Looks correct and matches the request. STATUS: APPROVED"],
  });

  const result = await runRoom("add an endpoint", backend, log, dev, qa);

  assert.equal(result, "approved");
});
