import {getFolioDb} from '../../folio-db/init.js';
import {getFeedbackRowById} from '../../feedback/reader.js';
import {canonicalHash} from './reconciliation.js';
import {sha256} from '../../file-intake/document-security.js';
import {invoiceDocumentKey,normalizeSource,normalizePaymentClaim} from './payment-claim-policy.js';
import {explicitPaymentClaim,paymentSourceRoute} from './payment-extraction.js';

export interface RelatedPaymentReceipt {fact_id:string;fact_sha256:string;source_ref:string;feedback_id:number;uidvalidity:number;body_sha256:string;subject_sha256:string;}
/** A copied invoice may carry its owner's later payment receipt. The whole
 * source and fact remain bound; a vendor/amount similarity cannot create a link. */
export function readRelatedPaymentReceipt(proof:RelatedPaymentReceipt,originalText:string,originalDateHint=''){
 const key=invoiceDocumentKey(originalText);if(!key)throw Error('payment_related_source_invalid');
 const db=getFolioDb();
 const fact=db.prepare('SELECT * FROM memory_facts WHERE fact_id=?').get(proof.fact_id) as any;
 const mail=db.prepare('SELECT * FROM mail_intake_sources WHERE feedback_id=?').get(proof.feedback_id) as any;
 const metadata=getFeedbackRowById(proof.feedback_id);
 if(!fact||!mail||!metadata||!['candidate','confirmed'].includes(fact.status)||fact.domain!=='finance'||fact.predicate!=='paid'||fact.supersedes_fact_id||canonicalHash(fact)!==proof.fact_sha256||fact.source_ref!==proof.source_ref||proof.source_ref!==`mail:${mail.account}:${mail.uid}`||mail.truncated||typeof mail.body!=='string'||mail.body.length>48000||mail.uidvalidity!==proof.uidvalidity||sha256(mail.body)!==proof.body_sha256||metadata.account_id!==mail.account||Number(metadata.imap_uid)!==mail.uid||sha256(metadata.subject)!==proof.subject_sha256)throw Error('payment_related_source_changed');
 const source=db.prepare('SELECT status FROM memory_sources WHERE source_ref=?').get(proof.source_ref) as any;
 const proposal=db.prepare('SELECT status FROM memory_proposals WHERE proposal_id=?').get(fact.proposal_id) as any;
 if(source&&['rejected','tombstoned'].includes(source.status)||!proposal||proposal.status==='rejected')throw Error('payment_related_source_changed');
 const text=`Subject: ${metadata.subject}\n\n${mail.body}`;
 if(!fact.source_excerpt||!normalizeSource(text).includes(normalizeSource(fact.source_excerpt))||invoiceDocumentKey(text)!==key||paymentSourceRoute(text,fact.source_excerpt))throw Error('payment_related_source_invalid');
 const draft=explicitPaymentClaim(text,fact.source_excerpt);
 if(draft?.kind!=='receipt'||!draft.date.value)throw Error('payment_related_source_invalid');
 // The original invoice retains its own role and search interval even when
 // a related receipt supplies the settlement date. Missing original dates
 // use the bound fact's search month, never the receipt's month.
 const original=explicitPaymentClaim(originalText,originalText);
 if(!original||original.kind!=='invoice')throw Error('payment_related_source_invalid');
 const originalInvoice=normalizePaymentClaim(original,originalText,original.date.value||originalDateHint,['related-source-check']);
 if(draft.date.value<originalInvoice.match_request.not_before||draft.date.value>originalInvoice.match_request.not_after)throw Error('payment_related_date_outside_window');
 return {text,draft,originalInvoice};
}
export function findRelatedPaymentReceipt(originalText:string,originalFactId:string):RelatedPaymentReceipt|undefined{
 if(!invoiceDocumentKey(originalText))return;
 const rows=getFolioDb().prepare(`SELECT f.fact_id FROM memory_facts f JOIN mail_intake_sources m ON f.source_ref='mail:'||m.account||':'||m.uid
 WHERE f.domain='finance' AND f.predicate='paid' AND f.status IN ('candidate','confirmed') AND f.supersedes_fact_id IS NULL
 AND (m.body LIKE '%Gemäss unserer Vereinbarung%' OR m.body LIKE '%Gemäß unserer Vereinbarung%') LIMIT 101`).all() as {fact_id:string}[];
 if(rows.length>100)return;
 const originalFact=getFolioDb().prepare('SELECT * FROM memory_facts WHERE fact_id=?').get(originalFactId) as any;
 const matches:RelatedPaymentReceipt[]=[];
 for(const row of rows){
  if(row.fact_id===originalFactId)continue;
  const fact=getFolioDb().prepare('SELECT * FROM memory_facts WHERE fact_id=?').get(row.fact_id) as any;
  const mails=getFolioDb().prepare("SELECT * FROM mail_intake_sources WHERE 'mail:'||account||':'||uid=?").all(fact.source_ref) as any[];
  if(mails.length!==1)continue;const mail=mails[0],metadata=getFeedbackRowById(mail.feedback_id);if(!metadata)continue;
  const proof={fact_id:fact.fact_id,fact_sha256:canonicalHash(fact),source_ref:fact.source_ref,feedback_id:mail.feedback_id,uidvalidity:mail.uidvalidity,body_sha256:sha256(mail.body),subject_sha256:sha256(metadata.subject)};
  try{readRelatedPaymentReceipt(proof,originalText,originalFact?.valid_from??'');matches.push(proof);}catch{}
 }
 // Competing payment receipts require review, never pick the first one.
 return matches.length===1?matches[0]:undefined;
}
export function appendRelatedReceipt(text:string,proof?:RelatedPaymentReceipt,originalDateHint=''){
 if(!proof)return {text,draft:undefined,originalInvoice:undefined};
 const related=readRelatedPaymentReceipt(proof,text,originalDateHint);
 return {text:text+'\n\nRelated receipt for the same quoted invoice:\n'+related.text,draft:related.draft,originalInvoice:related.originalInvoice};
}
