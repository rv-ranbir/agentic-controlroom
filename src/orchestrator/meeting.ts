import type { AgentBackend, RoleConfig } from "../backend/agentBackend.js";
import type { ChatLog } from "../chatroom/log.js";
import { runMeetingGraph } from "./graphs/meetingGraph.js";

export interface MeetingParticipant {
  agent: RoleConfig;
  backend: AgentBackend;
}

// M12 phase 2: the round-robin that used to live inline here now runs through
// the generic graph engine (src/orchestrator/graph.ts) via
// src/orchestrator/graphs/meetingGraph.ts — same round-robin shape, same
// per-participant sessions. This wrapper exists so main.ts's call site
// (`runMeeting(topic, log, participants, rounds, streamActivity)`) never had
// to change. See docs/graph-orchestrator-design.md.
export async function runMeeting(
  topic: string,
  log: ChatLog,
  participants: MeetingParticipant[],
  rounds: number,
  streamActivity = false,
): Promise<void> {
  await runMeetingGraph(topic, log, participants, rounds, { streamActivity });
}
