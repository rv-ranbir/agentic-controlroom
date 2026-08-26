interface Project {
  id: string;
  name: string;
  path: string;
  backend: "cursor" | "claude";
  model?: string;
}

interface RoomEvent {
  projectId: string;
  kind: "message" | "status" | "agentState" | "activity" | "running" | "done";
  [k: string]: unknown;
}

declare const api: {
  listProjects(): Promise<Project[]>;
  addProject(): Promise<Project | null>;
  updateProject(u: Partial<Project> & { id: string }): Promise<Project>;
  removeProject(id: string): Promise<void>;
  getLog(id: string): Promise<{ ts: string; role: string; message: string }[]>;
  runTask(projectId: string, task: string): Promise<void>;
  getRunning(): Promise<string[]>;
  onEvent(cb: (e: RoomEvent) => void): void;
};

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

let projects: Project[] = [];
let selected: Project | undefined;
const runningIds = new Set<string>();
let activityFilter = "";

// ── projects rail ──────────────────────────────────────────────

function renderProjects() {
  const el = $("#projects");
  el.innerHTML = "";
  if (projects.length === 0) {
    el.innerHTML = '<div id="railEmpty">No projects yet. Click + to add a folder.</div>';
    return;
  }
  for (const p of projects) {
    const div = document.createElement("div");
    div.className =
      "project" + (p.id === selected?.id ? " selected" : "") + (runningIds.has(p.id) ? " running" : "");
    const name = document.createElement("span");
    name.className = "pName";
    name.textContent = p.name;
    name.title = p.path;
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = "running";
    div.append(name, badge);
    div.addEventListener("click", () => void selectProject(p));
    div.addEventListener("contextmenu", () => {
      if (confirm(`Remove project "${p.name}" from Agent Room? (files untouched)`)) {
        void api.removeProject(p.id).then(refreshProjects);
        if (selected?.id === p.id) selected = undefined;
      }
    });
    el.appendChild(div);
  }
}

async function refreshProjects() {
  projects = await api.listProjects();
  renderProjects();
}

async function selectProject(p: Project) {
  selected = p;
  $("#roomTitle").textContent = p.name;
  ($("#backendSel") as HTMLSelectElement).value = p.backend;
  renderProjects();
  clearChat();
  clearActivity();
  setAgentState("dev", "idle");
  setAgentState("qa", "idle");
  const history = await api.getLog(p.id);
  for (const m of history) addMessage(m.role, m.message, m.ts);
  updateRunButton();
}

// ── chat ───────────────────────────────────────────────────────

function clearChat() {
  $("#chat").innerHTML = "";
}

function addMessage(role: string, message: string, ts: string) {
  const chat = $("#chat");
  document.getElementById("chatEmpty")?.remove();
  const safeRole = role.replace(/[^A-Za-z]/g, "");
  const div = document.createElement("div");
  div.className = "msg " + safeRole;
  const avatar = document.createElement("div");
  avatar.className = "mAvatar";
  avatar.textContent = role === "system" ? "•" : role[0].toUpperCase();
  const content = document.createElement("div");
  content.className = "content";
  const who = document.createElement("div");
  who.className = "who";
  who.textContent = role;
  const time = document.createElement("span");
  time.className = "time";
  time.textContent = new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  who.appendChild(time);
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = message;
  content.append(who, bubble);
  div.append(avatar, content);
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function setAgentState(agentId: string, state: string) {
  const card = document.getElementById("agent-" + agentId);
  if (!card) return;
  card.dataset.state = state;
  const label = card.querySelector(".label");
  if (label) label.textContent = state;
}

function setStatus(text: string) {
  const el = $("#statusLine");
  el.innerHTML = "";
  if (text) {
    const span = document.createElement("span");
    span.textContent = text.replace(/…$/, "");
    span.className = "dots";
    el.appendChild(span);
  }
}

// ── activity feed ──────────────────────────────────────────────

function clearActivity() {
  $("#activity").innerHTML = "";
}

/** Turn a raw stream-json line into a compact display entry. */
function describeLine(line: string): { kind: string; text: string; cls: string } {
  try {
    const obj = JSON.parse(line);
    const type = String(obj.type ?? "event");
    if (type === "assistant" || type === "message") {
      const content = obj.message?.content;
      const text = Array.isArray(content)
        ? content.map((c: { text?: string }) => c.text ?? "").join("")
        : (obj.message?.text ?? obj.text ?? "");
      if (text) return { kind: "says", text: String(text).slice(0, 400), cls: "" };
    }
    if (type.includes("tool")) {
      const name = obj.tool_call?.name ?? obj.tool_name ?? obj.name ?? obj.subtype ?? "tool";
      const input = obj.tool_call?.arguments ?? obj.input ?? obj.args;
      const inputStr = input ? JSON.stringify(input).slice(0, 200) : "";
      return { kind: String(name), text: inputStr, cls: "tool" };
    }
    if (type === "result") {
      return { kind: "result", text: String(obj.result ?? "").slice(0, 200), cls: "" };
    }
    if (type === "error") {
      return { kind: "error", text: String(obj.error ?? line).slice(0, 300), cls: "err" };
    }
    if (type === "system") return { kind: "system", text: String(obj.subtype ?? "init"), cls: "" };
    return { kind: type, text: line.slice(0, 200), cls: "" };
  } catch {
    return { kind: "raw", text: line.slice(0, 300), cls: "" };
  }
}

function addActivity(agentId: string, line: string) {
  const feed = $("#activity");
  document.getElementById("activityEmpty")?.remove();
  const { kind, text, cls } = describeLine(line);
  const div = document.createElement("div");
  div.className = `act ${agentId} ${cls}`.trim();
  div.dataset.agent = agentId;
  if (activityFilter && agentId !== activityFilter) div.style.display = "none";
  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = agentId === "dev" ? "Dev" : agentId === "qa" ? "QA" : agentId;
  const kindEl = document.createElement("span");
  kindEl.className = "kind";
  kindEl.textContent = kind;
  const textEl = document.createElement("span");
  textEl.className = "text";
  textEl.textContent = text;
  div.append(tag, kindEl, textEl);
  feed.appendChild(div);
  while (feed.children.length > 800) feed.removeChild(feed.firstChild!);
  feed.scrollTop = feed.scrollHeight;
}

// ── run ────────────────────────────────────────────────────────

function updateRunButton() {
  const send = $("#send") as HTMLButtonElement;
  const busy = !!selected && runningIds.has(selected.id);
  send.disabled = !selected || busy;
  send.textContent = busy ? "Running" : "Run";
}

function submit() {
  const input = $("#task") as HTMLTextAreaElement;
  const task = input.value.trim();
  if (!task || !selected || runningIds.has(selected.id)) return;
  input.value = "";
  void api.runTask(selected.id, task);
}

// ── wiring ─────────────────────────────────────────────────────

$("#addProject").addEventListener("click", async () => {
  const p = await api.addProject();
  if (p) {
    await refreshProjects();
    await selectProject(projects.find((x) => x.id === p.id) ?? p);
  }
});

($("#backendSel") as HTMLSelectElement).addEventListener("change", (e) => {
  if (!selected) return;
  const backend = (e.target as HTMLSelectElement).value as Project["backend"];
  selected.backend = backend;
  void api.updateProject({ id: selected.id, backend }).then(refreshProjects);
});

$("#send").addEventListener("click", submit);
($("#task") as HTMLTextAreaElement).addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    submit();
  }
});

for (const btn of Array.from(document.querySelectorAll<HTMLButtonElement>(".filterBtn"))) {
  btn.addEventListener("click", () => {
    activityFilter = btn.dataset.agent ?? "";
    document.querySelectorAll(".filterBtn").forEach((b) => b.classList.toggle("active", b === btn));
    document.querySelectorAll<HTMLElement>(".act").forEach((a) => {
      a.style.display = !activityFilter || a.dataset.agent === activityFilter ? "" : "none";
    });
  });
}

api.onEvent((e) => {
  if (e.kind === "running") {
    if (e.running) runningIds.add(e.projectId);
    else runningIds.delete(e.projectId);
    renderProjects();
    updateRunButton();
    return;
  }
  if (e.projectId !== selected?.id) return; // other projects update rail badge only
  switch (e.kind) {
    case "message":
      addMessage(String(e.role), String(e.message), String(e.ts));
      break;
    case "status":
      setStatus(String(e.text ?? ""));
      break;
    case "agentState":
      setAgentState(String(e.agentId), String(e.state));
      break;
    case "activity":
      addActivity(String(e.agentId), String(e.line));
      break;
    case "done":
      setStatus("");
      break;
  }
});

void (async () => {
  await refreshProjects();
  for (const id of await api.getRunning()) runningIds.add(id);
  renderProjects();
  if (projects[0]) await selectProject(projects[0]);
})();
