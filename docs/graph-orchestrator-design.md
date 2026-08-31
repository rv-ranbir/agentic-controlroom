# Graph-based orchestrator — design scoping

Status: **scoping only, not committed to a build plan.** No code changes from this doc.

## Why

`src/orchestrator/orchestrator.ts` (`runRoom`) is a hardcoded 2-role loop: Dev writes code, QA reviews,
loop up to `maxRounds`, exit on `STATUS: APPROVED` or a "needs input" heuristic. `src/orchestrator/meeting.ts`
(`runMeeting`) generalized this once already — N participants, round-robin, but still linear (fixed order,
fixed round count, no branching, no early exit on content).

Both are useful, but neither supports what a debate/consensus flow (the TradingAgents-style setup discussed
earlier) actually needs: conditional routing ("if 3 analysts disagree, escalate to a manager node"), non-linear
topologies, or a stopping condition that isn't just "N rounds elapsed" or one fixed regex.

## Current architecture, as it actually is (not as diagrammed)

- **`AgentBackend`** (`src/backend/agentBackend.ts`) — `start()`/`resume()` per agent, backend-agnostic (Claude
  CLI / Cursor CLI / OpenRouter). Already the right abstraction level for "run one agent turn" — a graph engine
  reuses this unchanged.
- **`ChatLog`** (`src/chatroom/log.ts`) — `post()` (persisted transcript), `status()`/`agentState()`/`activity()`
  (ephemeral, UI-only). Also reusable unchanged — a graph engine just calls the same methods per node.
- **`isQuestionLike()`** (`src/orchestrator/needsInput.ts`) — the one heuristic both `orchestrator.ts` and
  `sendToAgent()` (`main.ts:1145`) use to decide "this reply is a question, pause here." This is effectively
  today's only *edge condition* — everything else is hardcoded control flow (a JS loop with `if`s), not data.
- **The "needs-input" pause is not a real pause.** When `runRoom` hits a question-like reply, it returns
  `"needs-input"` and the whole call ends — `running.delete(project.id)` fires, the orchestrated run is over.
  A user's reply then goes through `sendToAgent()` (`main.ts:1145`), a *completely separate* code path that
  resumes only that one agent's CLI session and never re-enters `runRoom`'s loop. Today, "pause the graph and
  resume it later" doesn't exist — it's "the graph ends, and the user manually drives one agent by hand."
  **A graph engine that wants real pause/resume has to actually build this — it's new capability, not a port
  of existing behavior.**

## Proposed model

- **Node** = one agent turn (`backend.start`/`resume` against a `RoleConfig`, exactly like today) OR a
  zero-LLM control node (a gate that inspects the transcript/state and picks the next edge — e.g. "did anyone
  say APPROVED", "have all participants replied this round").
- **Edge** = a condition function `(state) => boolean` evaluated against shared state after a node runs.
  `isQuestionLike()` and the `APPROVED` regex become two concrete edge-condition implementations of a general
  `EdgeCondition` type, not special-cased in the engine.
- **Shared state** = one object threaded through the whole run: transcript tail, per-agent session IDs,
  round counters, plus a free-form `data` bag so a custom node (e.g. "market data fetch" from the earlier
  discussion) can stash something for a later node to read.
- **Engine** = walk the graph from a start node, run each node, evaluate its outgoing edges in order, take the
  first matching one, repeat until a terminal node or a max-step guard trips (cycle safety net — graphs can
  loop, unlike today's fixed `for` loop, so something has to prevent an infinite run).

`orchestrator.ts`'s Dev/QA loop and `meeting.ts`'s round-robin both become **example graphs** expressible in
this model — not deleted, reimplemented as graph configs once the engine exists, as the parity proof.

## Open questions (need answers before Phase 1 starts)

1. **Graph definition surface.** A per-project JSON/YAML file the user edits, or a code-first builder API
   (`graph.node(...).edge(...)`) that ships built-in graphs and lets power users add their own file? JSON is
   easier for a future UI editor to read/write; code is easier to keep type-safe. Recommend: start code-first
   (matches how `orchestrator.ts`/`meeting.ts` already work), revisit a serialized format only once a UI needs
   to edit graphs live.
2. **Pause/resume, for real this time.** If a node's edge condition is "needs human input," does the engine
   actually suspend (persist current node + state, resume later) or keep today's behavior (the run ends, a
   human drives one agent by hand via `sendToAgent`)? This is the biggest actual gap versus today, not just an
   API reshape.
3. **UI impact.** `bucketOf()` / the five agent buckets (idle/needs/review/active/seen) are about *one agent's*
   state, not graph topology — they should keep working unchanged as long as the engine still calls
   `log.agentState()` per node the same way `orchestrator.ts` does today. The Room/Chat/Meeting views likely
   don't need to change at all for Phase 1. A later phase (visualizing *which node is active*, not just which
   agent) is a real UI question — and is the natural place this connects to the M11 "office floor" idea already
   noted in `SPEC.md`: rooms-as-nodes, an agent "walking to a room" as a visual for a graph edge firing. Not
   committing to that connection, just flagging it so the two ideas don't get designed twice.
4. **Cross-language call safety already matters here too.** Same rule that showed up in the graphify extraction
   spec applies conceptually: an edge/node shouldn't silently do something undefined for the backend in play
   (e.g. a node type that assumes CLI-only `extraArgs`/MCP passthrough won't work unmodified against the
   OpenRouter HTTP backend, per the gap noted earlier this session).

## Suggested phasing (not started)

- **Phase 1** — build the engine + node/edge types, reimplement `orchestrator.ts`'s Dev/QA loop as a graph
  config, prove identical behavior (same test scenarios `orchestrator.test.ts` already covers). No UI change,
  no new capability yet — pure refactor-with-parity.
- **Phase 2** — reimplement `meeting.ts`'s round-robin as a graph config too, then add one genuinely new
  topology (a debate: N analyst nodes → one manager/consensus node, with a real conditional edge on
  disagreement) to prove the model does something the old linear code couldn't.
- **Phase 3** — real pause/resume for "needs input" nodes (open question #2), a way for a project to define its
  own custom graph beyond the built-ins, and only then reconsider the UI question (#3).

## What this doc is not

Not a commitment to build any of this. Not an M-numbered milestone in `SPEC.md` yet — add one only when
there's agreement to actually start Phase 1.
