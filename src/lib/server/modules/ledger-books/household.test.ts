import {describe,it,expect} from 'vitest';
import {canonicalHash} from './reconciliation.js';
import {buildHousehold,validateHouseholdBatch,validateEntryQuery,validateHouseholdSettings,expenseCategory,converted,type StatementBatch} from './household.js';
import {addMonth,type HouseholdSettings} from '$lib/ledger-household.js';
import type {WealthOverview} from '$lib/ledger-wealth.js';
const account='acct_'+ 'a'.repeat(20);
function settings():HouseholdSettings{return {schema:'folio/household-settings/v1',currency:'EUR',category_overrides:[{contains:'Testvermieter',category:'home'}],income_sources:[{id:'rav',label:'Befristeter Eingang',contains:['Arbeitslosenkasse'],end_date:'2026-10-16',date_source:'Owner'}],projection_exclude:['Eigenübertrag'],projection_equipment:['Galaxus'],property:{label:'Haus',price:100000,property:95000,inventory:5000,paid:false,source:'Owner',confirmed_at:'2026-09-20'}};}
function fixture(){const sources=[{source_ref:'src_a',source_sha256:'a'.repeat(64),account_ref:account,declared_period:{from:'2026-06-01',to:'2026-08-31'},control_result:{complete:true}}];const entries=Array.from({length:3},(_,i)=>({entry_id:'txn_'+String(i).repeat(24),account_ref:account,booking_date:addMonth('2026-06',i)+'-15',amount:'-1000.00',currency:'EUR',counterparty:'Testvermieter',purpose:'Miete',observation_id:'obs_'+i,evidence:[{ref:'src_a:text-line:1',sha256:'a'.repeat(64)}]}));const b={schema:'ledger/manual-statement-batch/v0',bookkeeping:{ledger_db_touched:false},entries,sources,issues:[],batch_sha256:''} as unknown as StatementBatch;b.batch_sha256=canonicalHash({sources,entries,issues:[]});return b;}
function wealth(){return {accounts:[{id:account,label:'Bank',kind:'bank',currency:'EUR',cash:'150000',total:'150000',as_of:'2026-08-31'}],cashflows:[],valuations:[],estimates:[],conversion:{base:'CHF',rates:{CHF:'1',EUR:'.95'},date:'2026-09-18',source:'Auszug'}} as unknown as WealthOverview;}
describe('read-only household aggregation',()=>{
 it('requires valid parent filters for nested expense selections',()=>{const p=new URLSearchParams({from:'2026-06',to:'2026-08',batch:'a'.repeat(64),category:'subscriptions',subcategory:'telecom',partner:'p_'+'a'.repeat(24)});expect(validateEntryQuery(p).subcategory).toBe('telecom');for(const key of ['category','subcategory']){const invalid=new URLSearchParams(p);invalid.delete(key);expect(()=>validateEntryQuery(invalid)).toThrow();}p.set('partner','../other');expect(()=>validateEntryQuery(p)).toThrow();});
 it('keeps category/flow sums bound to dates and does not double count the unpaid property',()=>{const d=buildHousehold(wealth(),fixture(),settings());expect(d.months.map(m=>[m.month,m.outgoing,m.expenses.home,m.net])).toEqual([['2026-06',1000,1000,-1000],['2026-07',1000,1000,-1000],['2026-08',1000,1000,-1000]]);expect(d.assets_low).toBe(150000);expect(d.after_purchase).toBe(50000);});
 it('fails closed for modified batch contents, duplicate identities and malformed dates',()=>{const b=fixture();expect(validateHouseholdBatch(b)).toBe(b);b.entries[0].amount='-10';expect(()=>validateHouseholdBatch(b)).toThrow();b.batch_sha256=canonicalHash({sources:b.sources,entries:b.entries,issues:b.issues});b.entries[0].booking_date='2026-02-31';b.batch_sha256=canonicalHash({sources:b.sources,entries:b.entries,issues:b.issues});expect(()=>validateHouseholdBatch(b)).toThrow();});
 it('does not guess an unknown FX rate',()=>{expect(converted(95,'CHF',wealth(),'EUR')).toBe(100);expect(()=>converted(1,'USD',wealth(),'EUR')).toThrow();});
 it('does not turn missing coverage or a stale wealth projection into a forecast',()=>{const b=fixture();b.sources[0].control_result.complete=false;expect(buildHousehold(wealth(),b,settings()).forecast).toBeNull();expect(buildHousehold(wealth(),fixture(),settings(),new Date(),true).forecast).toBeNull();});
 it('accepts literal owner category mappings but rejects invalid property totals',()=>{const s=settings();expect(expenseCategory({counterparty:null,purpose:'Testvermieter'},s)).toBe('home');expect(validateHouseholdSettings(s)).toBe(s);s.property!.inventory++;expect(()=>validateHouseholdSettings(s)).toThrow();});
 it('bounds detail query pages and validates categories, dates and source digest',()=>{const p=new URLSearchParams({from:'2026-06',to:'2026-08',batch:'a'.repeat(64),category:'home'});expect(validateEntryQuery(p).category).toBe('home');for(const [key,value] of [['from','2026-13'],['category','../../file'],['offset','-1'],['batch','x']]){const invalid=new URLSearchParams(p);invalid.set(key,value);expect(()=>validateEntryQuery(invalid)).toThrow();}});
});

describe('transfer treatment in household projections',()=>{
 it('keeps gross movements while removing only evidenced own principal and retaining both fees',async()=>{
  const {matchTransfers}=await import('./transfers.js');const b=fixture();
  b.entries=b.entries.flatMap((e,i)=>[{...e,counterparty:'TransferWise Ltd',amount:'-1005',currency:'CHF'}, {...e,entry_id:'txn_'+String(i+3).repeat(24),counterparty:'TransferWise Ltd',amount:'948',currency:'EUR'}]);
  const records=b.entries.filter(e=>Number(e.amount)<0).map((e,i)=>({id:'TRANSFER-'+i,created:e.booking_date,completed:e.booking_date,source_amount:1000,source_fee:5,source_currency:'CHF',target_amount:948,target_fee:2,target_currency:'EUR',rate:.95,own:true,line:i+2,source_sha256:'a'.repeat(64)}));
  const w=wealth();w.conversion!.rates.EUR='1';
  const matched=matchTransfers(b.entries,records),d=buildHousehold(w,b,settings(),new Date(),false,matched);
  expect(d.account_months!.every(m=>m.incoming===948&&m.outgoing===1005&&m.net===-57&&m.expenses.transfers===1005)).toBe(true);
  expect(d.months.every(m=>m.incoming===0&&m.outgoing===7&&m.net===-7&&m.expenses.transfer_fees===7)).toBe(true);
  expect(d.forecast!.baseline).toBe(-7);
  const unconfirmed=buildHousehold(w,b,settings(),new Date(),false,matchTransfers(b.entries,[]));expect(unconfirmed.forecast!.baseline).toBe(-57);
  const unknownFees=matchTransfers(b.entries,records.map(r=>({...r,source_amount:1005,source_amount_basis:'gross' as const,source_fee:null,target_fee:null,rate:null,source_format:'wise-ui-text' as const})));expect(buildHousehold(w,b,settings(),new Date(),false,unknownFees).forecast!.baseline).toBe(0);
  const external=buildHousehold(w,b,settings(),new Date(),false,matchTransfers(b.entries,records.map(r=>({...r,own:false}))));expect(external.forecast!.baseline).toBe(-57);expect(external.months[0].expenses.transfers).toBe(0);
 });
});
