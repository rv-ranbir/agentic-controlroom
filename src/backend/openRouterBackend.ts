import type { AgentBackend, OnLine, OnProcess, RoleConfig, StartResult } from "./agentBackend.js";

export interface OpenRouterOptions {
  apiKey?: string;
  model?: string;
  cwd?: string; // unused — HTTP backend, no working directory. Kept for shape parity with the CLI backends.
  extraArgs?: string[]; // unused — HTTP backend, no CLI flags.
  env?: Record<string, string>; // read OPENROUTER_API_KEY from here when apiKey isn't passed directly.
}

const DEFAULT_MODEL = "anthropic/claude-3.5-sonnet";
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Backend for OpenRouter's chat-completions API. Unlike the CLI backends,
 * this is a plain HTTP call with no external session store, so every call
 * is stateless. That's fine: the orchestrator always includes the recent
 * chatroom tail in `prompt` (same tolerance the CLI backends already have
 * for a missing session id), so a stateless fallback still coordinates,
 * just without server-side history.
 */
export class OpenRouterBackend implements AgentBackend {
  private apiKey: string;
  private model: string;

  constructor(opts: OpenRouterOptions = {}) {
    this.apiKey = opts.apiKey ?? opts.env?.OPENROUTER_API_KEY ?? process.env.OPENROUTER_API_KEY ?? "";
    this.model = opts.model || DEFAULT_MODEL;
  }

  private async complete(systemPrompt: string, userPrompt: string, onLine?: OnLine): Promise<string> {
    if (!this.apiKey) {
      throw new Error("No OpenRouter API key configured. Add one as an account credential (OPENROUTER_API_KEY) in the Env panel.");
    }
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "HTTP-Referer": "https://github.com/rv-ranbir/agentic-controlroom",
        "X-Title": "Agentic Control Room",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`OpenRouter request failed (${res.status}): ${body.slice(0, 500)}`);
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const reply = data.choices?.[0]?.message?.content ?? "";
    onLine?.(reply); // non-streaming: fire once with the full reply
    return reply;
  }

  async start(role: RoleConfig, prompt: string, onLine?: OnLine, _onProcess?: OnProcess): Promise<StartResult> {
    const reply = await this.complete(role.systemPrompt, prompt, onLine);
    return { sessionId: "", reply };
  }

  async resume(_sessionId: string, prompt: string, role: RoleConfig, onLine?: OnLine, _onProcess?: OnProcess): Promise<{ reply: string }> {
    const reply = await this.complete(role.systemPrompt, prompt, onLine);
    return { reply };
  }
}
