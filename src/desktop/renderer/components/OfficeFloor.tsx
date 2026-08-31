import { useStore } from "../store";
import { RoomScene } from "./RoomScene";

// M11 minimal slice: a few named clickable zones reusing RoomScene's existing
// background/sprite rendering. Not the full moving-characters vision — clicking
// a zone just navigates to that room's existing view (SPEC.md M11).
const ZONES: { view: "chat" | "meeting" | "board"; label: string; sub: string }[] = [
  { view: "chat", label: "Chat Room", sub: "shared chatroom · everyone sees this" },
  { view: "meeting", label: "Meeting Room", sub: "side conversation · pick who's in it" },
  { view: "board", label: "Task Board", sub: "to do · in progress · done" },
];

export function OfficeFloor() {
  const selectedProjectId = useStore((s) => s.selectedProjectId);
  const project = useStore((s) => s.projects.find((p) => p.id === selectedProjectId));
  const { showView } = useStore.getState();

  if (!project) {
    return (
      <div className="viewRoot">
        <header className="rvHeader">
          <button className="pillBtn ghostBtn mono" onClick={() => showView("launcher")}>&larr; back</button>
        </header>
        <div className="streamEmpty" style={{ padding: 20 }}>No project selected.</div>
      </div>
    );
  }

  return (
    <div className="viewRoot">
      <header className="rvHeader">
        <button className="pillBtn ghostBtn mono" onClick={() => showView("room")}>&larr; back</button>
        <span className="rvName">{project.name}</span>
        <span className="dim mono" style={{ fontSize: 10.5 }}>Office floor</span>
      </header>
      <div className="officeFloor">
        {ZONES.map((z) => (
          <div key={z.view} className="floorZone" onClick={() => showView(z.view)}>
            <RoomScene agents={project.agents} />
            <div className="floorZoneLabel">
              <span className="floorZoneName">{z.label}</span>
              <span className="dim mono" style={{ fontSize: 10 }}>{z.sub}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
