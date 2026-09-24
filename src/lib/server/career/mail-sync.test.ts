vi.mock('../mail-intake/work-status.js',()=>({completeLocalMails:()=>[]}));
import { beforeEach,afterEach,describe,it,expect,vi } from 'vitest';
import { mkdtempSync,rmSync,readFileSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const mocks=vi.hoisted(()=>({classify:vi.fn(),store:()=>null as unknown,allowed:true,eligible:true}));
vi.mock('./rejection-reconcile.js',async original=>({...await original<object>(),reconcileRecentRejections:mocks.classify}));
vi.mock('./rejection-approval.js',async original=>({...await original<object>(),rejectionApprovals:()=>mocks.store()}));
vi.mock('../modules/index.js',()=>({hasModuleCapability:()=>mocks.allowed}));
vi.mock('../feedback/reader.js',()=>({getFeedbackRowById:(id:number)=>({id,account_id:'gmail'})}));
vi.mock('../mail-intake/mailbox-source.js',()=>({automaticMemorySourceEligibility:()=>({eligible:mocks.eligible})}));
import { RejectionApprovalStore } from './rejection-approval.js';
import { parseCartaTrackerSource } from './carta-tracker.js';
import { assertCareerMailAuthorization,syncIntakeRejections,readCareerMailSync } from './mail-sync.js';
import { configure,save,type IntakeRun } from '../mail-intake/state.js';
import { resetFolioDbForTests } from '../folio-db/init.js';
import type { LocalCandidate } from './rejection-reconcile.js';
let root:string,path:string,run:IntakeRun;
beforeEach(()=>{
 root=mkdtempSync(join(tmpdir(),'folio-career-sync-'));vi.stubEnv('FOLIO_DB_PATH',join(root,'folio.db'));vi.clearAllMocks();mocks.allowed=true;mocks.eligible=true;
 path=join(root,'tracker.html');writeFileSync(path,'const DATA=[{"company":"Example","title":"Analyst","url":"https://jobs.example/123456","status":"applied","submitted_at":"2026-09-01"}];\nconst REJECTED=[];');
 mocks.store=()=>new RejectionApprovalStore(path,join(root,'approvals'),'test',()=>[{feedbackId:1,capturedBodyHash:'body',modelInputHash:'input'} as LocalCandidate]);
 run={id:'test-run',account:'gmail',state:'running',phase:'career',items:[],attempts:0,started_at:new Date().toISOString()};save(run);
 mocks.classify.mockImplementation(async()=>{
  const snapshot=parseCartaTrackerSource(readFileSync(path,'utf8')),row=snapshot.positions[0];
  return {window:{fromInclusive:'2026-09-01',toExclusive:'2026-10-01',timezone:'Europe/Zurich'},tracker:{sourceHash:snapshot.sourceHash},findings:[{feedbackId:1,eventType:'rejection',status:row.action==='rejected'?'NO_CHANGE':'EXACT_PROPOSAL',proposedEvent:'APPLICATION_REJECTED',positionIdentity:row.identity,positionHash:row.rawHash,mailTime:'2026-09-23T12:00:00Z',sourceHash:'body',modelInputHash:'input'}]};
 });
});
afterEach(()=>{resetFolioDbForTests();vi.unstubAllEnvs();rmSync(root,{recursive:true,force:true});});
describe('authorized hourly career sync',()=>{
 it('requires an explicit career scope and respects revocation and module kill switches',()=>{
  const old=configure(true,'owner:test','mail only');expect(()=>assertCareerMailAuthorization(old)).toThrow('career_sync_not_authorized');
  const current=configure(true,'owner:test','exact rejection sync',10,{career_rejections:true});expect(()=>assertCareerMailAuthorization(current)).not.toThrow();
  mocks.allowed=false;expect(()=>assertCareerMailAuthorization(current)).toThrow('career_module_unavailable');mocks.allowed=true;
  configure(false,'owner:test','paused');expect(()=>assertCareerMailAuthorization(current)).toThrow('career_sync_not_authorized');
 });
 it('writes a verified exact event once and persists a resumable receipt',async()=>{
  const c=configure(true,'owner:test','exact rejection sync',10,{career_rejections:true});
  expect((await syncIntakeRejections(run,c,'local-model')).applied).toBe(1);
  const after=readFileSync(path,'utf8');expect(parseCartaTrackerSource(after).positions[0].action).toBe('rejected');
  await syncIntakeRejections(run,c,'local-model');expect(readFileSync(path,'utf8')).toBe(after);expect(readCareerMailSync()?.state).toBe('completed');expect(mocks.classify).toHaveBeenCalledTimes(2);
 });
 it('does not write if authorization is paused while the model is working',async()=>{
  const c=configure(true,'owner:test','exact rejection sync',10,{career_rejections:true}),before=readFileSync(path,'utf8');
  mocks.classify.mockImplementationOnce(async()=>{configure(false,'owner:test','paused');return {findings:[]};});
  await expect(syncIntakeRejections(run,c,'local-model')).rejects.toThrow('career_sync_not_authorized');expect(readFileSync(path,'utf8')).toBe(before);expect(readCareerMailSync()?.state).toBe('failed');
 });
 it('never automatically writes matches found only in spam or trash',async()=>{
  mocks.eligible=false;const c=configure(true,'owner:test','exact rejection sync',10,{career_rejections:true}),before=readFileSync(path,'utf8');
  expect((await syncIntakeRejections(run,c,'local-model')).applied).toBe(0);expect(readFileSync(path,'utf8')).toBe(before);
 });
});
