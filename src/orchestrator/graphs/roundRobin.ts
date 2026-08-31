import type { GraphEdge } from "../graph.js";

// Shared by meetingGraph.ts and debate.ts: chain N participant node ids in
// sequence, then route the last one to `loopBackTarget` (a gate node that
// decides whether to cycle back to the first participant or terminate).
export function chainRoundRobin(nodeIds: string[], loopBackTarget: string): GraphEdge[] {
  if (nodeIds.length === 0) throw new Error("chainRoundRobin: need at least one participant");
  const edges: GraphEdge[] = [];
  for (let i = 0; i < nodeIds.length - 1; i++) {
    edges.push({ from: nodeIds[i], to: nodeIds[i + 1], condition: () => true });
  }
  edges.push({ from: nodeIds[nodeIds.length - 1], to: loopBackTarget, condition: () => true });
  return edges;
}
