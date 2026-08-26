# ADR-001: Electron over Tauri for the desktop shell

Status: accepted (2026-08-26) · Date: 2026-08-26

## Context

The app is a PTY-heavy cockpit: up to ~20 concurrent child CLI sessions streaming tokens, xterm.js panes, SQLite, keychain access, git operations. SPEC §3 states Electron as the prior but asks for a real comparison.

## Options

**Electron**
- node-pty is the reference PTY library (ConPTY on Windows, forkpty elsewhere) and runs in-process in main; xterm.js + node-pty is the proven pairing (VS Code's terminal stack).
- better-sqlite3, safeStorage, child-process control, fs/git — all first-party in the main process, one language (TS) end to end.
- Costs: ~100MB+ install, higher RAM, needs native-module rebuilds (electron-rebuild for node-pty/better-sqlite3), needs discipline on process isolation.

**Tauri**
- Smaller binary, lower idle RAM, Rust core.
- Costs for this app: PTY must be done in Rust (portable-pty) with a custom event bridge to the webview — recreating what node-pty gives free, in a second language; streaming 20 PTYs through Tauri IPC needs custom framing/backpressure; SQLite/keychain fine but every main-process feature (git, process guard, doctor probes) becomes Rust; team velocity is TS.
- WebView2 on Windows is fine for xterm.js, but the ecosystem's terminal-app reference implementations are Electron.

## Decision

**Electron**, with the isolation posture from SPEC §3 enforced from day one: `contextIsolation: true`, `nodeIntegration: false`, sandboxed renderer, typed IPC only, single `AgentEvent` union, no `remote`.

The dominant risk in this product is the PTY/parsing layer, not shell size. Electron minimizes risk exactly there; Tauri adds a Rust rewrite of the riskiest component for a size win the target user (runs 20 AI CLIs) does not care about.

## Consequences

- electron-builder for packaging; electron-rebuild step for node-pty + better-sqlite3 pinned per Electron version.
- RAM budget: cap per-agent renderer cost via virtualized lists + ring-buffered scrollback (ADR-002/003).
- Revisit trigger: if a future requirement is mobile/embedded shells, re-evaluate; not before.
