import { appendFileSync, existsSync, ftruncateSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, statSync, closeSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { RunScope } from './types.js';
import { assertRunScope } from './runScope.js';
import { redactError } from '../desktop/errorLog.js';

const MAX_EVENT_BYTES = 32 * 1024;
const MAX_QUERY = 500;
const RETAINED_FILES = 5;
const ALLOWED_METADATA = new Set([
 'count', 'total', 'durationMs', 'status', 'mechanism', 'provider', 'model',
 'artifactId', 'artifactRef', 'referenceId', 'tool', 'surface', 'attemptId', 'callId',
 'errorCode', 'input', 'output', 'cacheRead', 'cacheWrite', 'reasoning', 'source', 'reportedCost', 'currency'
]);
const ERROR_CODES = new Set(['unknown', 'timeout', 'cancelled', 'provider-error', 'tool-error', 'validation-error']);

export interface AuditEvent {
 readonly version: 1;
 readonly eventId: string;
 readonly scope: RunScope;
 readonly callId?: string;
 readonly attemptId?: string;
 readonly sequence: number;
 readonly timestamp: string;
 readonly kind: string;
 readonly metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

export type AuditInput = {
 eventId: string;
 scope: RunScope;
 callId?: string;
 attemptId?: string;
 kind: string;
 metadata?: Readonly<Record<string, unknown>>;
};

export interface AuditQuery { order?: 'asc'|'desc'; runId?: string; agentId?: string; afterSequence?: number; limit: number; }
export interface AuditJournalOptions { projectId?:string; rotationBytes?: number; }

function assertSafeString(value: unknown, field: string): asserts value is string {
 if (typeof value !== 'string' || !value.trim() || value.length > 200 || /[\x00-\x1f\x7f/\\]/.test(value)) {
  throw new Error(`Invalid ${field}`);
 }
}

function safePath(path: string): void {
 const info = lstatSync(path);
 if (info.isSymbolicLink()) throw new Error(`Symlink is not allowed: ${path}`);
}

function knownScope(scope: RunScope): RunScope {
 assertRunScope(scope);
 return Object.freeze({ projectId: scope.projectId, runId: scope.runId, agentId: scope.agentId, taskId: scope.taskId,
  ...(scope.parentTaskId === undefined ? {} : { parentTaskId: scope.parentTaskId }) });
}

function metadataOf(input: Readonly<Record<string, unknown>> | undefined): AuditEvent['metadata'] {
 if (input === undefined) return undefined;
 const output: Record<string, string | number | boolean | null> = {};
 for (const [key, value] of Object.entries(input)) {
  if (!ALLOWED_METADATA.has(key)) throw new Error(`Unallowlisted audit metadata: ${key}`);
  if (value !== null && typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
   throw new Error(`Invalid audit metadata: ${key}`);
  }
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`Invalid audit metadata: ${key}`);
  if (key === 'errorCode' && (typeof value !== 'string' || !ERROR_CODES.has(value))) throw new Error('Invalid errorCode');
  output[key] = typeof value === 'string' ? redactError(value) : value;
 }
 return output;
}

function parseFile(path: string, repairTail: boolean): { events: AuditEvent[]; torn: boolean } {
 if (!existsSync(path)) return { events: [], torn: false };
 safePath(path);
 if (statSync(path).size > 5 * 1024 * 1024 + MAX_EVENT_BYTES) throw new Error('Audit file exceeds size limit');
 const bytes = readFileSync(path);
 if (bytes.length === 0) return { events: [], torn: false };
 const text = bytes.toString('utf8');
 const lines = text.split('\n');
 const hasTornTail = !text.endsWith('\n');
 if (hasTornTail) {
  const lastComplete = text.lastIndexOf('\n');
  if (!repairTail) throw new Error(`Torn audit journal tail: ${path}`);
  const fd = openSync(path, 'r+');
  try { ftruncateSync(fd, bytes.lastIndexOf(10) + 1); } finally { closeSync(fd); }
  lines.pop();
 }
 const events: AuditEvent[] = [];
 for (const line of lines) {
  if (!line) continue;
  try {
   if (Buffer.byteLength(line) > MAX_EVENT_BYTES) throw new Error('Audit event exceeds size limit');
   const value = JSON.parse(line) as AuditEvent;
   if (value.version !== 1 || typeof value.eventId !== 'string' || !Number.isSafeInteger(value.sequence) || value.sequence < 1 ||
       typeof value.timestamp !== 'string' || !Number.isFinite(Date.parse(value.timestamp)) || typeof value.kind !== 'string' || !value.scope ||
       (value.callId !== undefined && typeof value.callId !== 'string') || (value.attemptId !== undefined && typeof value.attemptId !== 'string')) throw new Error('invalid audit record');
   const scope = knownScope(value.scope);
   assertSafeString(value.eventId, 'eventId'); assertSafeString(value.kind, 'kind');
   if (value.callId !== undefined) assertSafeString(value.callId, 'callId');
   if (value.attemptId !== undefined) assertSafeString(value.attemptId, 'attemptId');
   if (value.metadata !== undefined) metadataOf(value.metadata);
   events.push(Object.freeze({ version: 1, eventId: value.eventId, sequence: value.sequence, timestamp: value.timestamp, kind: value.kind, ...(value.callId === undefined ? {} : {callId:value.callId}), ...(value.attemptId === undefined ? {} : {attemptId:value.attemptId}), scope, metadata: value.metadata ? Object.freeze({ ...metadataOf(value.metadata) }) : undefined }));
  } catch (error) {
   throw new Error(`Corrupt audit journal record in ${path}`);
  }
 }
 return { events, torn: hasTornTail };
}

export class AuditJournal {
 private readonly harnessDirectory: string;
 private readonly rotationBytes: number;
 private sequence = 0;
 private projectId?: string;
 private readonly eventIds = new Set<string>();
 private records: AuditEvent[] = [];
 readonly diagnostics: string[] = [];

 constructor(directory: string, options: AuditJournalOptions = {}) {
  if(options.projectId!==undefined){assertSafeString(options.projectId,'projectId');this.projectId=options.projectId;}
  if (typeof directory !== 'string' || !directory.trim()) throw new Error('Invalid project directory');
  if (/(^|[\\/])\.\.(?=[\\/]|$)/.test(directory)) throw new Error('Project directory traversal is not allowed');
  const projectDirectory = resolve(directory);
  if (!existsSync(projectDirectory) || !lstatSync(projectDirectory).isDirectory()) throw new Error('Project directory must exist');
  this.harnessDirectory = join(projectDirectory, '.agentic-controlroom', 'harness');
  this.rotationBytes = options.rotationBytes ?? 5 * 1024 * 1024;
  if (!Number.isInteger(this.rotationBytes) || this.rotationBytes < 1 || this.rotationBytes > 5 * 1024 * 1024) throw new Error('Invalid rotation size');
  const controlDirectory = join(projectDirectory, '.agentic-controlroom');
  if (existsSync(controlDirectory)) safePath(controlDirectory);
  if (existsSync(this.harnessDirectory)) safePath(this.harnessDirectory);
  mkdirSync(this.harnessDirectory, { recursive: true });
  safePath(controlDirectory);
  safePath(this.harnessDirectory);
  for (const name of readdirSync(this.harnessDirectory)) {
   if (/^audit-[0-4]\.jsonl$/.test(name)) safePath(join(this.harnessDirectory, name));
  }
  for (let index = RETAINED_FILES - 1; index >= 0; index--) {
   const path = this.filePath(index);
   const parsed = parseFile(path, index === 0);
   if (parsed.torn) this.diagnostics.push(`Repaired torn audit journal tail: ${path}`);
   for (const event of parsed.events) this.remember(event);
  }
 }

 append(input: AuditInput): AuditEvent {
  assertSafeString(input.eventId, 'eventId');
  assertRunScope(input.scope);
  if (this.projectId !== undefined && input.scope.projectId !== this.projectId) throw new Error('Audit project ownership mismatch');
  assertSafeString(input.kind, 'kind');
 if (input.callId !== undefined) assertSafeString(input.callId, 'callId');
 if (input.attemptId !== undefined) assertSafeString(input.attemptId, 'attemptId');
  if (Buffer.byteLength(JSON.stringify(input), 'utf8') > MAX_EVENT_BYTES) throw new Error('Audit event exceeds 32KiB');
  if (this.eventIds.has(input.eventId)) return this.records.find(event => event.eventId === input.eventId)!;
  const event: AuditEvent = Object.freeze({
   version: 1, eventId: input.eventId, scope: knownScope(input.scope),
   ...(input.callId === undefined ? {} : { callId: input.callId }),
   ...(input.attemptId === undefined ? {} : { attemptId: input.attemptId }),
   sequence: this.sequence + 1, timestamp: new Date().toISOString(), kind: input.kind,
   ...(input.metadata === undefined ? {} : { metadata: Object.freeze(metadataOf(input.metadata)!) })
  });
  const line = JSON.stringify(event) + '\n';
  if (Buffer.byteLength(line, 'utf8') > MAX_EVENT_BYTES) throw new Error('Audit event exceeds 32KiB');
  const path = this.filePath(0);
  safePath(this.harnessDirectory);
  safePath(join(this.harnessDirectory, '..'));
  if (existsSync(path)) { safePath(path); if (statSync(path).size + Buffer.byteLength(line) > this.rotationBytes) this.rotate(); }
  appendFileSync(this.filePath(0), line, { encoding: 'utf8', flush: true });
  this.remember(event);
  return event;
 }

 query(query: AuditQuery): AuditEvent[] {
  if (query.afterSequence !== undefined && (!Number.isSafeInteger(query.afterSequence) || query.afterSequence < 0)) throw new Error('Invalid query sequence');
  if (!Number.isInteger(query.limit) || query.limit < 0 || query.limit > MAX_QUERY) throw new Error('Query limit must be at most 500');
  if(query.order!==undefined&&query.order!=='asc'&&query.order!=='desc')throw new Error('Invalid query order');
  const records=query.order==='desc'?[...this.records].reverse():this.records;
  return records.filter(event =>
   (query.runId === undefined || event.scope.runId === query.runId) &&
   (query.agentId === undefined || event.scope.agentId === query.agentId) &&
   (query.afterSequence === undefined || event.sequence > query.afterSequence)
  ).slice(0, query.limit);
 }

 private filePath(index: number): string { return join(this.harnessDirectory, `audit-${index}.jsonl`); }
 private remember(event: AuditEvent): void {
  if (this.eventIds.has(event.eventId)) return;
  if (this.projectId !== undefined && event.scope.projectId !== this.projectId) throw new Error('Audit project ownership mismatch');
  if (this.records.length > 0 && event.sequence <= this.records[this.records.length - 1].sequence) throw new Error('Non-monotonic audit sequence');
  this.projectId ??= event.scope.projectId;
  this.eventIds.add(event.eventId); this.sequence = Math.max(this.sequence, event.sequence);
  this.records.push(Object.freeze({ ...event, scope: Object.freeze({ ...event.scope }), metadata: event.metadata ? Object.freeze({ ...event.metadata }) : undefined }));
 }
 private rotate(): void {
 for (let index = RETAINED_FILES - 1; index > 0; index--) {
   const source = this.filePath(index - 1); const target = this.filePath(index);
   if (existsSync(target)) { safePath(target); }
   if (existsSync(source)) { safePath(source); renameSync(source, target); }
  }
  this.records = [];
  this.eventIds.clear();
  for (let index = RETAINED_FILES - 1; index >= 0; index--) {
   for (const event of parseFile(this.filePath(index), false).events) this.remember(event);
  }
 }
}
