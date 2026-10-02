import {describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {EXTRACTION_POLICY,currentClaimCache,validatedCachedClaim,explicitPaymentClaim,paymentSourceRoute} from './payment-extraction.js';
import {sourceMoney,sourceAmounts,normalizePaymentClaim,invoiceDocumentKey,samePaymentBundle} from './payment-claim-policy.js';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
describe('source extraction repair',()=>{
 it('invalidates previous and changed-source extraction caches',()=>{
  const c={policy:EXTRACTION_POLICY,source_sha256:hash('original'),fact_sha256:'fact'};
  expect(currentClaimCache(c,'original','fact')).toBe(true);
  expect(currentClaimCache({...c,policy:undefined},'original','fact')).toBe(false);
  expect(currentClaimCache(c,'changed','fact')).toBe(false);
  expect(currentClaimCache(c,'original','newfact')).toBe(false);
 });
 it.each([['99.–','99.00'],['99.--','99.00'],['200','200.00'],['4411.8200','4411.82'],['25.0000','25.00'],['1.000',null],['99.1234',null]])('parses %s without rounding or guessing', (s,value)=>expect(sourceMoney(s!)).toBe(value));
 it('requires currency and source context for grouped integers',()=>{
  expect(sourceAmounts('Eingezahlt1.000 CHF','CHF')).toEqual(['1000.00']);
  expect(sourceAmounts('Fr. 99.--','CHF')).toEqual(['99.00']);
  expect(sourceAmounts('CHF 99.–','CHF')).toEqual(['99.00']);
  expect(sourceAmounts('200 CHF','CHF')).toEqual(['200.00']);
  expect(sourceAmounts('Beleg 200 Datum 13.08.2026','CHF')).toEqual([]);
 });
 it('binds a Swiss receipt to the amount rather than date numerals',()=>{
  const t='Eingang Ihrer Zahlung von 5,00 CHF. Ihre Zahlung von 13.08.26 per Twint erhalten und verarbeitet wurde. Mit freundlichen Grüssen Example | Support';
  const d=explicitPaymentClaim(t,'Ihre Zahlung von 13.08.26 per Twint erhalten');
  expect(d?.amount.value).toBe('5.00');
  expect(normalizePaymentClaim(d,t,'2026-08-13',['bank']).match_request.direction).toBe('debit');
 });
 it('does not label a payment authorisation as a completed receipt',()=>{
  const t='Sie haben 10,00 € EUR an Sample Telecom GmbH autorisiert. Transaktionsdatum 08.01.2026 Bestellnummer PRC-123456';
  const d=explicitPaymentClaim(t,'Sie haben 10,00 € EUR an Sample Telecom GmbH autorisiert');
  expect(d?.kind).toBe('announcement');expect(d?.amount.value).toBe('10.00');
 });
 it('keeps a deposit into a broker outgoing from the bank',()=>{
  const t='Auf dein Example Konto wurde eine Einzahlung getätigt. Eingezahlt1.000 CHF Datum:20.02.2026 Gebühren:0 CHF';
  const d=explicitPaymentClaim(t,'Eingezahlt1.000 CHF');expect(d?.amount.value).toBe('1000.00');
  expect(normalizePaymentClaim(d,t,'2026-02-20',['bank']).match_request.direction).toBe('debit');
 });
 it('uses a quoted relative payment term and keeps month coverage complete',()=>{
  const t='Bitte überweisen Sie den Betrag von Fr. 99.-- innert 10 Tagen auf folgendes Konto: lautend auf: Sample GmbH, Basel. Rechnungsdatum 04.12.2025';
  const d=explicitPaymentClaim(t,'Bitte überweisen Sie den Betrag von Fr. 99.-- innert 10 Tagen');
  const n=normalizePaymentClaim(d,t,'2025-12-04',['bank']);
  expect(n.match_request.not_after).toBe('2025-12-16');expect(n.match_request.window.to).toBe('2025-12-31');
 });
 it('routes actual context separately but not cancellation text in an invoice footer',()=>{
  const cancellation='Deine Mitgliedschaft wurde beendet.';
  expect(paymentSourceRoute(cancellation,cancellation)).toBe('payment_context_only');
  const t='Rechnung 20 CHF bezahlt. Link: Mitgliedschaft wurde beendet.';
  expect(paymentSourceRoute(t,'Rechnung 20 CHF bezahlt.')).toBeNull();
  const free='Probeabo. Gesamt: 0,00 €. Später 21,99 €/Monat';expect(paymentSourceRoute(free,free)).toBe('payment_context_only');
  expect(paymentSourceRoute('BOUGHT 5,000 EUR.CHF @ 0.92','BOUGHT 5,000 EUR.CHF @ 0.92')).toBe('payment_broker_statement_required');
  expect(paymentSourceRoute('unrelated','Deine Mitgliedschaft wurde beendet.')).toBeNull();
 });
 it('bundles exact quoted original invoice paragraphs but not equal prices alone',()=>{
  const block='Gemäss unserer Vereinbarung erlaube ich mir, Ihnen folgende Rechnung zu stellen:\nLeistung\nSteuererklärung 2024\n120.--\nminus Digitalrabatt\n- 21.--\nTotal\n99.--\nBitte überweisen Sie den Betrag von Fr. 99.-- innert 10 Tagen auf folgendes Konto:\nIBAN Nummer: CH00 0000 0000 0000 0000 0\nlautend auf: Sample GmbH, Basel\noder mit TWINT auf die bekannte Nummer\nBei Fragen bin ich gerne da.';
  expect(invoiceDocumentKey(block+'\n'+block.replace('Steuererklärung 2024','Steuererklärung 2025'))).toBeUndefined();
  const key=invoiceDocumentKey(block);expect(key).toMatch(/^[a-f0-9]{64}$/);
  expect(invoiceDocumentKey('Weitergeleitet:\n'+block.split('\n').map(l=>'> '+l).join('\n'))).toBe(key);
  const a={document_key:key,amount:'99.00',currency:'CHF',counterparty:'Sample GmbH',invoice_number:'',invoice_date:'2025-12-04',kind:'invoice'};
  expect(samePaymentBundle([a,{...a,invoice_date:'2025-12-17',kind:'receipt'}])).toBe(true);
  expect(samePaymentBundle([a,{...a,document_key:undefined,invoice_date:'2025-12-17'}])).toBe(false);
  expect(samePaymentBundle([a,{...a,amount:'120.00'}])).toBe(false);
 });
});

it('does not reuse a current cached draft with empty or unbound fields',()=>{
 const source='Sie haben 10,00 € EUR an Sample Telecom GmbH autorisiert. Transaktionsdatum 08.01.2026';
 const draft=explicitPaymentClaim(source,source)!;
 const cached={policy:EXTRACTION_POLICY,source_sha256:hash(source),fact_sha256:'f',draft};
 expect(validatedCachedClaim(cached,source,'f','2026-01-08',[{ref:'bank',currency:'EUR'}])).toEqual(draft);
 expect(validatedCachedClaim({...cached,draft:{...draft,amount:{value:'',quote:''}}},source,'f','2026-01-08',[{ref:'bank',currency:'EUR'}])).toBeUndefined();
 expect(validatedCachedClaim({...cached,draft:{...draft,amount:{value:'99.00',quote:'10,00 € EUR'}}},source,'f','2026-01-08',[{ref:'bank',currency:'EUR'}])).toBeUndefined();
});

it('reads bounded legacy amount objects while preserving source and currency checks',()=>{
 const text='Sie haben 10,00 € EUR an Sample Telecom GmbH autorisiert. Transaktionsdatum 08.01.2026';
 const draft=explicitPaymentClaim(text,text)!;
 for(const value of ['{"amount":"10,00","currency":"EUR"}','{"currency":"EUR","value":10.00}']){
  expect(normalizePaymentClaim({...draft,amount:{...draft.amount,value}},text,'2026-01-08',['bank']).amount).toBe('10.00');
 }
 for(const value of ['{"amount":"99.00","currency":"EUR"}','{"amount":"10.00","currency":"CHF"}','{"amount":"10.00","value":"99.00"}','{"amount":"10.00","other":10}']){
  expect(()=>normalizePaymentClaim({...draft,amount:{...draft.amount,value}},text,'2026-01-08',['bank'])).toThrow('payment_amount_unproven');
 }
});
it('does not interpret a refund or cancellation period as the invoice payment term',()=>{
 const text='Bitte überweisen Sie den Betrag von Fr. 99.-- auf folgendes Konto: lautend auf: Sample GmbH, Basel. Rechnungsdatum 04.12.2025. Sie können innerhalb von 30 Tagen eine Rückerstattung anfordern.';
 const draft=explicitPaymentClaim(text,'Bitte überweisen Sie den Betrag von Fr. 99.--')!;
 const invoice=normalizePaymentClaim(draft,text,'2025-12-04',['bank']);
 expect(invoice.settlement_basis).toBe('invoice-seven-day-search-limit');
 expect(invoice.match_request.not_after).toBe('2025-12-11');
});
