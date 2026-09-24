import { completeLocalMails } from '../mail-intake/work-status.js';
import { getFolioDb } from '../folio-db/init.js';
import { config, save, type Config, type IntakeRun } from '../mail-intake/state.js';
import { isDemoVaultActive } from '../env.js';
import { hasModuleCapability } from '../modules/index.js';
import { reconcileRecentRejections, type RejectionReconciliationReport } from './rejection-reconcile.js';
import { rejectionApprovals, approvalView, type RejectionApprovalStore } from './rejection-approval.js';
import { getFeedbackRowById } from '../feedback/reader.js';
import { automaticMemorySourceEligibility } from '../mail-intake/mailbox-source.js';

export interface CareerMailSync {
 runId:string; state:'checking'|'applying'|'completed'|'failed'; checkedAt:string;
 report?:RejectionReconciliationReport; autoApprovalId?:string; reviewApprovalId?:string;
 applied:number; error?:string;
}
function store(){const db=getFolioDb();db.exec('CREATE TABLE IF NOT EXISTS career_mail_sync (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)');return db;}
export function readCareerMailSync():CareerMailSync|null {
 const row=store().prepare('SELECT value FROM career_mail_sync WHERE id=1').get() as {value:string}|undefined;
 return row?JSON.parse(row.value):null;
}
function persist(value:CareerMailSync){store().prepare('INSERT INTO career_mail_sync VALUES (1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(JSON.stringify(value));}
export function assertCareerMailAuthorization(expected:Config,current=config()) {
 if(isDemoVaultActive()||!current?.enabled||!current.career_rejections||current.authorization_id!==expected.authorization_id)throw Error('career_sync_not_authorized');
 if(!hasModuleCapability('career','cases.read')||!hasModuleCapability('career','events.write'))throw Error('career_module_unavailable');
}
/** Only exact, evidence-backed matches enter the automatic write path. The
 * existing store rechecks tracker and mail hashes, backs up and writes once. */
export function prepareAutomaticRejections(report:RejectionReconciliationReport,approvals:RejectionApprovalStore){
 return approvals.prepare({...report,findings:report.findings.filter(f=>f.status==='EXACT_PROPOSAL'&&f.eventType==='rejection'&&f.proposedEvent==='APPLICATION_REJECTED')});
}
export async function syncIntakeRejections(run:IntakeRun,c:Config,modelId:string) {
 assertCareerMailAuthorization(c);
 const old=readCareerMailSync(),approvals=rejectionApprovals();
 const state:CareerMailSync=old?.runId===run.id?old:{runId:run.id,state:'checking',checkedAt:old?.checkedAt??new Date().toISOString(),applied:0,report:old?.report,reviewApprovalId:old?.reviewApprovalId};
 if(state.state==='completed')return state;
 state.error=undefined;persist(state);
 const end=new Date().toISOString(),start=new Date(Date.parse(end)-14*86400000).toISOString();
 const reconcile=()=>reconcileRecentRejections({fromInclusive:start,toExclusive:end,modelId,signal:AbortSignal.timeout(10*60_000),progress:task=>{assertCareerMailAuthorization(c);run.activity={model:modelId,task};save(run);}});
 try {
  // Recover the same persisted plan after interruption, including a crash after rename.
  if(!state.autoApprovalId){
   state.report=await reconcile();assertCareerMailAuthorization(c);
   const eligible=state.report.findings.filter(f=>{
    const row=f.feedbackId?getFeedbackRowById(f.feedbackId):null;
    return row&&automaticMemorySourceEligibility(row.id,row.account_id).eligible;
   });
   state.autoApprovalId=prepareAutomaticRejections({...state.report,findings:eligible},approvals)?.id;
   state.state='applying';persist(state);
  }
  if(state.autoApprovalId){
   assertCareerMailAuthorization(c);
   const result=approvals.apply(state.autoApprovalId,`${c.owner}/hourly-mail/${c.authorization_id}`);
   state.applied=result.receipt?.count??0;persist(state);
  }
  // Refresh hashes after our exact updates, then prepare ambiguous identities for the owner.
  state.report=await reconcile();assertCareerMailAuthorization(c);
  state.reviewApprovalId=approvals.prepare({...state.report,findings:state.report.findings.filter(f=>f.status==='UNCLEAR')},{reuseId:state.reviewApprovalId})?.id;
  state.state='completed';state.checkedAt=new Date().toISOString();persist(state);
  completeLocalMails(state.report.findings.filter(f=>f.feedbackId&&f.eventType==='rejection'&&f.status==='NO_CHANGE').map(f=>f.feedbackId!),`${c.owner}/career/${run.id}`);
  return state;
 }catch(e){
  state.state='failed';state.error=e instanceof Error&&/^[a-z_]+$/.test(e.message)?e.message:'career_reconciliation_failed';
  // A changed source requires a new evidence pass, never an unbounded replay of a stale plan.
  if(['tracker_changed','position_changed','mail_evidence_changed','approval_expired'].includes(state.error))state.autoApprovalId=undefined;
  persist(state);throw e;
 }
}
export function careerSyncView(){
 const state=readCareerMailSync();
 let review=null;
 if(state?.reviewApprovalId)try{review=rejectionApprovals().get(state.reviewApprovalId);}catch{/* Missing/foreign-vault plans are never writable. */}
 return {state,review:review?approvalView(review):null,pendingIds:review?.state==='pending'?review.items.map(i=>i.identity):[]};
}
