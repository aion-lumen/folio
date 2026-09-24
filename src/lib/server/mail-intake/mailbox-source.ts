import { db } from './state.js';
import { accounts } from './accounts.js';
export interface SavedMailLocation {account:string;folder:string;epoch:number;uid:number;}
const EXCLUDED=new Set(['spam','junk','junk e-mail','bulk','bulk mail','trash','bin','deleted items','deleted messages','papierkorb','corbeille']);
export function isExcludedMemoryFolder(folder:string):boolean {
 return folder.toLowerCase().split(/[/.]/u).some(part=>EXCLUDED.has(part.trim()));
}
/** The history suffix is a local import namespace. Network access is resolved
 * only through an existing configured account AND its saved feedback binding. */
export function savedMailLocations(feedbackId:number,sourceAccount:string):SavedMailLocation[] {
 const configured=new Set(accounts().filter(a=>a.kind==='imap').map(a=>a.id));
 const rows=db().prepare('SELECT account,folder,epoch,uid FROM mail_intake_locations WHERE feedback_id=?').all(feedbackId) as SavedMailLocation[];
 return rows.filter(r=>configured.has(r.account)&&(r.account===sourceAccount||`${r.account}-history`===sourceAccount));
}
export function automaticMemorySourceEligibility(feedbackId:number,sourceAccount:string) {
 const locations=savedMailLocations(feedbackId,sourceAccount);
 return {eligible:!locations.length||locations.some(l=>!isExcludedMemoryFolder(l.folder)),reason:locations.length&&locations.every(l=>isExcludedMemoryFolder(l.folder))?'spam_or_trash_source':null};
}

/** Reuse a consistent source snapshot while rendering or closing a bounded batch. */
export function mailSourceEligibilitySnapshot(){
 const configured=new Set(accounts().filter(a=>a.kind==='imap').map(a=>a.id));
 const grouped=new Map<number,(SavedMailLocation&{feedback_id:number})[]>();
 for(const row of db().prepare('SELECT feedback_id,account,folder,epoch,uid FROM mail_intake_locations').all() as (SavedMailLocation&{feedback_id:number})[])
  if(configured.has(row.account))grouped.set(row.feedback_id,[...(grouped.get(row.feedback_id)??[]),row]);
 return (id:number,account:string)=>{
  const rows=(grouped.get(id)??[]).filter(r=>r.account===account||`${r.account}-history`===account);
  return !rows.length||rows.some(r=>!isExcludedMemoryFolder(r.folder));
 };
}
