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
  addAgent: (projectId: string, roleId: string, model?: string, extraArgs?: string[], useWorktree?: boolean) =>
    ipcRenderer.invoke("agents:add", { projectId, roleId, model, extraArgs, useWorktree }),
  addCustomAgent: (projectId: string, name: string, systemPrompt: string, model?: string, extraArgs?: string[], useWorktree?: boolean) =>
    ipcRenderer.invoke("agents:addCustom", { projectId, name, systemPrompt, model, extraArgs, useWorktree }),
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
  approveDiff: (projectId: string, agentId: string) => ipcRenderer.invoke("room:approve", { projectId, agentId }),
  getCommits: (projectId: string) => ipcRenderer.invoke("room:commits", projectId),
  onEvent: (cb: (e: unknown) => void) => {
    ipcRenderer.on("room:event", (_evt, payload) => cb(payload));
  },
  startPty: (projectId: string, agentId: string) => ipcRenderer.invoke("pty:start", { projectId, agentId }),
  writePty: (projectId: string, agentId: string, data: string) => ipcRenderer.invoke("pty:write", { projectId, agentId, data }),
  resizePty: (projectId: string, agentId: string, cols: number, rows: number) =>
    ipcRenderer.invoke("pty:resize", { projectId, agentId, cols, rows }),
  stopPty: (projectId: string, agentId: string) => ipcRenderer.invoke("pty:stop", { projectId, agentId }),
  startShellPty: (projectId: string) => ipcRenderer.invoke("shellpty:start", { projectId }),
  writeShellPty: (projectId: string, data: string) => ipcRenderer.invoke("shellpty:write", { projectId, data }),
  resizeShellPty: (projectId: string, cols: number, rows: number) => ipcRenderer.invoke("shellpty:resize", { projectId, cols, rows }),
  stopShellPty: (projectId: string) => ipcRenderer.invoke("shellpty:stop", { projectId }),
  captureScreenshot: (projectId: string, agentId?: string) => ipcRenderer.invoke("screenshot:capture", { projectId, agentId }),
  transcribeAudio: (audio: Uint8Array) => ipcRenderer.invoke("dictate:transcribe", { audio }),
  startTunnel: (projectId: string, port: number) => ipcRenderer.invoke("tunnel:start", { projectId, port }),
  stopTunnel: (projectId: string) => ipcRenderer.invoke("tunnel:stop", { projectId }),
  getTunnelStatus: (projectId: string) => ipcRenderer.invoke("tunnel:status", { projectId }),
  onTunnelEvent: (cb: (e: { projectId: string; kind: string; url?: string; message?: string }) => void) => {
    const handler = (_evt: unknown, payload: { projectId: string; kind: string; url?: string; message?: string }) => cb(payload);
    ipcRenderer.on("tunnel:event", handler);
    return () => ipcRenderer.removeListener("tunnel:event", handler);
  },
  pickDbFile: () => ipcRenderer.invoke("db:pick"),
  setDbPath: (projectId: string, path: string) => ipcRenderer.invoke("db:setPath", { projectId, path }),
  runDbQuery: (projectId: string, sql: string) => ipcRenderer.invoke("db:query", { projectId, sql }),
  listSecretKeys: (projectId: string) => ipcRenderer.invoke("secrets:list", { projectId }),
  setSecret: (projectId: string, key: string, value: string) => ipcRenderer.invoke("secrets:set", { projectId, key, value }),
  removeSecret: (projectId: string, key: string) => ipcRenderer.invoke("secrets:remove", { projectId, key }),
  listSkills: () => ipcRenderer.invoke("skills:list"),
  setAgentSkills: (projectId: string, agentId: string, skillIds: string[]) =>
    ipcRenderer.invoke("skills:setForAgent", { projectId, agentId, skillIds }),
  getMemory: (projectId: string) => ipcRenderer.invoke("memory:get", { projectId }),
  setMemory: (projectId: string, text: string) => ipcRenderer.invoke("memory:set", { projectId, text }),
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
