import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RoleConfig } from "./backend/agentBackend.js";

export function loadRole(dir: string, id: string, name: string, file: string): RoleConfig {
  return { id, name, systemPrompt: readFileSync(join(dir, file), "utf8") };
}
