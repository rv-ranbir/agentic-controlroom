import { useEffect, useState } from "react";
import type { Project } from "../../types";

export function EnvMemoryTab({ project }: { project: Project }) {
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(true);

  useEffect(() => { void api.getMemory(project.id).then((t) => { setText(t); setSaved(true); }); }, [project.id]);

  const save = async () => {
    await api.setMemory(project.id, text);
    setSaved(true);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minHeight: 0 }}>
      <p className="dim" style={{ fontSize: 11, margin: 0 }}>Prepended into every agent's system prompt for this project.</p>
      <textarea
        className="fInput mono"
        style={{ flex: 1, minHeight: 200 }}
        value={text}
        onChange={(e) => { setText(e.target.value); setSaved(false); }}
      />
      <div>
        <button className="pillBtn fillBtn" disabled={saved} onClick={() => void save()}>{saved ? "saved" : "save"}</button>
      </div>
    </div>
  );
}
