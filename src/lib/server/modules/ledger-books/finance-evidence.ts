import {canonicalHash} from './reconciliation.js';
import {sha256} from '../../file-intake/document-security.js';
import type {BankEvidence,MailEvidence,EvidenceLink} from './finance-discovery.js';

/** Mail UID alone is not an identity: account, feedback ID and original body
 * hash all have to agree with the previously verified attachment source. */
export function invoiceSourceMatches(source:unknown,mail:MailEvidence,originalBodyHash:string):boolean{
 const s=source as Record<string,unknown>|null;
 return !!s&&s.feedback_id===mail.id&&s.ref===mail.ref&&s.body_sha256===originalBodyHash;
}
export function appendInvoiceEvidence(mail:MailEvidence,hash:string,text:string,seen:Set<string>):boolean{
 if(!/^[a-f0-9]{64}$/.test(hash))throw Error('invalid_attachment_hash');
 const key=`${mail.id}:${hash}`;if(seen.has(key))return false;
 seen.add(key);mail.body+='\n[Locally scanned PDF '+hash+']\n'+text;
 mail.sha256=canonicalHash([mail.sha256,hash,sha256(text)]);return true;
}
export function evidenceReviewInput(link:EvidenceLink,banks:BankEvidence[],mails:MailEvidence[]){
 const m=mails.find(m=>m.id===link.mail_id),bank=banks.find(e=>e.observation_id===link.bank_id);
 if(!m||!bank)throw Error('evidence_link_source_missing');
 return {id:link.id,bank,mail:{ref:m.ref,sha256:m.sha256,date:m.date,subject:m.subject,sender:m.sender,body:m.body.slice(0,28000),truncated:m.truncated||m.body.length>28000}};
}
export function reusableAdvisoryReview(review:any,input:ReturnType<typeof evidenceReviewInput>,batchHash:string):boolean{
 return review?.schema==='folio/advisory-finance-link/v1'&&review.automatic_confirmation===false&&review.batch_sha256===batchHash&&canonicalHash(review.input)===canonicalHash(input)&&Array.isArray(review.votes)&&review.votes.length===2&&typeof review.votes[0].model==='string'&&review.votes[0].model!==review.votes[1].model&&review.votes.every((v:any)=>typeof v.model==='string'&&v.model.length>0&&v.input_sha256===canonicalHash(input)&&['supported','uncertain','unrelated'].includes(v.relation));
}
