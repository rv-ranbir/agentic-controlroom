import * as vscode from "vscode";
import { join } from "node:path";
import { ChatLog, type ChatMessage } from "./chatroom/log.js";
import { CursorCliBackend } from "./backend/cursorCliBackend.js";
import { runRoom } from "./orchestrator/orchestrator.js";
import { loadRole } from "./roles.js";

type OutMsg =
  | ({ kind: "message" } & ChatMessage)
  | { kind: "status"; text: string }
  | { kind: "running"; running: boolean };

class RoomController {
  private view?: vscode.WebviewView;
  private transcript: ChatMessage[] = [];
  private statusText = "";
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
    // replay: persisted log if transcript empty (fresh window), else this session's messages
    if (this.transcript.length === 0) {
      const ws = vscode.workspace.workspaceFolders?.[0];
      if (ws) {
        this.transcript = new ChatLog(this.logPath(ws)).tail(50);
      }
    }
    for (const msg of this.transcript) this.post({ kind: "message", ...msg });
    this.post({ kind: "status", text: this.statusText });
    this.post({ kind: "running", running: this.running });
  }

  private logPath(ws: vscode.WorkspaceFolder): string {
    return join(ws.uri.fsPath, ".agent-room", "log.jsonl");
  }

  private post(msg: OutMsg) {
    void this.view?.webview.postMessage(msg);
  }

  async run(task: string) {
    if (this.running) {
      vscode.window.showWarningMessage("Agent Room: a run is already in progress.");
      return;
    }
    const ws = vscode.workspace.workspaceFolders?.[0];
    if (!ws) {
      vscode.window.showErrorMessage("Agent Room: open a folder first.");
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

    const rolesDir = join(this.context.extensionPath, "roles");
    const config = vscode.workspace.getConfiguration("agentRoom");
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
          ? "Agent Room: QA approved. Done."
          : "Agent Room: max rounds reached without QA approval.",
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
      vscode.window.showErrorMessage(`Agent Room: ${msg}`);
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
    vscode.window.registerWebviewViewProvider("agentRoom.chat", {
      resolveWebviewView: (view) => controller.attach(view),
    }),
    vscode.commands.registerCommand("agent-room.runTask", async () => {
      await vscode.commands.executeCommand("agentRoom.chat.focus");
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
  return /* html */ `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  html, body { height: 100%; }
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-sideBar-background);
    margin: 0;
    display: flex;
    flex-direction: column;
  }
  #chat { flex: 1; overflow-y: auto; padding: 0.5rem 0.65rem; }
  .msg { margin: 0.6rem 0; }
  .who { font-weight: 600; font-size: 0.85em; margin-bottom: 0.15rem; }
  .who .time { font-weight: 400; color: var(--vscode-descriptionForeground); margin-left: 0.4em; font-size: 0.9em; }
  .Dev .who { color: var(--vscode-charts-blue, #4fc1ff); }
  .QA .who { color: var(--vscode-charts-yellow, #e5c07b); }
  .system .who { color: var(--vscode-descriptionForeground); }
  .body {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    background: var(--vscode-editorWidget-background);
    border: 1px solid var(--vscode-editorWidget-border, transparent);
    border-radius: 6px;
    padding: 0.5rem 0.65rem;
    font-size: 0.9em;
    line-height: 1.4;
  }
  .system .body { background: transparent; border: none; padding: 0.1rem 0; font-style: italic; }
  #empty { color: var(--vscode-descriptionForeground); font-style: italic; padding: 1rem 0.65rem; }
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
  <div id="chat"><div id="empty">No messages yet. Describe a task below — Dev implements it, QA verifies it, live in this chatroom.</div></div>
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
        const div = document.createElement('div');
        div.className = 'msg ' + m.role.replace(/[^A-Za-z]/g, '');
        const who = document.createElement('div');
        who.className = 'who';
        who.textContent = m.role;
        const time = document.createElement('span');
        time.className = 'time';
        time.textContent = new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        who.appendChild(time);
        const body = document.createElement('div');
        body.className = 'body';
        body.textContent = m.message;
        div.append(who, body);
        chat.appendChild(div);
        chat.scrollTop = chat.scrollHeight;
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
