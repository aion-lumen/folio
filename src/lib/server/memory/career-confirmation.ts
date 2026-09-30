import { reconcileCareerDuplicates } from './career-duplicates.js';
import { createHash } from 'node:crypto';
import { getFolioDb } from '../folio-db/init.js';
import { getFeedbackRowById } from '../feedback/reader.js';
import { readCartaTracker, type CartaTrackerSnapshot } from '../career/carta-tracker.js';
import { applicationDay, careerRoleKey, evidencedEmployerMatch, strictCompany, roleReference } from '../career/rejection-reconcile.js';
import { getMemoryReviewSnapshot, memorySnapshotDigest, confirmMemoryBySystemEvidence } from './store.js';
import { zurichToday } from '../../memory/temporal.js';
import { mailMetadataDate } from './metadata-repair.js';
import type { MemoryProposalBundle } from './types.js';

export const CAREER_MEMORY_POLICY = 'career-tracker-reconciliation/v2';
const normalized = (s: string) => s.replace(/\s+/gu,' ').trim().toLocaleLowerCase('de-CH');
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export type Source = { feedbackId: number; ref: string; subject: string; body: string; mailDate: string; truncated: boolean };
/** Formatting-only role differences; business words remain significant. */
function trackerRole(value:string){
 return careerRoleKey(value.replace(/\((?:m\/f\/d|m\/w\/d|w\/m\/d)\)/gi,'').replace(/\/-in\b/gi,''));
}
function trackerDay(value:string){
 const de=/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(value);
 return mailMetadataDate(de?`${de[3].length===2?'20':''}${de[3]}-${de[2].padStart(2,'0')}-${de[1].padStart(2,'0')}`:value);
}
export function recordedCareerRejection(bundle:MemoryProposalBundle,mailDate:string,tracker:CartaTrackerSnapshot,evidence=''){
 const role=bundle.facts.find(f=>f.predicate==='has_role')?.value_text??'';
 const org=bundle.entities.find(e=>e.entity_type==='organization')?.canonical_label??'';
 const sameEmployer=tracker.rejected.filter(r=>evidencedEmployerMatch(org,r.employer,evidence));
 const exact=sameEmployer.filter(r=>trackerRole(r.title)===trackerRole(role) && !(roleReference(r.title).reference&&roleReference(role).reference&&roleReference(r.title).reference!==roleReference(role).reference));
 const day=mailMetadataDate(mailDate);
 // The tracker uses Swiss calendar dates; imported legacy facts used the UTC date.
 const localDay=/T.*(?:Z|[+-]\d\d:\d\d)$/.test(mailDate)&&Number.isFinite(Date.parse(mailDate))?zurichToday(new Date(mailDate)):day;
 const dated=exact.filter(r=>[day,localDay].includes(trackerDay(r.date)));
 const active=tracker.positions.filter(r=>evidencedEmployerMatch(org,r.company,evidence)&&trackerRole(r.title)===trackerRole(role)&&r.action!=='rejected');
 const conflict=active.some(r=>!applicationDay(r)||applicationDay(r)!<=(localDay??''));
 if(dated.length===1&&!conflict)return {kind:'matched' as const,row:dated[0]};
 if(dated.length>1||conflict)return {kind:'ambiguous' as const,question:'Welche Bewerbung gehört zu dieser Mail? Im Tracker gibt es mehrere oder noch aktive Zuordnungen.'};
 const datedAlternatives=exact.length?exact:sameEmployer.filter(r=>trackerRole(r.title)===trackerRole(role.replace(/\s+\d{5,}$/, '')));
 if(datedAlternatives.length)return {kind:'date' as const,question:`Gehört die Mail vom ${day} zur Absage im Tracker vom ${datedAlternatives.map(r=>r.date).join(' / ')}?`};
 if(!role||/^bewerbung(?:\s|$)/i.test(role))return {kind:'role' as const,question:`Welche Stelle bei ${org} gehört zu dieser Absage?`};
 if(sameEmployer.length)return {kind:'role' as const,question:`Ist „${role}“ dieselbe Stelle wie „${sameEmployer.map(r=>r.title).join(' / ')}“ im Tracker?`};
 return {kind:'missing' as const,question:`Zu welchem Vorgang bei ${org} gehört diese Absage? Im Tracker fehlt die Zuordnung.`};
}

/** This rule handles only the known application template, never arbitrary generated facts. */
export function exactCareerRejection(bundle: MemoryProposalBundle, source: Source, tracker: CartaTrackerSnapshot) {
 const {proposal:p, facts, entities, relations, episodes} = bundle;
 const day = mailMetadataDate(source.mailDate);
 if (p.status !== 'candidate' || p.domain !== 'career' || p.source_kind !== 'mail' || p.source_ref !== source.ref || source.truncated || !day) return null;
 const contacts=facts.filter(f=>f.predicate==='has_contact_address');
 if (contacts.length>1 || facts.length!==3+contacts.length || entities.length!==2+contacts.length || relations.length!==1+contacts.length || episodes.length!==1) return null;
 const all = [...facts,...entities,...relations,...episodes];
 if (all.some(o => o.status !== 'candidate' || o.source_ref !== source.ref || o.source_kind !== 'mail' || o.domain !== 'career' || o.sensitivity !== 'private')) return null;
 const role = facts.find(f=>f.predicate==='has_role'), status=facts.find(f=>f.predicate==='has_application_status'), receipt=facts.find(f=>['received_at','mail_received_at'].includes(f.predicate));
 const app=entities.find(e=>e.entity_type==='application'), org=entities.find(e=>e.entity_type==='organization');
 if (!role || !status || !receipt || !app || !org || status.value_text!=='rejected' || receipt.value_text!==day || facts.some(f=>f.supersedes_fact_id || f.object_entity_id || f.valid_to) || [role,status,receipt].some(f=>f.subject_entity_id!==app.entity_id || f.data_class!=='application')) return null;
 const label=`${role.value_text} · ${org.canonical_label}`;
 if (app.canonical_label!==label || [role,status,receipt].some(f=>f.subject!==label)) return null;
 if (app.canonical_key!==`career:application:${hash(`${normalized(org.canonical_label)}\u0000${normalized(role.value_text)}`).slice(0,20)}` || org.canonical_key!==`organization:${hash(normalized(org.canonical_label)).slice(0,20)}`) return null;
 const relation=relations.find(r=>r.relation_type==='application_at'), episode=episodes[0];
 if(!relation)return null;
 if (relation.relation_type!=='application_at' || relation.subject_entity_id!==app.entity_id || relation.object_entity_id!==org.entity_id || relation.supersedes_relation_id || relation.valid_to) return null;
 if (episode.episode_type!=='application_status' || episode.title!==`rejected: ${label}` || episode.summary!==`Bewerbungsstatus rejected bei ${org.canonical_label}.` || episode.occurred_at!==day) return null;
 // Only dates supplied by the known mail template may be relabelled as observations.
 if ([role,status,app,org,relation].some(o=>o.valid_from!==null && o.valid_from!==day) || entities.some(e=>e.valid_to || e.merged_into_entity_id)) return null;
 const evidence=normalized(`${source.subject}\n${source.body}`), quote=normalized(status.source_excerpt??'');
 const identity=normalized(role.source_excerpt??'');
 if (!identity || !evidence.includes(identity) || !identity.includes(normalized(role.value_text)) || !identity.includes(normalized(org.canonical_label))) return null;
 if ([app,org,relation].some(o=>normalized(o.source_excerpt??'')!==identity) || normalized(episode.source_excerpt??'')!==quote || !quote || !evidence.includes(quote)) return null;
 if (receipt.predicate==='mail_received_at' && (receipt.source_excerpt!==source.mailDate || receipt.valid_from!==null)) return null;
 if (receipt.predicate==='received_at' && (normalized(receipt.source_excerpt??'')!==quote || receipt.valid_from!==day)) return null;
 // Optional contacts are literal, independently bound facts from the same template.
 if(contacts.length){
  const contact=contacts[0],person=entities.find(e=>e.entity_type==='person'),link=relations.find(r=>r.relation_type==='contact_for');
  const excerpt=normalized(contact.source_excerpt??'');
  if(!person||!link||!excerpt||!evidence.includes(excerpt)||!excerpt.includes(normalized(contact.value_text))
   || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.value_text) || contact.subject_entity_id!==person.entity_id
   || contact.subject!==person.canonical_label || contact.data_class!=='contact_fact' || contact.valid_from!==null
   || person.canonical_key!==`contact:${hash(normalized(contact.value_text)).slice(0,20)}` || person.valid_from!==null
   || !(normalized(person.canonical_label)===normalized(contact.value_text)||excerpt.includes(normalized(person.canonical_label)))
   || normalized(person.source_excerpt??'')!==excerpt || normalized(link.source_excerpt??'')!==excerpt
   || link.subject_entity_id!==person.entity_id || link.object_entity_id!==app.entity_id || link.valid_from!==null || link.valid_to || link.supersedes_relation_id) return null;
 }
 const recorded=recordedCareerRejection(bundle,source.mailDate,tracker,`${source.subject}\n${source.body}`);
 if(recorded.kind==='matched')return {policy:CAREER_MEMORY_POLICY,source_ref:source.ref,feedback_id:source.feedbackId,
  source_sha256:hash(JSON.stringify(source)),tracker_sha256:tracker.sourceHash,position_identity:recorded.row.identity,
  position_sha256:recorded.row.rawHash,basis:'tracker_rejected_history',mail_date:source.mailDate,day,tracker_date:recorded.row.date};
 // Known, declarative rejection wording; requests, hypotheticals and forwards stay in review.
 const explicit=/^(?:(?:leider )?müssen wir (?:dir|ihnen) mitteilen,? dass |leider |dass )?wir (?:dich|sie|deine bewerbung|ihre bewerbung) (?:leider )?(?:im weiteren (?:auswahl|bewerbungs)prozess |für (?:diese|die ausgeschriebene) stelle )?nicht (?:weiter )?berücksichtigen können[.!]?$/.test(quote) || /^(?:dass wir ihre bewerbung (?:derzeit )?nicht in betracht ziehen können|leider können wir ihre bewerbung nicht berücksichtigen|wir können ihre bewerbung leider nicht berücksichtigen|wir haben uns für (?:einen anderen kandidaten|eine andere kandidatin) entschieden)[.!]?$/u.test(quote);
 if (!explicit || /(?:weitergeleitete nachricht|forwarded message|ursprüngliche nachricht|^\s*>|\b(?:falls|wenn)\b.{0,100}bewerbung|keine absage|nicht als absage)/imu.test(source.body)) return null;
 const rows=tracker.positions.filter(r=>evidencedEmployerMatch(org.canonical_label,r.company,`${source.subject}\n${source.body}`) && careerRoleKey(r.title)===careerRoleKey(role.value_text));
 if (rows.length!==1) return null;
 const row=rows[0], a=roleReference(row.title).reference,b=roleReference(role.value_text).reference;
 if ((a&&b&&a!==b) || row.status!=='applied' || (row.action && !['wait','rejected'].includes(String(row.action))) || (applicationDay(row)&&applicationDay(row)!>day)) return null;
 const alreadyRecorded=row.action==='rejected' && typeof row.note==='string' && row.note.includes(`in Folio freigegeben (mail:${source.feedbackId})`);
 return { policy:CAREER_MEMORY_POLICY, source_ref:source.ref, feedback_id:source.feedbackId, source_sha256:hash(JSON.stringify(source)), tracker_sha256:tracker.sourceHash, position_identity:row.identity, position_sha256:row.rawHash, basis:alreadyRecorded?'tracker_confirmed_same_mail':'exact_applied_role_and_explicit_rejection', mail_date:source.mailDate, day };
}

export function careerConfirmationPlan(proposalId:string) {
 const db=getFolioDb(),snapshot=getMemoryReviewSnapshot(proposalId);
 const sourceState=db.prepare('SELECT status FROM memory_sources WHERE source_ref=?').get(snapshot.bundle.proposal.source_ref) as {status:string}|undefined;
 if(sourceState && !['candidate','confirmed'].includes(sourceState.status))return null;
 if(db.prepare("SELECT 1 FROM memory_proposals WHERE source_ref=? AND domain<>'career' AND status IN ('candidate','confirmed')").get(snapshot.bundle.proposal.source_ref))return null;
 const captures=db.prepare("SELECT feedback_id,account,uid,body,truncated FROM mail_intake_sources WHERE 'mail:'||account||':'||uid=?").all(snapshot.bundle.proposal.source_ref) as {feedback_id:number;account:string;uid:number;body:string;truncated:number}[];
 if(captures.length!==1)return null;
 const capture=captures[0],mail=getFeedbackRowById(capture.feedback_id);
 if(!mail || mail.account_id!==capture.account || mail.imap_uid!==capture.uid || !mail.mail_date)return null;
 const proof=exactCareerRejection(snapshot.bundle,{feedbackId:mail.id,ref:snapshot.bundle.proposal.source_ref,subject:mail.subject,body:capture.body,mailDate:mail.mail_date,truncated:!!capture.truncated},readCartaTracker());
 if(!proof)return null;
 const app=snapshot.bundle.entities.find(e=>e.entity_type==='application')!,org=snapshot.bundle.entities.find(e=>e.entity_type==='organization')!;
 const links=snapshot.episode_entities;
 const person=snapshot.bundle.entities.find(e=>e.entity_type==='person');
 if(links.length!==2+Number(!!person) || !links.some(l=>l.entity_id===app.entity_id&&l.role==='subject') || !links.some(l=>l.entity_id===org.entity_id&&l.role==='organization') || (person&&!links.some(l=>l.entity_id===person.entity_id&&l.role==='contact')))return null;
 return {proof,snapshot,digest:memorySnapshotDigest(snapshot)};
}
export function confirmCareerMemory(proposalId:string,expectedDigest:string,authorization:string) {
 if(!authorization.trim())throw Error('career_memory_authorization_required');
 return getFolioDb().transaction(()=>{
  const plan=careerConfirmationPlan(proposalId);
  if(!plan || plan.digest!==expectedDigest)throw Error('career_memory_evidence_changed');
  const db=getFolioDb(),b=plan.snapshot.bundle;
  // Preserve the status but distinguish observation time from the employer's decision date.
  db.prepare("UPDATE memory_facts SET valid_from=NULL WHERE proposal_id=?").run(proposalId);
  db.prepare("UPDATE memory_facts SET predicate='mail_received_at',source_excerpt=? WHERE proposal_id=? AND predicate IN ('received_at','mail_received_at')").run(plan.proof.mail_date,proposalId);
  db.prepare('UPDATE memory_entities SET valid_from=NULL WHERE proposal_id=?').run(proposalId);
  db.prepare('UPDATE memory_relations SET valid_from=NULL WHERE proposal_id=?').run(proposalId);
  const history=plan.proof.basis==='tracker_rejected_history';
  db.prepare("UPDATE memory_episodes SET episode_type=?,title=?,summary=? WHERE proposal_id=?").run(history?'application_status_reconciled':'application_status_reported',`${history?'Absage abgeglichen':'Absage mitgeteilt'}: ${b.facts.find(f=>f.predicate==='has_role')!.subject}`,history?`Absage aus der Tracker-Historie der Mail vom ${plan.proof.day} zugeordnet.`:`Die Mail vom ${plan.proof.day} teilt eine Absage mit.`,proposalId);
  return confirmMemoryBySystemEvidence(proposalId,memorySnapshotDigest(getMemoryReviewSnapshot(proposalId)),CAREER_MEMORY_POLICY,{...plan.proof,authorization_ref:authorization,before:plan.snapshot});
 })();
}
export function reconcileCareerMemory(authorization:string,limit=25) {
 reconcileCareerDuplicates(authorization);
 const ids=getFolioDb().prepare("SELECT DISTINCT p.proposal_id FROM memory_proposals p JOIN memory_facts f USING(proposal_id) WHERE p.status='candidate' AND p.domain='career' AND f.predicate='has_application_status' AND f.value_text='rejected' ORDER BY p.created_at").all() as {proposal_id:string}[];
 let confirmed=0;
 for(const {proposal_id} of ids){if(confirmed>=limit)break;try{const plan=careerConfirmationPlan(proposal_id);if(plan){confirmCareerMemory(proposal_id,plan.digest,authorization);confirmed++;}}catch{/* Ambiguous or unavailable evidence remains visible for review. */}}
 return confirmed;
}

export function listCareerMemoryConfirmations() {
 return getFolioDb().prepare(`SELECT p.proposal_id, f.subject AS title, f.source_ref, p.reviewed_at,
 json_extract(l.detail_json,'$.basis') AS basis
 FROM memory_proposals p JOIN memory_facts f USING(proposal_id)
 JOIN memory_ledger l ON l.proposal_id=p.proposal_id AND l.object_kind='proposal' AND l.event_type='confirmed' AND l.actor_kind='system' AND l.actor_id IN (?,?)
 WHERE p.status='confirmed' AND f.status='confirmed' AND f.predicate='has_application_status'
 ORDER BY p.reviewed_at DESC`).all(CAREER_MEMORY_POLICY,'exact-career-rejection/v1') as {proposal_id:string;title:string;source_ref:string;reviewed_at:string;basis:string}[];
}

/** Ask only about the unresolved link, not again about an already recorded status. */
export function careerReviewQuestions(bundles:MemoryProposalBundle[]){
 const result=new Map<string,{lane:'decision'|'processing';kind:string;question:string;reasons:string[];flagged:string[]}>();
 let tracker:CartaTrackerSnapshot;try{tracker=readCartaTracker();}catch{return result;}
 for(const b of bundles){
  if(b.proposal.domain!=='career'||!b.facts.some(f=>f.status==='candidate'&&f.predicate==='has_application_status'&&f.value_text==='rejected'))continue;
  const captures=getFolioDb().prepare("SELECT feedback_id,account,uid,body FROM mail_intake_sources WHERE 'mail:'||account||':'||uid=?").all(b.proposal.source_ref) as {feedback_id:number;account:string;uid:number;body:string}[];
  let mail:ReturnType<typeof getFeedbackRowById>=null;
  try{mail=captures.length===1?getFeedbackRowById(captures[0].feedback_id):null;}catch{/* Missing source remains work to prepare. */}
  if(!mail?.mail_date||mail.account_id!==captures[0]?.account||mail.imap_uid!==captures[0]?.uid){result.set(b.proposal.proposal_id,{lane:'processing',kind:'evidence',question:'Originalmail für die Zuordnung laden.',reasons:[],flagged:[]});continue;}
  if(careerConfirmationPlan(b.proposal.proposal_id)){result.set(b.proposal.proposal_id,{lane:'processing',kind:'status',question:'Absage zugeordnet. Angaben werden automatisch abgeglichen.',reasons:[],flagged:[]});continue;}
  const match=recordedCareerRejection(b,mail.mail_date,tracker,`${mail.subject}\n${captures[0].body}`);
  result.set(b.proposal.proposal_id,match.kind==='matched'
   ?{lane:'decision',kind:'status',question:'Absage ist im Tracker erfasst – Angaben übernehmen?',reasons:[],flagged:[]}
   :{lane:'decision',kind:'identity',question:match.question,reasons:[],flagged:[]});
 }
 return result;
}
