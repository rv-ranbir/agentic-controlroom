import { useRef, useState } from "react";
import { useStore } from "../store";
import { bucketOf } from "../lib/agents";
import { loadPrompts } from "../lib/promptLibrary";
import { PromptLibraryModal } from "./PromptLibraryModal";

export function Composer() {
  const selectedProjectId = useStore((s) => s.selectedProjectId);
  const project = useStore((s) => s.projects.find((p) => p.id === selectedProjectId));
  const selectedAgent = useStore((s) => s.selectedAgent);
  const agentStates = useStore((s) => s.agentStates);
  const localSeen = useStore((s) => s.localSeen);
  const localForceActive = useStore((s) => s.localForceActive);
  const localPaused = useStore((s) => s.localPaused);
  const runningKeys = useStore((s) => s.runningKeys);
  const queueKey = `${project?.id ?? ""}:${selectedAgent ?? ""}`;
  const queued = useStore((s) => s.composerQueue[queueKey]) ?? [];
  const { submitComposer, dequeueComposer, showToast } = useStore.getState();
  const [text, setText] = useState("");
  const [prompts, setPrompts] = useState(loadPrompts);
  const [libOpen, setLibOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const slashMatch = /^\/(\S*)$/.exec(text);
  const suggestions = slashMatch
    ? prompts.filter((p) => p.shortcut && p.shortcut.toLowerCase().startsWith(slashMatch[1].toLowerCase()))
    : [];
  const applySuggestion = (body: string) => setText(body);

  const captureShot = async () => {
    if (!project) return;
    setCapturing(true);
    try {
      const path = await api.captureScreenshot(project.id, selectedAgent ?? undefined);
      setText((t) => (t ? `${t} ${path}` : path));
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    } finally {
      setCapturing(false);
    }
  };

  const toggleDictate = async () => {
    if (recording) { recorderRef.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        setTranscribing(true);
        try {
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          const transcript = await api.transcribeAudio(new Uint8Array(await blob.arrayBuffer()));
          if (transcript) setText((t) => (t ? `${t} ${transcript}` : transcript));
          else showToast("No speech detected.");
        } catch (err) {
          showToast(err instanceof Error ? err.message : String(err));
        } finally {
          setTranscribing(false);
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
  };

  const busy = !project
    ? true
    : selectedAgent
      ? !!runningKeys[`${project.id}:${selectedAgent}`] || !!runningKeys[project.id] || !!localPaused[selectedAgent]
      : !!runningKeys[project.id];

  const agent = project?.agents.find((a) => a.id === selectedAgent);
  const bucket = selectedAgent ? bucketOf(selectedAgent, { agentStates, localSeen, localForceActive }) : "idle";
  const placeholder = !selectedAgent ? "Describe a task…" : bucket === "needs" ? `Answer ${agent?.name}…` : `Message ${agent?.name}…`;
  const sendLabel = busy ? "queue" : selectedAgent ? "send" : "run";

  const submit = () => {
    const v = text.trim();
    if (!v || !project || !project.agents.length) return;
    setText("");
    submitComposer(v);
  };

  return (
    <div id="composerWrap">
      {queued.length > 0 && (
        <div className="queueRow mono dim">
          {queued.map((q, i) => (
            <span className="chip" key={i}>
              <span>{q.length > 40 ? `${q.slice(0, 40)}…` : q}</span>
              <span className="x" onClick={() => dequeueComposer(queueKey, i)}>&times;</span>
            </span>
          ))}
        </div>
      )}
      {suggestions.length > 0 && (
        <div className="suggestRow mono">
          {suggestions.map((p) => (
            <div key={p.id} className="suggestOpt" onMouseDown={(e) => { e.preventDefault(); applySuggestion(p.body); }}>
              /{p.shortcut}
            </div>
          ))}
        </div>
      )}
      <div className="composerRow">
        <button
          className="pillBtn iconBtn ghostBtn"
          title="Prompt library"
          onClick={() => setLibOpen(true)}
        >
          /
        </button>
        <button
          className="pillBtn ghostBtn mono"
          title="Capture screenshot"
          disabled={!project || capturing}
          onClick={() => void captureShot()}
        >
          {capturing ? "…" : "shot"}
        </button>
        <button
          className="pillBtn ghostBtn mono"
          title="Dictate (local Whisper)"
          disabled={!project || transcribing}
          onClick={() => void toggleDictate()}
        >
          {transcribing ? "…" : recording ? "stop" : "mic"}
        </button>
        <input
          className="composerInput mono"
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (suggestions.length > 0) applySuggestion(suggestions[0].body);
              else submit();
            }
            if (e.key === "Escape") (e.target as HTMLInputElement).blur();
          }}
        />
        <button className="pillBtn sendBtn mono" disabled={!project || !project.agents.length || !text.trim()} onClick={submit}>{sendLabel}</button>
      </div>
      <div className="hintRow dim mono">&crarr; {busy ? "queue" : "send"} &middot; esc roster</div>
      {libOpen && <PromptLibraryModal onClose={() => { setLibOpen(false); setPrompts(loadPrompts()); }} />}
    </div>
  );
}
