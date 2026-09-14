import type { Attempt, ExecutionPolicy } from './types.js';
import { assertRunScope } from './runScope.js';
import { resolvePolicy, type EnforcementCapabilities } from './policy.js';
export interface IsolationCommand { executable: string; args: string[]; cwd: string; }
export interface IsolationDriver {
 probe(): Promise<EnforcementCapabilities>;
 launch(attempt: Attempt, command: IsolationCommand, policy: ExecutionPolicy): Promise<unknown>;
 cancel(attemptId: string): Promise<void>;
}
/** No driver is enabled until real boundary and native provider compatibility tests pass. */
export const unavailableIsolationDriver: IsolationDriver = {
 async probe() { return { mechanism: 'Unavailable: no verified compatible isolation driver', verified: false,
  readOnly: false, workspace: false, networkOff: false, networkAllowlist: false, descendants: false,
  wallTime: false, calls: false, concurrency: false }; },
 async launch() { throw new Error('Isolation unavailable'); },
 async cancel() { throw new Error('Isolation unavailable; no isolated process was started'); },
};
export async function launchWithPolicy(driver: IsolationDriver, attempt: Attempt, command: IsolationCommand, policy: ExecutionPolicy): Promise<unknown> {
 assertRunScope(attempt.scope);
 const report = resolvePolicy(policy, await driver.probe());
 if (!report.enforced) throw new Error(`Isolation unavailable: ${report.unsupported.join(', ')}`);
 return driver.launch(attempt, command, report.requested);
}
