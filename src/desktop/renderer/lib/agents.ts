import type { Bucket, Msg } from "../types";
import { isQuestionLike } from "../../../orchestrator/needsInput";

const IDENT = ["--i0", "--i1", "--i2", "--i3", "--i4", "--i5", "--i6", "--i7"];

export function colorFor(agentId: string): string {
  if (agentId === "user") return "var(--signal)";
  if (agentId === "system" || agentId === "orchestrator") return "var(--ink-50)";
  let h = 0;
  for (const ch of agentId) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return `var(${IDENT[Math.abs(h) % IDENT.length]})`;
}

export function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
}

// M8 context canary: rough proxy for "this agent's context is getting big"
// — total transcript chars is cheap to track and doesn't need the actual
// tokenizer the CLI uses, just an early warning before it truncates on us.
export const CONTEXT_WARN_CHARS = 60_000;

export function transcriptSize(messages: Msg[], agentId: string): number {
  return messages.reduce((sum, m) => sum + (agentIdOf(m) === agentId ? m.message.length : 0), 0);
}

export function agentIdOf(m: Msg): string {
  return m.agentId ?? (m.role === "system" ? "system" : m.role.toLowerCase());
}

// Restores each agent's "inbox" after a restart (SPEC: killing the process must not
// lose the agent's inbox) — agentState itself is runtime-only, so re-derive last known
// state from the persisted transcript's last reply, same heuristic the live backend uses.
export function deriveAgentStates(messages: Msg[], agentIds: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of agentIds) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (agentIdOf(m) !== id) continue;
      out[id] = isQuestionLike(m.message) ? "needs" : "done";
      break;
    }
  }
  return out;
}

export function bucketOf(
  agentId: string,
  s: { agentStates: Record<string, string>; localSeen: Record<string, true>; localForceActive: Record<string, true> },
): Bucket {
  const raw = s.agentStates[agentId] ?? "idle";
  if (raw === "working") return "active";
  if (s.localForceActive[agentId]) return "active";
  // "needs" is a real backend-sent state now (see isQuestionLike() in main.ts) — a
  // heuristic guess, not certain detection, so treat it as advisory, not final.
  if (raw === "needs") return "needs";
  if (raw === "done") return s.localSeen[agentId] ? "seen" : "review";
  return "idle";
}

export function elapsedLabel(since: number | undefined): string {
  if (!since) return "";
  const s = Math.round((Date.now() - since) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 3600)}h`;
}

