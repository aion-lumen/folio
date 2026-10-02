import {describe,it,expect} from 'vitest';
import {normalizePaymentClaim,paymentWindow,sourceDate,sourceMoney,type ClaimDraft} from './payment-claim-policy.js';
const empty={value:'',quote:''};
const draft:ClaimDraft={kind:'receipt',amount:{value:'37.80',quote:'37,80 € EUR'},currency:{value:'EUR',quote:'37,80 € EUR'},counterparty:{value:'Beispiel GmbH',quote:'an Beispiel GmbH gezahlt'},date:{value:'2026-09-30',quote:'30.09.2026'},due_date:empty,reference:empty};
const source='Sie haben 37,80 € EUR an Beispiel GmbH gezahlt. 30.09.2026. Wir buchen den Betrag innerhalb von ein bis zwei Werktagen ab.';
describe('Source-bound claims',()=>{
 it('keeps an end-of-month receipt waiting for next month’s settlement statement',()=>{
  const c=normalizePaymentClaim(draft,source,'2026-09-30',['acct_A']);expect(c.match_request.window).toEqual({from:'2026-09-01',to:'2026-10-31'});expect(c.match_request.not_before).toBe('2026-09-30');
 });
 it('handles weekend settlement and invoice due dates across months',()=>{
  expect(paymentWindow('2026-09-25','2026-09-25','receipt',source).to).toBe('2026-09-30');
  expect(paymentWindow('2026-09-20','2026-10-15','invoice','').to).toBe('2026-10-31');
 });
 it.each(['2026-02-30','30.02.2026','2026-13-01','unknown'])('rejects invalid dates: %s',d=>expect(sourceDate(d)).toBeNull());
 it.each([['September 01, 2026','2026-09-01'],['1. September 2026','2026-09-01'],['06.09.2026','2026-09-06']])('parses a quoted date without locale guessing', (a,b)=>expect(sourceDate(a)).toBe(b));
 it.each([['1.249,95','1249.95'],["1’249.95",'1249.95'],['99,00','99.00'],['*******',null],['-99.00',null]])('parses money exactly', (a,b)=>expect(sourceMoney(a!)).toBe(b));
 it('rejects invented amounts, currencies, counterparties and dates even with a copied quote',()=>{
  for(const field of ['amount','currency','counterparty','date'] as const){const c=structuredClone(draft);c[field].value={amount:'99.00',currency:'CHF',counterparty:'Other Ltd',date:'2026-08-30'}[field];expect(()=>normalizePaymentClaim(c,source,'2026-09-30',['a'])).toThrow();}
 });
 it('rejects missing evidence, masked amounts and no account scope',()=>{
  expect(()=>normalizePaymentClaim(draft,'unrelated text','2026-09-30',['a'])).toThrow();expect(()=>normalizePaymentClaim(draft,source,'2026-09-30',[])).toThrow();
  expect(()=>normalizePaymentClaim({...draft,amount:empty},source,'2026-09-30',['a'])).toThrow();
 });
 it('represents an incoming refund as a credit, never a debit',()=>{
  const c=normalizePaymentClaim({...draft,kind:'refund'},source,'2026-09-30',['a']);expect(c.match_request.direction).toBe('credit');expect(c.match_request.target).toBe('reimbursement_to_participant');
 });
});
it('uses the quoted currency amount, ignoring date numerals and model formatting',()=>{
 const source='Zugunsten von: Example SA. Zu zahlender Betrag bis zum 28.09.2026: CHF 49.95';
 const d={...draft,kind:'invoice',amount:{value:'}49.95',quote:'Zu zahlender Betrag bis zum 28.09.2026: CHF 49.95'},currency:{value:'CHF',quote:'CHF 49.95'},counterparty:{value:'Example SA',quote:'Zugunsten von: Example SA'},date:empty,due_date:{value:'2026-09-28',quote:'28.09.2026'}};
 expect(normalizePaymentClaim(d,source,'2026-09-11',['a']).amount).toBe('49.95');
 expect(normalizePaymentClaim({...draft,amount:{...draft.amount,value:'>$37.80'}},'Sie haben 37,80 € EUR an Beispiel GmbH gezahlt. 30.09.2026.','2026-09-30',['a']).amount).toBe('37.80');
});

import {structuredPaymentClaim} from './payment-claim-policy.js';
it('extracts common payment receipts for arbitrary merchants without model formatting',()=>{
 const text='Sie haben 19,99 € EUR an Example.com gezahlt. Transaktionsdatum 28.09.2026. Transaktionscode: ABC123456789. Wir buchen den Betrag innerhalb von ein bis zwei Werktagen ab.';
 const d=structuredPaymentClaim(text,'Sie haben 19,99 € EUR an Example.com gezahlt');expect(d?.counterparty.value).toBe('Example.com');expect(d?.amount.value).toBe('19.99');expect(normalizePaymentClaim(d,text,'2026-09-28',['a']).match_request.window.to).toBe('2026-09-30');
});
it('extracts named beneficiaries and explicit due dates without mistaking a date for money',()=>{
 const text='Zu zahlender Betrag bis zum 28.09.2026: CHF 49.95 * Referenz: 123456789012 * Zugunsten von: Example Mobile SA, CH-1008 Town';
 const d=structuredPaymentClaim(text,'Zu zahlender Betrag bis zum 28.09.2026: CHF 49.95');expect(d?.counterparty.value).toBe('Example Mobile SA');expect(normalizePaymentClaim(d,text,'2026-09-11',['a']).amount).toBe('49.95');
});

import {samePaymentBundle,paymentProduct} from './payment-claim-policy.js';
it('bundles one renewal announcement, invoice and receipt, but not two purchases',()=>{
 const common={counterparty:'Example',invoice_number:'',invoice_date:'2026-09-01',amount:'99.00',currency:'EUR',product:'example annual service'};
 const docs=[{...common,kind:'announcement'},{...common,kind:'invoice',invoice_number:'INV-123456'},{...common,kind:'receipt',counterparty:'Example Payments',invoice_number:'TXN-123456'}];
 expect(samePaymentBundle(docs)).toBe(true);
 expect(samePaymentBundle([...docs,{...docs[1],invoice_number:'INV-999999'}])).toBe(false);
 expect(samePaymentBundle([docs[1],{...docs[1],invoice_number:'INV-999999'}])).toBe(false);
 expect(samePaymentBundle([{...docs[1],product:'another service'},docs[2]])).toBe(false);
 expect(paymentProduct('Ihr Example Annual Service-Abonnement wird fortgesetzt')).toBe('example annual service');
 expect(paymentProduct('Abonnement:Example Annual Service\nAuftragsnummer:123')).toBe('example annual service');
 expect(paymentProduct('Zahlungsdetails anzeigen Example Annual Service Menge: 1')).toBe('example annual service');
});

import {paymentFundingIssue,PAYMENT_PROFILE} from './payment-claim-policy.js';
it('separates full month coverage from the actual settlement search',()=>{
 const d={...draft,date:{value:'2026-08-28',quote:'28.08.2026'}};
 const c=normalizePaymentClaim(d,source.replace('30.09.2026','28.08.2026'),'2026-08-28',['a']);
 expect(c.profile).toBe(PAYMENT_PROFILE);
 expect(c.match_request.window).toEqual({from:'2026-08-01',to:'2026-09-30'});
 expect(c.match_request.settlement_window).toEqual({from:'2026-08-28',to:'2026-09-01'});
 expect(c.match_request.not_after).toBe('2026-09-01');
});
it('uses a conservative seven day receipt limit without claiming an exact settlement date',()=>{
 const c=normalizePaymentClaim(draft,source.replace('Wir buchen den Betrag innerhalb von ein bis zwei Werktagen ab.',''),'2026-09-30',['a']);
 expect(c.match_request.not_after).toBe('2026-10-07');expect(c.settlement_basis).toBe('receipt-seven-day-search-limit');
});
it('never turns a memory month hint or a due date into an exact lower boundary',()=>{
 const d={...draft,kind:'invoice' as const,date:empty,due_date:{value:'2026-09-28',quote:'28.09.2026'}};
 const c=normalizePaymentClaim(d,'37,80 € EUR an Beispiel GmbH gezahlt. Fällig am 28.09.2026.','2026-09-28',['a']);
 expect(c.invoice_date).toBe('2026-09-01');expect(c.date_origin).toBe('memory-search-month');
 expect(c.match_request.settlement_window).toEqual({from:'2026-09-01',to:'2026-09-30'});
});
it('separates original purchase and announced refund arrival; earlier credits are eligible',()=>{
 const text='37,80 € EUR an Beispiel GmbH gezahlt. Sie haben ursprünglich am 20. Juli 2026 bezahlt. 37,80 € EUR werden bis 20. August 2026 zurückgezahlt.';
 const d={...draft,kind:'refund' as const,date:{value:'2026-08-20',quote:'20. August 2026'}};
 const c=normalizePaymentClaim(d,text,'2026-07-20',['a']);
 expect(c.date_origin).toBe('source-purchase');expect(c.due_date).toBe('2026-08-20');
 expect(c.match_request.settlement_window).toEqual({from:'2026-07-20',to:'2026-08-20'});
});
it('rejects contradictory explicit refund arrival dates',()=>{
 const text=source+' Gutschrift auf dein Bankkonto erfolgt am 30.09.2026. Gutschrift auf dein Bankkonto erfolgt am 01.10.2026.';
 expect(()=>normalizePaymentClaim({...draft,kind:'refund'},text,'2026-09-30',['a'])).toThrow('payment_date_ambiguous');
});
it.each([
 ['bezahlt mit Zusätzliches PayPal-Guthaben 20,00 CHF','payment_paypal_statement_required'],
 ['Gezahlt mit: PayPal-Guthaben (CHF)','payment_paypal_statement_required'],
 ['Payment method: Visa •••• 1234','payment_card_statement_required'],
 ['IBKR GOOG dividend received','payment_broker_statement_required'],
 ['Kontoauszug: Lastschrift Example SA',null],
 ['Wir akzeptieren Visa, PayPal und Lastschrift.',null],
])('identifies the actual funding source, not generic footer logos', (text,reason)=>expect(paymentFundingIssue(text)).toBe(reason));
it('requests the actual funding statement even if another giro account covers that currency',()=>{
 expect(()=>normalizePaymentClaim(draft,source+' Bezahlt mit Zusätzliches PayPal-Guthaben 37,80 EUR','2026-09-30',['a'])).toThrow('payment_paypal_statement_required');
 expect(()=>normalizePaymentClaim(draft,source,'2026-09-30',[])).toThrow('payment_account_coverage_missing');
});
it('cannot combine an EUR amount with a separately quoted CHF conversion',()=>{
 const text=source+' Umgerechnet in CHF.';
 expect(()=>normalizePaymentClaim({...draft,currency:{value:'CHF',quote:'CHF'}},text,'2026-09-30',['a'])).toThrow('payment_currency_unproven');
});

it('includes the refund notification month when the original purchase was last month',()=>{
 const text='37,80 € EUR an Beispiel GmbH gezahlt. Erstattung: ursprünglich am 20.08.2026 bezahlt.';
 const c=normalizePaymentClaim({...draft,kind:'refund',date:empty},text,'2026-09-02',['a']);
 expect(c.match_request.settlement_window).toEqual({from:'2026-08-20',to:'2026-09-30'});
 expect(c.match_request.require_reference).toBe(false);
});
it('allows a bounded weekday delay after a Saturday due date and requires the next full month',()=>{
 const text='37,80 € EUR an Beispiel GmbH gezahlt. Rechnung 28.09.2026. Fällig 03.10.2026.';
 const c=normalizePaymentClaim({...draft,kind:'invoice',date:{value:'2026-09-28',quote:'28.09.2026'},due_date:{value:'2026-10-03',quote:'03.10.2026'}},text,'2026-09-28',['a']);
 expect(c.match_request.not_after).toBe('2026-10-06');expect(c.match_request.window.to).toBe('2026-10-31');
 const withoutDue=normalizePaymentClaim({...draft,kind:'invoice',date:{value:'2026-09-28',quote:'28.09.2026'}},text,'2026-09-28',['a']);
 expect(withoutDue.match_request.not_after).toBe('2026-10-05');
});
it('requires bank reference agreement for a source with no date even if it contains an invoice number',()=>{
 const text='37,80 € EUR an Beispiel GmbH gezahlt. INV123456';
 const c=normalizePaymentClaim({...draft,date:empty,reference:{value:'INV123456',quote:'INV123456'}},text,'2026-09-02',['a']);
 expect(c.match_request.require_reference).toBe(true);
});
import {bankReferenceMatches} from './payment-claim-policy.js';
it('accepts exact reference tokens across bank formatting, never longer or shorter identifiers',()=>{
 expect(bankReferenceMatches(['INV123456'],{references:['INV-123456']})).toBe(true);
 expect(bankReferenceMatches(['INV123456'],{purpose:'Beleg INV 123456 bezahlt'})).toBe(true);
 expect(bankReferenceMatches(['INV123456'],{purpose:'INV1234567'})).toBe(false);
 expect(bankReferenceMatches(['INV123456'],{references:['INV12345']})).toBe(false);
 expect(bankReferenceMatches([],{purpose:'Example monthly payment'})).toBe(false);
});
