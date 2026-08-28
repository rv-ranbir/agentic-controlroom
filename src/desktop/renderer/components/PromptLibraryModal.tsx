import { useState } from "react";
import { loadPrompts, savePrompts, type PromptTemplate } from "../lib/promptLibrary";

export function PromptLibraryModal({ onClose }: { onClose: () => void }) {
  const [prompts, setPrompts] = useState<PromptTemplate[]>(loadPrompts);

  const update = (next: PromptTemplate[]) => {
    setPrompts(next);
    savePrompts(next);
  };

  const add = () => update([...prompts, { id: crypto.randomUUID(), shortcut: "", body: "" }]);
  const remove = (id: string) => update(prompts.filter((p) => p.id !== id));
  const edit = (id: string, patch: Partial<PromptTemplate>) =>
    update(prompts.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  return (
    <div className="dialogBackdrop open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialogBox">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3>Prompt library</h3>
          <button className="pillBtn iconBtn ghostBtn" onClick={onClose}>&times;</button>
        </div>
        <p className="dim" style={{ fontSize: 12, marginTop: -4 }}>Type "/" + shortcut in the composer to expand.</p>

        {prompts.map((p) => (
          <div key={p.id} className="fField" style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <input
              className="fInput mono"
              style={{ width: 90 }}
              placeholder="shortcut"
              value={p.shortcut}
              onChange={(e) => edit(p.id, { shortcut: e.target.value.replace(/\s/g, "") })}
            />
            <textarea
              className="fInput"
              rows={2}
              style={{ flex: 1 }}
              placeholder="Prompt text"
              value={p.body}
              onChange={(e) => edit(p.id, { body: e.target.value })}
            />
            <span className="chip"><span className="x" onClick={() => remove(p.id)}>&times;</span></span>
          </div>
        ))}

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14 }}>
          <button className="pillBtn ghostBtn" onClick={add}>+ add prompt</button>
          <button className="pillBtn fillBtn" onClick={onClose}>done</button>
        </div>
      </div>
    </div>
  );
}
