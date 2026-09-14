# Office routing and delegated providers

Implemented 2026-09-13 in the desktop host.

## Furniture-aware movement
The floor uses an explicit map of desks, chairs, tables, plants, cabinets and wall footprints. Wall gaps define studio and conference-room doors. A* finds a walkable route on a 16px grid with 10px foot clearance; line-of-sight smoothing checks every segment against the expanded obstacles. Geometry is independent of camera zoom/panning. Own-seat chair footprints allow departure/arrival; other chairs remain obstacles. Interrupted motion starts at the actual rendered position. Previous room geometry is retained when needed for departures.

Obstacle grids are rasterized directly and cached with a bounded cache. Navigation rejects maps above 250,000 grid points. If a destination is blocked or unreachable, the avatar updates position without a walking animation and exposes a route-unavailable tooltip; it does not draw a path through obstacles or delay execution. Reduced motion and hidden windows also place agents immediately.

These are authored collision footprints for the current cutaway scene, not automatic image segmentation. Future artwork/geometry changes must update this map. Dynamic agent-agent collision avoidance is not implemented; people may share walkways. Runtime state remains authoritative.

## Native delegated-agent support
- Claude: existing Task/Agent and system task lifecycle events retained.
- Codex: exec JSONL collab_tool_call items; sender/receiver thread IDs identify children. Child agents_states controls completion, not the tool-call completion flag. Explicit send_input follow-ups can reactivate a child, while duplicate observed follow-ups cannot resurrect a completed child.
- Cursor: streamed taskToolCall start/result events. Explicit success/error maps to completed/failed. Background acknowledgements remain running; without later completion evidence, parent stream end produces Status unavailable. Shell Task helpers and ordinary shell tools are excluded.

Records are scoped by project, parent, provider and session; remain bounded/in-memory; and feed the same inspector and temporary workstation UI. This does not add native delegation to HTTP providers. Cursor background notifications absent from stream-json are not fabricated or inferred from a parent result.

Protocol evidence: Codex upstream exec event types, https://github.com/openai/codex/blob/main/codex-rs/exec/src/exec_events.rs (CollabToolCallItem, CollabAgentState). Cursor installed version 2026.08.25-3e8eec8: index.js TaskArgs/TaskResult/TaskSuccess/TaskToolCall schemas and 6201.index.js streamed started/completed serialization. General Cursor output documentation: https://docs.cursor.com/en/cli/reference/output-format . No credential files were read.

## Verification
189 automated tests pass with the full desktop build. Navigation exercises all 30 desks to both sides of three rooms, checks every path segment, tests blocked doors/targets and retargeting. Protocol tests cover provider isolation, successful/failed/background children, late events and Codex follow-ups.
Electron checks passed for actual session movement/return, concurrent session cleanup, camera navigation and 30-child workstation pagination/focus. Codex and Cursor lifecycle events were run through actual desktop provider wiring using local fixture child processes substituted only by the test bootstrap. These are not authenticated live-provider runs. No model calls were charged. Existing Claude protocol desktop regression also passes.
