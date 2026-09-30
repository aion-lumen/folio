import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync } from 'node:fs';import { tmpdir } from 'node:os';import { join } from 'node:path';
const m=vi.hoisted(()=>({proposalStatus:'confirmed',root:'',enabled:true,busy:false,applied:vi.fn(),authorize:vi.fn(),review:vi.fn(),payment:vi.fn(),files:[] as any[],importConfig:null as any,preview:vi.fn()}));
vi.mock('../env.js',()=>({getFolioDbPath:()=>join(m.root,'folio.db'),isDemoVaultActive:()=>false}));
vi.mock('../mail-intake/state.js',()=>({config:()=>({enabled:m.enabled}),modelActivities:()=>m.busy?[{}]:[],runs:()=>[]}));
vi.mock('../mail-intake/model-session.js',()=>({withMailModel:async(_r:any,f:any)=>f()}));
vi.mock('../modules/ledger-books/manual-import.js',()=>({manualImportRoot:()=>join(m.root,'statements'),readManualStatementImport:()=>({files:m.files}),statementImportConfig:()=>m.importConfig,previewManualStatement:m.preview}));
vi.mock('../modules/ledger-books/finance-run-state.js',()=>({financeWorkerActive:()=>false}));
vi.mock('../modules/ledger-books/payment-agent.js',()=>({runPaymentAgent:m.payment}));
vi.mock('./metadata-repair.js',()=>({receiptDateRepair:()=>({snapshotHash:'bound'}),applyReceiptDateRepair:m.applied}));
vi.mock('./store.js',()=>({getMemoryProposalBundle:()=>({proposal:{status:m.proposalStatus}})}));
vi.mock('./delegated-review.js',()=>({authorizeMailMemoryReview:m.authorize,reviewDelegatedMailMemory:m.review}));
vi.mock('../modules/ledger-books/reconciliation.js',()=>({canonicalHash:(v:unknown)=>JSON.stringify(v)}));
import { configureMemoryWork,tickMemoryWork,memoryWorkStatus,pauseMemoryWork,resumeMemoryWork,enableCareerMemoryWork,enableMemoryRetention } from './work-runtime.js';
vi.mock('./career-confirmation.js',()=>({reconcileCareerMemory:vi.fn()}));
beforeEach(()=>{m.proposalStatus='confirmed';m.root=mkdtempSync(join(tmpdir(),'memory-runtime-'));m.enabled=true;m.busy=false;m.files=[];m.importConfig=null;m.preview.mockResolvedValue({status:'staged_unbooked',reason_code:'ok'});m.applied.mockReturnValue(7);m.authorize.mockReturnValue({grant_id:'grant'});m.review.mockResolvedValue({verdict:'accept'});m.payment.mockResolvedValue({attempted_fact_ids:['fact'],recorded:1,skipped:{budget:0}});});
afterEach(()=>{rmSync(m.root,{recursive:true,force:true});vi.clearAllMocks();});
it('performs a bound repair once, retaining its independent grant on restart/retry',async()=>{
 configureMemoryWork('owner','request',['p']);await tickMemoryWork();await tickMemoryWork();expect(m.applied).toHaveBeenCalledTimes(1);expect(m.review).toHaveBeenCalledTimes(1);expect(memoryWorkStatus().repairs.p.status).toBe('completed');
});
it('defers during other model work and respects pause',async()=>{
 configureMemoryWork('owner','request',['p']);m.busy=true;await tickMemoryWork();expect(m.applied).not.toHaveBeenCalled();m.busy=false;pauseMemoryWork();await tickMemoryWork();expect(m.applied).not.toHaveBeenCalled();
});
it('reuses its existing grant after a failed review without repairing twice',async()=>{
 configureMemoryWork('owner','request',['p']);m.review.mockRejectedValueOnce(new Error('unavailable'));await tickMemoryWork();expect(memoryWorkStatus().repairs.p.status).toBe('retry');await tickMemoryWork();expect(m.applied).toHaveBeenCalledTimes(1);expect(m.review).toHaveBeenCalledTimes(2);expect(memoryWorkStatus().repairs.p.status).toBe('completed');
});
it('checks new complete months only, ignores duplicate sources and does not replay a finished batch',async()=>{
 configureMemoryWork('owner','request',[]);mkdirSync(join(m.root,'statements'));
 const source={account_ref:'A',source_sha256:'hash',declared_period:{from:'2026-09-01',to:'2026-09-30'},control_result:{complete:true}};
 const write=(sources:any[])=>{const b={sources,entries:[],issues:[]};writeFileSync(join(m.root,'statements','statement-batch.json'),JSON.stringify({...b,schema:'ledger/manual-statement-batch/v0',bookkeeping:{ledger_db_touched:false},batch_sha256:JSON.stringify(b)}));};
 write([{...source,declared_period:{from:'2026-09-01',to:'2026-09-20'}}]);await tickMemoryWork();expect(m.payment).not.toHaveBeenCalled();
 write([source]);await tickMemoryWork();await tickMemoryWork();write([source,source]);await tickMemoryWork();expect(m.payment).toHaveBeenCalledTimes(1);expect(memoryWorkStatus().monthly?.recorded).toBe(1);
});

it('imports only new statements under the configured account and profile, once',async()=>{
 m.importConfig={roots:[{id:'known-root'}]};m.files=[{id:'old',sha256:'old',accounts:[{ref:'A',profiles:['format']}]}];configureMemoryWork('owner','request',[]);
 m.files.push({id:'new',sha256:'new-hash',accounts:[{ref:'A',profiles:['format']}]});await tickMemoryWork();await tickMemoryWork();expect(m.preview).toHaveBeenCalledTimes(1);expect(m.preview).toHaveBeenCalledWith('new','new-hash','A','format',true);
});
it('does not import after the configured scope changes or with an ambiguous account',async()=>{
 m.importConfig={roots:[{id:'known-root'}]};configureMemoryWork('owner','request',[]);m.files=[{id:'new',accounts:[{ref:'A',profiles:['format']},{ref:'B',profiles:['format']}]}];await tickMemoryWork();expect(m.preview).not.toHaveBeenCalled();expect(memoryWorkStatus().statements?.new.status).toBe('blocked');
 m.importConfig={roots:[{id:'different-root'}]};m.files=[{id:'new2',accounts:[{ref:'A',profiles:['format']}]}];await tickMemoryWork();expect(m.preview).not.toHaveBeenCalled();
});

it('resumes a paused setup without repeating completed repairs and requires unchanged account setup',async()=>{
 configureMemoryWork('owner','request',['p']);await tickMemoryWork();pauseMemoryWork();resumeMemoryWork();await tickMemoryWork();expect(m.applied).toHaveBeenCalledTimes(1);pauseMemoryWork();m.importConfig={roots:[{id:'changed'}]};expect(()=>resumeMemoryWork()).toThrow('memory_work_setup_required');
});

import { reconcileCareerMemory } from './career-confirmation.js';
it('requires opt-in for tracker matching, can run without a model and respects pause',async()=>{
 configureMemoryWork('owner','request',[]);await tickMemoryWork();expect(reconcileCareerMemory).not.toHaveBeenCalled();
 enableCareerMemoryWork('owner requested exact rejection matching');m.busy=true;await tickMemoryWork();expect(reconcileCareerMemory).toHaveBeenCalledOnce();
 pauseMemoryWork();await tickMemoryWork();expect(reconcileCareerMemory).toHaveBeenCalledOnce();
});

vi.mock('./retention.js',()=>({reconcileMemoryRetention:vi.fn()}));
import { reconcileMemoryRetention } from './retention.js';
it('runs relevance routing only after opt-in and stops when paused',async()=>{
 configureMemoryWork('owner','request',[]);await tickMemoryWork();expect(reconcileMemoryRetention).not.toHaveBeenCalled();
 enableMemoryRetention('owner cleanup');m.busy=true;await tickMemoryWork();expect(reconcileMemoryRetention).toHaveBeenCalledWith('owner cleanup');
 pauseMemoryWork();await tickMemoryWork();expect(reconcileMemoryRetention).toHaveBeenCalledOnce();
});

vi.mock('./application-evidence.js',()=>({reconcileApplicationEvidence:vi.fn()}));
import { reconcileApplicationEvidence } from './application-evidence.js';
import { enableApplicationEvidence } from './work-runtime.js';
it('reconciles document and mail evidence only after opt-in and stops on pause',async()=>{
 configureMemoryWork('owner','request',[]);await tickMemoryWork();expect(reconcileApplicationEvidence).not.toHaveBeenCalled();
 enableApplicationEvidence('owner application matching');m.busy=true;await tickMemoryWork();expect(reconcileApplicationEvidence).toHaveBeenCalledWith('owner application matching');
 pauseMemoryWork();await tickMemoryWork();expect(reconcileApplicationEvidence).toHaveBeenCalledOnce();
});

it('keeps an accepted but owner-restored repair in the decision count, including resumed grants',async()=>{
 configureMemoryWork('owner','request',['p']);
 m.review.mockRejectedValueOnce(new Error('interrupted'));await tickMemoryWork();
 m.proposalStatus='candidate';await tickMemoryWork();
 expect(memoryWorkStatus().repairs.p).toMatchObject({status:'needs_review',grantId:'grant'});
 expect(m.applied).toHaveBeenCalledTimes(1);
 await tickMemoryWork();expect(m.review).toHaveBeenCalledTimes(2);
});
