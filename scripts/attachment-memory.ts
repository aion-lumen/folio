import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { acquire,config,db,recordEvent,release,renew } from '../src/lib/server/mail-intake/state.js';
import { atomicPrivateJson } from '../src/lib/server/file-intake/document-security.js';
import { readHermesExecutionProfile } from '../src/lib/server/hermes/execution-profile.js';
import { prepareIntakeModel } from '../src/lib/server/mail-intake/runner.js';
import { loadRegelwerk } from '../src/lib/server/regelwerk/loader.js';
import { authorizeAttachmentMemoryReview,proposeAttachmentMemory,reviewAttachmentMemory,reviewAttachmentAbsence } from '../src/lib/server/memory/attachment-candidates.js';
import { getMemoryProposalBundle } from '../src/lib/server/memory/store.js';

const args=process.argv.slice(2);
if(args.length!==4||args[0]!=='--manifest'||args[2]!=='--report')throw Error('Usage: attachment-memory --manifest PATH --report PATH');
const manifest=JSON.parse(readFileSync(args[1],'utf8')),reportPath=resolve(args[3]);
if(existsSync(reportPath))throw Error('Existing report requires inspection before a separate resumed selection');
if(manifest.schema!=='folio/attachment-memory-batch/v1'||typeof manifest.authorization_ref!=='string'||!manifest.authorization_ref.trim()||!Array.isArray(manifest.items)||!manifest.items.length||manifest.items.length>30||new Set(manifest.items.map((i:any)=>i.sha256)).size!==manifest.items.length||manifest.items.some((i:any)=>!Number.isSafeInteger(i.feedback_id)||i.feedback_id<1||!/^[a-f0-9]{64}$/.test(i.sha256)))throw Error('Invalid explicit document selection');
if(config()?.enabled!==false)throw Error('Pause general intake before a bounded document run');
const voices=loadRegelwerk().voice_consensus.voices;
const extractor=voices.find(v=>v.enabled!==false&&v.role==='primary_llm')?.lm_studio_model,reviewer=voices.find(v=>v.enabled!==false&&v.role==='conditional_reviewer')?.lm_studio_model;
if(!extractor||!reviewer||extractor===reviewer)throw Error('Independent local models required');
const profile=await readHermesExecutionProfile(),token=acquire();if(!token)throw Error('Local model is busy');
let lost=false,stopped=false;
process.on('SIGTERM',()=>{stopped=true;});process.on('SIGINT',()=>{stopped=true;});
const heartbeat=setInterval(()=>{try{renew(token);}catch{lost=true;}},5000);
const assertActive=()=>{if(lost||stopped||existsSync(reportPath+'.stop')||config()?.enabled!==false)throw Error('document_run_stopped');renew(token);};
const report:any={schema:'folio/attachment-memory-run/v1',started_at:new Date().toISOString(),status:'running',pid:process.pid,authorization_ref:manifest.authorization_ref,extractor,reviewer,items:[]};
const save=()=>atomicPrivateJson(reportPath,report);
const errorCode=(e:unknown)=>e instanceof Error&&/^[a-z_]+$/.test(e.message)?e.message:'document_processing_requires_review';
const nextStage=(result:any)=>result.proposal_id?'review':['needs_ocr','duplicate_only'].includes(result.status)?'done':'absence_review';
async function reviewItem(item:any,allowRepair:boolean){
 assertActive();
 try{
  if(item.proposal_id){
   item.domain_reviews??={};
   for(const proposalId of item.proposal_ids??[item.proposal_id]){
    assertActive();
    if(item.domain_reviews[proposalId])continue;
    const bundle=getMemoryProposalBundle(proposalId);
    const prior=db().prepare("SELECT detail_json FROM memory_ledger WHERE proposal_id=? AND event_type='delegated_reviewed' ORDER BY recorded_at DESC,rowid DESC LIMIT 1").get(proposalId) as {detail_json:string}|undefined;
    if(prior){item.domain_reviews[proposalId]=JSON.parse(prior.detail_json);save();continue;}
    if(bundle.proposal.status!=='candidate')throw Error('document_proposal_already_reviewed');
    const grant=authorizeAttachmentMemoryReview(item.sha256,'owner:1',manifest.authorization_ref,proposalId);item.grant_id=grant.grant_id;save();
    item.domain_reviews[proposalId]=await reviewAttachmentMemory(item.sha256,grant.grant_id,assertActive);save();
   }
   item.review={verdict:Object.values(item.domain_reviews).every((r:any)=>r.verdict==='accept')?'accept':'reject'};item.stage='done';
  }else{
   item.absence_review=await reviewAttachmentAbsence(item.sha256,assertActive);
   item.stage=item.absence_review.verdict==='missed_facts'?(allowRepair&&(!item.repair_attempts||item.method!=='line_spans_v1')?'reextract':'held'):'done';
   if(item.stage==='held')item.error='personal_evidence_missed';
  }
 }catch(e){item.stage='held';item.error=errorCode(e);}
 save();console.log(JSON.stringify({sha256:item.sha256,stage:item.stage,verdict:item.review?.verdict??item.absence_review?.verdict,error:item.error}));
}
try{
 recordEvent('owner:1',{action:'bounded_attachment_memory_authorized',authorization_ref:manifest.authorization_ref,items:manifest.items,execution_agent:'Astra'});save();
 await prepareIntakeModel(extractor,16384,token);
 for(const selected of manifest.items){
  assertActive();const item:any={...selected,stage:'extract'};report.items.push(item);save();
  try{const result=await proposeAttachmentMemory(selected.feedback_id,selected.sha256,assertActive);Object.assign(item,result);item.stage=nextStage(result);}
  catch(e){item.stage='held';item.error=errorCode(e);}
  save();console.log(JSON.stringify({sha256:item.sha256,status:item.status??'held',facts:item.facts??0,error:item.error}));
 }
 assertActive();await prepareIntakeModel(reviewer,32768,token);
 for(const item of report.items.filter((i:any)=>['review','absence_review'].includes(i.stage)))await reviewItem(item,true);
 const missed=report.items.filter((i:any)=>i.stage==='reextract');
 if(missed.length){
  assertActive();await prepareIntakeModel(extractor,16384,token);
  for(const item of missed){
   assertActive();
   try{const result=await proposeAttachmentMemory(item.feedback_id,item.sha256,assertActive,true);Object.assign(item,result);delete item.absence_review;item.stage=nextStage(result);}
   catch(e){item.stage='held';item.error=errorCode(e);}
   save();console.log(JSON.stringify({sha256:item.sha256,repair:true,stage:item.stage,facts:item.facts,error:item.error}));
  }
  assertActive();await prepareIntakeModel(reviewer,32768,token);
  for(const item of missed.filter((i:any)=>['review','absence_review'].includes(i.stage)))await reviewItem(item,false);
 }
 report.status=report.items.some((i:any)=>i.stage==='held')?'completed_with_holds':'completed';report.ended_at=new Date().toISOString();save();
}catch(e){report.status='stopped';report.error=errorCode(e);save();throw e;}
finally{
 try{await prepareIntakeModel(profile.modelId,profile.contextLength??65536,token);report.model_restored=true;}
 finally{clearInterval(heartbeat);release(token);report.import_paused=config()?.enabled===false;report.lease_released=true;save();}
}
