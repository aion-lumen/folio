/**
 * Claude-Nachreview Belegfix (02.10.2026) – synthetische Reproduktionen.
 * Jeder Test beschreibt das ERWARTETE Verhalten laut Auftrag/Doku.
 * Ein roter Test = Befund. Keine echten Daten, keine Modellaufrufe.
 */
import {it,expect} from 'vitest';
import {explicitPaymentClaim,paymentSourceRoute} from './payment-extraction.js';
import {sourceAmounts,normalizePaymentClaim,invoiceDocumentKey,samePaymentBundle} from './payment-claim-policy.js';

const f=(value:string,quote=value)=>({value,quote});
const e={value:'',quote:''};

// B1: Vorzeichen. sourceMoney lehnt ein führendes "-" ab, die Regex-Lookbehind
// in sourceAmounts schliesst aber nur ein direkt anliegendes ASCII +/- aus.
it.each(['−12,00 EUR','- 12,00 EUR','– 12,00 EUR'])('B1 liest den negativen Betrag %s nicht als positiven Betrag',q=>{
 expect(sourceAmounts(q,'EUR')).toEqual([]);
});
it('B1 normalisiert eine Gutschrift mit Unicode-Minus nicht zu einer Belastung',()=>{
 const text='Gutschrift Nr. GS-778812 von Beispiel GmbH vom 03.09.2026: −12,00 EUR';
 const draft={kind:'invoice',amount:f('12.00','−12,00 EUR'),currency:f('EUR','−12,00 EUR'),counterparty:f('Beispiel GmbH'),date:f('2026-09-03','03.09.2026'),due_date:e,reference:e};
 expect(()=>normalizePaymentClaim(draft,text,'2026-09-03',['bank'])).toThrow();
});

// B2: Relative Frist. normalizeSource entfernt Zeilenumbrüche, daher greift die
// Zeilengrenze [^!?\r\n] nicht; eine Rückerstattungsfrist im Folgesatz wird Zahlungsfrist.
it('B2 macht eine Rückerstattungsfrist im Folgesatz nicht zur Zahlungsfrist',()=>{
 const text='Bitte überweisen Sie den Betrag von Fr. 99.-- auf folgendes Konto: lautend auf: Sample GmbH, Basel.\nSie können innerhalb von 30 Tagen eine Rückerstattung anfordern.\nRechnungsdatum 04.12.2025';
 const draft=explicitPaymentClaim(text,'Bitte überweisen Sie den Betrag von Fr. 99.--')!;
 const n=normalizePaymentClaim(draft,text,'2025-12-04',['bank']);
 expect(n.settlement_basis).toBe('invoice-seven-day-search-limit');
 expect(n.match_request.not_after).toBe('2025-12-11');
});
it('B2b liest "zahlen wir … zurück" nicht als Zahlungsauftrag',()=>{
 const text='Bitte überweisen Sie den Betrag von Fr. 99.-- auf folgendes Konto: lautend auf: Sample GmbH, Basel. Rechnungsdatum 04.12.2025. Bei Rückgabe zahlen wir den Betrag innerhalb von 30 Tagen zurück.';
 const n=normalizePaymentClaim(explicitPaymentClaim(text,'Bitte überweisen Sie den Betrag von Fr. 99.--')!,text,'2025-12-04',['bank']);
 expect(n.settlement_basis).toBe('invoice-seven-day-search-limit');
});

// B3: Mehrere Beträge in einer Mailkette. Der Betrag wird aus dem ersten
// "Betrag von"/"Rechnung über" der ganzen Kette gelesen, das Datum aus dem Excerpt.
it('B3 kombiniert nicht den Betrag einer neuen Rechnung mit dem Zahlungsdatum aus dem Excerpt',()=>{
 const excerpt='Die Rechnung über CHF 99.– habe ich am 17.12.25 bereits beglichen';
 const text='Bitte überweisen Sie den Betrag von Fr. 150.-- innert 10 Tagen auf folgendes Konto: lautend auf: Sample GmbH, Basel. Rechnungsdatum 05.01.2026\n\n> Am 20.12.25 schrieb Kunde:\n> '+excerpt;
 const d=explicitPaymentClaim(text,excerpt);
 // Entweder kein deterministischer Entwurf oder der Betrag aus dem Excerpt.
 if(d)expect(d.amount.value).toBe('99.00');
});

// B4: Transfer-Richtung. Doku/Prompt: Einzahlung auf eigenes Brokerkonto = Abgang.
// Deterministisch erkannt wird nur ein einziges Layout; sonst wird jeder transfer credit.
it('B4 behandelt eine anders formulierte Broker-Einzahlung nicht als Gutschrift',()=>{
 const text="Wir haben Ihre Einzahlung von CHF 1'000.00 auf Ihr Konto bei Beispiel Broker AG am 20.02.2026 erhalten.";
 const draft={kind:'transfer',amount:f('1000.00',"CHF 1'000.00"),currency:f('CHF',"CHF 1'000.00"),counterparty:f('Beispiel Broker AG'),date:f('2026-02-20','20.02.2026'),due_date:e,reference:e};
 const n=normalizePaymentClaim(draft,text,'2026-02-20',['bank']);
 expect(n.match_request.direction).toBe('debit');
});

// B5: Belegkette bei wiederkehrender Rechnung mit statischem Zahlungsabschnitt.
const block=(month:string)=>`Rechnungsdatum ${month}\nGemäss unserer Vereinbarung erlaube ich mir, Ihnen folgende Rechnung zu stellen:\nLeistung\nBuchhaltung Monatspauschale\nTotal\n99.--\nBitte überweisen Sie den Betrag von Fr. 99.-- innert 30 Tagen auf folgendes Konto:\nIBAN Nummer: CH00 0000 0000 0000 0000 0\nlautend auf: Sample GmbH, Basel\noder mit TWINT auf die bekannte Nummer\nBei Fragen bin ich gerne da.`;
it('B5 bündelt zwei Monatsrechnungen mit gleichem Abschnitt nicht auf eine Bankbuchung',()=>{
 const aug=invoiceDocumentKey(block('01.08.2026')),sep=invoiceDocumentKey(block('01.09.2026'));
 expect(aug).toBeDefined();
 const a={document_key:aug,amount:'99.00',currency:'CHF',counterparty:'Sample GmbH',invoice_number:'',invoice_date:'2026-08-01',kind:'invoice'};
 const b={...a,document_key:sep,invoice_date:'2026-09-01'};
 // Zwei Rechnungen verschiedener Monate dürfen keine Zahlungsgruppe bilden.
 expect(samePaymentBundle([a,b])).toBe(false);
});
it('B5b Zahlungsfenster der beiden Monatsrechnungen überschneiden sich (Voraussetzung für Doppelverwendung)',()=>{
 const t1=block('01.08.2026'),t2=block('01.09.2026'),ex='Bitte überweisen Sie den Betrag von Fr. 99.--';
 const n1=normalizePaymentClaim(explicitPaymentClaim(t1,ex)!,t1,'2026-08-01',['bank']);
 const n2=normalizePaymentClaim(explicitPaymentClaim(t2,ex)!,t2,'2026-09-01',['bank']);
 // Dokumentiert den Sachverhalt (dieser Test ist grün): Eine Zahlung am 02.09. liegt in beiden Fenstern.
 expect(n1.match_request.not_after>='2026-09-02'&&n2.match_request.not_before<='2026-09-02').toBe(true);
 // Settlement windows may overlap, but invoice identities must differ.
 expect(n1.document_key).not.toBe(n2.document_key);
});

// B6: Routing über historische Mailkette. Probeabo/Gesamt 0,00 wird im GANZEN Text gesucht.
it('B6 ordnet eine echte Folgerechnung nicht wegen eines zitierten Probeabos als Vertragsinfo ein',()=>{
 const invoice='Ihre Rechnung: Monatsabo Beispiel Plus. Gesamt: 21,99 €. Abgebucht am 05.09.2026.';
 const text=invoice+'\n\n> Ursprüngliche Nachricht vom 05.08.2026:\n> Willkommen im Probeabo. Gesamt: 0,00 €.';
 expect(paymentSourceRoute(text,invoice)).toBeNull();
});

it.each(['EUR −12,00','EUR - 12,00','− EUR 12,00','+ 12,00 EUR','— 12,00 EUR'])('rejects other signed source amounts: %s',q=>expect(sourceAmounts(q,'EUR')).toEqual([]));
it('requires a direction for unknown transfer wording',()=>{
 const text="Transfer CHF 1000.00 bei Sample Broker am 20.02.2026";
 const draft={kind:'transfer',amount:f('1000.00','CHF 1000.00'),currency:f('CHF'),counterparty:f('Sample Broker'),date:f('2026-02-20','20.02.2026'),due_date:e,reference:e};
 expect(()=>normalizePaymentClaim(draft,text,'2026-02-20',['bank'])).toThrow('payment_transfer_direction_unproven');
});
it('recognizes zahlbar innert as a payment term',()=>{
 const text=block('01.08.2026').replace('innert 30 Tagen','auf das folgende Konto.\nZahlbar innert 30 Tagen');
 const n=normalizePaymentClaim(explicitPaymentClaim(text,'Bitte überweisen Sie den Betrag von Fr. 99.--')!,text,'2026-08-01',['bank']);
 expect(n.settlement_basis).toBe('source-relative-due-plus-two-weekdays');
});
it('requires a period or dated invoice before copying a payment paragraph',()=>{
 expect(invoiceDocumentKey(block('01.08.2026').replace('Rechnungsdatum 01.08.2026',''))).toBeUndefined();
 const a={document_key:'same',amount:'99.00',currency:'CHF',counterparty:'Sample GmbH',invoice_number:'',invoice_date:'2026-08-01',kind:'invoice'};
 expect(samePaymentBundle([a,{...a,invoice_date:'2026-09-01'}])).toBe(false);
});
