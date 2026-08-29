import type { AgentBackend, RoleConfig } from "../backend/agentBackend.js";
import type { ChatLog } from "../chatroom/log.js";

export interface MeetingParticipant {
  agent: RoleConfig;
  backend: AgentBackend;
}

// Generalized N-agent version of orchestrator.ts's Dev/QA loop: round-robin
// each participant's reply into the next participant's prompt. Each participant
// gets their own backend instance (own worktree/model) and their own ephemeral
// session — a meeting is a side conversation, not folded into an agent's main
// working session, so nothing here is persisted to their normal session file.
export async function runMeeting(
  topic: string,
  log: ChatLog,
  participants: MeetingParticipant[],
  rounds: number,
  streamActivity = false,
): Promise<void> {
  const sessions = new Map<string, string>();
  const names = participants.map((p) => p.agent.name).join(", ");
  log.post("orchestrator", "system", `Meeting started — ${names}\nTopic: ${topic}`);

  const transcript: string[] = [`Topic: ${topic}`];

  for (let round = 1; round <= rounds; round++) {
    for (const { agent, backend } of participants) {
      const others = participants.filter((p) => p.agent.id !== agent.id).map((p) => p.agent.name).join(", ");
      const prompt = transcript.length === 1
        ? `You're in a meeting with ${others} about:\n\n${topic}\n\nGive your take in a few sentences.`
        : `Meeting so far:\n${transcript.join("\n\n")}\n\nYour turn — respond to what's been said, in a few sentences.`;

      log.agentState(agent.id, "working");
      log.status(`${agent.name} is in the meeting…`);
      const onLine = streamActivity ? (line: string) => log.activity(agent.id, line) : undefined;

      const sessionId = sessions.get(agent.id);
      let reply: string;
      if (sessionId) {
        reply = (await backend.resume(sessionId, prompt, agent, onLine)).reply;
      } else {
        const result = await backend.start(agent, prompt, onLine);
        sessions.set(agent.id, result.sessionId);
        reply = result.reply;
      }

      log.post(agent.id, agent.name, reply);
      transcript.push(`${agent.name}: ${reply}`);
      log.agentState(agent.id, "done");
    }
  }

  log.status("");
  log.post("orchestrator", "system", "Meeting ended.");
}
