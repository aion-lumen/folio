import {describe,it,expect} from 'vitest';
import {householdNotices} from './household-attention.js';
import {buildIncomeHierarchy,incomeBranch} from './household-hierarchy.js';
import {validateEntryQuery} from './household.js';
import type {HouseholdEntry,HouseholdSettings} from '$lib/ledger-household.js';
const settings:HouseholdSettings={schema:'folio/household-settings/v1',currency:'EUR',category_overrides:[],income_sources:[{id:'rav',label:'Arbeitslosenkasse',contains:['Arbeitslosenkasse'],end_date:'2026-10-16',date_source:'Owner · zu prüfen'},{id:'interest',label:'Zinsen',contains:[],end_date:null,date_source:null}],projection_exclude:[],projection_equipment:[],property:null};
const entry=(id:string,date:string,amount=-50,title='Vodafone'):HouseholdEntry=>({id,date,amount,display_amount:amount,currency:'EUR',account:'Bank',title,purpose:'',category:'subscriptions',aggregate:false});
const sample=[entry('1','2026-06-26'),entry('2','2026-07-27'),entry('3','2026-08-26')];
describe('household attention and incoming hierarchy',()=>{
 it('never skips an elapsed expected payment to predict the month after it',()=>{
  const xs=sample.map(e=>({...e,date:e.date.slice(0,8)+'01'}));
  expect(householdNotices(xs,xs,settings,'debit','2026-09-20',()=>true).filter(n=>n.kind==='expected')).toEqual([]);
 });
 it('drops a stale amount lane when a newer covered month has other activity',()=>{
  const old=sample.map(e=>({...e,date:e.date.replace(/2026-(06|07|08)/,(_,m)=>'2026-'+String(Number(m)-1).padStart(2,'0'))}));
  const all=[...old,entry('changed','2026-08-20',-175)];
  expect(householdNotices(all,all,settings,'debit','2026-09-20',()=>true).filter(n=>n.kind==='expected')).toEqual([]);
 });
 it('explains unchanged premiums, additional settlements and a previous-year payment without declaring a tariff rise',()=>{
  const insurance=(id:string,date:string,n:number,title:string,purpose='')=>({...entry(id,date,n,title),category:'insurance' as const,purpose});
  const xs=[...['05','06','07','08'].map(m=>insurance('premium'+m,'2026-'+m+'-01',-700,'SWICA','P_PRÄMIENAB\nRECHNUNG')),
   insurance('extra','2026-08-14',-250,'SWICA','Rechnung für April'),insurance('annual','2026-08-18',-1100,'TONI DIGITAL'),insurance('prior','2025-08-18',-950,'TONI DIGITAL')];
  const n=householdNotices(xs,xs.filter(e=>e.date.startsWith('2026-08')),settings,'debit','2026-09-20',()=>true).find(n=>n.id==='unusual_insurance||')!;
  expect(n.urgent).toBe(false);expect(n.amount).toBe(2050);expect(n.detail).toContain('kein Nachweis einer Preis- oder Prämienerhöhung');
  expect(n.explanations?.join(' ')).toMatch(/Prämien laut Buchungstext.*unverändert/);
  expect(n.explanations?.join(' ')).toContain('Vertragsgleichheit nicht geprüft');expect(n.explanations?.join(' ')).not.toContain('Jahresprämie');
  expect(n.evidence?.map(e=>e.id).sort()).toEqual(['annual','extra','premium08']);
 });
 it('shows double payments to a named destination without claiming rent inflation',()=>{
  const xs=['04','05','06','07','07'].map((m,i)=>({...entry(String(i),'2026-'+m+'-'+(i===4?'31':'01'),-1000,'LASTSCHRIFT'),category:'home' as const,purpose:'DAUERAUFTRAG CH9300762011623852957'}));
  const ns=householdNotices(xs,xs.slice(-2),settings,'debit','2026-09-20',()=>true).filter(n=>n.kind==='unusual');
  expect(ns).toHaveLength(1);expect(ns[0].amount).toBe(2000);expect(ns[0].explanations?.join(' ')).toContain('Mehrere gleich hohe Zahlungen');
 });
 it('does not turn estimates, future entries or incomplete statement coverage into observed overspending',()=>{
  const xs=[...sample,entry('spike','2026-09-26',-800)];
  expect(householdNotices(xs,[xs[3]],settings,'debit','2026-09-20',()=>true).filter(n=>n.kind==='unusual')).toEqual([]);
  const estimated={...xs[3],fee_component:{status:'estimated' as const,components:[],method:'test',samples:[],evidence:[]}};
  expect(householdNotices([...sample,estimated],[estimated],settings,'debit','2026-09-30',()=>true).filter(n=>n.kind==='unusual')).toEqual([]);
 });
 it('partitions every positive movement exactly once, including unknown transfers and aggregate interest',()=>{
  const input=[entry('1','2026-08-10',1200,'Arbeitslosenkasse'),entry('2','2026-08-10',3000,'Gehalt'),entry('3','2026-08-10',50,'Refund'),entry('4','2026-08-10',700,'Eigenübertrag'),entry('5','2026-08-10',17,'Mystery'),{...entry('6','2026-08',111,'Zugänge laut Monatsauszug'),aggregate:true,income_source:'interest'},entry('debit','2026-08-10')];
  const tree=buildIncomeHierarchy(input,settings.income_sources);expect(tree.reduce((n,c)=>n+c.amount,0)).toBe(5078);expect(tree.reduce((n,c)=>n+c.count,0)).toBe(6);expect(tree.map(c=>c.id)).toHaveLength(6);
  for(const c of tree){expect(c.children.reduce((n,s)=>n+s.amount,0)).toBe(c.amount);for(const s of c.children)expect(s.partners.reduce((n,p)=>n+p.amount,0)).toBe(s.amount);}
  expect(incomeBranch(input[5],settings.income_sources).subcategory).toBe('source_interest');
 });
 it('does not treat a generic credit as salary, interest or a refund',()=>{expect(incomeBranch(entry('x','2026-08-01',50,'GUTSCHRIFT'),settings.income_sources).category).toBe('income_other');expect(incomeBranch({...entry('x','2026-08',50,'Zugänge laut Monatsauszug'),aggregate:true},settings.income_sources).category).toBe('income_other');});
 it('allows income leaves only with matching direction and bounded identifiers',()=>{const params=new URLSearchParams({from:'2026-08',to:'2026-08',batch:'a'.repeat(64),direction:'credit',category:'income_benefits',subcategory:'source_rav',partner:'p_'+'a'.repeat(24)});expect(validateEntryQuery(params).direction).toBe('credit');params.set('direction','debit');expect(()=>validateEntryQuery(params)).toThrow();});
 it('keeps known income expiry independent of the historic window and retains its provenance',()=>{const notices=householdNotices([],[],settings,'credit','2026-09-20');expect(notices[0]).toMatchObject({date:'2026-10-16',category:'income_benefits',subcategory:'source_rav',urgent:true});expect(notices[0].label).toContain('26 Tage');expect(notices[0].detail).toContain('zu prüfen');});
 it('forecasts only three consecutive covered monthly payments, never declares them unpaid',()=>{const n=householdNotices(sample,sample,settings,'debit','2026-09-20',()=>true).filter(n=>n.kind==='expected');expect(n).toHaveLength(1);expect(n[0]).toMatchObject({date:'2026-09-26',amount:50,urgent:false});expect(n[0].detail).toContain('kein Nachweis einer offenen Rechnung');expect(householdNotices(sample,sample,settings,'debit','2026-09-20').filter(n=>n.kind==='expected')).toHaveLength(0);expect(householdNotices(sample.slice(1),sample,settings,'debit','2026-09-20',()=>true).filter(n=>n.kind==='expected')).toHaveLength(0);});
 it('does not project stale, duplicate, irregular or unknown payment streams',()=>{for(const xs of [[...sample,entry('4','2026-08-26')],sample.map((e,i)=>({...e,date:['2026-06-02','2026-07-26','2026-08-10'][i]})),sample.map(e=>({...e,title:'Unknown'}))])expect(householdNotices(xs,xs,settings,'debit','2026-09-20',()=>true).filter(n=>n.kind==='expected')).toHaveLength(0);expect(householdNotices(sample,sample,settings,'debit','2027-01-01',()=>true).filter(n=>n.kind==='expected')).toHaveLength(0);});
 it('distinguishes a covered zero-spending month from missing statement coverage',()=>{const xs=[entry('1','2026-06-26',-100),entry('2','2026-08-26',-100),entry('3','2026-09-26',-800)];expect(householdNotices(xs,[xs[2]],settings,'debit','2026-09-30',()=>true).filter(n=>n.kind==='unusual')).toHaveLength(1);});
 it('marks unusually high historical spending against three covered months, not an invented budget',()=>{const xs=[entry('0','2026-05-26',-100),...sample.map(e=>({...e,amount:-100,display_amount:-100})),entry('4','2026-09-26',-800)];const notices=householdNotices(xs,[xs[4]],settings,'debit','2026-09-30',()=>true).filter(n=>n.kind==='unusual');expect(notices).toHaveLength(1);expect(notices[0]).toMatchObject({date:'2026-09-01',amount:800,urgent:false});expect(notices[0].detail).toContain('kein festgelegtes Budget');expect(householdNotices(xs,[xs[4]],settings,'debit','2026-09-30',()=>false).filter(n=>n.kind==='unusual')).toHaveLength(0);});
});
