# Shared agent views and virtual office

All desktop model-backed agents receive the shared capability catalogue and can discover skills and publish or update isolated HTML views. Views render in conversations and can open in app tabs, separate previews or a browser. Workflow presentations preserve raw replies and validate domain data before publishing. The catalogue distinguishes provider-managed MCP configuration from verified app tools; native MCP discovery/execution is not implemented.

The project office shows the actual roster, supports search and fit/zoom, and opens agent details and existing room views. Meeting, debate and planning lifecycle events drive project/session-scoped room occupancy. Concurrent sessions have separate stable room positions while the view is mounted. Agent home desks persist in this desktop profile across restarts and roster changes. Vector furniture is separate from agent controls; reduced motion is supported.

Current limits: live room layouts and preview tabs are not persisted, home slots do not sync across machines, and subagent visualization, full obstacle-aware movement and advanced character artwork remain future work. Manual terminals and standalone extension/CLI entrypoints are outside the common desktop capability wrapper. The office artwork is a simplified vector implementation, not the full cutaway concept.

Verification for this change: full build and151 core tests pass, including an isolated snapshot containing only staged files. Electron checks cover generic visual publishing/update and isolation; a12-agent/14-step trading fixture;12/30-agent office search and fit; actual session orchestration with simulated model responses; planning failure cleanup; project isolation; reduced motion; and desk persistence across restart. No authenticated trading analysis or broker execution is implied by fixture results.

## Cutaway office, results and preferences

The floor uses a generated continuous cutaway studio with real roster controls. Additional rosters extend in twelve-desk wings. Meeting/planning/debate presence remains sourced from session events. Office routes now use desk aisles, a central corridor and room approach points; pure tests check orthogonal segments, reverse travel, an additional wing, table clearance for the tested seat and distance-based animation offsets. This is authored route geometry, not a general collision/navigation mesh.

Office settings save studio/room names and label visibility per project in profile-local storage. Results wall lists project artifacts with app/browser preview actions and real child-workflow records linked to their parent. Refresh fetches current records; the wall does not claim native CLI subagent visibility. Minimized artifact tabs reserve vertical room so office controls remain usable.

Verification:154 core tests, desktop fit12/30, project preferences reload/isolation, meeting movement/reduced motion, concurrent rooms/planning cleanup, agent publish/update and nested-workflow results tests. Test models are simulated locally. The final artwork is assets/office/cutaway-studio.png, generated with the built-in image tool. Characters remain simpler than the original concept; customizable geometry, native subagent presence, full lounge composition and freeform obstacle avoidance are not complete.
