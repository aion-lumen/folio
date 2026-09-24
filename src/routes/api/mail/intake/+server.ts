import { accounts } from '$lib/server/mail-intake/accounts.js';
import { mailCoverage } from '$lib/server/mail-intake/coverage.js';
import { error,json } from '@sveltejs/kit';
import { config,configure,runs,getIntakeRun,locked,save } from '$lib/server/mail-intake/state.js';
import { requestManualIntake,tick } from '$lib/server/mail-intake/runner.js';
import { historyWindowStatus } from '$lib/server/mail-intake/runner.js';
import { isDemoVaultActive } from '$lib/server/env.js';
import {prepareIntakeRetry} from '$lib/server/mail-intake/retry.js';
import { requireModuleCapability } from '$lib/server/modules/http.js';
import type { RequestHandler } from './$types.js';
export const GET: RequestHandler=({locals})=>{
 if(locals.user.role!=='owner')throw error(403,'Owner access required');
 const recent=runs();
 const current=config();
 return json({coverage:mailCoverage(),config:current,historyWindow:current?historyWindowStatus(current):null,busy:locked()||recent.some(run=>run.state==='pending'||run.state==='running'),runs:recent.slice(0,30),runtime:process.env.FOLIO_AUTOMAIL_RUNTIME==='1'},{headers:{'Cache-Control':'private, no-store'}});
};
export const POST: RequestHandler=async({locals,request,url})=>{
 if(locals.user.role!=='owner')throw error(403,'Owner access required');
 if(isDemoVaultActive())throw error(403,'Demo mail intake disabled');
 if(request.headers.get('origin')!==url.origin||!request.headers.get('content-type')?.startsWith('application/json'))throw error(403,'Mail-Lauf bitte direkt in Folio steuern');
 const input=await request.json().catch(()=>null);
 if(input?.action==='enable'||input?.action==='pause') {
  if(input.action==='enable' && process.env.FOLIO_AUTOMAIL_RUNTIME!=='1')throw error(503,'Runtime disabled');
  if(input.batch_size!==undefined && (!Number.isInteger(input.batch_size)||input.batch_size<1||input.batch_size>30))throw error(400,'Invalid batch size');
  if(input.action==='enable' && (typeof input.authorization_ref!=='string'||!input.authorization_ref.trim()||input.authorization_ref.length>500))throw error(400,'Authorization reference required');
  for(const key of ['career_rejections','history_paused','unread_first'])if(input[key]!==undefined&&typeof input[key]!=='boolean')throw error(400,'Invalid intake scope');
  if(input.deferred_accounts!==undefined&&(!Array.isArray(input.deferred_accounts)||input.deferred_accounts.some((id:unknown)=>typeof id!=='string'||!accounts().some(a=>a.id===id))||new Set(input.deferred_accounts).size!==input.deferred_accounts.length))throw error(400,'Invalid account priority');
  if(input.career_rejections===true)requireModuleCapability('career','events.write');
  configure(input.action==='enable',`owner:${locals.user.id}`,input.authorization_ref??'Owner paused automatic mail intake',input.batch_size??30,{career_rejections:input.career_rejections,history_paused:input.history_paused,unread_first:input.unread_first,deferred_accounts:input.deferred_accounts});
 } else if(input?.action==='retry' && typeof input.run_id==='string') {
  if(process.env.FOLIO_AUTOMAIL_RUNTIME!=='1')throw error(503,'Runtime disabled');
  if(locked())throw error(409,'Run active');
  const run=getIntakeRun(input.run_id);if(!run||run.state!=='failed')throw error(409,'No failed run');
  save(prepareIntakeRetry(run,input.preserve_attempts===true));
 } else if(input?.action==='run_now') {
  if(process.env.FOLIO_AUTOMAIL_RUNTIME!=='1')throw error(503,'Runtime disabled');
  if(typeof input.account!=='string')throw error(400,'Unknown account');
  const batchSize=input.batch_size??config()?.batch_size;
  let run;
  try {run=requestManualIntake({account:input.account,history:input.history===true,batchSize,owner:`owner:${locals.user.id}`});}
  catch(cause) {const code=cause instanceof Error?cause.message:'manual_intake_failed';throw error(['unknown_account','history_not_enabled','invalid_batch_size'].includes(code)?400:409,code);}
  void tick().catch(()=>console.error('[mail-intake] manual tick failed'));
  return json({config:config(),run},{status:202});
 } else throw error(400,'Invalid action');
 void tick().catch(()=>console.error('[mail-intake] requested tick failed'));
 return json({config:config()});
};
