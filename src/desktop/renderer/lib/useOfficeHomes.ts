import { useMemo } from "react";
import { reconcileHomes } from "../../officeHomes";

// Hook to derive stable home desk slots for a project's agent roster.
// On mount or when the agent roster changes, reconciles saved slot assignments
// with the current roster. Retains saved valid slots, assigns new agents to
// the lowest available slots, and drops slots for removed agents.
export function useOfficeHomes(projectId: string | null, agentIds: string[]): Map<string, number> {
  return useMemo(() => {
    if (!projectId) return new Map();
    return reconcileHomes(projectId, agentIds);
  }, [projectId, agentIds]);
}
