# Project Brief: "AgentRoom" — a multi-agent cockpit for CLI coding agents

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
- **M9.1 — Agent/team ecosystem + task evidence. Shipped 2026-08-30.** Multiple instances of the same role per project (AgentRef.roleId separates the role from the now-always-unique instance id). New Agent Modal rebuilt to match the design handoff's dedicated modal file — searchable, icon-grouped role grid (19 built-in roles across Core team/Specialists/Community, +pm/sm since PM/SM are real agents now, not just a task label). Global agent library (agent-library.json) — a Custom-tab agent can be saved and reused from any project. Teams (teams.json) — a named bundle of roles/library agents, added to a project in one action. Task board: any agent's own header can file a task (createdBy is now free text, not a closed pm/sm/user set), attachments (screenshots via the existing capture, files via a native picker, or a pasted path). Skills: import from a github.com/raw.githubusercontent.com URL (allowlisted — no SSRF, no npx-package execution).

Ship each milestone end-to-end; don't start the next until the previous has been used.

## 8. Design system

Authoritative visual/interaction spec: `design_handoff_agentroom/` (repo root's parent — see `README.md` there). Implement UI pixel-precise to this handoff, not approximate. Re-check the relevant `.dc.html` file before any UI change.

## 6. Working agreement

TypeScript strict, no `any`. Tests + short docs note per milestone. Small conventional commits. Real trade-off → ADR + ask. Spec wrong or better alternative → argue at design time.

## 7. Start

Read https://agentsroom.dev + /features. Run CLI Doctor on this machine. Produce M0. Stop.
