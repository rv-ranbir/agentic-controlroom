import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAgentOutput } from "./cursorCliBackend.js";

test("parses cursor-agent json result with session id", () => {
  const out = JSON.stringify({
    type: "result",
    result: "Added health endpoint.\nSTATUS: READY_FOR_REVIEW",
    session_id: "abc-123",
  });
  const parsed = parseAgentOutput(out);
  assert.equal(parsed.sessionId, "abc-123");
  assert.match(parsed.reply, /STATUS: READY_FOR_REVIEW/);
});

test("picks last json line when stream noise precedes result", () => {
  const out = ['{"type":"progress"}', '{"result":"done","session_id":"s1"}'].join("\n");
  assert.deepEqual(parseAgentOutput(out), { reply: "done", sessionId: "s1" });
});

test("falls back to raw text when output is not json", () => {
  const parsed = parseAgentOutput("plain text reply\n");
  assert.equal(parsed.reply, "plain text reply");
  assert.equal(parsed.sessionId, undefined);
});

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveLauncher } from './cursorCliBackend.js';
test('Windows Cursor launcher ignores staging folders and retains system certificate trust', {skip:process.platform!=='win32'}, () => {
 const root=mkdtempSync(join(tmpdir(),'cursor-launcher-'));const previous=process.env.LOCALAPPDATA;
 try {
  process.env.LOCALAPPDATA=root;
  for(const version of ['2026.08.25-release','2026.07.16-old','dist-package']) {
   const dir=join(root,'cursor-agent','versions',version);mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'node.exe'),'');writeFileSync(join(dir,'index.js'),'');
  }
  const launcher=resolveLauncher('cursor-agent');
  assert.equal(launcher.cmd,join(root,'cursor-agent','versions','2026.08.25-release','node.exe'));
  assert.equal(launcher.prefixArgs[0],'--use-system-ca');assert.equal(launcher.shell,false);
 } finally { if(previous===undefined)delete process.env.LOCALAPPDATA;else process.env.LOCALAPPDATA=previous; }
});
