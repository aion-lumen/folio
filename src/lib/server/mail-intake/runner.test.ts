import { beforeEach,afterEach,describe,it,expect,vi } from 'vitest';
import { mkdtempSync,rmSync,writeFileSync } from 'node:fs';import { join } from 'node:path';import { tmpdir } from 'node:os';
const m=vi.hoisted(()=>({complete:vi.fn(),decision:vi.fn(),attachments:vi.fn(),propose:vi.fn(),review:vi.fn(),start:vi.fn(),validate:vi.fn(),cancel:vi.fn(),execFile:vi.fn(),busy:false,workerStatus:'completed',activeRun:null as null|{uuid:string}}));
vi.mock('./work-status.js',()=>({completeLocalMails:m.complete}));
vi.mock('node:child_process',()=>({execFile:(file:unknown,args:unknown,opts:unknown,cb:Function)=>{m.execFile(file,args,opts);cb(null,'','');}}));
vi.mock('../worker-runner/manager.js',()=>({cancelActiveRun:m.cancel,getActiveRun:()=>m.activeRun,isBusy:()=>m.busy,startRun:m.start,startValidatorRun:m.validate}));
vi.mock('../folio-db/reader.js',()=>({getWorkerRunByUuid:()=>({status:m.workerStatus,pid:12345}),getClassifiedMailIdsForRun:()=>[7,8]}));
vi.mock('../feedback/reader.js',()=>({getFeedbackRowById:(id:number)=>({id,account_id:'gmail',imap_uid:id,sender:'synthetic',subject:'synthetic'})}));
vi.mock('../memory/mail-domain.js',()=>({resolveMailMemoryDomain:m.decision,hasCompleteMailModelOpinions:(row:unknown)=>m.decision(row).source!=='incomplete'}));
vi.mock('../memory/mail-candidates.js',()=>({proposeMemoryFromMail:m.propose,memoryDomainForMail:()=> 'personal',MailMemoryError:class extends Error {code='invalid';}}));
vi.mock('../memory/store.js',()=>({getMemoryDelegationResult:()=>null,getMemoryDelegation:()=>({expires_at:new Date(Date.now()+3600000).toISOString()})}));
vi.mock('../memory/delegated-review.js',()=>({authorizeMailMemoryReview:()=>({grant_id:'grant'}),reviewDelegatedMailMemory:m.review}));
vi.mock('../regelwerk/loader.js',()=>({loadRegelwerk:()=>({voice_consensus:{voices:[{role:'primary_llm',lm_studio_model:'primary'},{role:'conditional_reviewer',lm_studio_model:'reviewer'}]}})}));
vi.mock('../model-eval/runner.js',()=>({readModelEvalRunStatus:()=>({state:'idle'})}));
vi.mock('../memory/eval-runner.js',()=>({readMemoryEvalRunStatus:()=>({state:'idle'})}));
vi.mock('../memory/selection-runner.js',()=>({readMailSelectionRunStatus:()=>({state:'idle'})}));
vi.mock('./attachments.js',()=>({processMailAttachments:m.attachments}));
vi.mock('./source.js',()=>({memoryMailBody:()=> 'synthetic full source'}));
vi.mock('../env.js',async original=>({...await original<object>(),isDemoVaultActive:()=>false,getLmStudioBaseUrl:()=> 'http://127.0.0.1:1234',loadHermesEnvVars:()=>({})}));
import { resetFolioDbForTests } from '../folio-db/init.js';import { configure,runs,save,db,type IntakeRun } from './state.js';import { adaptiveHistoryBatchSize,requestManualIntake,tick,historyWindowOpen,waitForWorker } from './runner.js';
const contracts=vi.hoisted(()=>({sync:vi.fn(()=>({recorded:1,checkedAt:'2026-09-24T12:00:00Z'}))}));
vi.mock('../modules/ledger-books/contract-mail-sync.js',()=>({syncIntakeContracts:contracts.sync}));
const career=vi.hoisted(()=>({sync:vi.fn()}));
vi.mock('../career/mail-sync.js',()=>({syncIntakeRejections:career.sync}));
let dir='';beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'folio-intake-runner-'));vi.stubEnv('FOLIO_DB_PATH',join(dir,'folio.db'));vi.stubEnv('FOLIO_MAIL_ACCOUNTS_PATH','');writeFileSync(join(dir,'mail-intake-accounts.json'),JSON.stringify(['gmail','work','yahoo'].map(id=>({id,label:id,kind:'imap'}))));vi.clearAllMocks();m.attachments.mockResolvedValue({status:'checked',parts:0,ready:0,deferred:0,reason:null});m.busy=false;m.workerStatus='completed';m.activeRun=null;m.start.mockReturnValue({uuid:'worker'});m.validate.mockReturnValue({uuid:'validator'});m.decision.mockReturnValue({domain:'kontakt',source:'model_consensus'});m.propose.mockResolvedValue({facts:[{}],bundle:{proposal:{status:'candidate',proposal_id:'proposal'}}});m.review.mockResolvedValue({verdict:'accept'});configure(true,'owner:1','synthetic test');});afterEach(()=>{resetFolioDbForTests();vi.unstubAllEnvs();rmSync(dir,{recursive:true,force:true});});
describe('full automatic mail path',()=>{
 it('reconciles exact contract mails before memory without additional model calls',async()=>{await tick();expect(contracts.sync).toHaveBeenCalledWith(expect.objectContaining({items:expect.arrayContaining([expect.objectContaining({id:7})])}),expect.objectContaining({enabled:true}));expect(contracts.sync.mock.invocationCallOrder[0]).toBeLessThan(m.propose.mock.invocationCallOrder[0]);expect(runs()[0].contracts?.recorded).toBe(1);});

 it('retries a failed contract checkpoint without refetching or silently skipping it',async()=>{contracts.sync.mockImplementationOnce(()=>{throw Error('contract_mail_source_unavailable');});await tick();expect(runs()[0]).toMatchObject({state:'failed',phase:'memory'});expect(m.propose).not.toHaveBeenCalled();save({...runs()[0],state:'pending'});m.start.mockClear();await tick();expect(m.start).not.toHaveBeenCalled();expect(runs()[0]).toMatchObject({state:'completed',contracts:{recorded:1}});});
 it('keeps historical work paused at night while enabling the hourly career scope',()=>{
  const c=configure(true,'owner:1','current mail only',10,{career_rejections:true,history_paused:true});
  expect(historyWindowOpen(c,new Date('2026-09-23T23:00:00Z'))).toBe(false);
  expect(configure(false,'owner:1','pause').career_rejections).toBe(true);
 });
 it('runs the tracker update after complete model and memory processing under the same lease',async()=>{
  configure(true,'owner:1','hourly exact rejections',10,{career_rejections:true,history_paused:true});
  career.sync.mockImplementation(async(run,c)=>{expect(run.items.every((i:{stage:string})=>i.stage==='done')).toBe(true);expect(c.career_rejections).toBe(true);expect(db().prepare('SELECT count(*) AS n FROM mail_intake_lease').get()).toMatchObject({n:1});return {applied:1,checkedAt:'2026-09-23T12:00:00Z'};});
  await tick();expect(m.complete).toHaveBeenCalledWith([7,8],expect.stringContaining('/hourly-mail/'));expect(career.sync).toHaveBeenCalledOnce();expect(runs()[0]).toMatchObject({state:'completed',phase:'career',career:{applied:1}});
 });
 it('retries a failed career phase without repeating mail import or memory extraction',async()=>{
  configure(true,'owner:1','hourly exact rejections',10,{career_rejections:true,history_paused:true});
  save({id:'resume-career',account:'gmail',state:'pending',phase:'career',items:[{id:7,stage:'done'}],attempts:1,started_at:new Date().toISOString()});
  career.sync.mockResolvedValue({applied:0,checkedAt:'2026-09-23T12:00:00Z'});await tick();expect(m.start).not.toHaveBeenCalled();expect(m.validate).not.toHaveBeenCalled();expect(m.propose).not.toHaveBeenCalled();expect(career.sync).toHaveBeenCalledOnce();
 });
	 it('uses a Zurich night window across midnight without blocking manual work',()=>{const c=configure(true,'owner:1','window');expect(historyWindowOpen(c,new Date('2026-09-09T20:30:00Z'))).toBe(true);expect(historyWindowOpen(c,new Date('2026-09-09T10:30:00Z'))).toBe(false);expect(requestManualIntake({account:'gmail',history:false,batchSize:5,owner:'owner:1'}).requested_by).toBe('manual');});
	 it('keeps the 22:00 inclusive and 07:00 exclusive boundaries DST-safe',()=>{const c=configure(true,'owner:1','window');expect(historyWindowOpen(c,new Date('2026-01-09T21:00:00Z'))).toBe(true);expect(historyWindowOpen(c,new Date('2026-01-10T05:59:59Z'))).toBe(true);expect(historyWindowOpen(c,new Date('2026-01-10T06:00:00Z'))).toBe(false);expect(historyWindowOpen(c,new Date('2026-06-09T20:00:00Z'))).toBe(true);expect(historyWindowOpen(c,new Date('2026-06-10T05:00:00Z'))).toBe(false);});
	 it('queues a bounded manual tranche under the same authority and audit log',()=>{const run=requestManualIntake({account:'gmail',history:false,batchSize:10,owner:'owner:1'});expect(run).toMatchObject({account:'gmail',requested_by:'manual',batch_size:10,state:'pending',phase:'fetch'});expect(db().prepare('SELECT count(*) AS n FROM mail_intake_events').get()).toMatchObject({n:2});expect(()=>requestManualIntake({account:'yahoo',history:false,batchSize:5,owner:'owner:1'})).toThrow('intake_busy');});
	 it('promotes history batches after ten clean checkpoints and falls back after instability',()=>{
		let sequence=0;
		const completed=(size:5|10|20,attempts=0):IntakeRun=>({id:`history-${sequence++}`,account:'gmail',history:true,requested_by:'automatic',batch_size:size,state:'completed',phase:'memory',items:Array.from({length:size},(_,id)=>({id,stage:'done'})),attempts,started_at:new Date().toISOString(),ended_at:new Date().toISOString()});
		expect(adaptiveHistoryBatchSize([])).toBe(10);
		expect(adaptiveHistoryBatchSize(Array.from({length:9},()=>completed(10)))).toBe(10);
		expect(adaptiveHistoryBatchSize(Array.from({length:10},()=>completed(10)))).toBe(20);
		expect(adaptiveHistoryBatchSize([completed(20)])).toBe(20);
		expect(adaptiveHistoryBatchSize([completed(20,1)])).toBe(5);
		expect(adaptiveHistoryBatchSize([completed(5),completed(20,1)])).toBe(10);
	 });
	 it('refuses a manual tranche while the shared worker is occupied',()=>{m.busy=true;expect(()=>requestManualIntake({account:'gmail',history:false,batchSize:5,owner:'owner:1'})).toThrow('intake_busy');expect(runs()).toHaveLength(0);});
	 it('cancels the active child before surfacing a subprocess timeout',async()=>{m.workerStatus='running';m.activeRun={uuid:'worker'};m.cancel.mockImplementation(()=>{m.workerStatus='cancelled';return true;});await expect(waitForWorker('worker',{timeoutMs:1,pollMs:1,settleMs:5})).rejects.toThrow('subprocess_timeout');expect(m.cancel).toHaveBeenCalledOnce();});
 it('hands exact imported IDs and the parent model fence through validator, extraction and review',async()=>{await tick();expect(m.validate).toHaveBeenCalledWith('last-tranche',expect.objectContaining({mailIds:[7,8],intake:true,modelFenceToken:expect.any(String)}));expect(m.attachments).toHaveBeenCalledTimes(2);expect(m.propose).toHaveBeenCalledTimes(2);expect(m.review).toHaveBeenCalledTimes(2);expect(m.execFile.mock.calls.some(([,args])=>Array.isArray(args)&&args.at(-2)==='reviewer'&&args.at(-1)==='32768')).toBe(true);expect(runs()[0]).toMatchObject({state:'completed',items:[{id:7,outcome:'confirmed'},{id:8,outcome:'confirmed'}]});});
 it('keeps stored spam sources out of attachment fetching and automatic memory',async()=>{db().prepare('INSERT INTO mail_intake_locations VALUES (?,?,?,?,?)').run('gmail','[Gmail]/Spam',3,7,7);await tick();expect(m.attachments).toHaveBeenCalledTimes(1);expect(m.propose).toHaveBeenCalledTimes(1);expect(runs()[0].items[0]).toMatchObject({id:7,outcome:'excluded_source_folder',diagnostic:{code:'spam_or_trash_source'}});});
 it('does not call memory when the subprocess exits zero but a model opinion is missing',async()=>{m.decision.mockReturnValue({domain:null,source:'incomplete'});await tick();expect(m.propose).not.toHaveBeenCalled();expect(runs()[0]).toMatchObject({state:'failed',error:'incomplete_model_opinions',attempts:1});expect(runs()[0].validator_id).toBeUndefined();});
 it('preserves conflicts and negative evidence verdicts as open cases',async()=>{m.decision.mockImplementation((row:{id:number})=>row.id===7?{domain:null,source:'conflict'}:{domain:'kontakt',source:'model_consensus'});m.review.mockResolvedValue({verdict:'reject'});await tick();expect(runs()[0].items.map(i=>i.outcome)).toEqual(['domain_conflict','candidate']);expect(m.propose).toHaveBeenCalledTimes(1);});
 it('resumes the review stage without fetching, validating or extracting again',async()=>{save({id:'resume',account:'gmail',state:'pending',phase:'memory',items:[{id:7,stage:'review',proposal_id:'p',grant_id:'existing'}],attempts:0,started_at:new Date().toISOString()});await tick();expect(m.start).not.toHaveBeenCalled();expect(m.validate).not.toHaveBeenCalled();expect(m.propose).not.toHaveBeenCalled();expect(m.review).toHaveBeenCalledWith(7,'existing');expect(runs()[0].state).toBe('completed');});
 it('stops after a pause during extraction, without delegating confirmation',async()=>{m.propose.mockImplementation(async()=>{configure(false,'owner:1','pause');return {facts:[{}],bundle:{proposal:{status:'candidate',proposal_id:'p'}}};});await tick();expect(m.review).not.toHaveBeenCalled();expect(runs()[0].state).toBe('pending');});
});

describe('hourly unread account priority',()=>{
 function completed(account:string,minutesAgo=120) {
  const at=new Date(Date.now()-minutesAgo*60000).toISOString();
  save({id:`prior-${account}`,account,state:'completed',phase:'memory',items:[],attempts:0,started_at:at,ended_at:at});
 }
 function coverage(account:string,unread:number,remaining=unread) {
  db().prepare('INSERT OR REPLACE INTO mail_intake_coverage VALUES (?,?)').run(account,JSON.stringify({scope:'inbox',remaining,unread_remaining:unread}));
 }
 function policy(){configure(true,'owner:1','unread before deferred account',10,{unread_first:true,deferred_accounts:['yahoo'],history_paused:true});}
 it('checks every other due account before an older Yahoo run',async()=>{
  policy();completed('yahoo',300);completed('gmail',150);completed('work',120);
  writeFileSync(join(dir,'mail-intake-accounts.json'),JSON.stringify([...['gmail','work','yahoo'].map(id=>({id,label:id,kind:'imap'})),{id:'extra',label:'Extra',kind:'imap'}]));completed('extra',180);
  await tick();await tick();await tick();await tick();
  expect(m.start.mock.calls.map(([input])=>input.account)).toEqual(['extra','gmail','work','yahoo']);
  expect(m.start.mock.calls.every(([input])=>input.intake.unreadFirst===true)).toBe(true);
 });
 it('drains additional unread batches before Yahoo without waiting another hour',async()=>{
  policy();completed('yahoo',300);completed('gmail',0);completed('work',0);coverage('gmail',12);
  await tick();expect(m.start.mock.calls[0][0].account).toBe('gmail');
  coverage('gmail',2);await tick();expect(m.start.mock.calls[1][0].account).toBe('gmail');
  coverage('gmail',0,40);await tick();expect(m.start.mock.calls[2][0].account).toBe('yahoo');
 });
 it('does not let an initial read backlog starve Yahoo, and continues it afterwards',async()=>{
  policy();for(const id of ['gmail','work'])completed(id,0);completed('yahoo',300);
  writeFileSync(join(dir,'mail-intake-accounts.json'),JSON.stringify([...['gmail','work','yahoo'].map(id=>({id,label:id,kind:'imap'})),{id:'extra',label:'Extra',kind:'imap',initialInbox:true}]));completed('extra',0);coverage('extra',0,50);
  await tick();await tick();expect(m.start.mock.calls.map(([input])=>input.account)).toEqual(['yahoo','extra']);
 });
 it('keeps retry limits and permits Yahoo when an ordinary account is unavailable',async()=>{
  policy();for(const account of ['gmail','work'])save({id:account,account,state:'failed',phase:'fetch',items:[],attempts:3,started_at:'2026-01-01'});
  await tick();expect(m.start.mock.calls[0][0].account).toBe('yahoo');
 });
 it('preserves explicit manual selection and its normal UID order',async()=>{
  policy();requestManualIntake({account:'yahoo',history:false,batchSize:5,owner:'owner:1'});
  await tick();expect(m.start.mock.calls[0][0]).toMatchObject({account:'yahoo',trancheSize:5,intake:{unreadFirst:false}});
 });
 it('finishes an interrupted Yahoo memory checkpoint without restarting its import',async()=>{
  policy();save({id:'resume-yahoo',account:'yahoo',state:'pending',phase:'memory',items:[{id:7,stage:'review',proposal_id:'p',grant_id:'existing'}],attempts:0,started_at:new Date().toISOString()});
  await tick();expect(m.start).not.toHaveBeenCalled();expect(m.review).toHaveBeenCalledWith(7,'existing');expect(runs()[0].state).toBe('completed');
 });
});
