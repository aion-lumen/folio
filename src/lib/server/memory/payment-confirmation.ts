/** Bank evidence is a revocable read model; original facts never become human-confirmed. */
import { areModulesDisabled, getDisabledModuleIds } from '../env.js';
import { join } from 'node:path';
import { getFolioDb } from '../folio-db/init.js';
import { getMemoryFact } from './store.js';
import type { MemoryFactRow } from './types.js';
import { documentBytes, securityRoot, sha256, storedSecurityReceipt } from '../file-intake/document-security.js';
import { canonicalHash, readReconciliationEvidence } from '../modules/ledger-books/reconciliation.js';
import { reviewsAgree } from '../modules/ledger-books/payment-review-policy.js';
import { getFeedbackRowById } from '../feedback/reader.js';

const POLICY = 'ledger-payment-memory/v1';
export interface PaymentConfirmedMemory {
 fact: MemoryFactRow; fact_id: string; proposal_id: string | null; episode_ids: string[];
 title: string; value: string; invoice_number: string; amount: string; currency: string;
 paid_at: string; bank_source_ref: string; bank_sha256: string; bank_locator: string;
 invoice_sha256: string; result_id: string; receipt_id: string; recorded_at: string;
}
function inspect(requireReceipt: boolean): PaymentConfirmedMemory[] {
 if (areModulesDisabled() || getDisabledModuleIds().has('ledger-books')) return [];
 const evidence = readReconciliationEvidence();
 if (!evidence.length) return [];
 const db = getFolioDb();
 return evidence.flatMap(({candidate: c, result: r, batch, stale}) => {
  try {
   if (stale || !r.system_confirmation.confirmed || r.status !== 'matched' || r.rule.version !== 'v2' || r.reconciliation_target !== 'participant_payment_to_provider') return [];
   const m = c.memory_binding, invoice = c.normalized_invoice, proof = c.invoice_document;
   const supportedInvoice=invoice && ((invoice.profile==='vodafone-cable/v1' && invoice.counterparty==='Vodafone West GmbH' && c.match_request.reference_profile==='vodafone-rgn/v1') || (invoice.profile==='vodafone-bw-cable/v1' && invoice.counterparty==='Vodafone BW GmbH' && c.match_request.reference_profile==='vodafone-bw-rgn/v1'));
   if (!m || m.schema !== 'folio/payment-memory-binding/v1' || !supportedInvoice || canonicalHash(invoice.match_request) !== canonicalHash(c.match_request)) return [];
   const original = getMemoryFact(m.fact_id);
   if (!['candidate','confirmed'].includes(original.status) || original.domain !== 'finance' || original.predicate !== 'paid' || original.source_kind !== 'mail' || original.supersedes_fact_id || canonicalHash(original) !== m.fact_sha256 || original.source_ref !== m.source.ref || original.proposal_id !== m.proposal_id) return [];
   const proposal = db.prepare('SELECT * FROM memory_proposals WHERE proposal_id = ?').get(original.proposal_id);
   if (!proposal || canonicalHash(proposal) !== m.proposal_sha256) return [];
   const mail = db.prepare('SELECT account,uid,uidvalidity,body,truncated FROM mail_intake_sources WHERE feedback_id = ?').get(m.source.feedback_id) as {account:string;uid:number;uidvalidity:number;body:string;truncated:number}|undefined;
   if (!mail || mail.truncated || `mail:${mail.account}:${mail.uid}` !== original.source_ref || mail.uidvalidity !== m.source.uidvalidity || sha256(mail.body) !== m.source.body_sha256) return [];
   if(m.source.subject_sha256){const metadata=getFeedbackRowById(m.source.feedback_id);if(!metadata||sha256(metadata.subject)!==m.source.subject_sha256)return [];}
   const source = db.prepare('SELECT status FROM memory_sources WHERE source_ref = ?').get(original.source_ref) as {status:string}|undefined;
   if (source && ['rejected','tombstoned'].includes(source.status)) return [];
   // Fixed vault paths derived from validated IDs, never a candidate-supplied filesystem path.
   const receipt = storedSecurityReceipt(proof.receipt_id);
   if (receipt.status !== 'clean' || receipt.original_sha256 !== proof.original_sha256 || sha256(documentBytes(join(securityRoot(),'receipts',`${receipt.receipt_id}.json`))) !== proof.security_sha256 || sha256(documentBytes(join(securityRoot(),'quarantine',receipt.original_sha256,'original'))) !== receipt.original_sha256) return [];
   if (!/^[a-f0-9-]{36}$/.test(proof.extraction_id)) return [];
   const extractionRoot = join(securityRoot(),'extractions',receipt.receipt_id,'pdf',proof.extraction_id);
   const extractionBytes = documentBytes(join(extractionRoot,'receipt.json'),16384), extraction = JSON.parse(extractionBytes.toString('utf8'));
   if (sha256(extractionBytes) !== proof.extraction_sha256 || extraction.status !== 'extracted' || extraction.original_sha256 !== proof.original_sha256 || extraction.security_receipt_sha256 !== proof.security_sha256 || extraction.text_sha256 !== proof.text_sha256 || sha256(documentBytes(join(extractionRoot,'text.txt'),512*1024)) !== proof.text_sha256) return [];
   if(c.preparation_policy==='payment-agent/v1'){
    const review=c.local_review, {masked_account:_masked,...reviewedInvoice}=invoice;
    if(!review || !reviewsAgree(review.votes,review.input) || !review.votes.every((v:{payment_evidence:string})=>v.payment_evidence==='paid') || review.input.coverage_complete!==true || review.input.id!==m.fact_id || canonicalHash(review.input.invoice)!==canonicalHash(reviewedInvoice) || sha256(review.input.invoice_text)!==proof.text_sha256 || review.input.mail_excerpt!==original.source_excerpt) return [];
   }else if(c.preparation_policy)return [];
   const matched = batch.entries.filter((entry: {observation_id:string}) => entry.observation_id === r.matches[0].observation_id);
   if (matched.length !== 1 || matched[0].currency !== invoice.currency || matched[0].direction !== 'debit' || Math.abs(Number(matched[0].amount)) !== Number(invoice.amount)) return [];
   const entry = matched[0];
   if(c.preparation_policy==='payment-agent/v1'){
    const {booking_date,amount,currency,direction,status,counterparty,purpose}=entry;
    if(canonicalHash(c.local_review.input.bank_entries)!==canonicalHash([{booking_date,amount,currency,direction,status,counterparty,purpose}]))return [];
   }
   if (entry.evidence.length !== r.matches[0].evidence.length || canonicalHash(entry.evidence) !== canonicalHash(r.matches[0].evidence)) return [];
   if (!entry.evidence.every((ev:{ref:string;sha256:string}) => batch.sources.some((s:{source_ref:string;source_sha256:string}) => ev.ref.startsWith(s.source_ref + ':text-line:') && /^\d+$/.test(ev.ref.slice(s.source_ref.length + 11)) && s.source_sha256 === ev.sha256) && sha256(documentBytes(join(securityRoot(),'quarantine',ev.sha256,'original'))) === ev.sha256)) return [];
   const episodes: string[] = [];
   for (const bound of m.episodes ?? []) {
    const episode = db.prepare('SELECT * FROM memory_episodes WHERE episode_id = ? AND proposal_id = ?').get(bound.episode_id,m.proposal_id);
    if (!episode || canonicalHash(episode) !== bound.sha256) return [];
    episodes.push(bound.episode_id);
   }
   const receiptId = `payment:${canonicalHash([POLICY,r.result_id,m.fact_sha256,proof.original_sha256])}`;
   if (requireReceipt && !db.prepare("SELECT 1 FROM memory_ledger WHERE event_id=? AND actor_kind='system' AND event_type='payment_confirmed'").get(receiptId)) return [];
   const title = `${invoice.counterparty} · Rechnung ${invoice.invoice_number}`;
   const value = `${invoice.amount} ${invoice.currency} am ${entry.booking_date} per Lastschrift bezahlt; Rechnung ${invoice.invoice_number} vom ${invoice.invoice_date}. Bankbelegt bis ${c.match_request.window.to}.`;
   return [{ fact:{...original,subject:title,value_text:value,valid_from:entry.booking_date}, fact_id:original.fact_id, proposal_id:original.proposal_id, episode_ids:episodes, title, value, invoice_number:invoice.invoice_number, amount:invoice.amount, currency:invoice.currency, paid_at:entry.booking_date, bank_source_ref:entry.evidence[0].ref, bank_sha256:entry.evidence[0].sha256, bank_locator:entry.evidence[0].ref.split(':').slice(1).join(':'), invoice_sha256:proof.original_sha256, result_id:r.result_id, receipt_id:receiptId, recorded_at:r.generated_at }];
  } catch { return []; }
 });
}
export const listPaymentConfirmedMemory = () => inspect(true);
export function recordPaymentConfirmations(allowedFactIds?:Set<string>): { recorded: number; active: number } {
 const claims = inspect(false).filter(c=>!allowedFactIds || allowedFactIds.has(c.fact_id));
 if (!claims.length) return { recorded:0, active:0 };
 const db = getFolioDb();
 return db.transaction(() => {
  let recorded = 0;
  for (const claim of claims) recorded += db.prepare("INSERT OR IGNORE INTO memory_ledger (event_id,proposal_id,object_kind,object_id,event_type,actor_kind,actor_id,detail_json,recorded_at) VALUES (?,?,'fact',?,'payment_confirmed','system',?,?,?)").run(claim.receipt_id,claim.proposal_id,claim.fact_id,POLICY,JSON.stringify({ result_id:claim.result_id,invoice_sha256:claim.invoice_sha256,bank_sha256:claim.bank_sha256,episode_ids:claim.episode_ids,is_user_confirmation:false }),claim.recorded_at).changes;
  return {recorded,active:claims.length};
 })();
}
