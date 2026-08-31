import type { AgentBackend, RoleConfig } from "../backend/agentBackend.js";
import type { ChatLog } from "../chatroom/log.js";

// Generic graph engine (M12). orchestrator.ts's Dev/QA loop, meeting.ts's
// round-robin, and the debate/consensus flow are all expressed on top of this
// — arbitrary node/edge topologies (branching, cycles, N roles) on the same
// AgentBackend/ChatLog primitives those already used inline. See
// docs/graph-orchestrator-design.md for the full design and phasing.

/** Phase 1's Dev/QA result vocabulary. Other graphs (meeting, debate) define their own — see RunGraphOptions<R>. */
export type RoomResult = "approved" | "max-rounds" | "needs-input";

export interface GraphState {
  /** Per-node session id, once that node's agent has had its first turn. */
  sessions: Map<string, string>;
  /** Free-running counter a graph's own nodes/edges give meaning to (e.g. review rounds). */
  round: number;
  /** Scratch space for whatever a specific graph needs to pass between nodes. */
  data: Record<string, unknown>;
}

export interface AgentTurnNode {
  kind: "agent";
  id: string;
  role: RoleConfig;
  backend: AgentBackend;
  buildPrompt: (state: GraphState) => string;
  /** Runs after this node's own log.status/agentState("working"), before the backend call — e.g. to mark another node's agent idle while this one runs. */
  beforeRun?: (state: GraphState, log: ChatLog) => void;
  streamActivity?: boolean;
}

export interface GateNode {
  kind: "gate";
  id: string;
  /** Pure side effect on shared state — e.g. increment a round counter. No agent call, no log events. */
  run: (state: GraphState) => void;
}

export interface TerminalNode<R extends string> {
  kind: "terminal";
  id: string;
  result: R;
  onEnter?: (state: GraphState, log: ChatLog) => void;
}

export type GraphNode<R extends string> = AgentTurnNode | GateNode | TerminalNode<R>;

export interface GraphEdge {
  from: string;
  to: string;
  /** Evaluated in array order for a given `from`; first match wins. Put specific conditions before a catch-all. */
  condition: (state: GraphState) => boolean;
}

export interface RunGraphOptions {
  /** Cycle safety net — graphs can loop, unlike a fixed `for` loop, so something has to bound a run. */
  maxSteps?: number;
}

export async function runGraph<R extends string>(
  startId: string,
  nodes: GraphNode<R>[],
  edges: GraphEdge[],
  log: ChatLog,
  opts: RunGraphOptions = {},
): Promise<R> {
  const maxSteps = opts.maxSteps ?? 50;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const state: GraphState = { sessions: new Map(), round: 1, data: {} };
  let currentId = startId;

  for (let step = 0; step < maxSteps; step++) {
    const node = byId.get(currentId);
    if (!node) throw new Error(`graph: unknown node "${currentId}"`);

    if (node.kind === "terminal") {
      node.onEnter?.(state, log);
      return node.result;
    }

    if (node.kind === "gate") {
      node.run(state);
    } else {
      const prompt = node.buildPrompt(state);
      log.status(`${node.role.name} is working…`);
      log.agentState(node.role.id, "working");
      node.beforeRun?.(state, log);
      const onLine = node.streamActivity ? (line: string) => log.activity(node.role.id, line) : undefined;

      const sessionId = state.sessions.get(node.id);
      let reply: string;
      if (sessionId === undefined) {
        const r = await node.backend.start(node.role, prompt, onLine);
        state.sessions.set(node.id, r.sessionId);
        reply = r.reply;
      } else {
        reply = (await node.backend.resume(sessionId, prompt, node.role, onLine)).reply;
      }
      log.post(node.role.id, node.role.name, reply);
      state.data.lastReply = reply;
      state.data.lastNodeId = node.id;
    }

    const next = edges.filter((e) => e.from === currentId).find((e) => e.condition(state));
    if (!next) throw new Error(`graph: no matching edge from "${currentId}"`);
    currentId = next.to;
  }

  throw new Error(`graph: exceeded maxSteps (${maxSteps}) without reaching a terminal node`);
}
