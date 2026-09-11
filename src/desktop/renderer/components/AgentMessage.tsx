import { useRef, useEffect, useState } from "react";
import { Markdown } from "./Markdown";
import { useStore } from "../store";
import type { Msg } from "../types";

interface ArtifactApi {
  openArtifact(projectId: string, id: string, mode: "app" | "browser"): Promise<void>;
}

function parsedJson(value: string | undefined): unknown {
  if (!value?.trim()) return undefined;
  try { return JSON.parse(value); } catch { return undefined; }
}

function ArtifactPreview({ projectId, artifactId, title }: { projectId: string; artifactId: string; title?: string }) {
  const [preview, setPreview] = useState<{ title: string; html: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setPreview(null);setError(null);setLoading(true);
    abortRef.current = new AbortController();
    const ac = abortRef.current;

    void (async () => {
      try {
        const result = await api.getArtifactPreview(projectId, artifactId);
        if (!ac.signal.aborted) {
          setPreview(result);
          setLoading(false);
        }
      } catch (err) {
        if (!ac.signal.aborted) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    })();

    return () => {
      abortRef.current?.abort();
    };
  }, [projectId, artifactId]);

  if (loading) {
    return <div style={{ padding: "12px 0", fontSize: 12, color: "var(--ink-50)" }}>Loading preview…</div>;
  }

  if (error || !preview) {
    return <div style={{ padding: "12px 0", fontSize: 12, color: "var(--signal)" }}>Failed to load preview: {error}</div>;
  }

  return (
    <div ref={refRef} style={{ marginTop: 10, borderRadius: 8, overflow: "hidden", border: "1px solid var(--rule)" }}>
      <iframe
        srcDoc={preview.html}
        sandbox="allow-scripts"
        title={title || preview.title}
        style={{ width: "100%", height: 360, border: "none", display: "block" }}
      />
    </div>
  );
}

export function AgentMessage({ message, text }: { message: Msg; text?: string }) {
  const selectedProjectId = useStore((s) => s.selectedProjectId);
  const { showToast } = useStore.getState();
  const [showPreview, setShowPreview] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const raw = message.rawReply ?? message.message;
  const parsed = parsedJson(raw);
  const isLegacyJson = !message.rawReply && !message.artifactId && parsed !== undefined;
  const summary = isLegacyJson ? "Structured output" : (text ?? message.message);
  const formatted = parsed === undefined ? raw : JSON.stringify(parsed, null, 2);

  useEffect(() => {
    if (!message.artifactId || !selectedProjectId) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShowPreview(true);
          }
        }
      },
      { rootMargin: "100px" }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [message.artifactId, selectedProjectId]);

  const open = (mode: "app" | "browser") => {
    if (!selectedProjectId || !message.artifactId) return;
    void (api as unknown as ArtifactApi).openArtifact(selectedProjectId, message.artifactId, mode)
      .catch((error) => showToast(error instanceof Error ? error.message : String(error)));
  };

  const openTab = () => {
    if (!selectedProjectId || !message.artifactId) return;
    window.dispatchEvent(new CustomEvent("openArtifactTab", {
      detail: { projectId: selectedProjectId, artifactId: message.artifactId }
    }));
  };

  return (
    <div ref={containerRef}>
      <Markdown text={summary} />
      {message.artifactId && (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button className="pillBtn fillBtn mono" onClick={() => open("app")}>Open view</button>
          <button className="pillBtn ghostBtn mono" onClick={() => open("browser")}>Browser</button>
          <button className="pillBtn ghostBtn mono" onClick={openTab}>Open tab</button>
        </div>
      )}
      {showPreview && selectedProjectId && message.artifactId && (
        <ArtifactPreview key={`${selectedProjectId}:${message.artifactId}`} projectId={selectedProjectId} artifactId={message.artifactId} />
      )}
      {(message.rawReply || isLegacyJson) && (
        <details style={{ marginTop: 10 }}>
          <summary className="mono dim" style={{ cursor: "pointer" }}>{message.rawReply ? "Raw reply" : "Formatted raw JSON"}</summary>
          <pre className="mono" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 11, margin: "8px 0 0" }}>{formatted}</pre>
        </details>
      )}
    </div>
  );
}
