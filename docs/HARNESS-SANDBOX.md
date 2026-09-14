# Execution protection and harness status

Milestone 1 delivered, 2026-09-14. Tracking runs automatically for every project. The project room shows active runs and stop controls beside the conversation. Open Activity history for the latest 200 audit events; Advanced protection is collapsed inside it. There is no separate Execution tab or activation step. Filters select event kind, run or agent; event details expose correlation IDs and safe metadata.

## Protection
Existing projects remain provider-managed. This means the app does not verify an OS boundary; provider permissions still apply. Requested policy persists per project. Unsupported read-only, isolated-workspace, network controls reject before dispatch rather than falling back to host execution. Policy changes are rejected while tracked runs or project terminals are active.

No app isolation driver is enabled. A read-only host probe found Docker CLI and docker-desktop WSL, but the Docker server pipe was unavailable. No runtime was installed, container launched or credential store copied. Worktrees and process allowlists are not sandboxes. Real outside-write, reparse/symlink escape, network, descendant containment and native-provider compatibility tests remain deferred until a compatible driver exists; fixture tests do not establish isolation.

## Runs, cancellation and audit
Direct and planning calls, meeting/debate participants, capability-loop follow-ups and nested workflow agents use shared project/run/task identities. Each underlying model invocation is recorded once. App capability and workflow tools record started/settled status without copying arguments, results or raw errors.

One writer owns each canonical project directory. JSONL records under .agentic-controlroom/harness rotate at 5 MiB with five retained files. Restart verifies project ownership, sequence and record validity; truncated-tail repair produces a diagnostic. Event metadata is allowlisted and redacted. Queries and in-memory history are bounded.

Stop requests abort future dispatch and request termination of tracked native processes. A call remains active until actual settlement; an HTTP request may finish before stopping. Cancellation remains accepted if audit writing fails, with a visible diagnostic. Policy and audit history survive restart.

Interactive agent and shell terminals are policy-gated at launch, but their internal activity is outside this timeline and its stop controls. Native-provider internal tools/MCP calls are not uniformly observable; app-managed capability/workflow tools are logged.

## Verification
Full build and 218 tests passed. Isolated Electron/Playwright checks passed for two-project policy persistence and rejection, capability/workflow tool events, HTTP and workflow cancellation, filters and restart. Separate regressions passed concurrent meeting/debate and nested workflow correlation. Local Codex/Cursor fixture processes confirmed cancellation and observed settlement. No paid model calls were used. These fixtures do not establish authenticated live-provider behavior or OS isolation.

Milestone 2 adds automatic usage tracking and app-dispatch call/concurrency limits with a cancellation deadline; see HARNESS-USAGE.md. OS isolation and hard token/cost caps remain unavailable. Milestones 3-6 (context, tools, delegation and goals) remain planned.
