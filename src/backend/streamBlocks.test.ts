import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyLine, bufferedParse } from "./streamBlocks.js";
import { initialParserState } from "./providerAdapter.js";

function fixture(path: string): string {
  return readFileSync(join(process.cwd(), "test", "fixtures", "streams", path), "utf8");
}

test("classifies a claude dev-turn fixture into the expected block sequence", () => {
  const raw = fixture("claude/2.1.247/dev-turn.jsonl");
  const { blocks } = bufferedParse(raw, initialParserState, classifyLine);

  assert.equal(blocks.length, 5);
  assert.deepEqual(
    blocks.map((b) => b.kind),
    ["system", "prose", "tool", "tool", "result"],
  );
  assert.equal(blocks[1].text, "I'll add a health check endpoint.");
  assert.equal(blocks[2].toolName, "Write");
  assert.match(blocks[2].toolInput ?? "", /server\.js/);
  assert.match(blocks[4].text, /STATUS: READY_FOR_REVIEW/);
  // raw stream is always kept verbatim (SPEC's toggle rule)
  assert.equal(blocks[4].raw, raw.split("\n").filter((line) => line.trim().length > 0).at(-1));
});

test("classifies a claude error-turn fixture", () => {
  const raw = fixture("claude/2.1.247/error-turn.jsonl");
  const { blocks } = bufferedParse(raw, initialParserState, classifyLine);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[1].kind, "error");
  assert.match(blocks[1].text, /Permission denied/);
});

test("classifies a cursor-agent qa-turn fixture (same envelope, different provider)", () => {
  const raw = fixture("cursor/2026.08.11-e8db854/qa-turn.jsonl");
  const { blocks } = bufferedParse(raw, initialParserState, classifyLine);
  assert.equal(blocks.length, 4);
  assert.deepEqual(
    blocks.map((b) => b.kind),
    ["system", "prose", "tool", "result"],
  );
  assert.equal(blocks[2].toolName, "Read");
  assert.match(blocks[3].text, /STATUS: APPROVED/);
});

test("incremental parsing across a chunk split mid-line matches batch parsing", () => {
  const raw = fixture("claude/2.1.247/dev-turn.jsonl");
  const batch = bufferedParse(raw, initialParserState, classifyLine).blocks;

  // split partway through the tool_use line (third line) — the split point
  // lands mid-JSON, exactly the case SPEC calls out ("chunks split mid-
  // escape-sequence") that a real PTY/pipe read can produce.
  const lines = raw.split("\n");
  const splitLineIndex = 2;
  const splitLine = lines[splitLineIndex];
  const midpoint = Math.floor(splitLine.length / 2);
  const before = [...lines.slice(0, splitLineIndex), splitLine.slice(0, midpoint)].join("\n");
  const after = splitLine.slice(midpoint) + "\n" + lines.slice(splitLineIndex + 1).join("\n");

  let state = initialParserState;
  const first = bufferedParse(before, state, classifyLine);
  state = first.state;
  assert.equal(state.pending.length > 0, true, "partial line must be buffered, not dropped or mis-parsed");
  const second = bufferedParse(after, state, classifyLine);

  const incremental = [...first.blocks, ...second.blocks];
  assert.deepEqual(incremental, batch);
});

