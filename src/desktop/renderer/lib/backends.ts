import type { AdminConfig, Category, Project } from "../types";

export const BACKENDS: { id: Project["backend"]; label: string }[] = [
  { id: "codex", label: "Codex (ChatGPT login)" },
  { id: "claude", label: "Claude Code" },
  { id: "cursor", label: "Cursor (account login)" },
  { id: "openrouter", label: "OpenRouter" },
  { id: "openai", label: "OpenAI API" },
  { id: "anthropic", label: "Anthropic" },
  { id: "gemini", label: "Gemini" },
  { id: "ollama", label: "Ollama" },
];

export function categoryForRole(config: AdminConfig, roleId: string): Category | undefined {
  return config.categories.find((c) => c.members.some((m) => m.source === "role" && m.refId === roleId));
}

// Mirrors main.ts's effectiveBackends: global narrows app-wide, project narrows further,
// category (the role's group) narrows again — never wider at any step.
export function effectiveBackends(config: AdminConfig, project: Project, categoryId?: string): Project["backend"][] {
  let allowed = config.globalAllowlist;
  if (project.allowedBackends?.length) allowed = allowed.filter((b) => project.allowedBackends!.includes(b));
  const categoryAllow = categoryId ? config.categoryAllowlist[categoryId] : undefined;
  if (categoryAllow?.length) allowed = allowed.filter((b) => categoryAllow.includes(b));
  return allowed;
}
