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

test('token saving avoids replay only for explicitly retained sessions, on start and resume', async () => {
 for (const retainedSession of [false,true]) for (const tokenSaving of [false,true]) for(const entry of ['start','resume']) {
  const prompts:string[]=[];let n=0;
  const replies=['one','two','done'];
  const respond=(p:string)=>{prompts.push(p);const tool=replies[n++];return {sessionId:'s',reply:tool==='done'?'done':JSON.stringify({agent_room:{tool,arguments:{}}})};};
  const backend:AgentBackend={start:async(_r,p)=>respond(p),resume:async(_s,p)=>respond(p)};
  const wrapped=withCapabilities(backend,{tokenSaving,retainedSession,catalogue:()=>['one','two'],execute:async(_r,tool)=>({evidence:tool==='one'?'FIRST_EVIDENCE':'SECOND_EVIDENCE'})});
  if(entry==='start')await wrapped.start(role,'USER_CONSTRAINT');else await wrapped.resume('s','USER_CONSTRAINT',role);
  assert.match(prompts[2],/SECOND_EVIDENCE/);
  assert.match(prompts[2],/Untrusted tool result/);
  if(tokenSaving&&retainedSession){assert.doesNotMatch(prompts[2],/FIRST_EVIDENCE|USER_CONSTRAINT/);}
  else {assert.match(prompts[2],/FIRST_EVIDENCE/);assert.match(prompts[2],/USER_CONSTRAINT/);}
 }
});
test('saving never rewrites skill content or capability schemas', async () => {
 const data=Array.from({length:40},(_,i)=>({name:'name-'+i,instruction:'instruction '.repeat(30)}));
 for(const tool of ['read_skill','list_capabilities']) {
  let seen='';const backend:AgentBackend={start:async()=>({sessionId:'s',reply:JSON.stringify({agent_room:{tool,arguments:{}}})}),resume:async(_s,p)=>{seen=p;return {reply:'done'};}};
  await withCapabilities(backend,{tokenSaving:true,catalogue:()=>[],execute:async()=>data}).start(role,'go');
  assert.ok(seen.includes(JSON.stringify(data)));assert.doesNotMatch(seen,/TOON data:/);
 }
});
test('a missing retained session falls back to complete context', async () => {
 let n=0;const prompts:string[]=[];
 const backend:AgentBackend={start:async(_r,p)=>{prompts.push(p);return {sessionId:'',reply:n++===0?'{"agent_room":{"tool":"one","arguments":{}}}':'done'};},resume:async()=>{throw Error('must not resume');}};
 await withCapabilities(backend,{tokenSaving:true,retainedSession:true,catalogue:()=>[],execute:async()=>({value:'evidence'})}).start(role,'original');
 assert.match(prompts[1],/original/);assert.match(prompts[1],/evidence/);
});


test('cancellation after a model response prevents a requested app tool and follow-up',async()=>{
 const controller=new AbortController();let tools=0,calls=0;
 const backend=withCapabilities({start:async()=>{calls++;controller.abort();return {sessionId:'s',reply:'{"agent_room":{"tool":"list_capabilities","arguments":{}}}'}},resume:async()=>{calls++;return {reply:''}}},
 {signal:controller.signal,catalogue:()=>[],execute:async()=>{tools++;return []}});
 await assert.rejects(backend.start(role,'task'),/cancel/i);assert.equal(tools,0);assert.equal(calls,1);
});
test('cancellation during an app tool prevents the next model call',async()=>{
 const controller=new AbortController();let calls=0;
 const backend=withCapabilities({start:async()=>{calls++;return {sessionId:'s',reply:'{"agent_room":{"tool":"list_capabilities","arguments":{}}}'}},resume:async()=>{calls++;return {reply:''}}},
 {signal:controller.signal,catalogue:()=>[],execute:async()=>{controller.abort();return []}});
 await assert.rejects(backend.start(role,'task'),/cancel/i);assert.equal(calls,1);
});
