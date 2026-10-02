import { getMemoryProposalBundle } from './store.js';
import { tickStatementJob } from '../modules/ledger-books/statement-jobs.js';
import { maintainDocumentSignatures } from '../file-intake/signature-maintenance.js';
import { reconcileApplicationEvidence } from './application-evidence.js';
import { reconcileMemoryRetention } from './retention.js';
import { join } from 'node:path';
import { isDemoVaultActive } from '../env.js';
import { atomicPrivateJson,documentBytes } from '../file-intake/document-security.js';
import { config,modelActivities,runs } from '../mail-intake/state.js';
import { withMailModel } from '../mail-intake/model-session.js';
import { readManualStatementImport, statementImportConfig, previewManualStatement } from '../modules/ledger-books/manual-import.js';
import { canonicalHash } from '../modules/ledger-books/reconciliation.js';
import { runPaymentAgent } from '../modules/ledger-books/payment-agent.js';
import { financeWorkerActive } from '../modules/ledger-books/finance-run-state.js';
import { authorizeMailMemoryReview,reviewDelegatedMailMemory } from './delegated-review.js';
import { receiptDateRepair,applyReceiptDateRepair } from './metadata-repair.js';
import { reconcileCareerMemory } from './career-confirmation.js';
interface Policy {enabled:boolean;owner:string;authorization:string;career_rejections?:string;application_evidence?:string;retention?:string;monthly_payments?:boolean;repair_proposals:string[];repair_hashes:Record<string,string>;statement_scope:string|null;statement_baseline:string[];monthly_baseline:string|null;}
import {memoryWorkRoot,memoryWorkStatus,batchSnapshot} from './work-state.js';
export {memoryWorkRoot,memoryWorkStatus} from './work-state.js';
function read<T>(name:string,fallback:T):T{try{return JSON.parse(documentBytes(join(memoryWorkRoot(),name),256*1024).toString());}catch{return fallback;}}
/** Configuration is written only by an explicit owner setup, never from mail data. */
export function configureMemoryWork(owner:string,authorization:string,proposalIds:string[]){
 if(isDemoVaultActive()||!owner||!authorization||proposalIds.length>20||proposalIds.some(id=>!receiptDateRepair(id)))throw Error('invalid_memory_work_authorization');
 const policy:Policy={enabled:true,owner,authorization,repair_proposals:proposalIds,repair_hashes:Object.fromEntries(proposalIds.map(id=>[id,receiptDateRepair(id)!.snapshotHash])),statement_scope:statementImportConfig()?canonicalHash(statementImportConfig()):null,statement_baseline:readManualStatementImport().files.map(f=>f.id),monthly_baseline:batchSnapshot()?.fingerprint??null};
 atomicPrivateJson(join(memoryWorkRoot(),'config.json'),policy);return policy;
}
export function pauseMemoryWork(){const policy=read<Policy|null>('config.json',null);if(policy)atomicPrivateJson(join(memoryWorkRoot(),'config.json'),{...policy,enabled:false});}
export function resumeMemoryWork(){const policy=read<Policy|null>('config.json',null);if(!policy||isDemoVaultActive()||policy.statement_scope!== (statementImportConfig()?canonicalHash(statementImportConfig()):null))throw Error('memory_work_setup_required');atomicPrivateJson(join(memoryWorkRoot(),'config.json'),{...policy,enabled:true});}
export function memoryWorkEnabled(){return read<Policy|null>('config.json',null)?.enabled===true;}
export function monthlyPaymentAutomation(){
 const p=read<Policy|null>('config.json',null),cfg=statementImportConfig();
 return {enabled:!!p?.enabled&&p.monthly_payments!==false&&!!cfg&&p.statement_scope===canonicalHash(cfg),paused:p?.enabled===false,deactivated:p?.monthly_payments===false,ready:process.env.FOLIO_AUTOMAIL_RUNTIME==='1'&&config()?.enabled===true};
}
export function setMonthlyPaymentAutomation(owner:string,enabled:boolean){
 if(isDemoVaultActive()||!owner.trim())throw Error('monthly_setup_required');
 const previous=read<Policy|null>('config.json',null);
 if(!enabled){if(previous)atomicPrivateJson(join(memoryWorkRoot(),'config.json'),{...previous,monthly_payments:false});return;}
 const cfg=statementImportConfig();
 if(!cfg?.roots.length||!cfg.roots.every(r=>r.accounts.length>0)||previous?.enabled===false)throw Error('monthly_setup_required');
 const policy:Policy={...previous,enabled:true,owner,authorization:previous?.authorization??'Owner activated monthly statement reconciliation',repair_proposals:previous?.repair_proposals??[],repair_hashes:previous?.repair_hashes??{},statement_scope:canonicalHash(cfg),statement_baseline:[],monthly_baseline:null,monthly_payments:true};
 atomicPrivateJson(join(memoryWorkRoot(),'config.json'),policy);
 const state=memoryWorkStatus();
 if(previous?.statement_scope!==policy.statement_scope){delete state.monthly;state.statements={};}
 else if(state.monthly&&['paused','deactivated'].includes(state.monthly.status))state.monthly.status='pending';
 state.last_scan=0;atomicPrivateJson(join(memoryWorkRoot(),'state.json'),state);
}
export function enableCareerMemoryWork(authorization:string){
 const policy=read<Policy|null>('config.json',null);
 if(!policy || isDemoVaultActive() || !authorization.trim())throw Error('memory_work_setup_required');
 atomicPrivateJson(join(memoryWorkRoot(),'config.json'),{...policy,career_rejections:authorization});
}
export function enableApplicationEvidence(authorization:string){
 const policy=read<Policy|null>('config.json',null);
 if(!policy||isDemoVaultActive()||!authorization.trim())throw Error('memory_work_setup_required');
 atomicPrivateJson(join(memoryWorkRoot(),'config.json'),{...policy,application_evidence:authorization});
}
export function enableMemoryRetention(authorization:string){
 const policy=read<Policy|null>('config.json',null);
 if(!policy||isDemoVaultActive()||!authorization.trim())throw Error('memory_work_setup_required');
 atomicPrivateJson(join(memoryWorkRoot(),'config.json'),{...policy,retention:authorization});
}
let running=false;
const transientStatementReasons=new Set(['scan_incomplete_or_error','scanner_or_signatures_unavailable','stale_security_receipt','worker_timeout','scanner_version_unverified','extraction_worker_unavailable']);
export async function tickMemoryWork(){
 if(running||isDemoVaultActive()||!config()?.enabled)return;
 const policy=read<Policy|null>('config.json',null);if(!policy?.enabled)return;
 running=true;const state=memoryWorkStatus();const save=()=>atomicPrivateJson(join(memoryWorkRoot(),'state.json'),state);
 try {
  if(policy.career_rejections) reconcileCareerMemory(policy.career_rejections);
  if(policy.application_evidence) reconcileApplicationEvidence(policy.application_evidence);
  if(policy.retention) reconcileMemoryRetention(policy.retention);
  if(financeWorkerActive()||modelActivities().length||runs().some(r=>['pending','running'].includes(r.state)))return;
  const id=policy.repair_proposals.find(id=>!state.repairs[id]||['running','retry'].includes(state.repairs[id].status)&&state.repairs[id].attempts<3);
  if(id){
   const previous=state.repairs[id];state.repairs[id]={...previous,status:'running',attempts:(previous?.attempts??0)+1};save();
   try{await withMailModel('conditional_reviewer',async()=>{
    const job=state.repairs[id];
    if(!job.grantId){
     const plan=receiptDateRepair(id);
     if(!plan||plan.snapshotHash!==policy.repair_hashes[id]||!memoryWorkEnabled()||!config()?.enabled){job.status='needs_review';return;}
     job.feedbackId=applyReceiptDateRepair(id,plan.snapshotHash,policy.owner);save();
     const grant=authorizeMailMemoryReview(job.feedbackId,id,policy.owner,policy.authorization);
     job.grantId=grant.grant_id;save();
    }
    await reviewDelegatedMailMemory(job.feedbackId!,job.grantId,()=>memoryWorkEnabled()&&config()?.enabled===true);
    state.repairs[id].status=getMemoryProposalBundle(id).proposal.status==='confirmed'?'completed':'needs_review';
   });}catch{state.repairs[id].status=state.repairs[id].attempts<3?'retry':'needs_review';state.repairs[id].error='local_review_unavailable';}save();return;
  }
  // Only newly arrived files in the owner's existing, fixed account/profile
  // setup. A changed root or ambiguous account needs a new explicit setup.
  if(policy.monthly_payments===false||!policy.statement_scope||canonicalHash(statementImportConfig())!==policy.statement_scope)return;
  for(const item of Object.values(state.statements??{})){
   if(item.status==='blocked'&&(item.attempts??0)<12&&transientStatementReasons.has(item.reason??'')){
    item.status='retry';item.retry_at=0;save();
   }
  }
  if((Date.now()-(state.last_scan??0)>60*60_000 || Object.values(state.statements??{}).some(s=>s.status==='retry'&&Date.now()>=(s.retry_at??0))) && policy.statement_scope && canonicalHash(statementImportConfig())===policy.statement_scope){
   const inventory=readManualStatementImport();state.statements??={};
   // Missing/unsafe roots and truncated scans cannot prove a file disappeared.
   if(inventory.error||inventory.warnings?.length){state.inventory_error=inventory.error??inventory.warnings.join(' · ');save();return;}
   delete state.inventory_error;
   const present=new Set(inventory.files.map(f=>f.id));
   for(const [id,item] of Object.entries(state.statements)){
    if(!present.has(id)&&item.status!=='retired'){item.retired_status=item.status;item.status='retired';}
    else if(present.has(id)&&item.status==='retired'){item.status=item.retired_status??'blocked';delete item.retired_status;}
   }
   const file=inventory.files.find(f=>!policy.statement_baseline.includes(f.id)&&(!state.statements![f.id]||(state.statements![f.id].status==='retry'&&Date.now()>=(state.statements![f.id].retry_at??0))));
   if(file){
    const account=file.accounts.length===1?file.accounts[0]:null;
    if(!account||account.profiles.length!==1){state.statements[file.id]={status:'blocked',reason:'account_or_format_ambiguous'};save();return;}
    const attempts=(state.statements[file.id]?.attempts??0)+1;
    try {await maintainDocumentSignatures();const result=await previewManualStatement(file.id,file.sha256,account.ref,account.profiles[0],true);
     const transient=transientStatementReasons.has(result.reason_code);
     state.statements[file.id]={status:transient?(attempts<12?'retry':'blocked'):result.status,reason:result.reason_code,attempts,retry_at:Date.now()+Math.min(attempts,12)*15*60_000};
    }catch(error){if(error instanceof Error&&error.message==='import_busy_or_interrupted_lock')return;state.statements[file.id]={status:attempts<12?'retry':'blocked',reason:'statement_import_failed',attempts,retry_at:Date.now()+Math.min(attempts,12)*15*60_000};}save();return;
   }else{state.last_scan=Date.now();save();}
  }
  // Missing months remain gated by matcher coverage. A retry for another
  // statement must not starve already complete months indefinitely.
  const current=batchSnapshot();if(!current||current.fingerprint===policy.monthly_baseline)return;
  if(state.monthly?.fingerprint!==current.fingerprint)state.monthly={fingerprint:current.fingerprint,attempted:[],status:'pending',attempts:0,recorded:0};
  const job=state.monthly;if(job.status==='completed'||job.attempts>=3||Date.now()<(job.retry_at??0))return;
  job.status='running';save();
  const abort=new AbortController();const pauseCheck=setInterval(()=>{if(!monthlyPaymentAutomation().enabled||!config()?.enabled)abort.abort();},1000);
  try{
   const report=await runPaymentAgent(abort.signal,message=>{job.message=message;save();},new Set(job.attempted));
   job.attempted=[...new Set([...job.attempted,...report.attempted_fact_ids??[]])];job.recorded+=report.recorded;job.status=report.skipped.budget?'pending':'completed';job.attempts=0;delete job.error;
  }catch(error){
   if(abort.signal.aborted||!monthlyPaymentAutomation().enabled||!config()?.enabled){job.status=monthlyPaymentAutomation().deactivated?'deactivated':'paused';delete job.retry_at;delete job.error;}
   else{job.attempts++;job.status='retry';job.retry_at=Date.now()+60*60_000;job.error=error instanceof Error&&['ledger_companion_update_required','payment_match_failed','payment_match_binding'].includes(error.message)?error.message:'statement_review_unavailable';}
  }finally{clearInterval(pauseCheck);}save();
 }finally{running=false;}
}
let started=false;
export function startMemoryWorkRuntime(){if(started||process.env.FOLIO_AUTOMAIL_RUNTIME!=='1')return;started=true;setInterval(()=>void tickStatementJob().then(()=>tickMemoryWork()).catch(()=>console.error('[memory-work] deferred')),60_000).unref();}

/** Explicit owner retry, without resetting finished imports or audit history. */
export function retryMonthlyWork(){
 const policy=read<Policy|null>('config.json',null);
 if(!policy||isDemoVaultActive()||policy.statement_scope!==canonicalHash(statementImportConfig()))throw Error('monthly_setup_required');
 const state=memoryWorkStatus();
 for(const item of Object.values(state.statements??{}))if(['retry','blocked'].includes(item.status)&&(transientStatementReasons.has(item.reason??'')||item.reason==='statement_import_failed')){item.status='retry';item.attempts=0;item.retry_at=0;}
 if(state.monthly&&state.monthly.status!=='completed'){state.monthly.attempts=0;state.monthly.retry_at=0;state.monthly.status='pending';}
 state.last_scan=0;atomicPrivateJson(join(memoryWorkRoot(),'state.json'),state);
}
