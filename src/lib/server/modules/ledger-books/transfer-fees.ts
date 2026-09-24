import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { getFeedbackDbPath } from '../../env.js';
import { transferDebit, type WiseTransfer } from './transfers.js';
import type { TransferFee } from '$lib/ledger-household.js';
export interface FeeMail { id:number; sender:string; subject:string; mail_date:string; body_excerpt:string; }
const days=(a:string,b:string)=>Math.abs(Date.parse(a)-Date.parse(b))/86400000;
const median=(xs:number[])=>{const a=[...xs].sort((x,y)=>x-y),i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2;};
const number=(s:string)=>Number(s.replaceAll('.','').replace(',','.'));
/** Source text is data, never instructions. Require exact recipient amount,
 * completion date, known sender and a gross-minus-fee FX control. */
function feeFromMail(r:WiseTransfer,m:FeeMail):TransferFee|null {
 if(!/^(?:noreply@wise\.com|(?:info|support|noreply)@transferwise\.com)$/i.test(m.sender.trim())||!/^Geld ausgezahlt \(#\d+\)$|^Deine Überweisung \d+ ist unterwegs$/.test(m.subject)||(!m.mail_date||!Number.isFinite(days(m.mail_date.slice(0,10),r.completed))||days(m.mail_date.slice(0,10),r.completed)>1)||m.body_excerpt.length>20000||r.source_currency!=='CHF'||r.target_currency!=='EUR')return null;
 const text=m.body_excerpt.replaceAll('\\r',' ').replaceAll('\\n',' ').replace(/\s+/g,' ');
 const amounts=[...text.matchAll(/(?:(\d[\d.]*(?:,\d{1,2})?) EUR|€\s*(\d[\d.]*(?:,\d{1,2})?))/g)].map(v=>number(v[1]??v[2]));
 if(!amounts.some(n=>Math.abs(n-r.target_amount)<.005))return null;
 const fees=[...text.matchAll(/(?:Wise-Gebühr(?: betrug|:)?|unsere Gebühr bei)\s*(?:(?:SFr\.?)\s*(\d[\d.]*(?:,\d{1,2})?)|(\d[\d.]*(?:,\d{1,2})?)\s*CHF)/gi)].map(v=>number(v[1]??v[2]));
 const rates=[...text.matchAll(/(?:CHF zu EUR-Kurs lag bei|Kurs:|1 CHF =)\s*(\d+\.\d+)/g)].map(m=>m[1]);
 if(new Set(fees).size!==1||new Set(rates).size!==1)return null;
 const fee=fees[0],rate=Number(rates[0]),gross=transferDebit(r),precision=rates[0].split('.')[1].length;
 if(!Number.isFinite(rate)||rate<=0||!Number.isFinite(fee)||fee<0||fee>gross*.1||Math.abs((gross-fee)*rate-r.target_amount)>gross*.5*10**-precision+.025)return null;
 return {status:'documented',components:[{amount:fee,currency:'CHF'}],method:'Gebühr aus passender Wise-Mail; Betrag, Datum und Umrechnung geprüft.',samples:[],evidence:[{feedback_id:m.id,date:m.mail_date.slice(0,10),subject:m.subject,quote:text.match(/(?:Wise-Gebühr|unsere Gebühr bei).{0,55}/i)?.[0]??'',sha256:createHash('sha256').update(JSON.stringify(m)).digest('hex')}]};
}
export function assessTransferFees(records:WiseTransfer[],mails:FeeMail[]):Map<string,TransferFee>{
 const result=new Map<string,TransferFee>();
 const claims=mails.map(mail=>({mail,matches:records.flatMap(record=>{const fee=feeFromMail(record,mail);return fee?[{id:record.id,fee}]:[];})}));
 for(const r of records){
  if(r.source_fee!==null&&r.target_fee!==null){result.set(r.id,{status:'documented',components:[{amount:r.source_fee,currency:r.source_currency},{amount:r.target_fee,currency:r.target_currency}].filter(f=>f.amount>0),method:'Gebühren aus dem registrierten Wise-Export.',samples:[],evidence:[]});continue;}
  const candidates=claims.filter(c=>new Set(c.matches.map(m=>m.id)).size===1&&c.matches[0]?.id===r.id).map(c=>c.matches[0].fee);
  const values=new Set(candidates.map(f=>JSON.stringify(f.components)));
  if(values.size===1)result.set(r.id,{...candidates[0],evidence:candidates.flatMap(f=>f.evidence).slice(0,5)});
  else result.set(r.id,{status:'unknown',components:[],method:values.size>1?'Widersprüchliche Gebührenbelege.':'Keine passende Gebührenangabe.',samples:[],evidence:[]});
 }
 for(const r of records){
  const current=result.get(r.id)!;if(current.status!=='unknown'||current.method.startsWith('Widersprüchlich'))continue;
  // Never extrapolate from estimates. Prefer two years; for a minor fee only,
  // allow a third year when recent documented samples are insufficient.
  const eligible=records.filter(p=>p.id!==r.id&&p.source_currency===r.source_currency&&p.target_currency===r.target_currency&&days(p.completed,r.completed)<=1095&&transferDebit(p)>=transferDebit(r)/4&&transferDebit(p)<=transferDebit(r)*4&&result.get(p.id)?.status==='documented'&&result.get(p.id)!.components.every(f=>f.currency===r.source_currency)).sort((a,b)=>days(a.completed,r.completed)-days(b.completed,r.completed));
  const recent=eligible.filter(p=>days(p.completed,r.completed)<=730),extended=recent.length<3,peers=(extended?eligible:recent).slice(0,5);
  if(peers.length<3)continue;
  const rates=peers.map(p=>result.get(p.id)!.components.reduce((n,f)=>n+f.amount,0)/transferDebit(p)),rate=median(rates);
  if(rate<0||rate>.03||Math.max(...rates)-Math.min(...rates)>.01)continue;
  const amount=Math.round(transferDebit(r)*rate*100)/100;
  if(extended&&(r.source_currency!=='CHF'||amount>100))continue;
  result.set(r.id,{status:'estimated',components:[{amount,currency:r.source_currency}],method:`Median der Gebührenanteile von ${peers.length} ${r.source_currency}→${r.target_currency}-Überweisungen vergleichbarer Größe (höchstens ${extended?3:2} Jahre Abstand${extended?'; mangels aktueller Belege extrapoliert, unter 100 CHF':''}).`,samples:peers.map(p=>({id:p.id,date:p.completed,gross:transferDebit(p),fee:result.get(p.id)!.components.reduce((n,f)=>n+f.amount,0),currency:p.source_currency})),evidence:[]});
 }
 return result;
}
export function readTransferFees(records:WiseTransfer[]):Map<string,TransferFee>{
 let db:Database.Database|undefined;
 try{
  const file=getFeedbackDbPath();if(!existsSync(file))return assessTransferFees(records,[]);
  db=new Database(file,{readonly:true,fileMustExist:true});
  const mails=db.prepare("SELECT id,sender,subject,mail_date,body_excerpt FROM feedback WHERE lower(sender) IN ('noreply@wise.com','info@transferwise.com','support@transferwise.com','noreply@transferwise.com') AND body_excerpt IS NOT NULL ORDER BY mail_date DESC LIMIT 5001").all() as FeeMail[];
  return assessTransferFees(records,mails.length>5000?[]:mails);
 }catch{return assessTransferFees(records,[]);}finally{db?.close();}
}
