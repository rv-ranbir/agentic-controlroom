import { useEffect, useState } from "react";
import type { OfficeSession } from "../types";

// Subscribes to the main process's office presence registry and returns only
// the sessions for `projectId` — the registry itself tracks every project's
// sessions at once, so filtering happens here rather than relying on the
// store's unscoped `activeRoomRoster`.
export function useOfficePresence(projectId: string | null): OfficeSession[] {
  const [sessions, setSessions] = useState<OfficeSession[]>([]);

  useEffect(() => {
    let cancelled = false;
    let receivedEvent = false;
    const unsubscribe = api.onOfficePresence((snapshot) => {
      receivedEvent = true;
      if (!cancelled) setSessions(snapshot);
    });
    void api.getOfficePresence().then((snapshot) => {
      if (!cancelled && !receivedEvent) setSessions(snapshot);
    }).catch(() => { if (!cancelled && !receivedEvent) setSessions([]); });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return projectId ? sessions.filter((s) => s.projectId === projectId) : [];
}
