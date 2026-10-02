import { monthlyReconciliationPending } from './work-state.js';
import { careerProfile } from './profile-groups.js';
import { coveredStatementMonths } from '../modules/ledger-books/monthly-policy.js';
import { getFolioDb } from '../folio-db/init.js';
import { readReconciliationEvidence } from '../modules/ledger-books/reconciliation.js';
import { canonicalHash } from '../modules/ledger-books/reconciliation.js';
import type { listMemoryReviewQueue } from './review.js';
import { paymentIssues,paymentQuestions } from '../modules/ledger-books/payment-status.js';
import { manualImportRoot,statementImportConfig } from '../modules/ledger-books/manual-import.js';
import { documentBytes } from '../file-intake/document-security.js';
import { join } from 'node:path';
export type ReviewBundle = ReturnType<typeof listMemoryReviewQueue>['active'][number];
export type WorkLane = 'decision' | 'processing';
export interface ReviewDiagnostic { verdict?:string; reason_codes?:string[]; diagnostic?:{unsupported_object_ids:string[]}; }
export interface PaymentSuggestion {date:string;amount:string;currency:string;description:string;}
export interface PaymentReview { factId:string; state:'decision'|'waiting'; reason:string; suggestions?:PaymentSuggestion[]; route?:'context'|'broker'; bundleKey?:string; }
export interface WorkItem { lane:WorkLane; kind:string; question:string; reasons:string[]; flagged:string[]; paymentSuggestions?:PaymentSuggestion[]; }
export const WORK_KINDS:Record<string,string>={profile:'Qualifikationen & Erfahrung',payment:'Zahlungsabgleich',broker:'Broker & Depot',repair:'Angaben berichtigen',evidence:'Belege prüfen',file:'Dateien prüfen',status:'Vorgangsstatus',keep:'Wissen auswählen',identity:'Zuordnung',event:'Ereignisse'};
export function classifyMemoryWork(bundle:ReviewBundle,review:ReviewDiagnostic={},payments:PaymentReview[]=[]):WorkItem {
 const facts=bundle.facts.filter(f=>f.status==='candidate');
 const reasons=review.reason_codes??[],flagged=review.diagnostic?.unsupported_object_ids??[];
 const result=(lane:WorkLane,kind:string,question:string):WorkItem=>({lane,kind,question,reasons,flagged});
 const paid=facts.filter(f=>f.predicate==='paid');
 if(paid.length){
  const states=paid.map(f=>payments.find(p=>p.factId===f.fact_id));
  const routed=states.find(s=>s?.route);
  if(routed&&states.every(s=>s?.route===routed.route))return result(routed.route==='context'?'decision':'processing',routed.route==='context'?'keep':'broker',routed.reason);
  const unresolved=states.find(s=>s?.state==='decision'&&!s.route)??states.find(s=>s?.state==='decision');
  if(unresolved?.route==='context')return result('decision','keep',unresolved.reason);
  return unresolved?{...result('decision','payment',unresolved.reason),paymentSuggestions:unresolved.suggestions}:result('processing','payment',states.find(Boolean)?.reason??'Wartet auf passenden Kontoauszug und Zahlungsabgleich');
 }
 if(!facts.length)return result('decision','event','Soll dieses Ereignis im Gedächtnis bleiben?');
 if(bundle.proposal.source_kind==='file'&&!review.verdict)return result('processing','file','Dateiquelle für die unabhängige Prüfung vorbereiten');
 if(reasons.some(r=>['date_not_explicit','status_not_explicit','overinterpretation'].includes(r)))return result('processing','repair','Beanstandete Angaben anhand der Quelle berichtigen');
 if(reasons.includes('evidence_mismatch'))return result('processing','evidence','Aussage und zugehörige Belegstelle abgleichen');
 if(facts.some(f=>f.predicate==='has_application_status'))return result('processing','status','Status mit dem bestehenden Vorgang abgleichen');
 if(reasons.includes('transient_or_low_value'))return result('decision','keep','Welche dieser Angaben möchtest du dauerhaft behalten?');
 return result('decision','identity',reasons.includes('wrong_domain')?'Zu welchem Bereich gehört dieser Vorgang?':'Passt diese Aussage zu diesem Vorgang?');
}
/** Reconciliation output is accepted only with current hashes and full coverage
 * for the exact account/window. A missing result is a waiting state. */
export function paymentReviewStates(evidence=readReconciliationEvidence()):PaymentReview[]{
 const pending=monthlyReconciliationPending();
 const states:PaymentReview[]=evidence.flatMap(({candidate:c,result:r,batch,stale})=>{
  if(!c?.memory_binding?.fact_id||stale)return [];
  const current=getFolioDb().prepare('SELECT * FROM memory_facts WHERE fact_id=?').get(c.memory_binding.fact_id);
  if(!current||canonicalHash(current)!==c.memory_binding.fact_sha256)return [];
  const accounts = c.match_request?.account_refs;
  const month = c.normalized_invoice?.due_date?.slice(0,7);
  const covered=r.coverage?.complete_for_target===true && Array.isArray(accounts) && accounts.length>0 && !!month && accounts.every(a=>coveredStatementMonths(batch.sources,a).has(month));
  const needsDecision=covered&&['ambiguous','not_found_with_complete_coverage','matched'].includes(r.status);
  const party=String(c.normalized_invoice?.counterparty??'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const suggestions=covered?(batch.entries??[]).filter((e:any)=>e.currency===c.normalized_invoice?.currency&&e.booking_date>=c.match_request.window.from&&e.booking_date<=c.match_request.window.to&&(Math.abs(Number(e.amount))===Number(c.normalized_invoice?.amount)||(party.length>=5&&String(e.purpose??'').toLowerCase().replace(/[^a-z0-9]/g,'').includes(party)))).slice(0,3).map((e:any)=>({date:e.booking_date,amount:e.amount,currency:e.currency,description:String(e.counterparty||e.purpose||'').replace(/\s+/g,' ').slice(0,180)})):[];
  const conflict=evidence.some(e=>e!==undefined&&!e.stale&&e.candidate?.memory_binding?.fact_id!==c.memory_binding.fact_id&&e.result.matches[0]?.observation_id&&e.result.matches[0]?.observation_id===r.matches[0]?.observation_id);
  return [{factId:c.memory_binding.fact_id,bundleKey:c.normalized_invoice?.document_key,state:needsDecision?'decision' as const:'waiting' as const,suggestions,reason:needsDecision?(conflict?'Gehören diese Belege zur selben Zahlung?':r.status==='matched'?'Banktreffer gefunden: Gehört diese Buchung zu diesem Beleg?':(r.exceptions??[]).map(e=>paymentQuestions[e]).find(Boolean)??'Nach dem Monatsabgleich offen: Wie wurde dieser Beleg bezahlt?'):'Wartet auf vollständigen Kontoauszug für dieses Konto und diesen Zeitraum'}];
 });
 try{
  const batch=JSON.parse(documentBytes(join(manualImportRoot(),'statement-batch.json'),64*1024*1024).toString());
  if(batch.batch_sha256!==canonicalHash({sources:batch.sources,entries:batch.entries,issues:batch.issues})||batch.issues.length)throw Error('invalid_batch');
  const accounts=statementImportConfig()?.roots.flatMap(r=>r.accounts.map(a=>a.ref))??[];
  for(const issue of paymentIssues()){
   if(states.some(s=>s.factId===issue.fact_id))continue;
   const fact=getFolioDb().prepare('SELECT * FROM memory_facts WHERE fact_id=?').get(issue.fact_id);
   if(!fact||canonicalHash(fact)!==issue.fact_sha256)continue;
   if(issue.reason==='payment_context_only'){states.push({factId:issue.fact_id,state:'decision',route:'context',reason:'Vertragsinformation im Gedächtnis einordnen'});continue;}
   if(issue.reason==='payment_broker_statement_required'){states.push({factId:issue.fact_id,state:'waiting',route:'broker',reason:'Mit dem Broker- oder Depotauszug abgleichen'});continue;}
   const infrastructure=['payment_match_failed','payment_match_binding','ledger_companion_update_required'].includes(issue.reason);
   const complete=!infrastructure&&accounts.length>0&&accounts.every(a=>coveredStatementMonths(batch.sources,a).has(issue.month));
   states.push({factId:issue.fact_id,state:complete?'decision':'waiting',reason:complete?(paymentQuestions[issue.reason]??'Dieser Beleg braucht eine ergänzende Angabe für den Zahlungsabgleich.'):'Wartet auf vollständige Monatsauszüge'});
  }
 }catch{}
 return pending?states.map(s=>s.route?s:({...s,state:'waiting',reason:'Monatsabgleich läuft oder wartet auf Fortsetzung'})):states;
}
export function latestMemoryDiagnostics():Map<string,ReviewDiagnostic>{
 const rows=getFolioDb().prepare("SELECT proposal_id,detail_json FROM memory_ledger WHERE event_type='delegated_reviewed' ORDER BY recorded_at,rowid").all() as {proposal_id:string;detail_json:string}[];
 return new Map(rows.map(r=>[r.proposal_id,JSON.parse(r.detail_json)]));
}
/** UI grouping requires a shared canonical entity, never a similar title. */
export function memoryWorkGroup(bundle:ReviewBundle):string {
 const profile=careerProfile(bundle);if(profile)return profile.key;
 const entity=bundle.entities.find(e=>e.entity_type==='application'&&e.canonical_key);
 return entity?`${bundle.proposal.domain}:${entity.entity_type}:${entity.canonical_key}`:bundle.proposal.proposal_id;
}
export function memoryWorkProjection(bundles:ReviewBundle[],diagnostics=latestMemoryDiagnostics(),payments=paymentReviewStates(),needsReview:ReadonlySet<string>=new Set(),careerQuestions:ReadonlyMap<string,WorkItem>=new Map()){
 const projected=bundles.map(bundle=>({...bundle,work:careerQuestions.get(bundle.proposal.proposal_id)??(needsReview.has(bundle.proposal.proposal_id)?{...classifyMemoryWork(bundle,diagnostics.get(bundle.proposal.proposal_id),payments),lane:'decision' as const,question:'Welche der markierten Angaben stimmt?'}:classifyMemoryWork(bundle,diagnostics.get(bundle.proposal.proposal_id),payments)),workGroup:bundle.facts.map(f=>payments.find(p=>p.factId===f.fact_id)?.bundleKey).find(Boolean)??memoryWorkGroup(bundle)}));
 const items=projected.map(item=>careerProfile(item)?{...item,work:{...item.work,kind:'profile',question:'Welche Angaben möchtest du übernehmen?'}}:item);
 return {items,counts:{decision:new Set(items.filter(b=>b.work.lane==='decision').map(b=>`${b.workGroup}:${b.work.kind}`)).size,processing:new Set(items.filter(b=>b.work.lane==='processing').map(b=>`${b.workGroup}:${b.work.kind}`)).size},domains:[...new Set(items.map(b=>b.proposal.domain))].sort(),kinds:WORK_KINDS};
}
