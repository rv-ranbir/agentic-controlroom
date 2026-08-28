import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { fuzzyMatch } from "../lib/fuzzy";

interface GhRepo { name: string; fullName: string; cloneUrl: string; private: boolean; updatedAt: string }
interface GhStatus { connected: boolean; login?: string }

export function GithubPanel() {
  const { showToast, refreshProjects, selectProject, showView } = useStore.getState();
  const [status, setStatus] = useState<GhStatus>({ connected: false });
  const [token, setToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [repos, setRepos] = useState<GhRepo[] | null>(null);
  const [reposLoading, setReposLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [cloningFullName, setCloningFullName] = useState<string | null>(null);

  useEffect(() => { void api.githubStatus().then(setStatus); }, []);

  async function connect() {
    const trimmed = token.trim();
    if (!trimmed) return;
    setConnecting(true);
    try {
      const { login } = await api.githubConnect(trimmed);
      setStatus({ connected: true, login });
      setToken("");
      showToast(`Connected to GitHub as ${login}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    } finally {
      setConnecting(false);
    }
  }

  async function disconnect() {
    await api.githubDisconnect();
    setStatus({ connected: false });
    setRepos(null);
  }

  async function loadRepos() {
    setReposLoading(true);
    try {
      setRepos(await api.githubListRepos());
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    } finally {
      setReposLoading(false);
    }
  }

  async function cloneRepo(repo: GhRepo) {
    setCloningFullName(repo.fullName);
    try {
      const p = await api.cloneGithubRepo(repo.cloneUrl, repo.name);
      if (p) {
        await refreshProjects();
        await selectProject(p);
        showView("room");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    } finally {
      setCloningFullName(null);
    }
  }

  const filteredRepos = useMemo(
    () => (repos ?? []).filter((r) => fuzzyMatch(query, r.fullName)),
    [repos, query],
  );

  if (!status.connected) {
    return (
      <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--rule)" }}>
        <div className="fLabel">GitHub</div>
        <div className="repoRow">
          <input
            type="password"
            className="fInput mono"
            placeholder="Personal access token (repo scope)"
            value={token}
            disabled={connecting}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && token.trim() && !connecting) void connect(); }}
          />
          <button className="pillBtn fillBtn" disabled={connecting || !token.trim()} onClick={() => void connect()}>
            {connecting ? "connecting…" : "connect"}
          </button>
        </div>
        <p className="dim" style={{ fontSize: 11, marginTop: 6 }}>
          Stored encrypted via your OS keychain, never written in plain text. Create one at github.com/settings/tokens (repo scope).
        </p>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--rule)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span className="fLabel" style={{ marginBottom: 0 }}>GitHub &middot; connected as {status.login ?? "?"}</span>
        <div style={{ display: "flex", gap: 6 }}>
          {!repos && <button className="pillBtn ghostBtn mono" disabled={reposLoading} onClick={() => void loadRepos()}>{reposLoading ? "loading…" : "browse repos"}</button>}
          <button className="pillBtn ghostBtn mono" onClick={() => void disconnect()}>disconnect</button>
        </div>
      </div>
      {repos && (
        <>
          <input
            className="fInput mono"
            style={{ marginTop: 10 }}
            placeholder="Filter repos…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="lnList" style={{ maxHeight: 280, overflowY: "auto" }}>
            {filteredRepos.length === 0 && <div className="lnEmpty">No matches.</div>}
            {filteredRepos.map((r) => (
              <div key={r.fullName} className="lnItem" style={{ cursor: "default" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="liName">{r.fullName}</div>
                  <div className="liPath">{r.private ? "private" : "public"} &middot; updated {new Date(r.updatedAt).toLocaleDateString()}</div>
                </div>
                <button
                  className="pillBtn ghostBtn mono"
                  disabled={cloningFullName === r.fullName}
                  onClick={() => void cloneRepo(r)}
                >
                  {cloningFullName === r.fullName ? "cloning…" : "clone + open"}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
