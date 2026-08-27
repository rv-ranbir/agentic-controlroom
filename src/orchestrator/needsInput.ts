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
