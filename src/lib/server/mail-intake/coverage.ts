import { accounts, historyAccounts } from './accounts.js';
import { db, runs } from './state.js';
export function mailCoverage() {
 const history=runs();
 return accounts().map(a=>{
  const row=db().prepare('SELECT value FROM mail_intake_coverage WHERE account=?').get(a.id) as {value:string}|undefined;
  const source=row?JSON.parse(row.value):null;
  const historical=db().prepare('SELECT value FROM mail_intake_coverage WHERE account=?').get(a.id+'::history') as {value:string}|undefined;
  const latest=history.find(r=>r.account===a.id);
  const completed=history.find(r=>r.account===a.id&&r.state==='completed');
  const outstanding=history.filter(r=>r.account===a.id&&r.state!=='completed');
  const countItems=(state:'pending'|'running'|'failed')=>outstanding.filter(r=>r.state===state).reduce((n,r)=>n+r.items.filter(i=>i.stage!=='done').length,0);
  const queued=countItems('pending');
  const processing=countItems('running');
  const failed=countItems('failed');
  const pending=queued+processing+failed;
  const prefixes=[`mail:${a.id}:%`,`mail:${a.id}-history:%`];
  const candidates=(db().prepare("SELECT count(*) AS n FROM memory_proposals WHERE status='candidate' AND (source_ref LIKE ? OR source_ref LIKE ?)").get(...prefixes) as {n:number}).n;
  const confirmedFacts=(db().prepare("SELECT count(*) AS n FROM memory_facts WHERE status='confirmed' AND (source_ref LIKE ? OR source_ref LIKE ?)").get(...prefixes) as {n:number}).n;
  return {candidates,humanReview:candidates,confirmedFacts,historyEnabled:historyAccounts().includes(a.id),id:a.id,label:a.label,kind:a.kind,source,historical:historical?JSON.parse(historical.value):null,lastCompleted:completed?.ended_at??null,state:latest?.state??'not_started',error:latest?.error??null,pending,queued,processing,failed};
 });
}
