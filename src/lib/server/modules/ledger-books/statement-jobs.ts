import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { atomicPrivateJson,documentBytes } from '../../file-intake/document-security.js';
import { maintainDocumentSignatures } from '../../file-intake/signature-maintenance.js';
import { manualImportRoot,previewManualStatement,readManualStatementImport,reconcileStatementPayments } from './manual-import.js';
interface StatementJob {id:string;selection:string;sha256:string;account:string;profile:string;status:'queued'|'running'|'completed'|'failed';message:string;pid:number;updated_at:string;}
const path=()=>join(manualImportRoot(),'ui-job.json');
export function statementJob():StatementJob|null {try{return JSON.parse(documentBytes(path(),16384).toString());}catch{return null;}}
function alive(pid:number){try{process.kill(pid,0);return true;}catch{return false;}}
let running=false;
export function queueStatementJob(selection:string,sha256:string,account:string,profile:string){
 const old=statementJob();if(old&&['running','queued'].includes(old.status)&&alive(old.pid))throw Error('statement_job_busy');
 const file=readManualStatementImport().files.find(f=>f.id===selection&&f.sha256===sha256);
 if(!file?.accounts.some(a=>a.ref===account&&a.profiles.includes(profile)))throw Error('statement_selection_changed');
 const job:StatementJob={id:randomUUID(),selection,sha256,account,profile,status:'queued',message:'Auszug wird im Hintergrund geprüft.',pid:process.pid,updated_at:new Date().toISOString()};
 atomicPrivateJson(path(),job);setTimeout(()=>void tickStatementJob(),0);return job;
}
export async function tickStatementJob(){
 if(running)return;const job=statementJob();if(!job||!['queued','running'].includes(job.status))return;
 if(job.pid!==process.pid&&alive(job.pid))return;
 running=true;
 const update=(status:StatementJob['status'],message:string)=>{Object.assign(job,{status,message,pid:process.pid,updated_at:new Date().toISOString()});atomicPrivateJson(path(),job);};
 try{
  update('running','Sicherheitsprüfung vorbereiten …');await maintainDocumentSignatures();
  update('running','Auszug einlesen und Salden prüfen …');
  const result=await previewManualStatement(job.selection,job.sha256,job.account,job.profile,true);
  if(result.status!=='staged_unbooked')throw Error(result.reason_code);
  update('running','Bestehende Zahlungsnachweise aktualisieren …');await reconcileStatementPayments();
  update('completed','Auszug eingelesen und Salden geprüft.');
 }catch(error){update('failed',error instanceof Error&&/^[a-z_]+$/.test(error.message)?error.message:'statement_import_failed');}
 finally{running=false;}
}
