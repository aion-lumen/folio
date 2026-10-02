/**
 * Claude-Nachreview 2 (B1–B7-Korrekturen, 02.10.2026) – synthetische Gegenbeispiele.
 * Erwartung = Verhalten laut Auftrag/Doku. Rot = Befund. Keine echten Daten, keine Modellaufrufe.
 */
import {it,expect} from 'vitest';
import {explicitPaymentClaim} from './payment-extraction.js';
import {sourceAmounts,normalizePaymentClaim,samePaymentBundle} from './payment-claim-policy.js';
const f=(value:string,quote=value)=>({value,quote});
const e={value:'',quote:''};

// C1: Nachgestelltes Minus (Bank-/SAP-Notation) wird weiterhin positiv gelesen.
it.each(['CHF 12.00-','12,00- EUR'])('C1 liest den nachgestellt negativen Betrag %s nicht als positiv',q=>{
 expect(sourceAmounts(q,q.includes('CHF')?'CHF':'EUR')).toEqual([]);
});

// C2: Einzahlungs-Erkennung gilt unabhängig von kind. Ein refund in einer Kette mit
// Einzahlungssatz wird debit -> Ledger lehnt claim_kind/direction ab -> payment_match_failed.
it('C2 macht eine Erstattung nicht wegen eines Einzahlungssatzes in der Kette zur Belastung',()=>{
 const text='Beispiel Broker AG: Wir erstatten Ihnen die Gebühr von CHF 10.00 am 05.03.2026.\n\n> Wir haben Ihre Einzahlung von CHF 1000.00 auf Ihr Konto bei Beispiel Broker AG erhalten.';
 const draft={kind:'refund',amount:f('10.00','CHF 10.00'),currency:f('CHF','CHF 10.00'),counterparty:f('Beispiel Broker AG'),date:f('2026-03-05','05.03.2026'),due_date:e,reference:e};
 let r:any;try{r=normalizePaymentClaim(draft,text,'2026-03-05',['bank']);}catch{return;}
 expect(r.match_request.direction).toBe('credit');
});

// C3: Mailkette mit gleichem Betrag, aber zwei Rechnungsdaten. Betrag/Empfänger sind
// eindeutig, das Datum wird aber unabhängig vom Excerpt aus dem ersten Treffer gelesen.
it('C3 übernimmt für eine zitierte Augustrechnung nicht das Datum der neuen Septemberrechnung',()=>{
 const inv=(d:string,m:string)=>`Rechnungsdatum ${d}\nLeistungszeitraum: ${m} 2026\nBitte überweisen Sie den Betrag von Fr. 99.-- innert 30 Tagen auf folgendes Konto: lautend auf: Sample GmbH, Basel.`;
 const text='Zahlungserinnerung – die Augustrechnung ist noch offen.\n'+inv('01.09.2026','September')+'\n\n> '+inv('01.08.2026','August').split('\n').join('\n> ');
 const d=explicitPaymentClaim(text,'Leistungszeitraum: August 2026');
 if(d)expect(d.date.value).not.toBe('2026-09-01');
});

// C4: Bündelschutz nach invoice_date greift nur für kind 'invoice'. Eine Rechnung,
// deren Entwurf durch eine verwandte Quittung ersetzt wurde, ist kind 'receipt'.
it('C4 bündelt nicht zwei Leistungsrechnungen verschiedener Monate über eine ersetzte Quittung',()=>{
 const base={document_key:'k',amount:'99.00',currency:'CHF',counterparty:'Sample GmbH',invoice_number:''};
 const q1AsReceipt={...base,kind:'receipt',invoice_date:'2026-07-02'};   // Q1-Angabe mit Q2-Quittung als Entwurf
 const q2Receipt={...base,kind:'receipt',invoice_date:'2026-07-02'};
 const q2Invoice={...base,kind:'invoice',invoice_date:'2026-07-01'};
 expect(samePaymentBundle([q1AsReceipt,q2Receipt,q2Invoice])).toBe(false);
});

it.each(['CHF 12.00 −','12,00 – EUR','CHF 12.00+'])('rejects trailing signs: %s',q=>expect(sourceAmounts(q,q.includes('CHF')?'CHF':'EUR')).toEqual([]));
it.each(['CHF 99.-','CHF 99.--','99.– CHF'])('retains whole-franc notation: %s',q=>expect(sourceAmounts(q,'CHF')).toEqual(['99.00']));
it('blocks ambiguous invoice dates even for an earlier cached or model draft',()=>{
 const text='Sample GmbH: Rechnungsdatum 01.09.2026. Betrag CHF 99.00. Zitat: Rechnungsdatum 01.08.2026.';
 const draft={kind:'invoice',amount:f('99.00','CHF 99.00'),currency:f('CHF'),counterparty:f('Sample GmbH'),date:f('2026-09-01','01.09.2026'),due_date:e,reference:e};
 expect(()=>normalizePaymentClaim(draft,text,'2026-08-01',['bank'])).toThrow('payment_date_ambiguous');
});
it('groups true invoice copies by their original roles, preserving different original months',()=>{
 const base={document_key:'same',amount:'99.00',currency:'CHF',counterparty:'Sample GmbH',invoice_number:'',kind:'receipt',invoice_date:'2026-07-02'};
 const july={...base,original_document:{kind:'invoice',invoice_date:'2026-07-01'}};
 const april={...base,original_document:{kind:'invoice',invoice_date:'2026-04-01'}};
 expect(samePaymentBundle([july,{...july},base])).toBe(true);
 expect(samePaymentBundle([april,july,base])).toBe(false);
});
