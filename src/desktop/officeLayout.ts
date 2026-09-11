// Pure session→room assignment for the office floor. No DOM/React — the renderer
// wraps this with refs to persist an OfficeLayoutState for the life of a project.
import type { OfficeSession } from "./officePresence.js";

export type RoomKind = OfficeSession["kind"];

export interface RoomSlot {
  kind: RoomKind;
  slot: number;
  position: number; // physical column, stable while the session is active
  sessionId: string | null; // null => empty placeholder (no active session of this kind)
  agentIds: string[]; // roster-filtered, deduped across all rooms
}

export const ROOM_KIND_ORDER: RoomKind[] = ["meeting", "debate", "planning"];

/** Caller-owned, mutated in place by buildRooms; recreate on project change. */
export interface OfficeLayoutState {
  slotBySession: Map<string, number>;
  positionBySession: Map<string, number>;
  nextSlotByKind: Record<RoomKind, number>;
}

export function createOfficeLayoutState(): OfficeLayoutState {
  return { slotBySession: new Map(), positionBySession: new Map(), nextSlotByKind: { meeting: 0, debate: 0, planning: 0 } };
}

// One room per active session, plus one empty placeholder per kind with none.
// Slot numbers are assigned once per session id and never reassigned, so a
// live session's room doesn't shift when a same-kind sibling ends.
export function buildRooms(sessions: OfficeSession[], rosterIds: Set<string>, state: OfficeLayoutState): RoomSlot[] {
  const activeIds = new Set(sessions.map((session) => session.id));
  for (const id of state.positionBySession.keys()) {
    if (!activeIds.has(id)) { state.positionBySession.delete(id); state.slotBySession.delete(id); }
  }
  const occupied = new Set(state.positionBySession.values());
  const byKind: Record<RoomKind, OfficeSession[]> = { meeting: [], debate: [], planning: [] };
  for (const s of sessions) byKind[s.kind].push(s);

  const rooms: RoomSlot[] = [];
  const claimedAgents = new Set<string>();

  for (const kind of ROOM_KIND_ORDER) {
    const kindSessions = byKind[kind].slice().sort((a, b) => a.id.localeCompare(b.id));
    if (kindSessions.length === 0) {
      rooms.push({ kind, slot: -1, position: ROOM_KIND_ORDER.indexOf(kind), sessionId: null, agentIds: [] });
      continue;
    }
    const withSlots = kindSessions.map((session) => {
      let slot = state.slotBySession.get(session.id);
      if (slot === undefined) {
        slot = state.nextSlotByKind[kind]++;
        state.slotBySession.set(session.id, slot);
      }
      let position = state.positionBySession.get(session.id);
      if (position === undefined) {
        position = ROOM_KIND_ORDER.indexOf(kind);
        if (occupied.has(position)) { position = 3; while (occupied.has(position)) position++; }
        state.positionBySession.set(session.id, position);
        occupied.add(position);
      }
      return { session, slot, position };
    });
    withSlots.sort((a, b) => a.slot - b.slot);
    for (const { session, slot, position } of withSlots) {
      const agentIds = [...new Set(session.agentIds)].filter((id) => rosterIds.has(id) && !claimedAgents.has(id));
      agentIds.forEach((id) => claimedAgents.add(id));
      rooms.push({ kind, slot, position, sessionId: session.id, agentIds });
    }
  }
  return rooms;
}

export function agentRoomMap(rooms: RoomSlot[]): Map<string, RoomSlot> {
  const map = new Map<string, RoomSlot>();
  rooms.forEach((room) => room.agentIds.forEach((id) => map.set(id, room)));
  return map;
}
