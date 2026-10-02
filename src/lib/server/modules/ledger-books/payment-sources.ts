import {findRelatedPaymentReceipt,appendRelatedReceipt} from './payment-related.js';
import {EXTRACTION_POLICY,validatedCachedClaim,explicitPaymentClaim,paymentSourceRoute} from './payment-extraction.js';
import {clearedInvoiceText} from './payment-document.js';
export {clearedInvoiceText} from './payment-document.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chmodSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { getAionLumenPath,getFolioDbPath,getPythonBinPath } from '../../env.js';
import { getFolioDb } from '../../folio-db/init.js';
import { getFeedbackRowById } from '../../feedback/reader.js';
import type { MemoryFactRow } from '../../memory/types.js';
import { atomicPrivateJson,documentBytes,extractSecuredDocument,isolatedProcess,privateDirectory,secureDocument,securityRoot,sha256,storedSecurityReceipt } from '../../file-intake/document-security.js';
import { canonicalHash } from './reconciliation.js';
import { statementImportConfig } from './manual-import.js';
import {memoryInvoiceBinding,paymentSenderProfile} from './payment-source-policy.js';
import { normalizePaymentClaim,normalizeSource,structuredPaymentClaim,PAYMENT_PROFILE,paymentFundingIssue } from './payment-claim-policy.js';
import { extractPaymentClaim } from './payment-review.js';

const exec=promisify(execFile);
export const paymentCandidatesRoot=()=>join(dirname(getFolioDbPath()),'ledger-candidates');
export const paymentWorkRoot=()=>join(dirname(getFolioDbPath()),'payment-agent');
// Data crossing the existing versioned Ledger JSON contract. It is validated by
// the isolated normalizer/reconciler and the independently bound Memory reader.
export type PaymentCandidate=Record<string,any>;
export interface MailSource {feedback_id:number;account:string;uid:number;uidvalidity:number;body:string;truncated:number;}
export interface PaymentSelection {fact:MemoryFactRow;mail:MailSource;candidate:PaymentCandidate|null;name:string|null;}
export function preparedPayments():{name:string;candidate:PaymentCandidate}[]{
 const root=paymentCandidatesRoot();if(!existsSync(root))return [];
 return readdirSync(root).filter(n=>n.endsWith('.json')).sort().flatMap(name=>{
  try{const candidate=JSON.parse(documentBytes(join(root,name),512*1024).toString());return candidate.schema==='folio/ledger-reconciliation-candidate/v0'?[{name,candidate}]:[];}catch{return [];}
 });
}
export function discoverPaymentSources(coveredMonths:Set<string>,limit=12,exclude:ReadonlySet<string>=new Set(),onlyFactIds?:ReadonlySet<string>){
 const db=getFolioDb(),prepared=preparedPayments();
 const facts=db.prepare("SELECT * FROM memory_facts WHERE domain='finance' AND predicate='paid' AND status='candidate' AND source_kind='mail' AND supersedes_fact_id IS NULL ORDER BY valid_from DESC, fact_id").all() as MemoryFactRow[];
 const selected:PaymentSelection[]=[];const skipped={unsupported:0,missing_coverage:0,source_unavailable:0,budget:0};
 for(const fact of facts){
  if(exclude.has(fact.fact_id))continue;
  if(onlyFactIds&&!onlyFactIds.has(fact.fact_id))continue;
  const matches=prepared.filter(c=>c.candidate.memory_binding?.fact_id===fact.fact_id);
  if(matches.length>1){skipped.source_unavailable++;continue;}
  const prior=matches[0];
  if(!prior && (!fact.valid_from || !coveredMonths.has(fact.valid_from.slice(0,7)))){skipped.missing_coverage++;continue;}
  const sources=db.prepare("SELECT * FROM mail_intake_sources WHERE 'mail:' || account || ':' || uid = ?").all(fact.source_ref) as MailSource[];
  if(sources.length!==1 || sources[0].truncated || !sources[0].body || sources[0].body.length>48000){skipped.source_unavailable++;continue;}
  if(selected.length>=limit){skipped.budget++;continue;}
  selected.push({fact,mail:sources[0],candidate:prior?.candidate??null,name:prior?.name??null});
 }
 return {selected,skipped,total:facts.length};
}
export function paymentSourceText(mail:MailSource,subject:string){return `Subject: ${subject}\n\n${mail.body}`;}
async function generalAttachment(selection:PaymentSelection,signal?:AbortSignal){
 const {fact,mail}=selection;privateDirectory(paymentWorkRoot());
 const work=mkdtempSync(join(paymentWorkRoot(),'attachment-'));chmodSync(work,0o700);
 try{
  const locations=getFolioDb().prepare('SELECT folder,epoch,uid FROM mail_intake_locations WHERE account=? AND feedback_id=?').all(mail.account,mail.feedback_id);
  atomicPrivateJson(join(work,'fetch.json'),{account:mail.account,body_sha256:sha256(mail.body),locations:locations.length?locations:[{folder:'INBOX',epoch:mail.uidvalidity,uid:mail.uid}]});
  await exec(getPythonBinPath(),[join(process.cwd(),'scripts/payment_invoice_fetch.py'),'--request',join(work,'fetch.json'),'--worker-root',getAionLumenPath()],{timeout:90000,maxBuffer:4096,signal});
  const fetched=JSON.parse(documentBytes(join(work,'source.json'),8192).toString());
  if(fetched.body_sha256!==sha256(mail.body)||fetched.mailbox_mutated!==false||fetched.original_sha256!==sha256(documentBytes(join(work,'invoice.pdf'))))throw Error('payment_fetch_binding');
  const secured=await secureDocument(join(work,'invoice.pdf'),fact.source_ref!),extracted=await extractSecuredDocument(secured,'pdf');
  if(!extracted.text_path||extracted.receipt.status!=='extracted')throw Error('payment_attachment_not_cleared');
  const proof={receipt_id:secured.receipt.receipt_id,security_sha256:sha256(documentBytes(secured.receipt_path)),original_sha256:secured.receipt.original_sha256,extraction_id:basename(dirname(extracted.text_path)),extraction_sha256:sha256(documentBytes(extracted.receipt_path)),text_sha256:extracted.receipt.text_sha256};
  return {proof,text:clearedInvoiceText(proof)};
 }finally{rmSync(work,{recursive:true,force:true});}
}
export async function prepareGeneralPaymentSource(selection:PaymentSelection,accounts:{ref:string;currency:string}[],token:string,signal?:AbortSignal){
 const {fact,mail}=selection,metadata=getFeedbackRowById(mail.feedback_id);
 if(!metadata||metadata.account_id!==mail.account||Number(metadata.imap_uid)!==mail.uid)throw Error('payment_mail_identity');
 const mailText=paymentSourceText(mail,metadata.subject);let text=mailText;
 if(!fact.source_excerpt||!normalizeSource(text).includes(normalizeSource(fact.source_excerpt)))throw Error('payment_excerpt_unbound');
 const route=paymentSourceRoute(mailText,fact.source_excerpt);if(route)throw Error(route);
 const proposal=getFolioDb().prepare('SELECT * FROM memory_proposals WHERE proposal_id=?').get(fact.proposal_id);
 if(!proposal)throw Error('payment_proposal_missing');
 const prior=selection.candidate;
 if(prior&&!['source-payment/v1',PAYMENT_PROFILE].includes(prior.normalized_invoice?.profile))throw Error('payment_legacy_source_required');
 const source={ref:fact.source_ref,feedback_id:mail.feedback_id,uidvalidity:mail.uidvalidity,body_sha256:sha256(mail.body),subject_sha256:sha256(metadata.subject)};
 if(prior&&(prior.memory_binding.fact_sha256!==canonicalHash(fact)||prior.memory_binding.proposal_sha256!==canonicalHash(proposal)||canonicalHash(prior.memory_binding.source)!==canonicalHash(source)))throw Error('payment_source_changed');
 const draftPath=join(paymentWorkRoot(),'claim-drafts',canonicalHash([source,canonicalHash(fact)])+'.json');
 let cached:PaymentCandidate|undefined;
 let attachment:PaymentCandidate|undefined=prior?.invoice_document?.attachment;
 if(existsSync(draftPath))try{cached=JSON.parse(documentBytes(draftPath,32768).toString());if(cached?.policy===EXTRACTION_POLICY&&cached.fact_sha256===canonicalHash(fact)&&cached.mail_source_sha256===canonicalHash(source))attachment??=cached.attachment;}catch{}
 if(attachment)text=mailText+'\n\nAttached invoice:\n'+clearedInvoiceText(attachment);
 const direct=explicitPaymentClaim(text,fact.source_excerpt??'');
 const relatedReceipt=direct?.kind==='invoice'?findRelatedPaymentReceipt(text,fact.fact_id):undefined;
 const related=appendRelatedReceipt(text,relatedReceipt,fact.valid_from??'');text=related.text;
 const fundingIssue=paymentFundingIssue(text);if(fundingIssue)throw Error(fundingIssue);
 const usable=(draft:unknown)=>{try{normalizePaymentClaim(draft,text,fact.valid_from??'',accounts.filter(a=>a.currency===(draft as any)?.currency?.value).map(a=>a.ref));return true;}catch{return false;}};
 const cachedDraft=validatedCachedClaim(cached,text,canonicalHash(fact),fact.valid_from??'',accounts);
 let draft=related.draft??direct??(prior?.source_claim&&usable(prior.source_claim)?prior.source_claim:structuredPaymentClaim(text,fact.source_excerpt??'')??cachedDraft??await extractPaymentClaim(text,token,signal));
 if(!prior&&!attachment&&(!(draft as any).amount?.value||!(draft as any).counterparty?.value)&&/anhang|anbei|beigefügt|beiliegend|attached|attachment/iu.test(mail.body)){
  const fetched=await generalAttachment(selection,signal);attachment=fetched.proof;text=mailText+'\n\nAttached invoice:\n'+fetched.text;draft=explicitPaymentClaim(text,fact.source_excerpt??'')??await extractPaymentClaim(text,token,signal);
 }
 // Preserve the last attempt for diagnosis; only validated fields can be reused.
 atomicPrivateJson(draftPath,{policy:EXTRACTION_POLICY,source_sha256:sha256(text),mail_source_sha256:canonicalHash(source),fact_sha256:canonicalHash(fact),draft,attachment});
 const scoped=accounts.filter(a=>a.currency===(draft as any).currency?.value).map(a=>a.ref);
 const invoice=normalizePaymentClaim(draft,text,fact.valid_from??'',scoped);
 const unchanged=prior?.normalized_invoice?.profile===PAYMENT_PROFILE&&canonicalHash(prior.normalized_invoice)===canonicalHash(invoice);
 const identity=canonicalHash([source.ref,invoice.counterparty,invoice.invoice_number,invoice.amount,invoice.currency,invoice.invoice_date]);
 const candidate=(unchanged?prior:null)??{schema:'folio/ledger-reconciliation-candidate/v0',created_at:new Date().toISOString(),display_title:`${invoice.counterparty} · ${invoice.amount} ${invoice.currency}`,case:{subject_ref:'folio-case:'+identity.slice(0,32),subject_ref_version:'folio-case-v1',identity_rule_version:PAYMENT_PROFILE,identity_sha256:identity},match_request:invoice.match_request,normalized_invoice:invoice,source_claim:draft,invoice_document:{kind:attachment?'bound-mail-pdf':'bound-mail',original_sha256:sha256(text),text_sha256:sha256(text),attachment,...(relatedReceipt?{related_receipt:relatedReceipt}:{})},memory_binding:{schema:'folio/payment-memory-binding/v1',fact_id:fact.fact_id,fact_sha256:canonicalHash(fact),proposal_id:fact.proposal_id,proposal_sha256:canonicalHash(proposal),episodes:[],source}};
 return {candidate,previousCandidate:prior??undefined,text,name:selection.name??`invoice-${fact.fact_id}.json`,existing:!!prior};
}
export async function normalizeInvoice(text:string,accountRef:string,work:string):Promise<PaymentCandidate>{
 const cfg=statementImportConfig();if(!cfg)throw new Error('statement_account_setup_required');
 const input=join(work,'normalize.json'),output=join(work,'normalized.json');
 atomicPrivateJson(input,{text,account_ref:accountRef});
 const run=await isolatedProcess(cfg.python_bin,['-I',join(cfg.ledger_root,'scripts/normalize_invoice.py'),'--input',input,'--output',output],work,[cfg.ledger_root,dirname(dirname(cfg.python_bin))],30000,16384);
 if(run.code!==0)throw new Error('unsupported_invoice_layout');
 return JSON.parse(documentBytes(output,65536).toString());
}
/** Selection and account are server-resolved; neither model can supply paths,
 * source IDs, account numbers, SQL, or matching rules. */
export async function preparePaymentSource(selection:PaymentSelection,accountRef:string,signal?:AbortSignal){
 privateDirectory(paymentWorkRoot());const work=mkdtempSync(join(paymentWorkRoot(),'source-'));chmodSync(work,0o700);
 try{
  signal?.throwIfAborted();const {fact,mail}=selection;let proof:PaymentCandidate;let source:PaymentCandidate;
  const metadata=getFeedbackRowById(mail.feedback_id);
  if(!metadata || metadata.account_id!==mail.account || Number(metadata.imap_uid)!==mail.uid || !paymentSenderProfile(metadata.sender))throw new Error('payment_mail_identity');
  const prior=selection.candidate;
  const cachePath=join(paymentWorkRoot(),'sources',canonicalHash([fact.source_ref,mail.feedback_id,mail.uidvalidity,sha256(mail.body)])+'.json');
  let cached:PaymentCandidate|null=null;
  if(!prior && existsSync(cachePath)){
   try{const saved=JSON.parse(documentBytes(cachePath,16384).toString());
    if(saved.source.ref===fact.source_ref && saved.source.feedback_id===mail.feedback_id && saved.source.uidvalidity===mail.uidvalidity && saved.source.body_sha256===sha256(mail.body)){clearedInvoiceText(saved.proof);cached=saved;}
   }catch{/* Invalid cached evidence never authorizes parsing or a confirmation. */}
  }
  if(prior){proof=prior.invoice_document;source=prior.memory_binding.source;
   if(prior.memory_binding.fact_sha256!==canonicalHash(fact) || source.ref!==fact.source_ref || source.body_sha256!==sha256(mail.body) || source.feedback_id!==mail.feedback_id || source.uidvalidity!==mail.uidvalidity)throw new Error('payment_source_changed');
  }else if(cached){proof=cached.proof;source=cached.source;}else{
   const locations=getFolioDb().prepare('SELECT folder,epoch,uid FROM mail_intake_locations WHERE account=? AND feedback_id=?').all(mail.account,mail.feedback_id);
   const request={account:mail.account,body_sha256:sha256(mail.body),locations:locations.length?locations:[{folder:'INBOX',epoch:mail.uidvalidity,uid:mail.uid}]};
   atomicPrivateJson(join(work,'fetch.json'),request);
   try{await exec(getPythonBinPath(),[join(process.cwd(),'scripts/payment_invoice_fetch.py'),'--request',join(work,'fetch.json'),'--worker-root',getAionLumenPath()],{timeout:90000,maxBuffer:4096,signal});}
   catch(error){
    signal?.throwIfAborted();
    const output=String((error as {stdout?:string}).stdout??'').trim();
    const allowed=['bound_mail_unavailable','invoice_attachment_missing','invoice_attachment_ambiguous','invoice_attachment_invalid'];
    throw new Error(allowed.includes(output)?output:'invoice_source_unavailable');
   }
   const fetched=JSON.parse(documentBytes(join(work,'source.json'),8192).toString());
   if(fetched.body_sha256!==sha256(mail.body) || fetched.mailbox_mutated!==false || fetched.original_sha256!==sha256(documentBytes(join(work,'invoice.pdf'))))throw new Error('payment_fetch_binding');
   const secured=await secureDocument(join(work,'invoice.pdf'),fact.source_ref!);signal?.throwIfAborted();
   const extracted=await extractSecuredDocument(secured,'pdf');
   if(secured.receipt.status!=='clean'||extracted.receipt.status!=='extracted'||!extracted.text_path)throw new Error('payment_attachment_not_cleared');
   proof={receipt_id:secured.receipt.receipt_id,security_sha256:sha256(documentBytes(secured.receipt_path)),original_sha256:secured.receipt.original_sha256,extraction_id:basename(dirname(extracted.text_path)),extraction_sha256:sha256(documentBytes(extracted.receipt_path)),text_sha256:extracted.receipt.text_sha256};
   source={ref:fact.source_ref,feedback_id:mail.feedback_id,uidvalidity:mail.uidvalidity,body_sha256:sha256(mail.body),message_id:fetched.message_id,eml_sha256:fetched.raw_sha256};
   atomicPrivateJson(cachePath,{schema:'folio/payment-source-cache/v1',proof,source});
  }
  const text=clearedInvoiceText(proof),invoice=await normalizeInvoice(text,accountRef,work);
  if(prior && canonicalHash(invoice)!==canonicalHash(prior.normalized_invoice))throw new Error('normalized_invoice_changed');
  if(!memoryInvoiceBinding(fact,mail.body,invoice as {amount:string;invoice_date:string},metadata.subject))throw new Error('invoice_memory_mismatch');
  // Header excerpts are evidence too, but their exact current header must be
  // bound and rechecked by the confirmation reader like the mail body.
  if(!prior)source={...source,subject_sha256:sha256(metadata.subject)};
  const proposal=getFolioDb().prepare('SELECT * FROM memory_proposals WHERE proposal_id=?').get(fact.proposal_id);
  if(!proposal)throw new Error('payment_proposal_missing');
  if(prior && prior.memory_binding.proposal_sha256!==canonicalHash(proposal))throw new Error('payment_proposal_changed');
  const identity=canonicalHash([invoice.counterparty,invoice.invoice_number,invoice.match_request.account_refs]);
  // New cases close only the exact paid fact. Other bundle objects retain review.
  const candidate=prior??{schema:'folio/ledger-reconciliation-candidate/v0',created_at:new Date().toISOString(),display_title:`Vodafone · Rechnung ${invoice.invoice_date.slice(0,7)}`,case:{subject_ref:'folio-case:'+identity.slice(0,32),subject_ref_version:'folio-case-v1',identity_rule_version:'invoice-identity/v1',identity_sha256:identity},match_request:invoice.match_request,normalized_invoice:invoice,invoice_document:proof,memory_binding:{schema:'folio/payment-memory-binding/v1',fact_id:fact.fact_id,fact_sha256:canonicalHash(fact),proposal_id:fact.proposal_id,proposal_sha256:canonicalHash(proposal),episodes:[],source}};
  return {candidate,previousCandidate:prior??undefined,text,name:selection.name??`invoice-${fact.fact_id}.json`,existing:!!prior};
 }finally{rmSync(work,{recursive:true,force:true});}
}
