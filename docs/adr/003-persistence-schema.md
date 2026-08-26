# ADR-003: Persistence — SQLite for state, append-only files for streams

Status: accepted (2026-08-26) · Date: 2026-08-26

## Context

SPEC §3: agents/sessions/messages/backlog/memory in SQLite (better-sqlite3), transcripts as append-only files keyed by session id, secrets in OS keychain only. Agent identity must outlive its process (SPEC §2).

## Decision

### Engine

better-sqlite3 in the Electron main process, WAL mode, `PRAGMA user_version` migrations (numbered SQL files applied in a transaction at boot). Synchronous API is a feature here: all access is main-process, renderer goes through typed IPC.

### What goes where

- **SQLite**: identity, relationships, derived stats, queues — anything queried or joined.
- **Append-only JSONL files** (`<userData>/streams/<sessionId>.jsonl` for parsed blocks, `.raw` for raw bytes): high-volume streams. Ring buffer (10k lines) in memory; overflow appends to the file. DB rows hold file paths + byte offsets, never blobs.
- **OS keychain via Electron `safeStorage`** (not keytar — unmaintained): secret *values*. DB stores name + metadata only. Values injected into child env at spawn; redaction pass (registered secret values → `•••`) applied to every stream line before persist/render.

### Schema sketch (M1 subset marked ▸)

```sql
▸ projects(id PK, path UNIQUE, name, zone, created_at, first_opened_at, last_opened_at)
▸ agents(id PK, project_id FK, role_id, display_name, color, provider, model,
         permission_mode, system_prompt, created_at, archived_at NULL)
▸ sessions(id PK, agent_id FK, provider_session_id,      -- CLI's own resume id
           cli_version, started_at, ended_at NULL,
           raw_path, blocks_path, raw_bytes, last_state) -- state at shutdown → restore
▸ messages(id PK, session_id FK, ts, kind,               -- user|agent|system
           text, blocks_offset NULL)                     -- offset into blocks file
  agent_states(agent_id PK, state, since_ts, unread_count) -- NEEDS_INPUT|TO_REVIEW|ACTIVE|SEEN|INACTIVE
  inbox(id PK, from_agent FK, to_agent FK, ts, body, delivered_at NULL, read_at NULL)
  backlog_tasks(id PK, project_id FK, title, body, status, agent_id NULL, ord, created_at)
  memory_entries(id PK, project_id FK, kind,             -- decision|architecture|pitfall
                 title, body, author_agent NULL, ts)
  prompts(id PK, project_id NULL, slash, title, body, ts)
  secrets_meta(name PK, scope, created_at)               -- value lives in keychain
  provider_status(provider PK, bin_path, version, authed, checked_at)  -- CLI Doctor cache
  settings(key PK, value)
```

Notes:
- `agents` ≠ process: a PTY dying touches only `sessions.ended_at`. Restart restores agent + scrollback from `raw_path` tail. (SPEC §2 requirement.)
- `agent_states` is its own tiny table because the room view sorts on it constantly and it churns.
- `provider_session_id` is the vendor CLI's resume handle (`--resume`); ours (`sessions.id`) is stable even when the vendor's is absent (some CLIs return none — observed in prototype).
- Project stats (SPEC §2) derived by aggregation over `sessions`/`messages`, cached in `settings`-style rows only if profiling demands.

## Consequences

- Backup/portability = one SQLite file + streams dir; secrets stay in the OS keychain (deliberately not exported).
- electron-rebuild required for better-sqlite3 (same pipeline as node-pty, ADR-001).
- Transcript files grow unbounded → retention setting later (delete streams older than N days, keep DB rows); out of M1 scope.
