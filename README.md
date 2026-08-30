# Agentic Control Room

Multi-agent coding chatroom. Specialized agents (Dev + QA in this MVP; Lead, Architect, Playwright later) work on a task in your repository, coordinating through a shared live log so each agent sees what the others did.

Default backend: **Claude Code CLI** (`claude`) — uses your existing Claude subscription/login, no separate API keys.

## Prerequisites

- Node.js >= 20
- Claude Code CLI installed and logged in (`claude --version` works). If the binary isn't on PATH under that name, set `CLAUDE_BIN` to its full path. (Or switch a project to the Cursor CLI backend instead — see Config.)

## Usage — Desktop app (agentsroom-style)

```bash
npm install && npm run app
```

Three panes: **projects** rail (add any local folder, several projects run in parallel, running badge per project) | **room** (agent roster with live state dots, chatroom, task input, backend picker) | **live activity** (streaming tool calls / work lines from each agent as it edits code, filterable per agent).

Backends per project: **Claude Code** (default, your Claude subscription via `claude` CLI), **Cursor** (your Cursor login via `cursor-agent`), or **OpenRouter** (any model it hosts, via a plain API call — add an `OPENROUTER_API_KEY` account credential and pick "Custom" as the model to enter a model slug like `anthropic/claude-3.5-sonnet`). The two CLI backends stream live activity via `--output-format stream-json`; OpenRouter is a single non-streaming HTTP call and has no interactive terminal pane, since there's no CLI to attach to. Projects persist in the app's user-data dir; right-click a project to remove it.

## Usage — Cursor extension

```bash
npm install && npm run package
cursor --install-extension agentic-controlroom-0.1.0.vsix
```

Then in Cursor: `Ctrl+Shift+P` → **Agentic Control Room: Run Task** → type the task. A side panel opens showing the live chatroom (Dev and QA messages as they land); the agents work on the currently open workspace folder. Settings: `agenticControlRoom.model`, `agenticControlRoom.maxRounds`.

The extension drives models through the `claude` CLI (Claude Code) rather than Cursor's own model access — same login, same subscription, just invoked as a subprocess. The extension is the UI surface.

## Usage — CLI

```bash
cd your-repo
agentic-controlroom "add a /health endpoint with a test"
```

What happens:

1. **Dev** implements the task in your repo, posts a summary to the chatroom, ends with `STATUS: READY_FOR_REVIEW`.
2. **QA** reads the chatroom, verifies the changes in the actual files, ends with `STATUS: APPROVED` or `STATUS: CHANGES_REQUESTED` + findings.
3. On changes requested, Dev fixes and the loop repeats (default 3 rounds, `AGENTIC_CONTROLROOM_MAX_ROUNDS` to change).

The chatroom streams live in your terminal (color per agent) and persists to `.agentic-controlroom/log.jsonl` — append-only JSONL, one message per line: `{ ts, agentId, role, message }`. That file is the shared memory: each agent's prompt includes the recent tail, so agents always know what the others did.

Exit code `0` = QA approved, `2` = max rounds without approval.

## Config

| Env var | Default | Purpose |
|---|---|---|
| `CLAUDE_BIN` | `claude` | Path to the Claude Code CLI binary |
| `CURSOR_AGENT_BIN` | `cursor-agent` | Path to the Cursor CLI binary (Cursor backend only) |
| `AGENTIC_CONTROLROOM_MODEL` | Claude's default | Passed as `--model` |
| `AGENTIC_CONTROLROOM_MAX_ROUNDS` | `3` | Dev↔QA round cap |

## Architecture (why it's portable)

```
src/backend/agentBackend.ts    ← the seam: start()/resume() interface
src/backend/claudeCliBackend.ts← default backend, drives the `claude` CLI
src/backend/cursorCliBackend.ts← alternate backend, drives `cursor-agent`
src/chatroom/log.ts            ← shared memory: JSONL append/tail + events
src/orchestrator/orchestrator.ts ← turn-based Dev↔QA state machine
src/cli.ts                     ← terminal live view + wiring
src/extension.ts               ← Cursor/VSCode extension: command + webview chatroom
roles/*.md                     ← role system prompts (add roles = add files)
```

Nothing outside `claudeCliBackend.ts`/`cursorCliBackend.ts` knows about their respective CLIs. To run on Copilot CLI, etc., implement `AgentBackend` for that host — the orchestrator, chatroom, and roles are unchanged. Same for surfaces: the JSONL log is UI-agnostic, so a web dashboard or an editor extension just tails the same file.

## Adding a role

Drop `roles/<name>.md` with the role's instructions and wire it into the orchestrator turn order. (MVP hardcodes Dev→QA; a configurable turn graph comes when a third role actually exists.)

## Development

```bash
npm install
npm test        # builds + runs unit tests (no Cursor login needed)
npm run build
node dist/cli.js "some task"
```
