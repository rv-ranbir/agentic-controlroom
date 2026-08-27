import { useEffect } from "react";
import { useStore } from "../store";
import { TopBar } from "./TopBar";
import { Roster } from "./Roster";
import { Rail } from "./Rail";
import { AgentHeader } from "./AgentHeader";
import { Stream } from "./Stream";
import { Composer } from "./Composer";
import { bucketOf } from "../lib/agents";
import type { Bucket } from "../types";

const ORDER: Bucket[] = ["needs", "review", "active", "seen", "idle"];

export function Room({ onAddAgent, onOpenReview }: { onAddAgent: () => void; onOpenReview: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key !== "j" && e.key !== "k") return;
      const s = useStore.getState();
      const project = s.projects.find((p) => p.id === s.selectedProjectId);
      if (!project) return;
      const order: (string | null)[] = [null];
      for (const bucket of ORDER) {
        for (const a of project.agents) {
          if (bucketOf(a.id, { agentStates: s.agentStates, localSeen: s.localSeen, localForceActive: s.localForceActive }) === bucket) order.push(a.id);
        }
      }
      const idx = order.indexOf(s.selectedAgent);
      const next = e.key === "j" ? Math.min(order.length - 1, idx + 1) : Math.max(0, idx - 1);
      s.selectAgent(order[next] ?? null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="viewRoot">
      <TopBar />
      <div id="body">
        <Roster onAddAgent={onAddAgent} />
        <Rail />
        <main id="mainPane">
          <AgentHeader onOpenReview={onOpenReview} />
          <Stream />
          <Composer />
        </main>
      </div>
    </div>
  );
}
