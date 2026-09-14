# Codex subscription connection

Agent Room supports **Codex (ChatGPT login)** separately from **OpenAI API**.

1. Install the official Codex CLI and run `codex login`, choosing ChatGPT. `codex login status` should report ChatGPT login. Agent Room uses the CLI's stored login; it does not read, copy or export auth tokens.
2. Restart the rebuilt Agent Room desktop app. In existing profiles, enable Codex in Admin's provider allowlist. Existing global/project/category restrictions are preserved.
3. Choose Codex (ChatGPT login) in New Agent, or set an existing agent's provider to codex in workflow settings. Select Default or enter a model ID available to your account. OpenAI API remains a separate API-key provider.

Windows uses the native codex.exe from PATH or the installed Codex desktop bin directory. CODEX_BIN may point to its full executable path. Shell .cmd/.bat/.ps1 launchers are not supported by this adapter.

The backend checks `codex login status` before each run and rejects API-key login. OPENAI_API_KEY and CODEX_API_KEY are removed from the child environment. It invokes `codex exec --json` with prompts over stdin and resumes the exact stored thread ID. New sessions are keyed by provider and agent to avoid using a Claude/Cursor session in Codex. Authentication continues to be managed by Codex itself. Account switching inside Agent Room does not switch the Codex CLI ChatGPT account.

Execution uses workspace-write sandbox with noninteractive approvals set to never: operations requiring approval fail rather than bypass restrictions. Advanced flags currently support `--sandbox read-only` / `workspace-write` and `-c model_reasoning_effort=low` (minimal/medium/high/xhigh also accepted, subject to model support). No automatic model fallback. No dedicated login button, account quota meter, or Codex-native subagent visualization yet. CLI-managed MCP is surfaced as unverified, not claimed connected.

Verification on 2026-09-12: 174 tests passed including auth rejection, parser failures, stdin and exact-session resume. Real Electron subscription test with gpt-5.6-luna/low returned 42 then ORCHID on a resumed session, no page errors. gpt-5.4-mini was rejected by this account; it is not offered as a preset. UI test created a Codex agent and confirmed governance rejects disallowed provider updates. No API-key model calls used. Session namespacing was added after the live test and verified by build/review; native start/resume path was unchanged. A separate intermittent Electron sandbox startup warning remains in diagnostics from some isolated launches.

Official references: https://learn.chatgpt.com/docs/non-interactive-mode and https://learn.chatgpt.com/docs/auth
