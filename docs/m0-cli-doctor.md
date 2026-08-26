# M0 — CLI Doctor report (this machine, 2026-08-26)

Machine: Windows 11 Pro, Node 24.15.0 (nvm4w). Probe method: `Get-Command <bin>` on PATH + `--version` + each CLI's cheap auth check.

## Installed

### claude (Claude Code) — AVAILABLE, LOGGED IN
- Binary: `claude` → `C:\nvm4w\nodejs\claude.ps1` (npm-global shim; real entry is a node script)
- Version: `2.1.246 (Claude Code)` via `claude --version`
- Auth check: `~/.claude/.credentials.json` present (OAuth store). No dedicated `auth status` subcommand documented; cheap runtime confirmation = first spawn fails fast with a login error if logged out. Doctor should report file-presence as "probably logged in", spawn as ground truth.
- Headless/JSON: **yes** — `claude -p` with `--output-format json|stream-json` (`stream-json` requires `--verbose` in print mode), `--resume <session_id>`, `--permission-mode`, `--append-system-prompt`, prompt accepted on stdin. Verified end-to-end in the prototype (`src/backend/claudeCliBackend.ts`).
- ToS note: official supported CLI; headless print mode is a documented feature. Subscription reuse = invoking the CLI. In-bounds.

### cursor-agent (Cursor CLI) — AVAILABLE, LOGGED IN
- Binary: `cursor-agent` → `%LOCALAPPDATA%\cursor-agent\cursor-agent.ps1` (also aliased as `agent`). Windows install is a `.cmd`→PowerShell→`node.exe` shim chain; the real runtime is `%LOCALAPPDATA%\cursor-agent\versions\<YYYY.MM.DD-hash>\node.exe + index.js`. Spawning that pair directly avoids shell quoting entirely (verified in prototype).
- Version: `2026.08.11-e8db854`. **Self-updates silently** — it was `2026.07.23-e383d2b` two days ago on this machine. Fixture/version-pinning (SPEC §4) is not theoretical.
- Auth check: `cursor-agent status` → `✓ Logged in as rv6342@gmail.com`. Cheap and documented.
- Headless/JSON: **yes** — `-p` / `--print` with `--output-format text|json|stream-json`, `--resume <chat_id>`, `--model`. Headless in an untrusted dir requires `--trust` (or `-f`). Verified end-to-end in the prototype (`src/backend/cursorCliBackend.ts`).
- ToS note: official supported CLI, documented for scripts/CI. In-bounds.

## Not installed (install command + what Doctor should say)

| Provider | Binary | Install | Headless/JSON mode | Auth check | Note |
|---|---|---|---|---|---|
| OpenAI Codex | `codex` | `npm i -g @openai/codex` | `codex exec` (non-interactive), `--json` event stream; resume supported in newer builds | `codex login status` | Official CLI; ChatGPT-subscription login or API key. In-bounds. |
| Gemini CLI | `gemini` | `npm i -g @google/gemini-cli` | `-p` print mode; JSON output flag — verify exact flag at adapter time | OAuth creds file `~/.gemini/` presence; spawn = ground truth | Official CLI. In-bounds. |
| Aider | `aider` | `python -m pip install aider-chat` (or uv) | No structured stream mode — ANSI tier; scriptable with `--message`/`--yes` | none (BYOK env keys: `ANTHROPIC_API_KEY` etc.) | Open source; BYOK only. In-bounds. |
| OpenCode | `opencode` | `npm i -g opencode-ai` (also brew/scoop) | `opencode run` non-interactive; server mode exists — verify at adapter time | provider-dependent (`opencode auth`) | Open source. In-bounds. |
| Ollama | `ollama` | winget/installer from ollama.com | Local HTTP API + `ollama run`; not a coding agent by itself | `ollama list` responding = daemon up | Support via agents that consume it (aider/opencode pointing at local models), not as a first-class agent adapter. |

## Adapter tiering that falls out of this

- **Tier A (machine-readable, no ANSI scraping):** claude, cursor-agent, codex — all have documented headless JSON/stream-JSON. Gemini and OpenCode likely Tier A, verify at adapter time.
- **Tier B (PTY + ANSI parse):** aider; also every provider's *interactive* TUI mode when the user opens a live terminal pane. Raw PTY view is the floor for all providers regardless of tier.

## Boundary confirmations (SPEC §1)

Both verified providers were driven exclusively through their supported CLIs. No token extraction, no internal endpoints, no undocumented APIs anywhere in the prototype, and none planned. Providers with no CLI = unsupported.
