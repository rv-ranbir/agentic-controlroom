import { randomUUID } from 'node:crypto';

export interface BudgetLimits {
 readonly maxCalls: number;
 readonly maxConcurrent: number;
 readonly maxWallMs: number;
}

export interface BudgetUsage {
 readonly calls?: number;
 readonly outputTokens?: number;
}

export interface ReserveOptions {
 readonly calls?: number;
 readonly outputTokens?: number;
 readonly attemptId?: string;
}

export interface RecoveredReservation {
 readonly reservationId: string;
 readonly taskId: string;
 readonly calls: number;
 readonly reservedAt: number;
}

export interface BudgetReservation extends RecoveredReservation {}

export interface BudgetSnapshot {
 readonly limits: BudgetLimits;
 readonly startedAt: number;
 readonly callsSpent: number;
 readonly concurrent: number;
 readonly settled: number;
 readonly reservations: readonly BudgetReservation[];
 readonly reconciliationNeeded: readonly string[];
}

export interface BudgetRemaining {
 readonly calls: number;
 readonly concurrent: number;
 readonly wallMs: number;
}

interface StoredReservation extends BudgetReservation {
 status: 'active' | 'settled' | 'released' | 'recovered';
}

interface State {
 readonly startedAt: number;
 callsSpent: number;
 concurrent: number;
 settled: number;
 readonly reservations: Map<string, StoredReservation>;
 readonly reconciliationNeeded: Set<string>;
}

export interface BudgetPoolOptions {
 readonly now?: () => number;
 readonly recovered?: BudgetRecovery | readonly RecoveredReservation[];
}

export interface BudgetRecovery {
 readonly startedAt: number;
 readonly callsSpent: number;
 readonly reservations: readonly RecoveredReservation[];
}

function validLimit(value: number, name: string): number {
 if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${name}`);
 return value;
}

function validateLimits(limits: BudgetLimits): BudgetLimits {
 return Object.freeze({
  maxCalls: validLimit(limits.maxCalls, 'maxCalls'),
  maxConcurrent: validLimit(limits.maxConcurrent, 'maxConcurrent'),
  maxWallMs: validLimit(limits.maxWallMs, 'maxWallMs'),
 });
}

function validateCalls(calls: number): void {
 if (!Number.isSafeInteger(calls) || calls <= 0) throw new Error('Invalid calls');
}

function validateSpent(calls: number): void {
 if (!Number.isSafeInteger(calls) || calls < 0) throw new Error('Invalid callsSpent');
}

export class BudgetPool {
 private readonly now: () => number;
 private readonly state: State;
 private readonly limits: BudgetLimits;

 constructor(limits: BudgetLimits, options: BudgetPoolOptions = {}) {
  this.limits = validateLimits(limits);
  this.now = options.now ?? Date.now;
  const recovery = options.recovered;
  const recoveredSnapshot = recovery !== undefined && !('length' in recovery) ? recovery : undefined;
  const startedAt = recoveredSnapshot === undefined ? this.now() : recoveredSnapshot.startedAt;
  if (!Number.isFinite(startedAt)) throw new Error('Invalid clock');
  const recoveredReservations: readonly RecoveredReservation[] = recoveredSnapshot !== undefined
   ? recoveredSnapshot.reservations
   : recovery === undefined ? [] : recovery as readonly RecoveredReservation[];
  const recoveredCalls = recoveredSnapshot?.callsSpent ?? 0;
  validateSpent(recoveredCalls);
  this.state = {
   startedAt,
   callsSpent: recoveredCalls,
   concurrent: 0,
   settled: 0,
   reservations: new Map(),
   reconciliationNeeded: new Set(),
  };
  for (const recovered of recoveredReservations) {
   validateCalls(recovered.calls);
   if (!recovered.reservationId || !recovered.taskId || !Number.isFinite(recovered.reservedAt)) {
    throw new Error('Invalid recovered reservation');
   }
   if (this.state.reservations.has(recovered.reservationId)) throw new Error('Duplicate reservation');
   const copy = Object.freeze({ ...recovered });
   this.state.reservations.set(recovered.reservationId, { ...copy, status: 'recovered' });
   if (recoveredSnapshot === undefined) this.state.callsSpent += recovered.calls;
   this.state.reconciliationNeeded.add(recovered.reservationId);
   this.state.concurrent += 1;
  }
 }

 child(requested: Partial<BudgetLimits> = {}): BudgetPool {
  const childLimits = {
   maxCalls: requested.maxCalls ?? this.limits.maxCalls,
   maxConcurrent: requested.maxConcurrent ?? this.limits.maxConcurrent,
   maxWallMs: requested.maxWallMs ?? this.limits.maxWallMs,
  };
  for (const key of ['maxCalls', 'maxConcurrent', 'maxWallMs'] as const) {
   validLimit(childLimits[key], key);
   if (this.limits[key] !== 0 && (childLimits[key] === 0 || childLimits[key] > this.limits[key])) {
    throw new Error(`Child limit cannot expand ${key}`);
   }
  }
  const child = Object.create(BudgetPool.prototype) as BudgetPool;
  (child as unknown as { limits: BudgetLimits }).limits = Object.freeze(childLimits);
  (child as unknown as { now: () => number }).now = this.now;
  (child as unknown as { state: State }).state = this.state;
  return child;
 }

 reserve(taskId: string, options: ReserveOptions = {}): string {
  if (typeof taskId !== 'string' || !taskId.trim()) throw new Error('Invalid taskId');
  if (options.outputTokens !== undefined) throw new Error('outputTokens reservations are unavailable');
  const calls = options.calls ?? 1;
  validateCalls(calls);
  const reservationId = options.attemptId ?? randomUUID();
  if (typeof reservationId !== 'string' || !reservationId.trim()) throw new Error('Invalid attemptId');
  if (this.state.reservations.has(reservationId)) throw new Error('Duplicate reservation');
  if (this.limits.maxConcurrent > 0 && this.state.concurrent >= this.limits.maxConcurrent) {
   throw new Error('Budget concurrency exhausted');
  }
  if (this.limits.maxCalls > 0 && calls > this.limits.maxCalls - this.state.callsSpent) {
   throw new Error('Budget calls exhausted');
  }
  if (this.limits.maxWallMs > 0 && this.now() - this.state.startedAt >= this.limits.maxWallMs) {
   throw new Error('Budget deadline exceeded');
  }
  const reservation = Object.freeze({
   reservationId,
   taskId,
   calls,
   reservedAt: this.now(),
  });
  this.state.reservations.set(reservationId, { ...reservation, status: 'active' });
  this.state.callsSpent += calls;
  this.state.concurrent += 1;
  return reservationId;
 }

 settle(attemptId: string, _usage?: BudgetUsage): void {
  const reservation = this.state.reservations.get(attemptId);
  if (!reservation || reservation.status === 'settled' || reservation.status === 'released') return;
  if (reservation.status === 'active' || reservation.status === 'recovered') this.state.concurrent -= 1;
  reservation.status = 'settled';
  this.state.reconciliationNeeded.delete(attemptId);
  this.state.settled += 1;
 }

 /** Only for a reservation whose provider has never been dispatched. */
 discardBeforeDispatch(reservationId:string):void {
  const reservation=this.state.reservations.get(reservationId);
  if(!reservation || reservation.status!=='active')return;
  reservation.status='released';
  this.state.concurrent-=1;
  this.state.callsSpent-=reservation.calls;
 }

 release(reservationId: string): void {
  const reservation = this.state.reservations.get(reservationId);
  if (!reservation || reservation.status !== 'active') return;
  reservation.status = 'released';
  this.state.concurrent -= 1;
 }

 snapshot(): BudgetSnapshot {
  const reservations = [...this.state.reservations.values()]
   .filter(reservation => reservation.status === 'active' || reservation.status === 'recovered')
   .map(({ status: _status, ...reservation }) => Object.freeze({ ...reservation }));
  return Object.freeze({
   limits: this.limits,
   startedAt: this.state.startedAt,
   callsSpent: this.state.callsSpent,
   concurrent: this.state.concurrent,
   settled: this.state.settled,
   reservations: Object.freeze(reservations),
   reconciliationNeeded: Object.freeze([...this.state.reconciliationNeeded]),
  });
 }

 remaining(): BudgetRemaining {
  return Object.freeze({
   calls: this.limits.maxCalls === 0 ? 0 : Math.max(0, this.limits.maxCalls - this.state.callsSpent),
   concurrent: this.limits.maxConcurrent === 0 ? 0 : Math.max(0, this.limits.maxConcurrent - this.state.concurrent),
   wallMs: this.limits.maxWallMs === 0 ? 0 : Math.max(0, this.limits.maxWallMs - (this.now() - this.state.startedAt)),
  });
 }
}
