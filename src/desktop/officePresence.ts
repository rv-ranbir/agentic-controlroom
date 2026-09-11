// Tracks active meeting/debate sessions across all projects so the renderer's
// office floor can place agents in the right room without inferring from the
// per-project, unscoped `activeRoomRoster` store field (which drops on ANY
// project's run finishing, not just the one it was set for).
export interface OfficeSession {
  id: string;
  projectId: string;
  kind: "meeting" | "debate" | "planning";
  agentIds: string[];
}

export class OfficePresenceRegistry {
  private sessions = new Map<string, OfficeSession>();

  start(id: string, projectId: string, kind: OfficeSession["kind"], agentIds: string[]): void {
    this.sessions.set(id, { id, projectId, kind, agentIds: [...agentIds] });
  }

  end(id: string): void {
    this.sessions.delete(id);
  }

  snapshot(): OfficeSession[] {
    return [...this.sessions.values()].map((session) => ({ ...session, agentIds: [...session.agentIds] }));
  }

  forProject(projectId: string): OfficeSession[] {
    return this.snapshot().filter((s) => s.projectId === projectId);
  }
}
