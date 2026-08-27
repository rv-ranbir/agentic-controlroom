import { useEffect, useMemo, useRef } from "react";
import { useStore } from "../store";
import { drawRail, onTick, REDUCED_MOTION } from "../lib/rail";

export function Rail() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const selectedProjectId = useStore((s) => s.selectedProjectId);
  // .find() returns the same object reference across renders (stable) — do NOT
  // derive arrays (.map/.filter) inside the zustand selector itself: a fresh
  // array every call defeats useSyncExternalStore's snapshot check and causes
  // an infinite render loop (React error #185). Derive via useMemo instead.
  const project = useStore((s) => s.projects.find((p) => p.id === selectedProjectId));
  const selectedAgent = useStore((s) => s.selectedAgent);
  const agentIds = useMemo(() => project?.agents.map((a) => a.id) ?? [], [project]);
  const agentIdsKey = agentIds.join(",");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => drawRail(canvas, agentIds, selectedAgent);
    window.addEventListener("resize", draw);

    if (REDUCED_MOTION) {
      draw();
      const off = onTick(draw);
      return () => { window.removeEventListener("resize", draw); off(); };
    }
    let raf: number;
    const loop = () => { draw(); raf = requestAnimationFrame(loop); };
    loop();
    return () => { window.removeEventListener("resize", draw); cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentIdsKey, selectedAgent]);

  return (
    <div id="rail"><canvas id="railCanvas" ref={canvasRef} /></div>
  );
}
