import {describe,it,expect} from 'vitest';
import {paymentSenderProfile,memoryInvoiceBinding} from './payment-source-policy.js';
describe('Invoice evidence belongs to its bound source',()=>{
 const invoice={amount:'47.96',invoice_date:'2025-07-11'};
 const fact={value_text:'47,96 EUR',valid_from:'2025-07-11',source_excerpt:'Wir ziehen den Rechnungsbetrag ein.'};
 it('accepts a proven invoice date even when the short notification omits it',()=>{
  expect(memoryInvoiceBinding(fact,'Ihre Rechnung ist im Anhang. Wir ziehen den Rechnungsbetrag ein.',invoice)).toBe(true);
 });
 it('accepts an exact subject excerpt only as part of the same bound mail',()=>{
  expect(memoryInvoiceBinding({...fact,source_excerpt:'Rechnung vom 11.07.2025'},'Details im Anhang',invoice,'Ihre Rechnung vom 11.07.2025')).toBe(true);
  expect(memoryInvoiceBinding({...fact,source_excerpt:'Rechnung vom 11.07.2025'},'Details im Anhang',invoice,'Ihre Rechnung vom 12.07.2025')).toBe(false);
 });
 it('continues to reject changed amounts, periods, ambiguous amounts and invented excerpts',()=>{
  const body=fact.source_excerpt;
  expect(memoryInvoiceBinding({...fact,value_text:'48,96 EUR'},body,invoice)).toBe(false);
  expect(memoryInvoiceBinding({...fact,value_text:'47,96 EUR und 47,96 EUR'},body,invoice)).toBe(false);
  expect(memoryInvoiceBinding({...fact,valid_from:'2025-08-11'},body,invoice)).toBe(false);
  expect(memoryInvoiceBinding({...fact,source_excerpt:'Bereits bezahlt'},body,invoice)).toBe(false);
  expect(memoryInvoiceBinding({...fact,source_excerpt:''},body,invoice)).toBe(false);
 });
 it('accepts only exact observed billing addresses, not brand mentions or suffix domains',()=>{
  expect(paymentSenderProfile('Vodafone <nicht.antworten@kundenservice.vodafone.com>')).toBe('vodafone');
  expect(paymentSenderProfile('Rechnung@unitymedia.de')).toBe('unitymedia');
  for(const s of ['Vodafone <evil@example.com>','rechnung@unitymedia.de.evil.test','evil+vodafone@example.com','rechnung@unitymedia.de\nBcc: x@y.de'])expect(paymentSenderProfile(s)).toBe(null);
 });
});
