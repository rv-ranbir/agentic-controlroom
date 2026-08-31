import type { AgentBackend, RoleConfig } from "../backend/agentBackend.js";
import type { ChatLog } from "../chatroom/log.js";
import { runDevQaGraph } from "./graphs/devQa.js";
import type { RoomResult } from "./graph.js";

export interface OrchestratorOptions {
  maxRounds?: number;
  tailSize?: number;
  /** Stream each agent's raw work lines into log.activity (for live activity panes). */
  streamActivity?: boolean;
}

export type { RoomResult };

// M12 phase 1: the Dev/QA loop that used to live inline here now runs through
// the generic graph engine (src/orchestrator/graph.ts) via
// src/orchestrator/graphs/devQa.ts — same prompts, same conditions, same
// log call shape. This wrapper exists so main.ts's call site
// (`runRoom(task, backend, log, dev, qa, opts)`) never had to change. See
// docs/graph-orchestrator-design.md.
export async function runRoom(
  task: string,
  backend: AgentBackend,
  log: ChatLog,
  dev: RoleConfig,
  qa: RoleConfig,
  opts: OrchestratorOptions = {},
): Promise<RoomResult> {
  return runDevQaGraph(task, backend, log, dev, qa, opts);
}
