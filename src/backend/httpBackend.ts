import type { AgentBackend, OnLine, RoleConfig } from './agentBackend.js';
export type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'openrouter' | 'ollama';
export interface ModelConfig { provider:ProviderId; model:string; keyEnv:string; maxTokens:number; timeoutMs:number }

const ENDPOINTS: Record<ProviderId, string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models/',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  ollama: 'http://localhost:11434/api/chat',
};
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_OUTPUT_CHARACTERS = 65536;
const MAX_INPUT_CHARACTERS = 60000;
export function validCredentialBinding(config:ModelConfig):boolean {
  return config.provider==='ollama'||new RegExp(`^${config.provider.toUpperCase()}_API_KEY(?:_[A-Z0-9]+)*$`).test(config.keyEnv);
}

interface Usage { inputTokens: number | null; outputTokens: number | null; costUsd: null }
interface Completion { reply: string; usage: Usage }

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
function first(value: unknown): Record<string, unknown> {
  return object(Array.isArray(value) ? value[0] : undefined);
}
function extractUsage(provider: ProviderId, value: unknown): Usage {
  const data = object(value);
  const usage = object(data.usage);
  const gemini = object(data.usageMetadata);
  const count = (value: unknown): number | null =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
  const [input, output] = provider === 'ollama' ? [data.prompt_eval_count, data.eval_count]
    : provider === 'gemini' ? [gemini.promptTokenCount, gemini.candidatesTokenCount]
    : provider === 'anthropic' ? [usage.input_tokens, usage.output_tokens]
    : [usage.prompt_tokens, usage.completion_tokens];
  return { inputTokens: count(input), outputTokens: count(output), costUsd: null };
}
function extractText(provider: ProviderId, value: unknown): string {
  const data = object(value);
  if (data.error) throw new Error();
  let text: unknown;
  if (provider === 'anthropic') {
    text = Array.isArray(data.content) ? data.content.map(object)
      .filter(part => part.type === 'text' && typeof part.text === 'string').map(part => part.text).join('') : undefined;
  } else if (provider === 'gemini') {
    const parts = object(first(data.candidates).content).parts;
    text = Array.isArray(parts) ? parts.map(object)
      .filter(part => part.thought !== true && typeof part.text === 'string').map(part => part.text).join('') : undefined;
  } else {
    text = object(provider === 'ollama' ? data.message : first(data.choices).message).content;
  }
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_OUTPUT_CHARACTERS) throw new Error();
  return text.trim();
}

/** Text-only, stateless HTTP backend: callers supply conversation context in each prompt.
 * Limits: 8192 generated tokens, 120s including body reads, 1 MiB JSON, 64 Ki characters.
 * Combined system and user input is limited to 60000 UTF-16 code units.
 * No environment fallback, model fallback, redirects, tool execution, or raw error exposure.
 */
export function createHttpBackend(
  config: ModelConfig,
  env: Record<string, string | undefined>,
  fetcher: typeof fetch = fetch,
): AgentBackend {
  if (!config || !Object.hasOwn(ENDPOINTS, config.provider) ||
      typeof config.model !== 'string' || !config.model.trim() || config.model.length > 512 ||
      /[\x00-\x1f\x7f]/.test(config.model) ||
      !Number.isSafeInteger(config.maxTokens) || config.maxTokens <= 0 ||
      !Number.isSafeInteger(config.timeoutMs) || config.timeoutMs <= 0) {
    throw new Error('Invalid HTTP provider configuration.');
  }
  const { provider, model } = config;
  if(!validCredentialBinding(config))throw new Error('Credential name must belong to the selected provider (for example OPENAI_API_KEY or OPENAI_API_KEY_RESEARCH).');
  const maxTokens = Math.min(config.maxTokens, 8192);
  const timeoutMs = Math.min(config.timeoutMs, 120000);
  const key = provider === 'ollama' ? undefined :
    typeof config.keyEnv === 'string' && Object.hasOwn(env, config.keyEnv) ? env[config.keyEnv] : undefined;
  if (provider !== 'ollama' && (typeof key !== 'string' || !key.trim() || /[\r\n]/.test(key))) {
    throw new Error('Missing or invalid HTTP provider credential.');
  }
  const endpoint = provider === 'gemini' ? `${ENDPOINTS.gemini}${encodeURIComponent(model)}:generateContent` : ENDPOINTS[provider];

  async function complete(role: RoleConfig, prompt: string, onLine?: OnLine): Promise<Completion> {
    if (role.systemPrompt.length + prompt.length > MAX_INPUT_CHARACTERS) {
      throw new Error('HTTP provider input exceeds 60000 characters.');
    }
    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let timedOut = false;
    let httpStatus: number | undefined;
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        void reader?.cancel().catch(() => {});
        reject(new Error());
      }, timeoutMs);
    });
    async function request(): Promise<Completion> {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const messages = [{ role: 'system', content: role.systemPrompt }, { role: 'user', content: prompt }];
      let body: Record<string, unknown>;
      if (provider === 'anthropic') {
        headers['x-api-key'] = key!;
        headers['anthropic-version'] = '2023-06-01';
        body = { model, system: role.systemPrompt, messages: messages.slice(1), max_tokens: maxTokens, stream: false };
      } else if (provider === 'gemini') {
        headers['x-goog-api-key'] = key!;
        body = { systemInstruction: { parts: [{ text: role.systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: maxTokens, candidateCount: 1 } };
      } else if (provider === 'ollama') {
        body = { model, messages, stream: false, options: { num_predict: maxTokens } };
      } else {
        headers.Authorization = `Bearer ${key}`;
        body = { model, messages, stream: false,
          [provider === 'openai' ? 'max_completion_tokens' : 'max_tokens']: maxTokens };
      }
      const response = await fetcher(endpoint, { method: 'POST', headers, body: JSON.stringify(body),
        redirect: 'error', signal: controller.signal });
      if (!response.ok && Number.isInteger(response.status) && response.status >= 100 && response.status <= 599) {
        httpStatus = response.status;
      }
      if (controller.signal.aborted || !response.ok || !response.body ||
          Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) {
        void response.body?.cancel().catch(() => {});
        throw new Error();
      }
      reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8', { fatal: true });
      let bytes = 0;
      let json = '';
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > MAX_RESPONSE_BYTES) throw new Error();
        json += decoder.decode(chunk.value, { stream: true });
      }
      json += decoder.decode();
      const data: unknown = JSON.parse(json);
      return { reply: extractText(provider, data), usage: extractUsage(provider, data) };
    }
    let result: Completion;
    try {
      result = await Promise.race([request(), timeout]);
    } catch {
      controller.abort();
      void reader?.cancel().catch(() => {});
      throw new Error(timedOut ? 'HTTP provider timeout.' : httpStatus !== undefined
        ? `HTTP provider HTTP ${httpStatus}.` : 'HTTP provider request or response failed.');
    } finally {
      clearTimeout(timer!);
    }
    onLine?.(result.reply);
    return result;
  }
  return {
    async start(role, prompt, onLine) {
      const result = { sessionId: '', ...await complete(role, prompt, onLine) };
      return result;
    },
    async resume(_sessionId, prompt, role, onLine) { return { reply: (await complete(role, prompt, onLine)).reply }; },
  };
}
