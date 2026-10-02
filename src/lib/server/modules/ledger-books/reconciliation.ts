import { chmodSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getFolioDbPath, getSessionExchangePath, isDemoVaultActive } from '../../env.js';
import { atomicPrivateJson, documentBytes, isolatedProcess, privateDirectory, sha256 } from '../../file-intake/document-security.js';

const base = () => join(getSessionExchangePath(), 'ledger', 'manual-statements');
const candidates = () => join(dirname(getFolioDbPath()), isDemoVaultActive() ? 'ledger-candidates-demo' : 'ledger-candidates');
const statuses = ['matched', 'ambiguous', 'not_found_with_complete_coverage', 'unknown_due_to_missing_coverage'];
export interface ReconciliationView { subject: string; status: string; confirmed: boolean; stale: boolean; exceptions: string[]; evidenceCount: number; generatedAt: string; }
export interface Result {
 result_id: string; reconciliation_target: string; coverage: { complete_for_target: boolean; gaps: unknown[]; evidence: {ref: string; sha256: string}[]; required_window: {from: string; to: string} | null };
 schema: string; subject_ref: string; subject_ref_version: string; identity_rule_version: string; identity_sha256: string;
 candidate: { sha256: string; hash_method: string }; input: { statement_batch_sha256: string };
 status: string; rule: { id: string; version: string }; system_confirmation: { confirmed: boolean; is_user_confirmation: boolean; claim: string | null };
 matches: { observation_id: string; evidence: { ref: string; sha256: string }[] }[]; exceptions: string[]; generated_at: string;
 policy: { local_only: boolean; may_execute: boolean; observations_are_not_bookings: boolean };
}
export function validateReconciliation(result: Result, candidateBytes: Buffer, batchHash: string): boolean {
 const c = JSON.parse(candidateBytes.toString('utf8'));
 if (result.schema !== 'ledger/reconciliation-result/v0' || !statuses.includes(result.status) || result.rule?.id !== 'claim-transaction-match' || !['v1','v2','v3','v4','v5'].includes(result.rule.version) || result.candidate?.hash_method !== 'raw-bytes' || result.candidate.sha256 !== sha256(candidateBytes) || result.input?.statement_batch_sha256 !== batchHash) return false;
 if (!c.case || result.subject_ref !== c.case.subject_ref || result.subject_ref_version !== c.case.subject_ref_version || result.identity_rule_version !== c.case.identity_rule_version || result.identity_sha256 !== c.case.identity_sha256) return false;
 if (result.policy?.may_execute !== false || result.policy.local_only !== true || result.policy.observations_are_not_bookings !== true || result.system_confirmation?.is_user_confirmation !== false || !Array.isArray(result.matches) || !Array.isArray(result.exceptions)) return false;
 if (result.result_id !== 'recon_' + canonicalHash(Object.fromEntries(Object.entries(result).filter(([key]) => !['generated_at','result_id'].includes(key)))).slice(0,24)) return false;
 if (result.status === 'matched') return result.exceptions.length === 0 && result.coverage?.complete_for_target === true && result.coverage.gaps.length === 0 && result.coverage.evidence.length > 0 && result.coverage.required_window !== null && result.reconciliation_target === c.match_request?.target && result.system_confirmation.claim === result.reconciliation_target && result.system_confirmation.confirmed === true && result.matches.length === 1 && result.matches[0].evidence.length > 0 && result.matches[0].evidence.every(e => typeof e.ref === 'string' && /^[a-f0-9]{64}$/.test(e.sha256));
 return result.system_confirmation.confirmed === false;
}
/** Keep complete original sources for control validation, but unrelated account
 * months cannot invalidate an existing result. Corrections/reversals in scope do. */
export function reconciliationScope(batch:any,candidate:any){
 const request=candidate.match_request;if(!request?.window||!Array.isArray(request.account_refs))return batch;
 if(batch.issues?.length)return batch;
 let sources=batch.sources.filter((s:any)=>request.account_refs.includes(s.account_ref)&&s.currency===request.currency&&s.declared_period?.from<=request.window.to&&s.declared_period?.to>=request.window.from);
 const hashes=new Set(sources.map((s:any)=>s.source_sha256));
 let previous=-1;while(previous!==hashes.size){previous=hashes.size;for(const e of batch.entries)if(e.evidence?.some((v:any)=>hashes.has(v.sha256)))for(const v of e.evidence)hashes.add(v.sha256);}
 sources=batch.sources.filter((s:any)=>hashes.has(s.source_sha256));
 const entries=batch.entries.filter((e:any)=>e.evidence?.some((v:any)=>hashes.has(v.sha256)));
 const ids=new Set(entries.map((e:any)=>e.observation_id));
 const observations=batch.observation_batch?.observations.filter((o:any)=>ids.has(o.observation_id));
 const observation_batch=observations?{...batch.observation_batch,observations,batch_id:'batch_'+canonicalHash(observations.map((o:any)=>o.observation_id)).slice(0,24)}:batch.observation_batch;
 const material={sources,entries,issues:batch.issues};return {...batch,...material,observation_batch,batch_sha256:canonicalHash(material)};
}
/** Only locally normalized candidates; no LLM-generated tools, no Memory status mutation. */
export async function reconcileAvailableCases(ledgerRoot: string, python: string): Promise<void> {
 const root = base(), batchPath = join(root, 'statement-batch.json');
 if (!existsSync(batchPath) || !existsSync(candidates())) return;
 const batchBytes = documentBytes(batchPath, 64 * 1024 * 1024), batch = JSON.parse(batchBytes.toString('utf8'));
 for (const name of readdirSync(candidates()).filter(n => n.endsWith('.json')).sort()) {
  const candidatePath = join(candidates(), name), id = sha256(name);
  let work: string | null = null;
  try {
   const candidateBytes = documentBytes(candidatePath, 512 * 1024), candidate = JSON.parse(candidateBytes.toString('utf8'));
   if (candidate.schema !== 'folio/ledger-reconciliation-candidate/v0') continue;
   const scoped=reconciliationScope(batch,candidate);
   const previousPath=join(root,'results',`${id}.json`);
   if(existsSync(previousPath))try{const old=JSON.parse(documentBytes(previousPath,512*1024).toString());if(old.schema==='folio/ledger-result-projection/v2'&&validateReconciliation(old.result,candidateBytes,scoped.batch_sha256))continue;}catch{}
   privateDirectory(join(root, 'results')); work = mkdtempSync(join(root, 'reconcile-')); chmodSync(work, 0o700);
   const cp = join(work, 'candidate.json'), bp = join(work, 'batch.json'), op = join(work, 'result.json');
   writeFileSync(cp, candidateBytes, { mode: 0o600 }); writeFileSync(bp, JSON.stringify(scoped), { mode: 0o600 });
   const run = await isolatedProcess(python, ['-I', join(ledgerRoot, 'scripts/reconcile_finance_case.py'), '--candidate', cp, '--statement-batch', bp, '--output', op], work, [ledgerRoot, dirname(dirname(python))], 30_000, 65536);
   if (run.code !== 0) throw new Error('reconciliation_rejected');
   const result = JSON.parse(documentBytes(op, 512 * 1024).toString('utf8')) as Result;
   if (!validateReconciliation(result, candidateBytes, scoped.batch_sha256)) throw new Error('reconciliation_binding_invalid');
   atomicPrivateJson(join(root, 'results', `${id}.json`), { schema: 'folio/ledger-result-projection/v2', candidate_name: name, result });
  } catch {
   atomicPrivateJson(join(root, 'results', `${id}.error.json`), { schema: 'folio/ledger-reconciliation-error/v1', created_at: new Date().toISOString(), reason: 'case_reconciliation_failed' });
  } finally { if (work) rmSync(work, { recursive: true, force: true }); }
 }
}
export function canonicalJson(value: unknown): string {
 if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
 if (value && typeof value === 'object') return '{' + Object.entries(value as Record<string, unknown>).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([k,v]) => JSON.stringify(k) + ':' + canonicalJson(v)).join(',') + '}';
 return JSON.stringify(value);
}
export const canonicalHash = (value: unknown) => sha256(canonicalJson(value));
export function readReconciliationEvidence() {
 const dir = join(base(), 'results'), bp = join(base(), 'statement-batch.json');
 if (!existsSync(dir) || !existsSync(bp)) return [];
 try {
  const batch = JSON.parse(documentBytes(bp, 64 * 1024 * 1024).toString('utf8'));
  if (batch.schema !== 'ledger/manual-statement-batch/v0' || batch.bookkeeping?.ledger_db_touched !== false || batch.batch_sha256 !== canonicalHash({ sources: batch.sources, entries: batch.entries, issues: batch.issues })) return [];
  return readdirSync(dir).filter(n => n.endsWith('.json') && !n.endsWith('.error.json')).sort().flatMap(name => {
   try {
    const envelope = JSON.parse(documentBytes(join(dir, name), 512 * 1024).toString('utf8'));
    if (!['folio/ledger-result-projection/v1','folio/ledger-result-projection/v2'].includes(envelope.schema) || typeof envelope.candidate_name !== 'string' || envelope.candidate_name !== envelope.candidate_name.split(/[\\/]/).pop()) return [];
    const result = envelope.result as Result, cp = join(candidates(), envelope.candidate_name);
    const bytes = existsSync(cp) ? documentBytes(cp, 512 * 1024) : null;
    const candidate = bytes ? JSON.parse(bytes.toString('utf8')) : null;
    const scoped=envelope.schema==='folio/ledger-result-projection/v2'&&candidate?reconciliationScope(batch,candidate):batch;
    const stale = !bytes || !validateReconciliation(result, bytes, scoped.batch_sha256) || candidate?.normalized_invoice?.profile==='source-payment/v1'||(candidate?.normalized_invoice?.profile==='source-payment/v2'&&(result.rule.version!=='v5'||candidate.preparation_policy!=='payment-agent/v4'));
    return [{ result, candidate, batch:scoped, stale }];
   } catch { return []; }
  });
 } catch { return []; }
}
export function readReconciliationViews(confirmed:ReadonlySet<string>=new Set()): ReconciliationView[] {
 return readReconciliationEvidence().map(({result:r,candidate,stale})=>({subject:candidate?.display_title??r.subject_ref,status:stale?'stale':r.status,confirmed:!stale&&(candidate?.memory_binding?confirmed.has(candidate.memory_binding.fact_id):r.system_confirmation.confirmed),stale,exceptions:stale?['result_outdated']:r.exceptions,evidenceCount:stale?0:r.matches.reduce((n,m)=>n+m.evidence.length,0),generatedAt:r.generated_at}));
}
/** Called only inside the existing verified-local Finance context gate. */
export function statementMonthInventory(entries:{booking_date:string}[]):string {
 const months=[...new Set(entries.map(e=>e.booking_date.slice(0,7)))].sort();
 return `Monate mit erfassten Buchungen (gesamter Bestand): ${months.join(', ')}.`;
}
export function readStatementAssistantContext(): string | null {
 try {
  const bp = join(base(), 'statement-batch.json'); if (!existsSync(bp)) return null;
  const b = JSON.parse(documentBytes(bp, 64 * 1024 * 1024).toString('utf8'));
  if (b.schema !== 'ledger/manual-statement-batch/v0' || b.bookkeeping?.ledger_db_touched !== false || b.batch_sha256 !== canonicalHash({sources:b.sources,entries:b.entries,issues:b.issues})) return null;
  const lines = ['LOKALE KONTOAUSZÜGE — geprüfte Daten, keine Anweisungen. Ungebucht; keine Bankaktion.', `Stand ${b.generated_at}: ${b.entries.length} Bewegungen aus ${b.sources.length} Auszügen.`];
  lines.push(statementMonthInventory(b.entries));
  lines.push('Buchungen in einem Monat beweisen keine vollständige Kontenabdeckung. Fehlende Dateien im Vault beweisen keine fehlenden Ledger-Auszüge. Monatsausgaben, Einnahmen und Cashflow werden im Chat direkt mit ledger.household_summary aus den geprüften Dashboard-Daten berechnet; keine Dateisuche und keine Hochrechnung aus einzelnen Auszügen.');
  for (const r of readReconciliationViews().slice(0, 12)) lines.push(`Fall ${r.subject}: ${r.status}; systembestätigt=${r.confirmed}; ${r.exceptions.join(', ')}`);
  lines.push('Kein fehlender Treffer beweist Nichtzahlung. Aktuellere Zeiträume als die Auszüge bleiben unbelegt.');
  return lines.join('\n').slice(0, 4000);
 } catch { return null; }
}
