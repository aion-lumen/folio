import { randomUUID } from 'node:crypto';
import { getFolioDb } from '../folio-db/init.js';
import { getFeedbackRowsByMailRef } from '../feedback/reader.js';
import { getMemoryReviewSnapshot, memorySnapshotDigest } from './store.js';
import type { MemoryProposalBundle } from './types.js';
const POLICY='career-duplicate-import/v1';

/** Compare claims and links, not generated IDs or import timestamps. */
export function careerClaimDigest(bundle:MemoryProposalBundle){
 const keys=new Map(bundle.entities.map(e=>[e.entity_id,e.canonical_key]));
 const omit=new Set(['fact_id','entity_id','relation_id','episode_id','proposal_id','source_ref','recorded_at','confirmed_at','confirmed_by']);
 const clean=(item:object)=>Object.fromEntries(Object.entries(item).filter(([key])=>!omit.has(key)).map(([key,value])=>[key,key.endsWith('_entity_id')&&typeof value==='string'?keys.get(value)??value:value]));
 const sorted=(items:object[])=>items.map(clean).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 return memorySnapshotDigest({domain:bundle.proposal.domain,source_kind:bundle.proposal.source_kind,facts:sorted(bundle.facts),entities:sorted(bundle.entities),relations:sorted(bundle.relations),episodes:sorted(bundle.episodes)});
}
function candidateIds(){return getFolioDb().prepare("SELECT DISTINCT p.proposal_id FROM memory_proposals p JOIN memory_facts f USING(proposal_id) WHERE p.status='candidate' AND p.domain='career' AND f.predicate='has_application_status' AND f.value_text='rejected'").all() as {proposal_id:string}[];}
export function careerDuplicatePlans(){
 const db=getFolioDb();
 const groups=new Map<string,{id:string;complete:boolean;snapshot:ReturnType<typeof getMemoryReviewSnapshot>}[]>();
 for(const {proposal_id:id} of candidateIds()){
  const snapshot=getMemoryReviewSnapshot(id),b=snapshot.bundle;
  if(b.episodes.length!==1)continue;
  if([...b.facts,...b.entities,...b.relations,...b.episodes].some(x=>x.status!=='candidate'))continue;
  let rows:ReturnType<typeof getFeedbackRowsByMailRef>;
  try{rows=getFeedbackRowsByMailRef(b.proposal.source_ref);}catch{continue;}
  if(rows.length!==1)continue;
  const row=rows[0];if(!row.body_hash||!row.mail_date)continue;
  const key=memorySnapshotDigest([row.account_id.replace(/-history$/,''),row.sender,row.subject,row.mail_date,row.body_hash,careerClaimDigest(b)]);
  const capture=db.prepare('SELECT account,uid,truncated FROM mail_intake_sources WHERE feedback_id=?').get(row.id) as {account:string;uid:number;truncated:number}|undefined;
  const complete=!!capture&&!capture.truncated&&capture.account===row.account_id&&capture.uid===row.imap_uid;
  // The episode entity links must match the bundle, including every role.
  const linked=snapshot.episode_entities.map(l=>[b.entities.find(e=>e.entity_id===l.entity_id)?.canonical_key,l.role]).sort();
  const fullKey=key+memorySnapshotDigest(linked);
  groups.set(fullKey,[...(groups.get(fullKey)??[]),{id,complete,snapshot}]);
 }
 return [...groups.values()].flatMap(group=>{
  const complete=group.filter(x=>x.complete);if(complete.length!==1)return [];
  const canonical=complete[0];
  return group.filter(x=>!x.complete&&x.id!==canonical.id).map(duplicate=>({duplicate:duplicate.id,canonical:canonical.id,duplicateDigest:memorySnapshotDigest(duplicate.snapshot),canonicalDigest:memorySnapshotDigest(canonical.snapshot)}));
 });
}
/** Retire only the redundant import, preserving every row and a full audit snapshot. */
export function reconcileCareerDuplicates(authorization:string){
 if(!authorization.trim())throw Error('career_memory_authorization_required');
 const db=getFolioDb();let count=0;
 for(const expected of careerDuplicatePlans())db.transaction(()=>{
  const plan=careerDuplicatePlans().find(p=>p.duplicate===expected.duplicate&&p.canonical===expected.canonical);
  if(!plan||memorySnapshotDigest(plan)!==memorySnapshotDigest(expected))return;
  const before=getMemoryReviewSnapshot(plan.duplicate),now=new Date().toISOString();
  for(const table of ['memory_facts','memory_entities','memory_relations','memory_episodes'])db.prepare(`UPDATE ${table} SET status='rejected' WHERE proposal_id=? AND status='candidate'`).run(plan.duplicate);
  db.prepare("UPDATE memory_proposals SET status='rejected',reviewed_by=?,reviewed_at=? WHERE proposal_id=? AND status='candidate'").run(POLICY,now,plan.duplicate);
  db.prepare("INSERT INTO memory_ledger(event_id,proposal_id,object_kind,object_id,event_type,actor_kind,actor_id,detail_json,recorded_at) VALUES(?,?,'proposal',?,'duplicate_import','system',?,?,?)").run(randomUUID(),plan.duplicate,plan.duplicate,POLICY,JSON.stringify({...plan,authorization_ref:authorization,before,reason:'Identische Mail und identische Angaben; vollständiger Import bleibt erhalten.'}),now);
  count++;
 })();
 return count;
}

/** Automatically retired imports remain discoverable with both source references. */
export function listCareerDuplicateImports(){
 return getFolioDb().prepare(`SELECT p.proposal_id, l.recorded_at,
  COALESCE(json_extract(l.detail_json,'$.before.bundle.facts[0].subject'),p.source_ref) AS title,
  p.source_ref, json_extract(l.detail_json,'$.canonical') AS canonical_id,
  canonical.source_ref AS canonical_source, canonical.status AS canonical_status
 FROM memory_ledger l JOIN memory_proposals p ON p.proposal_id=l.proposal_id
 LEFT JOIN memory_proposals canonical ON canonical.proposal_id=json_extract(l.detail_json,'$.canonical')
 WHERE l.event_type='duplicate_import' AND l.actor_kind='system' AND l.actor_id=?
 AND p.status='rejected' AND p.reviewed_by=?
 ORDER BY l.recorded_at DESC`).all(POLICY,POLICY) as {proposal_id:string;recorded_at:string;title:string;source_ref:string;canonical_id:string;canonical_source:string|null;canonical_status:string|null}[];
}
