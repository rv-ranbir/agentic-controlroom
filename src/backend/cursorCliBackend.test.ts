import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAgentOutput } from "./cursorCliBackend.js";

test("parses cursor-agent json result with session id", () => {
  const out = JSON.stringify({
    type: "result",
    result: "Added health endpoint.\nSTATUS: READY_FOR_REVIEW",
    session_id: "abc-123",
  });
  const parsed = parseAgentOutput(out);
  assert.equal(parsed.sessionId, "abc-123");
  assert.match(parsed.reply, /STATUS: READY_FOR_REVIEW/);
});

test("picks last json line when stream noise precedes result", () => {
  const out = ['{"type":"progress"}', '{"result":"done","session_id":"s1"}'].join("\n");
  assert.deepEqual(parseAgentOutput(out), { reply: "done", sessionId: "s1" });
});

test("falls back to raw text when output is not json", () => {
  const parsed = parseAgentOutput("plain text reply\n");
  assert.equal(parsed.reply, "plain text reply");
  assert.equal(parsed.sessionId, undefined);
});
