# ADR-002: Two-tier provider stream parsing

Status: proposed (awaiting approval) · Date: 2026-08-26

## Context

SPEC §4: render each provider's output as structured blocks, incrementally, surviving chunks split mid-escape-sequence, degrading to raw terminal on parser failure. CLI Doctor (docs/m0-cli-doctor.md) found that the three priority providers (claude, cursor-agent, codex) all expose documented headless JSON-lines modes — and that cursor-agent silently self-updated during a two-day window, confirming version drift is routine.

## Decision

### Tier A — machine-readable first (claude, cursor-agent, codex; likely gemini, opencode)

When the agent session is a *managed run* (app-driven prompt), spawn the CLI in its headless stream mode (`--output-format stream-json` / `codex exec --json`). Parsing is then newline-delimited JSON:

- `parse(chunk, state)` appends to `state.partialLine`, splits on `\n`, `JSON.parse`s complete lines, maps provider event shapes to the `AgentBlock` union (`thinking`, `tool_call{name,target,result}`, `text`, `diff`, `usage`, `done`, `error`).
- Unknown event types map to `AgentBlock{kind:'raw'}` — never dropped.
- No ANSI involved. This removes the highest-risk parsing entirely for the providers that matter most.

### Tier B — PTY + incremental ANSI parse (aider; any provider's interactive TUI pane)

When the user opens a live interactive session (the terminal-pane experience), the CLI runs in a real PTY and emits ANSI/TUI. Strategy:

- Feed raw bytes to xterm.js for display (xterm is the ANSI interpreter — we do not re-implement escape handling for rendering).
- A parallel lightweight scanner produces *coarse* blocks only: prompt-detection (agent waiting on input), activity/idle transitions, and provider-specific landmark regexes (e.g. tool headers). `ParserState` carries a partial-escape buffer: bytes after the last complete line/CSI sequence roll into the next chunk.
- We do NOT attempt full semantic reconstruction from ANSI. Structured fidelity is Tier A's job; Tier B's job is state inference + display.

### Invariants (both tiers)

1. Raw stream retained verbatim per agent: ring buffer in memory (10k lines) spilling to an append-only file (ADR-003). UI toggle parsed ⇄ raw always available.
2. Parser throw = degrade that pane to raw + soft banner; never a blank pane.
3. CLI version recorded at spawn. Each adapter declares a tested version range; outside it → soft banner, still runs.
4. Fixtures: recorded real streams in `test/fixtures/streams/<provider>/<version>/`, snapshot-tested block output per chunk-split permutation (re-chunk fixtures at 1, 7, 4096 bytes to prove mid-sequence resumability).
5. Backpressure: PTY `pause()`/`resume()` driven by renderer ack; drop-to-disk before drop-on-floor.

## Consequences

- The `ProviderAdapter` interface from SPEC §4 stands, with one addition: `mode: 'stream-json' | 'pty'` chosen per session kind — same adapter serves both.
- Managed runs get high-fidelity blocks now; interactive panes get honest terminal + coarse state. Full ANSI semantic parsing deliberately not attempted (cost/fragility vs. Tier A availability).
- New provider = new adapter + fixtures; no core changes.
