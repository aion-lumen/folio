import { db } from './state.js';
import { lookupMailBody } from '../hermes/mail-body.js';
import type { FeedbackRow } from '../feedback/types.js';
export function localMailSource(row: FeedbackRow) {
 const saved=db().prepare('SELECT * FROM mail_intake_sources WHERE feedback_id=?').get(row.id) as {account:string;uid:number;body:string;truncated:number}|undefined;
 if(saved) {
  if(saved.account!==row.account_id || saved.uid!==row.imap_uid)return {bodyText:null,bodyTruncated:true,source:'unavailable' as const};
  const capture=db().prepare('SELECT version FROM mail_intake_source_capture WHERE feedback_id=?').get(row.id);
  // Old captures omitted the decoder's own truncation flag (default limit: 2,000).
  return {bodyText:saved.body||null,bodyTruncated:Boolean(saved.truncated)||(!capture&&saved.body.length>=2000),source:'intake' as const};
 }
 const legacy=row.task_id && row.task_id!=='dryrun-task-id'?lookupMailBody(row.task_id):null;
 return {bodyText:legacy?.bodyText??row.body_excerpt??null,bodyTruncated:true,source:legacy?.bodyText?'kanban' as const:row.body_excerpt?'feedback' as const:'unavailable' as const};
}
export function memoryMailBody(row: FeedbackRow): string | null {
 const source=localMailSource(row);
 // Preserve legacy manual excerpt handling, but never pass a known-truncated intake capture.
 return source.source==='intake'&&source.bodyTruncated?null:source.bodyText;
}
