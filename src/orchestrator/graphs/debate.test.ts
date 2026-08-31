import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChatLog } from "../../chatroom/log.js";
import { runDebateGraph } from "./debate.js";
import type { AgentBackend, RoleConfig } from "../../backend/agentBackend.js";
import type { MeetingParticipant } from "../meeting.js";

const bull: RoleConfig = { id: "bull", name: "Bull Analyst", systemPrompt: "You argue the bull case." };
const bear: RoleConfig = { id: "bear", name: "Bear Analyst", systemPrompt: "You argue the bear case." };
const manager: RoleConfig = { id: "manager", name: "Risk Manager", systemPrompt: "You judge consensus." };

function tmpLog(): ChatLog {
  const dir = mkdtempSync(join(tmpdir(), "agentic-controlroom-debate-test-"));
  return new ChatLog(join(dir, "log.jsonl"));
}

// Ordered reply queue per role id, same convention as orchestrator.test.ts's fakeBackend.
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

test("runDebateGraph reaches consensus on the first round when the manager agrees immediately", async () => {
  const log = tmpLog();
  const posted: string[] = [];
  log.on("message", (m) => posted.push(m.agentId));
  const backend = fakeBackend({
    manager: ["Both make good points, we should proceed. STATUS: CONSENSUS"],
  });
  const analysts: MeetingParticipant[] = [{ agent: bull, backend }, { agent: bear, backend }];

  const result = await runDebateGraph("should we ship this", log, analysts, { agent: manager, backend });

  assert.equal(result, "consensus");
  assert.deepEqual(posted, ["orchestrator", "bull", "bear", "manager", "orchestrator"]);
});

test("runDebateGraph loops until maxRounds then returns no-consensus if the manager never agrees", async () => {
  const log = tmpLog();
  const backend = fakeBackend({
    manager: ["Still disagree. STATUS: CONTINUE_DEBATE"],
  });
  const analysts: MeetingParticipant[] = [{ agent: bull, backend }, { agent: bear, backend }];

  const result = await runDebateGraph("should we ship this", log, analysts, { agent: manager, backend }, { maxRounds: 2 });

  assert.equal(result, "no-consensus");
});
