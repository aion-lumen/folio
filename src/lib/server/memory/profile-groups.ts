import { createHash } from 'node:crypto';
import type { MemoryProposalBundle } from './types.js';
import { getFolioDb } from '../folio-db/init.js';
import { getMemoryReviewSnapshot,memorySnapshotDigest,confirmMemoryReviewProposalBundle } from './store.js';
const normalize=(v:string)=>v.normalize('NFKC').replace(/\s+/gu,' ').trim().toLocaleLowerCase('de-CH');
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const labels={qualification:'Zertifikate & Ausbildung',experience:'Berufserfahrung',profile:'Profilangaben'};
type Topic=keyof typeof labels;
function topic(predicate:string,text:string):Topic|null{
 // A document mentioning a certificate request or an application is not a
 // qualification assertion. Keep these workflow states out of the dossier.
 if(/appl|bewirb|bewarb|requires|request|committed|decided|contact|available|scheduled|created|interest|willing|submitted/i.test(predicate))return null;
 if(/certif|zertif|qualification|ausbildung|education|training/i.test(predicate))return 'qualification';
 if(/^(holds|completed)$/.test(predicate)&&/certif|zertif|bootcamp|ausbildung|training/i.test(text))return 'qualification';
 if(/experience|erfahrung|expertise|skill|faehigkeit|specializ|project_role|project_leadership|achievement|employment_history|professional_experience|leitete_migration|projektarbeit|managed|has_project_fact|has_professional_experience/i.test(predicate))return 'experience';
 if(['has_birth_date','has_profile_fact'].includes(predicate))return 'profile';
 return null;
}
function person(value:string){
 const name=value.trim().replace(/\s*\((?:\d{4}|employment history)\)\s*$/iu,'');
 // Only an explicit full name; never infer that a generic CV title or a first
 // name belongs to the owner. Different spellings remain separately reviewable.
 if(!/^[\p{Lu}][\p{L}'’-]+(?:\s+[\p{Lu}][\p{L}'’-]+){1,3}$/u.test(name)||/\b(profile|qualifications|professional|specialization|consultant|engineer|sheet)\b/i.test(name))return null;
 return name;
}
export function careerProfile(bundle:MemoryProposalBundle){
 if(bundle.proposal.domain!=='career'||bundle.proposal.status!=='candidate'||bundle.entities?.length||bundle.relations?.length)return null;
 const claims=[...bundle.facts.filter(f=>f.status==='candidate').map(f=>({person:f.subject,predicate:f.predicate,text:f.value_text,quote:f.source_excerpt??'',id:f.fact_id})),...bundle.episodes.filter(e=>e.status==='candidate').map(e=>({person:e.title,predicate:e.summary.split(':',1)[0],text:e.summary,quote:e.source_excerpt??'',id:e.episode_id}))];
 if(!claims.length)return null;
 const names=claims.map(c=>person(c.person));if(names.some(n=>!n)||new Set(names.map(n=>normalize(n!))).size!==1)return null;
 const topics=claims.map(c=>topic(c.predicate,c.text));if(topics.some(t=>!t))return null;
 const name=names[0]!;
 return {key:`career-profile:${hash(normalize(name))}`,person:name,claims:claims.map((c,i)=>({...c,topic:topics[i]!,source:bundle.proposal.source_ref,proposalId:bundle.proposal.proposal_id}))};
}
export function profileGroupDigest(ids:string[]){
 return memorySnapshotDigest([...ids].sort().map(id=>({snapshot:getMemoryReviewSnapshot(id),review:getFolioDb().prepare("SELECT detail_json FROM memory_ledger WHERE proposal_id=? AND event_type='delegated_reviewed' ORDER BY recorded_at DESC,rowid DESC LIMIT 1").get(id)??null})));
}
export function summarizeProfileGroup(bundles:MemoryProposalBundle[]){
 const profiles=bundles.map(careerProfile);if(profiles.some(p=>!p)||new Set(profiles.map(p=>p!.key)).size!==1)return null;
 const all=profiles.flatMap(p=>p!.claims);
 const groups=new Map<string,{topic:Topic;text:string;variants:Array<{id:string;proposalId:string;source:string;text:string}>}>();
 for(const claim of all){
  // Verbatim repeated evidence may share a row. Each extraction remains
  // visible underneath, including differing interpretations and dates.
  const text=claim.quote.trim()||claim.text,key=hash([claim.topic,normalize(text)]);
  const row=groups.get(key)??{topic:claim.topic,text,variants:[]};
  row.variants.push({id:claim.id,proposalId:claim.proposalId,source:claim.source,text:claim.text});groups.set(key,row);
 }
 return {key:profiles[0]!.key,person:profiles[0]!.person,ids:bundles.map(b=>b.proposal.proposal_id),sourceCount:new Set(bundles.map(b=>b.proposal.source_ref)).size,claimCount:groups.size,repeated:all.length-groups.size,sections:(Object.entries(labels) as [Topic,string][]).map(([key,label])=>({key,label,claims:[...groups.values()].filter(g=>g.topic===key)})).filter(s=>s.claims.length)};
}
/** Confirm exactly the displayed versions together, or nothing if any changed. */
export function confirmProfileGroup(ids:string[],expectedDigest:string,actor:string){
 if(ids.length<2||ids.length>100||new Set(ids).size!==ids.length)throw Error('Ungültige Belegauswahl.');
 return getFolioDb().transaction(()=>{
  const snapshots=ids.map(id=>getMemoryReviewSnapshot(id));
  if(!summarizeProfileGroup(snapshots.map(s=>s.bundle))||profileGroupDigest(ids)!==expectedDigest)throw Error('Die Belege haben sich geändert. Bitte neu laden.');
  for(const id of ids)confirmMemoryReviewProposalBundle(id,actor);
  return ids.length;
 })();
}
