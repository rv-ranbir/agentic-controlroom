interface AgentRef {
  id: string;
  name: string;
}

interface Project {
  id: string;
  name: string;
  path: string;
  backend: "cursor" | "claude";
  model?: string;
  agents: AgentRef[];
}

interface Msg {
  ts: string;
  agentId?: string;
  role: string;
  message: string;
}

interface RoomEvent {
  projectId: string;
  kind: "message" | "status" | "agentState" | "activity" | "running" | "done";
  [k: string]: unknown;
}

declare const api: {
  listRoles(): Promise<AgentRef[]>;
  listProjects(): Promise<Project[]>;
  addProject(): Promise<Project | null>;
  updateProject(u: Partial<Project> & { id: string }): Promise<Project>;
  removeProject(id: string): Promise<void>;
  addAgent(projectId: string, roleId: string): Promise<Project | null>;
  removeAgent(projectId: string, agentId: string): Promise<Project | null>;
  getLog(id: string): Promise<Msg[]>;
  runTask(projectId: string, task: string): Promise<void>;
  sendToAgent(projectId: string, agentId: string, prompt: string): Promise<void>;
  getRunning(): Promise<string[]>;
  onEvent(cb: (e: RoomEvent) => void): void;
};

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const COLORS = ["--c0", "--c1", "--c2", "--c3", "--c4", "--c5"];

let roles: AgentRef[] = [];
let projects: Project[] = [];
let selected: Project | undefined;
let selectedAgent: string | null = null; // null = Room view
let messages: Msg[] = [];
const agentStates = new Map<string, string>(); // agentId -> idle|working|done
const runningKeys = new Set<string>();

function colorFor(agentId: string): string {
  if (agentId === "user") return "var(--accent)";
  if (agentId === "system" || agentId === "orchestrator") return "var(--dim)";
  let h = 0;
  for (const ch of agentId) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return `var(${COLORS[Math.abs(h) % COLORS.length]})`;
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
}

function agentIdOf(m: Msg): string {
  return m.agentId ?? (m.role === "system" ? "system" : m.role.toLowerCase());
}

// ── sidebar: projects ──────────────────────────────────────────

function projectRunning(p: Project): boolean {
  return [...runningKeys].some((k) => k === p.id || k.startsWith(p.id + ":"));
}

function renderProjects() {
  const el = $("#projects");
  el.innerHTML = "";
  if (projects.length === 0) {
    el.innerHTML = '<div class="sideEmpty">No projects. Click + to add a folder.</div>';
    return;
  }
  for (const p of projects) {
    const div = document.createElement("div");
    div.className = "project" + (p.id === selected?.id ? " selected" : "") + (projectRunning(p) ? " running" : "");
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
        if (selected?.id === p.id) selected = undefined;
        void api.removeProject(p.id).then(refresh);
      }
    });
    el.appendChild(div);
  }
}

// ── sidebar: agents grouped by state ───────────────────────────

const GROUPS: [string, (s: string) => boolean][] = [
  ["Working", (s) => s === "working"],
  ["Done", (s) => s === "done"],
  ["Idle", (s) => s !== "working" && s !== "done"],
];

function renderAgents() {
  const el = $("#agents");
  el.innerHTML = "";
  if (!selected) {
    el.innerHTML = '<div class="sideEmpty">Select a project.</div>';
    return;
  }

  // Room entry
  const room = document.createElement("div");
  room.className = "row" + (selectedAgent === null ? " selected" : "");
  room.innerHTML = '<div class="avatar" style="background:var(--bg3);color:var(--fg)">#</div>';
  const roomInfo = document.createElement("div");
  roomInfo.className = "info";
  roomInfo.innerHTML = '<div class="rName">Room</div><div class="rSub">shared chat · run tasks</div>';
  room.appendChild(roomInfo);
  room.addEventListener("click", () => selectAgent(null));
  el.appendChild(room);

  for (const [label, match] of GROUPS) {
    const inGroup = selected.agents.filter((a) => match(agentStates.get(a.id) ?? "idle"));
    if (inGroup.length === 0) continue;
    const head = document.createElement("div");
    head.className = "stateGroup";
    head.textContent = label;
    el.appendChild(head);
    for (const a of inGroup) {
      const state = agentStates.get(a.id) ?? "idle";
      const row = document.createElement("div");
      row.className = "row" + (selectedAgent === a.id ? " selected" : "");
      row.dataset.state = state;
      const av = document.createElement("div");
      av.className = "avatar";
      av.style.background = colorFor(a.id);
      av.textContent = initials(a.name);
      av.innerHTML += '<span class="dot"></span>';
      const info = document.createElement("div");
      info.className = "info";
      info.innerHTML = `<div class="rName">${a.name}</div><div class="rSub">${state}</div>`;
      const del = document.createElement("button");
      del.className = "del";
      del.textContent = "✕";
      del.title = "Remove agent";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        void api.removeAgent(selected!.id, a.id).then(async (p) => {
          if (p) selected = p;
          if (selectedAgent === a.id) selectedAgent = null;
          await refresh();
        });
      });
      row.append(av, info, del);
      row.addEventListener("click", () => selectAgent(a.id));
      el.appendChild(row);
    }
  }
}

// ── main pane ──────────────────────────────────────────────────

function selectAgent(agentId: string | null) {
  selectedAgent = agentId;
  renderAgents();
  renderHeader();
  renderChat();
  renderActivityFilter();
  updateSendState();
}

function renderHeader() {
  const avatar = $("#mainAvatar");
  const title = $("#mainTitle");
  const sub = $("#mainSub");
  const input = $("#task") as HTMLTextAreaElement;
  if (!selectedAgent) {
    avatar.style.background = "var(--bg3)";
    avatar.style.color = "var(--fg)";
    avatar.textContent = "#";
    title.textContent = selected ? `Room — ${selected.name}` : "Room";
    sub.textContent = "shared chatroom — task runs Dev→QA loop";
    input.placeholder = "Describe a task…";
    $("#send").textContent = "Run";
  } else {
    const agent = selected?.agents.find((a) => a.id === selectedAgent);
    avatar.style.background = colorFor(selectedAgent);
    avatar.style.color = "var(--bg)";
    avatar.textContent = agent ? initials(agent.name) : "?";
    title.textContent = agent?.name ?? selectedAgent;
    sub.textContent = "direct message — sees the shared chatroom";
    input.placeholder = `Message ${agent?.name}…`;
    $("#send").textContent = "Send";
  }
}

function visibleMessages(): Msg[] {
  if (!selectedAgent) return messages;
  return messages.filter((m) => {
    const id = agentIdOf(m);
    return id === selectedAgent || id === "user" || id === "system" || id === "orchestrator";
  });
}

function renderChat() {
  const chat = $("#chat");
  chat.innerHTML = "";
  const msgs = visibleMessages();
  if (msgs.length === 0) {
    chat.innerHTML = '<div id="chatEmpty">No messages yet.</div>';
    return;
  }
  for (const m of msgs) appendMsgEl(m);
  chat.scrollTop = chat.scrollHeight;
}

function appendMsgEl(m: Msg) {
  const chat = $("#chat");
  document.getElementById("chatEmpty")?.remove();
  const id = agentIdOf(m);
  const div = document.createElement("div");
  div.className = "msg " + (id === "user" ? "user" : m.role === "system" ? "system" : "agent");
  const avatar = document.createElement("div");
  avatar.className = "mAvatar";
  avatar.style.background = colorFor(id);
  avatar.textContent = m.role === "system" ? "•" : initials(m.role === "user" ? "You" : m.role);
  const content = document.createElement("div");
  content.className = "content";
  const who = document.createElement("div");
  who.className = "who";
  who.style.color = colorFor(id);
  who.textContent = m.role === "user" ? "You" : m.role;
  const time = document.createElement("span");
  time.className = "time";
  time.textContent = new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  who.appendChild(time);
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.style.borderLeftColor = colorFor(id);
  bubble.textContent = m.message;
  content.append(who, bubble);
  div.append(avatar, content);
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
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

function renderActivityFilter() {
  $("#activityTitle").textContent = selectedAgent
    ? `Live activity — ${selected?.agents.find((a) => a.id === selectedAgent)?.name ?? selectedAgent}`
    : "Live activity";
  document.querySelectorAll<HTMLElement>(".act").forEach((a) => {
    a.style.display = !selectedAgent || a.dataset.agent === selectedAgent ? "" : "none";
  });
}

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
      return { kind: String(name), text: input ? JSON.stringify(input).slice(0, 200) : "", cls: "tool" };
    }
    if (type === "result") return { kind: "result", text: String(obj.result ?? "").slice(0, 200), cls: "" };
    if (type === "error") return { kind: "error", text: String(obj.error ?? line).slice(0, 300), cls: "err" };
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
  div.className = `act ${cls}`.trim();
  div.dataset.agent = agentId;
  if (selectedAgent && agentId !== selectedAgent) div.style.display = "none";
  const tag = document.createElement("span");
  tag.className = "tag";
  tag.style.color = colorFor(agentId);
  const agent = selected?.agents.find((a) => a.id === agentId);
  tag.textContent = agent ? initials(agent.name) : agentId.slice(0, 3);
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

// ── run/send ───────────────────────────────────────────────────

function busyNow(): boolean {
  if (!selected) return true;
  if (selectedAgent) return runningKeys.has(`${selected.id}:${selectedAgent}`) || runningKeys.has(selected.id);
  return runningKeys.has(selected.id);
}

function updateSendState() {
  const send = $("#send") as HTMLButtonElement;
  send.disabled = busyNow();
  if (!send.disabled) send.textContent = selectedAgent ? "Send" : "Run";
  else send.textContent = "Working";
}

function submit() {
  const input = $("#task") as HTMLTextAreaElement;
  const text = input.value.trim();
  if (!text || !selected || busyNow()) return;
  input.value = "";
  if (selectedAgent) void api.sendToAgent(selected.id, selectedAgent, text);
  else void api.runTask(selected.id, text);
}

// ── project selection + refresh ────────────────────────────────

async function selectProject(p: Project) {
  selected = p;
  selectedAgent = null;
  agentStates.clear();
  messages = await api.getLog(p.id);
  ($("#backendSel") as HTMLSelectElement).value = p.backend;
  $("#activity").innerHTML = '<div id="activityEmpty">Agent tool calls and work stream here while agents are active.</div>';
  renderProjects();
  renderAgents();
  renderHeader();
  renderChat();
  updateSendState();
}

async function refresh() {
  projects = await api.listProjects();
  if (selected) selected = projects.find((p) => p.id === selected!.id);
  renderProjects();
  renderAgents();
}

// ── wiring ─────────────────────────────────────────────────────

$("#addProject").addEventListener("click", async () => {
  const p = await api.addProject();
  if (p) {
    await refresh();
    await selectProject(projects.find((x) => x.id === p.id) ?? p);
  }
});

$("#addAgent").addEventListener("click", () => {
  if (!selected) return;
  const list = $("#roleList");
  list.innerHTML = "";
  for (const r of roles) {
    const taken = selected.agents.some((a) => a.id === r.id);
    const opt = document.createElement("div");
    opt.className = "roleOpt" + (taken ? " taken" : "");
    const av = document.createElement("div");
    av.className = "avatar";
    av.style.background = colorFor(r.id);
    av.textContent = initials(r.name);
    const label = document.createElement("span");
    label.textContent = r.name + (taken ? " (added)" : "");
    opt.append(av, label);
    if (!taken) {
      opt.addEventListener("click", async () => {
        const p = await api.addAgent(selected!.id, r.id);
        if (p) selected = p;
        $("#modal").classList.remove("open");
        await refresh();
      });
    }
    list.appendChild(opt);
  }
  $("#modal").classList.add("open");
});

$("#modal").addEventListener("click", (e) => {
  if (e.target === $("#modal")) $("#modal").classList.remove("open");
});

($("#backendSel") as HTMLSelectElement).addEventListener("change", (e) => {
  if (!selected) return;
  const backend = (e.target as HTMLSelectElement).value as Project["backend"];
  selected.backend = backend;
  void api.updateProject({ id: selected.id, backend });
});

$("#send").addEventListener("click", submit);
($("#task") as HTMLTextAreaElement).addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    submit();
  }
});

api.onEvent((e) => {
  if (e.kind === "running") {
    // main sends running events only for room runs; direct sends tracked via agentState
    if (e.running) runningKeys.add(e.projectId);
    else runningKeys.delete(e.projectId);
    renderProjects();
    updateSendState();
    return;
  }
  if (e.projectId !== selected?.id) {
    renderProjects();
    return;
  }
  switch (e.kind) {
    case "message": {
      const m = e as unknown as Msg;
      messages.push(m);
      const id = agentIdOf(m);
      if (!selectedAgent || id === selectedAgent || id === "user" || id === "system" || id === "orchestrator") {
        appendMsgEl(m);
      }
      break;
    }
    case "status":
      setStatus(String(e.text ?? ""));
      break;
    case "agentState": {
      const agentId = String(e.agentId);
      const state = String(e.state);
      agentStates.set(agentId, state);
      if (state === "working") runningKeys.add(`${selected.id}:${agentId}`);
      else runningKeys.delete(`${selected.id}:${agentId}`);
      renderAgents();
      renderProjects();
      updateSendState();
      break;
    }
    case "activity":
      addActivity(String(e.agentId), String(e.line));
      break;
    case "done":
      setStatus("");
      updateSendState();
      break;
  }
});

void (async () => {
  roles = await api.listRoles();
  await refresh();
  for (const k of await api.getRunning()) runningKeys.add(k);
  renderProjects();
  if (projects[0]) await selectProject(projects[0]);
  else {
    renderAgents();
    renderHeader();
  }
})();
