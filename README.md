# agent-room

Multi-agent coding chatroom. Specialized agents (Dev + QA in this MVP; Lead, Architect, Playwright later) work on a task in your repository, coordinating through a shared live log so each agent sees what the others did.

Default backend: **Cursor CLI** (`cursor-agent`) — uses your existing Cursor login and model access, no separate API keys.

## Prerequisites

- Node.js >= 20
- [Cursor CLI](https://cursor.com/docs/cli/overview) installed and logged in (`cursor-agent --version` works). If the binary isn't on PATH under that name, set `CURSOR_AGENT_BIN` to its full path.

## Usage

```bash
cd your-repo
agent-room "add a /health endpoint with a test"
```

What happens:

1. **Dev** implements the task in your repo, posts a summary to the chatroom, ends with `STATUS: READY_FOR_REVIEW`.
2. **QA** reads the chatroom, verifies the changes in the actual files, ends with `STATUS: APPROVED` or `STATUS: CHANGES_REQUESTED` + findings.
3. On changes requested, Dev fixes and the loop repeats (default 3 rounds, `AGENT_ROOM_MAX_ROUNDS` to change).

The chatroom streams live in your terminal (color per agent) and persists to `.agent-room/log.jsonl` — append-only JSONL, one message per line: `{ ts, agentId, role, message }`. That file is the shared memory: each agent's prompt includes the recent tail, so agents always know what the others did.

Exit code `0` = QA approved, `2` = max rounds without approval.

## Config

| Env var | Default | Purpose |
|---|---|---|
| `CURSOR_AGENT_BIN` | `cursor-agent` | Path to the Cursor CLI binary |
| `AGENT_ROOM_MODEL` | Cursor's default | Passed as `--model` |
| `AGENT_ROOM_MAX_ROUNDS` | `3` | Dev↔QA round cap |

## Architecture (why it's portable)

```
src/backend/agentBackend.ts    ← the seam: start()/resume() interface
src/backend/cursorCliBackend.ts← only file that knows about cursor-agent
src/chatroom/log.ts            ← shared memory: JSONL append/tail + events
src/orchestrator/orchestrator.ts ← turn-based Dev↔QA state machine
src/cli.ts                     ← terminal live view + wiring
roles/*.md                     ← role system prompts (add roles = add files)
```

Nothing outside `cursorCliBackend.ts` knows about Cursor. To run on Claude Code, Copilot CLI, etc., implement `AgentBackend` for that host — the orchestrator, chatroom, and roles are unchanged. Same for surfaces: the JSONL log is UI-agnostic, so a web dashboard or an editor extension just tails the same file.

## Adding a role

Drop `roles/<name>.md` with the role's instructions and wire it into the orchestrator turn order. (MVP hardcodes Dev→QA; a configurable turn graph comes when a third role actually exists.)

## Development

```bash
npm install
npm test        # builds + runs unit tests (no Cursor login needed)
npm run build
node dist/cli.js "some task"
```
