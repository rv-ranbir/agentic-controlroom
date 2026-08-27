import type { CSSProperties } from "react";
import { useStore } from "../store";
import type { Bucket } from "../types";
import { bucketOf, colorFor, elapsedLabel, initials } from "../lib/agents";
import { useNow } from "../lib/useNow";

const BUCKETS: [Bucket, string][] = [
  ["needs", "Needs input"],
  ["review", "To review"],
  ["active", "Active"],
  ["seen", "Seen"],
  ["idle", "Inactive"],
];

function rowMeta(agentId: string, bucket: Bucket, stateSince: Record<string, number>): { text: string; color?: string } {
  switch (bucket) {
    case "needs": return { text: "reply ⏎" };
    case "review": return { text: "review" };
    case "active": return { text: elapsedLabel(stateSince[agentId]), color: "var(--live)" };
    case "seen": return { text: "✓" };
    default: return { text: "" };
  }
}

export function Roster({ onAddAgent }: { onAddAgent: () => void }) {
  useNow();
  const selectedProjectId = useStore((s) => s.selectedProjectId);
  const project = useStore((s) => s.projects.find((p) => p.id === selectedProjectId));
  const selectedAgent = useStore((s) => s.selectedAgent);
  const agentStates = useStore((s) => s.agentStates);
  const stateSince = useStore((s) => s.stateSince);
  const localSeen = useStore((s) => s.localSeen);
  const localForceActive = useStore((s) => s.localForceActive);
  const { selectAgent, showView } = useStore.getState();

  return (
    <aside id="roster">
      <div id="rosterTop">
        <button className="pillBtn ghostBtn mono" title="Back to launcher" onClick={() => showView("launcher")}>&larr;</button>
        <span className="mono dim" style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" }}>Agents</span>
        <button className="pillBtn ghostBtn mono" onClick={onAddAgent}>+ agent</button>
      </div>
      <div id="rosterList">
        {!project && <div className="rosterEmpty">Select a project.</div>}
        {project && project.agents.length === 0 && <div className="rosterEmpty">No agents yet. Click + agent.</div>}
        {project && BUCKETS.map(([bucket, label]) => {
          const inGroup = project.agents.filter((a) => bucketOf(a.id, { agentStates, localSeen, localForceActive }) === bucket);
          if (inGroup.length === 0) return null;
          return (
            <div key={bucket}>
              <div className="bucketHead"><span>{label}</span><span className="n">{inGroup.length}</span></div>
              {inGroup.map((a) => {
                const meta = rowMeta(a.id, bucket, stateSince);
                return (
                  <div
                    key={a.id}
                    className={`agentRow st-${bucket}${bucket === "idle" ? " idle" : ""}${selectedAgent === a.id ? " sel" : ""}`}
                    style={{ "--dotcolor": colorFor(a.id) } as CSSProperties}
                    onClick={() => selectAgent(a.id)}
                  >
                    <div className="mono2">{initials(a.name)}</div>
                    <div className="rInfo">
                      <div className="rTitle">{a.name}</div>
                      {bucket !== "idle" && <div className="rSub">{project.name}</div>}
                    </div>
                    <div className="rMeta" style={meta.color ? { color: meta.color } : undefined}>{meta.text}</div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <div id="rosterFooter" className="mono dim">
        <span>j / k &middot; walk</span>
        <span>{project?.agents.length ?? 0}</span>
      </div>
    </aside>
  );
}
