/** Claude-Nachreview 3 (C1–C4-Korrekturen) – synthetische Gegenbeispiele. Rot = Befund bzw. dokumentierte Grenze. */
import {it,expect} from 'vitest';
import {sourceAmounts,normalizePaymentClaim,samePaymentBundle} from './payment-claim-policy.js';
const f=(value:string,quote=value)=>({value,quote});const e={value:'',quote:''};

// Gruppenprüfung mit Originalrollen (positiv/negativ).
const base={document_key:'k',amount:'99.00',currency:'CHF',counterparty:'Sample GmbH',invoice_number:''};
it('RV3-G1 April-Rate (Original) wird nicht mit Juli gebündelt',()=>{
 expect(samePaymentBundle([{...base,kind:'receipt',invoice_date:'2026-07-02',original_document:{kind:'invoice',invoice_date:'2026-04-01'}},{...base,kind:'receipt',invoice_date:'2026-07-02'},{...base,kind:'invoice',invoice_date:'2026-07-01',original_document:{kind:'invoice',invoice_date:'2026-07-01'}}])).toBe(false);
});
it('RV3-G2 echte Kopie derselben Rechnung plus eine Quittung bleibt bündelbar',()=>{
 expect(samePaymentBundle([{...base,kind:'invoice',invoice_date:'2026-07-01'},{...base,kind:'invoice',invoice_date:'2026-07-01'},{...base,kind:'receipt',invoice_date:'2026-07-02'}])).toBe(true);
});

// D1: Die Mehrdeutigkeitsprüfung für Rechnungsdaten kennt nur „Rechnungsdatum|Invoice date“ mit vierstelligem Jahr.
// Ein früherer Modellentwurf mit anderer Datumsform übersteht normalizePaymentClaim.
const chain=(label:(d:string)=>string)=>`Zahlungserinnerung – die Augustrechnung ist noch offen.\n${label('01.09.2026')}\nLeistungszeitraum: September 2026\nBitte überweisen Sie Fr. 99.-- an Sample GmbH.\n\n> ${label('01.08.2026')}\n> Leistungszeitraum: August 2026\n> Bitte überweisen Sie Fr. 99.-- an Sample GmbH.`;
it.each([
 ['Rechnung vom',(d:string)=>`Rechnung vom ${d}`,'Rechnung vom 01.09.2026','2026-09-01'],
 ['zweistelliges Jahr',(d:string)=>`Rechnungsdatum: ${d.replace('2026','26')}`,'Rechnungsdatum: 01.09.26','2026-09-01'],
])('RV3-D1 Modell-/Cache-Entwurf mit Datumsform „%s“ in widersprüchlicher Kette wird abgelehnt',(_n,label,dq,dv)=>{
 const text=chain(label);
 const draft={kind:'invoice',amount:f('99.00','Fr. 99.--'),currency:f('CHF','Fr. 99.--'),counterparty:f('Sample GmbH'),date:f(dv,dq),due_date:e,reference:e};
 expect(()=>normalizePaymentClaim(draft,text,'2026-08-03',['bank'])).toThrow();
});

// D2: Nachgestelltes Trennzeichen nach einem positiven Betrag wird als Vorzeichen gelesen (fail-closed, Fehlanzeige).
it.each(['CHF 99.00 – zahlbar bis 30.09.2026','Total CHF 99.00 - inkl. MWST'])('RV3-D2 liest %s weiterhin als 99.00',q=>{
 expect(sourceAmounts(q,'CHF')).toEqual(['99.00']);
});
// Kontrolle C1/C2 (erwartet grün)
it.each(['Fr. 99.-','Fr. 99.--','CHF 99.–','CHF 99.—'])('RV3-K1 Ganzfranken %s bleibt gültig',q=>expect(sourceAmounts(q,'CHF')).toEqual(['99.00']));
it('RV3-K2 Erstattung mit zitierter Einzahlung bleibt credit',()=>{
 const text='Beispiel Broker AG: Wir erstatten Ihnen die Gebühr von CHF 10.00 am 05.03.2026.\n\n> Wir haben Ihre Einzahlung von CHF 1000.00 auf Ihr Konto bei Beispiel Broker AG erhalten.';
 const draft={kind:'refund',amount:f('10.00','CHF 10.00'),currency:f('CHF','CHF 10.00'),counterparty:f('Beispiel Broker AG'),date:f('2026-03-05','05.03.2026'),due_date:e,reference:e};
 const n=normalizePaymentClaim(draft,text,'2026-03-05',['bank']);
 expect(n.match_request.direction).toBe('credit');expect(n.match_request.target).toBe('reimbursement_to_participant');
});

import {explicitPaymentClaim} from './payment-extraction.js';
import {invoiceDocumentKey,invoiceDateField} from './payment-claim-policy.js';
const invoice=(label:string)=>`${label}\nGemäss unserer Vereinbarung erlaube ich mir, Ihnen folgende Rechnung zu stellen:\nLeistung: Monatsbeitrag\nTotal 99.--\nBitte überweisen Sie den Betrag von Fr. 99.-- innert 30 Tagen auf folgendes Konto:\nIBAN Nummer: CH00 0000 0000 0000 0000 0\nlautend auf: Sample GmbH, Basel\nBei Fragen bin ich gerne da.`;
it.each(['Rechnung vom 01.09.26','Rechnungsdatum: 01.09.2026','Invoice date: 2026-09-01'])('shares the invoice date across extraction and document identity: %s',label=>{
 const text=invoice(label)+'\nLieferdatum: 30.08.2026\nFälligkeitsdatum: 30.09.2026';
 expect(explicitPaymentClaim(text,text)?.date.value).toBe('2026-09-01');
 expect(invoiceDocumentKey(text)).toBe(invoiceDocumentKey(invoice('Rechnungsdatum: 01.09.2026')));
 expect(invoiceDocumentKey(text)).not.toBe(invoiceDocumentKey(invoice('Rechnung vom 01.08.26')));
 const draft=explicitPaymentClaim(text,text)!;
 expect(normalizePaymentClaim(draft,text,'2026-09-02',['bank']).invoice_date).toBe('2026-09-01');
 expect(invoiceDocumentKey(text+'\n'+invoice(label))).toBeDefined();
});
it('rejects differing invoice dates consistently and does not use unrelated date labels',()=>{
 const text=invoice('Rechnung vom 01.09.26')+'\n'+invoice('Invoice date: 2026-08-01');
 expect(explicitPaymentClaim(text,text)).toBeNull();expect(invoiceDocumentKey(text)).toBeUndefined();
 expect(invoiceDateField('Lieferdatum: 01.09.26\nFälligkeitsdatum: 30.09.26')).toBeUndefined();
});
it.each(['CHF 99.00- zahlbar','CHF 99.00 − zahlbar','CHF 99.00 –','CHF 99.00 + Text','99.00 - CHF','- CHF 99.00','CHF 99.00\n- zahlbar'])('retains sign protection: %s',q=>expect(sourceAmounts(q,'CHF')).toEqual([]));
it.each(['99.00 CHF – inkl. MWST','CHF 99.00 — zahlbar','CHF 99.– – zahlbar'])('reads separated prose: %s',q=>expect(sourceAmounts(q,'CHF')).toEqual(['99.00']));
