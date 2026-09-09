# Project workflows: first implementation

Use the original desktop app in D:\Projects\agent-room, branch feat/project-agent-runtime. Restart it after building, open a project, and choose **workflows & artifacts**.

New local and cloned projects start without agents. An intentionally empty roster stays empty after reload. Existing saved agents are preserved because old data does not distinguish automatically inserted agents from deliberately configured teams.

Add agents using the existing **+ agent** and **+ team** controls. The room Run action uses the saved project workflow, or runs the current project team once in roster order when no workflow is saved. It no longer silently invokes Developer and QA.

In Workflow, arrange agent steps or add a child workflow, save, enter the task, and run. Fixture mode uses clearly labelled synthetic replies and makes no external model calls. Activity and output appear in the existing room. Runs and child relationships persist under .agentic-controlroom/runs. Cancellation waits for an in-flight backend call to settle before releasing the project. On startup, unfinished snapshots become interrupted; automatic resume/replay is not implemented.

Agent Settings supports a provider/model override per agent. Credentials are environment variable names, not secret values. Add values through the existing project secrets/account facilities. Existing administrator allowlists remain in force; previously configured installations may need new HTTP providers enabled in Admin. Choosing a provider while adding an agent no longer changes the entire project's default provider.

Artifacts contains generated workflow reports and any dashboard declared by the project's existing dashboard manifest. Reports can open in the app or via the system's HTML browser association. In-app report previews have no Node or preload access and block navigation/popups. Dashboard previews use the existing sandboxed local dashboard window. Images and arbitrary file formats can be registered by the library but are not yet supported by the desktop preview.

Shared context stores full input and step outputs with provenance. Model prompts include a bounded context excerpt; the full persisted records are included in the report. Child findings are returned to the parent context. This is a bounded sequential workflow/child-workflow foundation, not yet the full conditional workflow editor or a general model-driven tool-calling framework.

## Verified

- Original and isolated desktop builds pass.
- 57 affected regression tests pass, including existing graph/provider/context behavior and 20 new runtime/artifact tests.
- Playwright against the original Electron build: create project through native picker IPC, empty roster, create two custom agents through UI, save a parent/child workflow, complete a fixture run, see room output, open report in app, set different per-agent providers, reload, and remove the last agent without defaults reappearing. No renderer page errors.
- The directory picker is simulated in the test; projects and agents are created through actual application handlers and controls. Test profiles and project data are isolated from real user projects.
- Live credential-dependent model calls, market migration, live orders, and automatic dashboard-service startup are not claimed tested or complete.

## Remaining approved work

Migrate the market collectors/validation and all model turns into the room-managed workflow; integrate its scheduling/service lifecycle; make trading research an optional project template. Add explicit tools and conditional routing to the desktop editor, full resume semantics, broader artifact previews and runtime-spawned delegation. The original market service still owns its research loop until that migration is completed.
