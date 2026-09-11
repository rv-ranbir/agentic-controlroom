import { OfficeSettings, readOfficePreferences } from "./OfficeSettings";
import { OfficeResultsWall } from "./OfficeResultsWall";
import { officeRoute, routeFrames } from "../../officeRoutes";
import { OfficeCharacter } from "./OfficeCharacter";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { useOfficePresence } from "../lib/useOfficePresence";
import { useOfficeHomes } from "../lib/useOfficeHomes";
import { buildRooms, agentRoomMap, createOfficeLayoutState, type RoomKind } from "../../officeLayout";
import { RoomFloor, Whiteboard, HeadChair, UpholsteredChair } from "./OfficeIllustration";
import "./OfficeFloor.css";

const statusLabel = (state: string) => ({ working: "Working", done: "Completed", needs: "Needs input", idle: "Idle" }[state] ?? state);

const ROOM_BASE_LABEL: Record<RoomKind, string> = { meeting: "Meeting", debate: "Boardroom", planning: "Strategy" };
const ROOM_SHAPE: Record<RoomKind, "oval" | "rect"> = { meeting: "oval", debate: "rect", planning: "oval" };
const ZONE_LOCATION_LABEL: Record<RoomKind, string> = { meeting: "Meeting room", debate: "Boardroom", planning: "Strategy room" };

// ── spatial layout (px, unscaled canvas units) ──────────────────
const DESK_COLS = 4;
const DESK_CELL_W = 214;
const DESK_CELL_H = 282;
const ZONE_PAD = 26;
const CORRIDOR_H = 144;
const ROOM_GAP = 22;
const SEAT_W = 160;
const SEAT_H = 190;
const SEAT_COLS = 2;
const ROOM_HEADER_H = 46;
const ROOM_MIN_SEAT_SLOTS = 2; // a room reads as a room even with nobody in it
const ROOM_WIDTH = 416;

// Low enough that a full 30-agent roster spread across many concurrent rooms
// still fits a small viewport in fit mode / manual zoom-out.
const ZOOM_MIN = 0.08;
const ZOOM_MAX = 1.6;
const ZOOM_STEP = 0.15;
const READABLE_ZOOM = 0.6;

const PALETTE_VARS = ["--i0", "--i1", "--i2", "--i3", "--i4", "--i5", "--i6", "--i7"];

// Deterministic per-project accent (same hashing idea as lib/agents.ts's
// colorFor, but seeded from the project so each room reads as its own place).
function paletteVar(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return `var(${PALETTE_VARS[Math.abs(h) % PALETTE_VARS.length]})`;
}

interface Point { x: number; y: number }

function deskHome(index: number): Point {
  const col = index % DESK_COLS;
  const row = Math.floor(index / DESK_COLS);
  return { x: 142 + col * DESK_CELL_W, y: 218 + (row % 3) * DESK_CELL_H + Math.floor(row / 3) * 1024 };
}

function roomSeatAnchors(count: number, originX: number, originY: number): Point[] {
  const slots = Math.max(count, ROOM_MIN_SEAT_SLOTS);
  const anchors: Point[] = [];
  for (let i = 0; i < slots; i++) {
    const col = i % SEAT_COLS;
    const row = Math.floor(i / SEAT_COLS);
    anchors.push({ x: originX + (col ? 310 : 50), y: originY + 140 + row * SEAT_H });
  }
  return anchors;
}

function roomHeight(count: number): number {
  const slots = Math.max(count, ROOM_MIN_SEAT_SLOTS);
  const rows = Math.ceil(slots / SEAT_COLS);
  return Math.max(320, ROOM_HEADER_H + rows * SEAT_H + ZONE_PAD);
}

function reducedMotionPreferred(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function RoomFurniture({ top, left, width, height, label, seatCount, accent, shape, kind, sessionId, artRow, onOpen }: {
  top: number;
  left: number;
  width: number;
  height: number;
  label: string;
  seatCount: number;
  accent: string;
  shape: "oval" | "rect";
  kind: RoomKind;
  sessionId: string | null;
  artRow: number;
  onOpen: () => void;
}) {
  const slots = Math.max(seatCount, ROOM_MIN_SEAT_SLOTS);
  const rows = Math.ceil(slots / SEAT_COLS);
  // chairs are room furniture (a baseline capacity), not a claim that an agent occupies each one
  const chairs: Point[] = [];
  for (let i = 0; i < slots; i++) {
    const col = i % SEAT_COLS;
    const row = Math.floor(i / SEAT_COLS);
    chairs.push({ x: col * SEAT_W + SEAT_W / 2, y: ROOM_HEADER_H + row * SEAT_H + SEAT_H / 2 });
  }
  const tableX = width / 2;
  const tableY = ROOM_HEADER_H + (rows * SEAT_H) / 2;
  return (
    <div className="osZone osRoom osCutawayRoom" style={{ top, left, width, height, borderColor: accent }} data-session-id={sessionId ?? undefined} data-office-zone={kind}>
      <button type="button" className="osZoneLabel osZoneLabelBtn mono" style={{ color: accent }} onClick={onOpen} title={`Open ${label}`}>{label}</button>
      <div className="osMeetingArt" style={{backgroundPosition:`-1120px -${artRow * 342}px`, height:320, transform:`scaleY(${height / 320})`, transformOrigin:"top"}} aria-hidden="true" />
      <span className="osRoomOccupancy">{seatCount ? `${seatCount} participating` : "Available"}</span>
      <svg className="osRoomSvg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        <RoomFloor width={width} height={height} kind={kind} />
        {kind === "planning" && <Whiteboard x={26} y={48} width={width - 52} />}
        {shape === "oval" ? (
          <ellipse cx={tableX} cy={tableY} rx={Math.min(width * 0.32, 90)} ry={Math.min(rows * SEAT_H * 0.28, 46)} className="osTable" />
        ) : (
          <rect
            x={tableX - Math.min(width * 0.34, 100)}
            y={tableY - Math.min(rows * SEAT_H * 0.24, 30)}
            width={Math.min(width * 0.68, 200)}
            height={Math.min(rows * SEAT_H * 0.48, 60)}
            rx={6}
            className="osTable"
          />
        )}
        {chairs.map((c, i) => <UpholsteredChair key={i} x={c.x} y={c.y} />)}
        {kind === "debate" && <HeadChair x={tableX} y={tableY - Math.min(rows * SEAT_H * 0.24, 30) - 16} />}
      </svg>
    </div>
  );
}

export function OfficeFloor() {
  const selectedProjectId = useStore((s) => s.selectedProjectId);
  const project = useStore((s) => s.projects.find((p) => p.id === selectedProjectId));
  const agentStates = useStore((s) => s.agentStates);
  const messages = useStore((s) => s.messages);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const { showView, selectAgent } = useStore.getState();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preferences, setPreferences] = useState(() => readOfficePreferences(selectedProjectId ?? ""));
  const [resultsOpen, setResultsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [zoom, setZoom] = useState(1);
  const [fitMode, setFitMode] = useState(true);
  const [wrapSize, setWrapSize] = useState({ width: 0, height: 0 });
  const [motionReduced, setMotionReduced] = useState(reducedMotionPreferred);

  const sessions = useOfficePresence(selectedProjectId);

  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  const anchorRef = useRef(new Map<string, Point>());
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const [motionPaused, setMotionPaused] = useState(document.hidden);
  useEffect(() => {
    const update = () => {
      setMotionPaused(document.hidden);
      if (document.hidden) for (const el of itemRefs.current.values()) {
        el.getAnimations().forEach((animation) => { if (animation.playState === "running") animation.finish(); });
        delete el.dataset.walking;
      }
    };
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  const layoutState = useMemo(() => createOfficeLayoutState(), [selectedProjectId]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setMotionReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Real viewport size, not a guess — drives fit-to-screen and recomputes on
  // panel resize (e.g. the inspector opening/closing) or window resize.
  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const box = entry.contentBoxSize?.[0];
      const width = box ? box.inlineSize : entry.contentRect.width;
      const height = box ? box.blockSize : entry.contentRect.height;
      setWrapSize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [selectedProjectId, Boolean(project?.agents.length)]);

  useEffect(() => {
    setSearch("");
    setResultsOpen(false);
    setSettingsOpen(false);
    setPreferences(readOfficePreferences(selectedProjectId ?? ""));
    setSelectedAgent(null);
    setZoom(1);
    setFitMode(true);
    // Not itemRefs — ref callbacks already ran for the new project's buttons
    // by the time this effect fires, and clearing it here would wipe those
    // entries before the movement effect below gets to use them.
    anchorRef.current.clear();
    // Fresh slot assignment for the new project — room numbering only stays
    // stable within one project's lifetime, per SPEC.
  }, [selectedProjectId]);

  const agents = useMemo(() => project?.agents ?? [], [project]);
  const agentIds = useMemo(() => agents.map((a) => a.id), [agents]);
  const rosterIds = useMemo(() => new Set(agentIds), [agentIds]);
  const slots = useOfficeHomes(selectedProjectId, agentIds);

  const homes = useMemo(() => {
    const map = new Map<string, Point>();
    agents.forEach((a) => {
      const slot = slots.get(a.id) ?? 0;
      map.set(a.id, deskHome(slot));
    });
    return map;
  }, [agents, slots]);

  const maxSlot = Math.max(0, ...slots.values());
  const deskRows = Math.max(1, Math.ceil((maxSlot + 1) / DESK_COLS));
  const deskZoneW = 976;
  const deskZoneH = Math.ceil(deskRows / 3) * 1024;
  const corridorY = deskZoneH;
  const roomsY = corridorY + CORRIDOR_H;

  // Sessions are already scoped to this project by useOfficePresence; buildRooms
  // additionally drops agent ids outside the roster and dedupes an agent that
  // (in principle) shows up in more than one concurrently active session.
  const rooms = useMemo(
    () => buildRooms(sessions, rosterIds, layoutState),
    [sessions, rosterIds, layoutState],
  );
  const reservedHeights = useMemo(() => new Map<number, number>(), [selectedProjectId]);
  const roomMap = useMemo(() => agentRoomMap(rooms), [rooms]);
  const roomHeights = rooms.map((r) => roomHeight(r.agentIds.length));
  rooms.forEach((r, i) => reservedHeights.set(r.position, Math.max(reservedHeights.get(r.position) ?? 0, roomHeights[i])));
  const roomOrigins = rooms.map((r) => ({ x: deskZoneW + CORRIDOR_H, y: Array.from({length:r.position}, (_,p) => (reservedHeights.get(p) ?? roomHeight(0)) + ROOM_GAP).reduce((a,b)=>a+b,0) }));
  const roomAnchors = rooms.map((r,i) => roomSeatAnchors(r.agentIds.length, roomOrigins[i].x, roomOrigins[i].y));
  const canvasWidth = deskZoneW + CORRIDOR_H + ROOM_WIDTH;
  const canvasHeight = Math.max(deskZoneH, ...rooms.map((r,i) => roomOrigins[i].y + roomHeights[i]));

  // Fit the complete floor on both axes; manual zoom keeps native scrolling.
  const fitScale = wrapSize.width > 0 && wrapSize.height > 0
    ? Math.max(0.01, Math.min(1, (wrapSize.width - 2) / Math.max(canvasWidth, 1), (wrapSize.height - 2) / Math.max(canvasHeight, 1))) : 1;
  const effectiveZoom = fitMode ? fitScale : zoom;

  function anchorFor(agentId: string): { point: Point; zone: "home" | RoomKind; sessionId: string | null } {
    const room = roomMap.get(agentId);
    if (!room) return { point: homes.get(agentId) ?? { x: ZONE_PAD, y: ZONE_PAD }, zone: "home", sessionId: null };
    const idx = rooms.indexOf(room);
    const seatIdx = room.agentIds.indexOf(agentId);
    return { point: roomAnchors[idx][seatIdx], zone: room.kind, sessionId: room.sessionId };
  }

  // Route agents through the central corridor whenever
  // their session anchor changes. First mount and reduced-motion snap instead —
  // no fake "walk in" on entry, no animation when the user asked for none.
  useEffect(() => {
    const corridorMidX = deskZoneW + CORRIDOR_H / 2 - 48;
    for (const agent of agents) {
      const el = itemRefs.current.get(agent.id);
      const home = homes.get(agent.id);
      if (!el || !home) continue;
      const { point: anchor } = anchorFor(agent.id);
      const prev = anchorRef.current.get(agent.id);
      const dx = anchor.x - home.x;
      const dy = anchor.y - home.y;
      if (!prev) {
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        anchorRef.current.set(agent.id, anchor);
        continue;
      }
      if (prev.x === anchor.x && prev.y === anchor.y && !motionReduced) continue;
      const matrix = new DOMMatrixReadOnly(getComputedStyle(el).transform);
      const current = { x: matrix.m41, y: matrix.m42 };
      el.getAnimations().forEach((animation) => animation.cancel());
      delete el.dataset.walking;
      if (motionReduced) {
        el.style.transform = `translate(${dx}px, ${dy}px)`;
      } else {
        const from = {x:home.x+current.x,y:home.y+current.y};
        const points=officeRoute(from,anchor,rooms.map((r,i)=>({...roomOrigins[i],height:roomHeights[i]})));
        el.dataset.walking = "true";
        const animation = el.animate(routeFrames(points,home), {duration:1200,easing:"linear",fill:"forwards"});
        animation.onfinish = () => {
          delete el.dataset.walking;
          el.style.transform = `translate(${dx}px, ${dy}px)`;
          animation.cancel();
        };
      }
      anchorRef.current.set(agent.id, anchor);
    }
  }, [rooms, agents, homes, deskZoneW, motionReduced]);

  // Bring the selected agent into view at a readable zoom, whether selected via
  // search-Enter or a direct click — never leaves it too small to read.
  useEffect(() => {
    if (!selectedAgent) return;
    if (effectiveZoom < READABLE_ZOOM) {
      setFitMode(false);
      setZoom(READABLE_ZOOM);
    }
    const raf = requestAnimationFrame(() => {
      itemRefs.current.get(selectedAgent)?.scrollIntoView({ behavior: motionReduced ? "auto" : "smooth", block: "center", inline: "center" });
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgent]);

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

  const term = search.trim().toLowerCase();
  const matchedAgents = term ? agents.filter((a) => a.name.toLowerCase().includes(term)) : agents;
  const matchedIds = new Set(matchedAgents.map((a) => a.id));

  const selectedAgentData = agents.find((a) => a.id === selectedAgent);
  const recentMessage = selectedAgentData ? messages.filter((m) => m.agentId === selectedAgentData.id).pop() : null;
  const selectedAgentState = selectedAgentData ? (anchorFor(selectedAgentData.id).zone === "planning" ? "Planning" : statusLabel(agentStates[selectedAgentData.id] ?? "idle")) : null;
  const selectedAnchor = selectedAgentData ? anchorFor(selectedAgentData.id) : null;
  const selectedZone = selectedAnchor?.zone ?? "home";
  const selectedLocationLabel = selectedZone === "home" ? "At desk" : preferences[selectedZone];

  const handleAgentClick = (agentId: string) => setSelectedAgent(agentId);

  const handleNavigateToRoom = (room: "meeting" | "planning" | "debate" | "board" | "workflows") => showView(room);

  const accent = paletteVar(project.id);

  return (
    <div className="viewRoot">
      <header className="rvHeader">
        <button className="pillBtn ghostBtn mono" onClick={() => showView("room")}>&larr; back</button>
        <span className="rvName">{project.name}</span>
        <span className="dim mono" style={{ fontSize: 10.5 }}>Office</span>
        <span className="dim mono rvHeaderStats">{agents.length} agent{agents.length === 1 ? "" : "s"} · {sessions.length} active session{sessions.length === 1 ? "" : "s"}</span>
      </header>
      {settingsOpen && <OfficeSettings key={project.id} projectId={project.id} preferences={preferences} onSave={setPreferences} onClose={()=>setSettingsOpen(false)} />}
      <div className="officeStudio" data-labels={preferences.labels} data-motion-paused={motionPaused}>
        <div className="osWorkspace">
          <div className="osGrid">
            <div className="osGridTop">
              <input
                type="text"
                className="osSearch"
                aria-label="Search agents"
                placeholder="Search agents…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  const first = matchedAgents[0];
                  if (!first) return;
                  setSelectedAgent(first.id);
                  itemRefs.current.get(first.id)?.scrollIntoView({ behavior: motionReduced ? "auto" : "smooth", block: "center", inline: "center" });
                }}
              />
              <button id="office-settings-trigger" className="pillBtn ghostBtn" onClick={()=>setSettingsOpen(true)}>Office settings</button>
              <span className="osGridCount dim mono">{matchedAgents.length} / {agents.length}</span>
              <button
                type="button"
                className={`pillBtn ghostBtn mono osFitBtn ${fitMode ? "on" : ""}`}
                onClick={() => setFitMode(true)}
                aria-label="Fit office"
                aria-pressed={fitMode}
                title="Fit the whole office to the viewport"
              >
                Fit office
              </button>
              <div className="osZoomControls" role="group" aria-label="Zoom">
                <button type="button" className="pillBtn ghostBtn mono osZoomBtn" onClick={() => { setFitMode(false); setZoom((z) => Math.max(ZOOM_MIN, +((fitMode ? fitScale : z) - ZOOM_STEP).toFixed(2))); }} aria-label="Zoom out">−</button>
                <button type="button" className="pillBtn ghostBtn mono osZoomBtn" onClick={() => { setFitMode(false); setZoom(1); }} aria-label="Reset zoom">{Math.round(effectiveZoom * 100)}%</button>
                <button type="button" className="pillBtn ghostBtn mono osZoomBtn" onClick={() => { setFitMode(false); setZoom((z) => Math.min(ZOOM_MAX, +((fitMode ? fitScale : z) + ZOOM_STEP).toFixed(2))); }} aria-label="Zoom in">+</button>
              </div>
            </div>
            <div className="osGridArea">
              {agents.length === 0 ? (
                <div className="osEmpty">No agents in this project.</div>
              ) : (
                <div className="osCanvasWrap" ref={canvasWrapRef}>
                  {term && matchedAgents.length === 0 && (
                    <div className="osNoMatch" role="status">No agents match &ldquo;{search.trim()}&rdquo;.</div>
                  )}
                  <div className="osCanvasSizer" style={{ width: canvasWidth * effectiveZoom, height: canvasHeight * effectiveZoom }}>
                    <div className="osCanvas" style={{ width: canvasWidth, height: canvasHeight, fontSize: `${12 / Math.max(0.3, effectiveZoom)}px`, transform: `scale(${effectiveZoom})` }}>
                      <div className="osStudioArchitecture" style={{width:deskZoneW,height:canvasHeight}} aria-hidden="true" />
                      <div className="osVerticalCorridor" style={{left:deskZoneW,width:CORRIDOR_H,height:canvasHeight}} aria-hidden="true" />
                      {Array.from({length:deskRows},(_,row)=><div key={row} className="osStudioDoor" style={{left:950,top:290+(row%3)*282+Math.floor(row/3)*1024}} aria-hidden="true"/>)}
                      <div className="osStudioTitle">{preferences.studio} <span>{agents.length} agents · {project.name}</span></div>
                      {rooms.map((room, i) => (
                        <RoomFurniture
                          key={room.sessionId ?? `${room.kind}-empty`}
                          top={roomOrigins[i].y} left={roomOrigins[i].x} width={ROOM_WIDTH} height={roomHeights[i]}
                          label={room.sessionId ? `${preferences[room.kind]} ${room.slot + 1}` : preferences[room.kind]}
                          seatCount={room.agentIds.length}
                          accent={accent}
                          shape={ROOM_SHAPE[room.kind]}
                          kind={room.kind}
                          sessionId={room.sessionId}
                          artRow={room.position % 3}
                          onOpen={() => handleNavigateToRoom(room.kind)}
                        />
                      ))}
                      {agents.map((agent) => {
                        const state = agentStates[agent.id] ?? "idle";
                        const isSelected = selectedAgent === agent.id;
                        const isDimmed = term.length > 0 && !matchedIds.has(agent.id);
                        const home = homes.get(agent.id)!;
                        const { zone, sessionId } = anchorFor(agent.id);
                        const roomBadge = zone === "home" ? null : preferences[zone];
                        return (
                          <button
                            key={`${project.id}:${agent.id}`}
                            ref={(el) => {
                              if (el) itemRefs.current.set(agent.id, el);
                              else itemRefs.current.delete(agent.id);
                            }}
                            type="button"
                            className={`osDesk-item placed ${isSelected ? "sel" : ""} ${isDimmed ? "dim" : ""}`}
                            style={{ left: home.x, top: home.y }}
                            onClick={() => handleAgentClick(agent.id)}
                            aria-label={agent.name}
                            aria-pressed={isSelected}
                            data-office-zone={zone}
                            data-session-id={sessionId ?? undefined}
                          >
                            <div className="osDesk-visual">
                              <OfficeCharacter agentId={agent.id} working={state === "working" || zone === "planning"} />
                              {roomBadge && <span className="osBadge mono" style={{ borderColor: accent }}>{roomBadge}</span>}
                            </div>
                            <div className="osDesk-labelPlate">
                              <div className="osDesk-label">{agent.name}</div>
                              <span className="dim mono">{zone === "planning" ? "Planning" : statusLabel(state)}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
            {resultsOpen && <OfficeResultsWall key={project.id} projectId={project.id} onClose={()=>setResultsOpen(false)} />}
            <div className="osGridNav">
              <button className="pillBtn ghostBtn mono" onClick={() => handleNavigateToRoom("meeting")} title="Open meeting room">Meeting</button>
              <button className="pillBtn ghostBtn mono" onClick={() => handleNavigateToRoom("planning")} title="Open planning">Strategy</button>
              <button className="pillBtn ghostBtn mono" onClick={() => handleNavigateToRoom("debate")} title="Open debate">Boardroom</button>
              <button className="pillBtn ghostBtn mono" onClick={() => handleNavigateToRoom("board")} title="Open task board">Board</button>
              <button className="pillBtn ghostBtn mono" onClick={() => setResultsOpen(v=>!v)} aria-expanded={resultsOpen}>Results wall</button>
              <button className="pillBtn ghostBtn mono" onClick={() => handleNavigateToRoom("workflows")}>Workflows</button>
            </div>
          </div>
          {selectedAgentData && (
            <div className="osInspector">
              <div className="osInspectorHeader">
                <div className="osInspectorTitle">{selectedAgentData.name}</div>
                <button
                  className="iconBtn pillBtn ghostBtn"
                  onClick={() => setSelectedAgent(null)}
                  aria-label="Close inspector"
                  title="Close inspector"
                >
                  ×
                </button>
              </div>
              <div className="osInspectorContent">
                <div className="osInspectorField">
                  <div className="osInspectorLabel">Status</div>
                  <div className="osInspectorValue">{selectedAgentState || "—"}</div>
                </div>
                <div className="osInspectorField">
                  <div className="osInspectorLabel">Location</div>
                  <div className="osInspectorValue">{selectedLocationLabel}</div>
                </div>
                {selectedZone !== "home" && (
                  <div className="osInspectorField">
                    <div className="osInspectorLabel">Session</div>
                    <div className="osInspectorValue mono" style={{ fontSize: 11 }}>{selectedZone}</div>
                  </div>
                )}
                {selectedAgentData.name && (
                  <div className="osInspectorField">
                    <div className="osInspectorLabel">Name</div>
                    <div className="osInspectorValue">{selectedAgentData.name}</div>
                  </div>
                )}
                {(selectedAgentData.provider || project.backend) && (
                  <div className="osInspectorField">
                    <div className="osInspectorLabel">Provider</div>
                    <div className="osInspectorValue mono" style={{ fontSize: 11 }}>
                      {selectedAgentData.provider || project.backend}
                    </div>
                  </div>
                )}
                {true && (
                  <div className="osInspectorField">
                    <div className="osInspectorLabel">Model</div>
                    <div className="osInspectorValue mono" style={{ fontSize: 11 }}>
                      {selectedAgentData.model || project.model || "Provider default"}
                    </div>
                  </div>
                )}
                {recentMessage && (
                  <div className="osInspectorField">
                    <div className="osInspectorLabel">Latest</div>
                    <div className="osInspectorMessage">{recentMessage.message.substring(0, 120)}{recentMessage.message.length > 120 ? "…" : ""}</div>
                  </div>
                )}
                <button
                  className="pillBtn fillBtn"
                  onClick={() => {
                    selectAgent(selectedAgentData.id);
                    showView("room");
                  }}
                  style={{ width: "100%", marginTop: 12 }}
                >
                  Open conversation
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
