import { TopBar } from "./TopBar";
import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useStore } from "../store";
import { colorFor, initials } from "../lib/agents";

export function Terminal() {
  const selectedProjectId = useStore((s) => s.selectedProjectId);
  const project = useStore((s) => s.projects.find((p) => p.id === selectedProjectId));
  const selectedAgent = useStore((s) => s.selectedAgent);
  const theme = useStore((s) => s.theme);
  const { toggleTheme, showView } = useStore.getState();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!project || !selectedAgent || !containerRef.current) return;
    const projectId = project.id;
    const agentId = selectedAgent;
    const key = `${projectId}:${agentId}`;

    const cs = getComputedStyle(document.documentElement);
    const term = new XTerm({
      cursorBlink: true,
      fontFamily: "var(--mono), ui-monospace, Consolas, monospace",
      fontSize: 12.5,
      theme: {
        background: cs.getPropertyValue("--paper").trim() || "#1B1814",
        foreground: cs.getPropertyValue("--ink").trim() || "#F0E7D6",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    void api.startPty(projectId, agentId);

    const offData = api.onPtyData((e) => { if (e.key === key) term.write(e.data); });
    const offExit = api.onPtyExit((e) => { if (e.key === key) term.writeln(`\r\n[process exited]`); });

    const dataDisposable = term.onData((data) => void api.writePty(projectId, agentId, data));
    const resizeObserver = new ResizeObserver(() => {
      fit.fit();
      void api.resizePty(projectId, agentId, term.cols, term.rows);
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      dataDisposable.dispose();
      offData();
      offExit();
      term.dispose();
      void api.stopPty(projectId, agentId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, selectedAgent, theme]);

  if (!project || !selectedAgent) {
    return (
      <div className="viewRoot workspaceView viewTerminal">
      <TopBar />
        <header className="rvHeader">
          <button className="pillBtn ghostBtn mono" onClick={() => showView("room")}>&larr; back</button>
        </header>
        <div className="rvEmpty">No agent selected.</div>
      </div>
    );
  }

  const agent = project.agents.find((a) => a.id === selectedAgent);

  return (
    <div className="viewRoot workspaceView viewTerminal">
      <TopBar />
      <header className="rvHeader">
        <button className="pillBtn ghostBtn mono" onClick={() => showView("room")}>&larr; back</button>
        <div className="monogram mono" style={{ width: 26, height: 26, fontSize: 10, background: colorFor(selectedAgent) }}>
          {agent ? initials(agent.name) : "?"}
        </div>
        <span className="rvName">{agent?.name ?? selectedAgent}</span>
        <span className="dim mono" style={{ fontSize: 10.5 }}>{project.name} &middot; {project.backend}</span>
        <div className="spacer" />
        <button className="pillBtn iconBtn" onClick={toggleTheme}>{theme === "light" ? "☀" : "☽"}</button>
      </header>
      <div className="ptBody"><div className="ptContainer" ref={containerRef} /></div>
    </div>
  );
}
