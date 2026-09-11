import { test } from "node:test";
import assert from "node:assert/strict";
import type { AgentBackend, RoleConfig } from "./agentBackend.js";
import { withCapabilities } from "./capabilityBackend.js";

const role: RoleConfig = { id: "r", name: "R", systemPrompt: "system" };

test("passes prose through and refreshes the guide", async () => {
  const seen: string[] = [];
  const backend: AgentBackend = { start: async (r, p) => { seen.push(r.systemPrompt + p); return { sessionId: "s", reply: "hello" }; }, resume: async (_s,p,r) => {seen.push(r.systemPrompt+p);return {reply:""};} };
  const wrapped = withCapabilities(backend, { catalogue: () => ["x"], execute: async () => null });
  assert.equal((await wrapped.start(role, "ask")).reply, "hello");
  assert.match(seen[0], /list_capabilities/);
  await wrapped.resume("s", "again", role);
  assert.equal(seen.length, 2);
});

test("executes a tool and resumes with framed result", async () => {
  const prompts: string[] = [];
  let n = 0;
  const backend: AgentBackend = { start: async () => ({ sessionId: "s", reply: '{"agent_room":{"tool":"list_capabilities","arguments":{}}}' }), resume: async (_s, p) => { prompts.push(p); n++; return { reply: "done" }; } };
  const wrapped = withCapabilities(backend, { catalogue: () => ["list_capabilities"], execute: async () => ({ ok: true }) });
  assert.equal((await wrapped.start(role, "go")).reply, "done");
  assert.match(prompts[0], /Untrusted tool result/);
  assert.equal(n, 1);
});

test("keeps the original request and earlier results for stateless chaining", async () => {
  const prompts: string[] = [];
  let turn = 0;
  const backend: AgentBackend = {
    start: async (_r, p) => { if (p.includes("Continue")) { prompts.push(p); turn++; return { sessionId: "", reply: turn === 1 ? '{"agent_room":{"tool":"two","arguments":{}}}' : "finished" }; } return { sessionId: "", reply: '{"agent_room":{"tool":"one","arguments":{}}}', usage: { inputTokens: 3, outputTokens: 2, costUsd: null } }; },
    resume: async (_s, p) => { prompts.push(p); turn++; return { reply: turn === 1 ? '{"agent_room":{"tool":"two","arguments":{}}}' : "finished" }; },
  };
  const wrapped = withCapabilities(backend, { catalogue: () => ["one", "two"], execute: async (_r, tool) => ({ tool, value: "earlier" }) });
  const result = await wrapped.start(role, "retain this request");
  assert.equal(result.usage?.inputTokens, null);
  assert.match(prompts[1], /retain this request/);
  assert.match(prompts[1], /earlier/);
  assert.match(prompts[1], /one/);
});

test("rejects malformed calls, leaks no execution error, and enforces the limit", async () => {
  const backend: AgentBackend = { start: async () => ({ sessionId: "s", reply: "```json\n{\"agent_room\":{\"tool\":\"secret\",\"arguments\":{}}}\n```" }), resume: async (_s,p) => { assert.doesNotMatch(p,/SECRET/);return {reply:JSON.stringify({agent_room:{tool:"again",arguments:{}}})}; } };
  const wrapped = withCapabilities(backend, { catalogue: () => [], execute: async () => { throw new Error("SECRET"); }, maxToolCalls: 1 });
  await assert.rejects(() => wrapped.start(role, "go"), /budget exhausted/);
  assert.throws(() => withCapabilities(backend, { catalogue: () => [], execute: async () => null, maxToolCalls: 9 }), /1 to 8/);
});

test("rejects a malformed sole agent_room call clearly", async () => {
  const backend: AgentBackend = { start: async () => ({ sessionId: "s", reply: '{"agent_room":{"tool":"","arguments":{}}}' }), resume: async () => ({ reply: "" }) };
  await assert.rejects(() => withCapabilities(backend, { catalogue: () => [], execute: async () => null }).start(role, "go"), /Invalid agent_room tool call/);
});
