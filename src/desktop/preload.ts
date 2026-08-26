import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  listProjects: () => ipcRenderer.invoke("projects:list"),
  addProject: () => ipcRenderer.invoke("projects:add"),
  updateProject: (update: unknown) => ipcRenderer.invoke("projects:update", update),
  removeProject: (id: string) => ipcRenderer.invoke("projects:remove", id),
  getLog: (id: string) => ipcRenderer.invoke("room:log", id),
  runTask: (projectId: string, task: string) => ipcRenderer.invoke("room:run", { projectId, task }),
  getRunning: () => ipcRenderer.invoke("room:running"),
  onEvent: (cb: (e: unknown) => void) => {
    ipcRenderer.on("room:event", (_evt, payload) => cb(payload));
  },
});
