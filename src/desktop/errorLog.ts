import { appendFileSync, mkdirSync, renameSync, statSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
export interface ErrorContext { projectId?: string; agentId?: string; }
export function appErrorLogPath(appData: string, userData: string): string {
 const standard = ['Electron', 'Agent Room', 'agentic-controlroom'].some(name => resolve(userData) === resolve(appData, name));
 return join(standard ? join(appData, 'Agent Room') : join(userData, 'Agent Room'), 'logs', 'errors.jsonl');
}
export function redactError(value: unknown): string {
 let message: string;
 try { message = value instanceof Error ? value.stack || value.message : String(value); } catch { message = 'Unprintable error'; }
 return message.replace(/(Bearer\s+)[^\s"']+/gi, '$1[redacted]')
  .replace(/((?:api[_-]?key|token|password|secret)\s*[=:]\s*["']?)[^\s"'&,}]+/gi, '$1[redacted]')
  .replace(/\bsk-[A-Za-z0-9_-]+/g, '[redacted]').slice(0, 12000);
}
export function createErrorLog(path: string, maxBytes = 1048576) {
 return (source: string, error: unknown, context?: ErrorContext): void => {
  try {
   mkdirSync(dirname(path), { recursive: true });
   try { if (statSync(path).size >= maxBytes) { rmSync(path + '.1', { force: true }); renameSync(path, path + '.1'); } } catch { /* File may not exist yet. */ }
   appendFileSync(path, JSON.stringify({ app: 'Agent Room', time: new Date().toISOString(), source: source.slice(0, 120), projectId: context?.projectId?.slice(0, 200), agentId: context?.agentId?.slice(0, 200), error: redactError(error) }) + '\n');
  } catch { /* Diagnostics must never cause a second application failure. */ }
 };
}
