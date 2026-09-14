# Project usage and budget accounting

Milestone 2, 2026-09-15. Usage is recorded automatically for app-managed invocations. Open the project room's Activity history to see Usage, filters, exports and the existing audit timeline. Advanced protection contains optional per-run limits; zero means unlimited. Existing projects need no setup.

## Measurements
Each invocation has one attempt ID. Its terminal audit event records normalized input/output counts, cache and reasoning details, source and any supported reported charge. Summaries upsert by attempt ID, retain failed-call measurements when supplied and show missing measurements as unknown. Estimates never inflate measured totals. Start and resume are measured independently below the capability loop.

The figures cover retained project history (five 5 MiB audit files), not lifetime usage or subscription quota. The screen renders up to 200 attempts; exports include all matching retained attempts. Agent/model/run filters are exact. Tool calls have no reliable model attribution, so model filters exclude them. Latency sums measured invocation durations; it is not elapsed project time. Compaction/retry overhead remains unavailable until those operations have explicit identities in later milestones.

Provider mapping was checked against primary documentation on 2026-09-14:

- [OpenAI chat response](https://developers.openai.com/api/reference/resources/chat): prompt/completion totals; cached/reasoning detail counts are not added again.
- [Anthropic caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching): input comprises uncached input plus cache reads and writes. Output is reported separately.
- [Gemini token metadata](https://ai.google.dev/gemini-api/docs/generate-content/tokens): candidates output and thinking counts stay separate, with no guessed aggregate.
- [Ollama chat](https://docs.ollama.com/api/chat): prompt_eval_count/eval_count and optional cached prompt count.
- [Codex noninteractive output](https://learn.chatgpt.com/docs/non-interactive-mode): terminal turn usage; ChatGPT authentication is verified by the existing adapter. A CLI invocation may contain multiple internal model calls.
- [Claude programmatic usage](https://code.claude.com/docs/en/headless): terminal result usage; client-side cost estimates are deliberately not represented as actual charges. Failed result objects retain safe usage. CLI authentication/billing mode remains unknown here.
- [Cursor output format](https://cursor.com/docs/cli/reference/output-format): documented terminal results do not expose normalized token usage, so counts remain unknown.
- [OpenRouter accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting): reported cost is kept in credits, distinct from USD and subscription quotas. No price estimates or additional billing requests are made.

## Budgets and recovery
Each root run owns a shared pool for its app-dispatched invocations and children. Calls and concurrency are reserved before dispatch; settled, failed and cancelled calls remain spent. A failed audit write before dispatch refunds the unused reservation. Reservations remain active until actual settlement, including when a stop has been requested. Child limits cannot expand inherited limits.

The stop deadline requests cancellation and prevents future dispatch. Native tracked processes are interrupted when supported; HTTP and other in-flight calls may settle later. This is not an OS-enforced wall-time boundary. Token/cost reservation is unavailable: providers differ in metering, and there is no shared enforceable per-run output-cap contract yet. Configured HTTP per-call output limits remain in place.

Durable attempt-started/settled events expose unresolved attempts after restart. Reusing a previously dispatched run ID is rejected rather than silently resetting its budget or replaying work. The standalone budget recovery contract preserves spent calls, original deadline and unresolved concurrency until explicit reconciliation. The desktop does not automatically resume interrupted runs. Interactive terminals and native-provider internal tools remain outside this accounting.

## Logs and exports
Main-process handlers resolve registered project ownership; callers cannot provide arbitrary log paths. JSON exports include the filtered safe audit events and usage records; CSV exports include invocation rows and escape spreadsheet formula prefixes. Export buttons use the native desktop save dialog; the renderer cannot supply an arbitrary destination path. Prompts, responses, raw provider errors and credentials are excluded. Tool results may contribute only a validated artifact UUID; Open artifact uses the existing project-owned preview tabs.

## Validation
Full build and 236 automated tests passed. Tests cover normalization, unknown/estimated measurements, replay, failed responses, persisted totals, project filters, shared child budgets, recovery, cancellation and pre-dispatch failures. Desktop acceptance uses isolated profiles, local Ollama-shaped HTTP responses and a historical Codex protocol fixture; native fixture checks exercise actual local Codex/Cursor process adapters. These do not establish authenticated live-provider billing or OS isolation. Final desktop checks passed: 900px usage/filter/restart and actual JSON save-button export, existing activity/workflow/cancellation regression, and two-turn native Codex/Cursor usage fixtures. Zero paid provider calls. Evidence: delegation/usage-desktop-final.txt, usage-activity-final.txt, usage-native-final.txt and usage-final-tests.txt in the planning workspace.
