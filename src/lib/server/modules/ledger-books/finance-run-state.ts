import {existsSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {getFolioDbPath} from '../../env.js';
import {atomicPrivateJson,documentBytes} from '../../file-intake/document-security.js';
import type {StatementSelection} from './manual-import.js';
export const financeRunRoot=()=>join(dirname(getFolioDbPath()),'finance-run');
export interface FinanceRun {
 schema:'folio/finance-run/v1';id:string;status:'running'|'paused'|'completed'|'failed';phase:string;pid:number;
 started_at:string;updated_at:string;ended_at?:string;message:string;error?:string;
 statements:{file:StatementSelection;status:'pending'|'done'|'blocked'|'duplicate';reason?:string}[];
 payment_attempted:string[];payment_runs:string[];reviewed_links:string[];
 counts:Record<string,number>;batch_sha256?:string;corpus_sha256?:string;previous_run_id?:string;
}
/** Refresh the evidence snapshot only between workers, keeping the previous
 * completed run immutable and carrying forward exact review provenance. */
export function refreshedFinanceRun(previous:FinanceRun,batchHash:string,id:string,now:string,pid:number):FinanceRun{
 if(previous.batch_sha256!==batchHash)throw Error('statement_batch_changed');
 if(previous.statements.some(x=>x.status==='pending'||x.status==='blocked'))throw Error('statement_review_incomplete');
 const next=structuredClone(previous);
 if(previous.status==='completed'){
  next.id=id;next.previous_run_id=previous.id;next.started_at=now;
  next.payment_runs=[];
  for(const key of ['payment_reviewed','payment_new_confirmations','payment_preparation_failed'])next.counts[key]=0;
 }
 next.pid=pid;next.phase='discovery';next.status='running';delete next.ended_at;delete next.error;
 return next;
}
export function readFinanceRun():FinanceRun|null{try{const s=JSON.parse(documentBytes(join(financeRunRoot(),'current.json'),4*1024*1024).toString());return s.schema==='folio/finance-run/v1'?s:null;}catch{return null;}}
export function saveFinanceRun(s:FinanceRun){s.updated_at=new Date().toISOString();atomicPrivateJson(join(financeRunRoot(),'current.json'),s);atomicPrivateJson(join(financeRunRoot(),'runs',s.id+'.json'),s);}
export function requestFinancePause(pause:boolean){atomicPrivateJson(join(financeRunRoot(),'control.json'),{pause});}
export function financePaused(){const p=join(financeRunRoot(),'control.json');return existsSync(p)&&JSON.parse(documentBytes(p,1024).toString()).pause===true;}
export function financeWorkerActive(){const s=readFinanceRun();if(!s||!['running','paused'].includes(s.status))return false;try{process.kill(s.pid,0);return true;}catch{return false;}}
export function financeRunView(){const s=readFinanceRun();if(!s)return null;let alive=false;try{process.kill(s.pid,0);alive=true;}catch{};return {id:s.id,status:s.status,phase:s.phase,started_at:s.started_at,updated_at:s.updated_at,ended_at:s.ended_at,message:s.message,error:s.error,counts:s.counts,alive,statementDone:s.statements.filter(x=>x.status!=='pending').length,statementTotal:s.statements.length,blocked:s.statements.filter(x=>x.status==='blocked').map(x=>({name:x.file.name,reason:x.reason}))};}
