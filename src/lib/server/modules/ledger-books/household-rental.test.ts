import {describe,it,expect} from 'vitest';
import {incomeBranch,buildIncomeHierarchy,matchingIncomeSource} from './household-hierarchy.js';
import {validateHouseholdSettings} from './household.js';
import {householdNotices} from './household-attention.js';
import type {HouseholdEntry,HouseholdSettings} from '$lib/ledger-household.js';
const source={id:'rental',label:'Wohnung Beispiel',contains:['Testmieter'],category:'income_rental' as const,end_date:null,date_source:null};
const settings:HouseholdSettings={schema:'folio/household-settings/v1',currency:'EUR',category_overrides:[],income_sources:[source],projection_exclude:[],projection_equipment:[],property:null};
const entry=(purpose:string,amount=1250):HouseholdEntry=>({id:purpose,date:'2026-05-05',amount,display_amount:amount,currency:'EUR',account:'Bank',title:'Gutschrift Überw.',purpose,category:'unknown',aggregate:false});
describe('owner-configured rental income',()=>{
 it('classifies named rent credits and keeps all of their source documents reachable',()=>{const e=entry('Testmieter\nMiete');expect(incomeBranch(e,[source])).toMatchObject({category:'income_rental',subcategory:'source_rental',partner:{label:'Wohnung Beispiel'}});expect(buildIncomeHierarchy([e,entry('Testmieter Miete Folgemonat')],[source])[0]).toMatchObject({id:'income_rental',amount:2500,count:2});});
 it('never treats a payee name alone, purchase price, deposit, refund or household contribution as rent',()=>{for(const purpose of ['Testmieter Kaufpreis ehemals Miete','Testmieter Mietkaution','Testmieter Miete Kaution','Testmieter Miete Rückzahlung','Testmieter','Familienmitglied Miete','Testmieter Eigenübertrag Miete'])expect(incomeBranch(entry(purpose),[source]).category).not.toBe('income_rental');});
 it('keeps linked own transfers, outgoing adjustments and aggregates out of rental income',()=>{for(const e of [{...entry('Testmieter Miete'),transfer:{provider:'wise' as const,status:'paired' as const,counterpart_ids:['other']}},entry('Testmieter Miete',-1250),{...entry('Testmieter Miete'),aggregate:true}])expect(matchingIncomeSource(e,[source])).toBeUndefined();});
 it('does not make a rent keyword a global classification rule',()=>{expect(incomeBranch(entry('Testmieter Miete'),[]).category).toBe('income_other');});
 it('keeps an explicitly configured rental end date on the rental branch without inventing a bank entry',()=>{const notices=householdNotices([],[],{...settings,income_sources:[{...source,end_date:'2026-09-30',date_source:'Bestätigtes Vertragsende'}]},'credit','2026-09-21',()=>false);expect(notices).toHaveLength(1);expect(notices[0]).toMatchObject({kind:'expiry',category:'income_rental',subcategory:'source_rental'});});
 it('validates the optional source category and remains compatible with existing settings',()=>{expect(validateHouseholdSettings(settings)).toEqual(settings);expect(()=>validateHouseholdSettings({...settings,income_sources:[{...source,category:'insurance'}]})).toThrow('household_income_settings');});
});
