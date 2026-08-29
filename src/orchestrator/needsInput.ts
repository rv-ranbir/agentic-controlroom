// Needs-input heuristic (SPEC's M2 state inference — a heuristic with
// acknowledged limits, not real intent detection). Conservative on purpose:
// a false "needs input" is annoying, a false "done" just looks like a normal
// miss, so this only triggers on a clear question anchored to the final line.
export function isQuestionLike(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const lastLine = trimmed.split("\n").filter((l) => l.trim()).pop() ?? trimmed;
  if (/\?\s*$/.test(lastLine)) return true;
  return /^(should i|do you want|which |what |could you|can you|would you like|shall i)\b/i.test(lastLine.trim());
}

// Same spirit as isQuestionLike — a heuristic guess, not certain detection. Pulls an
// enumerated option list off the tail of a question ("...A, B, or C?") so the UI can
// offer one-click choice pills alongside the always-available free-text reply. Returns
// null when nothing that looks like a short enumerated list is found.
export function extractChoices(text: string): string[] | null {
  const trimmed = text.trim();
  const lastLine = trimmed.split("\n").filter((l) => l.trim()).pop() ?? trimmed;
  const qMatch = /^(.*)\?\s*$/s.exec(lastLine.trim());
  if (!qMatch) return null;
  const listMatch = /([A-Za-z0-9][\w '/-]{0,30}(?:,\s*[A-Za-z0-9][\w '/-]{0,30}){0,3},?\s+or\s+[A-Za-z0-9][\w '/-]{0,30})\s*$/i.exec(qMatch[1]);
  if (!listMatch) return null;
  const parts = listMatch[1].split(/\s*,\s*|\s+or\s+/i).map((s) => s.trim().replace(/^or\s+/i, "")).filter(Boolean);
  if (parts.length < 2 || parts.length > 5) return null;
  if (parts.some((p) => p.length === 0 || p.length > 30)) return null;
  return parts;
}
