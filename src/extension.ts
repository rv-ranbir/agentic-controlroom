import * as vscode from "vscode";
import { join } from "node:path";
import { ChatLog, type ChatMessage } from "./chatroom/log.js";
import { CursorCliBackend } from "./backend/cursorCliBackend.js";
import { runRoom } from "./orchestrator/orchestrator.js";
import { loadRole } from "./roles.js";

let running = false;

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("agent-room.runTask", async () => {
      if (running) {
        vscode.window.showWarningMessage("Agent Room: a run is already in progress.");
        return;
      }
      const ws = vscode.workspace.workspaceFolders?.[0];
      if (!ws) {
        vscode.window.showErrorMessage("Agent Room: open a folder first.");
        return;
      }
      const task = await vscode.window.showInputBox({
        prompt: "Task for the agent room (Dev implements, QA verifies)",
        placeHolder: "e.g. add a /health endpoint with a test",
        ignoreFocusOut: true,
      });
      if (!task) return;

      const panel = vscode.window.createWebviewPanel(
        "agentRoom",
        "Agent Room",
        vscode.ViewColumn.Beside,
        { enableScripts: true, retainContextWhenHidden: true },
      );
      panel.webview.html = chatHtml();

      const log = new ChatLog(join(ws.uri.fsPath, ".agent-room", "log.jsonl"));
      log.on("message", (m: ChatMessage) => {
        panel.webview.postMessage({ kind: "message", ...m });
      });

      const rolesDir = join(context.extensionPath, "roles");
      const config = vscode.workspace.getConfiguration("agentRoom");
      const backend = new CursorCliBackend({
        cwd: ws.uri.fsPath,
        model: config.get<string>("model") || undefined,
      });

      running = true;
      try {
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: "Agent Room: agents working…" },
          async () => {
            const result = await runRoom(
              task,
              backend,
              log,
              loadRole(rolesDir, "dev", "Dev", "dev.md"),
              loadRole(rolesDir, "qa", "QA", "qa.md"),
              { maxRounds: config.get<number>("maxRounds") ?? 3 },
            );
            panel.webview.postMessage({ kind: "done", result });
            vscode.window.showInformationMessage(
              result === "approved"
                ? "Agent Room: QA approved. Done."
                : "Agent Room: max rounds reached without QA approval.",
            );
          },
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        panel.webview.postMessage({
          kind: "message",
          ts: new Date().toISOString(),
          agentId: "orchestrator",
          role: "system",
          message: `Error: ${msg}`,
        });
        vscode.window.showErrorMessage(`Agent Room: ${msg}`);
      } finally {
        running = false;
      }
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
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 0.5rem 0.75rem;
    margin: 0;
  }
  .msg { margin: 0.6rem 0; }
  .who { font-weight: 600; font-size: 0.85em; margin-bottom: 0.15rem; }
  .Dev .who { color: var(--vscode-charts-blue, #4fc1ff); }
  .QA .who { color: var(--vscode-charts-yellow, #e5c07b); }
  .system .who { color: var(--vscode-descriptionForeground); }
  .body {
    white-space: pre-wrap;
    background: var(--vscode-editorWidget-background);
    border: 1px solid var(--vscode-editorWidget-border, transparent);
    border-radius: 6px;
    padding: 0.5rem 0.65rem;
    font-size: 0.9em;
    line-height: 1.4;
  }
  .system .body { background: transparent; border: none; padding: 0.1rem 0; font-style: italic; }
  #status { color: var(--vscode-descriptionForeground); font-style: italic; margin: 0.6rem 0; }
</style>
</head>
<body>
  <div id="chat"></div>
  <div id="status">Waiting for agents…</div>
  <script>
    const chat = document.getElementById('chat');
    const status = document.getElementById('status');
    window.addEventListener('message', (e) => {
      const m = e.data;
      if (m.kind === 'message') {
        const div = document.createElement('div');
        div.className = 'msg ' + m.role.replace(/[^A-Za-z]/g, '');
        const who = document.createElement('div');
        who.className = 'who';
        who.textContent = m.role;
        const body = document.createElement('div');
        body.className = 'body';
        body.textContent = m.message;
        div.append(who, body);
        chat.appendChild(div);
        status.textContent = 'Agents working…';
        div.scrollIntoView({ behavior: 'smooth', block: 'end' });
      } else if (m.kind === 'done') {
        status.textContent = m.result === 'approved' ? 'Done — QA approved.' : 'Stopped — max rounds reached.';
      }
    });
  </script>
</body>
</html>`;
}
