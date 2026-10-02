import { existsSync } from 'node:fs';
import { dirname,join } from 'node:path';
import { getFolioDbPath } from '../env.js';
import { getFolioDb } from '../folio-db/init.js';
import { documentBytes } from '../file-intake/document-security.js';
import { manualImportRoot } from '../modules/ledger-books/manual-import.js';
import { canonicalHash } from '../modules/ledger-books/reconciliation.js';
import { coveredStatementMonths } from '../modules/ledger-books/monthly-policy.js';
export const memoryWorkRoot=()=>join(dirname(getFolioDbPath()),'memory-work');
export interface WorkState {last_scan?:number;inventory_error?:string;statements?:Record<string,{status:string;reason?:string;attempts?:number;retry_at?:number;retired_status?:string}>;repairs:Record<string,{status:string;attempts:number;feedbackId?:number;grantId?:string;error?:string}>;monthly?:{fingerprint:string;attempted:string[];status:string;attempts:number;retry_at?:number;recorded:number;message?:string;error?:string};}
function read<T>(name:string,fallback:T):T{try{return JSON.parse(documentBytes(join(memoryWorkRoot(),name),256*1024).toString());}catch{return fallback;}}
export const memoryWorkStatus=()=>read<WorkState>('state.json',{repairs:{}});
export function batchSnapshot(){
 const path=join(manualImportRoot(),'statement-batch.json');if(!existsSync(path))return null;
 const b=JSON.parse(documentBytes(path,64*1024*1024).toString());
 if(b.schema!=='ledger/manual-statement-batch/v0'||b.bookkeeping?.ledger_db_touched!==false||b.batch_sha256!==canonicalHash({sources:b.sources,entries:b.entries,issues:b.issues}))throw Error('invalid_statement_batch');
 const accounts=[...new Set<string>(b.sources.map((s:{account_ref:string})=>s.account_ref))];
 const coverage=accounts.flatMap(account=>[...coveredStatementMonths(b.sources,account)].map(month=>({account,month})));
 if(!coverage.length)return null;
 const sources=b.sources.filter((s:{control_result?:{complete:boolean};account_ref:string})=>s.control_result?.complete&&coverage.some(c=>c.account===s.account_ref));
 const stableSources=[...new Set(sources.map((s:any)=>canonicalHash({account:s.account_ref,hash:s.source_sha256,period:s.declared_period})))].sort();
 const claims=getFolioDb().prepare("SELECT fact_id,value_text,source_excerpt,valid_from,status FROM memory_facts WHERE domain='finance' AND predicate='paid' AND status='candidate' AND supersedes_fact_id IS NULL ORDER BY fact_id").all();
 return {fingerprint:canonicalHash({policy:'monthly-payments/v8',claims,coverage:coverage.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),sources:stableSources}),batch:b};
}

/** An enabled or paused monthly workflow keeps questions in processing until
 * its complete input fingerprint has finished, including every budget batch. */
export function monthlyReconciliationPending():boolean {
 const policy=read<{statement_scope?:string;monthly_payments?:boolean}|null>('config.json',null);
 if(!policy?.statement_scope||policy.monthly_payments===false)return false;
 try{const current=batchSnapshot(),job=memoryWorkStatus().monthly;
  return !current||job?.fingerprint!==current.fingerprint||job.status!=='completed';
 }catch{return true;}
}
