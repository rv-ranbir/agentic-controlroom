import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import type { Project } from "../../types";

export function EnvTerminalTab({ project }: { project: Project }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const projectId = project.id;
    const key = `${projectId}:__shell__`;

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

    void api.startShellPty(projectId);

    const offData = api.onPtyData((e) => { if (e.key === key) term.write(e.data); });
    const offExit = api.onPtyExit((e) => { if (e.key === key) term.writeln(`\r\n[shell exited]`); });

    const dataDisposable = term.onData((data) => void api.writeShellPty(projectId, data));
    const resizeObserver = new ResizeObserver(() => {
      fit.fit();
      void api.resizeShellPty(projectId, term.cols, term.rows);
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      dataDisposable.dispose();
      offData();
      offExit();
      term.dispose();
      void api.stopShellPty(projectId);
    };
  }, [project.id]);

  return <div className="ptBody" style={{ flex: 1, minHeight: 0 }}><div className="ptContainer" ref={containerRef} /></div>;
}
