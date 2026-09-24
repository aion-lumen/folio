import { beforeEach,afterEach,it,expect,vi } from 'vitest';
import { mkdtempSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';import { join } from 'node:path';
import { accounts } from './accounts.js';
let dir='';
beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'mail-accounts-'));vi.stubEnv('FOLIO_DB_PATH',join(dir,'folio.db'));vi.stubEnv('FOLIO_MAIL_ACCOUNTS_PATH','');});
afterEach(()=>{vi.unstubAllEnvs();rmSync(dir,{recursive:true,force:true});});
function save(value:unknown){writeFileSync(join(dir,'mail-intake-accounts.json'),JSON.stringify(value));}
it('does not invent accounts on a fresh installation',()=>{expect(accounts()).toEqual([]);});
it('loads every explicitly configured source with its own identity',()=>{save([{id:'personal',label:'Personal',kind:'imap'},{id:'archive',label:'Archive',kind:'proton-export',exportPath:'/tmp/synthetic'}]);expect(accounts().map(a=>a.id)).toEqual(['personal','archive']);});
it('accepts a versioned explicit registry and isolated configuration path',()=>{const path=join(dir,'v1.json');writeFileSync(path,JSON.stringify({schema:'folio/mail-accounts/v1',accounts:[{id:'work',label:'Work',kind:'imap'}]}));vi.stubEnv('FOLIO_MAIL_ACCOUNTS_PATH',path);expect(accounts().map(a=>a.id)).toEqual(['work']);});
it('rejects duplicate, malformed and unknown-version configurations',()=>{for(const value of [[{id:'a',label:'A',kind:'imap'},{id:'a',label:'A',kind:'imap'}],[{id:'../bad',label:'Bad',kind:'imap'}],{schema:'unknown',accounts:[]},null]){save(value);expect(()=>accounts()).toThrow();}});
