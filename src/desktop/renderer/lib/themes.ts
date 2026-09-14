export const THEME_PRESETS = [
  { id: "organic", label: "Organic" },
  { id: "slate", label: "Slate" },
  { id: "ocean", label: "Ocean" },
] as const;

export type ThemePreset = (typeof THEME_PRESETS)[number]["id"];
export type ProjectThemePresets = Record<string, ThemePreset>;

export const APP_THEME_PRESET_KEY = "agentic-controlroom-theme-preset";
export const PROJECT_THEME_PRESETS_KEY = "agentic-controlroom-project-theme-presets";

const DEFAULT_PRESET: ThemePreset = "organic";
const ids = new Set<string>(THEME_PRESETS.map((preset) => preset.id));

export function isThemePreset(value: unknown): value is ThemePreset {
  return typeof value === "string" && ids.has(value);
}

export function readThemePreset(value: string | null): ThemePreset {
  return isThemePreset(value) ? value : DEFAULT_PRESET;
}

export function readProjectThemePresets(value: string | null): ProjectThemePresets {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, preset]) => isThemePreset(preset))) as ProjectThemePresets;
  } catch {
    return {};
  }
}

export function effectiveThemePreset(appPreset: ThemePreset, projectId: string | null, projectPresets: ProjectThemePresets): ThemePreset {
  return projectId ? projectPresets[projectId] ?? appPreset : appPreset;
}

export function applyThemePreset(preset: ThemePreset): void {
  document.documentElement.dataset.themePreset = preset;
}
