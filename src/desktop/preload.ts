import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  getAgentContexts:(projectId:string,agentId:string)=>ipcRenderer.invoke('context:list',projectId,agentId),
  getContextSource:(projectId:string,agentId:string,id:string,checkpointId:string)=>ipcRenderer.invoke('context:source',projectId,agentId,id,checkpointId),
  compactAgentContext:(projectId:string,agentId:string,id:string)=>ipcRenderer.invoke('context:compact',projectId,agentId,id),
  reconcileAgentContext:(projectId:string,agentId:string,id:string)=>ipcRenderer.invoke('context:reconcile',projectId,agentId,id),
  saveProjectUsage: (projectId:string,format:'json'|'csv',filter?:unknown) => ipcRenderer.invoke('harness:saveExport',projectId,format,filter),
  getProjectUsage: (projectId: string, filter?: unknown) => ipcRenderer.invoke('harness:usage',projectId,filter),
  exportProjectUsage: (projectId:string,format:'json'|'csv',filter?:unknown) => ipcRenderer.invoke('harness:export',projectId,format,filter),
  getExecutionState: (projectId: string) => ipcRenderer.invoke("harness:state", projectId),
  saveExecutionPolicy: (projectId: string, policy: unknown) => ipcRenderer.invoke("harness:policy", projectId, policy),
  cancelExecutionRun: (projectId: string, runId: string) => ipcRenderer.invoke("harness:cancel", projectId, runId),
  getProjectDashboard: (id:string) => ipcRenderer.invoke('projects:dashboard',id),
  openProjectDashboard: (id:string) => ipcRenderer.invoke('projects:openDashboard',id),
  getCapabilities: (projectId:string,agentId:string)=>ipcRenderer.invoke('capabilities:get',projectId,agentId),
  getArtifactPreview: (projectId:string,id:string)=>ipcRenderer.invoke('artifacts:preview',projectId,id),
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
  getOfficeSubagents: () => ipcRenderer.invoke('office:subagents:get'),
  onOfficeSubagents: (cb:(records:unknown[])=>void) => {const handler=(_event:unknown,records:unknown[])=>cb(records);ipcRenderer.on('office:subagents',handler);return()=>ipcRenderer.removeListener('office:subagents',handler);},
  getOfficePresence: () => ipcRenderer.invoke("office:presence:get"),
  onOfficePresence: (cb: (sessions: unknown[]) => void) => {
    const handler = (_evt: unknown, payload: unknown[]) => cb(payload);
    ipcRenderer.on("office:presence", handler);
    return () => ipcRenderer.removeListener("office:presence", handler);
  },
  gitBranch: (path: string) => ipcRenderer.invoke("git:branch", path),
  getDiff: (path: string) => ipcRenderer.invoke("room:diff", path),
  getProjectStats: () => ipcRenderer.invoke("projects:stats"),
  approveDiff: (projectId: string, agentId: string) => ipcRenderer.invoke("room:approve", { projectId, agentId }),
  getCommits: (projectId: string) => ipcRenderer.invoke("room:commits", projectId),
  getCommitDiff: (projectId: string, agentId: string, sha: string) => ipcRenderer.invoke("room:commitDiff", { projectId, agentId, sha }),
  postBroadcast: (projectId: string, text: string) => ipcRenderer.invoke("room:post", { projectId, text }),
  listLibrary: () => ipcRenderer.invoke("library:list"),
  importAgentFromGithub: (url: string) => ipcRenderer.invoke("library:importFromGithub", url),
  addToLibrary: (name: string, systemPrompt: string, model: string | undefined, extraArgs: string[] | undefined, skillIds: string[] | undefined) =>
    ipcRenderer.invoke("library:add", { name, systemPrompt, model, extraArgs, skillIds }),
  removeFromLibrary: (id: string) => ipcRenderer.invoke("library:remove", id),
  listTeams: () => ipcRenderer.invoke("teams:list"),
  addTeam: (name: string, members: { source: "role" | "library"; refId: string }[]) => ipcRenderer.invoke("teams:add", { name, members }),
  removeTeam: (id: string) => ipcRenderer.invoke("teams:remove", id),
  getAdminConfig: () => ipcRenderer.invoke("admin:get"),
  setTokenSaving: (enabled: boolean) => ipcRenderer.invoke("admin:setTokenSaving", enabled),
  setGlobalAllowlist: (list: string[]) => ipcRenderer.invoke("admin:setGlobalAllowlist", list),
  setCategoryAllowlist: (categoryId: string, list: string[]) => ipcRenderer.invoke("admin:setCategoryAllowlist", { categoryId, list }),
  addCategory: (label: string) => ipcRenderer.invoke("admin:addCategory", label),
  renameCategory: (id: string, label: string) => ipcRenderer.invoke("admin:renameCategory", { id, label }),
  removeCategory: (id: string) => ipcRenderer.invoke("admin:removeCategory", id),
  reorderCategories: (orderedIds: string[]) => ipcRenderer.invoke("admin:reorderCategories", orderedIds),
  setCategoryMembers: (categoryId: string, members: { source: "role" | "library"; refId: string }[]) =>
    ipcRenderer.invoke("admin:setCategoryMembers", { categoryId, members }),
  startMeeting: (projectId: string, agentIds: string[], topic: string, rounds: number) =>
    ipcRenderer.invoke("room:meeting", { projectId, agentIds, topic, rounds }),
  startDebate: (projectId: string, analystIds: string[], managerId: string, topic: string, maxRounds: number) =>
    ipcRenderer.invoke("room:debate", { projectId, analystIds, managerId, topic, maxRounds }),
  listTasks: (projectId: string) => ipcRenderer.invoke("tasks:list", projectId),
  createTask: (projectId: string, title: string, description: string, assigneeAgentId: string | undefined, createdBy: string, attachments?: string[], sourcePlanningMessageId?: string) =>
    ipcRenderer.invoke("tasks:create", { projectId, title, description, assigneeAgentId, createdBy, attachments, sourcePlanningMessageId }),
  pickAttachment: () => ipcRenderer.invoke("attachments:pick"),
  openAttachment: (path: string) => ipcRenderer.invoke("attachments:open", path),
  updateTask: (projectId: string, id: string, patch: Record<string, unknown>) => ipcRenderer.invoke("tasks:update", { projectId, id, patch }),
  removeTask: (projectId: string, id: string) => ipcRenderer.invoke("tasks:remove", { projectId, id }),
  listPlanning: (projectId: string) => ipcRenderer.invoke("planning:list", projectId),
  postPlanning: (projectId: string, authorId: string, authorName: string, text: string, attachments?: string[]) =>
    ipcRenderer.invoke("planning:post", { projectId, authorId, authorName, text, attachments }),
  commentPlanning: (projectId: string, agentId: string) => ipcRenderer.invoke("planning:comment", { projectId, agentId }),
  listDir: (path: string, sub: string) => ipcRenderer.invoke("fs:list", { path, sub }),
  readFile: (path: string, sub: string) => ipcRenderer.invoke("fs:read", { path, sub }),
  writeFile: (path: string, sub: string, content: string) => ipcRenderer.invoke("fs:write", { path, sub, content }),
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
  setAgentModel: (projectId: string, agentId: string, model: string) => ipcRenderer.invoke("agents:setModel", { projectId, agentId, model }),
  listAccounts: () => ipcRenderer.invoke("accounts:list"),
  addAccount: (provider: "codex" | "claude" | "cursor" | "openrouter" | "openai" | "anthropic" | "gemini" | "ollama", name: string, env: Record<string, string>) => ipcRenderer.invoke("accounts:add", { provider, name, env }),
  removeAccount: (id: string) => ipcRenderer.invoke("accounts:remove", { id }),
  setActiveAccount: (projectId: string, accountId?: string) => ipcRenderer.invoke("accounts:setActive", { projectId, accountId }),
  onQuotaEvent: (cb: (e: { projectId: string; agentId: string }) => void) => {
    const handler = (_evt: unknown, payload: { projectId: string; agentId: string }) => cb(payload);
    ipcRenderer.on("quota:hit", handler);
    return () => ipcRenderer.removeListener("quota:hit", handler);
  },
  listSkills: () => ipcRenderer.invoke("skills:list"),
  importSkillFromGithub: (url: string) => ipcRenderer.invoke("skills:importFromGithub", url),
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
  getWorkflow: (id: string) => ipcRenderer.invoke("workflow:get", id),
  saveWorkflow: (id: string, definition: unknown) => ipcRenderer.invoke("workflow:save", id, definition),
  startWorkflow: (id: string, input: string, fixture?: boolean) => ipcRenderer.invoke("workflow:start", id, input, fixture),
  cancelWorkflow: (id: string) => ipcRenderer.invoke("workflow:cancel", id),
  listWorkflowRuns: (id: string) => ipcRenderer.invoke("workflow:runs", id),
  listArtifacts: (id: string) => ipcRenderer.invoke("artifacts:list", id),
  openArtifact: (id: string, artifactId: string, mode: string) => ipcRenderer.invoke("artifacts:open", id, artifactId, mode),
  updateAgentRuntime: (id: string, agentId: string, config: unknown) => ipcRenderer.invoke("agent:runtime", { projectId: id, agentId, config }),
});
