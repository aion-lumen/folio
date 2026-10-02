vi.mock('./store.js',()=>({getMemoryProposalBundle:()=>({proposal:{status:m.proposalStatus}})}));
vi.mock('../folio-db/init.js',()=>({getFolioDb:()=>({prepare:()=>({all:()=>[]})})}));
vi.mock('../file-intake/signature-maintenance.js',()=>({maintainDocumentSignatures:vi.fn().mockResolvedValue(true)}));
vi.mock('../modules/ledger-books/statement-jobs.js',()=>({tickStatementJob:vi.fn()}));
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync } from 'node:fs';import { tmpdir } from 'node:os';import { join } from 'node:path';
const m=vi.hoisted(()=>({proposalStatus:'confirmed',root:'',enabled:true,busy:false,applied:vi.fn(),authorize:vi.fn(),review:vi.fn(),payment:vi.fn(),files:[] as any[],importConfig:null as any,inventoryError:null as string|null, warnings:[] as string[],preview:vi.fn()}));
vi.mock('../env.js',()=>({getFolioDbPath:()=>join(m.root,'folio.db'),isDemoVaultActive:()=>false}));
vi.mock('../mail-intake/state.js',()=>({config:()=>({enabled:m.enabled}),modelActivities:()=>m.busy?[{}]:[],runs:()=>[]}));
vi.mock('../mail-intake/model-session.js',()=>({withMailModel:async(_r:any,f:any)=>f()}));
vi.mock('../modules/ledger-books/manual-import.js',()=>({manualImportRoot:()=>join(m.root,'statements'),readManualStatementImport:()=>({files:m.files,error:m.inventoryError,warnings:m.warnings}),statementImportConfig:()=>m.importConfig,previewManualStatement:m.preview}));
vi.mock('../modules/ledger-books/finance-run-state.js',()=>({financeWorkerActive:()=>false}));
vi.mock('../modules/ledger-books/payment-agent.js',()=>({runPaymentAgent:m.payment}));
vi.mock('./metadata-repair.js',()=>({receiptDateRepair:()=>({snapshotHash:'bound'}),applyReceiptDateRepair:m.applied}));
vi.mock('./delegated-review.js',()=>({authorizeMailMemoryReview:m.authorize,reviewDelegatedMailMemory:m.review}));
vi.mock('../modules/ledger-books/reconciliation.js',()=>({canonicalHash:(v:unknown)=>JSON.stringify(v)}));
import { configureMemoryWork,tickMemoryWork,memoryWorkStatus,pauseMemoryWork,resumeMemoryWork,enableCareerMemoryWork,enableMemoryRetention,setMonthlyPaymentAutomation,monthlyPaymentAutomation } from './work-runtime.js';
vi.mock('./career-confirmation.js',()=>({reconcileCareerMemory:vi.fn()}));
beforeEach(()=>{m.inventoryError=null;m.warnings=[];m.proposalStatus='confirmed';m.root=mkdtempSync(join(tmpdir(),'memory-runtime-'));m.enabled=true;m.busy=false;m.files=[];m.importConfig=null;m.preview.mockResolvedValue({status:'staged_unbooked',reason_code:'ok'});m.applied.mockReturnValue(7);m.authorize.mockReturnValue({grant_id:'grant'});m.review.mockResolvedValue({verdict:'accept'});m.payment.mockResolvedValue({attempted_fact_ids:['fact'],recorded:1,skipped:{budget:0}});});
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
 m.importConfig={roots:[{id:'bank',accounts:[{ref:'A'}]}]};configureMemoryWork('owner','request',[]);mkdirSync(join(m.root,'statements'));
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

it('drains both banks before starting any monthly model review',async()=>{
 m.importConfig={roots:[{id:'both-banks'}]};configureMemoryWork('owner','request',[]);
 m.files=[{id:'a',sha256:'one',accounts:[{ref:'A',profiles:['format']}]},{id:'b',sha256:'two',accounts:[{ref:'B',profiles:['format']}]}];
 const source={account_ref:'A',source_sha256:'hash',declared_period:{from:'2026-09-01',to:'2026-09-30'},control_result:{complete:true}};
 mkdirSync(join(m.root,'statements'));const b={sources:[source],entries:[],issues:[]};writeFileSync(join(m.root,'statements','statement-batch.json'),JSON.stringify({...b,schema:'ledger/manual-statement-batch/v0',bookkeeping:{ledger_db_touched:false},batch_sha256:JSON.stringify(b)}));
 await tickMemoryWork();expect(m.preview).toHaveBeenCalledTimes(1);expect(m.payment).not.toHaveBeenCalled();
 await tickMemoryWork();expect(m.preview).toHaveBeenCalledTimes(2);expect(m.payment).not.toHaveBeenCalled();
 await tickMemoryWork();expect(m.payment).toHaveBeenCalledOnce();
});
it('retries transient scan failures and keeps monthly matching behind the import barrier',async()=>{
 m.importConfig={roots:[{id:'bank'}]};configureMemoryWork('owner','request',[]);
 m.files=[{id:'a',sha256:'one',accounts:[{ref:'A',profiles:['format']}]}];
 m.preview.mockResolvedValueOnce({status:'blocked',reason_code:'scan_incomplete_or_error'});
 await tickMemoryWork();expect(memoryWorkStatus().statements?.a.status).toBe('retry');await tickMemoryWork();expect(m.preview).toHaveBeenCalledOnce();
 const p=join(m.root,'memory-work','state.json'),s=JSON.parse(readFileSync(p,'utf8'));s.statements.a.retry_at=0;writeFileSync(p,JSON.stringify(s));
 await tickMemoryWork();expect(m.preview).toHaveBeenCalledTimes(2);expect(memoryWorkStatus().statements?.a.status).toBe('staged_unbooked');
});
it('recovers old transient blocks after an update while retaining malware blocks',async()=>{
 m.importConfig={roots:[{id:'bank'}]};configureMemoryWork('owner','request',[]);
 m.files=[{id:'retry',sha256:'one',accounts:[{ref:'A',profiles:['format']}]},{id:'unsafe',sha256:'two',accounts:[{ref:'A',profiles:['format']}]}];
 writeFileSync(join(m.root,'memory-work','state.json'),JSON.stringify({repairs:{},last_scan:Date.now(),statements:{retry:{status:'blocked',reason:'scanner_or_signatures_unavailable'},unsafe:{status:'blocked',reason:'malware_detected'}}}));
 await tickMemoryWork();expect(m.preview).toHaveBeenCalledExactlyOnceWith('retry','one','A','format',true);
 expect(memoryWorkStatus().statements?.unsafe.status).toBe('blocked');
});
it('lets an owner activate monthly processing without enabling unrelated Memory policies',async()=>{
 m.importConfig={roots:[{id:'bank',accounts:[{ref:'A'}]}]};
 m.files=[{id:'already-arrived',sha256:'hash',accounts:[{ref:'A',profiles:['format']}]}];
 setMonthlyPaymentAutomation('owner',true);expect(monthlyPaymentAutomation().enabled).toBe(true);
 await tickMemoryWork();expect(m.preview).toHaveBeenCalledOnce();expect(m.applied).not.toHaveBeenCalled();expect(reconcileCareerMemory).not.toHaveBeenCalled();
 setMonthlyPaymentAutomation('owner',false);m.files.push({id:'later',sha256:'new',accounts:[{ref:'A',profiles:['format']}]});await tickMemoryWork();expect(m.preview).toHaveBeenCalledOnce();
});
it('keeps a global pause and invalidated account setup in force',()=>{
 expect(()=>setMonthlyPaymentAutomation('owner',true)).toThrow('monthly_setup_required');
 m.importConfig={roots:[{id:'bank',accounts:[{ref:'A'}]}]};setMonthlyPaymentAutomation('owner',true);
 m.importConfig={roots:[{id:'changed',accounts:[{ref:'B'}]}]};expect(monthlyPaymentAutomation().enabled).toBe(false);
 pauseMemoryWork();expect(()=>setMonthlyPaymentAutomation('owner',true)).toThrow('monthly_setup_required');expect(monthlyPaymentAutomation().paused).toBe(true);
});

it('keeps an accepted but owner-restored repair in the decision count, including resumed grants',async()=>{
 configureMemoryWork('owner','request',['p']);
 m.review.mockRejectedValueOnce(new Error('interrupted'));await tickMemoryWork();
 m.proposalStatus='candidate';await tickMemoryWork();
 expect(memoryWorkStatus().repairs.p).toMatchObject({status:'needs_review',grantId:'grant'});
 expect(m.applied).toHaveBeenCalledTimes(1);
 await tickMemoryWork();expect(m.review).toHaveBeenCalledTimes(2);
});

function completeMonth(){
 m.importConfig={roots:[{id:'bank',accounts:[{ref:'A'}]}]};configureMemoryWork('owner','request',[]);
 mkdirSync(join(m.root,'statements'));
 const b={sources:[{account_ref:'A',source_sha256:'hash',declared_period:{from:'2026-09-01',to:'2026-09-30'},control_result:{complete:true}}],entries:[],issues:[]};
 writeFileSync(join(m.root,'statements','statement-batch.json'),JSON.stringify({...b,schema:'ledger/manual-statement-batch/v0',bookkeeping:{ledger_db_touched:false},batch_sha256:JSON.stringify(b)}));
}
function saveState(s:any){writeFileSync(join(m.root,'memory-work','state.json'),JSON.stringify(s));}
it('retires vanished retries with audit status and still processes a complete month',async()=>{
 completeMonth();saveState({repairs:{},statements:{gone:{status:'retry',reason:'scanner_or_signatures_unavailable',attempts:1,retry_at:0}}});
 await tickMemoryWork();expect(m.payment).toHaveBeenCalledOnce();
 expect(memoryWorkStatus().statements?.gone).toMatchObject({status:'retired',retired_status:'retry',attempts:1});
});
it.each(['error','warning'])('never retires a file based on an incomplete inventory: %s',async kind=>{
 completeMonth();saveState({repairs:{},statements:{gone:{status:'retry',attempts:1,retry_at:0}}});
 if(kind==='error')m.inventoryError='unavailable';else m.warnings=['Root missing'];
 await tickMemoryWork();expect(memoryWorkStatus().statements?.gone.status).toBe('retry');expect(m.payment).not.toHaveBeenCalled();expect(memoryWorkStatus().inventory_error).toBeTruthy();
});
it('caps scanner retries at twelve, retains the block, and lets covered months run',async()=>{
 completeMonth();m.files=[{id:'a',sha256:'one',accounts:[{ref:'A',profiles:['format']}]}];m.preview.mockResolvedValue({status:'blocked',reason_code:'scanner_or_signatures_unavailable'});
 for(let i=0;i<15;i++){
  const s=memoryWorkStatus();s.last_scan=0;if(s.statements?.a)s.statements.a.retry_at=0;saveState(s);await tickMemoryWork();
 }
 expect(m.preview).toHaveBeenCalledTimes(12);expect(memoryWorkStatus().statements?.a).toMatchObject({status:'blocked',attempts:12});expect(m.payment).toHaveBeenCalledOnce();
});
it('does not consume failures for repeated owner pauses and resumes the same run',async()=>{
 completeMonth();
 for(let i=0;i<4;i++){
  m.payment.mockImplementationOnce(async()=>{pauseMemoryWork();throw Error('paused');});await tickMemoryWork();
  expect(memoryWorkStatus().monthly).toMatchObject({status:'paused',attempts:0});resumeMemoryWork();
 }
 await tickMemoryWork();expect(memoryWorkStatus().monthly).toMatchObject({status:'completed',attempts:0,recorded:1});
});
it('shows infrastructure failure on the monthly run without treating it as a bill question',async()=>{
 completeMonth();m.payment.mockRejectedValueOnce(Error('ledger_companion_update_required'));await tickMemoryWork();
 expect(memoryWorkStatus().monthly).toMatchObject({status:'retry',error:'ledger_companion_update_required',attempts:1});
});
import {monthlyReconciliationPending} from './work-state.js';
it('holds questions until all monthly batches finish and holds again when a new batch arrives',async()=>{
 completeMonth();expect(monthlyReconciliationPending()).toBe(true);
 m.payment.mockResolvedValueOnce({attempted_fact_ids:['one'],recorded:0,skipped:{budget:1}});await tickMemoryWork();expect(monthlyReconciliationPending()).toBe(true);
 await tickMemoryWork();expect(monthlyReconciliationPending()).toBe(false);
 const p=join(m.root,'statements','statement-batch.json'),b=JSON.parse(readFileSync(p,'utf8'));b.sources[0].source_sha256='new';b.batch_sha256=JSON.stringify({sources:b.sources,entries:b.entries,issues:b.issues});writeFileSync(p,JSON.stringify(b));expect(monthlyReconciliationPending()).toBe(true);
});

it('releases covered questions when monthly automation is deactivated',async()=>{
 completeMonth();m.payment.mockResolvedValueOnce({attempted_fact_ids:['one'],recorded:0,skipped:{budget:1}});await tickMemoryWork();
 setMonthlyPaymentAutomation('owner',false);expect(monthlyReconciliationPending()).toBe(false);
});
import {retryMonthlyWork} from './work-runtime.js';
it('owner retry reopens exhausted transient work but preserves permanent security blocks',async()=>{
 completeMonth();saveState({repairs:{},statements:{scanner:{status:'blocked',reason:'scanner_or_signatures_unavailable',attempts:12},unsafe:{status:'blocked',reason:'malware_detected',attempts:1},done:{status:'staged_unbooked',attempts:1}}});
 retryMonthlyWork();expect(memoryWorkStatus().statements).toMatchObject({scanner:{status:'retry',attempts:0},unsafe:{status:'blocked',attempts:1},done:{status:'staged_unbooked',attempts:1}});
});

it('toggling monthly pause preserves import history and the finished batch',async()=>{
 completeMonth();await tickMemoryWork();const s=memoryWorkStatus();s.statements={done:{status:'staged_unbooked',attempts:1}};saveState(s);
 setMonthlyPaymentAutomation('owner',false);setMonthlyPaymentAutomation('owner',true);
 expect(memoryWorkStatus().statements).toEqual(s.statements);expect(memoryWorkStatus().monthly).toEqual(s.monthly);
 await tickMemoryWork();expect(m.payment).toHaveBeenCalledOnce();
});

it('marks a monthly run stopped by deactivation as deactivated rather than paused',async()=>{
 completeMonth();m.payment.mockImplementationOnce(async()=>{setMonthlyPaymentAutomation('owner',false);throw Error('aborted');});
 await tickMemoryWork();expect(memoryWorkStatus().monthly).toMatchObject({status:'deactivated',attempts:0});expect(monthlyPaymentAutomation().deactivated).toBe(true);
 setMonthlyPaymentAutomation('owner',true);await tickMemoryWork();expect(memoryWorkStatus().monthly).toMatchObject({status:'completed',attempts:0});
});

// Review D3: status immediately after reactivation.
it('RV3-D3 setzt den Jobstatus bei Reaktivierung von deactivated auf pending zurück',async()=>{
 completeMonth();m.payment.mockImplementationOnce(async()=>{setMonthlyPaymentAutomation('owner',false);throw Error('aborted');});
 await tickMemoryWork();expect(memoryWorkStatus().monthly?.status).toBe('deactivated');
 setMonthlyPaymentAutomation('owner',true);
 expect(monthlyPaymentAutomation().deactivated).toBe(false);
 expect(memoryWorkStatus().monthly?.status).not.toBe('deactivated');
});

it('reactivation is immediately pending even when the runtime is not ready',async()=>{
 completeMonth();m.payment.mockImplementationOnce(async()=>{setMonthlyPaymentAutomation('owner',false);throw Error('aborted');});
 await tickMemoryWork();m.enabled=false;setMonthlyPaymentAutomation('owner',true);
 expect(monthlyPaymentAutomation()).toMatchObject({enabled:true,ready:false,deactivated:false});
 expect(memoryWorkStatus().monthly?.status).toBe('pending');await tickMemoryWork();
 expect(memoryWorkStatus().monthly?.status).toBe('pending');expect(m.payment).toHaveBeenCalledOnce();
});
