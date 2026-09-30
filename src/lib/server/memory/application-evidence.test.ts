import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const mock=vi.hoisted(()=>({tracker:null as any,mails:[] as any[],result:null as any,vault:''}));
vi.mock('../career/carta-tracker.js',()=>({readCartaTracker:()=>mock.tracker}));
vi.mock('../feedback/reader.js',()=>({getFeedbackRowsByMailDate:()=>mock.mails}));
vi.mock('./document-origin.js',()=>({readReorgPilotResult:()=>mock.result}));
vi.mock('../env.js',async original=>({...await original() as any,getVaultPath:()=>mock.vault,isDemoVaultActive:()=>false}));
import { db as mailDb } from '../mail-intake/state.js';
import { resetFolioDbForTests,getFolioDb } from '../folio-db/init.js';
import { proposeMemoryBundle,getMemoryReviewSnapshot } from './store.js';
import { upsertMemorySourceCandidate } from './sources.js';
import { applicationEvidencePlan,confirmApplicationEvidence,reconcileApplicationEvidence,matchApplicationEvidence,listApplicationEvidence,APPLICATION_EVIDENCE_POLICY } from './application-evidence.js';
const role='Experienced Data & AI Consultant',company='Example Consulting';
const text=`Alex Beispiel\nalex@example.test\n${company} AG\nBasel, 2 June 2026\nApplication\n${role}\nDear Hiring Team\nI would like to apply.`;
const body=`Dear Alex, Thank you for your interest in joining us at ${company}. After careful consideration, we have decided to move forward with candidates for ${role} whose CV is closer to our requirements.`;
const mail={id:7,ref:'mail:test:42',sender:'hiring@example.test',to:'alex@example.test',subject:'Regarding your application',body,date:'2026-06-07T10:00:00Z',truncated:false};
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
let root:string;
beforeEach(()=>{
 root=mkdtempSync(join(tmpdir(),'application-evidence-'));mock.vault=join(root,'vault');mkdirSync(mock.vault);vi.stubEnv('FOLIO_DB_PATH',join(root,'folio.db'));resetFolioDbForTests();
 mock.tracker={sourceHash:'tracker',positions:[],rejected:[{employer:company,title:role,date:'07.06.26',identity:'history:1',rawHash:'row'}]};
 mock.mails=[{id:7,account_id:'test',imap_uid:42,sender:mail.sender,to_addr:mail.to,subject:mail.subject,mail_date:mail.date}];mock.result=null;
});
afterEach(()=>{resetFolioDbForTests();vi.unstubAllEnvs();rmSync(root,{recursive:true,force:true});});
function fixture(html=false){
 const raw=html?`<title>Cover letter</title><style>CSS</style><p>${text.replaceAll('\n','</p><p>')}</p>`:text;
 const digest=sha(raw),ref=`file:${digest}`,excerpt=html?'<title>Cover letter</title>':'Application\n'+role;
 const b=proposeMemoryBundle({domain:'career',source_kind:'file',source_ref:ref,extractor_id:'legacy',actor_id:'import',entities:[],facts:[],relations:[],
  episodes:[{episode_type:'application',title:'Alex Beispiel',summary:'created: cover letter dated 2026-06-05 for Example Consulting position',occurred_at:'2026-06-05T00:00:00Z',sensitivity:'private',source_excerpt:excerpt}]});
 upsertMemorySourceCandidate({source_kind:'file',source_ref:ref,title:'cover'+(html?'.html':'.docx'),relative_path:'old/cover'+(html?'.html':'.docx'),content_hash:digest,primary_domain:'career',sensitivity:'private',origin_run_id:'run',origin_document_id:'doc',reviewed_by:'owner'});
 mock.result={documents:[{document_id:'doc',source_ref:ref,sha256:digest,review_extract:{text:html?'<title>Cover letter</title>':raw,truncated:html}}]};
 if(html){mkdirSync(join(mock.vault,'archive'));writeFileSync(join(mock.vault,'archive','cover.html'),raw);}
 mailDb().prepare('INSERT INTO mail_intake_sources VALUES(7,\'test\',42,1,?,0)').run(body);
 return b.proposal.proposal_id;
}
it('reconciles document evidence, preserves originals in the system audit and is idempotent',()=>{
 const id=fixture(),p=applicationEvidencePlan(id)!;expect(p.proof.document_date).toBe('2026-06-02');
 const done=confirmApplicationEvidence(id,p.digest,'owner requested evidence matching');
 expect(done.proposal).toMatchObject({status:'confirmed',reviewed_by:APPLICATION_EVIDENCE_POLICY});
 expect(done.episodes[0]).toMatchObject({episode_type:'application_evidence_received',occurred_at:mail.date,title:`${role} · ${company}`});
 expect(done.episodes[0].source_excerpt).toBe('Application\n'+role);
 expect(done.episodes[0].summary).not.toContain('Absage');
 const audit=getFolioDb().prepare("SELECT detail_json,actor_kind FROM memory_ledger WHERE object_kind='proposal' AND event_type='confirmed'").get() as any;
 expect(audit.actor_kind).toBe('system');expect(JSON.parse(audit.detail_json).before.bundle.episodes[0].occurred_at).toBe('2026-06-05T00:00:00Z');
 expect(listApplicationEvidence()[0].mails[0].ref).toBe(mail.ref);
 expect(reconcileApplicationEvidence('owner')).toBe(0);
});
it('recovers an incomplete HTML capture only from a file with the same content hash',()=>{
 const id=fixture(true);expect(applicationEvidencePlan(id)).not.toBeNull();
 writeFileSync(join(mock.vault,'archive','cover.html'),'different');expect(applicationEvidencePlan(id)).toBeNull();
});
it.each(['recipient','role','mail role','employer','date','truncated','forwarded','hypothetical','newsletter','other application','two dates','missing date'])( 'keeps %s unresolved',(change)=>{
 let doc=text;const m={...mail};
 if(change==='recipient')m.to='other@example.test';
 if(change==='mail role')m.body=m.body.replace(role,role+' Team Lead');
 if(change==='role')doc=doc.replace(role,'Experienced Data Engineer');
 if(change==='employer')doc=doc.replace(company,'Another Consulting');
 if(change==='date')m.date='2026-06-08T10:00:00Z';
 if(change==='truncated')m.truncated=true;
 if(change==='forwarded')m.subject='Fwd: '+m.subject;
 if(change==='hypothetical')m.body='If your application succeeds: '+body;
 if(change==='newsletter')m.body=`New job: ${role} at ${company}. Please apply now!`;
 if(change==='other application')mock.tracker.rejected.push({...mock.tracker.rejected[0],identity:'history:2'});
 if(change==='two dates')doc+='\n03.06.2026';
 if(change==='missing date')doc=doc.replace('2 June 2026','June 2026');
 expect(matchApplicationEvidence({text:doc},mock.tracker,[m])).toBeNull();
});
it('accepts an exact applied tracker position with a direct acknowledgement, without requiring a rejection',()=>{
 mock.tracker.rejected=[];mock.tracker.positions=[{company,title:role,status:'applied',submitted_at:'2026-06-05',identity:'listing:1',rawHash:'row'}];
 const m={...mail,date:'2026-06-05T10:00:00Z',subject:`Your application for ${role}`,body:`Dear Alex, Thank you for your application to ${company}.`};
 expect(matchApplicationEvidence({text},mock.tracker,[m])?.basis).toBe('tracker_application_and_mail');
});
it.each(['mail','tracker','snapshot','withdrawn source','mail identity','extra object','episode link','authorization'])( 'rechecks %s before writes',(change)=>{
 const id=fixture(),p=applicationEvidencePlan(id)!;const db=getFolioDb();
 if(change==='mail')db.prepare("UPDATE mail_intake_sources SET body='changed'").run();
 if(change==='tracker')mock.tracker.sourceHash='changed';
 if(change==='snapshot')db.prepare("UPDATE memory_episodes SET title='changed' WHERE proposal_id=?").run(id);
 if(change==='withdrawn source')db.prepare("UPDATE memory_sources SET status='rejected'").run();
 if(change==='mail identity')mock.mails[0].imap_uid=43;
 if(change==='extra object')db.prepare("UPDATE memory_episodes SET status='rejected' WHERE proposal_id=?").run(id);
 if(change==='episode link')mock.result.documents[0].sha256='different';
 expect(()=>confirmApplicationEvidence(id,p.digest,change==='authorization'?'':'owner')).toThrow();
 expect(getMemoryReviewSnapshot(id).bundle.proposal.status).toBe('candidate');
});
it('uses the explicit dated letter rather than filesystem time for German applications',()=>{
 mock.tracker.rejected=[{employer:'Musterbank',title:'DevOps Engineer SAP BW',date:'04.09.25',identity:'r',rawHash:'r'}];
 const doc='Alex Beispiel\nalex@example.test\nMusterbank\nBasel, 28.08.2025\nBewerbung als DevOps Engineer SAP BW\nSehr geehrte Damen und Herren';
 const m={...mail,date:'2025-09-04T15:30:00+02:00',subject:'Deine Bewerbung als DevOps Engineer SAP BW (w/m/d)',body:'Vielen Dank, dass du dich bei der Musterbank beworben hast. Wir haben alle Bewerbungen für die Stelle DevOps Engineer SAP BW (w/m/d) geprüft.'};
 expect(matchApplicationEvidence({text:doc},mock.tracker,[m])?.document_date).toBe('2025-08-28');
});
