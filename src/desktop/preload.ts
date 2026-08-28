import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  listRoles: () => ipcRenderer.invoke("roles:list"),
  listProjects: () => ipcRenderer.invoke("projects:list"),
  addProject: () => ipcRenderer.invoke("projects:add"),
  cloneRepo: (url: string) => ipcRenderer.invoke("projects:addRepo", { url }),
  githubConnect: (token: string) => ipcRenderer.invoke("github:connect", { token }),
  githubStatus: () => ipcRenderer.invoke("github:status"),
  githubDisconnect: () => ipcRenderer.invoke("github:disconnect"),
  githubListRepos: () => ipcRenderer.invoke("github:listRepos"),
  cloneGithubRepo: (cloneUrl: string, name: string) => ipcRenderer.invoke("projects:addGithubRepo", { cloneUrl, name }),
  updateProject: (update: unknown) => ipcRenderer.invoke("projects:update", update),
  removeProject: (id: string) => ipcRenderer.invoke("projects:remove", id),
  addAgent: (projectId: string, roleId: string, model?: string, extraArgs?: string[]) =>
    ipcRenderer.invoke("agents:add", { projectId, roleId, model, extraArgs }),
  addCustomAgent: (projectId: string, name: string, systemPrompt: string, model?: string, extraArgs?: string[]) =>
    ipcRenderer.invoke("agents:addCustom", { projectId, name, systemPrompt, model, extraArgs }),
  removeAgent: (projectId: string, agentId: string) => ipcRenderer.invoke("agents:remove", { projectId, agentId }),
  getLog: (id: string) => ipcRenderer.invoke("room:log", id),
  runTask: (projectId: string, task: string) => ipcRenderer.invoke("room:run", { projectId, task }),
  sendToAgent: (projectId: string, agentId: string, prompt: string) =>
    ipcRenderer.invoke("agent:send", { projectId, agentId, prompt }),
  pauseAgent: (projectId: string, agentId: string) => ipcRenderer.invoke("agent:pause", { projectId, agentId }),
  getRunning: () => ipcRenderer.invoke("room:running"),
  gitBranch: (path: string) => ipcRenderer.invoke("git:branch", path),
  getDiff: (path: string) => ipcRenderer.invoke("room:diff", path),
  getProjectStats: () => ipcRenderer.invoke("projects:stats"),
  onEvent: (cb: (e: unknown) => void) => {
    ipcRenderer.on("room:event", (_evt, payload) => cb(payload));
  },
  startPty: (projectId: string, agentId: string) => ipcRenderer.invoke("pty:start", { projectId, agentId }),
  writePty: (projectId: string, agentId: string, data: string) => ipcRenderer.invoke("pty:write", { projectId, agentId, data }),
  resizePty: (projectId: string, agentId: string, cols: number, rows: number) =>
    ipcRenderer.invoke("pty:resize", { projectId, agentId, cols, rows }),
  stopPty: (projectId: string, agentId: string) => ipcRenderer.invoke("pty:stop", { projectId, agentId }),
  onPtyData: (cb: (e: { key: string; data: string }) => void) => {
    const handler = (_evt: unknown, payload: { key: string; data: string }) => cb(payload);
    ipcRenderer.on("pty:data", handler);
    return () => ipcRenderer.removeListener("pty:data", handler);
  },
  onPtyExit: (cb: (e: { key: string; exitCode: number }) => void) => {
    const handler = (_evt: unknown, payload: { key: string; exitCode: number }) => cb(payload);
    ipcRenderer.on("pty:exit", handler);
    return () => ipcRenderer.removeListener("pty:exit", handler);
  },
});
