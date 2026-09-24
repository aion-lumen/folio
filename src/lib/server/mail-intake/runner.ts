import {syncIntakeContracts} from '../modules/ledger-books/contract-mail-sync.js';
import { completeLocalMails } from './work-status.js';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getAionLumenPath, getPythonBinPath, loadHermesEnvVars, localMailProcessEnv, isDemoVaultActive, getLmStudioBaseUrl } from '../env.js';
import { cancelActiveRun, getActiveRun, isBusy, startRun, startValidatorRun } from '../worker-runner/manager.js';
import { getWorkerRunByUuid, getClassifiedMailIdsForRun } from '../folio-db/reader.js';
import { getFeedbackRowById } from '../feedback/reader.js';
import { resolveMailMemoryDomain, hasCompleteMailModelOpinions } from '../memory/mail-domain.js';
import { proposeMemoryFromMail, memoryDomainForMail, MailMemoryError } from '../memory/mail-candidates.js';
import { authorizeMailMemoryReview, reviewDelegatedMailMemory } from '../memory/delegated-review.js';
import { getMemoryDelegation, getMemoryDelegationResult } from '../memory/store.js';
import { loadRegelwerk } from '../regelwerk/loader.js';
import { readModelEvalRunStatus } from '../model-eval/runner.js';
import { readMemoryEvalRunStatus } from '../memory/eval-runner.js';
import { readMailSelectionRunStatus } from '../memory/selection-runner.js';
import { memoryMailBody } from './source.js';
import { processMailAttachments } from './attachments.js';
import { automaticMemorySourceEligibility } from './mailbox-source.js';
import { POLICY, config, runs, save, acquire, renew, release, recordEvent, type IntakeRun, type Config, db } from './state.js';
import { accounts, historyAccounts } from './accounts.js';
import {financeWorkerActive} from '../modules/ledger-books/finance-run-state.js';
import {syncIntakeRejections} from '../career/mail-sync.js';
const exec = promisify(execFile);
let running = false;
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export const MAIL_INTAKE_CONTEXT_LENGTH = 16_384;
export const MAIL_REVIEW_CONTEXT_LENGTH = 32_768;
export const MAIL_FETCH_TIMEOUT_MS = 30 * 60_000;
const MAIL_SUBPROCESS_TIMEOUT_MS = 4 * 60 * 60_000;
const MAIL_CANCEL_SETTLE_MS = 15_000;
export const HISTORY_BATCH_INITIAL = 10;
export const HISTORY_BATCH_STEADY = 20;
export const HISTORY_BATCH_FALLBACK = 5;
export const HISTORY_BATCH_PROMOTION_RUNS = 10;
function allowed(c: Config) { const current=config(); if (!current?.enabled || current.authorization_id!==c.authorization_id || isDemoVaultActive()) throw Error('paused'); }
function modelsIdle() { return readModelEvalRunStatus().state!=='running' && readMemoryEvalRunStatus().state!=='running' && readMailSelectionRunStatus().state!=='running'; }
export function adaptiveHistoryBatchSize(history: IntakeRun[]): 5 | 10 | 20 {
 const terminal=history.filter(run=>run.history===true && run.requested_by==='automatic' && ['gmail','yahoo'].includes(run.account) && ['completed','failed'].includes(run.state) && [HISTORY_BATCH_FALLBACK,HISTORY_BATCH_INITIAL,HISTORY_BATCH_STEADY].includes(run.batch_size??0)).sort((a,b)=>Date.parse(b.ended_at??b.started_at)-Date.parse(a.ended_at??a.started_at));
 const latest=terminal[0];
 if(!latest)return HISTORY_BATCH_INITIAL;
 // A recovered run also counts as an instability signal because its terminal
 // state no longer exposes the earlier failed attempt.
 if(latest.state==='failed'||latest.attempts>0)return HISTORY_BATCH_FALLBACK;
 if(latest.batch_size===HISTORY_BATCH_FALLBACK)return HISTORY_BATCH_INITIAL;
 if(latest.batch_size===HISTORY_BATCH_STEADY)return HISTORY_BATCH_STEADY;
 let cleanInitialRuns=0;
 for(const run of terminal) {
  if(run.state==='completed'&&run.batch_size===HISTORY_BATCH_INITIAL&&run.attempts===0&&run.items.length===HISTORY_BATCH_INITIAL)cleanInitialRuns++;
  else break;
 }
 return cleanInitialRuns>=HISTORY_BATCH_PROMOTION_RUNS?HISTORY_BATCH_STEADY:HISTORY_BATCH_INITIAL;
}
export function requestManualIntake(input:{account:string;history:boolean;batchSize:number;owner:string}):IntakeRun {
 const current=config();if(!current?.enabled||current.policy!==POLICY)throw Error('intake_not_enabled');
 const source=accounts().find(account=>account.id===input.account);if(!source)throw Error('unknown_account');
 if(input.history&&!historyAccounts().includes(input.account))throw Error('history_not_enabled');
 if(!Number.isInteger(input.batchSize)||input.batchSize<1||input.batchSize>30)throw Error('invalid_batch_size');
 if(isBusy()||runs().some(run=>run.state==='pending'||run.state==='running'))throw Error('intake_busy');
 const run:IntakeRun={id:randomUUID(),account:source.id,history:input.history,requested_by:'manual',batch_size:input.batchSize,state:'pending',phase:'fetch',items:[],attempts:0,started_at:new Date().toISOString()};
 save(run);recordEvent(input.owner,{action:'manual_run_requested',run_id:run.id,account:run.account,history:run.history,batch_size:run.batch_size,authorization_id:current.authorization_id});
 return run;
}
export function historyWindowOpen(c:Config,now=new Date()):boolean {
 if(c.history_paused)return false;
 const window=c.history_window;
 if(!window.enabled)return true;
 const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:window.time_zone,hour:'2-digit',hourCycle:'h23'}).formatToParts(now).find(part=>part.type==='hour')?.value);
 if(!Number.isInteger(hour))throw Error('history_window_time_unavailable');
 if(window.start_hour===window.end_hour)return true;
 return window.start_hour<window.end_hour?hour>=window.start_hour&&hour<window.end_hour:hour>=window.start_hour||hour<window.end_hour;
}
export function historyWindowStatus(c:Config,now=new Date()){return {...c.history_window,paused:c.history_paused===true,open:historyWindowOpen(c,now),checked_at:now.toISOString()};}
export async function prepareIntakeModel(model: string, contextLength=MAIL_INTAKE_CONTEXT_LENGTH, fenceToken?:string) {
 const endpoint=new URL(getLmStudioBaseUrl());
 if (endpoint.protocol!=='http:' || !['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname)) throw Error('local_model_required');
 if (!modelsIdle()) throw Error('model_busy');
 await exec(getPythonBinPath(), ['-c', 'import sys; from scripts.model_swap import swap_to; sys.exit(0 if swap_to(sys.argv[1], context_length=int(sys.argv[2]), gpu="max", parallel=1, ttl_s=3600) else 1)', model, String(contextLength)], { cwd:getAionLumenPath(), env:{...localMailProcessEnv(),...(fenceToken?{FOLIO_MODEL_FENCE_TOKEN:fenceToken}:{})}, timeout:300_000, maxBuffer:32_000 });
}
export async function waitForWorker(id: string, options: {timeoutMs?:number;pollMs?:number;settleMs?:number}={}) {
 const timeoutMs=options.timeoutMs??MAIL_SUBPROCESS_TIMEOUT_MS;
 const pollMs=options.pollMs??1000;
 const settleMs=options.settleMs??MAIL_CANCEL_SETTLE_MS;
 const deadline=Date.now()+timeoutMs;
 while(Date.now()<deadline) {
  const row=getWorkerRunByUuid(id); if (!row) throw Error('run_missing');
  if (row.status!=='running') { if(row.status!=='completed') throw Error('subprocess_failed'); return; }
  if(getActiveRun()?.uuid!==id) {
   try { if(!row.pid) throw Error(); process.kill(row.pid,0); } catch { throw Error('interrupted_subprocess'); }
  }
  await delay(pollMs);
 }
 if(getActiveRun()?.uuid===id) {
  cancelActiveRun();
  const settleDeadline=Date.now()+settleMs;
  while(Date.now()<settleDeadline && getWorkerRunByUuid(id)?.status==='running') await delay(pollMs);
 }
 throw Error('subprocess_timeout');
}
async function execute(run: IntakeRun, c: Config, fenceToken:string) {
 run.state='running'; run.error=undefined; run.activity=undefined; save(run);
 const voices=loadRegelwerk().voice_consensus.voices.filter(v=>v.enabled!==false);
 const primary=voices.find(v=>v.role==='primary_llm')?.lm_studio_model;
 const reviewer=voices.find(v=>v.role==='conditional_reviewer')?.lm_studio_model;
 if(!primary || !reviewer || primary===reviewer) throw Error('model_configuration');
 allowed(c);
 if(run.phase==='fetch') {
  // A crashed/failed fetch can already have imported a partial batch. Preserve its exact IDs.
  if(run.worker_id) for(const id of getClassifiedMailIdsForRun(run.worker_id)) if(!run.items.some(i=>i.id===id)) run.items.push({id,stage:'extract'});
  if (!run.worker_id || getWorkerRunByUuid(run.worker_id)?.status!=='completed') {
   if(run.worker_id && getWorkerRunByUuid(run.worker_id)?.status==='running') {
    try {await waitForWorker(run.worker_id, {timeoutMs:MAIL_FETCH_TIMEOUT_MS});} catch(e) { if(!(e instanceof Error) || e.message!=='interrupted_subprocess') throw e; run.worker_id=undefined; }
   }
   if(!run.worker_id || getWorkerRunByUuid(run.worker_id)?.status!=='completed')
   { run.worker_id=startRun({account:run.account,mode:'silent',trancheSize:run.batch_size??c.batch_size,intake:{activatedAt:c.activated_at,history:run.history,unreadFirst:c.unread_first===true&&run.requested_by!=='manual'&&!run.history}}).uuid; save(run); await waitForWorker(run.worker_id, {timeoutMs:MAIL_FETCH_TIMEOUT_MS}); }
  }
  for(const id of getClassifiedMailIdsForRun(run.worker_id!)) if(!run.items.some(i=>i.id===id)) run.items.push({id,stage:'extract'});
  run.phase='validate'; save(run);
 }
 allowed(c);
 if(run.phase==='validate') {
  if(run.items.length) {
   if(!run.validator_id || getWorkerRunByUuid(run.validator_id)?.status!=='completed') {
    if(run.validator_id && getWorkerRunByUuid(run.validator_id)?.status==='running') {
     try {await waitForWorker(run.validator_id);} catch(e) {if(!(e instanceof Error)||e.message!=='interrupted_subprocess')throw e;run.validator_id=undefined;}
    }
    if(!run.validator_id || getWorkerRunByUuid(run.validator_id)?.status!=='completed') run.validator_id=startValidatorRun('last-tranche',{mailIds:run.items.map(i=>i.id),account:run.account,parentRunUuid:run.worker_id,triggeredBy:'auto',intake:true,modelFenceToken:fenceToken}).uuid; save(run);
    await waitForWorker(run.validator_id);
   }
   // Exit code alone is insufficient: every mail must have all required base opinions.
   if(run.items.some(i=>{const row=getFeedbackRowById(i.id);return !row || !hasCompleteMailModelOpinions(row);})) throw Error('incomplete_model_opinions');
  }
  run.phase='memory'; save(run);
 }
 allowed(c);
 if(run.phase==='memory'&&!run.contracts){
  run.activity={model:'local',task:'Vertragsbestätigungen abgleichen'};save(run);
  const result=syncIntakeContracts(run,c);
  if(result)run.contracts={recorded:result.recorded,checkedAt:result.checkedAt};
  run.activity=undefined;save(run);allowed(c);
 }
 if(run.phase==='memory') try {
  for(const item of run.items.filter(i=>i.stage==='extract'&&!i.attachments)){
   const source=getFeedbackRowById(item.id);
   if(source&&!automaticMemorySourceEligibility(item.id,source.account_id).eligible){item.stage='done';item.outcome='excluded_source_folder';item.diagnostic={code:'spam_or_trash_source',reason:'Automatisches Gedächtnis überspringt bekannte Spam- und Papierkorbquellen.'};save(run);continue;}
   allowed(c);run.activity={model:'local',task:`Anhänge prüfen · Mail #${item.id}`};save(run);
   try{item.attachments=await processMailAttachments(item.id);}catch(e){item.attachments={status:'unavailable',parts:0,ready:0,deferred:0,reason:e instanceof Error&&/^[a-z_]+$/.test(e.message)?e.message:'attachment_processing_failed'};}
   save(run);allowed(c);
  }
  if(run.items.some(i=>i.stage==='extract')) {run.activity={model:primary,task:'Modell laden · Memory-Extraktion'};save(run);await prepareIntakeModel(primary,MAIL_INTAKE_CONTEXT_LENGTH,fenceToken);}
  for(const item of run.items.filter(i=>i.stage==='extract')) {
   allowed(c);
   const row=getFeedbackRowById(item.id); if(!row) throw Error('source_missing');
   if(!automaticMemorySourceEligibility(item.id,row.account_id).eligible){item.stage='done';item.outcome='excluded_source_folder';item.diagnostic={code:'spam_or_trash_source',reason:'Automatisches Gedächtnis überspringt bekannte Spam- und Papierkorbquellen.'};save(run);continue;}
   const decision=resolveMailMemoryDomain(row);
   if(!decision.domain) { item.stage='done'; item.outcome='domain_conflict'; save(run); continue; }
   try { memoryDomainForMail(decision.domain); } catch {item.stage='done';item.outcome='not_memory_domain';save(run);continue;}
   const body=memoryMailBody(row);
   if(!body) {item.stage='done';item.outcome='source_incomplete';save(run);continue;}
   try {
    run.activity={model:primary,task:`Memory-Extraktion · Mail #${item.id}`};save(run);
    const result=await proposeMemoryFromMail({feedback_id:row.id,account_id:row.account_id,imap_uid:row.imap_uid,sender:row.sender,subject:row.subject,body,mail_domain:decision.domain,received_at:row.mail_date});
    if(result.bundle?.proposal.status==='candidate') {item.proposal_id=result.bundle.proposal.proposal_id;item.stage='review';}
    else {item.stage='done';item.outcome=result.facts.length?'already_present':'no_durable_fact';}
   } catch(e) {
    if(e instanceof MailMemoryError && e.code!=='unavailable') {item.stage='done';item.outcome='evidence_clarification';item.diagnostic={code:e.reasonCode,reason:e.message};}
    else throw Error('extraction_unavailable');
   }
   run.activity=undefined;save(run);
  }
  allowed(c);
  if(run.items.some(i=>i.stage==='review')) {run.activity={model:reviewer,task:'Modell laden · unabhängige Memory-Prüfung'};save(run);await prepareIntakeModel(reviewer,MAIL_REVIEW_CONTEXT_LENGTH,fenceToken);}
  for(const item of run.items.filter(i=>i.stage==='review')) {
   allowed(c);
   const source=getFeedbackRowById(item.id);
   if(source&&!automaticMemorySourceEligibility(item.id,source.account_id).eligible){item.stage='done';item.outcome='excluded_source_folder';item.diagnostic={code:'spam_or_trash_source',reason:'Automatisches Gedächtnis überspringt bekannte Spam- und Papierkorbquellen.'};save(run);continue;}
   // Persist before the model call; replay consumes the same completed grant idempotently.
   if(item.grant_id && !getMemoryDelegationResult(item.grant_id) && Date.parse(getMemoryDelegation(item.grant_id).expires_at)<=Date.now()) item.grant_id=undefined;
   if(!item.grant_id) {item.grant_id=authorizeMailMemoryReview(item.id,item.proposal_id!,c.owner,c.authorization_ref,{id:c.authorization_id,run_id:run.id,feedback_id:item.id}).grant_id;save(run);}
   run.activity={model:reviewer,task:`Unabhängige Memory-Prüfung · Mail #${item.id}`};save(run);
   const result=await reviewDelegatedMailMemory(item.id,item.grant_id);
   item.outcome=result.verdict==='accept'?'confirmed':'candidate';item.stage='done';run.activity=undefined;save(run);
  }
 } finally { if(run.items.length) {run.activity={model:primary,task:'Primärmodell wiederherstellen'};save(run);await prepareIntakeModel(primary,MAIL_INTAKE_CONTEXT_LENGTH,fenceToken);} run.activity=undefined; }
 if(c.career_rejections&&!run.history){
  run.phase='career';run.activity={model:primary,task:'Bewerbungen mit Absagemails abgleichen'};save(run);
  allowed(c);await prepareIntakeModel(primary,MAIL_REVIEW_CONTEXT_LENGTH,fenceToken);
  const result=await syncIntakeRejections(run,c,primary);
  run.career={applied:result.applied,checkedAt:result.checkedAt};run.activity=undefined;
 }
 allowed(c);completeLocalMails(run.items.map(item=>item.id),`${c.owner}/hourly-mail/${c.authorization_id}`);
 run.state='completed';run.error=undefined;run.ended_at=new Date().toISOString();save(run);
}
export async function tick() {
 if(running || isBusy() || !modelsIdle() || isDemoVaultActive()) return;
 const c=config(); if(!c?.enabled || c.policy!==POLICY) return;
 const token=acquire();if(!token)return;
 running=true;const heartbeat=setInterval(()=>renew(token),30_000);
 try {
  const history=runs();
  // Interrupted work comes first; failed accounts retry at the next hourly interval, at most 3 times.
  let run=history.find(r=>(r.state==='pending'||r.state==='running')&&(!r.history||!c.history_paused));
  if(!run) {
   const now=Date.now();
   const candidates=accounts().map(spec=>{
    const last=history.filter(r=>r.account===spec.id&&!r.history).sort((a,b)=>Date.parse(b.ended_at??b.started_at)-Date.parse(a.ended_at??a.started_at))[0];
    const at=Date.parse(last?.ended_at??last?.started_at??'1970-01-01');
    const stored=db().prepare('SELECT value FROM mail_intake_coverage WHERE account=?').get(spec.id) as {value:string}|undefined;
    const snapshot=stored?JSON.parse(stored.value):null;
    const unreadDraining=c.unread_first&&last?.state==='completed'&&spec.kind==='imap'&&snapshot?.unread_remaining>0;
    const draining=last?.state==='completed'&&((spec.initialInbox||spec.kind==='proton-export')&&snapshot?.remaining>0||unreadDraining);
    const due=!last||now-at>=c.interval_minutes*60_000;
    // Check all due ordinary accounts and drain their unread batches before a
    // deferred account. An initial read backlog must not starve that account.
    const priority=c.unread_first&&c.deferred_accounts?.length
     ? !due&&draining&&!unreadDraining ? 2 : c.deferred_accounts.includes(spec.id)?1:0
     : 0;
    return {spec,last,at,snapshot,ready:due||draining,priority};
   }).filter(row=>row.ready).sort((a,b)=>a.priority-b.priority||a.at-b.at);
   for(const {spec,last,snapshot} of candidates) {
    const account=spec.id;
    if(spec.kind==='proton-export'&&last?.state==='completed'&&snapshot?.remaining===0)continue;
    if(last?.state==='failed') {if(last.attempts>=3)continue;run=last;break;}
    run={id:randomUUID(),account,requested_by:'automatic',state:'pending',phase:'fetch',items:[],attempts:0,started_at:new Date().toISOString()};break;
   }
  }
  if(!run && historyWindowOpen(c) && !financeWorkerActive()) {
   for(const account of historyAccounts().sort((a,b)=>{const last=(id:string)=>history.find(r=>r.account===id&&r.history);return Date.parse(last(a)?.ended_at??last(a)?.started_at??'1970-01-01')-Date.parse(last(b)?.ended_at??last(b)?.started_at??'1970-01-01');})) {
    const last=history.find(r=>r.account===account&&r.history);
    const stored=db().prepare('SELECT value FROM mail_intake_coverage WHERE account=?').get(account+'::history') as {value:string}|undefined;
    if(last?.state==='failed'){if(last.attempts>=3||Date.now()-Date.parse(last.ended_at!)<3600000)continue;run=last;break;}
    if(stored&&JSON.parse(stored.value).remaining===0&&Date.now()-Date.parse(JSON.parse(stored.value).checked_at)<86400000)continue;
    run={id:randomUUID(),account,history:true,requested_by:'automatic',batch_size:adaptiveHistoryBatchSize(history),state:'pending',phase:'fetch',items:[],attempts:0,started_at:new Date().toISOString()};break;
   }
  }
  if(!run)return;
  try {await execute(run,c,token);} catch(e) {
   const paused=!config()?.enabled || config()?.authorization_id!==c.authorization_id;
   run.activity=undefined;
   run.state=paused?'pending':'failed';run.error=paused?'paused':(e instanceof Error && /^[a-z_]+$/.test(e.message)?e.message:'local_processing_failed');
   // A validator may fail after switching models, before the Memory-phase finally block.
   // Restore only after its process is known to have ended; never unload under an orphan.
   if(run.phase==='validate' && run.validator_id && getWorkerRunByUuid(run.validator_id)?.status!=='running' && !getActiveRun()) {
    const primary=loadRegelwerk().voice_consensus.voices.find(v=>v.enabled!==false && v.role==='primary_llm')?.lm_studio_model;
    if(primary)try {await prepareIntakeModel(primary,MAIL_INTAKE_CONTEXT_LENGTH,token);} catch {run.error='primary_restore_failed';}
   }
   // A completed validator can still leave votes missing. Keep the retry
   // budget, but do not reuse that completed validator on the next attempt.
   if(run.phase==='validate' && run.error==='incomplete_model_opinions')run.validator_id=undefined;
   if(!paused)run.attempts++;run.ended_at=new Date().toISOString();save(run);
  }
 } finally {clearInterval(heartbeat);release(token);running=false;}
}
let started=false;
export function startIntakeRuntime() {
 if(started || process.env.FOLIO_AUTOMAIL_RUNTIME!=='1')return;
 started=true;setInterval(()=>void tick().catch(()=>console.error('[mail-intake] tick failed')),30_000).unref();
 void tick().catch(()=>console.error('[mail-intake] startup failed'));
}
