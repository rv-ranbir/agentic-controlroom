import type { Bucket, Msg } from "../types";

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

export function agentIdOf(m: Msg): string {
  return m.agentId ?? (m.role === "system" ? "system" : m.role.toLowerCase());
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

