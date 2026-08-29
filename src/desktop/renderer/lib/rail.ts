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

// Vertical per-lane strip chart, matching the design handoff's startRail():
// one narrow lane per agent, newest tick at the top, drifting down and fading
// as it ages (linear opacity falloff), independent of the other lanes.
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
  const ink = cs.getPropertyValue("--ink").trim() || "#F0E7D6";
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, w, h);

  const n = agentIds.length || 1;
  const lw = w / n;
  const now = performance.now();

  // faint per-lane divider guide
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = ink;
  for (let i = 0; i < n; i++) ctx.fillRect(i * lw + lw / 2 - 0.5, 0, 1, h);

  agentIds.forEach((id, i) => {
    if (id === selectedAgentId) {
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = ink;
      ctx.fillRect(i * lw, 0, lw, h);
    }
    const arr = (ticks.get(id) ?? []).filter((tk) => now - tk.t < WINDOW);
    ticks.set(id, arr);
    for (const tk of arr) {
      const age = now - tk.t;
      const y = (age / WINDOW) * h;
      const thick = tk.needs ? 4 : 2.5;
      ctx.fillStyle = tk.needs ? signal : live;
      ctx.globalAlpha = tk.needs ? 0.95 : 0.14 + 0.55 * (1 - y / h);
      ctx.fillRect(i * lw + 1.5, y, lw - 3, thick);
    }
  });
  ctx.globalAlpha = 1;
}
