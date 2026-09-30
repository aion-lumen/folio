import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const mocks=vi.hoisted(()=>({rows:new Map<string,any>()}));
vi.mock('../feedback/reader.js',()=>({getFeedbackRowsByMailRef:(ref:string)=>mocks.rows.has(ref)?[mocks.rows.get(ref)]:[]}));
import {resetFolioDbForTests,getFolioDb} from '../folio-db/init.js';
import {db as intakeDb} from '../mail-intake/state.js';
import {proposeMemoryBundle,getMemoryProposalBundle} from './store.js';
import {careerDuplicatePlans,reconcileCareerDuplicates,listCareerDuplicateImports} from './career-duplicates.js';
let root:string;
beforeEach(()=>{root=mkdtempSync(join(tmpdir(),'memory-duplicate-'));vi.stubEnv('FOLIO_DB_PATH',join(root,'folio.db'));resetFolioDbForTests();mocks.rows.clear();});
afterEach(()=>{resetFolioDbForTests();vi.unstubAllEnvs();rmSync(root,{recursive:true,force:true});});
function pair(){
 const make=(account:string,id:number)=>{
  const ref=`mail:${account}:${id}`;
  mocks.rows.set(ref,{id,account_id:account,imap_uid:id,body_hash:'same-body-hash',sender:'example@example.test',subject:'Absage',mail_date:'2026-09-22T12:00:00Z'});
  return proposeMemoryBundle({domain:'career',source_kind:'mail',source_ref:ref,extractor_id:'test',actor_id:'test',entities:[{local_ref:'app',entity_type:'application',canonical_key:'career:application:test',canonical_label:'Test application',sensitivity:'private'}],facts:[{subject:'Test application',subject_ref:'app',predicate:'has_application_status',value:'rejected',data_class:'application',sensitivity:'private',source_excerpt:'Absage'}],episodes:[{episode_type:'application_status',title:'rejected',summary:'Absage',occurred_at:'2026-09-22',sensitivity:'private',entity_refs:[{ref:'app',role:'subject'}]}]});
 };
 const old=make('test',1),current=make('test-history',2);
 intakeDb().prepare("INSERT INTO mail_intake_sources VALUES(2,'test-history',2,1,'Absage',0)").run();
 return {old,current};
}
it('merges an exact legacy import into its complete copy, without confirming the case',()=>{
 const {old,current}=pair();expect(careerDuplicatePlans()).toHaveLength(1);
 expect(reconcileCareerDuplicates('owner request')).toBe(1);
 expect(getMemoryProposalBundle(old.proposal.proposal_id).proposal).toMatchObject({status:'rejected',reviewed_by:'career-duplicate-import/v1'});
 expect(getMemoryProposalBundle(current.proposal.proposal_id).proposal.status).toBe('candidate');
 const audit=getFolioDb().prepare("SELECT detail_json FROM memory_ledger WHERE event_type='duplicate_import'").get() as any;
 expect(JSON.parse(audit.detail_json).canonical).toBe(current.proposal.proposal_id);
 expect(JSON.parse(audit.detail_json).before.bundle.facts).toHaveLength(1);
 expect(reconcileCareerDuplicates('owner request')).toBe(0);
 expect(listCareerDuplicateImports()).toEqual([expect.objectContaining({proposal_id:old.proposal.proposal_id,canonical_id:current.proposal.proposal_id,title:'Test application',source_ref:'mail:test:1',canonical_source:'mail:test-history:2',canonical_status:'candidate'})]);
});
it.each(['hash','time','account','claim','links','human decision','truncated'])('preserves imports with different %s',reason=>{
 const {old}=pair(),row=mocks.rows.get('mail:test:1'),db=getFolioDb();
 if(reason==='hash')row.body_hash='different';if(reason==='time')row.mail_date='2026-09-23T12:00:00Z';if(reason==='account')row.account_id='other';
 if(reason==='claim')db.prepare("UPDATE memory_facts SET source_excerpt='different' WHERE proposal_id=?").run(old.proposal.proposal_id);
 if(reason==='links')db.prepare("UPDATE memory_episode_entities SET role='organization' WHERE episode_id=?").run(old.episodes[0].episode_id);
 if(reason==='human decision')db.prepare("UPDATE memory_facts SET status='confirmed' WHERE proposal_id=?").run(old.proposal.proposal_id);
 if(reason==='truncated')db.prepare('UPDATE mail_intake_sources SET truncated=1').run();
 expect(reconcileCareerDuplicates('owner request')).toBe(0);
});
