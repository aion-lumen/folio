import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { isDemoVaultActive } from '../env.js';
import { hasModuleCapability } from '../modules/index.js';
import { getFolioDb } from '../folio-db/init.js';
import { getFeedbackRowById } from '../feedback/reader.js';
import type { FeedbackRow } from '../feedback/types.js';
import { getValidatorOpinionsMap } from '../folio-db/reader.js';
import { loadRegelwerk } from '../regelwerk/loader.js';
import { readCartaTracker } from '../career/carta-tracker.js';
import type { ReconciliationFinding, RejectionReconciliationReport } from '../career/rejection-reconcile.js';
import { mailSourceEligibilitySnapshot } from './mailbox-source.js';
import { attachmentSummary, type AttachmentCheck } from './attachments.js';
import type { Item, IntakeRun } from './state.js';
import type { MailWorkStatus } from '../../util/mail-work-status.js';

const POLICY='local-mail-completion-v1';
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const bodyHash=(value:string)=>createHash('sha256').update(value).digest('hex');
type Source={account:string;uid:number;uidvalidity:number;body:string;truncated:number};
type Receipt={id:string;feedback_id:number;kind:'archive'|'career_rejection';digest:string;result_ref:string;detail:string;created_at:string};
const terminalMemory=new Set(['no_durable_fact','not_memory_domain','confirmed','already_present']);
const closedRelay=new Set(['closed','rejected','applied']);
function store(){const db=getFolioDb();db.exec(`CREATE TABLE IF NOT EXISTS mail_completion_receipts (
 id TEXT PRIMARY KEY,feedback_id INTEGER NOT NULL,kind TEXT NOT NULL,digest TEXT NOT NULL,result_ref TEXT NOT NULL,detail TEXT NOT NULL,created_at TEXT NOT NULL,
 UNIQUE(feedback_id,kind,digest));`);return db;}
function table(db:Database.Database,name:string){return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);}
function jsonRows<T>(db:Database.Database,name:string):T[]{return table(db,name)?(db.prepare(`SELECT value FROM ${name}`).all() as {value:string}[]).map(r=>JSON.parse(r.value)):[];}
export interface CompletionEvidence {
 sourceComplete:boolean;sourceEligible:boolean;modelComplete:boolean;archiveConsensus:boolean;
 attachmentsComplete:boolean;pendingMemory:boolean;pendingCase:boolean;obligationOpen?:boolean;humanConflict:boolean;
 memoryOutcome:string|null;careerResolved:boolean;careerNeedsDecision:boolean;careerGap:boolean;
}
/** No completed extraction or review mark alone can close a business case. */
export function completionBlock(e:CompletionEvidence):string|null {
 if(!e.sourceComplete)return 'source_incomplete';
 if(!e.sourceEligible)return 'excluded_source';
 if(e.pendingCase)return 'open_case';
 if(e.obligationOpen)return 'unresolved_obligation';
 if(e.pendingMemory)return 'pending_memory';
 if(e.humanConflict)return 'human_instruction';
 if(!e.attachmentsComplete)return 'attachments_incomplete';
 if(e.careerResolved)return null;
 if(e.careerNeedsDecision)return 'career_identity';
 if(e.careerGap)return 'career_evidence_gap';
 if(!e.modelComplete)return 'models_incomplete';
 if(!e.archiveConsensus)return 'no_archive_consensus';
 if(!terminalMemory.has(e.memoryOutcome??''))return 'memory_incomplete';
 return null;
}

/** One read snapshot for the whole list; no model, mailbox or tracker writes. */
export function mailWorkContext(){
 const db=store(),sources=new Map((table(db,'mail_intake_sources')?db.prepare('SELECT feedback_id,account,uid,uidvalidity,body,truncated FROM mail_intake_sources').all():[] as unknown[]) .map(r=>[(r as Source&{feedback_id:number}).feedback_id,r as Source]));
 const sourceEligibleFor=mailSourceEligibilitySnapshot();
 const attachmentChecks=new Map<number,AttachmentCheck>(table(db,'mail_attachment_checks')?(db.prepare('SELECT feedback_id,value FROM mail_attachment_checks').all() as {feedback_id:number;value:string}[]).map(r=>[r.feedback_id,JSON.parse(r.value)]):[]);
 const bindings=new Set<number>(table(db,'mail_attachment_bindings')?(db.prepare('SELECT DISTINCT feedback_id FROM mail_attachment_bindings').all() as {feedback_id:number}[]).map(r=>r.feedback_id):[]);
 const latest=new Map<number,Item>();
 const intake=jsonRows<IntakeRun>(db,'mail_intake_runs').sort((a,b)=>Date.parse(a.ended_at??a.started_at)-Date.parse(b.ended_at??b.started_at));
 for(const run of intake)for(const item of run.items)latest.set(item.id,item);
 const pendingMemory=new Set<string>();
 for(const name of ['memory_proposals','memory_facts','memory_entities','memory_relations','memory_episodes'])if(table(db,name))
  for(const row of db.prepare(`SELECT DISTINCT source_ref FROM ${name} WHERE status='candidate'`).all() as {source_ref:string}[])pendingMemory.add(row.source_ref);
 const pendingCases=new Map<string,{decision:boolean;href:string;reason:string}>();
 if(table(db,'relay_cases'))for(const row of db.prepare('SELECT source_ref,status FROM relay_cases').all() as {source_ref:string;status:string}[])if(!closedRelay.has(row.status))pendingCases.set(row.source_ref,{decision:['detected','staged','needs_context','answered','reviewed'].includes(row.status),href:'/relay',reason:row.status==='expired'?'Übergabe abgelaufen; erneute Vorbereitung nötig':['shared','claimed','approved'].includes(row.status)?'Übergabe wartet auf Bearbeitung':'Übergabe wartet auf deine Antwort oder Freigabe'});
 if(table(db,'calendar_drafts'))for(const row of db.prepare("SELECT value FROM calendar_drafts WHERE status NOT IN ('created','cancelled','rejected','expired')").all() as {value:string}[]){const d=JSON.parse(row.value);if(d.draft?.sourceRef)pendingCases.set(d.draft.sourceRef,{decision:true,href:'/calendar',reason:'Kalendervorschlag wartet auf Freigabe'});}
 // A confirmed obligation is not a fulfilled obligation. Dedicated workflows own it.
 const obligations=new Set<string>();
 if(table(db,'memory_episodes'))for(const row of db.prepare("SELECT source_ref FROM memory_episodes WHERE status='confirmed' AND episode_type IN ('payment_due','deadline')").all() as {source_ref:string}[])obligations.add(row.source_ref);
 if(table(db,'memory_facts'))for(const row of db.prepare("SELECT DISTINCT source_ref FROM memory_facts WHERE status='confirmed' AND predicate IN ('committed_to','scheduled_for','requested_refund_of')").all() as {source_ref:string}[])obligations.add(row.source_ref);
 const report=jsonRows<{report?:RejectionReconciliationReport}>(db,'career_mail_sync')[0]?.report;
 const career=new Map<number,ReconciliationFinding>((report?.findings??[]).filter(f=>f.feedbackId).map(f=>[f.feedbackId!,f]));
 let tracker:ReturnType<typeof readCartaTracker>|null=null;
 try{if(!isDemoVaultActive()&&hasModuleCapability('career','cases.read'))tracker=readCartaTracker();}catch{/* A missing tracker never proves completion. */}
 const receipts=new Map<number,Receipt[]>();
 for(const r of db.prepare('SELECT * FROM mail_completion_receipts ORDER BY created_at DESC').all() as Receipt[])receipts.set(r.feedback_id,[...(receipts.get(r.feedback_id)??[]),r]);
 const models=[...new Set(loadRegelwerk().voice_consensus.voices.filter(v=>v.enabled!==false&&['primary_llm','control_llm'].includes(v.role)).map(v=>v.lm_studio_model).filter((v):v is string=>!!v))];
 const votes=getValidatorOpinionsMap();
 const corrections=table(db,'corrections')?db.prepare('SELECT feedback_id,corrected_actionability,corrected_domain,corrected_at FROM corrections ORDER BY corrected_at DESC,id DESC').all() as {feedback_id:number;corrected_actionability:string|null;corrected_domain:string|null;corrected_at:string}[]:[];
 const overrides=table(db,'mail_actionability_override')?db.prepare('SELECT * FROM mail_actionability_override').all():[];
 const memo=new Map<number,ReturnType<typeof computeEvidence>>();
 function evidence(row:FeedbackRow){let value=memo.get(row.id);if(!value){value=computeEvidence(row);memo.set(row.id,value);}return value;}
 function computeEvidence(row:FeedbackRow){
  const source=sources.get(row.id),ref=`mail:${row.account_id}:${row.imap_uid}`,item=latest.get(row.id);
  const selected=models.map(m=>(votes.get(row.id)??[]).find(v=>v.validator_model===m&&v.account_id===row.account_id&&v.imap_uid===row.imap_uid));
  const modelComplete=models.length>=3&&selected.every(v=>v?.validator_domain&&v.validator_actionability);
  const archiveConsensus=modelComplete&&new Set(selected.map(v=>v!.validator_domain)).size===1&&new Set(selected.map(v=>v!.validator_actionability)).size===1&&['archive','archive-silent'].includes(selected[0]!.validator_actionability!);
  let attachmentsComplete=false,attachmentDigest:unknown=null;
  const check=attachmentChecks.get(row.id);
  if(source&&check&&check.body_sha256===bodyHash(source.body)&&check.header_sha256===hash([row.sender,row.subject])&&check.status==='checked'){
   if(check.parts===0&&!bindings.has(row.id)){attachmentDigest=check;attachmentsComplete=check.deferred===0;}
   else try{const a=attachmentSummary(row.id);attachmentDigest=a;attachmentsComplete=a.check?.status==='checked'&&a.check.deferred===0&&a.items.length===a.check.parts&&a.items.every(i=>i.available&&['confirmed','duplicate_only','no_personal_fact'].includes(i.knowledge));}catch{/* no proof */}
  }

  const sourceComplete=!!source&&!source.truncated&&!!source.body.trim()&&source.account===row.account_id&&source.uid===row.imap_uid;
  const sourceEligible=sourceEligibleFor(row.id,row.account_id);
  const finding=career.get(row.id),sourceDigest=source?bodyHash(source.body):null;
  const inputDigest=source?bodyHash(`${row.mail_date}\n${row.sender}\n${row.subject}\n${source.body}`):null;
  const findingCurrent=finding&&finding.sourceHash===sourceDigest&&finding.modelInputHash===inputDigest;
  const target=findingCurrent?tracker?.positions.find(p=>p.identity===finding.positionIdentity)??tracker?.rejected.find(p=>p.identity===finding.positionIdentity):null;
  const careerResolved=!!(findingCurrent&&finding.status==='NO_CHANGE'&&finding.eventType==='rejection'&&['already_marked_rejected','already_in_rejected_history'].includes(finding.reasonCode)&&target&&target.rawHash===finding.positionHash&&('company' in target?target.action==='rejected':true));
  // Independent career receipts remain valid after the rolling report moves on.
  const oldCareer=(receipts.get(row.id)??[]).find(r=>r.kind==='career_rejection'&&r.digest===hash([row.id,inputDigest]));
  let retainedCareer=false;
  if(oldCareer&&tracker)try{const proof=JSON.parse(oldCareer.detail),p=tracker.positions.find(p=>p.identity===proof.identity)??tracker.rejected.find(p=>p.identity===proof.identity);retainedCareer=!!p&&p.rawHash===proof.positionHash&&('company' in p?p.action==='rejected':true);}catch{/* stale receipt */}
  const correction=corrections.find(c=>c.feedback_id===row.id&&c.corrected_actionability);
  const rowOverrides=overrides.filter(o=>(o as {feedback_id:number}).feedback_id===row.id);
  const humanConflict=!!correction&&!['archive','archive-silent'].includes(correction.corrected_actionability!)||rowOverrides.length>0||!!(row.user_final_action&&['actionable','trigger','reply'].includes(row.user_final_action));
  const e:CompletionEvidence={sourceComplete,sourceEligible,modelComplete,archiveConsensus,attachmentsComplete,pendingMemory:pendingMemory.has(ref),pendingCase:pendingCases.has(ref),obligationOpen:obligations.has(ref),humanConflict,memoryOutcome:item?.stage==='done'?item.outcome??null:null,careerResolved:careerResolved||retainedCareer,careerNeedsDecision:!!findingCurrent&&['UNCLEAR','EVIDENCE_CONFLICT','EXACT_PROPOSAL'].includes(finding.status),careerGap:!!findingCurrent&&finding.status==='SOURCE_GAP'};
  const digest=hash([POLICY,row.id,inputDigest,models,selected.map(v=>v?[v.id,v.validator_domain,v.validator_actionability,v.evaluated_at]:null),item,attachmentDigest,correction,rowOverrides,e]);
  return {e,block:completionBlock(e),digest,careerDigest:hash([row.id,inputDigest]),finding:careerResolved?finding:undefined,oldCareer:retainedCareer?oldCareer:undefined,ref};
 }
 function status(row:FeedbackRow):MailWorkStatus {
  const p=evidence(row),e=p.e;
  if(e.careerNeedsDecision&&!e.careerResolved)return {state:'decision',reason:'Absage einer Bewerbung zuordnen',href:'/career'};
  if(e.pendingCase){const c=pendingCases.get(p.ref)!;return {state:c.decision?'decision':'technical',reason:c.reason,href:c.href};}
  if(e.pendingMemory)return {state:'technical',reason:'Wissensvorschlag wartet auf Beleg- oder Modellprüfung',href:'/memory?view=knowledge'};
  if(!e.sourceComplete||!e.sourceEligible||!e.attachmentsComplete||e.careerGap||(!e.modelComplete&&!e.careerResolved))return {state:'technical',reason:!e.sourceComplete?'Mailtext unvollständig':!e.sourceEligible?'Quelle für Automatik ausgeschlossen':!e.attachmentsComplete?'Anhangserfassung oder -prüfung offen':e.careerGap?'Absagebeleg nachprüfen':'Modellbewertungen unvollständig',...(e.careerResolved?{href:p.oldCareer?.result_ref??`/career?position=${encodeURIComponent(p.finding!.positionIdentity!)}`}:{})};
  const receipt=(receipts.get(row.id)??[]).find(r=>r.kind==='archive'&&r.digest===p.digest&&p.block===null)??p.oldCareer;
  if(receipt&&p.block===null)return {state:'automatic',reason:receipt.kind==='career_rejection'?'Absage im Positions-Tracker erfasst':'Ablage geprüft · Modelle, Memory und Anhänge abgeschlossen',href:receipt.result_ref,receiptId:receipt.id};
  if(e.obligationOpen)return {state:'inbox',reason:'Verpflichtung erfasst; Erledigung noch nicht belegt',href:'/memory?view=knowledge'};
  if(!e.careerResolved&&!terminalMemory.has(e.memoryOutcome??''))return {state:'technical',reason:'Lokale Verarbeitung noch nicht abgeschlossen'};
  return {state:'inbox',reason:e.humanConflict?'Deine Einstufung bleibt erhalten':'Noch kein automatischer Abschluss belegt',...(p.oldCareer?{href:p.oldCareer.result_ref}:{})};
 }
 return {db,evidence,status};
}

/** Caller supplies the approved, bounded IDs. Re-evaluated synchronously within one
 * transaction; receipt insertion is the sole effect. No review/IMAP/Memory edits. */
export function completeLocalMails(ids:number[],actor:string){
 if(isDemoVaultActive())throw Error('private_vault_required');
 if(!actor.trim()||ids.length>5000||ids.some(id=>!Number.isSafeInteger(id)||id<1))throw Error('invalid_completion_scope');
 const db=store();
 return db.transaction(()=>{
  const context=mailWorkContext(),result:{id:number;status:'completed'|'already_completed'|'held';reason:string}[]=[];
  for(const id of new Set(ids)){
   const row=getFeedbackRowById(id);if(!row){result.push({id,status:'held',reason:'missing_mail'});continue;}
   const p=context.evidence(row);
   if(p.block&&!p.e.careerResolved){result.push({id,status:'held',reason:p.block});continue;}
   const kind=p.e.careerResolved?'career_rejection':'archive',digest=kind==='career_rejection'?p.careerDigest:p.digest;
   const identity=p.finding?.positionIdentity;
   const resultRef=kind==='career_rejection'?(p.oldCareer?.result_ref??`/career?position=${encodeURIComponent(identity!)}`):`/mail-queue?work=automatic&q=${encodeURIComponent(row.subject.slice(0,100))}`;
   const detail=kind==='career_rejection'?(p.oldCareer?.detail??JSON.stringify({policy:POLICY,actor,identity,positionHash:p.finding!.positionHash,sourceHash:p.finding!.sourceHash})):JSON.stringify({policy:POLICY,actor,outcome:p.e.memoryOutcome,scope:'local_filing_only'});
   const written=db.prepare('INSERT OR IGNORE INTO mail_completion_receipts VALUES (?,?,?,?,?,?,?)').run(randomUUID(),id,kind,digest,resultRef,detail,new Date().toISOString());
   result.push({id,status:p.block?'held':written.changes?'completed':'already_completed',reason:p.block??kind});
  }
  return result;
 })();
}
