import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  listRoles: () => ipcRenderer.invoke("roles:list"),
  listProjects: () => ipcRenderer.invoke("projects:list"),
  addProject: () => ipcRenderer.invoke("projects:add"),
  cloneRepo: (url: string) => ipcRenderer.invoke("projects:addRepo", { url }),
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
  onEvent: (cb: (e: unknown) => void) => {
    ipcRenderer.on("room:event", (_evt, payload) => cb(payload));
  },
});
