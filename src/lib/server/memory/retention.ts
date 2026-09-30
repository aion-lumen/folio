import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname,join } from 'node:path';
import { getFolioDbPath,isDemoVaultActive } from '../env.js';
import { getFolioDb } from '../folio-db/init.js';
import { getFeedbackRowsByMailRef } from '../feedback/reader.js';
import { getMemoryReviewSnapshot,memorySnapshotDigest } from './store.js';
import { zurichToday } from '../../memory/temporal.js';
import { assessMemoryRetention,type RetentionDecision,type RetentionReview } from './retention-policy.js';
export const RETENTION_POLICY='memory-relevance/v1';
interface Row {proposal_id:string;input_digest:string;evidence_digest:string;decision_json:string;source_date:string|null;reviewed_at:string;actor_id:string;owner_override:number;}
export function retentionAuthorization():string|null{
 if(isDemoVaultActive())return null;
 try{const p=JSON.parse(readFileSync(join(dirname(getFolioDbPath()),'memory-work/config.json'),'utf8'));return p.enabled&&typeof p.retention==='string'&&p.retention.trim()?p.retention:null;}catch{return null;}
}
function input(proposalId:string){
 const snapshot=getMemoryReviewSnapshot(proposalId);
 const row=getFolioDb().prepare("SELECT detail_json FROM memory_ledger WHERE proposal_id=? AND event_type='delegated_reviewed' ORDER BY recorded_at DESC,rowid DESC LIMIT 1").get(proposalId) as {detail_json:string}|undefined;
 const review:RetentionReview|undefined=row?JSON.parse(row.detail_json):undefined;
 let sourceDate:string|null=null,sourceHash:string|null=null;
 try{const sources=getFeedbackRowsByMailRef(snapshot.bundle.proposal.source_ref);if(sources.length===1){sourceDate=sources[0].mail_date&&Number.isFinite(Date.parse(sources[0].mail_date))?sources[0].mail_date:null;sourceHash=sources[0].body_hash;}}catch{/* Source metadata stays explicitly unknown. */}
 const digest=memorySnapshotDigest({snapshot,review,sourceDate,sourceHash});
 return {snapshot,review,sourceDate,digest,evidenceDigest:memorySnapshotDigest({snapshot,sourceDate,sourceHash})};
}
export function retentionPlan(proposalId:string,today=zurichToday()){
 const data=input(proposalId),existing=getFolioDb().prepare('SELECT * FROM memory_retention WHERE proposal_id=?').get(proposalId) as Row|undefined;
 // Restoring a proposal is an owner decision, not a cached model assessment.
 // Refresh its evidence binding without letting later reviews hide it again.
 if(existing?.owner_override){
  if(existing.input_digest===data.digest)return null;
  return {...data,proposalId,decision:{...JSON.parse(existing.decision_json),mode:'review',groupKey:null} as RetentionDecision};
 }
 const decision=assessMemoryRetention(data.snapshot.bundle,data.review,today);
 if(!decision)return null;
 if(existing&&existing.evidence_digest!==data.evidenceDigest)return {...data,proposalId,decision:{mode:'review',reason:'Stimmen die geänderten Angaben mit der Quelle überein?',title:decision.title,groupKey:null} as RetentionDecision};
 // A review of older wording cannot decide the relevance of a changed claim.
 if(data.review?.bundle_digest&&data.review.bundle_digest!==memorySnapshotDigest(data.snapshot))return {...data,proposalId,decision:{mode:'review',reason:'Stimmen die geänderten Angaben mit der Quelle überein?',title:decision.title,groupKey:null} as RetentionDecision};
 return {...data,proposalId,decision};
}
export function applyRetentionPlan(proposalId:string,expectedDigest:string,authorization:string,today=zurichToday()){
 if(!authorization.trim())throw Error('retention_authorization_required');
 return getFolioDb().transaction(()=>{
  const plan=retentionPlan(proposalId,today);if(!plan||plan.digest!==expectedDigest)throw Error('retention_evidence_changed');
  const db=getFolioDb(),old=db.prepare('SELECT * FROM memory_retention WHERE proposal_id=?').get(proposalId) as Row|undefined;
  const decision=JSON.stringify(plan.decision);if(old?.input_digest===plan.digest&&old.decision_json===decision)return false;
  const at=new Date().toISOString();
  db.prepare('INSERT INTO memory_retention(proposal_id,input_digest,evidence_digest,decision_json,source_date,reviewed_at,actor_id,owner_override) VALUES(?,?,?,?,?,?,?,0) ON CONFLICT(proposal_id) DO UPDATE SET input_digest=excluded.input_digest,evidence_digest=excluded.evidence_digest,decision_json=excluded.decision_json,source_date=excluded.source_date,reviewed_at=excluded.reviewed_at,actor_id=excluded.actor_id,owner_override=memory_retention.owner_override').run(proposalId,plan.digest,plan.evidenceDigest,decision,plan.sourceDate,at,RETENTION_POLICY);
  db.prepare("INSERT INTO memory_ledger(event_id,proposal_id,object_kind,object_id,event_type,actor_kind,actor_id,detail_json,recorded_at) VALUES(?,?,'proposal',?,'relevance_routed','system',?,?,?)").run(randomUUID(),proposalId,proposalId,RETENTION_POLICY,JSON.stringify({authorization_ref:authorization,input_digest:plan.digest,decision:plan.decision,previous:old??null,before:plan.snapshot,as_of:today}),at);
  return true;
 })();
}
export function processMemoryRetention(proposalId:string){
 const authorization=retentionAuthorization();if(!authorization)return;
 try{const plan=retentionPlan(proposalId);if(plan)applyRetentionPlan(proposalId,plan.digest,authorization);}catch{console.error('[memory-retention] deferred');}
}
export function reconcileMemoryRetention(authorization:string,limit=300){
 const ids=getFolioDb().prepare(`SELECT DISTINCT p.proposal_id FROM memory_proposals p JOIN memory_ledger l ON l.proposal_id=p.proposal_id WHERE p.status='candidate' AND l.event_type='delegated_reviewed' AND l.rowid=(SELECT rowid FROM memory_ledger WHERE proposal_id=p.proposal_id AND event_type='delegated_reviewed' ORDER BY recorded_at DESC,rowid DESC LIMIT 1) AND l.detail_json LIKE '%transient_or_low_value%'`).all() as {proposal_id:string}[];
 let changed=0;for(const {proposal_id}of ids){if(changed>=limit)break;const plan=retentionPlan(proposal_id);if(plan&&applyRetentionPlan(proposal_id,plan.digest,authorization))changed++;}return changed;
}
export function restoreMemoryRetention(proposalId:string,actorId:string){
 return getFolioDb().transaction(()=>{
  const data=input(proposalId);if(data.snapshot.bundle.proposal.status!=='candidate')throw Error('proposal_not_pending');
  const old=getFolioDb().prepare('SELECT * FROM memory_retention WHERE proposal_id=?').get(proposalId) as Row|undefined;if(!old)throw Error('retention_not_found');
  const decision:RetentionDecision={mode:'review',title:JSON.parse(old.decision_json).title,groupKey:null,reason:'Von dir zur Prüfung zurückgeholt.'};
  getFolioDb().prepare('UPDATE memory_retention SET input_digest=?,evidence_digest=?,decision_json=?,owner_override=1,actor_id=?,reviewed_at=? WHERE proposal_id=?').run(data.digest,data.evidenceDigest,JSON.stringify(decision),actorId,new Date().toISOString(),proposalId);
  getFolioDb().prepare("INSERT INTO memory_ledger(event_id,proposal_id,object_kind,object_id,event_type,actor_kind,actor_id,detail_json,recorded_at) VALUES(?,?,'proposal',?,'relevance_restored','human',?,?,?)").run(randomUUID(),proposalId,proposalId,actorId,JSON.stringify({previous:old}),new Date().toISOString());
 })();
}
export function memoryRetentionState(){
 const rows=getFolioDb().prepare("SELECT r.* FROM memory_retention r JOIN memory_proposals p USING(proposal_id) WHERE p.status='candidate'").all() as Row[];
 const entries=rows.flatMap(row=>{const current=input(row.proposal_id);if(current.digest!==row.input_digest&&!row.owner_override)return [];
  const b=current.snapshot.bundle;if([...b.facts,...b.entities,...b.relations,...b.episodes].some(x=>x.status!=='candidate'))return [];
  return [{...row,review:current.review,decision:JSON.parse(row.decision_json) as RetentionDecision,source_ref:b.proposal.source_ref,domain:b.proposal.domain,facts:b.facts.map(f=>({subject:f.subject,predicate:f.predicate,value:f.value_text,excerpt:f.source_excerpt})),factCount:b.facts.length}];
 });
 const hidden=new Set(entries.filter(x=>['discard','history','profile'].includes(x.decision.mode)).map(x=>x.proposal_id));
 const work=new Map(entries.filter(x=>!hidden.has(x.proposal_id)).map(x=>[x.proposal_id,{lane:'decision' as const,kind:x.review?.reason_codes?.some(r=>r!=='transient_or_low_value'&&r!=='fully_supported')?'evidence':'keep',question:x.decision.reason,reasons:x.review?.reason_codes?.filter(r=>r!=='transient_or_low_value')??[],flagged:x.review?.diagnostic?.unsupported_object_ids??[]} ]));
 const grouped=new Map<string,{key:string;mode:RetentionDecision['mode'];title:string;reason:string;from:string|null;to:string|null;entries:typeof entries}>();
 for(const e of entries.filter(x=>hidden.has(x.proposal_id))){const key=e.decision.groupKey??e.proposal_id;const group=grouped.get(key)??{key,mode:e.decision.mode,title:e.decision.title,reason:e.decision.reason,from:null,to:null,entries:[]};group.entries.push(e);const day=e.source_date?.slice(0,10);if(day){group.from=group.from&&group.from<day?group.from:day;group.to=group.to&&group.to>day?group.to:day;}grouped.set(key,group);}
 const groups=[...grouped.values()].sort((a,b)=>Number(b.mode==='profile')-Number(a.mode==='profile')||(b.to??'').localeCompare(a.to??''));
 return {hidden,work,entries,groups,counts:{discard:entries.filter(x=>x.decision.mode==='discard').length,history:entries.filter(x=>x.decision.mode==='history').length,profileSources:entries.filter(x=>x.decision.mode==='profile').length,profiles:groups.filter(x=>x.mode==='profile').length,review:entries.filter(x=>x.decision.mode==='review').length}};
}
