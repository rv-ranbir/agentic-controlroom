// SPEC.md §4's ProviderAdapter interface. One deliberate deviation from the
// literal spec: parse() takes a string chunk, not a Buffer. Every raw chunk
// in this codebase is already decoded to a string by the time it reaches
// adapter code (child.stdout 'data' handlers), so a Buffer parameter would
// just mean immediately calling .toString() — no real value, one extra step.

export type AgentBlockKind = "prose" | "tool" | "result" | "error" | "system" | "raw";

export interface AgentBlock {
  kind: AgentBlockKind;
  /** Human-readable summary/body for this block. */
  text: string;
  /** Present only for kind "tool" — the tool/function name being called. */
  toolName?: string;
  /** Present only for kind "tool" — JSON-stringified call arguments, if any. */
  toolInput?: string;
  /** The original raw line, always kept verbatim (SPEC's raw-stream-toggle rule). */
  raw: string;
}

export interface ParserState {
  /** Partial line buffered across chunk boundaries (a chunk may split mid-line). */
  pending: string;
}

export const initialParserState: ParserState = { pending: "" };

export interface SpawnContext {
  cwd: string;
  model?: string;
  extraArgs?: string[];
  /** When set, resume this prior session instead of starting fresh. */
  resumeSessionId?: string;
  /** Whether to request the provider's streaming (vs single-shot JSON) output mode. */
  streaming: boolean;
}

export interface DetectResult {
  available: boolean;
  version?: string;
  authed?: boolean;
}

export interface ProviderAdapter {
  id: "claude" | "cursor";
  /** Probe PATH/version/login state — the "CLI Doctor" check for this provider. */
  detect(): Promise<DetectResult>;
  /** Pure: compute the spawn command for a given context. No process is started. */
  spawnArgs(ctx: SpawnContext): { bin: string; args: string[]; env: Record<string, string> };
  /** Incremental: chunk may end mid-line or mid-JSON — buffer via ParserState. */
  parse(chunk: string, state: ParserState): { blocks: AgentBlock[]; state: ParserState };
}
