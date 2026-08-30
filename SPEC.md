# Project Brief: "Agentic Control Room" — a multi-agent cockpit for CLI coding agents

> Canonical brief, pasted 2026-08-26. Milestone gate: M0 must be approved before code.

## 0. Role

Architect + implementer for a desktop app that runs many AI coding-agent CLI sessions in parallel across many local projects, in one visual window. Reference product: https://agentsroom.dev — independent implementation of the category, not a copy of code, assets, or branding.

Do not write code until Milestone 0 is complete and the ADRs are approved.

## 1. Non-negotiable: subscription reuse (BYOK / BYOS)

Never proxy model calls through our own backend; never ask for an API key we bill against.

Mechanism: spawn the vendor's own CLI as a child process, in a PTY, in the user's project directory, with the user's environment inherited. The CLI authenticates itself as it does in the user's terminal:

- Claude Max/Pro logged in via `claude` (Claude Code CLI) is reused as-is; we never read, copy, or transmit credentials.
- Same for `codex` (OpenAI), `cursor-agent` (Cursor), `gemini`/Antigravity, `aider`, `opencode`, `ollama`.
- Raw-API mode: user supplies their own key in an env var passed through to the child. We still never see traffic.

Explicit boundary: no extracting session tokens from app storage, no replaying internal HTTP endpoints, no wrapping undocumented APIs. Provider without a supported CLI/headless mode = unsupported. Record each provider's official entry point in the ADR before implementing its adapter.

Detection, not configuration: first-launch "CLI Doctor" probes PATH per binary, captures `--version`, reports availability, login state (each CLI's cheap check), and install command for what's missing. User never types a path.

## 2. Core mental model

- **Project** — real folder on disk: path, display name, optional zone (Work/Personal/Side), derived stats. Can be open in more than one room at once.
- **Agent** — labelled persistent session: role + system prompt + provider + model + permission mode + its own PTY. Identity outlives the process; killing the process must not lose the agent, its history, or its inbox.
- **Room** — live view over agents grouped by state, triage order: NEEDS INPUT → TO REVIEW → ACTIVE → SEEN → INACTIVE. This ordering is the product.

## 3. Architecture prior (propose, don't assume)

- Electron main: PTY pool, filesystem, git, SQLite, keychain, IPC.
- Renderer: React 19 + TypeScript, Vite, Zustand/Jotai, virtualized lists.
- PTY: node-pty, one per agent, backpressure, ring-buffered scrollback (~10k lines) spilling to disk.
- Persistence: SQLite (better-sqlite3); transcripts as append-only files keyed by session id.
- Secrets: OS keychain (keytar/safeStorage); injected at spawn, never returned to renderer or transcripts; redact outbound.
- IPC: typed channels, single `AgentEvent` union, contextIsolation on, nodeIntegration off.

ADRs required: Electron vs Tauri; PTY-stream parsing strategy; persistence schema. `docs/adr/NNN-title.md`.

## 4. The hard part: the output parser

Per-provider adapter behind a stable interface:

```ts
interface ProviderAdapter {
  id: 'claude' | 'codex' | 'cursor' | 'aider' | 'opencode' | 'gemini';
  detect(): Promise<{ available: boolean; version?: string; authed?: boolean }>;
  spawnArgs(ctx: SpawnContext): { bin: string; args: string[]; env: Record<string, string> };
  parse(chunk: Buffer, state: ParserState): { blocks: AgentBlock[]; state: ParserState };
  // incremental and resumable — chunks split mid-escape-sequence
}
```

Rules: raw stream always kept verbatim with a toggle (parser failure degrades to plain terminal); prefer machine-readable output modes where the CLI has them; snapshot-test against recorded fixtures in `test/fixtures/streams/<provider>/<version>/`; record CLI version at spawn, soft banner outside tested range.

## 5. Milestones

- **M0 — Design (no code).** CLI Doctor findings per provider (binary, version flag, auth check, headless/JSON mode, ToS note). Three ADRs. Data model sketch. Stop for approval.
- **M1 — One agent, one project.** Folder → spawn `claude` in a PTY → raw stream to xterm.js → typed input. Session persists across restart. Proves subscription reuse.
- **M2 — Many agents, one screen.** Five state buckets, state inference, split view, per-agent role/colour/model, NEEDS INPUT desktop notification.
- **M3 — Structured rendering.** Parser + adapter interface, Claude Code first + one more provider. Fixture tests.
- **M4 — Multi-project.** Launcher (fuzzy search, recents, zones, stats), GitHub/GitLab clone-and-open, home-folder workspace.
- **M5 — Review layer.** Per-agent side-by-side diffs, conversation attached to commits, AI Conventional Commits messages from real diffs.
- **M6 — Composer & input.** Message queue, prompt library with slash-shortcuts, screenshot capture, local-Whisper dictation.
- **M7 — Environment.** Dev terminals, localhost tunnel, read-only DB (SELECT-only enforced our side), secret manager, skills library, project memory.
- **M8 — Reliability.** Process Guard (allowlisted), context canary, adaptive model suggestion, multi-account quota switching.

- **M9 — Team coordination. Shipped 2026-08-30.** File IDE (browse/edit/save project files, sandboxed to project root). Task board: PM/SM role tag on tasks, Kanban, assign-and-send to an existing agent (backed by per-project tasks.json, not a new SQLite table — no SQL needed for this). Chat board: shared unfiltered channel, reuses the existing per-project ChatLog. Meeting room: N-agent round-robin discussion (src/orchestrator/meeting.ts), generalized from the Dev/QA orchestrator loop.
- **M9.1 — Agent/team ecosystem + task evidence. Shipped 2026-08-30.** Multiple instances of the same role per project (AgentRef.roleId separates the role from the now-always-unique instance id). New Agent Modal rebuilt to match the design handoff's dedicated modal file — searchable, icon-grouped, **accordion** role grid (19 built-in roles across Core team/Specialists/Community, +pm/sm since PM/SM are real agents now, not just a task label; search force-opens matching groups). Global agent library (agent-library.json) — a Custom-tab agent can be saved and reused from any project, or imported directly from a github.com/raw.githubusercontent.com URL ("From library" tab). Teams (teams.json) — a named bundle of roles/library agents, added to a project in one action. Task board: any agent's own header can file a task (createdBy is now free text, not a closed pm/sm/user set), attachments (screenshots via the existing capture, files via a native picker, or a pasted path). Skills: import from a github.com/raw.githubusercontent.com URL too (allowlisted — no SSRF, no npx-package execution; `fetchGithubText()` in main.ts is shared by both the skill and agent import paths). npx-package skill/agent import is explicitly NOT built — real supply-chain exposure, needs its own conversation before attempting.
- **M9.2 — Rebrand + backend default. Shipped 2026-08-30.** Product renamed AgentRoom → Agentic Control Room end-to-end (package/CLI/extension config namespace `agentRoom`→`agenticControlRoom`, project data dir `.agent-room`→`.agentic-controlroom`, window/UI text, localStorage keys, env vars) — no legacy-path migration, breaking on purpose. Default agent backend switched Cursor CLI → Claude Code CLI (subscription) across all three surfaces (CLI, VSCode extension, desktop app); Cursor remains a selectable per-project backend.
- **M10 — OpenRouter backend, admin panel, planning board, visual restyle. Planned 2026-08-30, not started.** Four independent workstreams, sequenced in this order (each ships and gets used before the next starts, per the working agreement below):
  1. **OpenRouter backend.** New `OpenRouterBackend implements AgentBackend` (`src/backend/openRouterBackend.ts`) — HTTP-based (fetch to `https://openrouter.ai/api/v1/chat/completions`), not a CLI subprocess, unlike the two existing backends. `Project.backend` and `Account.provider` unions extend to include `"openrouter"`; API key travels through the existing `accounts.json` credential-profile mechanism (same path multi-account quota switching already uses), model field holds an OpenRouter model slug (e.g. `anthropic/claude-3.5-sonnet`). `makeBackend()` in `main.ts` gets a third arm. Non-streaming to start (`onLine` fires once with the full reply) — ponytail: add SSE delta streaming only if the non-streaming UX proves too slow in practice.
  2. **Admin panel.** New top-level screen (not just a modal tab) for governance over the existing global agent library / teams / roles infrastructure:
     - Provider restriction at three levels, all three needed per the working decision: **global** allow-list (hides a disabled backend from every picker app-wide), **per-project** override (a project may further restrict within the global set, never expand past it), and **per-category** override (e.g. "QA-category agents may only use Claude"). Enforced twice: hidden in the UI pickers (NewAgentModal `ENGINES`, TopBar backend `<select>`) *and* re-checked at actual spawn time in `main.ts` (`makeBackend`/`assertAllowedBin`-adjacent) so a stale/bypassed UI can't spawn a disallowed backend. Persisted in a new `admin-config.json` (global userData dir, same tier as `accounts.json`/`teams.json`).
     - Agent management: create a new agent and store it globally (extends the existing Custom-tab-save-to-library flow already shipped in M9.1 — this is a management *surface* over that data, not a new storage layer), add/rename/delete categories (today's categories are the fixed accordion role groups from M9.1; this makes the group list user-extensible), and reorder/shuffle both agents within a category and categories themselves (persisted order field on both).
  3. **Planning / idea board.** New per-project space that sits *before* the Task Board in the workflow — freeform thread per project (`.agentic-controlroom/planning.jsonl`, same append-only shape as the chat log), where the user posts an idea (with attachments — reuses the file/screenshot attachment pipeline already built for tasks in M9.1) and PM/SM/any agent comment inline. A message or section can be **promoted to a task** — opens `NewTaskModal` pre-filled from that content and attachments, and the created task carries a `sourcePlanningMessageId` back-reference for traceability. Reuses the M9.1 agent-initiated task-creation IPC path rather than a new one.
  4. **Visual restyle** (design direction locked in by user decision on 2026-08-30, see [[agentroom_m10_visual_restyle]] memory note):
     - **Task Board → literal sticky-note corkboard.** CSS-driven: corkboard/wall-texture background, cards styled as physical sticky notes/index cards (slight per-card rotation, pin/tape accent, paper-color variants), hand-written-style card-title font. Achievable without generated art assets.
     - **Chat Room + Meeting Room → skeuomorphic room illustration.** Literal room background art (desks, whiteboard, office) with agents rendered as characters placed in the scene — the largest departure from the current flat `design_handoff_agentroom` design system, and the highest-risk/highest-effort item here since it needs actual illustrated assets (background scene(s) + character states: idle/talking/typing/away), not just CSS. Do this last; prototype one background + a few character poses and get sign-off on the exact style before wiring full interactivity, rather than building the whole thing against a guess.

Ship each milestone end-to-end; don't start the next until the previous has been used.

## 8. Design system

Authoritative visual/interaction spec: `design_handoff_agentroom/` (repo root's parent — see `README.md` there). Implement UI pixel-precise to this handoff, not approximate. Re-check the relevant `.dc.html` file before any UI change.

## 6. Working agreement

TypeScript strict, no `any`. Tests + short docs note per milestone. Small conventional commits. Real trade-off → ADR + ask. Spec wrong or better alternative → argue at design time.

## 7. Start

Read https://agentsroom.dev + /features. Run CLI Doctor on this machine. Produce M0. Stop.
