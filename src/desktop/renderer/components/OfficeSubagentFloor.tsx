import type { SubagentRecord } from '../../subagentPresence';
import { OfficeCharacter } from './OfficeCharacter';

export const SUBAGENT_PAGE_SIZE = 12;
export function OfficeSubagentFloor({ records, parents, top, page, onPage, onSelect, selectedId }: {
 records: SubagentRecord[]; parents: Map<string, string>; top: number; page: number;
 onPage: (page: number) => void; onSelect: (record: SubagentRecord) => void; selectedId: string | null;
}) {
 const pages = Math.ceil(records.length / SUBAGENT_PAGE_SIZE);
 const current = Math.min(page, Math.max(0, pages - 1));
 const visible = records.slice(current * SUBAGENT_PAGE_SIZE, (current + 1) * SUBAGENT_PAGE_SIZE);
 return <section className="osDelegationFloor" style={{ top }} aria-label="Delegated work floor">
  <header><div><h2>Delegated work</h2><p>{records.length} observed subagents · temporary workstations</p></div>
   {pages > 1 && <nav aria-label="Subagent pages"><button onClick={() => onPage(current - 1)} disabled={current === 0}>Previous</button><span>{current + 1} / {pages}</span><button onClick={() => onPage(current + 1)} disabled={current + 1 === pages}>Next</button></nav>}
  </header>
  <div className="osDelegationDesks">{visible.map(record => <button key={record.id} className="osDelegationDesk" data-subagent-id={record.id} data-status={record.status} aria-label={`Subagent ${record.description}`} aria-pressed={selectedId === record.id} onClick={() => onSelect(record)}>
   <div className="osDelegationWorkstation" aria-hidden="true"><span className="osDelegationMonitor"/><OfficeCharacter agentId={record.id} seated working={record.status === 'running'}/></div>
   <strong>{record.description}</strong><span>For {parents.get(record.parentAgentId)}</span><small>{record.status === 'running' ? 'Working' : 'Status unavailable'}</small>
  </button>)}</div>
 </section>;
}
