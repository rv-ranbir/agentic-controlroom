import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync, linkSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';
import type { ContextManifest } from './context.js';

const MAX_RECORD_BYTES = 1024 * 1024;
const MAX_ENTRIES = 10000;
const MAX_ARRAY_ENTRIES = 1000;
const MAX_STRING = 1024 * 1024;
const HASH = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_ID = /^[^/\\\x00-\x1f\x7f]{1,200}$/;

export interface CheckpointSummary {
 readonly summary: string;
 readonly pinned: string[];
 readonly decisions: string[];
 readonly unresolved: string[];
 readonly nextActions: string[];
}

export interface Checkpoint {
 readonly version: 1;
 readonly id: string;
 readonly projectId: string;
 readonly taskId: string;
 readonly createdAt: string;
 readonly sourceId: string;
 readonly sourceHash: string;
 readonly summary: CheckpointSummary;
}

type StoredCheckpoint = Checkpoint & { metadataHash: string };

function digest(bytes: Buffer | string): string { return createHash('sha256').update(bytes).digest('hex'); }
function fail(field: string): never { throw new Error(`Invalid checkpoint ${field}`); }
function safeId(value: unknown, field: string): asserts value is string {
 if (typeof value !== 'string' || !SAFE_ID.test(value) || value === '.' || value === '..') fail(field);
}
function uuid(value: unknown, field: string): asserts value is string { if (typeof value !== 'string' || !UUID.test(value)) fail(field); }
function hash(value: unknown, field: string): asserts value is string { if (typeof value !== 'string' || !HASH.test(value)) fail(field); }
function stringArray(value: unknown, field: string): asserts value is string[] {
 if (!Array.isArray(value) || value.length > MAX_ARRAY_ENTRIES || value.some(item => typeof item !== 'string' || item.length > MAX_STRING)) fail(field);
}
function recordSize(value: unknown): void {
 if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_RECORD_BYTES) throw new Error('Checkpoint record exceeds 1MiB');
}
function inside(root: string, path: string): boolean {
 const rel = relative(root, path);
 return rel !== '..' && !rel.startsWith(`..${sep}`) && !rel.includes(`..${sep}`) && !rel.startsWith(`${sep}`);
}

function checkPath(root: string, path: string): void {
 if (!inside(root, path)) throw new Error('Checkpoint path escapes project directory');
 const parts = relative(root, path).split(/[\\/]/).filter(Boolean);
 let current = root;
 for (const part of parts) {
  current = join(current, part);
  if (!existsSync(current)) continue;
  const info = lstatSync(current);
  if (info.isSymbolicLink()) throw new Error(`Checkpoint symlink/reparse path is not allowed: ${current}`);
 }
}

function ensureDirectory(root: string, path: string): void {
 checkPath(root, path);
 if (existsSync(path)) {
  if (!lstatSync(path).isDirectory()) throw new Error('Checkpoint storage path is not a directory');
 } else mkdirSync(path, { recursive: true });
 checkPath(root, path);
 if (readdirSync(path).length > MAX_ENTRIES) throw new Error('Checkpoint directory exceeds 10000 entries');
}

function projectManifest(input: ContextManifest): ContextManifest {
 if (!input || input.version !== 1) fail('manifest');
 safeId(input.projectId, 'projectId'); safeId(input.taskId, 'taskId');
 stringArray(input.pinned, 'pinned'); stringArray(input.recent, 'recent'); stringArray(input.decisions, 'decisions');
 stringArray(input.unresolved, 'unresolved'); stringArray(input.artifactIds, 'artifactIds');
 if (input.toolArguments !== undefined) stringArray(input.toolArguments, 'toolArguments');
 if (input.checkpointId !== undefined) uuid(input.checkpointId, 'checkpointId');
 const output: ContextManifest = {
  version: 1, projectId: input.projectId, taskId: input.taskId, pinned: [...input.pinned], recent: [...input.recent],
  decisions: [...input.decisions], unresolved: [...input.unresolved], artifactIds: [...input.artifactIds],
  ...(input.toolArguments === undefined ? {} : { toolArguments: [...input.toolArguments] }),
  ...(input.checkpointId === undefined ? {} : { checkpointId: input.checkpointId })
 };
 recordSize(output);
 return output;
}

function projectSummary(input: CheckpointSummary): CheckpointSummary {
 if (!input || typeof input.summary !== 'string' || input.summary.length > MAX_STRING) fail('summary');
 stringArray(input.pinned, 'summary.pinned'); stringArray(input.decisions, 'summary.decisions');
 stringArray(input.unresolved, 'summary.unresolved'); stringArray(input.nextActions, 'summary.nextActions');
 const output = { summary: input.summary, pinned: [...input.pinned], decisions: [...input.decisions], unresolved: [...input.unresolved], nextActions: [...input.nextActions] };
 recordSize(output);
 return output;
}

function preservesAll(original: string[], compacted: string[]): boolean {
 const counts = new Map<string, number>();
 for (const item of compacted) counts.set(item, (counts.get(item) ?? 0) + 1);
 for (const item of original) {
  const remaining = counts.get(item) ?? 0;
  if (remaining === 0) return false;
  counts.set(item, remaining - 1);
 }
 return true;
}

function parseManifest(bytes: Buffer, path: string): ContextManifest {
 try { return projectManifest(JSON.parse(bytes.toString('utf8')) as ContextManifest); } catch { throw new Error(`Corrupt checkpoint source: ${path}`); }
}

export class CheckpointStore {
 private readonly root: string;
 private readonly sources: string;
 private readonly checkpoints: string;
 private readonly projectId: string;

 constructor(projectDirectory: string, projectId: string) {
  if (typeof projectDirectory !== 'string' || !projectDirectory.trim() || /(^|[\\/])\.\.(?=[\\/]|$)/.test(projectDirectory)) throw new Error('Invalid project directory');
  this.root = resolve(projectDirectory);
  if (!existsSync(this.root) || !lstatSync(this.root).isDirectory()) throw new Error('Project directory must exist');
  safeId(projectId, 'projectId'); this.projectId = projectId;
  const control = join(this.root, '.agentic-controlroom');
  const harness = join(control, 'harness');
  this.sources = join(harness, 'context-sources'); this.checkpoints = join(harness, 'context-checkpoints');
  ensureDirectory(this.root, control); ensureDirectory(this.root, harness); ensureDirectory(this.root, this.sources); ensureDirectory(this.root, this.checkpoints);
  for (const directory of [this.sources, this.checkpoints]) for (const name of readdirSync(directory)) checkPath(this.root, join(directory, name));
 }

 async compact(manifest: ContextManifest, summarize: (manifest: ContextManifest) => Promise<CheckpointSummary>): Promise<Checkpoint> {
  const original = projectManifest(manifest);
  if (original.projectId !== this.projectId) throw new Error('Checkpoint project ownership mismatch');
  const sourceBytes = Buffer.from(JSON.stringify(original), 'utf8');
  const sourceId = digest(sourceBytes);
  this.writeImmutable(this.sources, `${sourceId}.json`, sourceBytes);
  const result = projectSummary(await summarize(JSON.parse(JSON.stringify(original)) as ContextManifest));
  if (!preservesAll(original.pinned, result.pinned)) throw new Error('Checkpoint summary lost pinned context');
  if (!preservesAll(original.decisions, result.decisions)) throw new Error('Checkpoint summary lost decision');
  if (!preservesAll(original.unresolved, result.unresolved)) throw new Error('Checkpoint summary lost unresolved issue');
  const checkpoint: Checkpoint = Object.freeze({ version: 1, id: randomUUID(), projectId: this.projectId, taskId: original.taskId,
   createdAt: new Date().toISOString(), sourceId, sourceHash: digest(sourceBytes), summary: Object.freeze(result) });
  const stored: StoredCheckpoint = { ...checkpoint, metadataHash: digest(JSON.stringify(checkpoint)) };
  recordSize(stored); this.writeImmutable(this.checkpoints, `${checkpoint.id}.json`, Buffer.from(JSON.stringify(stored), 'utf8'));
  return checkpoint;
 }

 async list(taskId: string): Promise<Checkpoint[]> {
  this.assertTask(taskId);
  const values: Checkpoint[] = [];
  for (const name of readdirSync(this.checkpoints)) {
   if (!name.endsWith('.json')) continue;
   try {
    const checkpoint = this.readCheckpoint(name.slice(0, -5), taskId);
    if (checkpoint.taskId === taskId) values.push(checkpoint);
   } catch (error) {
    if (!(error instanceof Error) || !/ownership/.test(error.message)) throw error;
   }
  }
  return values.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
 }

 async get(taskId: string, id: string): Promise<Checkpoint> { this.assertTask(taskId); uuid(id, 'id'); return this.readCheckpoint(id, taskId); }

 async source(taskId: string, sourceId: string): Promise<ContextManifest> {
  this.assertTask(taskId); hash(sourceId, 'sourceId');
  const path = this.file(this.sources, `${sourceId}.json`); const bytes = this.readVerified(path, sourceId);
  const value = parseManifest(bytes, path);
  if (value.projectId !== this.projectId || value.taskId !== taskId) throw new Error('Checkpoint source ownership mismatch');
  return value;
 }

 private assertTask(taskId: string): void { safeId(taskId, 'taskId'); }
 private file(directory: string, name: string): string { const path = join(directory, name); checkPath(this.root, path); return path; }
 private readVerified(path: string, expectedHash: string): Buffer {
  if (!existsSync(path)) throw new Error('Checkpoint record not found');
  checkPath(this.root, path); if (lstatSync(path).size > MAX_RECORD_BYTES) throw new Error('Checkpoint record exceeds 1MiB');
  const bytes = readFileSync(path);
  if (digest(bytes) !== expectedHash) throw new Error('Checkpoint hash mismatch'); return bytes;
 }
 private readCheckpoint(id: string, taskId: string): Checkpoint {
  uuid(id, 'id'); const path = this.file(this.checkpoints, `${id}.json`);
  try {
   if (!existsSync(path)) throw new Error('Checkpoint record not found');
   checkPath(this.root, path); if (lstatSync(path).size > MAX_RECORD_BYTES) throw new Error('Checkpoint record exceeds 1MiB');
   const bytes = readFileSync(path); recordSize(JSON.parse(bytes.toString('utf8'))); const stored = JSON.parse(bytes.toString('utf8')) as StoredCheckpoint;
   if (stored.metadataHash !== digest(JSON.stringify({ version: stored.version, id: stored.id, projectId: stored.projectId, taskId: stored.taskId, createdAt: stored.createdAt, sourceId: stored.sourceId, sourceHash: stored.sourceHash, summary: stored.summary }))) throw new Error('metadata hash');
   uuid(stored.id, 'id'); if (stored.id !== id) throw new Error('Checkpoint ID mismatch'); safeId(stored.projectId, 'projectId'); safeId(stored.taskId, 'taskId'); hash(stored.sourceId, 'sourceId'); hash(stored.sourceHash, 'sourceHash');
   if (stored.version !== 1 || !Number.isFinite(Date.parse(stored.createdAt))) throw new Error('fields');
   if (stored.projectId !== this.projectId || stored.taskId !== taskId) throw new Error('ownership');
   const sourceBytes = this.readVerified(this.file(this.sources, `${stored.sourceId}.json`), stored.sourceId);
   if (digest(sourceBytes) !== stored.sourceHash) throw new Error('source hash');
   const source = parseManifest(sourceBytes, this.file(this.sources, `${stored.sourceId}.json`));
   if (source.projectId !== this.projectId || source.taskId !== taskId) throw new Error('ownership');
   return Object.freeze({ version: 1, id: stored.id, projectId: stored.projectId, taskId: stored.taskId, createdAt: stored.createdAt, sourceId: stored.sourceId, sourceHash: stored.sourceHash, summary: Object.freeze(projectSummary(stored.summary)) });
  } catch (error) { if (error instanceof Error && /not found|ownership|hash|size|Corrupt|Invalid/.test(error.message)) throw error; throw new Error(`Corrupt checkpoint: ${path}`); }
 }
 private writeImmutable(directory: string, name: string, bytes: Buffer): void {
  if (bytes.length > MAX_RECORD_BYTES) throw new Error('Checkpoint record exceeds 1MiB');
  const finalPath = this.file(directory, name);
  if (existsSync(finalPath)) {
   checkPath(this.root, finalPath);
   if (!readFileSync(finalPath).equals(bytes)) throw new Error('Immutable checkpoint record already exists with different content');
   return;
  }
  if (readdirSync(directory).length >= MAX_ENTRIES) throw new Error('Checkpoint directory exceeds 10000 entries');
  const temporary = this.file(directory, `.${name}.${randomUUID()}.tmp`);
  try { writeFileSync(temporary, bytes, { flag: 'wx' }); linkSync(temporary, finalPath); } finally { if (existsSync(temporary)) unlinkSync(temporary); }
 }
}
