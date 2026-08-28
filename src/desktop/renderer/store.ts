import { create } from "zustand";
import type { AgentRef, Project, Msg, RoomEvent, DiffResult } from "./types";
import { bucketOf } from "./lib/agents";
import { pushTick, clearTicks } from "./lib/rail";

export type View = "launcher" | "room" | "review" | "terminal";

interface State {
  roles: AgentRef[];
  projects: Project[];
  selectedProjectId: string | null;
  selectedAgent: string | null;
  splitAgent: string | null; // M2: second agent shown side-by-side with selectedAgent
  messages: Msg[];
  branch: string;
  view: View;
  theme: "dark" | "light";
  toast: string;
  rawMode: boolean;
  repoCloning: boolean;
  agentStates: Record<string, string>;
  stateSince: Record<string, number>;
  localSeen: Record<string, true>;
  localForceActive: Record<string, true>;
  localPaused: Record<string, true>;
  runningKeys: Record<string, true>;
  activityLog: Record<string, { ts: string; agentId: string; kind: "tool"; text: string; raw?: string }[]>;
  diff: DiffResult | null;
  diffLoading: boolean;
  projectStats: Record<string, { blocked: number; lastActivityAt: number }>;

  init(): Promise<void>;
  fetchDiff(): Promise<void>;
  fetchProjectStats(): Promise<void>;
  showView(v: View): void;
  toggleTheme(): void;
  showToast(text: string): void;
  refreshProjects(): Promise<void>;
  selectProject(p: Project): Promise<void>;
  selectAgent(id: string | null): void;
  toggleSplit(agentId: string): void;
  createProject(): Promise<void>;
  createRepoProject(url: string): Promise<void>;
  removeProject(id: string): Promise<void>;
  updateProjectBackend(id: string, backend: Project["backend"]): void;
  setZone(id: string, zone: Project["zone"]): void;
  addAgent(roleId: string, model?: string, extraArgs?: string[]): Promise<void>;
  addCustomAgent(name: string, systemPrompt: string, model?: string, extraArgs?: string[]): Promise<void>;
  removeAgent(agentId: string): Promise<void>;
  submitComposer(text: string): void;
  toggleRawMode(): void;
  togglePaused(agentId: string): void;
  markReviewed(agentId: string): void;
  approve(agentId: string): void;
  reject(agentId: string): void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useStore = create<State>((set, get) => ({
  roles: [],
  projects: [],
  selectedProjectId: null,
  selectedAgent: null,
  splitAgent: null,
  messages: [],
  branch: "",
  view: "launcher",
  theme: (localStorage.getItem("agentroom-theme") as "dark" | "light") ?? "dark",
  toast: "",
  rawMode: false,
  repoCloning: false,
  agentStates: {},
  stateSince: {},
  localSeen: {},
  localForceActive: {},
  localPaused: {},
  runningKeys: {},
  activityLog: {},
  diff: null,
  diffLoading: false,
  projectStats: {},

  async fetchProjectStats() {
    const projectStats = await api.getProjectStats();
    set({ projectStats });
  },

  async fetchDiff() {
    const s = get();
    const project = s.projects.find((p) => p.id === s.selectedProjectId);
    if (!project) return;
    set({ diffLoading: true });
    try {
      const diff = await api.getDiff(project.path);
      set({ diff });
    } finally {
      set({ diffLoading: false });
    }
  },

  async init() {
    if (get().theme === "light") document.documentElement.setAttribute("data-theme", "light");
    const [roles, projects, running] = await Promise.all([api.listRoles(), api.listProjects(), api.getRunning()]);
    const runningKeys: Record<string, true> = {};
    for (const k of running) runningKeys[k] = true;
    set({ roles, projects, runningKeys, view: "launcher" });
  },

  showView(v) { set({ view: v }); },

  toggleTheme() {
    const next = get().theme === "dark" ? "light" : "dark";
    if (next === "light") document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
    localStorage.setItem("agentroom-theme", next);
    set({ theme: next });
  },

  showToast(text) {
    set({ toast: text });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => set({ toast: "" }), 2600);
  },

  async refreshProjects() {
    const projects = await api.listProjects();
    set({ projects });
  },

  async selectProject(p) {
    clearTicks();
    const messages = await api.getLog(p.id);
    set({
      selectedProjectId: p.id, selectedAgent: null, splitAgent: null, messages, branch: "",
      agentStates: {}, stateSince: {}, localSeen: {}, localForceActive: {}, localPaused: {}, activityLog: {},
      diff: null,
    });
    void api.gitBranch(p.path).then((b) => set({ branch: b }));
    const lastOpenedAt = Date.now();
    void api.updateProject({ id: p.id, lastOpenedAt });
    set((s) => ({ projects: s.projects.map((x) => (x.id === p.id ? { ...x, lastOpenedAt } : x)) }));
  },

  selectAgent(id) { set({ selectedAgent: id, splitAgent: null }); },

  toggleSplit(agentId) {
    set((s) => {
      if (s.splitAgent === agentId) return { splitAgent: null };
      if (agentId === s.selectedAgent) return {}; // can't split an agent against itself
      return { splitAgent: agentId };
    });
  },

  async createProject() {
    const p = await api.addProject();
    if (p) {
      await get().refreshProjects();
      await get().selectProject(get().projects.find((x) => x.id === p.id) ?? p);
      set({ view: "room" });
    }
  },

  async createRepoProject(url) {
    set({ repoCloning: true });
    try {
      const p = await api.cloneRepo(url);
      if (p) {
        await get().refreshProjects();
        await get().selectProject(get().projects.find((x) => x.id === p.id) ?? p);
        set({ view: "room" });
      }
    } catch (err) {
      get().showToast(err instanceof Error ? err.message : String(err));
    } finally {
      set({ repoCloning: false });
    }
  },

  async removeProject(id) {
    if (get().selectedProjectId === id) set({ selectedProjectId: null, selectedAgent: null });
    await api.removeProject(id);
    await get().refreshProjects();
  },

  updateProjectBackend(id, backend) {
    set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, backend } : p)) }));
    void api.updateProject({ id, backend });
  },

  setZone(id, zone) {
    set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, zone } : p)) }));
    void api.updateProject({ id, zone });
  },

  async addAgent(roleId, model, extraArgs) {
    const s = get();
    if (!s.selectedProjectId) return;
    const p = await api.addAgent(s.selectedProjectId, roleId, model, extraArgs);
    if (p) set((st) => ({ projects: st.projects.map((x) => (x.id === p.id ? p : x)) }));
  },

  async addCustomAgent(name, systemPrompt, model, extraArgs) {
    const s = get();
    if (!s.selectedProjectId) return;
    const p = await api.addCustomAgent(s.selectedProjectId, name, systemPrompt, model, extraArgs);
    if (p) set((st) => ({ projects: st.projects.map((x) => (x.id === p.id ? p : x)) }));
  },

  async removeAgent(agentId) {
    const s = get();
    if (!s.selectedProjectId) return;
    const p = await api.removeAgent(s.selectedProjectId, agentId);
    if (p) set((st) => ({
      projects: st.projects.map((x) => (x.id === p.id ? p : x)),
      selectedAgent: st.selectedAgent === agentId ? null : st.selectedAgent,
      splitAgent: st.splitAgent === agentId ? null : st.splitAgent,
    }));
  },

  submitComposer(text) {
    const s = get();
    if (!s.selectedProjectId) return;
    if (s.selectedAgent) void api.sendToAgent(s.selectedProjectId, s.selectedAgent, text);
    else void api.runTask(s.selectedProjectId, text);
  },

  toggleRawMode() { set((s) => ({ rawMode: !s.rawMode })); },

  togglePaused(agentId) {
    const s = get();
    const bucket = bucketOf(agentId, { agentStates: s.agentStates, localSeen: s.localSeen, localForceActive: s.localForceActive });
    if (bucket === "active" && !s.localPaused[agentId]) {
      // Real pause: kill the in-flight process. Its exit flows back through the
      // normal agentState event (idle, via sendToAgent's catch block) — don't
      // fake the state here, let the real one arrive.
      if (s.selectedProjectId) void api.pauseAgent(s.selectedProjectId, agentId);
      return;
    }
    set((st) => {
      const next = { ...st.localPaused };
      if (next[agentId]) delete next[agentId]; else next[agentId] = true;
      return { localPaused: next };
    });
  },

  markReviewed(agentId) {
    set((s) => ({ localSeen: { ...s.localSeen, [agentId]: true } }));
  },

  approve(agentId) {
    set((s) => {
      const forceActive = { ...s.localForceActive }; delete forceActive[agentId];
      return { localSeen: { ...s.localSeen, [agentId]: true }, localForceActive: forceActive };
    });
  },

  reject(agentId) {
    set((s) => {
      const seen = { ...s.localSeen }; delete seen[agentId];
      return { localForceActive: { ...s.localForceActive, [agentId]: true }, localSeen: seen };
    });
  },
}));

// ── wire the main-process event stream into the store ────────────
api.onEvent((e: RoomEvent) => {
  const s = useStore.getState();
  if (e.kind === "running") {
    const runningKeys = { ...s.runningKeys };
    if (e.running) runningKeys[e.projectId] = true; else delete runningKeys[e.projectId];
    useStore.setState({ runningKeys });
    void s.refreshProjects();
    return;
  }
  if (e.projectId !== s.selectedProjectId) {
    void s.refreshProjects();
    return;
  }
  switch (e.kind) {
    case "message": {
      const m = e as unknown as Msg;
      useStore.setState({ messages: [...useStore.getState().messages, m] });
      break;
    }
    case "status":
      if (e.text) s.showToast(String(e.text));
      break;
    case "agentState": {
      const agentId = String(e.agentId);
      const state = String(e.state);
      const prevBucket = bucketOf(agentId, s);
      const agentStates = { ...s.agentStates, [agentId]: state };
      const stateSince = { ...s.stateSince, [agentId]: Date.now() };
      const localForceActive = { ...s.localForceActive }; delete localForceActive[agentId];
      const localSeen = { ...s.localSeen }; if (state !== "done") delete localSeen[agentId];
      const localPaused = { ...s.localPaused };
      const runningKeys = { ...s.runningKeys };
      const key = `${s.selectedProjectId}:${agentId}`;
      if (state === "working") { runningKeys[key] = true; delete localPaused[agentId]; }
      else delete runningKeys[key];
      useStore.setState({ agentStates, stateSince, localForceActive, localSeen, localPaused, runningKeys });
      const nextBucket = bucketOf(agentId, useStore.getState());
      if (nextBucket !== prevBucket) pushTick(agentId, nextBucket === "needs");
      break;
    }
    case "activity": {
      const agentId = String(e.agentId);
      const line = String(e.line);
      const arr = [...(s.activityLog[agentId] ?? [])];
      arr.push({ ts: new Date().toISOString(), agentId, kind: "tool", text: line, raw: line });
      if (arr.length > 500) arr.shift();
      useStore.setState({ activityLog: { ...s.activityLog, [agentId]: arr } });
      pushTick(agentId);
      break;
    }
    case "done":
      break;
  }
});
