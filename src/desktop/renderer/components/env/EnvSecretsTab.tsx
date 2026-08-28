import { useEffect, useState } from "react";
import { useStore } from "../../store";
import type { Project } from "../../types";

export function EnvSecretsTab({ project }: { project: Project }) {
  const { refreshProjects } = useStore.getState();
  const [keys, setKeys] = useState<string[]>([]);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");

  const [accounts, setAccounts] = useState<{ id: string; provider: string; name: string; envKeys: string[] }[]>([]);
  const [accName, setAccName] = useState("");
  const [accKey, setAccKey] = useState("");
  const [accValue, setAccValue] = useState("");

  useEffect(() => { void api.listSecretKeys(project.id).then(setKeys); }, [project.id]);
  useEffect(() => { void api.listAccounts().then(setAccounts); }, []);

  const add = async () => {
    const k = key.trim();
    if (!k || !value) return;
    setKeys(await api.setSecret(project.id, k, value));
    setKey(""); setValue("");
  };

  const remove = async (k: string) => setKeys(await api.removeSecret(project.id, k));

  const providerAccounts = accounts.filter((a) => a.provider === project.backend);

  const addAccount = async () => {
    const name = accName.trim();
    const k = accKey.trim();
    if (!name || !k || !accValue) return;
    setAccounts(await api.addAccount(project.backend, name, { [k]: accValue }));
    setAccName(""); setAccKey(""); setAccValue("");
  };

  const removeAccount = async (id: string) => setAccounts(await api.removeAccount(id));

  const setActive = async (id?: string) => {
    await api.setActiveAccount(project.id, id);
    await refreshProjects();
  };

  return (
    <div style={{ maxWidth: 480 }}>
      <p className="dim" style={{ fontSize: 11, marginTop: -2 }}>
        Encrypted at rest, injected as env vars when this project's agents spawn. Values are never shown again.
      </p>
      {keys.map((k) => (
        <div key={k} className="fField" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="mono" style={{ flex: 1 }}>{k}</span>
          <span className="chip"><span className="x" onClick={() => void remove(k)}>&times;</span></span>
        </div>
      ))}
      <div className="fField" style={{ display: "flex", gap: 8 }}>
        <input className="fInput mono" style={{ width: 160 }} placeholder="KEY" value={key} onChange={(e) => setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))} />
        <input className="fInput mono" style={{ flex: 1 }} type="password" placeholder="value" value={value} onChange={(e) => setValue(e.target.value)} />
        <button className="pillBtn fillBtn" onClick={() => void add()}>add</button>
      </div>

      <h4 style={{ marginTop: 28, marginBottom: 4 }}>Accounts ({project.backend})</h4>
      <p className="dim" style={{ fontSize: 11, marginTop: 0 }}>
        Switch which credentials this project's agents spawn with — useful after a quota or rate-limit hit.
      </p>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginBottom: 6 }}>
        <input type="radio" checked={!project.activeAccountId} onChange={() => void setActive(undefined)} />
        Default (system login)
      </label>
      {providerAccounts.map((a) => (
        <div key={a.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, flex: 1 }}>
            <input type="radio" checked={project.activeAccountId === a.id} onChange={() => void setActive(a.id)} />
            {a.name} <span className="dim mono" style={{ fontSize: 10 }}>({a.envKeys.join(", ")})</span>
          </label>
          <span className="chip"><span className="x" onClick={() => void removeAccount(a.id)}>&times;</span></span>
        </div>
      ))}
      <div className="fField" style={{ display: "flex", gap: 8 }}>
        <input className="fInput" style={{ width: 100 }} placeholder="name" value={accName} onChange={(e) => setAccName(e.target.value)} />
        <input className="fInput mono" style={{ width: 140 }} placeholder="ENV_KEY" value={accKey} onChange={(e) => setAccKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))} />
        <input className="fInput mono" style={{ flex: 1 }} type="password" placeholder="value" value={accValue} onChange={(e) => setAccValue(e.target.value)} />
        <button className="pillBtn fillBtn" onClick={() => void addAccount()}>add account</button>
      </div>
    </div>
  );
}
