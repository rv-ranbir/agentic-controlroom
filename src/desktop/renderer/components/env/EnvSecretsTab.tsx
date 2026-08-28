import { useEffect, useState } from "react";
import type { Project } from "../../types";

export function EnvSecretsTab({ project }: { project: Project }) {
  const [keys, setKeys] = useState<string[]>([]);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");

  useEffect(() => { void api.listSecretKeys(project.id).then(setKeys); }, [project.id]);

  const add = async () => {
    const k = key.trim();
    if (!k || !value) return;
    setKeys(await api.setSecret(project.id, k, value));
    setKey(""); setValue("");
  };

  const remove = async (k: string) => setKeys(await api.removeSecret(project.id, k));

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
    </div>
  );
}
