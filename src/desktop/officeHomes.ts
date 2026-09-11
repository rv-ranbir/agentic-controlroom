// Persistent, stable desk slot assignment for agents within a project.
// Slots are stored in localStorage, keyed by project ID with a version prefix.
// When agents are added, removed, or reordered, this reconciles saved slots
// with the current roster, retaining valid slots and assigning new slots to the
// lowest available indices. Safe against malformed or missing storage.
//
// Note: localStorage is profile-local; slot data does not sync across machines
// or browser instances. Clearing browser storage resets all slot assignments.

const SCHEMA_VERSION = 1;
const SLOT_MAX = 10000;

interface SlotMap {
  [agentId: string]: number;
}

function makeStorageKey(projectId: string): string {
  return `office-homes:v${SCHEMA_VERSION}:${projectId}`;
}

function loadSlots(projectId: string): SlotMap {
  const key = makeStorageKey(projectId);
  try {
    const json = localStorage.getItem(key);
    if (!json) return {};
    const parsed = JSON.parse(json);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    const slots: SlotMap = Object.create(null);
    for (const [id, slot] of Object.entries(parsed)) {
      if (typeof id === "string" && typeof slot === "number" && slot >= 0 && Number.isInteger(slot)) {
        slots[id] = slot;
      }
    }
    return slots;
  } catch {
    return {};
  }
}

function saveSlots(projectId: string, slots: SlotMap): void {
  const key = makeStorageKey(projectId);
  try {
    localStorage.setItem(key, JSON.stringify(slots));
  } catch {
    // storage full or inaccessible; silently fail
  }
}

export function reconcileHomes(projectId: string, agentIds: string[]): Map<string, number> {
  const saved = loadSlots(projectId);
  const roster = new Set(agentIds);
  const slots = new Map<string, number>();
  const usedSlots = new Set<number>();

  // Step 1: retain saved valid slots for IDs still in the roster
  for (const id of roster) {
    const slot = saved[id];
    if (slot !== undefined && slot >= 0 && slot < SLOT_MAX && Number.isInteger(slot) && !usedSlots.has(slot)) {
      slots.set(id, slot);
      usedSlots.add(slot);
    }
  }

  // Step 2: assign new IDs to lowest available slots
  for (const id of roster) {
    if (slots.has(id)) continue;
    let slot = 0;
    while (usedSlots.has(slot)) slot++;
    if (slot >= SLOT_MAX) {
      // Should not happen in normal use; fallback to end
      slot = Math.max(0, ...usedSlots) + 1;
    }
    slots.set(id, slot);
    usedSlots.add(slot);
  }

  // Step 3: persist the reconciled state
  const persisted: SlotMap = Object.create(null);
  for (const [id, slot] of slots) {
    persisted[id] = slot;
  }
  saveSlots(projectId, persisted);

  return slots;
}
