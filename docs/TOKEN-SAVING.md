# Token saving and theme presets — 2026-09-13

## Decision

TOON 4.1.1 is the best fit for this first optional Agent Room integration. Its MIT-licensed TypeScript package installs and builds inside the existing Node/Electron app without a Python service, native proxy, credential routing or provider-specific configuration. This is an integration-fit decision, not a claim that TOON wins every workload.

Headroom 0.37.0 MCP dependencies resolve on this Windows/Python environment in a dry run. No Headroom service was installed or provider configuration changed. It remains a broader future pilot: on-demand MCP calls do not intercept all inputs, and temporary original-data storage is insufficient for durable evidence. RTK 0.42.4 is already present, but is specialized for coding command output. Serena and LLMLingua were documentation comparisons only.

## Implemented option

Settings → Save tokens (experimental), off by default. A main-process validated boolean persists in the existing admin configuration. Legacy configurations normalize missing or invalid values to false. New tasks pick up the setting.

- For eligible app-managed data, serialize JSON using TOON only after exact decode equality succeeds and the complete text, including its reading guide, is at least 20% smaller in bytes. Eligibility requires a table of at least 20 uniform primitive-valued rows and a JSON payload of at least 2 KiB, no more than 512 KiB. Errors fall back to original JSON. The byte gate is not a provider token meter.
- For Claude, Cursor and Codex retained sessions, send the newest capability result rather than replaying earlier results already in the session. Explicit retained-session knowledge is required; a session ID alone is insufficient. HTTP/OpenRouter providers retain the full app-managed context. Missing CLI sessions use full context.
- Skill content, capability catalogues, user/system instructions, stored evidence, agent output and artifacts are not rewritten. Ordinary prose and unsupported data remain unchanged.
- Workflow shared context can use compact tables before the existing prompt size limit. A TOON table is used only if the full table fits; it is never cut mid-row. Existing JSON context limits still apply otherwise.
- Native CLI file/tool traffic, arbitrary custom project prompts, and project integrations replacing the shared context prompt are outside this option. No promise of lower subscription quota consumption.

## Evidence

Pinned local serializer comparison with js-tiktoken 1.0.21, o200k_base, including the TOON reading guide:

| Synthetic payload | JSON tokens | TOON tokens | Reduction |
|---|---:|---:|---:|
| 120 quote rows | 5,644 | 4,135 | 26.7% |
| 60 news rows | 1,864 | 1,311 | 29.7% |
| 30 rows with escaping and Unicode | 1,053 | 832 | 21.0% |

Small/nested examples and log prose became larger under unconditional TOON conversion, supporting the narrow eligibility and fallback. All six sample serializations round-tripped. Local tokenizer counts are not billed usage and do not represent every provider tokenizer.

One paired Claude Haiku subscription smoke test used 40 synthetic rows. JSON and TOON both returned the exact negative-price symbol, price, evidence ID, NOT-approved symbol and missing-volume symbol. Tools were disabled; the CLI budget was capped at $0.20 per call. Observed durations were about 24s and 12s respectively, but a single sequential cold/warm pair cannot establish a latency advantage. It is not the full 12-task/three-repeat benchmark from CONTEXT-TOOLS-EVALUATION.md. Broader accuracy, retrieval/retry, cache and provider billing comparisons remain future work. Keep the option experimental and off by default.

Raw local evidence: `delegation/context-pilot/results.json`, `quality-results.json`, `quality-log.txt`, and `delegation/headroom-install-report.json`. No repository code was sent to the model for the synthetic smoke test.

## Themes

Organic, Slate and Ocean presets; global light/dark mode. Settings holds an app default and optional project-specific preset. Projects can inherit the app default. Choices persist locally on this device. Settings/launcher use the app preset, and project workspaces use their override. Presets affect shared UI colour tokens; fixed illustrations and custom agent-created artifacts retain their own artwork/style. Full theme editing and System mode remain future scope.

## Sources

- https://github.com/toon-format/toon
- https://docs.headroomlabs.ai/docs/mcp
- https://github.com/rtk-ai/rtk

## Next

Broader paired quality evaluation across selected providers before promoting token saving beyond experimental. Evaluate RTK command hooks separately. Evaluate Headroom on durable app-owned originals, preserving official subscription paths. Add provider-reported whole-run token/cache accounting before displaying measured savings. Theme editor and additional per-project appearance settings are future scope.

## Validation completed
Full build and 182 automated tests passed. The final desktop build and isolated Electron/Playwright checks passed after checkbox responsiveness and accessible-name fixes: default-off migration, invalid-input rejection, toggling, restart persistence, light/dark mode, app/project isolation and inheritance. No renderer page errors. Local screenshots: D:/Projects/Trading agent/delegation/token-theme-settings.png and token-theme-light.png. Original provider integrations and unrelated workspace changes remain uncommitted; no commit or push was performed in this slice.
