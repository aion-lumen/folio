import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { getFolioDb } from '../folio-db/init.js';
import { getVaultPath, isDemoVaultActive } from '../env.js';
import { documentBytes } from '../file-intake/document-security.js';
import { readReorgPilotResult } from './document-origin.js';
import { readCartaTracker, type CartaTrackerSnapshot } from '../career/carta-tracker.js';
import { applicationDay, careerRoleKey } from '../career/rejection-reconcile.js';
import { getFeedbackRowsByMailDate } from '../feedback/reader.js';
import { getMemoryReviewSnapshot, memorySnapshotDigest, confirmMemoryBySystemEvidence } from './store.js';
import type { MemoryProposalBundle } from './types.js';

export const APPLICATION_EVIDENCE_POLICY = 'application-document-mail/v1';
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase('de-CH').replace(/\s+/gu, ' ').trim();
function plain(value: string) {
 return value.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
  .replace(/<[^>]*>/g, '\n').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"')
  .replace(/&#(?:x([a-f\d]+)|(\d+));/gi, (_, hex, dec) => { const n=parseInt(hex??dec,hex?16:10); return n<=0x10ffff?String.fromCodePoint(n):''; });
}
const words = (value: string) => normalize(value).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const contains = (text: string, phrase: string) => !!phrase && (` ${words(text)} `).includes(` ${words(phrase)} `);
const day = (value: string) => {
 const m=value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/);
 const d=m?`${m[3].length===2?'20':''}${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:value.slice(0,10);
 return /^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().startsWith(d)?d:null;
};
const shift = (date: string, days: number) => new Date(Date.parse(date)+days*86400000).toISOString().slice(0,10);

/** This rule handles only the legacy, single application-event document import. */
export function isApplicationDocument(bundle: MemoryProposalBundle) {
 const p=bundle.proposal,e=bundle.episodes[0];
 return p.domain==='career'&&p.status==='candidate'&&p.source_kind==='file'&&bundle.episodes.length===1
  && !bundle.entities.length&&!bundle.facts.length&&!bundle.relations.length&&e.status==='candidate'
  &&e.domain==='career'&&e.sensitivity==='private'&&e.source_kind==='file'&&e.source_ref===p.source_ref
  &&/^(?:applied_for_(?:position_at|role)|bewirbt_sich_mit|created: cover letter)/i.test(e.summary);
}

/** Read the captured document version, or recover a truncated HTML capture by exact hash.
 * Directory traversal is bounded and skips symlinks; no document code is executed. */
function documentEvidence(bundle: MemoryProposalBundle) {
 const db=getFolioDb();
 const source=db.prepare('SELECT * FROM memory_sources WHERE source_ref=?').get(bundle.proposal.source_ref) as {
  source_ref:string;status:string;content_hash:string;relative_path:string;origin_run_id:string;origin_document_id:string
 }|undefined;
 if(!source||!['candidate','confirmed'].includes(source.status)||source.source_ref!==`file:${source.content_hash}`)return null;
 const result=readReorgPilotResult(source.origin_run_id);
 const doc=result?.documents.find(d=>d.document_id===source.origin_document_id&&d.source_ref===source.source_ref&&d.sha256===source.content_hash);
 if(!doc?.review_extract)return null;
 let raw=doc.review_extract.text;
 if(doc.review_extract.truncated){
  if(!['.html','.htm'].includes(extname(source.relative_path).toLowerCase()))return null;
  const target=basename(source.relative_path).normalize('NFC');let remaining=5000;let found:Buffer|null=null;
  const visit=(path:string,depth:number)=>{
   if(depth>8||remaining<=0||found)return;
   let entries;try{entries=readdirSync(path,{withFileTypes:true});}catch{return;}
   for(const entry of entries){
    if(--remaining<0||found)return;
    if(entry.isSymbolicLink()||entry.name.startsWith('.'))continue;
    const next=join(path,entry.name);
    if(entry.isDirectory())visit(next,depth+1);
    else if(entry.isFile()&&entry.name.normalize('NFC')===target){try{const bytes=documentBytes(next,512*1024);if(hash(bytes)===source.content_hash)found=bytes;}catch{/* Unavailable source stays pending. */}}
   }
  };
  visit(getVaultPath(),0);if(!found)return null;raw=(found as Buffer).toString('utf8');
 }
 if(!normalize(raw).includes(normalize(bundle.episodes[0].source_excerpt??''))||!bundle.episodes[0].source_excerpt)return null;
 const text=/\.html?$/i.test(source.relative_path)?plain(raw):raw;
 return {source,text,text_sha256:hash(text)};
}

export interface ApplicationDocument { text:string; }
export interface ApplicationMail {id:number;ref:string;sender:string;to:string;subject:string;body:string;date:string;truncated:boolean;}
/** Employer + exact role + recipient + dated document + employer response. No model vote is proof. */
export function matchApplicationEvidence(document: ApplicationDocument, tracker: CartaTrackerSnapshot, mails: ApplicationMail[]) {
 const lines=document.text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 const header=lines.slice(0,30).join('\n');
 const headings=lines.flatMap((line,index)=>{
  const m=line.match(/^(?:Bewerbung(?: als| um die Stelle als)?|Application(?: for(?: the position of)?)?)\s*[:–—-]?\s*(.*)$/i);
  return m?[m[1]||lines[index+1]||'']:[];
 });
 if(headings.length!==1)return null;
 const roleKey=careerRoleKey(headings[0]);
 const dates=[...header.matchAll(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/g)].map(m=>day(`${m[1]}.${m[2]}.${m[3]}`));
 const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
 for(const m of header.matchAll(/\b(\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})\b/gi))dates.push(day(`${m[1]}.${months.indexOf(m[2].toLowerCase())+1}.${m[3]}`));
 const uniqueDates=[...new Set(dates.filter((d):d is string=>!!d))];if(uniqueDates.length!==1)return null;
 const documentDate=uniqueDates[0];
 const addresses=[...document.text.matchAll(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g)].map(m=>m[0].toLowerCase());
 if(!addresses.length)return null;
 const rows=[...tracker.rejected.map(r=>({...r,company:r.employer,eventDay:day(r.date),basis:'tracker_history_and_mail'})),
  ...tracker.positions.filter(r=>r.status==='applied'&&r.action!=='rejected').map(r=>({...r,eventDay:applicationDay(r),basis:'tracker_application_and_mail'}))]
  .filter(r=>careerRoleKey(r.title)===roleKey&&contains(header,r.company)&&r.eventDay&&r.eventDay>=documentDate&&r.eventDay<=shift(documentDate,120));
 if(rows.length!==1)return null;
 const row=rows[0];
 const evidence=mails.filter(mail=>{
  const recipients: string[]=mail.to.toLowerCase().match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g)??[];
  if(mail.truncated||!day(mail.date)||day(mail.date)!==row.eventDay||!addresses.some(address=>recipients.includes(address)))return false;
  if(/^(?:fw|fwd|wg):/i.test(mail.subject)||/(?:forwarded message|weitergeleitete nachricht|ursprüngliche nachricht|original message)/i.test(mail.body))return false;
  const text=plain(mail.subject+'\n'+mail.body),body=normalize(plain(mail.body));
  const subjectRole=plain(mail.subject).replace(/^(?:(?:deine|ihre|your)\s+)?(?:bewerbung(?: als| für die (?:stelle|position)(?: als)?)|application for)\s*/i,'');
  const responseRoles=[...body.matchAll(/(?:candidates for|position as|stelle als)\s+(.+?)(?:\s+whose\b|[.!?;]|$)/gi)].map(m=>m[1]);
  if(![subjectRole,...responseRoles].some(role=>careerRoleKey(role)===roleKey))return false;
  if(!contains(text,row.company)||!contains(careerRoleKey(text),roleKey))return false;
  // Acknowledgement or explicit selection response; job alerts and conditional examples cannot establish submission.
  if(/\b(?:falls|wenn|if|should you)\b.{0,90}(?:bewerbung|apply|application)/i.test(body))return false;
  return /(?:vielen|besten) dank.{0,110}(?:beworben hast|(?:deine|ihre|die) bewerbung)|thank you for your application|after careful consideration,? we have decided to move forward with candidates/i.test(body);
 });
 if(!evidence.length)return null;
 const sorted=evidence.sort((a,b)=>a.date.localeCompare(b.date)||a.ref.localeCompare(b.ref));
 return {title:`${row.title} · ${row.company}`,role:row.title,company:row.company,document_date:documentDate,
  observed_at:sorted[0].date,basis:row.basis,position_identity:row.identity,position_sha256:row.rawHash,
  mails:sorted.map(m=>({ref:m.ref,feedback_id:m.id,date:m.date,sha256:hash(JSON.stringify(m)),quote:plain(m.body)}))};
}

export function applicationEvidencePlan(id:string) {
 const snapshot=getMemoryReviewSnapshot(id);if(!isApplicationDocument(snapshot.bundle)||snapshot.episode_entities.length)return null;
 const document=documentEvidence(snapshot.bundle);if(!document)return null;
 const tracker=readCartaTracker();
 // Restrict retrieval to relevant tracker days; captures and account identities must agree.
 const relevant=[...tracker.rejected.map(r=>({company:r.employer,title:r.title,date:day(r.date)})),...tracker.positions.filter(r=>r.status==='applied').map(r=>({company:r.company,title:r.title,date:applicationDay(r)}))]
  .filter(r=>r.date&&contains(document.text,r.company)&&contains(careerRoleKey(document.text),careerRoleKey(r.title)));
 const mails:ApplicationMail[]=[];
 for(const date of new Set(relevant.map(r=>r.date!))){
  for(const row of getFeedbackRowsByMailDate(shift(date,-1),shift(date,2))){
   const capture=getFolioDb().prepare('SELECT * FROM mail_intake_sources WHERE feedback_id=?').get(row.id) as {account:string;uid:number;body:string;truncated:number}|undefined;
   if(!capture||capture.account!==row.account_id||capture.uid!==row.imap_uid||!row.mail_date)continue;
   mails.push({id:row.id,ref:`mail:${capture.account}:${capture.uid}`,sender:row.sender,to:row.to_addr??'',subject:row.subject,body:capture.body,date:row.mail_date,truncated:!!capture.truncated});
  }
 }
 const match=matchApplicationEvidence(document,tracker,[...new Map(mails.map(m=>[m.id,m])).values()]);if(!match)return null;
 const proof={policy:APPLICATION_EVIDENCE_POLICY,...match,source_ref:document.source.source_ref,source_sha256:document.source.content_hash,
  text_sha256:document.text_sha256,tracker_sha256:tracker.sourceHash};
 return {snapshot,proof,digest:memorySnapshotDigest({snapshot,proof})};
}

export function confirmApplicationEvidence(id:string,expectedDigest:string,authorization:string){
 if(!authorization.trim()||isDemoVaultActive())throw Error('application_evidence_authorization_required');
 return getFolioDb().transaction(()=>{
  const plan=applicationEvidencePlan(id);if(!plan||plan.digest!==expectedDigest)throw Error('application_evidence_changed');
  // The old import used file mtime as a business date. Preserve it only in the audit snapshot.
  getFolioDb().prepare("UPDATE memory_episodes SET episode_type='application_evidence_received', title=?, summary=?, occurred_at=? WHERE proposal_id=? AND status='candidate'")
   .run(plan.proof.title,'Bewerbung durch die zugehörige Antwort des Unternehmens belegt.',plan.proof.observed_at,id);
  return confirmMemoryBySystemEvidence(id,memorySnapshotDigest(getMemoryReviewSnapshot(id)),APPLICATION_EVIDENCE_POLICY,{...plan.proof,authorization_ref:authorization,before:plan.snapshot});
 })();
}
export function reconcileApplicationEvidence(authorization:string){
 if(!authorization.trim()||isDemoVaultActive())return 0;
 const ids=getFolioDb().prepare("SELECT proposal_id FROM memory_proposals WHERE domain='career' AND source_kind='file' AND status='candidate'").all() as {proposal_id:string}[];
 let count=0;
 for(const {proposal_id} of ids){try{const plan=applicationEvidencePlan(proposal_id);if(plan){confirmApplicationEvidence(proposal_id,plan.digest,authorization);count++;}}catch{/* Missing or changed evidence remains available for review. */}}
 return count;
}
export function listApplicationEvidence(){
 const rows=getFolioDb().prepare(`SELECT p.proposal_id,p.reviewed_at,l.detail_json FROM memory_proposals p JOIN memory_ledger l ON l.proposal_id=p.proposal_id
  WHERE p.status='confirmed' AND l.object_kind='proposal' AND l.event_type='confirmed' AND l.actor_kind='system' AND l.actor_id=? ORDER BY p.reviewed_at DESC`).all(APPLICATION_EVIDENCE_POLICY) as {proposal_id:string;reviewed_at:string;detail_json:string}[];
 return rows.map(r=>{const p=JSON.parse(r.detail_json);return {proposal_id:r.proposal_id,reviewed_at:r.reviewed_at,title:p.title,document_date:p.document_date,observed_at:p.observed_at,source_ref:p.source_ref,mails:p.mails as {ref:string;date:string;quote:string}[]};});
}
