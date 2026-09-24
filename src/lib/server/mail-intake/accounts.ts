import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, isAbsolute } from 'node:path';
import { getFolioDbPath } from '../env.js';
export interface MailAccount { id:string; label:string; kind:'imap'|'proton-export'; initialInbox?:boolean; exportPath?:string; }
export function accountSettingsPath() { return process.env.FOLIO_MAIL_ACCOUNTS_PATH || join(dirname(getFolioDbPath()),'mail-intake-accounts.json'); }
export function accounts(): MailAccount[] {
 const defaults:MailAccount[]=[];
 const path=accountSettingsPath(); if(!existsSync(path))return defaults;
 const raw=JSON.parse(readFileSync(path,'utf8'));
 const input=Array.isArray(raw)?raw:raw?.schema==='folio/mail-accounts/v1'?raw.accounts:null;
 if(!Array.isArray(input)||input.length>30)throw Error('invalid_account_configuration');
 const ids=new Set(defaults.map(a=>a.id));
 for(const a of input) {
  if(!a||typeof a.id!=='string'||!/^[a-z][a-z0-9-]{0,39}$/.test(a.id)||ids.has(a.id)||typeof a.label!=='string'||a.label.length>160||!['imap','proton-export'].includes(a.kind)|| (a.initialInbox!==undefined&&typeof a.initialInbox!=='boolean') || (a.kind==='proton-export'&&(typeof a.exportPath!=='string'||!isAbsolute(a.exportPath))))throw Error('invalid_account_configuration');
  ids.add(a.id);defaults.push(a);
 }
 return defaults;
}

export function historyAccounts(): string[] {
 const path=join(dirname(getFolioDbPath()),'mail-intake-history.json');if(!existsSync(path))return [];
 const raw=JSON.parse(readFileSync(path,'utf8'));
 const input=Array.isArray(raw)?raw:raw?.schema==='folio/mail-accounts/v1'?raw.accounts:null;
 if(!Array.isArray(input)||input.some(id=>!accounts().some(a=>a.id===id&&a.kind==='imap'))||new Set(input).size!==input.length)throw Error('invalid_history_configuration');
 return input;
}
