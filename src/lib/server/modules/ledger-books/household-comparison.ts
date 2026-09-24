import {addMonth,monthLabel,type HouseholdEntry} from '$lib/ledger-household.js';
import {expenseBranch} from './household-hierarchy.js';

const median=(xs:number[])=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
const money=(n:number,currency:string)=>new Intl.NumberFormat('de-CH',{style:'currency',currency}).format(n);
const total=(xs:HouseholdEntry[])=>xs.reduce((n,e)=>n+Math.abs(e.amount),0);
const text=(e:HouseholdEntry)=>(e.title+' '+e.purpose).normalize('NFKC').replace(/\s+/g,' ');
function group(e:HouseholdEntry){
 const p=expenseBranch(e),premium=e.category==='insurance'&&/PR[ÄA]MIEN\s*(?:AB\s*)?RECHNUNG/i.test(text(e));
 // For unnamed payees only an explicit destination IBAN can join different bookings.
 const iban=text(e).match(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/)?.[0];
 return {key:[p.partner.tentative?(iban??e.id):p.partner.id,e.account,e.currency,premium].join('|'),label:p.partner.label+(premium?' · Prämien laut Buchungstext':''),premium};
}

/** Explain bank outflows without inferring contracts, annual premiums or unpaid invoices. */
export function explainComparison(values:HouseholdEntry[],month:string,covered:(account:string,month:string)=>boolean){
 const current=values.filter(e=>e.date.startsWith(month));
 const basis=[1,2,3].map(n=>addMonth(month,-n));
 const groups=new Map<string,HouseholdEntry[]>();
 for(const e of current){const k=group(e).key;groups.set(k,[...groups.get(k)??[],e]);}
 const history=new Map<string,HouseholdEntry[]>();
 for(const e of values){const k=group(e).key;history.set(k,[...history.get(k)??[],e]);}
 const explanations=[...groups].map(([key,rows])=>{
  const g=group(rows[0]),same=history.get(key)??[],prior=basis.map(m=>total(same.filter(e=>e.date.startsWith(m))));
  const sum=total(rows),baseline=median(prior),currency=rows[0].currency;
  const name=g.label==='Buchungspartner offen'?'Buchungen an denselben Empfänger':g.label;
  let detail=`${name}: ${money(sum,currency)} aus ${rows.length} ${rows.length===1?'Buchung':'Buchungen'}.`;
  if(baseline>0&&Math.abs(sum-baseline)<.01)detail+=' Monatsbetrag gegenüber dem Vergleich unverändert.';
  else if(baseline>0)detail+=` Vergleichsmedian: ${money(baseline,currency)}.`;
  else detail+=' In den drei Vergleichsmonaten keine regelmässige Zahlung dieser Gruppe.';
  if(rows.length>1&&baseline>0&&rows.every(e=>Math.abs(Math.abs(e.amount)-baseline)<.01))detail+=' Mehrere gleich hohe Zahlungen in einem Buchungsmonat; der Leistungszeitraum ist daraus nicht belegt.';
  const year=addMonth(month,-12),lastYear=same.filter(e=>e.date.startsWith(year));
  if(lastYear.length&&covered(rows[0].account,year))detail+=` ${monthLabel(year,true)}: ${money(total(lastYear),currency)}. Gleicher Empfänger und Buchungsmonat, Vertragsgleichheit nicht geprüft.`;
  return {detail,delta:sum-baseline};
 }).sort((a,b)=>b.delta-a.delta).slice(0,6).map(x=>x.detail);
 const evidence=current.sort((a,b)=>Math.abs(b.display_amount)-Math.abs(a.display_amount)||a.id.localeCompare(b.id)).slice(0,12).map(e=>({id:e.id,date:e.date,label:group(e).label,amount:Math.abs(e.amount),currency:e.currency}));
 return {explanations,evidence};
}
