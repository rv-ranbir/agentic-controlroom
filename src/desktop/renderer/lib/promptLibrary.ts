export interface PromptTemplate {
  id: string;
  shortcut: string; // typed after "/" to match, e.g. "test" for "/test"
  body: string;
}

const KEY = "agentic-controlroom-prompts";

export function loadPrompts(): PromptTemplate[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function savePrompts(list: PromptTemplate[]): void {
  localStorage.setItem(KEY, JSON.stringify(list));
}
