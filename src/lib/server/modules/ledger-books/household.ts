import {readTransferFees,assessTransferFees} from './transfer-fees.js';
import {householdViewEntries} from './household-views.js';
import type {HouseholdView,TransferFee} from '$lib/ledger-household.js';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {getSessionExchangePath} from '../../env.js';
import {documentBytes} from '../../file-intake/document-security.js';
import {canonicalHash} from './reconciliation.js';
import {readWealthOverview} from './wealth.js';
import {readTransferHistory} from './transfer-sources.js';
import {matchTransfers,transferProvider,type TransferMatch} from './transfers.js';
import {buildExpenseHierarchy,expenseBranch,buildIncomeHierarchy,incomeBranch,matchingIncomeSource} from './household-hierarchy.js';
import {householdNotices} from './household-attention.js';
import {addMonth,expenseCategories,incomeCategories,validDay,validMonth,type CategoryId,type HouseholdEntry,type HouseholdMonth,type HouseholdOverview,type HouseholdSettings} from '$lib/ledger-household.js';
import type {WealthOverview} from '$lib/ledger-wealth.js';
import type {DocumentSecurityReceipt,DocumentExtractionReceipt} from '../../file-intake/security-types.js';

export interface BankEntry {entry_id:string;account_ref:string;booking_date:string;amount:string;currency:string;counterparty:string|null;purpose:string;observation_id:string;evidence:{ref:string;sha256:string}[];}
export interface StatementSource {source_ref:string;source_sha256:string;account_ref:string;format:string;currency:string;declared_period?:{from:string;to:string};clearance:DocumentSecurityReceipt;extraction:DocumentExtractionReceipt;control_result:{complete:boolean;issues:string[]};}
export interface StatementBatch {schema:string;batch_sha256:string;entries:BankEntry[];sources:StatementSource[];issues:unknown[];bookkeeping:{ledger_db_touched:boolean};}
const root=()=>join(getSessionExchangePath(),'ledger');
const emptySettings:HouseholdSettings={schema:'folio/household-settings/v1',currency:'EUR',category_overrides:[],income_sources:[],projection_exclude:[],projection_equipment:[],property:null};
const bounded=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<=160;
const amount=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1e9;
export function validateHouseholdSettings(value:unknown):HouseholdSettings {
 const s=value as HouseholdSettings;
 if(s?.schema!=='folio/household-settings/v1'||!['EUR','CHF'].includes(s.currency)||!Array.isArray(s.category_overrides)||s.category_overrides.length>100||s.category_overrides.some(r=>!bounded(r.contains)||!expenseCategories.some(c=>c.id===r.category))||!Array.isArray(s.income_sources)||s.income_sources.length>12||new Set(s.income_sources.map(x=>x.id)).size!==s.income_sources.length)throw Error('household_settings');
 if(s.income_sources.some(x=>!/^\w{1,30}$/.test(x.id)||!bounded(x.label)||!Array.isArray(x.contains)||x.contains.length>20||x.contains.some(v=>!bounded(v))||(x.category!==undefined&&!incomeCategories.some(c=>c.id===x.category))||(x.end_date!==null&&!validDay(x.end_date))||(x.date_source!==null&&!bounded(x.date_source))))throw Error('household_income_settings');
 for(const list of [s.projection_exclude,s.projection_equipment])if(!Array.isArray(list)||list.length>100||list.some(v=>!bounded(v)))throw Error('household_projection_settings');
 if(s.property&&(!bounded(s.property.label)||![s.property.price,s.property.property,s.property.inventory].every(amount)||Math.abs(s.property.price-s.property.property-s.property.inventory)>.01||typeof s.property.paid!=='boolean'||!bounded(s.property.source)||!validDay(s.property.confirmed_at)))throw Error('household_property_settings');
 if(s.own_transfer_providers&&(!Array.isArray(s.own_transfer_providers)||s.own_transfer_providers.some(p=>!['wise','ib'].includes(p))))throw Error('household_ownership_settings');
 return s;
}
export function validateHouseholdBatch(b:StatementBatch){
 if(b?.schema!=='ledger/manual-statement-batch/v0'||b.bookkeeping?.ledger_db_touched!==false||!Array.isArray(b.entries)||b.entries.length>100000||!Array.isArray(b.sources)||b.sources.length>2000||!Array.isArray(b.issues)||canonicalHash({sources:b.sources,entries:b.entries,issues:b.issues})!==b.batch_sha256)throw Error('household_batch');
 const ids=new Set<string>();
 for(const e of b.entries){if(!/^txn_[a-f0-9]{16,64}$/.test(e.entry_id)||ids.has(e.entry_id)||!/^acct_[a-f0-9]{20}$/.test(e.account_ref)||!validDay(e.booking_date)||!/^[-]?\d+(\.\d+)?$/.test(e.amount)||!Number.isFinite(Number(e.amount))||Math.abs(Number(e.amount))>1e9||!/^[A-Z]{3}$/.test(e.currency)||typeof e.purpose!=='string'||e.purpose.length>20000||!Array.isArray(e.evidence)||e.evidence.length>20||e.evidence.some(v=>!/^[a-f0-9]{64}$/.test(v.sha256)||typeof v.ref!=='string'))throw Error('household_entry');ids.add(e.entry_id);}
 return b;
}
export function readHouseholdContext(){
 const result=readWealthOverview();if(!result.overview)throw Error('wealth_unavailable');
 const batch=validateHouseholdBatch(JSON.parse(documentBytes(join(root(),'manual-statements','statement-batch.json'),64*1024*1024).toString()));
 const settingsPath=join(root(),'wealth','household-settings.json');
 const settings=existsSync(settingsPath)?validateHouseholdSettings(JSON.parse(documentBytes(settingsPath,64*1024).toString())):emptySettings;
 const history=readTransferHistory();const transfers=matchTransfers(batch.entries,history.records);
 return {wealth:result.overview,batch,settings,stale:result.stale,history,transfers,fees:readTransferFees(history.records)};
}
const normalize=(s:string)=>s.toUpperCase().normalize('NFKC').replace(/\s+/g,' ');
const contains=(text:string,parts:string[])=>parts.some(p=>text.includes(normalize(p)));
const rules:[CategoryId,RegExp][]=[
 ['insurance',/SWICA|PAX.LEBEN|TONI DIGITAL/],['subscriptions',/SALT MOBILE|VODAFONE|FRAENK|YOUTUBE|NETFLIX|STRATO|INFOMANIAK|OPENAI|CURSOR|X CORP|X DEVELOPER|BANKPAKET|ENTGELTABRECHNUNG/],
 ['tax',/KFZ.STEUER|MOTOR\s*FAHRZEUGKONTROLLE|SERAFE|KASSE STEUERN/],['equipment',/GALAXUS|DIGITEC/],
 ['food',/ALDI|LIDL|PENNY|COOP\.|MIGROS |DROGERIE|H U E L|HUEL|BA.CKEREI/],['leisure',/CHINARESTAURANT|LOFT BAR|VALVE|DOENER/],['mobility',/PARKING|PARKHÄUSER/],['shopping',/BARBERSHOP|AMAZON/]
];
export function expenseCategory(e:Pick<BankEntry,'purpose'|'counterparty'>,settings:HouseholdSettings,transfer?:TransferMatch):CategoryId {const text=normalize((e.counterparty??'')+' '+e.purpose);if((transfer||transferProvider(e))&&transfer?.status!=='external_payment')return 'transfers';return settings.category_overrides.find(r=>contains(text,[r.contains]))?.category??rules.find(([,pattern])=>pattern.test(text))?.[0]??'unknown';}
export function converted(value:number,currency:string,wealth:WealthOverview,target:string){if(currency===target)return value;const c=wealth.conversion;const from=currency===c?.base?1:Number(c?.rates[currency]),to=target===c?.base?1:Number(c?.rates[target]);if(!Number.isFinite(from)||from<=0||!Number.isFinite(to)||to<=0)throw Error('household_fx_missing');return value*from/to;}
export function displayEntry(e:BankEntry,w:WealthOverview,s:HouseholdSettings,transfers?:Map<string,TransferMatch>):HouseholdEntry {const transfer=transfers?.get(e.entry_id);return {id:e.entry_id,date:e.booking_date,amount:Number(e.amount),display_amount:converted(Number(e.amount),e.currency,w,s.currency),currency:e.currency,account:w.accounts.find(a=>a.id===e.account_ref)?.label??'Kontoauszug',title:(e.counterparty||e.purpose.split('\n')[0]||'Kontobewegung').slice(0,180),purpose:e.purpose,category:expenseCategory(e,s,transfer),aggregate:false,...(transfer?{transfer}:{})};}
export function supplementaryEntries(w:WealthOverview,b:StatementBatch,s:HouseholdSettings){
 const covered=new Set(b.entries.map(e=>e.account_ref));
 return w.cashflows.flatMap(f=>{const account=w.accounts.find(a=>a.id===f.account_id&&a.kind==='bank');if(!account||covered.has(f.account_id))return [];
  return (['incoming','outgoing'] as const).filter(k=>Number(f[k])>0).map(kind=>{const amount=Number(f[kind])*(kind==='outgoing'?-1:1);return {account,entry:{id:'sum_'+canonicalHash([f,kind]).slice(0,24),date:f.month,amount,display_amount:converted(amount,f.currency,w,s.currency),currency:f.currency,account:account.label,title:kind==='incoming'?'Zugänge laut Monatsauszug':'Abgänge laut Monatsauszug',purpose:'Monatssumme des geprüften Auszugs. Ein einzelnes Buchungsdatum ist in dieser Bestandsprojektion nicht enthalten.',category:'unknown' as const,aggregate:true,...(kind==='incoming'&&account.evidence.profile==='chase-tagesgeld-de-v1'&&f.count===1&&Number(f.outgoing)===0?{income_source:'interest'}:{})}};});
 });
}
export function buildHousehold(w:WealthOverview,b:StatementBatch,s:HouseholdSettings,now=new Date(),stale=false,transfers?:Map<string,TransferMatch>,fees:Map<string,TransferFee>=assessTransferFees([...transfers?.values()??[]].flatMap(t=>t.record?[t.record]:[]),[])):HouseholdOverview {
 const last=b.entries.map(e=>e.booking_date.slice(0,7)).sort().at(-1);if(!last)throw Error('household_no_entries');
 // The slider covers the complete imported history, with a six-month initial view.
 const first=b.entries.map(e=>e.booking_date.slice(0,7)).sort()[0],months:HouseholdMonth[]=[];
 for(let m=first;m<=last;m=addMonth(m,1)){if(months.length>=240)throw Error('household_history_bound');months.push({month:m,incoming:0,outgoing:0,net:0,count:0,expenses:Object.fromEntries(expenseCategories.map(c=>[c.id,0])) as Record<CategoryId,number>,income:Object.fromEntries(s.income_sources.map(i=>[i.id,0])),coverage:b.sources.filter(v=>v.control_result?.complete&&v.declared_period&&v.declared_period.from.slice(0,7)<=m&&v.declared_period.to.slice(0,7)>=m).map(v=>v.account_ref).filter((x,i,a)=>a.indexOf(x)===i)});}
 const raw=[...b.entries.map(e=>displayEntry(e,w,s,transfers)),...supplementaryEntries(w,b,s).map(v=>v.entry)];
 const entriesFor=(view:HouseholdView)=>householdViewEntries(raw,s,fees,(n,c)=>converted(n,c,w,s.currency),view);
 const aggregate=(rows:HouseholdEntry[])=>{
  const list=months.map(m=>({...m,expenses:{...m.expenses},income:{...m.income},fees:{documented:0,estimated:0,estimated_count:0,documented_count:0}}));const map=new Map(list.map(m=>[m.month,m]));
  for(const e of rows){const m=map.get(e.date.slice(0,7));if(!m)continue;const value=e.display_amount;m.net+=value;m.count++;if(value<0){m.outgoing-=value;m.expenses[e.category]-=value;}else{m.incoming+=value;const source=matchingIncomeSource(e,s.income_sources);if(source)m.income[source.id]+=value;}
   if(e.fee_component?.status==='documented'){m.fees.documented-=value;m.fees.documented_count++;}else if(e.fee_component?.status==='estimated'){m.fees.estimated-=value;m.fees.estimated_count++;}
  }return list;
 };
 const householdEntries=entriesFor('household'),householdMonths=aggregate(householdEntries),accountMonths=aggregate(raw),transferMonths=aggregate(entriesFor('transfers'));
 const operating=new Map(householdMonths.slice(-3).map(m=>[m.month,{net:0,excluded:0,equipment:0,income:0}])),expiring=s.income_sources.find(i=>i.end_date);
 for(const e of householdEntries){const op=operating.get(e.date.slice(0,7));if(!op||e.aggregate)continue;const value=e.display_amount,text=normalize(e.title+' '+e.purpose);op.net+=value;
  if(!e.transfer&&!e.fee_component&&contains(text,s.projection_exclude))op.excluded+=value;
  if(!e.fee_component&&contains(text,s.projection_equipment))op.equipment+=value;
  if(value>0&&expiring&&contains(text,expiring.contains))op.income+=value;
 }
 const bankAccounts=new Set(b.entries.map(e=>e.account_ref));
 const median=(xs:number[])=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
 const liquid=w.accounts.reduce((n,a)=>n+converted(Number(a.cash),a.currency,w,s.currency),0),financial=w.accounts.reduce((n,a)=>n+converted(Number(a.total),a.currency,w,s.currency),0),valuations=w.valuations.reduce((n,v)=>n+converted(Number(v.amount),v.currency,w,s.currency),0);
 const estimate=(key:'low'|'high')=>w.estimates.reduce((n,e)=>n+converted(Number(e[key]),e.currency,w,s.currency),0);
 const completeBasis=months.slice(-3).length===3&&months.slice(-3).every(m=>[...bankAccounts].every(a=>m.coverage.includes(a)));
 return {months:householdMonths,account_months:accountMonths,transfer_months:transferMonths,batch_sha256:b.batch_sha256,currency:s.currency,as_of:now.toISOString().slice(0,10),accounts:w.accounts.map(a=>({id:a.id,label:a.label,as_of:a.as_of})),income_sources:s.income_sources,property:s.property,liquid,assets_low:financial+valuations+estimate('low'),assets_high:financial+valuations+estimate('high'),after_purchase:s.property&&!s.property.paid?liquid-s.property.price:null,fx_date:w.conversion?.date??null,fx_source:w.conversion?.source??null,stale,
  forecast:completeBasis&&!stale?{baseline:median([...operating.values()].map(o=>o.net-o.excluded-o.equipment)),monthly_income:median([...operating.values()].map(o=>o.income)),end_date:expiring?.end_date??null,basis_months:[...operating.keys()],band:1500}:null};
}
export function readHouseholdOverview(){try{const c=readHouseholdContext();return {household:{...buildHousehold(c.wealth,c.batch,c.settings,new Date(),c.stale,c.transfers,c.fees),transfer_history:{status:c.history.status,source_count:c.history.source_count,records:new Set(c.history.records.map(r=>r.id)).size,bank_legs:c.transfers.size,paired_legs:[...c.transfers.values()].filter(t=>t.status==='paired').length,matched_records:new Set([...c.transfers.values()].flatMap(t=>t.record?[t.record.id]:[])).size}},householdError:null};}catch{return {household:null,householdError:'Die Haushaltsdaten konnten nicht vollständig geprüft werden.'};}}
export function validateEntryQuery(params:URLSearchParams){const from=params.get('from')??'',to=params.get('to')??'',category=params.get('category')??'',group=params.get('group')??'',direction=params.get('direction')??'debit',offset=Number(params.get('offset')??0),batch=params.get('batch')??'',subcategory=params.get('subcategory')??'',partner=params.get('partner')??'',view=params.get('view')??'accounts';
 if(!['household','accounts','transfers'].includes(view)||!validMonth(from)||!validMonth(to)||from>to||(!(direction==='credit'?incomeCategories:expenseCategories).some(c=>c.id===category)&&category!=='')||!['','fixed','variable','unknown','transfer'].includes(group)||!['debit','credit','all'].includes(direction)||!Number.isSafeInteger(offset)||offset<0||offset>100000||!/^[a-f0-9]{64}$/.test(batch))throw Error('invalid_query');if((subcategory&&!/^[a-zA-Z0-9_]{1,40}$/.test(subcategory))||(partner&&!/^p_[a-f0-9]{24}$/.test(partner))||(subcategory&&!category)||(partner&&!subcategory))throw Error('invalid_query');return {from,to,category,group,direction,offset,batch,subcategory,partner,view:view as HouseholdView};}
function filteredHouseholdEntries(params:URLSearchParams){const query=validateEntryQuery(params),c=readHouseholdContext();if(query.batch!==c.batch.batch_sha256)throw Error('batch_changed');
 const entries=contextViewEntries(c,query.view).filter(e=>e.date.slice(0,7)>=query.from&&e.date.slice(0,7)<=query.to&&(query.direction==='all'||(query.direction==='debit'?e.amount<0:e.amount>0))).filter(e=>(!query.category||(query.direction==='credit'?incomeBranch(e,c.settings.income_sources).category:e.category)===query.category)&&(!query.group||expenseCategories.find(x=>x.id===e.category)?.kind===query.group)).sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
 const selected=entries.filter(e=>{if(!query.subcategory&&!query.partner)return true;const path=query.direction==='credit'?incomeBranch(e,c.settings.income_sources):expenseBranch(e);return (!query.subcategory||path.subcategory===query.subcategory)&&(!query.partner||path.partner.id===query.partner);});
 return {entries:selected,query,context:c,currency:c.settings.currency,batch_sha256:c.batch.batch_sha256};
}

export function householdEntries(params:URLSearchParams){
 const {entries,query,currency,batch_sha256}=filteredHouseholdEntries(params);
 return {entries:entries.slice(query.offset,query.offset+25),total:entries.length,total_amount:entries.reduce((s,e)=>s+e.display_amount,0),offset:query.offset,limit:25,currency,batch_sha256};
}
export function householdExpenseHierarchy(params:URLSearchParams){
 const direction=params.get('direction')??'debit';if(!['credit','debit'].includes(direction))throw Error('invalid_query');
 const {entries,context:c,currency,batch_sha256}=filteredHouseholdEntries(params);
 const all=contextViewEntries(c,params.get('view') as HouseholdView??'accounts');
 const as_of=new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Zurich'});
 const covered=(label:string,month:string)=>{const ids=c.wealth.accounts.filter(a=>a.label===label).map(a=>a.id);const end=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).toISOString().slice(0,10);return ids.length===1&&c.batch.sources.some(s=>s.account_ref===ids[0]&&s.control_result?.complete&&s.declared_period&&s.declared_period.from<=month+'-01'&&s.declared_period.to>=end);};
 return {categories:direction==='credit'?buildIncomeHierarchy(entries,c.settings.income_sources):buildExpenseHierarchy(entries),notices:(params.get('view')??'accounts')==='transfers'?[]:householdNotices(all,entries,c.settings,direction as 'credit'|'debit',as_of,covered),currency,batch_sha256,as_of,observed_through:all.map(e=>e.date).sort().at(-1)??''};
}

export function contextViewEntries(c:ReturnType<typeof readHouseholdContext>,view:HouseholdView){
 const raw=[...c.batch.entries.map(e=>displayEntry(e,c.wealth,c.settings,c.transfers)),...supplementaryEntries(c.wealth,c.batch,c.settings).map(e=>e.entry)];
 return householdViewEntries(raw,c.settings,c.fees,(n,currency)=>converted(n,currency,c.wealth,c.settings.currency),view);
}
