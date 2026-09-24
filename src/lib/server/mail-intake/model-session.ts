import {getLmStudioBaseUrl} from '../env.js';
import { acquire,renew,release } from './state.js';
import { MAIL_INTAKE_CONTEXT_LENGTH, MAIL_REVIEW_CONTEXT_LENGTH, prepareIntakeModel } from './runner.js';
import { isBusy } from '../worker-runner/manager.js';
import { loadRegelwerk } from '../regelwerk/loader.js';
export class MailModelSessionError extends Error {}
/** A manual Memory call owns the same model lease as incoming mail and comparisons. */
export async function withMailModel<T>(role:'primary_llm'|'conditional_reviewer',work:()=>Promise<T>, modelOverride?:string):Promise<T> {
 if(isBusy())throw new MailModelSessionError('Das lokale Modell wird gerade vom Maileingang genutzt.');
 const token=acquire();if(!token)throw new MailModelSessionError('Eine lokale Modellprüfung läuft bereits.');
 const heartbeat=setInterval(()=>renew(token),30_000);
 let primary:string|undefined;
 try {
 const voices=loadRegelwerk().voice_consensus.voices.filter(v=>v.enabled!==false);
 const model=modelOverride??voices.find(v=>v.role===role)?.lm_studio_model;
 primary=voices.find(v=>v.role==='primary_llm')?.lm_studio_model??undefined;
  const requiredContext=role==='conditional_reviewer'?MAIL_REVIEW_CONTEXT_LENGTH:MAIL_INTAKE_CONTEXT_LENGTH;
  if(!model)throw new MailModelSessionError('Kein passendes lokales Modell konfiguriert.');
  try {
   let ready=false;
   if(modelOverride){
    const base=new URL(getLmStudioBaseUrl());
    if(base.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(base.hostname)||base.username||base.password)throw new Error('Local model required');
    try{const r=await fetch(base.origin+'/api/v1/models',{redirect:'error',signal:AbortSignal.timeout(2000)});if(r.ok){const data=await r.json();ready=data.models?.some((m:{key:string;loaded_instances?:Array<{config?:{context_length?:number}}>})=>m.key===model&&m.loaded_instances?.some(instance=>(instance.config?.context_length??0)>=requiredContext))===true;}}catch{}
   }
   if(!ready)await prepareIntakeModel(model,requiredContext,token);
  } catch {throw new MailModelSessionError('Das lokale Modell konnte nicht geladen werden. Bitte LM Studio prüfen.');}
  return await work();
 } finally {
  try {if(role==='conditional_reviewer'&&primary)await prepareIntakeModel(primary,MAIL_INTAKE_CONTEXT_LENGTH,token);} finally {clearInterval(heartbeat);release(token);}
 }
}
