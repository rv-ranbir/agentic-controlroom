import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  listRoles: () => ipcRenderer.invoke("roles:list"),
  listProjects: () => ipcRenderer.invoke("projects:list"),
  addProject: () => ipcRenderer.invoke("projects:add"),
  updateProject: (update: unknown) => ipcRenderer.invoke("projects:update", update),
  removeProject: (id: string) => ipcRenderer.invoke("projects:remove", id),
  addAgent: (projectId: string, roleId: string) => ipcRenderer.invoke("agents:add", { projectId, roleId }),
  removeAgent: (projectId: string, agentId: string) => ipcRenderer.invoke("agents:remove", { projectId, agentId }),
  getLog: (id: string) => ipcRenderer.invoke("room:log", id),
  runTask: (projectId: string, task: string) => ipcRenderer.invoke("room:run", { projectId, task }),
  sendToAgent: (projectId: string, agentId: string, prompt: string) =>
    ipcRenderer.invoke("agent:send", { projectId, agentId, prompt }),
  getRunning: () => ipcRenderer.invoke("room:running"),
  onEvent: (cb: (e: unknown) => void) => {
    ipcRenderer.on("room:event", (_evt, payload) => cb(payload));
  },
});
