/** Claude-Nachreview Belegfix B5c: verwandte Zahlungsmitteilung bei wiederkehrender Rechnung (synthetisch, Harness wie payment-related.test.ts). */
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import Database from 'better-sqlite3';
import {findRelatedPaymentReceipt,appendRelatedReceipt} from './payment-related.js';
const state=vi.hoisted(()=>({db:null as any}));
vi.mock('../../folio-db/init.js',()=>({getFolioDb:()=>state.db}));
vi.mock('../../feedback/reader.js',()=>({getFeedbackRowById:(id:number)=>({subject:'Monatsrechnung',account_id:'test',imap_uid:id})}));
const block=(date:string)=>`Rechnungsdatum ${date}\nGemäss unserer Vereinbarung erlaube ich mir, Ihnen folgende Rechnung zu stellen:\nLeistung\nBuchhaltung Monatspauschale\nTotal\n99.--\nBitte überweisen Sie den Betrag von Fr. 99.-- innert 30 Tagen auf folgendes Konto:\nIBAN Nummer: CH00 0000 0000 0000 0000 0\nlautend auf: Sample GmbH, Basel\noder mit TWINT auf die bekannte Nummer\nBei Fragen bin ich gerne da.`;
// Kunde bestätigt die SEPTEMBER-Rechnung; zitiert ist die Septemberrechnung.
const receipt='Die Rechnung über CHF 99.– habe ich am 02.09.26 bereits beglichen';
beforeEach(()=>{
 state.db=new Database(':memory:');
 state.db.exec(`CREATE TABLE memory_facts(fact_id TEXT,domain TEXT,predicate TEXT,status TEXT,supersedes_fact_id TEXT,source_ref TEXT,source_excerpt TEXT,proposal_id TEXT);
 CREATE TABLE mail_intake_sources(feedback_id INTEGER,account TEXT,uid INTEGER,uidvalidity INTEGER,body TEXT,truncated INTEGER);
 CREATE TABLE memory_sources(source_ref TEXT,status TEXT);CREATE TABLE memory_proposals(proposal_id TEXT,status TEXT);
 INSERT INTO memory_proposals VALUES('p','candidate');`);
 state.db.prepare('INSERT INTO memory_facts VALUES(?,?,?,?,?,?,?,?)').run('sep-receipt','finance','paid','candidate',null,'mail:test:9',receipt,'p');
 state.db.prepare('INSERT INTO mail_intake_sources VALUES(?,?,?,?,?,?)').run(9,'test',9,1,receipt+'\n\n'+block('01.09.2026').split('\n').map(l=>'> '+l).join('\n'),0);
});
afterEach(()=>state.db.close());
it('B5c verknüpft die Septemberquittung nicht mit der Augustrechnung',()=>{
 const august=block('01.08.2026');
 const proof=findRelatedPaymentReceipt(august,'aug-invoice');
 if(proof){const r=appendRelatedReceipt(august,proof);console.log('B5c: August-Rechnung erhält Entwurf',r.draft?.kind,r.draft?.date.value);}
 expect(proof).toBeUndefined();
});

it('rejects a related receipt outside a dated invoice settlement interval',()=>{
 // Same September invoice, but its receipt date is after the payment window.
 state.db.prepare('UPDATE mail_intake_sources SET body=replace(body,?,?)').run('02.09.26','20.11.26');
 state.db.prepare('UPDATE memory_facts SET source_excerpt=replace(source_excerpt,?,?)').run('02.09.26','20.11.26');
 expect(findRelatedPaymentReceipt(block('01.09.2026'),'sep-invoice')).toBeUndefined();
});
it('accepts the September receipt for the dated September invoice',()=>{
 expect(findRelatedPaymentReceipt(block('01.09.2026'),'sep-invoice')).toBeDefined();
});

it('does not attach a receipt to a conflicting invoice chain',()=>{
 const conflicting='Bitte überweisen Sie den Betrag von Fr. 150.-- innert 10 Tagen auf folgendes Konto: lautend auf: Sample GmbH, Basel.\n'+block('01.09.2026');
 expect(findRelatedPaymentReceipt(conflicting,'sep-invoice')).toBeUndefined();
});
