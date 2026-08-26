# M0 — scope notes, spec pushbacks, prototype disposition

## Scope read (agentsroom.dev + /features)

56 features, 6 categories: Orchestration (multi-project cockpit, task board that spawns agents, agent teams/messaging/morphing, 260+ agent catalog, scheduled tasks, delegation), Communication (sketch, screenshot, dictation, voice mode, message queue, mobile companion, prompt/skills library, project memory, linked prompts, Figma), Monitoring (split view, status colors, dynamic island, context canary, process guard, adaptive mode, notifications, token meter, stats), Review & Quality (commit context gists, AI commit messages, per-agent review, browser automation, file review), Dev Environment (tunnel, terminals, session restore, own MCP servers, SSH, secret manager, read-only DB, RDS/SSM, CLI doctor, repo import), Anywhere (mobile sync, 13 providers, multi-account + auto-switch, cloud agents, remote fleet/control). SPEC's M1–M8 covers the durable core of this; the rest is post-M8 backlog.

## Pushbacks (working agreement §6 — raised before implementing)

1. **keytar is dead.** Archived/unmaintained. Use Electron `safeStorage` (OS-keychain-backed) as ADR-003 does. No functional loss.
2. **Adapter id `'cursor'` → binary is `cursor-agent`** (alias `agent`), version format `YYYY.MM.DD-hash`. It **self-updates silently** — observed jumping 2026.07.23 → 2026.08.11 on this machine within two days. Strengthens the fixture/version-pin requirement; also means `detect()` results must be re-checked per spawn, not cached at first launch only.
3. **Windows spawn hazard (verified the hard way):** `cursor-agent` on Windows is a `.cmd`→PowerShell→node shim; spawning the shim through a shell mangles multiline prompts. The adapter must resolve and spawn the real `node.exe + index.js` under `%LOCALAPPDATA%\cursor-agent\versions\<latest>`. Same class of issue applies to any npm-shim CLI (`claude.ps1`): prefer stdin for prompt delivery and never put user content in argv when a shell is involved.
4. **Full ANSI semantic parsing is deliberately out** (ADR-002): Tier A stream-json covers claude/cursor-agent/codex with perfect fidelity; Tier B PTY does display via xterm.js + coarse state inference only. Rebuilding a TUI parser for fidelity we get free from JSON modes is cost without payoff.
5. **M2 state inference caveat:** "waiting-on-user" detection from a PTY stream is heuristic (prompt patterns, silence-after-question). Tier A managed runs make it exact (explicit result/error events). Expect M2 to be exact for managed runs, heuristic for interactive panes.

## Existing prototype (this repo, commits `b77c1f6`..`7e02858`)

Built before this SPEC landed; it is a working spike, not the SPEC architecture (no PTY, no SQLite, no React — headless stream-json runs + a vanilla-DOM Electron shell + a VSIX Cursor extension). Value already extracted from it:

- **Subscription reuse proven end-to-end** for cursor-agent (real task run, QA-verified output) and implemented for claude — M1's core risk is retired early.
- stream-json flags, `--trust`, `--resume`, stdin prompt delivery, Windows shim resolution all verified — becomes the Tier A adapter code.
- Role library (8 roles), shared JSONL chatroom, orchestrated Dev→QA loop — informs M2+ design.

Disposition (proposed): tag the current branch as `spike/chatroom-mvp`, start SPEC M1 in a clean `src/` layout on a fresh branch, porting the verified backend logic into `ProviderAdapter` implementations. Nothing thrown away, nothing built on an unapproved base.

## M0 deliverables index

- `SPEC.md` — the brief (canonical)
- `docs/m0-cli-doctor.md` — per-provider findings on this machine
- `docs/adr/001-electron-over-tauri.md`
- `docs/adr/002-stream-parsing-strategy.md`
- `docs/adr/003-persistence-schema.md` — includes the data model sketch
- `docs/m0-notes.md` — this file

Awaiting: ADR approval + disposition decision, then M1.
