/** Claude-Nachreview 2 C4: undatierte, identische Leistungsabschnitte mit Jahresperiode (Harness wie payment-related.test.ts). */
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import Database from 'better-sqlite3';
import {findRelatedPaymentReceipt,appendRelatedReceipt} from './payment-related.js';
import {invoiceDocumentKey} from './payment-claim-policy.js';
const state=vi.hoisted(()=>({db:null as any}));
vi.mock('../../folio-db/init.js',()=>({getFolioDb:()=>state.db}));
vi.mock('../../feedback/reader.js',()=>({getFeedbackRowById:(id:number)=>({subject:'Mitgliederbeitrag',account_id:'test',imap_uid:id})}));
// Quartalsrate eines Jahresbeitrags: identischer Abschnitt, kein Rechnungsdatum, Periode nur als Jahr.
const block=`Gemäss unserer Vereinbarung erlaube ich mir, Ihnen folgende Rechnung zu stellen:\nLeistung\nMitgliederbeitrag Quartalsrate\nLeistungszeitraum: 2026\nTotal\n99.--\nBitte überweisen Sie den Betrag von Fr. 99.-- innert 30 Tagen auf folgendes Konto:\nIBAN Nummer: CH00 0000 0000 0000 0000 0\nlautend auf: Sample GmbH, Basel\nBei Fragen bin ich gerne da.`;
const receipt='Die Rechnung über CHF 99.– habe ich am 02.07.26 bereits beglichen';  // Zahlung der Q3-Rate
beforeEach(()=>{
 state.db=new Database(':memory:');
 state.db.exec(`CREATE TABLE memory_facts(fact_id TEXT,domain TEXT,predicate TEXT,status TEXT,supersedes_fact_id TEXT,source_ref TEXT,source_excerpt TEXT,proposal_id TEXT);
 CREATE TABLE mail_intake_sources(feedback_id INTEGER,account TEXT,uid INTEGER,uidvalidity INTEGER,body TEXT,truncated INTEGER);
 CREATE TABLE memory_sources(source_ref TEXT,status TEXT);CREATE TABLE memory_proposals(proposal_id TEXT,status TEXT);
 INSERT INTO memory_proposals VALUES('p','candidate');`);
 state.db.prepare('INSERT INTO memory_facts VALUES(?,?,?,?,?,?,?,?)').run('q3-receipt','finance','paid','candidate',null,'mail:test:9',receipt,'p');
 state.db.prepare('INSERT INTO mail_intake_sources VALUES(?,?,?,?,?,?)').run(9,'test',9,1,receipt+'\n\n'+block.split('\n').map(l=>'> '+l).join('\n'),0);
});
afterEach(()=>state.db.close());
it('C4 verknüpft die Juli-Quittung nicht mit der undatierten April-Rate (gleicher Abschnitt)',()=>{
 expect(invoiceDocumentKey(block)).toBeDefined(); // Jahresperiode genügt für einen Schlüssel
 const proof=findRelatedPaymentReceipt(block,'q2-april-invoice');
 if(proof){const r=appendRelatedReceipt(block,proof);console.log('C4: April-Rate erhält Entwurf',r.draft?.kind,r.draft?.date.value);}
 expect(proof).toBeUndefined();
});

it.each(['2026-04-01',null])('does not replace a bound original search month %s with July',date=>{
 state.db.exec('ALTER TABLE memory_facts ADD COLUMN valid_from TEXT');
 state.db.prepare('INSERT INTO memory_facts VALUES(?,?,?,?,?,?,?,?,?)').run('original','finance','paid','candidate',null,'mail:test:2',block,'p',date);
 expect(findRelatedPaymentReceipt(block,'original')).toBeUndefined();
});
it('retains the original role and rechecks its search month when reading a related proof',()=>{
 state.db.exec('ALTER TABLE memory_facts ADD COLUMN valid_from TEXT');
 state.db.prepare('INSERT INTO memory_facts VALUES(?,?,?,?,?,?,?,?,?)').run('original','finance','paid','candidate',null,'mail:test:2',block,'p','2026-07-01');
 const proof=findRelatedPaymentReceipt(block,'original');expect(proof).toBeDefined();
 const result=appendRelatedReceipt(block,proof,'2026-07-01');
 expect(result.originalInvoice).toMatchObject({kind:'invoice',invoice_date:'2026-07-01'});
 expect(result.draft).toMatchObject({kind:'receipt',date:{value:'2026-07-02'}});
 expect(()=>appendRelatedReceipt(block,proof,'2026-04-01')).toThrow('payment_related_date_outside_window');
 expect(()=>appendRelatedReceipt(block,proof)).toThrow();
});
