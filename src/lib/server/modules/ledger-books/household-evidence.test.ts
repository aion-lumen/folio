import {beforeEach,describe,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
const mock=vi.hoisted(()=>({context:null as any,payments:[] as any[],receipt:null as any,bytes:Buffer.from('%PDF-1.7\nfixture'),receiptBytes:Buffer.from('{}')}));
vi.mock('./household.js',()=>({readHouseholdContext:()=>mock.context,displayEntry:(e:any)=>({id:e.entry_id})}));
vi.mock('../../memory/payment-confirmation.js',()=>({listPaymentConfirmedMemory:()=>mock.payments}));
vi.mock('../../file-intake/document-security.js',()=>({securityRoot:()=>'/private/fixtures',sha256:(b:any)=>createHash('sha256').update(b).digest('hex'),storedSecurityReceipt:()=>mock.receipt,documentBytes:(p:string)=>p.endsWith('.json')?mock.receiptBytes:mock.bytes}));
import {canonicalHash} from './reconciliation.js';
import {sourceForEntry,paymentForEntry,householdDocument} from './household-evidence.js';
const digest=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
let id:string,sha:string,batch:string;
beforeEach(()=>{id='txn_'+'a'.repeat(24);sha=digest(mock.bytes);batch='b'.repeat(64);mock.receipt={receipt_id:'a'.repeat(36),status:'clean',original_sha256:sha};mock.receiptBytes=Buffer.from(JSON.stringify(mock.receipt));const source={source_ref:'src_'+sha,source_sha256:sha,account_ref:'acct_a',format:'pdf',clearance:mock.receipt,extraction:{status:'extracted',original_sha256:sha,security_receipt_id:mock.receipt.receipt_id,security_receipt_sha256:digest(mock.receiptBytes)}};const entry={entry_id:id,account_ref:'acct_a',booking_date:'2026-08-15',amount:'-99.90',currency:'EUR',evidence:[{sha256:sha,ref:source.source_ref+':text-line:4'}]};mock.context={batch:{batch_sha256:batch,entries:[entry],sources:[source]}};mock.payments=[];});
describe('source-bound household document access',()=>{
 it('opens only the document bound to the selected entry and unchanged clearance',()=>{expect(householdDocument(id,batch,'statement',sha).bytes).toEqual(mock.bytes);});
 it('rejects traversal, a stale batch and another account’s document',()=>{expect(()=>householdDocument('../secret',batch,'statement',sha)).toThrow();expect(()=>householdDocument(id,'c'.repeat(64),'statement',sha)).toThrow('batch_changed');mock.context.batch.sources[0].account_ref='acct_other';expect(()=>householdDocument(id,batch,'statement',sha)).toThrow('source_not_bound');});
 it('rejects changed originals and a withdrawn security result',()=>{mock.bytes=Buffer.from('%PDF-1.7\nchanged');expect(()=>householdDocument(id,batch,'statement',sha)).toThrow('original_changed');mock.receipt={...mock.receipt,status:'blocked'};expect(()=>householdDocument(id,batch,'statement',sha)).toThrow('statement_proof_changed');});
 it('does not infer a receipt association from an equal amount/date alone',()=>{const e=mock.context.batch.entries[0];const payment={paid_at:e.booking_date,currency:e.currency,amount:'99.90',bank_sha256:sha,bank_source_ref:'different-reference'} as any;expect(paymentForEntry(e,payment)).toBe(false);expect(()=>householdDocument(id,batch,'invoice',sha)).toThrow('invoice_not_bound');});
 it('rechecks an invoice association on each request',()=>{const e=mock.context.batch.entries[0];mock.payments=[{paid_at:e.booking_date,currency:e.currency,amount:'99.90',bank_sha256:sha,bank_source_ref:e.evidence[0].ref,invoice_sha256:sha,invoice_number:'INV-123'}];expect(householdDocument(id,batch,'invoice',sha).filename).toBe('Rechnung-INV-123.pdf');mock.payments=[];expect(()=>householdDocument(id,batch,'invoice',sha)).toThrow('invoice_not_bound');});
 it('requires a valid source line locator, not merely a matching digest',()=>{const e=mock.context.batch.entries[0];e.evidence[0].ref='src_'+sha+':text-line:../../secret';expect(()=>sourceForEntry(e,mock.context.batch.sources,sha)).toThrow();});
});
