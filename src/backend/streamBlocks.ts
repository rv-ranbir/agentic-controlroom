import type { AgentBlock, ParserState } from "./providerAdapter.js";

// Both claude and cursor-agent's stream-json output share the same
// Anthropic-shaped envelope (type: assistant/message/tool_*/result/error/
// system), which is why one classifier serves both adapters — this isn't a
// shortcut, it reflects the actual wire format. Each adapter still owns its
// own detect()/spawnArgs(), which genuinely do differ per provider.
export function classifyLine(line: string): AgentBlock {
  try {
    const obj: unknown = JSON.parse(line);
    if (typeof obj !== "object" || obj === null) return { kind: "raw", text: line.slice(0, 300), raw: line };
    const o = obj as Record<string, unknown>;
    const type = String(o.type ?? "event");

    if (type.startsWith("item.")) {
      const item = o.item as Record<string, unknown> | undefined;
      if (item?.type === "agent_message") return {kind:"prose",text:String(item.text ?? "").slice(0,400),raw:line};
      if (item?.type === "command_execution" || item?.type === "mcp_tool_call") return {kind:"tool",text:String(item.command ?? item.tool ?? "Tool").slice(0,300),toolName:String(item.tool ?? item.type),raw:line};
    }
    if (type === "turn.failed") return {kind:"error",text:String((o.error as {message?:string})?.message ?? "Codex turn failed").slice(0,300),raw:line};
    if (type === "thread.started" || type === "turn.started" || type === "turn.completed") return {kind:"system",text:type,raw:line};

    if (type === "assistant" || type === "message") {
      const message = o.message as { content?: unknown; text?: unknown } | undefined;
      const content = message?.content;
      const text = Array.isArray(content)
        ? content.map((c) => (c as { text?: string }).text ?? "").join("")
        : (message?.text ?? o.text ?? "");
      if (text) return { kind: "prose", text: String(text).slice(0, 400), raw: line };
    }

    if (type.includes("tool")) {
      const toolCall = o.tool_call as { name?: string; arguments?: unknown } | undefined;
      const name = toolCall?.name ?? o.tool_name ?? o.name ?? o.subtype ?? "tool";
      const input = toolCall?.arguments ?? o.input ?? o.args;
      return {
        kind: "tool",
        text: `${String(name)}(${input ? JSON.stringify(input).slice(0, 200) : ""})`,
        toolName: String(name),
        toolInput: input ? JSON.stringify(input) : undefined,
        raw: line,
      };
    }

    if (type === "result") return { kind: "result", text: String(o.result ?? "").slice(0, 200), raw: line };
    if (type === "error") return { kind: "error", text: String(o.error ?? line).slice(0, 300), raw: line };
    if (type === "system") return { kind: "system", text: String(o.subtype ?? "init"), raw: line };
    return { kind: "raw", text: line.slice(0, 200), raw: line };
  } catch {
    return { kind: "raw", text: line.slice(0, 300), raw: line };
  }
}

/**
 * Incremental line-buffering wrapper shared by all adapters: a chunk may end
 * mid-line (or mid-JSON-escape-sequence within a line), so only complete
 * lines are classified — the remainder is carried in ParserState.pending
 * for the next call.
 */
export function bufferedParse(
  chunk: string,
  state: ParserState,
  classify: (line: string) => AgentBlock,
): { blocks: AgentBlock[]; state: ParserState } {
  const combined = state.pending + chunk;
  const lines = combined.split("\n");
  const pending = lines.pop() ?? "";
  const blocks = lines.filter((l) => l.trim()).map(classify);
  return { blocks, state: { pending } };
}
