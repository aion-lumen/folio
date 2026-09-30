import { getMemoryProposalBundle } from './store.js';
import { reconcileApplicationEvidence } from './application-evidence.js';
import { reconcileMemoryRetention } from './retention.js';
import { existsSync } from 'node:fs';
import { dirname,join } from 'node:path';
import { getFolioDbPath,isDemoVaultActive } from '../env.js';
import { atomicPrivateJson,documentBytes } from '../file-intake/document-security.js';
import { config,modelActivities,runs } from '../mail-intake/state.js';
import { withMailModel } from '../mail-intake/model-session.js';
import { manualImportRoot, readManualStatementImport, statementImportConfig, previewManualStatement } from '../modules/ledger-books/manual-import.js';
import { canonicalHash } from '../modules/ledger-books/reconciliation.js';
import { coveredStatementMonths } from '../modules/ledger-books/monthly-policy.js';
import { runPaymentAgent } from '../modules/ledger-books/payment-agent.js';
import { financeWorkerActive } from '../modules/ledger-books/finance-run-state.js';
import { authorizeMailMemoryReview,reviewDelegatedMailMemory } from './delegated-review.js';
import { receiptDateRepair,applyReceiptDateRepair } from './metadata-repair.js';
import { reconcileCareerMemory } from './career-confirmation.js';
export const memoryWorkRoot=()=>join(dirname(getFolioDbPath()),'memory-work');
interface Policy {enabled:boolean;owner:string;authorization:string;career_rejections?:string;application_evidence?:string;retention?:string;repair_proposals:string[];repair_hashes:Record<string,string>;statement_scope:string|null;statement_baseline:string[];monthly_baseline:string|null;}
interface WorkState {last_scan?:number;statements?:Record<string,{status:string;reason?:string}>;repairs:Record<string,{status:string;attempts:number;feedbackId?:number;grantId?:string;error?:string}>;monthly?:{fingerprint:string;attempted:string[];status:string;attempts:number;retry_at?:number;recorded:number;error?:string};}
function read<T>(name:string,fallback:T):T{try{return JSON.parse(documentBytes(join(memoryWorkRoot(),name),256*1024).toString());}catch{return fallback;}}
export const memoryWorkStatus=()=>read<WorkState>('state.json',{repairs:{}});
function batchSnapshot(){
 const path=join(manualImportRoot(),'statement-batch.json');if(!existsSync(path))return null;
 const b=JSON.parse(documentBytes(path,64*1024*1024).toString());
 if(b.schema!=='ledger/manual-statement-batch/v0'||b.bookkeeping?.ledger_db_touched!==false||b.batch_sha256!==canonicalHash({sources:b.sources,entries:b.entries,issues:b.issues}))throw Error('invalid_statement_batch');
 const accounts=[...new Set<string>(b.sources.map((s:{account_ref:string})=>s.account_ref))];
 const coverage=accounts.flatMap(account=>[...coveredStatementMonths(b.sources,account)].map(month=>({account,month})));
 if(!coverage.length)return null;
 const sources=b.sources.filter((s:{control_result?:{complete:boolean};account_ref:string})=>s.control_result?.complete&&coverage.some(c=>c.account===s.account_ref));
 const stableSources=[...new Set(sources.map((s:any)=>canonicalHash({account:s.account_ref,hash:s.source_sha256,period:s.declared_period})))].sort();
 return {fingerprint:canonicalHash({coverage:coverage.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),sources:stableSources}),batch:b};
}
/** Configuration is written only by an explicit owner setup, never from mail data. */
export function configureMemoryWork(owner:string,authorization:string,proposalIds:string[]){
 if(isDemoVaultActive()||!owner||!authorization||proposalIds.length>20||proposalIds.some(id=>!receiptDateRepair(id)))throw Error('invalid_memory_work_authorization');
 const policy:Policy={enabled:true,owner,authorization,repair_proposals:proposalIds,repair_hashes:Object.fromEntries(proposalIds.map(id=>[id,receiptDateRepair(id)!.snapshotHash])),statement_scope:statementImportConfig()?canonicalHash(statementImportConfig()):null,statement_baseline:readManualStatementImport().files.map(f=>f.id),monthly_baseline:batchSnapshot()?.fingerprint??null};
 atomicPrivateJson(join(memoryWorkRoot(),'config.json'),policy);return policy;
}
export function pauseMemoryWork(){const policy=read<Policy|null>('config.json',null);if(policy)atomicPrivateJson(join(memoryWorkRoot(),'config.json'),{...policy,enabled:false});}
export function resumeMemoryWork(){const policy=read<Policy|null>('config.json',null);if(!policy||isDemoVaultActive()||policy.statement_scope!== (statementImportConfig()?canonicalHash(statementImportConfig()):null))throw Error('memory_work_setup_required');atomicPrivateJson(join(memoryWorkRoot(),'config.json'),{...policy,enabled:true});}
export function memoryWorkEnabled(){return read<Policy|null>('config.json',null)?.enabled===true;}
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
  if(Date.now()-(state.last_scan??0)>60*60_000 && policy.statement_scope && canonicalHash(statementImportConfig())===policy.statement_scope){
   const inventory=readManualStatementImport();state.statements??={};
   const file=inventory.files.find(f=>!policy.statement_baseline.includes(f.id)&&!state.statements![f.id]);
   if(file){
    const account=file.accounts.length===1?file.accounts[0]:null;
    if(!account||account.profiles.length!==1){state.statements[file.id]={status:'blocked',reason:'account_or_format_ambiguous'};save();return;}
    try {const result=await previewManualStatement(file.id,file.sha256,account.ref,account.profiles[0],true);
     state.statements[file.id]={status:result.status,reason:result.reason_code};
    }catch(error){if(error instanceof Error&&error.message==='import_busy_or_interrupted_lock')return;state.statements[file.id]={status:'blocked',reason:'statement_import_failed'};}save();
   }else{state.last_scan=Date.now();save();}
  }
  const current=batchSnapshot();if(!current||current.fingerprint===policy.monthly_baseline)return;
  if(state.monthly?.fingerprint!==current.fingerprint)state.monthly={fingerprint:current.fingerprint,attempted:[],status:'pending',attempts:0,recorded:0};
  const job=state.monthly;if(job.status==='completed'||job.attempts>=3||Date.now()<(job.retry_at??0))return;
  job.status='running';save();
  const abort=new AbortController();const pauseCheck=setInterval(()=>{if(!memoryWorkEnabled()||!config()?.enabled)abort.abort();},1000);
  try{
   const report=await runPaymentAgent(abort.signal,undefined,new Set(job.attempted));
   job.attempted=[...new Set([...job.attempted,...report.attempted_fact_ids??[]])];job.recorded+=report.recorded;job.status=report.skipped.budget?'pending':'completed';job.attempts=0;delete job.error;
  }catch{job.attempts++;job.status='retry';job.retry_at=Date.now()+60*60_000;job.error='statement_review_unavailable';}finally{clearInterval(pauseCheck);}save();
 }finally{running=false;}
}
let started=false;
export function startMemoryWorkRuntime(){if(started||process.env.FOLIO_AUTOMAIL_RUNTIME!=='1')return;started=true;setInterval(()=>void tickMemoryWork().catch(()=>console.error('[memory-work] deferred')),60_000).unref();}
