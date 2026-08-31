import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChatLog } from "../../chatroom/log.js";
import { runMeetingGraph } from "./meetingGraph.js";
import type { AgentBackend, RoleConfig } from "../../backend/agentBackend.js";
import type { MeetingParticipant } from "../meeting.js";

const alice: RoleConfig = { id: "alice", name: "Alice", systemPrompt: "You are Alice." };
const bob: RoleConfig = { id: "bob", name: "Bob", systemPrompt: "You are Bob." };
const carol: RoleConfig = { id: "carol", name: "Carol", systemPrompt: "You are Carol." };

function tmpLog(): ChatLog {
  const dir = mkdtempSync(join(tmpdir(), "agentic-controlroom-meetinggraph-test-"));
  return new ChatLog(join(dir, "log.jsonl"));
}

function fakeBackend(): AgentBackend {
  const calls: Record<string, number> = {};
  return {
    async start(role) {
      calls[role.id] = (calls[role.id] ?? 0) + 1;
      return { sessionId: `${role.id}-s1`, reply: `${role.name} says #${calls[role.id]}` };
    },
    async resume(_sessionId, _prompt, role) {
      calls[role.id] = (calls[role.id] ?? 0) + 1;
      return { reply: `${role.name} says #${calls[role.id]}` };
    },
  };
}

test("runMeetingGraph cycles all participants in order across every round", async () => {
  const log = tmpLog();
  const posted: { agentId: string; message: string }[] = [];
  log.on("message", (m) => posted.push({ agentId: m.agentId, message: m.message }));
  const backend = fakeBackend();
  const participants: MeetingParticipant[] = [
    { agent: alice, backend },
    { agent: bob, backend },
    { agent: carol, backend },
  ];

  await runMeetingGraph("what should we build", log, participants, 2);

  const speakerOrder = posted.filter((p) => p.agentId !== "orchestrator").map((p) => p.agentId);
  assert.deepEqual(speakerOrder, ["alice", "bob", "carol", "alice", "bob", "carol"]);
});

test("runMeetingGraph posts a start message with the topic and an end message", async () => {
  const log = tmpLog();
  const posted: { agentId: string; message: string }[] = [];
  log.on("message", (m) => posted.push({ agentId: m.agentId, message: m.message }));
  const backend = fakeBackend();
  const participants: MeetingParticipant[] = [{ agent: alice, backend }, { agent: bob, backend }];

  await runMeetingGraph("caching strategy", log, participants, 1);

  assert.ok(posted[0].agentId === "orchestrator" && posted[0].message.includes("caching strategy"));
  assert.ok(posted[posted.length - 1].agentId === "orchestrator" && posted[posted.length - 1].message.includes("ended"));
});
