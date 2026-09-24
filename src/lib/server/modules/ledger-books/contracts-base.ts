import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {documentBytes} from '../../file-intake/document-security.js';
import {getSessionExchangePath} from '../../env.js';
import {contractGroups,type ContractInventory} from '$lib/ledger-contracts.js';
export const contractDigest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const day=(s:unknown)=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const text=(s:unknown,max=2500)=>typeof s==='string'&&s.length>0&&s.length<=max;
const hash=(s:unknown)=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
/** Private reviewed inventory; source text never becomes executable UI or an external action. */
export function validateContractInventory(value:unknown):ContractInventory {
 const v=value as ContractInventory;
 if(v?.schema!=='folio/contracts-inventory/v1'||!day(v.as_of)||!hash(v.batch_sha256)||!Array.isArray(v.items)||v.items.length>150||new Set(v.items.map(i=>i?.id)).size!==v.items.length)throw Error('contracts_inventory');
 const c=v.coverage;
 if(!c||![c.mail_rows,c.mail_with_text,c.bank_entries].every(n=>Number.isSafeInteger(n)&&n>=0)||!day(c.bank_through)||!Array.isArray(c.accounts)||c.accounts.length>30||c.accounts.some(a=>!text(a,80))||!Array.isArray(c.limitations)||c.limitations.length>20||c.limitations.some(s=>!text(s)))throw Error('contracts_coverage');
 for(const i of v.items){
  if(!/^[a-z][a-z0-9-]{0,70}$/.test(i.id)||!text(i.label,160)||!contractGroups.includes(i.group)||!['observed','uncertain','cancelled'].includes(i.status)||!['high','normal','low'].includes(i.priority)||![i.cost,i.summary,i.next_step].every(s=>text(s))||!Array.isArray(i.unknowns)||i.unknowns.length>20||i.unknowns.some(s=>!text(s)))throw Error('contract_item');
  if(i.timing&&(!day(i.timing.date)||!text(i.timing.label,240)||!['documented','estimated','review'].includes(i.timing.basis)))throw Error('contract_timing');
  if(!Array.isArray(i.evidence)||!i.evidence.length||i.evidence.length>80||i.evidence.some(e=>!['mail','bank'].includes(e.kind)||!hash(e.sha256)||!day(e.date)||!text(e.label,240)||!text(e.note)||!(e.kind==='mail'?/^\d{1,9}$/:/^txn_[a-f0-9]{16,64}$/).test(e.id)))throw Error('contract_evidence');
  if(i.help){const u=new URL(i.help.url);if(u.protocol!=='https:'||u.username||u.password||!text(i.help.label,160))throw Error('contract_help');}
 }
 return v;
}

export function loadContractBase():ContractInventory|null {
 const path=join(getSessionExchangePath(),'ledger','contracts','inventory.json');
 return existsSync(path)?validateContractInventory(JSON.parse(documentBytes(path,2*1024*1024).toString())):null;
}
