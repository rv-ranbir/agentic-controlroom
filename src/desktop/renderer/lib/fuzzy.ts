/** Subsequence fuzzy match (fzf/VSCode-quick-open style): query chars must
 * appear in order in text, not necessarily contiguous. Case-insensitive. */
export function fuzzyMatch(query: string, text: string): boolean {
  if (!query.trim()) return true;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}
