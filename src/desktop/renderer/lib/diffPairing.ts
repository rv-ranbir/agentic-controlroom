import type { DiffLine } from "../types";

export interface SideBySideRow { left: DiffLine | null; right: DiffLine | null }

/**
 * Pairs a flat unified-diff line sequence into old/new columns for a
 * side-by-side view: context lines appear on both sides, and each
 * consecutive del-run/add-run (the common "replaced these lines with
 * those lines" shape) is zipped row by row. Not a full realignment
 * (Myers-style) — good enough for the typical single-hunk-block case a
 * unified diff already gives us.
 */
export function pairDiffLines(lines: DiffLine[]): SideBySideRow[] {
  const rows: SideBySideRow[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.kind === "ctx") {
      rows.push({ left: line, right: line });
      i++;
      continue;
    }
    const dels: DiffLine[] = [];
    while (i < lines.length && lines[i].kind === "del") { dels.push(lines[i]); i++; }
    const adds: DiffLine[] = [];
    while (i < lines.length && lines[i].kind === "add") { adds.push(lines[i]); i++; }
    const max = Math.max(dels.length, adds.length);
    for (let j = 0; j < max; j++) rows.push({ left: dels[j] ?? null, right: adds[j] ?? null });
  }
  return rows;
}
