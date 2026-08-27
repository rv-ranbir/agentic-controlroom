export const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

interface Tick { t: number; needs: boolean }
const ticks = new Map<string, Tick[]>();
const listeners = new Set<() => void>();

export function onTick(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function pushTick(agentId: string, needs = false): void {
  const arr = ticks.get(agentId) ?? [];
  arr.push({ t: performance.now(), needs });
  ticks.set(agentId, arr);
  for (const cb of listeners) cb();
}

export function clearTicks(): void {
  ticks.clear();
}

const WINDOW = 6000;

export function drawRail(canvas: HTMLCanvasElement, agentIds: string[], selectedAgentId: string | null): void {
  const rail = canvas.parentElement;
  if (!rail) return;
  const w = rail.clientWidth, h = rail.clientHeight;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const cs = getComputedStyle(document.documentElement);
  const paper = cs.getPropertyValue("--paper").trim() || "#1B1814";
  const live = cs.getPropertyValue("--live").trim() || "#AEBF92";
  const signal = cs.getPropertyValue("--signal").trim() || "#D67F48";
  const inkTint = cs.getPropertyValue("--ink-16").trim() || "rgba(240,231,214,.14)";
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, w, h);

  const n = agentIds.length || 1;
  const laneH = h / n;
  const now = performance.now();

  agentIds.forEach((id, i) => {
    const cy = i * laneH + laneH / 2;
    if (id === selectedAgentId) {
      ctx.fillStyle = inkTint;
      ctx.fillRect(0, i * laneH, w, laneH);
    }
    const arr = (ticks.get(id) ?? []).filter((tk) => now - tk.t < WINDOW);
    ticks.set(id, arr);
    for (const tk of arr) {
      const age = now - tk.t;
      const x = w - (age / WINDOW) * w;
      const thick = tk.needs ? 4 : 2.5;
      ctx.fillStyle = tk.needs ? signal : live;
      ctx.globalAlpha = tk.needs ? 0.95 : 0.8;
      ctx.fillRect(Math.max(0, x - 1.5), cy - thick / 2, 3, thick);
      ctx.globalAlpha = 1;
    }
  });
}
