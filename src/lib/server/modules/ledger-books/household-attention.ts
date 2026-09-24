import {addMonth,expenseCategories,monthLabel,type HouseholdDirection,type HouseholdEntry,type HouseholdNotice,type HouseholdSettings} from '$lib/ledger-household.js';
import {expenseBranch,incomeSourceCategory} from './household-hierarchy.js';
import {explainComparison} from './household-comparison.js';
const days=(a:string,b:string)=>Math.round((Date.parse(a)-Date.parse(b))/86400000);
const median=(xs:number[])=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
const euros=(n:number,currency:string)=>(n>0&&n<50?'< 100':new Intl.NumberFormat('de-CH',{maximumFractionDigits:0}).format(Math.round(n/100)*100))+' '+currency;
const dateLabel=(date:string)=>date.split('-').reverse().join('.');
/** Read-only observations. Expected recurrence is never evidence of an unpaid bill. */
export function householdNotices(all:HouseholdEntry[],selected:HouseholdEntry[],settings:HouseholdSettings,direction:HouseholdDirection,today:string,covered:(account:string,month:string)=>boolean=()=>false):HouseholdNotice[]{
 const notices:HouseholdNotice[]=[];
 if(direction==='credit'){
  for(const source of settings.income_sources){if(!source.end_date)continue;
   const path={category:incomeSourceCategory(source),subcategory:'source_'+source.id},left=days(source.end_date,today);
   notices.push({id:'expiry_'+source.id,kind:'expiry',category:path.category,subcategory:path.subcategory,date:source.end_date,urgent:left<=30,label:source.label+' · '+(left>=0?'noch '+left+' Tage':'Hinterlegte Laufzeit beendet'),detail:`Hinterlegtes Leistungsende ${dateLabel(source.end_date)}. ${source.date_source??'Hinterlegte Laufzeit'}. Stand ${dateLabel(today)}, unabhängig vom gewählten Buchungszeitraum. Kalendertage sind keine verbleibenden Taggelder.`});
  }
  return notices;
 }
 const debits=all.filter(e=>e.amount<0&&!e.aggregate&&e.fee_component?.status!=='estimated'&&e.date<=today);
 const recurring=new Map<string,HouseholdEntry[]>();
 for(const e of debits){
  if(expenseCategories.find(c=>c.id===e.category)?.kind!=='fixed')continue;
  const path=expenseBranch(e);if(path.partner.tentative)continue;
  // Account and amount lanes prevent separate contracts from masquerading as one monthly payment.
  const key=[e.category,path.partner.id,e.account,e.currency,Math.round(Math.abs(e.amount)/5)].join('|');
  const list=recurring.get(key)??[];list.push(e);recurring.set(key,list);
 }
 for(const [key,values] of recurring){
  values.sort((a,b)=>b.date.localeCompare(a.date));const latest=values[0];
  if(days(today,latest.date)>62||latest.date>today)continue;
  const lastMonth=latest.date.slice(0,7),sample:HouseholdEntry[]=[];
  // An old amount lane must not survive a missing or changed payment in a newer covered month.
  if(all.some(e=>e.account===latest.account&&e.date.slice(0,7)>lastMonth&&e.date<=today&&covered(e.account,e.date.slice(0,7))))continue;
  for(let n=0;n<3;n++){const month=addMonth(lastMonth,-n),items=values.filter(e=>e.date.startsWith(month));if(items.length!==1||!covered(latest.account,month))break;sample.push(items[0]);}
  if(sample.length!==3)continue;
  const ds=sample.map(e=>Number(e.date.slice(8))),amounts=sample.map(e=>Math.abs(e.amount));
  if(Math.max(...ds)-Math.min(...ds)>6||Math.max(...amounts)/Math.min(...amounts)>1.15)continue;
  const day=median(ds),month=addMonth(lastMonth,1),maxDay=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).getUTCDate();
  const due=month+'-'+String(Math.min(day,maxDay)).padStart(2,'0');
  // Never leap over an unobserved instalment to invent the following due date.
  if(due<today||days(due,today)>30)continue;
  const path=expenseBranch(latest),amount=median(sample.map(e=>Math.abs(e.display_amount)));
  notices.push({id:'expected_'+key,kind:'expected',category:latest.category,subcategory:path.subcategory,partner:path.partner.id,date:due,amount,urgent:false,label:path.partner.label+' · Prognose um '+dateLabel(due),detail:`Ca. ${euros(amount,settings.currency)} aus drei aufeinanderfolgenden, vollständig erfassten Monaten. Letzte Buchung ${dateLabel(latest.date)}. Prognose aus dem bisherigen Rhythmus; kein bestätigter Fälligkeitstermin und kein Nachweis einer offenen Rechnung.`,evidence:sample.map(e=>({id:e.id,date:e.date,label:path.partner.label,amount:Math.abs(e.amount),currency:e.currency}))});
 }
 // Compare like-for-like calendar months only where all selected accounts have statement coverage.
 const selectedMonths=[...new Set(selected.filter(e=>e.date<=today).map(e=>e.date.slice(0,7)))];
 const paths=new Map<string,{category:string;subcategory?:string;partner?:string;label:string;values:HouseholdEntry[]}>();
 for(const e of debits){const p=expenseBranch(e);for(const level of [0,1,2]){const key=[e.category,level>=1?p.subcategory:'',level>=2?p.partner.id:''].join('|');let path=paths.get(key);if(!path){path={category:e.category,subcategory:level>=1?p.subcategory:undefined,partner:level>=2?p.partner.id:undefined,label:level===2?p.partner.label:level===1?p.label:expenseCategories.find(c=>c.id===e.category)!.label,values:[]};paths.set(key,path);}path.values.push(e);}}
 const shownComparisons=new Set<string>();
 for(const [key,path] of paths){let highest:HouseholdNotice|undefined,largestDelta=0,fingerprint='';
  for(const month of selectedMonths){const current=path.values.filter(e=>e.date.startsWith(month));if(!current.length)continue;
   const basis=[1,2,3].map(n=>addMonth(month,-n)),relevant=path.values.filter(e=>[month,...basis].includes(e.date.slice(0,7))),accounts=[...new Set(relevant.map(e=>e.account))];
   if(!accounts.every(a=>[month,...basis].every(m=>covered(a,m))))continue;
   const totals=basis.map(m=>path.values.filter(e=>e.date.startsWith(m)).reduce((n,e)=>n+Math.abs(e.display_amount),0));
   const baseline=median(totals),value=current.reduce((n,e)=>n+Math.abs(e.display_amount),0),delta=value-baseline;
   if(baseline<=0)continue;
   if(value<baseline*1.5||delta<200||delta<=largestDelta)continue;
   largestDelta=delta;fingerprint=month+'|'+relevant.map(e=>e.id).sort().join('|');
   highest={id:'unusual_'+key,kind:'unusual',category:path.category,subcategory:path.subcategory,partner:path.partner,date:month+'-01',amount:value,urgent:false,label:monthLabel(month,true)+' · '+euros(delta,settings.currency)+' mehr Abfluss',detail:`Rückblick · ${path.label}: ${euros(value,settings.currency)} in ${monthLabel(month,true)} gegenüber ${euros(baseline,settings.currency)} Monatsmedian der drei Vormonate. Vergleich nach Buchungsdatum; kein festgelegtes Budget und kein Nachweis einer Preis- oder Prämienerhöhung.`,...explainComparison(path.values,month,covered)};
  }
  if(highest&&!shownComparisons.has(fingerprint)){notices.push(highest);shownComparisons.add(fingerprint);}
 }
 return notices.sort((a,b)=>(a.date??'').localeCompare(b.date??'')||a.id.localeCompare(b.id));
}
