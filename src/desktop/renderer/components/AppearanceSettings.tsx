import { useState } from "react";
import { THEME_PRESETS, type ThemePreset } from "../lib/themes";
import { useStore } from "../store";

export function AppearanceSettings() {
  const projects = useStore((state) => state.projects);
  const selectedProjectId = useStore((state) => state.selectedProjectId);
  const appThemePreset = useStore((state) => state.appThemePreset);
  const projectThemePresets = useStore((state) => state.projectThemePresets);
  const { setAppThemePreset, setProjectThemePreset } = useStore.getState();
  const theme = useStore((state) => state.theme);
  const toggleTheme = useStore.getState().toggleTheme;
  const [projectId, setProjectId] = useState(selectedProjectId ?? projects[0]?.id ?? "");
  const projectPreset = projectId ? projectThemePresets[projectId] : undefined;
  return <section className="settingsCard appearanceCard">
    <div className="settingsCardHeading"><div><span className="settingsEyebrow">Personalize</span><h2>Appearance</h2></div><div className="settingsMode" aria-label="Colour mode">
      {(["light", "dark"] as const).map(mode => <button type="button" key={mode} aria-pressed={theme === mode} onClick={() => theme !== mode && toggleTheme()}><span aria-hidden="true">{mode === 'light' ? '☀' : '☾'}</span> {mode === 'light' ? 'Light' : 'Dark'}</button>)}
    </div></div>
    <p className="settingsDescription">A familiar workspace, with a palette that feels right.</p>
    <div className="themePreviewGrid" aria-label="Theme previews">
      {THEME_PRESETS.map(preset => <button type="button" className="themePreviewChoice" key={preset.id} aria-label={`Use ${preset.label} theme`} aria-pressed={preset.id === appThemePreset} onClick={() => setAppThemePreset(preset.id)}>
        <span className="themeMini" data-palette={preset.id} data-mode={theme} aria-hidden="true"><span className="themeMiniBar"><i /><i /><i /></span><span className="themeMiniBody"><span className="themeMiniNav"><i /><i /><i /></span><span className="themeMiniCanvas"><span className="themeMiniLine" /><span className="themeMiniTiles"><i /><i /></span><span className="themeMiniLines"><i /><i /></span></span></span></span>
        <span className="themePreviewLabel"><strong>{preset.label}</strong><span className="themeCheck" aria-hidden="true">{preset.id === appThemePreset ? '✓' : ''}</span></span>
      </button>)}
    </div>
    <label className="settingsDefault"><span>App default</span><select aria-label="App default" className="fInput" value={appThemePreset} onChange={event => setAppThemePreset(event.target.value as ThemePreset)}>{THEME_PRESETS.map(preset => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select></label>
    <div className="projectAppearance"><div className="projectAppearanceHeading"><h3>Project appearance</h3><span>Optional override</span></div><div className="projectAppearanceFields">
      <label><span>Project</span><select aria-label="Project appearance" className="fInput" value={projectId} onChange={event => setProjectId(event.target.value)}><option value="">Choose a project…</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      <label><span>Preset</span><select disabled={!projectId} aria-label="Project preset" className="fInput" value={projectPreset ?? "inherit"} onChange={event => setProjectThemePreset(projectId, event.target.value === 'inherit' ? undefined : event.target.value as ThemePreset)}><option value="inherit">Use app default</option>{THEME_PRESETS.map(preset => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select></label>
    </div></div>
  </section>;
}
