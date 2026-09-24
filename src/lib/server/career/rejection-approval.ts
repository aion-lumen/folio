import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getFolioDbPath, getVaultPath, isDemoVaultActive } from '../env.js';
import { careerTrackerPath, parseCartaTrackerSource, patchCartaRejections } from './carta-tracker.js';
import { localCandidates, strictCompany, careerRoleKey, type LocalCandidate, type RejectionReconciliationReport } from './rejection-reconcile.js';

const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
const ID=/^[a-f0-9-]{36}$/;
interface Item {
 identity:string; rawHash:string; company:string; title:string; date:string;
 feedbackId:number; sourceHash:string; modelInputHash:string; requiresIdentityConfirmation:boolean;
}
export interface RejectionApproval {
 id:string; state:'pending'|'applying'|'applied'; createdAt:string; expiresAt:string;
 trackerHash:string; vaultHash:string; window:RejectionReconciliationReport['window']; items:Item[];
 receipt?:{appliedAt:string;owner:string;beforeHash:string;afterHash:string;count:number};
}

function atomicJson(path:string,value:unknown) {
 const temp=path+'.'+randomUUID()+'.tmp';
 try { writeFileSync(temp,JSON.stringify(value,null,2),{flag:'wx',mode:0o600});renameSync(temp,path); }
 finally { if(existsSync(temp))unlinkSync(temp); }
}

/** The HTTP boundary never accepts paths or patches. Dependency injection is for
 * isolated fixtures; production always binds the existing canonical tracker. */
export class RejectionApprovalStore {
 constructor(private readonly trackerPath:string,private readonly root:string,private readonly vault:string,
  private readonly candidates:(from:string,to:string)=>LocalCandidate[],private readonly clock=()=>new Date()) {}
 private path(id:string){if(!ID.test(id))throw new Error('invalid_approval');return join(this.root,id+'.json');}
 get(id:string):RejectionApproval {
  const plan=JSON.parse(readFileSync(this.path(id),'utf8')) as RejectionApproval;
  if(plan.id!==id||plan.vaultHash!==hash(this.vault))throw new Error('invalid_approval');
  return plan;
 }
 prepare(report:RejectionReconciliationReport,options:{reuseId?:string}={}):RejectionApproval|null {
  const snapshot=parseCartaTrackerSource(readFileSync(this.trackerPath,'utf8'));
  if(snapshot.sourceHash!==report.tracker.sourceHash)throw new Error('tracker_changed');
  const items:Item[]=[];
  for(const finding of report.findings) {
   if(!finding.feedbackId||finding.eventType!=='rejection')continue;
   const exact=finding.status==='EXACT_PROPOSAL'&&finding.proposedEvent==='APPLICATION_REJECTED';
   const possible=!exact&&finding.status==='UNCLEAR'&&finding.reasonCode!=='forwarded_rejection_requires_review'&&finding.eventEmployer?snapshot.positions.filter(p=>{
    if(p.status!=='applied'||p.action==='rejected')return false;
    if(strictCompany(p.company)===strictCompany(finding.eventEmployer!))return true;
    // A brand followed by a comma and its legal name may be shown for review
    // when the role agrees. This is never an automatic identity match.
    const companyBrand=strictCompany(p.company.split(',')[0]),eventBrand=strictCompany(finding.eventEmployer!.split(',')[0]);
    return Boolean(companyBrand&&companyBrand===eventBrand&&finding.eventRole&&careerRoleKey(finding.eventRole)===careerRoleKey(p.title));
   }):[];
   if(!exact&&possible.length!==1)continue;
   const row=exact?snapshot.positions.find(p=>p.identity===finding.positionIdentity&&p.rawHash===finding.positionHash):possible[0];
   if(!row||row.status!=='applied'||row.action==='rejected')throw new Error('position_changed');
   if(items.some(item=>item.identity===row.identity))continue;
   const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(finding.mailTime));
   items.push({identity:row.identity,rawHash:row.rawHash,company:row.company,title:row.title,date,feedbackId:finding.feedbackId,sourceHash:finding.sourceHash,modelInputHash:finding.modelInputHash,requiresIdentityConfirmation:!exact});
  }
  if(!items.length)return null;
  const now=this.clock();
  if(options.reuseId)try{
   const previous=this.get(options.reuseId);
   if(previous.state==='pending'&&previous.trackerHash===snapshot.sourceHash&&Date.parse(previous.expiresAt)>+now+3600_000&&JSON.stringify(previous.items)===JSON.stringify(items))return previous;
  }catch{/* An expired or absent preview is replaced with a fresh evidence-bound plan. */}
  const plan:RejectionApproval={id:randomUUID(),state:'pending',createdAt:now.toISOString(),expiresAt:new Date(+now+24*3600_000).toISOString(),trackerHash:snapshot.sourceHash,vaultHash:hash(this.vault),window:report.window,items};
  mkdirSync(this.root,{recursive:true,mode:0o700});atomicJson(this.path(plan.id),plan);return plan;
 }
 apply(id:string,owner:string,confirmedFeedbackIds:number[]=[]):RejectionApproval {
  // A lock shared across processes plus a fresh full-file hash before atomic
  // replacement prevents applying previews to a revision changed by Carta.
  const lock=this.trackerPath+'.folio-rejection.lock';
  mkdirSync(lock,{mode:0o700});
  let temp:string|undefined;
  try {
   const plan=this.get(id);
   if(plan.state==='applied')return plan;
   if(plan.items.some(i=>i.requiresIdentityConfirmation&&!confirmedFeedbackIds.includes(i.feedbackId)))throw new Error('identity_confirmation_required');
   const source=readFileSync(this.trackerPath,'utf8'),beforeHash=hash(source);
   if(plan.state==='applying'&&plan.receipt?.afterHash===beforeHash){plan.state='applied';atomicJson(this.path(id),plan);return plan;}
   if(this.clock().getTime()>Date.parse(plan.expiresAt))throw new Error('approval_expired');
   if(beforeHash!==plan.trackerHash)throw new Error('tracker_changed');
   const candidates=this.candidates(plan.window.fromInclusive,plan.window.toExclusive);
   for(const item of plan.items) {
    if(!candidates.some(c=>c.feedbackId===item.feedbackId&&c.capturedBodyHash===item.sourceHash&&c.modelInputHash===item.modelInputHash))throw new Error('mail_evidence_changed');
   }
   const result=patchCartaRejections(source,plan.trackerHash,plan.items.map(i=>({identity:i.identity,rawHash:i.rawHash,date:i.date,source:`mail:${i.feedbackId}`})));
   const stat=lstatSync(this.trackerPath);if(!stat.isFile()||stat.isSymbolicLink())throw new Error('invalid_tracker_file');
   const backup=join(this.root,`${id}.before.html`);
   if(!existsSync(backup))writeFileSync(backup,source,{flag:'wx',mode:0o600});
   if(hash(readFileSync(backup,'utf8'))!==beforeHash)throw new Error('backup_mismatch');
   plan.state='applying';plan.receipt={appliedAt:this.clock().toISOString(),owner,beforeHash,afterHash:hash(result),count:plan.items.length};
   atomicJson(this.path(id),plan);
   temp=this.trackerPath+'.'+id+'.tmp';
   const fd=openSync(temp,'wx',stat.mode&0o777);
   try{writeFileSync(fd,result,'utf8');fsyncSync(fd);}finally{closeSync(fd);}
   if(hash(readFileSync(this.trackerPath,'utf8'))!==beforeHash)throw new Error('tracker_changed');
   renameSync(temp,this.trackerPath);temp=undefined;
   plan.state='applied';atomicJson(this.path(id),plan);return plan;
  }finally{if(temp&&existsSync(temp))unlinkSync(temp);rmdirSync(lock);}
 }
}

export function rejectionApprovals():RejectionApprovalStore {
 if(isDemoVaultActive())throw new Error('private_vault_required');
 return new RejectionApprovalStore(careerTrackerPath(),join(dirname(getFolioDbPath()),'career-rejection-approvals'),getVaultPath(),(from,to)=>localCandidates(from,to).candidates);
}

export function approvalView(plan:RejectionApproval) {
 return {id:plan.id,state:plan.state,expiresAt:plan.expiresAt,items:plan.items.map(({company,title,date,feedbackId,requiresIdentityConfirmation})=>({company,title,date,feedbackId,requiresIdentityConfirmation})),receipt:plan.receipt?{appliedAt:plan.receipt.appliedAt,count:plan.receipt.count}:null};
}
