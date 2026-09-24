import {describe,it,expect} from 'vitest';
import {amountKeys,discoverLinks,coverageGaps,type BankEvidence,type MailEvidence} from './finance-discovery.js';
const bank:BankEvidence={observation_id:'b1',account_ref:'a',booking_date:'2026-07-10',amount:'-47.96',currency:'EUR',direction:'debit',counterparty:'Example Telecom',purpose:'Invoice ABC123456',references:['ABC123456']};
const mail:MailEvidence={id:1,ref:'mail:test:1',date:'2026-07-01',subject:'Rechnung',sender:'billing@example.invalid',body:'Example Telecom invoice ABC123456 EUR 47.96',truncated:false,sha256:'x'};
describe('advisory finance discovery',()=>{
 it('keeps currency and amount together',()=>{expect(amountKeys('CHF 1’200.50, EUR 1.200,50')).toEqual(new Set(['CHF:120050','EUR:120050']));});
 it('links exact invoice evidence without confirming payment',()=>{expect(discoverLinks([bank],[mail])).toEqual([expect.objectContaining({bank_id:'b1',mail_id:1,status:'possible_match'})]);});
 it('rejects amount-only and cross-currency links',()=>{expect(discoverLinks([bank],[{...mail,body:'EUR 47.96',sender:'x'}])).toHaveLength(0);expect(discoverLinks([bank],[{...mail,body:'Example Telecom invoice ABC123456 CHF 47.96'}])).toHaveLength(0);});
 it('exposes multiple possible documents instead of selecting a winner',()=>{expect(discoverLinks([bank],[mail,{...mail,id:2}])).toHaveLength(2);});
 it('does not match distant repeated invoices',()=>{expect(discoverLinks([bank],[{...mail,date:'2025-07-01'}])).toHaveLength(0);});
 it('keeps internal gaps per account and ignores incomplete evidence',()=>{expect(coverageGaps([{account_ref:'a',declared_period:{from:'2026-01-01',to:'2026-01-31'},control_result:{complete:true}},{account_ref:'a',declared_period:{from:'2026-03-01',to:'2026-03-31'},control_result:{complete:true}},{account_ref:'b',declared_period:{from:'2026-02-01',to:'2026-02-28'},control_result:{complete:true}}])).toEqual([{account:'a',from:'2026-02-01',to:'2026-02-28'}]);});
});
