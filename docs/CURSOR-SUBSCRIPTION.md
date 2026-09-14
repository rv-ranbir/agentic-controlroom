# Cursor account connection

Choose **Cursor (account login)** in Agent Room. Install Cursor CLI and sign in with `cursor-agent login`. Account-authenticated runs use the Cursor account's plan and limits. Existing configured CLI API credentials can override login; Agent Room does not extract stored tokens.

The existing backend supports per-agent model selection, headless activity and exact-session resume. Use Default or a model ID supported by your account. A cached successful `status` is not proof that live authentication works; if requests say Authentication required, sign in again.

Windows launcher uses the bundled Node executable directly, with system CA trust enabled (verified bundled Node24.5). TLS verification remains enabled. Only dated release folders are eligible; updater staging directories such as dist-package are excluded. Custom launcher overrides retain their existing behavior.

Verified 2026-09-12 with real Electron: initial arithmetic response42 and resumed replyORCHID, no page errors, API-token overrides absent in isolated test environment, ask/read-only mode, account default model. Full175 tests/build passed, including staging-folder regression. Native Cursor subagent visualization is not yet wired. Changes uncommitted alongside Codex subscription integration.
