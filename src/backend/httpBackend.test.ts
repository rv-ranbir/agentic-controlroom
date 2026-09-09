import test from 'node:test';
import assert from 'node:assert/strict';
import { createHttpBackend } from './httpBackend.js';
import type { ModelConfig, ProviderId } from './httpBackend.js';

const role = { id: 'news', name: 'News', systemPrompt: 'Use supplied evidence.' };
const config = (provider: ProviderId = 'openai', changes: Partial<ModelConfig> = {}): ModelConfig =>
  ({ provider, model: 'explicit-model', keyEnv: `${provider.toUpperCase()}_API_KEY`, maxTokens: 128, timeoutMs: 1000, ...changes });
const env = { TEST_KEY: 'secret-test-key', OPENAI_API_KEY:'secret-test-key', ANTHROPIC_API_KEY:'secret-test-key', GEMINI_API_KEY:'secret-test-key', OPENROUTER_API_KEY:'secret-test-key', OPENAI_BASE_URL: 'https://evil.invalid', OLLAMA_HOST: 'https://evil.invalid' };
const chat = (content: unknown) => ({ choices: [{ message: { role: 'assistant', content } }] });
const fixtures: [ProviderId, string, unknown][] = [
  ['openai', 'https://api.openai.com/v1/chat/completions', chat(' answer ')],
  ['openrouter', 'https://openrouter.ai/api/v1/chat/completions', chat(' answer ')],
  ['anthropic', 'https://api.anthropic.com/v1/messages', { content: [{ type: 'thinking', thinking: 'private' }, { type: 'text', text: ' answer ' }] }],
  ['gemini', 'https://generativelanguage.googleapis.com/v1beta/models/explicit-model:generateContent', { candidates: [{ content: { parts: [{ thought: true, text: 'private' }, { text: ' answer ' }] } }] }],
  ['ollama', 'http://localhost:11434/api/chat', { message: { role: 'assistant', content: ' answer ' }, done: true }],
];

for (const [provider, endpoint, response] of fixtures) {
  test(`${provider}: fixed endpoint, explicit model, auth, token cap and text-only payload`, async () => {
    let request!: RequestInit;
    let url = '';
    const fetcher: typeof fetch = async (input, init) => { url = String(input); request = init!; return Response.json(response); };
    const backend = createHttpBackend(config(provider), env, fetcher);
    const lines: string[] = [];
    assert.deepEqual(await backend.start(role, 'Analyze.', line => lines.push(line)), { sessionId: '', reply: 'answer', usage: { inputTokens: null, outputTokens: null, costUsd: null } });
    assert.deepEqual(lines, ['answer']);
    assert.equal(url, endpoint);
    assert.equal(request.method, 'POST');
    assert.equal(request.redirect, 'error');
    assert.ok(request.signal instanceof AbortSignal);
    const headers = new Headers(request.headers);
    assert.equal(headers.get('content-type'), 'application/json');
    const body = JSON.parse(request.body as string);
    assert.equal(body.tools, undefined);
    assert.equal(body.functions, undefined);
    assert.ok(!JSON.stringify(body).includes(env.TEST_KEY));
    if (provider === 'gemini') {
      assert.equal(headers.get('x-goog-api-key'), env.TEST_KEY);
      assert.deepEqual(body, { systemInstruction: { parts: [{ text: role.systemPrompt }] }, contents: [{ role: 'user', parts: [{ text: 'Analyze.' }] }], generationConfig: { maxOutputTokens: 128, candidateCount: 1 } });
    } else {
      assert.equal(body.model, 'explicit-model');
      assert.equal(body.stream, false);
      if (provider === 'anthropic') {
        assert.equal(headers.get('x-api-key'), env.TEST_KEY);
        assert.equal(headers.get('anthropic-version'), '2023-06-01');
        assert.equal(body.system, role.systemPrompt);
        assert.deepEqual(body.messages, [{ role: 'user', content: 'Analyze.' }]);
        assert.equal(body.max_tokens, 128);
      } else {
        assert.deepEqual(body.messages, [{ role: 'system', content: role.systemPrompt }, { role: 'user', content: 'Analyze.' }]);
        assert.equal(headers.get('authorization'), provider === 'ollama' ? null : `Bearer ${env.TEST_KEY}`);
        assert.equal(provider === 'ollama' ? body.options.num_predict : provider === 'openai' ? body.max_completion_tokens : body.max_tokens, 128);
      }
    }
    assert.deepEqual(await backend.resume('ignored', 'Follow up.', role), { reply: 'answer' });
  });
}

test('invalid configuration fails before any network request', () => {
  for (const changes of [{ model: '' }, { model: '  ' }, { provider: 'invalid' }, { maxTokens: 0 }, { maxTokens: NaN }, { maxTokens: Infinity }, { maxTokens: 1.5 }, { timeoutMs: 0 }, { timeoutMs: NaN }, { timeoutMs: Infinity }, { timeoutMs: 1.5 }]) {
    assert.throws(() => createHttpBackend(config('openai', changes as Partial<ModelConfig>), env), /configuration/i);
  }
  assert.throws(() => createHttpBackend(config(), {}), /credential/i);
  assert.throws(() => createHttpBackend(config(), { TEST_KEY: ' \n' }), /credential/i);
  assert.doesNotThrow(() => createHttpBackend(config('ollama'), {}));
});
test('provider cannot select a brokerage or another provider credential',()=>{
  assert.throws(()=>createHttpBackend(config('openrouter',{keyEnv:'UPSTOX_ACCESS_TOKEN'}),{UPSTOX_ACCESS_TOKEN:'broker-secret'}),/credential/i);
  assert.throws(()=>createHttpBackend(config('openai',{keyEnv:'ANTHROPIC_API_KEY'}),env),/credential/i);
});

test('caps oversized token budgets for every provider', async () => {
  for (const [provider, , response] of fixtures) {
    let body: any;
    await createHttpBackend(config(provider, { maxTokens: 1e9 }), env, async (_, init) => {
      body = JSON.parse(init!.body as string); return Response.json(response);
    }).start(role, 'Analyze.');
    assert.equal(provider === 'gemini' ? body.generationConfig.maxOutputTokens : provider === 'ollama' ? body.options.num_predict : provider === 'openai' ? body.max_completion_tokens : body.max_tokens, 8192);
  }
});

test('sanitizes HTTP, parsing and transport errors without emitting output', async () => {
  for (const fetcher of [
    async () => new Response('secret-test-key private body', { status: 401 }),
    async () => new Response('secret-test-key invalid json'),
    async () => { throw new Error('secret-test-key transport details'); },
    async () => Response.json({ error: { message: 'secret-test-key' } }),
  ]) {
    const lines: string[] = [];
    await assert.rejects(createHttpBackend(config(), env, fetcher).start(role, 'Analyze.', x => lines.push(x)), error => {
      assert.ok(error instanceof Error);
      assert.doesNotMatch(String(error), /secret-test-key|private body|transport details|invalid json/);
      assert.equal(error.cause, undefined);
      return true;
    });
    assert.deepEqual(lines, []);
  }
});

test('rejects missing, blank, non-text and excessive output', async () => {
  for (const content of [undefined, null, ' \n ', 42, {}, 'x'.repeat(65537)]) {
    await assert.rejects(createHttpBackend(config(), env, async () => Response.json(chat(content))).start(role, 'Analyze.'));
  }
});

test('rejects oversized streamed bytes without trusting content-length and cancels body', async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) { controller.enqueue(new Uint8Array(300000)); },
    cancel() { cancelled = true; },
  });
  await assert.rejects(createHttpBackend(config(), env, async () => new Response(body, { headers: { 'content-length': '1' } })).start(role, 'Analyze.'), /response/i);
  assert.equal(cancelled, true);
});

test('aborts stalled fetch and stalled response body', async () => {
  for (const stage of ['fetch', 'body']) {
    let signal!: AbortSignal;
    const fetcher: typeof fetch = async (_, init) => {
      signal = init!.signal!;
      if (stage === 'fetch') return new Promise<Response>(() => {});
      return new Response(new ReadableStream({ pull() { return new Promise(() => {}); } }));
    };
    await assert.rejects(createHttpBackend(config('openai', { timeoutMs: 10 }), env, fetcher).start(role, 'Analyze.'), /timeout/i);
    assert.equal(signal.aborted, true);
  }
});

test('Gemini model stays in a single URL path component', async () => {
  let url = '';
  await createHttpBackend(config('gemini', { model: 'model/../../evil?key=x#y' }), env, async input => {
    url = String(input); return Response.json({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] });
  }).start(role, 'Analyze.');
  assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/model%2F..%2F..%2Fevil%3Fkey%3Dx%23y:generateContent');
});

test('oversized timeout is capped at two minutes', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal!: AbortSignal;
  const backend = createHttpBackend(config('openai', { timeoutMs: 1e9 }), env, async (_, init) => {
    signal = init!.signal!;
    return new Promise<Response>(() => {});
  });
  const result = backend.start(role, 'Analyze.');
  const rejected = assert.rejects(result, /timeout/i);
  t.mock.timers.tick(119999);
  assert.equal(signal.aborted, false);
  t.mock.timers.tick(1);
  await rejected;
  assert.equal(signal.aborted, true);
});

test('rejects reasoning-only responses from Anthropic and Gemini', async () => {
  for (const [provider, response] of [
    ['anthropic', { content: [{ type: 'thinking', text: 'private' }] }],
    ['gemini', { candidates: [{ content: { parts: [{ thought: true, text: 'private' }] } }] }],
  ] as const) {
    await assert.rejects(createHttpBackend(config(provider), env, async () => Response.json(response)).start(role, 'Analyze.'));
  }
});

test('UTF-8 text survives a response chunk boundary', async () => {
  const bytes = new TextEncoder().encode(JSON.stringify(chat('₹')));
  const split = bytes.indexOf(0xe2) + 1;
  const stream = new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(bytes.slice(0, split));
    controller.enqueue(bytes.slice(split));
    controller.close();
  } });
  assert.equal((await createHttpBackend(config(), env, async () => new Response(stream)).start(role, 'Analyze.')).reply, '₹');
});

test('start exposes provider usage counts with unknown counts and cost as null', async () => {
  const fields = {
    openai: ['usage', 'prompt_tokens', 'completion_tokens'],
    openrouter: ['usage', 'prompt_tokens', 'completion_tokens'],
    anthropic: ['usage', 'input_tokens', 'output_tokens'],
    gemini: ['usageMetadata', 'promptTokenCount', 'candidatesTokenCount'],
    ollama: ['', 'prompt_eval_count', 'eval_count'],
  };
  for (const [provider, , response] of fixtures) {
    const [container, input, output] = fields[provider];
    for (const [inputValue, outputValue, expectedInput, expectedOutput] of [
      [123, 45, 123, 45], [0, 0, 0, 0], [undefined, 8, null, 8],
      [9, undefined, 9, null], [-1, '12', null, null], [1.5, null, null, null],
    ]) {
      const counts = { [input]: inputValue, [output]: outputValue, cost: 99 };
      const payload = { ...(response as object), ...(container ? { [container]: counts } : counts) };
      const result = await createHttpBackend(config(provider), env, async () => Response.json(payload)).start(role, 'Analyze.');
      assert.deepEqual((result as typeof result & { usage?: unknown }).usage,
        { inputTokens: expectedInput, outputTokens: expectedOutput, costUsd: null }, provider);
    }
  }
});

test('HTTP errors expose only the status and cancel unread error bodies', async () => {
  for (const status of [401, 403, 429, 500]) {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode('secret-test-key private details')); },
      cancel() { cancelled = true; },
    });
    await assert.rejects(createHttpBackend(config(), env, async () => new Response(stream, { status, statusText: 'secret-test-key' })).start(role, 'Analyze.'),
      { message: `HTTP provider HTTP ${status}.` });
    assert.equal(cancelled, true);
  }
});

test('combined input cap applies before network access to start and resume', async () => {
  for (const [provider, , response] of fixtures) {
    let calls = 0;
    const backend = createHttpBackend(config(provider), env, async () => { calls++; return Response.json(response); });
    const longRole = { ...role, systemPrompt: 's'.repeat(30000) };
    assert.equal((await backend.start(longRole, 'p'.repeat(30000))).reply, 'answer');
    assert.equal(calls, 1);
    await assert.rejects(backend.start(longRole, 'p'.repeat(30001)), /input.*60000/i);
    await assert.rejects(backend.resume('', 'p'.repeat(30001), longRole), /input.*60000/i);
    await assert.rejects(backend.start({ ...role, systemPrompt: 's'.repeat(60001) }, ''), /input.*60000/i);
    assert.equal(calls, 1);
  }
});
