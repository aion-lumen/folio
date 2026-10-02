import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import Database from 'better-sqlite3';
import {readRelatedPaymentReceipt,findRelatedPaymentReceipt,appendRelatedReceipt} from './payment-related.js';
import {canonicalHash} from './reconciliation.js';
import {sha256} from '../../file-intake/document-security.js';
const state=vi.hoisted(()=>({db:null as any,subject:'Payment follow-up'}));
vi.mock('../../folio-db/init.js',()=>({getFolioDb:()=>state.db}));
vi.mock('../../feedback/reader.js',()=>({getFeedbackRowById:(id:number)=>({subject:state.subject,account_id:'test',imap_uid:id})}));
const invoice='Gemäss unserer Vereinbarung erlaube ich mir, Ihnen folgende Rechnung zu stellen:\nLeistung Steuererklärung 2024\nBetrag 120.--\nminus Digitalrabatt - 21.--\nTotal 99.--\nBitte überweisen Sie den Betrag von Fr. 99.-- innert 10 Tagen auf folgendes Konto:\nIBAN Nummer: CH00 0000 0000 0000 0000 0\nlautend auf: Sample GmbH, Basel\noder mit TWINT auf die bekannte Nummer\nBei Fragen bin ich gerne da.';
const receipt='Die Rechnung über CHF 99.– habe ich am 17.12.25 bereits beglichen';
let proof:any;
beforeEach(()=>{
 state.db=new Database(':memory:');state.subject='Payment follow-up';
 state.db.exec(`CREATE TABLE memory_facts(fact_id TEXT,domain TEXT,predicate TEXT,status TEXT,supersedes_fact_id TEXT,source_ref TEXT,source_excerpt TEXT,proposal_id TEXT);
 CREATE TABLE mail_intake_sources(feedback_id INTEGER,account TEXT,uid INTEGER,uidvalidity INTEGER,body TEXT,truncated INTEGER);
 CREATE TABLE memory_sources(source_ref TEXT,status TEXT);CREATE TABLE memory_proposals(proposal_id TEXT,status TEXT);
 INSERT INTO memory_proposals VALUES('p','candidate');`);
 state.db.exec('ALTER TABLE memory_facts ADD COLUMN valid_from TEXT');
 state.db.prepare('INSERT INTO memory_facts(fact_id,domain,predicate,status,supersedes_fact_id,source_ref,source_excerpt,proposal_id) VALUES(?,?,?,?,?,?,?,?)').run('receipt','finance','paid','candidate',null,'mail:test:2',receipt,'p');
 state.db.prepare('INSERT INTO memory_facts VALUES(?,?,?,?,?,?,?,?,?)').run('original','finance','paid','candidate',null,'mail:test:1',invoice,'p','2025-12-04');
 state.db.prepare('INSERT INTO mail_intake_sources VALUES(?,?,?,?,?,?)').run(2,'test',2,1,receipt+'\n'+invoice,0);
 proof={fact_id:'receipt',fact_sha256:canonicalHash(state.db.prepare("SELECT * FROM memory_facts WHERE fact_id='receipt'").get()),source_ref:'mail:test:2',feedback_id:2,uidvalidity:1,body_sha256:sha256(receipt+'\n'+invoice),subject_sha256:sha256(state.subject)};
});
afterEach(()=>state.db.close());
it('finds one receipt for the exact quoted original invoice',()=>{
 expect(findRelatedPaymentReceipt(invoice,'original')).toEqual(proof);
 const combined=appendRelatedReceipt(invoice,proof,'2025-12-04');expect(combined.draft?.date.value).toBe('2025-12-17');expect(combined.text).toContain(receipt);
});
it.each(['body','fact','subject','epoch','truncated','proposal','source'])('revokes a changed or withdrawn related source: %s',kind=>{
 if(kind==='body')state.db.exec("UPDATE mail_intake_sources SET body='changed'");
 if(kind==='fact')state.db.exec("UPDATE memory_facts SET status='rejected'");
 if(kind==='subject')state.subject='changed';
 if(kind==='epoch')state.db.exec('UPDATE mail_intake_sources SET uidvalidity=2');
 if(kind==='truncated')state.db.exec('UPDATE mail_intake_sources SET truncated=1');
 if(kind==='proposal')state.db.exec("UPDATE memory_proposals SET status='rejected'");
 if(kind==='source')state.db.exec("INSERT INTO memory_sources VALUES('mail:test:2','tombstoned')");
 expect(()=>readRelatedPaymentReceipt(proof,invoice,'2025-12-04')).toThrow();
});
it('cannot join an invoice with a different account, service, or amount',()=>{
 for(const changed of [invoice.replace('CH00','CH01'),invoice.replace('Steuererklärung 2024','Steuererklärung 2025'),invoice.replaceAll('99.--','89.--')])expect(()=>readRelatedPaymentReceipt(proof,changed,'2025-12-04')).toThrow();
});
it('does not pick between competing dated payment receipts',()=>{
 state.db.prepare('INSERT INTO memory_facts(fact_id,domain,predicate,status,supersedes_fact_id,source_ref,source_excerpt,proposal_id) VALUES(?,?,?,?,?,?,?,?)').run('other','finance','paid','candidate',null,'mail:test:3',receipt,'p');
 state.db.prepare('INSERT INTO mail_intake_sources VALUES(?,?,?,?,?,?)').run(3,'test',3,1,receipt+'\n'+invoice,0);
 expect(findRelatedPaymentReceipt(invoice,'original')).toBeUndefined();
});
