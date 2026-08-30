import * as vscode from "vscode";
import { join } from "node:path";
import { ChatLog, type ChatMessage } from "./chatroom/log.js";
import { CursorCliBackend } from "./backend/cursorCliBackend.js";
import { runRoom } from "./orchestrator/orchestrator.js";
import { loadRole } from "./roles.js";

type AgentState = "idle" | "working" | "done";

type OutMsg =
  | ({ kind: "message" } & ChatMessage)
  | { kind: "status"; text: string }
  | { kind: "agentState"; agentId: string; state: AgentState }
  | { kind: "running"; running: boolean };

const ROSTER = [
  { id: "dev", name: "Dev", desc: "implements" },
  { id: "qa", name: "QA", desc: "verifies" },
];

class RoomController {
  private view?: vscode.WebviewView;
  private transcript: ChatMessage[] = [];
  private statusText = "";
  private agentStates: Record<string, AgentState> = {};
  private running = false;

  constructor(private context: vscode.ExtensionContext) {}

  attach(view: vscode.WebviewView) {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = chatHtml();
    view.webview.onDidReceiveMessage((m) => {
      if (m?.type === "run" && typeof m.task === "string" && m.task.trim()) {
        void this.run(m.task.trim());
      }
    });
    if (this.transcript.length === 0) {
      const ws = vscode.workspace.workspaceFolders?.[0];
      if (ws) {
        this.transcript = new ChatLog(this.logPath(ws)).tail(50);
      }
    }
    for (const msg of this.transcript) this.post({ kind: "message", ...msg });
    for (const [agentId, state] of Object.entries(this.agentStates)) {
      this.post({ kind: "agentState", agentId, state });
    }
    this.post({ kind: "status", text: this.statusText });
    this.post({ kind: "running", running: this.running });
  }

  private logPath(ws: vscode.WorkspaceFolder): string {
    return join(ws.uri.fsPath, ".agentic-controlroom", "log.jsonl");
  }

  private post(msg: OutMsg) {
    void this.view?.webview.postMessage(msg);
  }

  async run(task: string) {
    if (this.running) {
      vscode.window.showWarningMessage("Agentic Control Room: a run is already in progress.");
      return;
    }
    const ws = vscode.workspace.workspaceFolders?.[0];
    if (!ws) {
      vscode.window.showErrorMessage("Agentic Control Room: open a folder first.");
      return;
    }

    const log = new ChatLog(this.logPath(ws));
    log.on("message", (m: ChatMessage) => {
      this.transcript.push(m);
      this.post({ kind: "message", ...m });
    });
    log.on("status", (text: string) => {
      this.statusText = text;
      this.post({ kind: "status", text });
    });
    log.on("agentState", ({ agentId, state }: { agentId: string; state: AgentState }) => {
      this.agentStates[agentId] = state;
      this.post({ kind: "agentState", agentId, state });
    });

    const rolesDir = join(this.context.extensionPath, "roles");
    const config = vscode.workspace.getConfiguration("agenticControlRoom");
    const backend = new CursorCliBackend({
      cwd: ws.uri.fsPath,
      model: config.get<string>("model") || undefined,
    });

    this.running = true;
    this.post({ kind: "running", running: true });
    try {
      const result = await runRoom(
        task,
        backend,
        log,
        loadRole(rolesDir, "dev", "Dev", "dev.md"),
        loadRole(rolesDir, "qa", "QA", "qa.md"),
        { maxRounds: config.get<number>("maxRounds") ?? 3 },
      );
      vscode.window.showInformationMessage(
        result === "approved"
          ? "Agentic Control Room: QA approved. Done."
          : "Agentic Control Room: max rounds reached without QA approval.",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const errorMsg: ChatMessage = {
        ts: new Date().toISOString(),
        agentId: "orchestrator",
        role: "system",
        message: `Error: ${msg}`,
      };
      this.transcript.push(errorMsg);
      this.post({ kind: "message", ...errorMsg });
      vscode.window.showErrorMessage(`Agentic Control Room: ${msg}`);
    } finally {
      this.running = false;
      this.statusText = "";
      this.post({ kind: "status", text: "" });
      this.post({ kind: "running", running: false });
    }
  }
}

export function activate(context: vscode.ExtensionContext) {
  const controller = new RoomController(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("agenticControlRoom.chat", {
      resolveWebviewView: (view) => controller.attach(view),
    }),
    vscode.commands.registerCommand("agenticControlRoom.runTask", async () => {
      await vscode.commands.executeCommand("agenticControlRoom.chat.focus");
      const task = await vscode.window.showInputBox({
        prompt: "Task for the agent room (Dev implements, QA verifies)",
        placeHolder: "e.g. add a /health endpoint with a test",
        ignoreFocusOut: true,
      });
      if (task?.trim()) void controller.run(task.trim());
    }),
  );
}

export function deactivate() {}

function chatHtml(): string {
  const rosterCards = ROSTER.map(
    (a) => /* html */ `
      <div class="agent ${a.name}" id="agent-${a.id}" data-state="idle">
        <div class="avatar">${a.name[0]}</div>
        <div class="meta">
          <div class="name">${a.name}</div>
          <div class="state"><span class="dot"></span><span class="label">idle</span></div>
        </div>
      </div>`,
  ).join("");

  return /* html */ `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  :root {
    --dev: var(--vscode-charts-blue, #4fc1ff);
    --qa: var(--vscode-charts-yellow, #e5c07b);
    --sys: var(--vscode-descriptionForeground);
  }
  html, body { height: 100%; }
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-sideBar-background);
    margin: 0;
    display: flex;
    flex-direction: column;
  }

  /* ── roster ── */
  #roster {
    display: flex;
    gap: 0.5rem;
    padding: 0.6rem 0.65rem;
    border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, var(--vscode-editorWidget-border, transparent));
  }
  .agent {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
    padding: 0.45rem 0.55rem;
    border-radius: 8px;
    background: var(--vscode-editorWidget-background);
    border: 1px solid var(--vscode-editorWidget-border, transparent);
  }
  .avatar {
    width: 26px; height: 26px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 0.8em;
    color: var(--vscode-sideBar-background);
    flex-shrink: 0;
  }
  .Dev .avatar { background: var(--dev); }
  .QA .avatar { background: var(--qa); }
  .name { font-weight: 600; font-size: 0.85em; }
  .state { display: flex; align-items: center; gap: 0.3rem; font-size: 0.75em; color: var(--vscode-descriptionForeground); }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--vscode-descriptionForeground); opacity: 0.5; }
  .agent[data-state="working"] .dot {
    background: var(--vscode-charts-green, #89d185);
    opacity: 1;
    animation: pulse 1.1s ease-in-out infinite;
  }
  .agent[data-state="working"] { border-color: var(--vscode-focusBorder); }
  .agent[data-state="done"] .dot { background: var(--vscode-charts-green, #89d185); opacity: 1; animation: none; }
  @keyframes pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.6); opacity: 0.55; } }

  /* ── chat ── */
  #chat { flex: 1; overflow-y: auto; padding: 0.5rem 0.65rem; }
  .msg { display: flex; gap: 0.5rem; margin: 0.65rem 0; }
  .msg .mAvatar {
    width: 22px; height: 22px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 0.7em;
    color: var(--vscode-sideBar-background);
    flex-shrink: 0;
    margin-top: 2px;
  }
  .msg.Dev .mAvatar { background: var(--dev); }
  .msg.QA .mAvatar { background: var(--qa); }
  .msg.system .mAvatar { background: var(--sys); opacity: 0.6; }
  .msg .content { flex: 1; min-width: 0; }
  .who { font-weight: 600; font-size: 0.8em; margin-bottom: 0.15rem; }
  .msg.Dev .who { color: var(--dev); }
  .msg.QA .who { color: var(--qa); }
  .msg.system .who { color: var(--sys); }
  .who .time { font-weight: 400; color: var(--vscode-descriptionForeground); margin-left: 0.4em; font-size: 0.9em; }
  .bubble {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    background: var(--vscode-editorWidget-background);
    border: 1px solid var(--vscode-editorWidget-border, transparent);
    border-left: 2px solid var(--sys);
    border-radius: 0 6px 6px 6px;
    padding: 0.5rem 0.65rem;
    font-size: 0.88em;
    line-height: 1.45;
  }
  .msg.Dev .bubble { border-left-color: var(--dev); }
  .msg.QA .bubble { border-left-color: var(--qa); }
  .msg.system .bubble { background: transparent; border: none; padding: 0.1rem 0; font-style: italic; color: var(--sys); }
  #empty { color: var(--vscode-descriptionForeground); font-style: italic; padding: 1rem 0.65rem; }

  /* ── status + input ── */
  #status {
    color: var(--vscode-descriptionForeground);
    font-style: italic;
    font-size: 0.85em;
    padding: 0.25rem 0.65rem;
    min-height: 1.2em;
  }
  #status .dots::after { content: ''; animation: dots 1.2s steps(4, end) infinite; }
  @keyframes dots { 0% { content: ''; } 25% { content: '.'; } 50% { content: '..'; } 75% { content: '...'; } }
  #inputRow {
    display: flex;
    gap: 0.4rem;
    padding: 0.5rem 0.65rem 0.65rem;
    border-top: 1px solid var(--vscode-sideBarSectionHeader-border, var(--vscode-editorWidget-border, transparent));
  }
  #task {
    flex: 1;
    resize: none;
    font-family: inherit;
    font-size: 0.9em;
    color: var(--vscode-input-foreground);
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 4px;
    padding: 0.4rem 0.5rem;
  }
  #task:focus { outline: 1px solid var(--vscode-focusBorder); }
  #send {
    font-family: inherit;
    color: var(--vscode-button-foreground);
    background: var(--vscode-button-background);
    border: none;
    border-radius: 4px;
    padding: 0 0.9rem;
    cursor: pointer;
  }
  #send:hover { background: var(--vscode-button-hoverBackground); }
  #send:disabled { opacity: 0.5; cursor: default; }
</style>
</head>
<body>
  <div id="roster">${rosterCards}</div>
  <div id="chat"><div id="empty">No messages yet. Describe a task below — Dev implements it, QA verifies it, live in this room.</div></div>
  <div id="status"></div>
  <div id="inputRow">
    <textarea id="task" rows="2" placeholder="e.g. add a /health endpoint with a test"></textarea>
    <button id="send">Run</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const chat = document.getElementById('chat');
    const empty = document.getElementById('empty');
    const status = document.getElementById('status');
    const taskInput = document.getElementById('task');
    const send = document.getElementById('send');

    function submit() {
      const task = taskInput.value.trim();
      if (!task || send.disabled) return;
      vscode.postMessage({ type: 'run', task });
      taskInput.value = '';
    }
    send.addEventListener('click', submit);
    taskInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    });

    window.addEventListener('message', (e) => {
      const m = e.data;
      if (m.kind === 'message') {
        if (empty.parentNode) empty.remove();
        const safeRole = m.role.replace(/[^A-Za-z]/g, '');
        const div = document.createElement('div');
        div.className = 'msg ' + safeRole;
        const avatar = document.createElement('div');
        avatar.className = 'mAvatar';
        avatar.textContent = m.role === 'system' ? '•' : m.role[0].toUpperCase();
        const content = document.createElement('div');
        content.className = 'content';
        const who = document.createElement('div');
        who.className = 'who';
        who.textContent = m.role;
        const time = document.createElement('span');
        time.className = 'time';
        time.textContent = new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        who.appendChild(time);
        const bubble = document.createElement('div');
        bubble.className = 'bubble';
        bubble.textContent = m.message;
        content.append(who, bubble);
        div.append(avatar, content);
        chat.appendChild(div);
        chat.scrollTop = chat.scrollHeight;
      } else if (m.kind === 'agentState') {
        const card = document.getElementById('agent-' + m.agentId);
        if (card) {
          card.dataset.state = m.state;
          card.querySelector('.label').textContent = m.state;
        }
      } else if (m.kind === 'status') {
        status.innerHTML = '';
        if (m.text) {
          const span = document.createElement('span');
          span.textContent = m.text.replace(/…$/, '');
          span.className = 'dots';
          status.appendChild(span);
        }
      } else if (m.kind === 'running') {
        send.disabled = m.running;
        send.textContent = m.running ? 'Running' : 'Run';
      }
    });
  </script>
</body>
</html>`;
}
