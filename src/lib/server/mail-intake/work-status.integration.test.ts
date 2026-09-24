import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const mocks=vi.hoisted(()=>({rows:new Map<number,any>(),attachments:true,votes:[] as any[],tracker:{positions:[] as any[],rejected:[] as any[]}}));
vi.mock('../modules/index.js',()=>({hasModuleCapability:()=>true}));
vi.mock('../feedback/reader.js',()=>({getFeedbackRowById:(id:number)=>mocks.rows.get(id)??null}));
vi.mock('../folio-db/reader.js',()=>({getValidatorOpinionsMap:()=>new Map([[1,mocks.votes]])}));
vi.mock('../regelwerk/loader.js',()=>({loadRegelwerk:()=>({voice_consensus:{voices:['a','b','c'].map(lm_studio_model=>({role:'control_llm',lm_studio_model}))}})}));
vi.mock('../career/carta-tracker.js',()=>({readCartaTracker:()=>mocks.tracker}));
vi.mock('./attachments.js',()=>({attachmentSummary:()=>({check:mocks.attachments?{status:'checked',deferred:0,parts:0}:null,items:[]})}));
vi.mock('./mailbox-source.js',()=>({mailSourceEligibilitySnapshot:()=>()=>true}));
import {completeLocalMails,mailWorkContext} from './work-status.js';
import {db,save} from './state.js';
import {resetFolioDbForTests} from '../folio-db/init.js';
let root:string;
beforeEach(()=>{
 root=mkdtempSync(join(tmpdir(),'folio-completion-test-'));vi.stubEnv('FOLIO_DB_PATH',join(root,'folio.db'));mocks.attachments=true;
 mocks.rows=new Map([[1,{id:1,account_id:'test',imap_uid:7,mail_date:'2026-09-01',sender:'test@example.com',subject:'Newsletter'}]]);
 mocks.votes=['a','b','c'].map((validator_model,id)=>({id,validator_model,account_id:'test',imap_uid:7,validator_domain:'werbung',validator_actionability:'archive',evaluated_at:'2026-09-02'}));
 db().exec('CREATE TABLE mail_attachment_checks (feedback_id INTEGER PRIMARY KEY,value TEXT NOT NULL)');
 const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
 db().prepare('INSERT INTO mail_attachment_checks VALUES (?,?)').run(1,JSON.stringify({body_sha256:digest('Original'),header_sha256:digest(JSON.stringify(['test@example.com','Newsletter'])),status:'checked',parts:0,deferred:0}));
 db().prepare('INSERT INTO mail_intake_sources VALUES (?,?,?,?,?,?)').run(1,'test',7,1,'Original',0);
 save({id:'one',account:'test',state:'completed',phase:'memory',items:[{id:1,stage:'done',outcome:'no_durable_fact'}],attempts:0,started_at:'2026-09-02'});
});
afterEach(()=>{resetFolioDbForTests();vi.unstubAllEnvs();rmSync(root,{recursive:true,force:true});});
it('records idempotent, evidence-bound completion without impersonating a human review',()=>{
 expect(completeLocalMails([1],'owner:test')[0].status).toBe('completed');
 expect(completeLocalMails([1],'owner:test')[0].status).toBe('already_completed');
 expect(mailWorkContext().status(mocks.rows.get(1)).state).toBe('automatic');
 expect(db().prepare('SELECT COUNT(*) n FROM review_state').get()).toEqual({n:0});
 db().prepare('UPDATE mail_intake_sources SET body=? WHERE feedback_id=1').run('Changed');
 expect(mailWorkContext().status(mocks.rows.get(1)).state).not.toBe('automatic');
});
it('reopens work when attachment proof or model votes change',()=>{
 completeLocalMails([1],'owner:test');const check=(db().prepare('SELECT value FROM mail_attachment_checks WHERE feedback_id=1').get() as {value:string}).value;db().prepare('UPDATE mail_attachment_checks SET value=?').run(JSON.stringify({...JSON.parse(check),status:'unavailable'}));mocks.attachments=false;
 expect(mailWorkContext().status(mocks.rows.get(1)).state).toBe('technical');
 expect(completeLocalMails([1],'owner:test')[0].reason).toBe('attachments_incomplete');
 mocks.attachments=true;db().prepare('UPDATE mail_attachment_checks SET value=?').run(check);mocks.votes[0].validator_actionability='actionable';
 expect(mailWorkContext().status(mocks.rows.get(1)).state).not.toBe('automatic');
});
it('does not hide a later open Memory proposal behind an older completion',()=>{
 completeLocalMails([1],'owner:test');
 db().prepare("INSERT INTO memory_proposals(proposal_id,domain,source_kind,source_ref,status,extractor_id,created_at) VALUES ('p','finance','mail','mail:test:7','candidate','fixture','2026-09-03')").run();
 expect(mailWorkContext().status(mocks.rows.get(1)).state).toBe('technical');
 expect(completeLocalMails([1],'owner:test')[0].reason).toBe('pending_memory');
});
it('preserves a human action override',()=>{
 db().prepare("INSERT INTO corrections(feedback_id,imap_uid,previous_action,corrected_action,corrected_actionability,source,corrected_at) VALUES (1,7,'archive','actionable','actionable','human','2026-09-03')").run();
 expect(completeLocalMails([1],'owner:test')[0].reason).toBe('human_instruction');
});
