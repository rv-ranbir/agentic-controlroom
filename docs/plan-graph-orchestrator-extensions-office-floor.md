# Plan: graph orchestrator (Phase 1) + extension-layer docs + office floor (minimal slice)

## Context

Three things came out of this session's design discussion, all building on M10 (shipped) and M9's existing
orchestration primitives:

1. **Graph orchestrator** — `orchestrator.ts`'s Dev/QA loop is a hardcoded 2-node state machine; a
   TradingAgents-style debate/consensus flow (or any non-linear multi-agent flow) needs conditional branching,
   which the current fixed loop can't express. Fully scoped already in
   `docs/graph-orchestrator-design.md` — this plan executes that doc's **Phase 1** (engine + node/edge types,
   port the existing Dev/QA loop as a graph config, prove parity — no new capability, no UI change).
2. **Extension layer** — the user asked how a future integration (Bitbucket PR review, news/market data, any
   custom script) plugs in without becoming part of `agent-room`'s own codebase. Turns out it already works,
   end to end, with zero code changes: `AgentRef.skillIds` → `appendSkills()` (`main.ts:252`) injects any
   skill's raw markdown into an agent's system prompt (so "call this script" instructions work via the CLI's
   own Bash tool), and `AgentRef.extraArgs` → already has a **"CLI flags" input field in the New Agent Modal**
   (`NewAgentModal.tsx:366`) that passes straight through to the CLI process, covering `--mcp-config` for
   protocol-based tools. This part of the plan is **documentation only** — there is no missing mechanism to
   build, just nothing written down that says so.
3. **Office floor** — logged as an unscoped M11 idea in `SPEC.md`. This plan proposes a realistic **first
   slice**: multiple named, clickable rooms (not the full "characters walking around" vision) built directly on
   M10 phase 4b's existing assets (`RoomScene.tsx`, the four sprite SVGs, `bucketOf()`) rather than a new engine.

## Part A — Graph orchestrator, Phase 1

**New files:**
- `src/orchestrator/graph.ts` — the engine. Exports:
  - `GraphNode` — either an **agent-turn node** (wraps `backend.start`/`resume` against a `RoleConfig`, same
    calls `orchestrator.ts` already makes) or a **gate node** (pure function over shared state, no LLM call —
    e.g. "did the last reply match `APPROVED`").
  - `GraphEdge` — `{ from: string; to: string; condition: (state: GraphState) => boolean }`. `isQuestionLike()`
    (`src/orchestrator/needsInput.ts`, unchanged) and the existing `APPROVED` regex become the first two
    concrete conditions, ported as-is — not reinvented.
  - `GraphState` — `{ transcriptTail: string; sessions: Map<string,string>; round: number; data: Record<string,unknown> }`.
  - `runGraph(startNode, nodes, edges, log, opts)` — walks the graph: run current node, evaluate outgoing edges
    in declaration order, take the first match, repeat. `opts.maxSteps` guards against cycles (graphs can loop;
    today's fixed `for` loop can't, so nothing currently needs this guard — the engine does).
- `src/orchestrator/graphs/devQa.ts` — the Dev/QA loop expressed as a graph config: `dev` node → edge on
  `isQuestionLike` → terminal (needs-input, same as today) OR edge (not question-like) → `qa` node → edge on
  `APPROVED` → terminal (approved) OR edge on `isQuestionLike` → terminal (needs-input) OR edge (otherwise) →
  back to `dev` node, capped at `maxRounds` via `state.round` in a gate condition.

**Reused unchanged:** `AgentBackend` (`start`/`resume`), `ChatLog` (`post`/`status`/`agentState`/`activity`),
`isQuestionLike()`. No changes to `main.ts`'s `runTask()` call site in this phase — it keeps calling something
with the exact same signature as `runRoom` today (either keep `runRoom` as a thin wrapper around
`runGraph(devQaGraph, ...)`, or swap the import; pick whichever keeps `main.ts:1125` a one-line diff).

**Explicitly out of scope for Phase 1** (per `docs/graph-orchestrator-design.md`): real pause/resume for
needs-input nodes, `meeting.ts` port, any new branching topology, any UI change. `bucketOf()` and the five
agent buckets are untouched — they read `agentState()` calls the graph engine makes the same way `orchestrator.ts`
does today.

**Verification:** `src/orchestrator/orchestrator.test.ts` already covers `runRoom`'s scenarios (approve,
needs-input, max-rounds). Port those same scenarios to exercise `runGraph`+`devQa` graph and confirm identical
results — this is the parity proof the phase is scoped around. Run via `npm test`.

## Part B — Extension layer, documentation only

**New file:** `docs/extending-agents.md` — plain explanation (reusing exactly the grounding from this session):
- How to give an agent a custom script/API via a skill: write the script, write a short skill `.md` describing
  when/how to invoke it, add it under the skills directory, assign via `skillIds`.
- How to give an agent an MCP server: drop a project-level `.mcp.json` (auto-discovered by the Claude Code CLI)
  or set `--mcp-config <path>` in that agent's **CLI flags** field (New Agent Modal → Advanced options —
  already exists, `NewAgentModal.tsx:366`).
- The one real gap, stated plainly: `openRouterBackend.ts:7` — `extraArgs` is unused on the OpenRouter HTTP
  backend, so neither skills-as-bash nor MCP passthrough works there today. OpenRouter-backed agents don't get
  this extension mechanism until that backend gets its own tool-calling wiring (separate, unscoped work).

**No code changes.** `SPEC.md` gets one line added under `## 8. Design system` or a new short section pointing
at the doc, so it's discoverable.

## Part C — Office floor, minimal first slice

Builds on M10 phase 4b directly rather than a new engine:

- **New component** `src/desktop/renderer/components/OfficeFloor.tsx` — a new `view` (`"floor"` added to the
  `View` union in `store.ts`) showing 2-3 named clickable zones (e.g. "Chat Room", "Meeting Room", "Task Board" —
  the rooms that already exist as views). Each zone reuses `RoomScene`'s existing background/sprite rendering
  (same `bucketOf()`-driven sprite strip, same assets) rather than new art — clicking a zone calls
  `showView("chat"|"meeting"|"board")`, i.e. it's a new **entry point**, not new state.
- **Explicitly deferred** (per `docs/graph-orchestrator-design.md`'s open question #3 and the original M11
  note in `SPEC.md`): actual character movement/animation, boardrooms as a distinct concept from meeting rooms,
  and any connection to the graph orchestrator's node visualization. This slice only proves the "multiple
  clickable rooms on one floor" navigation shape — nothing about agents visibly moving.
- **CSS:** new `.officeFloor`/`.floorZone` classes in `app.css`, following the same "not theme-reactive, matches
  dark palette 1:1" convention as `.corkboard` and `.roomScene` already do.

**Verification:** same method used for M10 phase 4b — a throwaway Playwright `_electron.launch()` script,
screenshot the floor view, click each zone, confirm it navigates to the right existing view, confirm no console
errors. This project has no plain browser dev server, so this is the only real verification path (documented
in `agentroom_m10_visual_restyle` memory from earlier this session).

## Sequencing

Three independent parts — no ordering dependency between them. Suggest: **B first** (it's a 20-minute doc, zero
risk), then **A** (the real engineering work, self-contained, testable in isolation), then **C** (smallest and
most concrete of the two open-ended ideas, builds on A/B being done only in spirit, not in code).
