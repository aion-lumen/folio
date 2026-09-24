import { db } from '../mail-intake/state.js';
import { getFeedbackRowById, getFeedbackRowsByTerms } from '../feedback/reader.js';
import { isDemoVaultActive } from '../env.js';
const noise=new Set('hello hey thanks thank good morning test voice microphone how are doing please can could would will you your me my find search look email emails mail mails message messages next tell about what when where which does have has the this that with from into calendar appointment add create schedule und oder bitte kannst meine meinen meinem meiner mein suche suchen finde finden nach nächste nächster nächsten wann welche welcher wo mir mich du eine einer einen einem ist sind der die das des den dem ein einen von vom mit für im in zu zum zur kalender termin eintragen eintrage anlegen erstelle erstellen fr frau herr'.split(' '));
export function mailQueryTerms(question:string){
 const terms=[...new Set((question.toLocaleLowerCase('de-CH').match(/[\p{L}\p{N}@._+-]{2,80}/gu)??[]).map(t=>t.replace(/^[._+-]+|[._+-]+$/g,'')).filter(t=>t.length>=2&&!noise.has(t)))].slice(0,12);
 return terms;
}
/** Bounded read-only context for the owner's local companion. No model-selected SQL or IMAP. */
export function companionMail(question:string,limit=3){
 const terms=mailQueryTerms(question);if(isDemoVaultActive()||!terms.length)return {scope:'local_captures_only',sources:[]};
 const resultLimit=Math.max(1,Math.min(100,Math.trunc(limit)||3)),candidateLimit=Math.max(240,resultLimit*8);
 const appointmentIntent=/\b(termin\w*|appointment\w*|meeting\w*)\b/i.test(question);
 const conn=db(),escaped=terms.map(t=>'%'+t.replace(/[\\%_]/g,'\\$&')+'%');
 const bodyRows=conn.prepare(`SELECT feedback_id,account,uid,body,truncated FROM mail_intake_sources WHERE ${terms.map(()=>"lower(body) LIKE ? ESCAPE '\\'").join(' OR ')} ORDER BY feedback_id DESC LIMIT ?`).all(...escaped,candidateLimit) as {feedback_id:number;account:string;uid:number;body:string;truncated:number}[];
 const feedbackById=new Map(getFeedbackRowsByTerms(terms,Math.min(500,candidateLimit)).map(row=>[row.id,row]));
 const metadataIds=[...feedbackById.keys()];
 const metadataRows=metadataIds.length?conn.prepare(`SELECT feedback_id,account,uid,body,truncated FROM mail_intake_sources WHERE feedback_id IN (${metadataIds.map(()=>'?').join(',')})`).all(...metadataIds) as typeof bodyRows:[];
 const rows=[...new Map([...bodyRows,...metadataRows].map(row=>[row.feedback_id,row])).values()];
 const matches=rows.map(row=>{
  const feedback=feedbackById.get(row.feedback_id)??getFeedbackRowById(row.feedback_id);if(!feedback||feedback.account_id!==row.account||feedback.imap_uid!==row.uid)return null;
  const text=(feedback.subject+' '+feedback.sender+' '+row.body).toLocaleLowerCase('de-CH');
  const matchedTerms=terms.filter(t=>new RegExp('(^|[^\\p{L}\\p{N}])'+t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'($|[^\\p{L}\\p{N}])','iu').test(text));
  const appointmentPattern=/\b(termin\w*|appointment\w*|meeting\w*)\b/i;
  const appointmentScore=appointmentIntent?(appointmentPattern.test(feedback.subject)?4:appointmentPattern.test(row.body)?1:0):0;
  const score=matchedTerms.length?matchedTerms.length+appointmentScore:0;
  if(!score)return null;
  const first=Math.min(...terms.map(t=>row.body.toLocaleLowerCase('de-CH').indexOf(t)).filter(i=>i>=0));const start=Math.max(0,(Number.isFinite(first)?first:0)-200);
  return {feedbackId:row.feedback_id,score,matchedTerms,source:`mail:${feedback.account_id}:${feedback.imap_uid}`,subject:feedback.subject,sender:feedback.sender,received:feedback.mail_date,excerpt:row.body.slice(start,start+1600),incomplete:Boolean(row.truncated)||start>0||row.body.length>1600};
 }).filter((r):r is NonNullable<typeof r>=>r!==null).sort((a,b)=>b.score-a.score||(Date.parse(b.received??'')||0)-(Date.parse(a.received??'')||0)).slice(0,resultLimit);
 return {scope:'local_captures_only',sources:matches};
}
