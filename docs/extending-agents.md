# Giving an agent a custom capability

`agent-room` has no plugin system to build — the two mechanisms below already exist end-to-end, with a UI
field for each. This doc just writes down how to use them.

## Option 1 — a script, driven by instructions (most general, works with any API)

Any script in any language, hitting any API (a REST endpoint, a CLI tool, a local file, whatever). The agent
runs it via the CLI backend's own Bash tool when the instructions say to.

1. Write the script. It can do anything — fetch data, post data, call a third-party API.
2. Write a short skill file (markdown) next to it describing what it does and exactly how to invoke it —
   e.g. "run `python scripts/bitbucket_pr.py <pr-id>` to fetch a PR's diff as JSON."
3. Add that skill's id to the agent's `skillIds`.
4. That's it. `appendSkills()` (`src/desktop/main.ts:252`) reads the skill file's raw text and appends it to
   the agent's system prompt, verbatim. The agent reads the instructions and calls the script with Bash the
   same way it already runs tests or git commands — no special wiring, no protocol.

No structure required beyond "here's a script, here's when to use it." Good for anything one-off or where a
formal MCP server would be overkill.

## Option 2 — an MCP server (structured, typed tool calls)

For a reusable integration you want the agent to call as a proper tool (with a schema, not just "run this
command"), wire it up as an MCP server:

- **Project-wide**: drop a `.mcp.json` in the project root. The Claude Code CLI auto-discovers it for every
  agent working in that project.
- **Per-agent**: set `--mcp-config path/to/your-config.json` in that agent's **CLI flags** field
  (New Agent Modal → Advanced options — already exists, `NewAgentModal.tsx:366`, backed by `AgentRef.extraArgs`).
  Only that agent gets it.

Either way, `agent-room` never needs to know what the tool does — it just spawned a CLI process that happens
to have more tools available.

## Worked example — Bitbucket PR review agent

Say you want a QA/reviewer agent that can pull a Bitbucket PR's diff and post review comments back.

- **Script route**: write `scripts/bitbucket.py` with `fetch_pr(id)` / `post_comment(id, text)` calls against
  Bitbucket's REST API (using your own API token, stored however you'd store any secret for a script you run
  yourself). Write `skills/bitbucket-review.md` explaining the two commands. Assign that skill to the QA agent.
- **MCP route**: if a Bitbucket MCP server exists (or you write one), point that agent's CLI flags at its
  config instead. Same result, more structure.

Nothing about `agent-room`'s own code changes for either route.

## The one real gap

`src/backend/openRouterBackend.ts:7` — `extraArgs` is explicitly unused there:

```ts
extraArgs?: string[]; // unused — HTTP backend, no CLI flags.
```

OpenRouter is a raw HTTP backend, not a spawned CLI process, so neither route above works for an
OpenRouter-backed agent today. Skills-as-bash needs a CLI with its own Bash tool; MCP passthrough needs a CLI
that already speaks MCP. Neither exists for the HTTP path. Adding pluggable tools to OpenRouter-backed agents
would mean wiring function-calling manually against OpenRouter's API — separate, unscoped work, not covered by
either mechanism above.
