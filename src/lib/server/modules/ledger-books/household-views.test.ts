import {describe,it,expect} from 'vitest';
import {householdViewEntries,ownTransfer} from './household-views.js';
import {assessTransferFees,type FeeMail} from './transfer-fees.js';
import type {WiseTransfer} from './transfers.js';
import type {HouseholdSettings,HouseholdEntry} from '$lib/ledger-household.js';
const settings:HouseholdSettings={schema:'folio/household-settings/v1',currency:'EUR',category_overrides:[],income_sources:[],projection_exclude:[],projection_equipment:[],property:null};
const record=(id='x',completed='2026-07-10'):WiseTransfer=>({id,created:completed,completed,source_amount:1000,source_amount_basis:'gross',source_fee:null,target_fee:null,source_currency:'CHF',target_currency:'EUR',target_amount:945.25,rate:null,own:true,line:1,source_sha256:'a'.repeat(64)});
const mail=(id=1,date='2026-07-10'):FeeMail=>({id,sender:'noreply@wise.com',subject:'Geld ausgezahlt (#42)',mail_date:date,body_excerpt:'945,25 EUR sind unterwegs. Der CHF zu EUR-Kurs lag bei 0.95. Die Wise-Gebühr betrug 5,00 CHF.'});
const leg=(id:string,amount:number):HouseholdEntry=>({id,amount,display_amount:amount,currency:'EUR',account:'Test',date:'2026-07-10',title:'Wise',purpose:'FX',category:'transfers',aggregate:false,transfer:{provider:'wise',status:'paired',record:record(),counterpart_ids:[]}});
describe('fee evidence and bounded estimation',()=>{
 it('binds a quoted fee to exact amount, currency, completion date and FX control',()=>{
  expect(assessTransferFees([record()],[mail()]).get('x')).toMatchObject({status:'documented',components:[{amount:5,currency:'CHF'}]});
  for(const m of [{...mail(),sender:'impostor@example.test'},{...mail(),mail_date:'invalid'},{...mail(),mail_date:'2026-06-01'},{...mail(),body_excerpt:mail().body_excerpt.replace('5,00 CHF','5,00 EUR')},{...mail(),body_excerpt:mail().body_excerpt.replace('945,25','945,26')},{...mail(),body_excerpt:mail().body_excerpt.replace('5,00','25,00')}])expect(assessTransferFees([record()],[m]).get('x')?.status).toBe('unknown');
 });
 it('supports legacy literal newlines and SFr notation but refuses reuse across ambiguous transfers',()=>{
  const m={...mail(),sender:'support@transferwise.com',subject:'Deine Überweisung 123 ist unterwegs',body_excerpt:'€945,25 \\r\\n 1 CHF = 0.95 EUR; unsere Gebühr bei SFr.5,00'};
  expect(assessTransferFees([record()],[m]).get('x')?.status).toBe('documented');
  expect([...assessTransferFees([record(),record('other')],[m]).values()].every(f=>f.status==='unknown')).toBe(true);
 });
 it('estimates only from at least three evidenced comparable transfers, never from estimates or distant samples',()=>{
  const rs=[record('a','2026-07-01'),record('b','2026-07-04'),record('c','2026-07-07'),record('x','2026-07-10')],mails=rs.slice(0,3).map((r,i)=>mail(i,r.completed));
  const f=assessTransferFees(rs,mails).get('x')!;expect(f.status).toBe('estimated');expect(f.components).toEqual([{amount:5,currency:'CHF'}]);expect(f.samples).toHaveLength(3);
  expect(assessTransferFees(rs,mails.slice(0,2)).get('x')?.status).toBe('unknown');
  expect(assessTransferFees([...rs.slice(0,3),record('old','2016-07-10')],mails).get('old')?.status).toBe('unknown');
 });
});
describe('extrapolation limits',()=>{
 it('allows older evidenced samples only for a minor CHF fee and labels that assumption',()=>{
  const peers=[record('a','2023-07-01'),record('b','2023-07-04'),record('c','2023-07-07')],mails=peers.map((r,i)=>mail(i,r.completed));
  const f=assessTransferFees([...peers,record('later','2026-06-10')],mails).get('later')!;
  expect(f.status).toBe('estimated');expect(f.method).toContain('extrapoliert');
  expect(assessTransferFees([...peers,record('later','2026-08-10')],mails).get('later')?.status).toBe('unknown');
 });
 it('keeps conflicting valid receipts unresolved instead of estimating over the conflict',()=>{
  const m={...mail(2),body_excerpt:mail().body_excerpt.replace('5,00','5,01')};
  expect(assessTransferFees([record()],[mail(),m]).get('x')).toMatchObject({status:'unknown',method:'Widersprüchliche Gebührenbelege.'});
 });
});
describe('household versus gross bank movements',()=>{
 it('removes own principal on both or just one bank side, charges the fee exactly once, keeps immutable gross evidence',()=>{
  const raw=[leg('out',-1000),leg('in',945.25)],before=JSON.stringify(raw),fees=assessTransferFees([record()],[mail()]);
  const project=(rows:HouseholdEntry[])=>householdViewEntries(rows,settings,fees,n=>n,'household');
  expect(project(raw)).toMatchObject([{id:'out',amount:-5,category:'transfer_fees'}]);
  const one=[{...raw[1],transfer:{...raw[1].transfer!,status:'provider_evidenced' as const}}];
  expect(project(one)).toMatchObject([{id:'in',amount:-5,fee_component:{status:'documented'}}]);
  expect(householdViewEntries(raw,settings,fees,n=>n,'accounts')).toEqual(raw);expect(JSON.stringify(raw)).toBe(before);
  expect(householdViewEntries(raw,settings,fees,n=>n,'transfers')).toEqual(raw);
 });
 it('retains uncertain and external movements; requires explicit ownership for incomplete IB bank chains',()=>{
  const ib={...leg('ib',-1000),transfer:{provider:'ib' as const,status:'bank_leg' as const,counterpart_ids:[]}};
  expect(ownTransfer(ib,settings)).toBe(false);expect(ownTransfer(ib,{...settings,own_transfer_providers:['ib']})).toBe(true);
  for(const status of ['ambiguous','external_payment'] as const)expect(ownTransfer({...ib,transfer:{...ib.transfer,status}}, {...settings,own_transfer_providers:['ib']})).toBe(false);
  expect(householdViewEntries([ib],{...settings,own_transfer_providers:['ib']},new Map(),n=>n,'household')).toEqual([]);
 });
 it('does not invent an expense for an unanchored transfer or unknown fees',()=>{
  expect(householdViewEntries([],settings,assessTransferFees([record()],[mail()]),n=>n,'household')).toEqual([]);
  expect(householdViewEntries([leg('in',945.25)],settings,assessTransferFees([record()],[]),n=>n,'household')).toEqual([]);
 });
});
