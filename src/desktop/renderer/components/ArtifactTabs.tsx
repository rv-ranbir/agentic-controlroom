import { useEffect, useState } from "react";

interface Tab {
  id: string;
  projectId: string;
  artifactId: string;
  title?: string;
  preview?: { title: string; html: string };
  loading: boolean;
  error?: string;
}

export function ArtifactTabs() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [selectedTabId, setSelectedTabId] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    const handleOpenTab = (e: CustomEvent) => {
      const { projectId, artifactId, title } = e.detail;
      const id = `${projectId}:${artifactId}`;

      setTabs((current) => {
        const existing = current.find((t) => t.id === id);
        if (existing) {
          setSelectedTabId(id);
          return current;
        }
        return [...current, { id, projectId, artifactId, title, loading: true }];
      });
      setSelectedTabId(id);
      setMinimized(false);
    };

    window.addEventListener("openArtifactTab", handleOpenTab as EventListener);
    return () => window.removeEventListener("openArtifactTab", handleOpenTab as EventListener);
  }, []);

  useEffect(() => {
    const loadingTabs = tabs.filter((t) => t.loading);
    if (loadingTabs.length === 0) return;

    const abortControllers = new Map<string, AbortController>();

    for (const tab of loadingTabs) {
      const ac = new AbortController();
      abortControllers.set(tab.id, ac);

      void (async () => {
        try {
          const result = await api.getArtifactPreview(tab.projectId, tab.artifactId);
          if (!ac.signal.aborted) {
            setTabs((current) =>
              current.map((t) => (t.id === tab.id ? { ...t, preview: result, loading: false } : t))
            );
          }
        } catch (err) {
          if (!ac.signal.aborted) {
            setTabs((current) =>
              current.map((t) =>
                t.id === tab.id ? { ...t, error: err instanceof Error ? err.message : String(err), loading: false } : t
              )
            );
          }
        }
      })();
    }

    return () => {
      for (const ac of abortControllers.values()) {
        ac.abort();
      }
    };
  }, [tabs]);

  const closeTab = (id: string) => {
    setTabs((current) => current.filter((t) => t.id !== id));
    if (selectedTabId === id) {
      setSelectedTabId(tabs.find((t) => t.id !== id)?.id ?? null);
    }
  };

  const selectedTab = tabs.find((t) => t.id === selectedTabId);

  if (tabs.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        height: minimized ? 60 : "min(72vh, 720px)",
        maxHeight: "85vh",
        background: "var(--deck)",
        border: "1px solid var(--rule)",
        display: "flex",
        flexDirection: "column",
        zIndex: 100,
        transition: "max-height 0.2s ease",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderBottom: minimized ? "none" : "1px solid var(--rule)",
          minHeight: 46,
          overflowX: "auto",
        }}
      >
        <div role="tablist" aria-label="Visual artifacts"
          style={{
            display: "flex",
            gap: 4,
            flex: 1,
            minWidth: 0,
          }}
        >
          {tabs.map((tab) => (
            <div
              key={tab.id}
              role="tab" aria-selected={selectedTabId===tab.id} tabIndex={0}
              onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){setSelectedTabId(tab.id);setMinimized(false);}}}
              onClick={() => {
                setSelectedTabId(tab.id);
                setMinimized(false);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 10px",
                background: selectedTabId === tab.id ? "var(--sink)" : "transparent",
                border: `1px solid ${selectedTabId === tab.id ? "var(--rule)" : "transparent"}`,
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 12,
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              <span>{tab.title || tab.preview?.title || "Loading view…"}</span>
              <button aria-label={`Close ${tab.title || tab.preview?.title || "view"}`}
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--ink-50)",
                  cursor: "pointer",
                  padding: 0,
                  fontSize: 14,
                  lineHeight: 1,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <button
          aria-label={minimized ? "Restore views" : "Minimize views"}
          onClick={() => setMinimized(!minimized)}
          style={{
            background: "var(--ink-8)",
            border: "1px solid var(--rule)",
            borderRadius: 6,
            padding: "5px 8px",
            cursor: "pointer",
            fontSize: 11,
            color: "var(--ink)",
            flexShrink: 0,
          }}
        >
          {minimized ? `Views (${tabs.length})` : "−"}
        </button>
      </div>

      {!minimized && selectedTab && (
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {selectedTab.loading && (
            <div style={{ padding: 16, fontSize: 12, color: "var(--ink-50)" }}>Loading…</div>
          )}
          {selectedTab.error && (
            <div style={{ padding: 16, fontSize: 12, color: "var(--signal)" }}>
              Failed to load: {selectedTab.error}
            </div>
          )}
          {selectedTab.preview && (
            <iframe
              srcDoc={selectedTab.preview.html}
              sandbox="allow-scripts"
              title={selectedTab.title || selectedTab.preview.title}
              style={{ width: "100%", height: "100%", border: "none", display: "block" }}
            />
          )}
        </div>
      )}
    </div>
  );
}
