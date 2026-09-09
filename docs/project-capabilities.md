# Reusable project capabilities

Agent-room remains domain-neutral. Projects own their business logic and user interfaces. The application supplies reusable model adapters, a shared run context and a generic project-dashboard link.

## Shared run context

Import `RunContext` from `agentic-controlroom/context`. Give each workflow run a unique directory and one writer. Any stage can read prior artifacts; adding an artifact never updates or replaces its parents.

```ts
import { RunContext } from 'agentic-controlroom/context';
const context = new RunContext('.data/runs/my-run/context');
const input = context.add({
  type: 'source', producer: 'collector', key: 'document-1',
  data: { text: 'Source material', fetchedAt: new Date().toISOString() }, parents: [],
});
const finding = context.add({
  type: 'finding', producer: 'reviewer', key: 'document-1',
  data: { summary: 'Reviewed source material' }, parents: [input.id],
});
context.get(finding.id);
context.list('source');
context.latest('finding', 'document-1');
```

Each artifact records type, producer, key, timestamp, revision, data and parent IDs. SHA-256 identifiers verify content on reload. Readers receive copies. Unknown parents, invalid identifiers, oversized artifacts and corrupt stored content are rejected. The store permits up to 10,000 artifacts of at most 4 MiB each per run; it is not a multi-writer database or a secrets vault. A project should keep credentials out of artifacts and enforce its own access policy. It is portable across domains and survives process restarts.

The existing generic `runGraph` also accepts `{ context }` in its options. Agent prompt builders and gate functions access it through `state.context`, so one stage can append validated records and every later stage can read those same versions. Existing callers that omit it behave as before. The graph is exported through `agentic-controlroom/graph`.

## HTTP model adapters

Import `createHttpBackend` from `agentic-controlroom/http-backend`. It implements the existing `AgentBackend` contract, so different workflow nodes may use different instances.

```ts
import { createHttpBackend } from 'agentic-controlroom/http-backend';
const analyst = createHttpBackend({
  provider: 'openai', model: 'your-available-model-id',
  keyEnv: 'OPENAI_API_KEY', maxTokens: 1200, timeoutMs: 60000,
}, { OPENAI_API_KEY: process.env.OPENAI_API_KEY });
const result = await analyst.start(
  { id: 'analyst', name: 'Analyst', systemPrompt: 'Review the supplied data.' },
  JSON.stringify(context.list('source')),
);
```

Providers: OpenAI, Anthropic, Gemini, OpenRouter and local Ollama. HTTP endpoints are fixed, calls are text-only, and model names are explicit. Key names must match their provider, optionally suffixed for multiple accounts (`OPENAI_API_KEY_RESEARCH`). The caller decides which environment entries to supply; the adapter does not read the host environment. Response/input limits, cancellation deadlines and sanitized HTTP errors are built in. Usage counts are returned when supplied by the provider; cost is unknown. Existing coding CLI backends and their configuration remain unchanged.

Package exports also expose `agentic-controlroom/backend` (types) and `agentic-controlroom/chat-log`. Build agent-room before using these exports from another local project.

## Project dashboards

A project may include `agent-room.project.json`:

```json
{"dashboard":{"label":"Project dashboard","url":"http://127.0.0.1:4318"}}
```

After selecting that project, the top bar shows the declared label. Clicking opens a native agent-room desktop window, reusing the existing window for that project. Dashboard windows are sandboxed, have no Node or preload access, and block navigation to other origins and popups. Start the project's server separately. Agent-room does not run arbitrary manifest commands or contain project-specific routes. URLs must be local HTTP on 127.0.0.1 with a non-privileged port; credentials, remote hosts and non-HTTP schemes are rejected.

The Indian market research project demonstrates these capabilities, but no trading collector, role, risk rule or dashboard component is part of the agent-room source.
