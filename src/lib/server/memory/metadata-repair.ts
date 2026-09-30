import { randomUUID } from 'node:crypto';
import { getFolioDb } from '../folio-db/init.js';
import { getFeedbackRowById } from '../feedback/reader.js';
import { getMemoryReviewSnapshot, memorySnapshotDigest } from './store.js';
export function mailMetadataDate(value:string|null):string|null {
 const day=value?.trim().match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
 return day&&Number.isFinite(Date.parse(day))&&new Date(day).toISOString().slice(0,10)===day?day:null;
}
/** Narrow repair: only the extractor's receipt-date field, with an exact
 * rejected-review snapshot and independent per-object diagnosis. */
export function receiptDateRepair(proposalId:string){
 const db=getFolioDb(),snapshot=getMemoryReviewSnapshot(proposalId),b=snapshot.bundle;
 const row=db.prepare("SELECT detail_json FROM memory_ledger WHERE proposal_id=? AND event_type='delegated_reviewed' ORDER BY recorded_at DESC,rowid DESC LIMIT 1").get(proposalId) as {detail_json:string}|undefined;
 if(!row||b.proposal.status!=='candidate'||b.proposal.source_kind!=='mail')return null;
 const review=JSON.parse(row.detail_json),unsupported=review.diagnostic?.unsupported_object_ids;
 if(review.verdict!=='reject'||review.bundle_digest!==memorySnapshotDigest(snapshot)||!Array.isArray(unsupported)||unsupported.length!==1)return null;
 const fact=b.facts.find(f=>f.fact_id===unsupported[0]);
 if(!fact||fact.status!=='candidate'||fact.predicate!=='received_at'||fact.supersedes_fact_id)return null;
 if([...b.facts,...b.entities,...b.relations,...b.episodes].some(x=>x.status!=='candidate'))return null;
 const sources=db.prepare("SELECT feedback_id FROM mail_intake_sources WHERE 'mail:'||account||':'||uid=? AND truncated=0").all(b.proposal.source_ref) as {feedback_id:number}[];
 if(sources.length!==1)return null;
 const mail=getFeedbackRowById(sources[0].feedback_id),date=mailMetadataDate(mail?.mail_date??null);
 if(!mail||`mail:${mail.account_id}:${mail.imap_uid}`!==b.proposal.source_ref||!date||fact.value_text!==date)return null;
 return {proposalId,feedbackId:mail.id,fact,snapshotHash:memorySnapshotDigest(snapshot),header:mail.mail_date!,date};
}
export function applyReceiptDateRepair(proposalId:string,expectedHash:string,actor:string){
 if(!actor.trim())throw Error('repair_owner_required');
 return getFolioDb().transaction(()=>{
  const plan=receiptDateRepair(proposalId);if(!plan||plan.snapshotHash!==expectedHash)throw Error('repair_snapshot_changed');
  const db=getFolioDb(),now=new Date().toISOString();
  db.prepare("UPDATE memory_facts SET predicate='mail_received_at',source_excerpt=?,valid_from=NULL WHERE fact_id=? AND status='candidate'").run(plan.header,plan.fact.fact_id);
  const detail=JSON.stringify({policy:'mail-receipt-metadata/v1',authorized_by:actor,before:plan.fact,source_date:plan.header,meaning:'mail_receipt_only',snapshot_sha256:expectedHash});
  db.prepare("INSERT INTO memory_ledger(event_id,proposal_id,object_kind,object_id,event_type,actor_kind,actor_id,detail_json,recorded_at) VALUES (?,?,'fact',?,'metadata_repaired','system',?,?,?)").run(randomUUID(),proposalId,plan.fact.fact_id,'memory-work',detail,now);
  return plan.feedbackId;
 })();
}
