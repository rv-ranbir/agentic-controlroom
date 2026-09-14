import type { GraphEdge, GraphNode, GraphState } from "../graph.js";
import { runGraph } from "../graph.js";
import { chainRoundRobin } from "./roundRobin.js";
import type { ChatLog } from "../../chatroom/log.js";
import type { MeetingParticipant } from "../meeting.js";

export interface MeetingGraphOptions {
  signal?: AbortSignal;
  streamActivity?: boolean;
}

// meeting.ts's round-robin, expressed as a graph (M12 phase 2, part 1). Unlike
// devQa.ts's fixed 2 nodes, this builds one agent node per participant
// dynamically — proving the engine handles a variable-N topology, not just a
// static one. See docs/graph-orchestrator-design.md.
export async function runMeetingGraph(
  topic: string,
  log: ChatLog,
  participants: MeetingParticipant[],
  rounds: number,
  opts: MeetingGraphOptions = {},
): Promise<"done"> {
  const names = participants.map((p) => p.agent.name).join(", ");
  log.post("orchestrator", "system", `Meeting started — ${names}\nTopic: ${topic}`);

  const nodeIds = participants.map((p) => p.agent.id);
  const participantNodes: GraphNode<"done">[] = participants.map((p) => ({
    kind: "agent",
    id: p.agent.id,
    role: p.agent,
    backend: p.backend,
    buildPrompt: (state: GraphState) => {
      if (!state.sessions.has(p.agent.id)) {
        const others = participants.filter((o) => o.agent.id !== p.agent.id).map((o) => o.agent.name).join(", ");
        return `You're in a meeting with ${others} about:\n\n${topic}\n\nGive your take in a few sentences.`;
      }
      const tail = log.tail(50).map((m) => `[${m.role}] ${m.message}`).join("\n\n");
      return `Meeting so far:\n${tail}\n\nYour turn — respond to what's been said, in a few sentences.`;
    },
    streamActivity: opts.streamActivity,
  }));

  const nodes: GraphNode<"done">[] = [
    ...participantNodes,
    { kind: "gate", id: "roundGate", run: (state: GraphState) => { state.round += 1; } },
    {
      kind: "terminal",
      id: "tDone",
      result: "done",
      onEnter: (_state, log) => log.post("orchestrator", "system", "Meeting ended."),
    },
  ];

  const edges: GraphEdge[] = [
    ...chainRoundRobin(nodeIds, "roundGate"),
    { from: "roundGate", to: nodeIds[0], condition: (state) => state.round <= rounds },
    { from: "roundGate", to: "tDone", condition: () => true },
  ];

  return runGraph(nodeIds[0], nodes, edges, log, { maxSteps: nodeIds.length * rounds + 4, signal:opts.signal });
}
