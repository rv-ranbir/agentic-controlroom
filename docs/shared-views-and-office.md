# Shared agent views and virtual office

All desktop model-backed agents receive the shared capability catalogue and can discover skills and publish or update isolated HTML views. Views render in conversations and can open in app tabs, separate previews or a browser. Workflow presentations preserve raw replies and validate domain data before publishing. The catalogue distinguishes provider-managed MCP configuration from verified app tools; native MCP discovery/execution is not implemented.

The project office shows the actual roster, supports search and fit/zoom, and opens agent details and existing room views. Meeting, debate and planning lifecycle events drive project/session-scoped room occupancy. Concurrent sessions have separate stable room positions while the view is mounted. Agent home desks persist in this desktop profile across restarts and roster changes. Vector furniture is separate from agent controls; reduced motion is supported.

Current limits: live room layouts and preview tabs are not persisted, home slots do not sync across machines, and subagent visualization, full obstacle-aware movement and advanced character artwork remain future work. Manual terminals and standalone extension/CLI entrypoints are outside the common desktop capability wrapper. The office artwork is a simplified vector implementation, not the full cutaway concept.

Verification for this change: full build and151 core tests pass, including an isolated snapshot containing only staged files. Electron checks cover generic visual publishing/update and isolation; a12-agent/14-step trading fixture;12/30-agent office search and fit; actual session orchestration with simulated model responses; planning failure cleanup; project isolation; reduced motion; and desk persistence across restart. No authenticated trading analysis or broker execution is implied by fixture results.

## Cutaway office, results and preferences

The floor uses a generated continuous cutaway studio with real roster controls. Additional rosters extend in twelve-desk wings. Meeting/planning/debate presence remains sourced from session events. Office routes now use desk aisles, a central corridor and room approach points; pure tests check orthogonal segments, reverse travel, an additional wing, table clearance for the tested seat and distance-based animation offsets. This is authored route geometry, not a general collision/navigation mesh.

Office settings save studio/room names and label visibility per project in profile-local storage. Results wall lists project artifacts with app/browser preview actions and real child-workflow records linked to their parent. Refresh fetches current records; the wall does not claim native CLI subagent visibility. Minimized artifact tabs reserve vertical room so office controls remain usable.

Verification:154 core tests, desktop fit12/30, project preferences reload/isolation, meeting movement/reduced motion, concurrent rooms/planning cleanup, agent publish/update and nested-workflow results tests. Test models are simulated locally. The final artwork is assets/office/cutaway-studio.png, generated with the built-in image tool. Characters remain simpler than the original concept; customizable geometry, native subagent presence, full lounge composition and freeform obstacle avoidance are not complete.

### Native delegated-agent visibility (2026-09-12)

The office inspector now shows Claude delegated agents under their roster parent, including progress, last tool and observed lifecycle state. Parent badges count active delegated agents. Records are scoped by project, parent and provider session; shell tasks are excluded. A parent stream ending without a completion event produces Status unavailable. Records currently live in memory and are capped at 500. Other providers and separate moving subagent avatars are not implemented.

Event contract: https://code.claude.com/docs/en/agent-sdk/typescript

Verified with 167 core tests, desktop build and an isolated Electron process fixture covering progress, completion, failure, missing completion and project isolation. No authenticated provider call was made for this verification.

### Error diagnostics
Desktop errors are written locally to userData/logs/errors.jsonl with one rotated errors.jsonl.1 file (1 MiB threshold). Sources include agent runs, rejected app requests, renderer console errors, preload/process failures and uncaught main-process exceptions. Errors retain bounded stack/message context; common credential patterns are redacted. Request arguments and provider streams are not logged. Logging does not swallow fatal exceptions or change failed-request behavior. Restart the rebuilt desktop app to enable this. Default development profile: %APPDATA%/Electron/logs/errors.jsonl; isolated/custom profiles use their own userData directory.

Verified by 169 tests plus an Electron test injecting renderer and IPC failures and checking persisted redacted records. The previously reported exception was not reproduced.

Updated app-owned path: default diagnostics are now %APPDATA%/Agent Room/logs/errors.jsonl, superseding the generic Electron path above. Existing settings/projects remain at their current locations. Custom userData profiles keep isolated diagnostics at <userData>/Agent Room/logs/errors.jsonl. Every entry identifies Agent Room; direct agent failures include structured projectId and agentId when known. Verified with 170 tests and Electron diagnostic fixture.

### Authenticated verification and exception fix — 2026-09-12
Authenticated Claude Code Haiku delegation passed in real Electron: one arithmetic subagent, completed lifecycle, result 42, no page errors. CLI budget capped at $0.30 per attempt; actual billing not measured. Empty synthetic project; no repository source sent. First test attempt inspected results before asynchronous completion; corrected test waited for parent response.

Reproduced UnhandledPromiseRejectionWarning by starting a meeting with no participants. Direct-send/meeting/debate handlers discarded promises, allowing pre-run validation failures to escape. Added catches that report the error through existing UI and app diagnostics; regression now produces no unhandled stderr and persists project context. Runtime warnings now logged without changing fatal-error semantics.

Final build +170 tests passed; native lifecycle/diagnostic Electron fixture and invalid-meeting regression passed. One isolated pre-fix launch also logged Electron sandbox startupData=null; absent in two subsequent launches. Cannot confirm this or the reproduced rejection matches the user's historical exception without its original trace. Keep monitoring that separate startup symptom. Screenshot and local test scripts are in the Trading agent/delegation workspace.

### Delegated work floor — 2026-09-12
Observed running and status-unavailable Claude subagents now occupy clickable temporary workstations below each project's office. Existing OfficeCharacter seated/typing poses reused; short entrance transition respects reduced motion and document visibility. Parent name/task/status shown, selection opens that parent's exact task details without scrolling back to the parent desk. Completed/failed/stopped tasks leave the floor and remain in the inspector. Removed-parent records excluded. Twelve workstations/page bounds large teams; page index clamps as tasks finish. Fit calculation includes annex.
Desktop build and two actual Electron protocol-fixture tests passed: 2 children and30 children per project, pagination, click-to-detail/progress, completed removal, isolation, unavailable state, reduced motion and complete-canvas fit. Screenshots inspected. No paid calls in this slice. This adds workstations and activity animation; subagents do not yet walk between meeting rooms, and provider events still do not supply an independent room assignment. Search remains roster-agent search. Changes uncommitted after97c91c4.

### Codex subscription provider — 2026-09-12
Codex (ChatGPT login) now available via native CLI adapter; distinct from OpenAI API. See CODEX-SUBSCRIPTION.md for setup, permissions, supported flags and verification. Core174 tests pass; authenticated Electron start/resume and UI creation/governance passed. Existing profiles require enabling codex in Admin; no automatic widening of restrictions. Native Codex subagent tracking remains pending. Changes uncommitted after f313029.

Token-saving and theme presets (2026-09-13): see docs/TOKEN-SAVING.md for opt-in TOON/retained-session behavior, comparison evidence, theme scope and limitations. Settings is accessible from launcher and project topbar.

UI priority fixes (2026-09-13): project header uses a separate primary navigation row and More disclosure, with active-page marking and Escape/outside dismissal. Removed the unmeasured Blocked count. New Agent has a keyboard-operable provider grid, internally scrolling content, fixed header/footer, dialog semantics and focus return. Fork/Reassign are visibly disabled until implemented. Desktop build and 23-screen isolated audit passed; agent creation/governance smoke passed without model calls. Remaining visual audit work is documented in D:/Projects/Trading agent/docs/APP-UI-AUDIT.md.
