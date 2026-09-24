import {join} from 'node:path';
import {documentBytes,securityRoot,sha256,storedSecurityReceipt} from '../../file-intake/document-security.js';
import {listPaymentConfirmedMemory,type PaymentConfirmedMemory} from '../../memory/payment-confirmation.js';
import {canonicalHash} from './reconciliation.js';
import {displayEntry,readHouseholdContext,contextViewEntries,supplementaryEntries,type BankEntry,type StatementSource} from './household.js';
import type {HouseholdDocument,HouseholdEntryDetail} from '$lib/ledger-household.js';

export function statementPeriodLabel(period:{from:string;to:string}|undefined,bookingDate:string){
 const from=(period?.from??bookingDate).slice(0,7),to=(period?.to??bookingDate).slice(0,7);
 return from===to?from:`${from} – ${to}`;
}

/** No client-supplied path: the entry, source and current proof resolve every file. */
function selection(id:string,batch:string){
 if(!/^txn_[a-f0-9]{16,64}$/.test(id)||!/^[a-f0-9]{64}$/.test(batch))throw Error('invalid_selection');
 const context=readHouseholdContext();if(context.batch.batch_sha256!==batch)throw Error('batch_changed');
 const entry=context.batch.entries.find(e=>e.entry_id===id);if(!entry)throw Error('entry_unavailable');
 return {...context,entry};
}
export function sourceForEntry(entry:BankEntry,sources:StatementSource[],digest:string){
 const source=sources.find(s=>s.source_sha256===digest&&s.account_ref===entry.account_ref);
 if(!source||!entry.evidence.some(e=>e.sha256===digest&&e.ref.startsWith(source.source_ref+':text-line:')&&/^\d+$/.test(e.ref.slice(source.source_ref.length+11))))throw Error('source_not_bound');
 return source;
}
export function paymentForEntry(entry:BankEntry,payment:PaymentConfirmedMemory){return entry.evidence.some(e=>e.ref===payment.bank_source_ref&&e.sha256===payment.bank_sha256)&&entry.booking_date===payment.paid_at&&entry.currency===payment.currency&&Number(entry.amount)<0&&Math.abs(Number(entry.amount))===Number(payment.amount);}
function originalPdf(digest:string){if(!/^[a-f0-9]{64}$/.test(digest))throw Error('invalid_digest');const bytes=documentBytes(join(securityRoot(),'quarantine',digest,'original'));if(sha256(bytes)!==digest||!bytes.subarray(0,1024).includes(Buffer.from('%PDF-')))throw Error('original_changed');return bytes;}
function statementPdf(entry:BankEntry,sources:StatementSource[],digest:string){
 const source=sourceForEntry(entry,sources,digest),receipt=storedSecurityReceipt(source.clearance.receipt_id);
 if(source.format!=='pdf'||receipt.status!=='clean'||receipt.original_sha256!==digest||canonicalHash(receipt)!==canonicalHash(source.clearance)||source.extraction?.status!=='extracted'||source.extraction.original_sha256!==digest||source.extraction.security_receipt_id!==receipt.receipt_id||source.extraction.security_receipt_sha256!==sha256(documentBytes(join(securityRoot(),'receipts',receipt.receipt_id+'.json'))))throw Error('statement_proof_changed');
 return originalPdf(digest);
}
function supplementarySelection(id:string,batch:string){
 if(!/^sum_[a-f0-9]{24}$/.test(id)||!/^[a-f0-9]{64}$/.test(batch))throw Error('invalid_selection');
 const c=readHouseholdContext();if(c.batch.batch_sha256!==batch)throw Error('batch_changed');
 const selected=supplementaryEntries(c.wealth,c.batch,c.settings).find(s=>s.entry.id===id);if(!selected)throw Error('entry_unavailable');return selected;
}
function supplementaryPdf(id:string,batch:string,digest:string){
 const {account}=supplementarySelection(id,batch),proof=account.evidence as typeof account.evidence&{receipt_id?:string};if(proof.sha256!==digest||!proof.receipt_id)throw Error('source_not_bound');
 const receipt=storedSecurityReceipt(proof.receipt_id);if(receipt.status!=='clean'||receipt.original_sha256!==digest)throw Error('statement_proof_changed');return originalPdf(digest);
}
export function householdEntryDetail(id:string,batch:string,feeComponent=false):HouseholdEntryDetail {
 if(feeComponent&&id.startsWith('sum_'))throw Error('fee_unavailable');
 if(id.startsWith('sum_')){const s=supplementarySelection(id,batch),digest=s.account.evidence.sha256;const documents:HouseholdDocument[]=[],warnings:string[]=[];try{supplementaryPdf(id,batch,digest);documents.push({kind:'statement',sha256:digest,label:s.account.evidence.filename,locator:null,url:`/api/ledger/household/entries/${id}/documents/statement/${digest}?batch=${batch}`});}catch{warnings.push('Der Prüfnachweis dieses Auszugs ist nicht mehr gültig.');}return {entry:s.entry,documents,invoice_status:'unlinked',memory_url:null,warnings};}
 const c=selection(id,batch),documents:HouseholdDocument[]=[],warnings:string[]=[];
 const url=(kind:string,sha:string)=>`/api/ledger/household/entries/${encodeURIComponent(id)}/documents/${kind}/${sha}?batch=${batch}`;
 for(const digest of new Set(c.entry.evidence.map(e=>e.sha256))){
  try{const source=sourceForEntry(c.entry,c.batch.sources,digest);statementPdf(c.entry,c.batch.sources,digest);documents.push({kind:'statement',sha256:digest,label:`Kontoauszug · ${c.wealth.accounts.find(a=>a.id===source.account_ref)?.label??'Konto'} · ${statementPeriodLabel(source.declared_period,c.entry.booking_date)}`,locator:c.entry.evidence.find(e=>e.sha256===digest)?.ref.split(':text-line:')[1]??null,url:url('statement',digest)});}catch{warnings.push('Ein Kontoauszug ist vorhanden, sein aktueller Prüfnachweis lässt sich jedoch nicht bestätigen.');}
 }
 const payments=listPaymentConfirmedMemory().filter(p=>paymentForEntry(c.entry,p));
 for(const p of payments){if(documents.some(d=>d.kind==='invoice'&&d.sha256===p.invoice_sha256))continue;documents.push({kind:'invoice',sha256:p.invoice_sha256,label:p.title,locator:null,url:url('invoice',p.invoice_sha256)});}
 const counterparts=(c.transfers.get(id)?.counterpart_ids??[]).flatMap(other=>{const e=c.batch.entries.find(x=>x.entry_id===other);return e?[displayEntry(e,c.wealth,c.settings,c.transfers)]:[];});
 const original=displayEntry(c.entry,c.wealth,c.settings,c.transfers),entry=feeComponent?contextViewEntries(c,'household').find(e=>e.id===id&&e.fee_component):original;if(!entry)throw Error('fee_unavailable');
 const fee=original.transfer?.record?c.fees.get(original.transfer.record.id):undefined;
 return {entry,fee,counterparts,documents,invoice_status:payments.length?'verified':'unlinked',memory_url:payments.length?`/memory?view=knowledge#payment-${payments[0].fact_id}`:null,warnings};
}
export function householdDocument(id:string,batch:string,kind:string,digest:string){
 if(!['statement','invoice'].includes(kind)||!/^[a-f0-9]{64}$/.test(digest))throw Error('invalid_document');
 if(id.startsWith('sum_')){if(kind!=='statement')throw Error('invoice_not_bound');return {bytes:supplementaryPdf(id,batch,digest),filename:'Kontoauszug.pdf'};}
 const c=selection(id,batch);
 if(kind==='statement')return {bytes:statementPdf(c.entry,c.batch.sources,digest),filename:`Kontoauszug-${c.entry.booking_date.slice(0,7)}.pdf`};
 // Payment confirmation revalidates the invoice, source mail and matched bank
 // proof each time. An earlier UI response never grants lasting file access.
 const payment=listPaymentConfirmedMemory().find(p=>p.invoice_sha256===digest&&paymentForEntry(c.entry,p));if(!payment)throw Error('invoice_not_bound');
 return {bytes:originalPdf(digest),filename:`Rechnung-${payment.invoice_number.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,60)||'Beleg'}.pdf`};
}
