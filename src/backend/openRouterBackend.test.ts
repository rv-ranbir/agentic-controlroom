import { test } from "node:test";
import assert from "node:assert/strict";
import { OpenRouterBackend } from "./openRouterBackend.js";

const dev: { id: string; name: string; systemPrompt: string } = { id: "dev", name: "Developer", systemPrompt: "You are Dev." };

test("start() posts to OpenRouter with the configured model and returns the reply", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ choices: [{ message: { content: "Added the endpoint." } }] }), { status: 200 });
  }) as typeof fetch;

  try {
    const backend = new OpenRouterBackend({ apiKey: "sk-test", model: "anthropic/claude-3.5-sonnet" });
    const { reply, sessionId } = await backend.start(dev, "add a /health endpoint");
    assert.equal(reply, "Added the endpoint.");
    assert.equal(sessionId, "");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal((calls[0].init.headers as Record<string, string>).Authorization, "Bearer sk-test");
    const body = JSON.parse(String(calls[0].init.body));
    assert.equal(body.model, "anthropic/claude-3.5-sonnet");
    assert.deepEqual(body.messages, [
      { role: "system", content: "You are Dev." },
      { role: "user", content: "add a /health endpoint" },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("throws a clear error when no API key is configured", async () => {
  const backend = new OpenRouterBackend({});
  await assert.rejects(() => backend.start(dev, "hi"), /No OpenRouter API key configured/);
});

test("throws with status and body on a non-ok response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("model not found", { status: 404 })) as typeof fetch;
  try {
    const backend = new OpenRouterBackend({ apiKey: "sk-test" });
    await assert.rejects(() => backend.start(dev, "hi"), /OpenRouter request failed \(404\): model not found/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("resume() is stateless — always issues a fresh completion, ignoring sessionId", async () => {
  let calls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    calls++;
    return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 });
  }) as typeof fetch;
  try {
    const backend = new OpenRouterBackend({ apiKey: "sk-test" });
    const { reply } = await backend.resume("some-session-id", "follow up", dev);
    assert.equal(reply, "ok");
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
