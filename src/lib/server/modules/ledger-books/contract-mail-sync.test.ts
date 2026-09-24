import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
const m=vi.hoisted(()=>({body:'Your Editor Pro subscription was canceled. It will expire on October 23, 2026.',complete:true,eligible:true,demo:false,allowed:true,subject:'Your Editor Pro subscription was canceled',date:'2026-09-24T10:00:00Z',account:'mail',dir:''}));
vi.mock('../../feedback/reader.js',()=>({getFeedbackRowById:(id:number)=>({id,mail_date:m.date,subject:m.subject,sender:'billing@editor.test',account_id:m.account,imap_uid:id})}));
vi.mock('../../mail-intake/source.js',()=>({localMailSource:()=>({bodyText:m.body,bodyTruncated:!m.complete,source:'intake'})}));
vi.mock('../../mail-intake/mailbox-source.js',()=>({mailSourceEligibilitySnapshot:()=>()=>m.eligible}));
vi.mock('../../env.js',async original=>({...await original<object>(),getSessionExchangePath:()=>m.dir,isDemoVaultActive:()=>m.demo}));
vi.mock('../index.js',()=>({hasModuleCapability:()=>m.allowed}));
import {getFolioDb,resetFolioDbForTests} from '../../folio-db/init.js';
import {configure} from '../../mail-intake/state.js';
import {syncContractMails,readContractUpdates,validateContractMailSettings} from './contract-mail-sync.js';
import {loadContractBase} from './contracts-base.js';
let settings:any,base:any;
beforeEach(()=>{
 m.dir=mkdtempSync(join(tmpdir(),'folio-contract-sync-'));vi.stubEnv('FOLIO_DB_PATH',join(m.dir,'folio.db'));m.complete=true;m.eligible=true;m.demo=false;m.allowed=true;m.body='Your Editor Pro subscription was canceled. It will expire on October 23, 2026.';m.subject='Your Editor Pro subscription was canceled';m.date='2026-09-24T10:00:00Z';m.account='mail';
 base={schema:'folio/contracts-inventory/v1',as_of:'2026-09-24',batch_sha256:'b'.repeat(64),coverage:{mail_rows:1,mail_with_text:1,bank_entries:1,bank_through:'2026-08-31',accounts:['mail'],limitations:[]},items:[{id:'editor',label:'Editor Pro',group:'KI & Software',status:'observed',priority:'high',cost:'20 CHF',summary:'Known',next_step:'Check',unknowns:[],timing:null,evidence:[{kind:'bank',id:'txn_'+'a'.repeat(24),sha256:'b'.repeat(64),date:'2026-08-23',label:'Payment',note:'Bank'}]}]};
 settings={schema:'folio/contract-mail-sync/v1',enabled:true,authorization:'Synthetic test consent',profiles:[{id:'editor',reviewOnly:false,accounts:['mail'],senders:['billing@editor.test'],domains:[],products:['Editor Pro'],exclude:[]}]};mkdirSync(join(m.dir,'ledger/contracts'),{recursive:true});writeFileSync(join(m.dir,'ledger/contracts/inventory.json'),JSON.stringify(base));saveSettings();
});
afterEach(()=>{resetFolioDbForTests();vi.unstubAllEnvs();rmSync(m.dir,{recursive:true,force:true});});
function saveSettings(){writeFileSync(join(m.dir,'ledger/contracts/mail-sync.json'),JSON.stringify(settings));}
const view=()=>readContractUpdates(loadContractBase()!);
describe('private contract sync persistence and authority',()=>{
 it('records once, deduplicates another import ID and never modifies the baseline',()=>{expect(syncContractMails([4],'test','owner')?.recorded).toBe(1);expect(syncContractMails([4,5],'retry','owner')?.recorded).toBe(0);expect(view().inventory.items[0].status).toBe('cancelled');expect(loadContractBase()!.items[0].status).toBe('observed');expect(view().sync?.report?.checked).toBe(2);});
 it('withdraws the projection if the original source changed',()=>{syncContractMails([4],'test','owner');m.body='A different source';expect(view().inventory.items[0].status).toBe('observed');expect(view().sync?.notices[0].reason).toContain('Quelle geändert');});
 it('rechecks capture completeness on every read, then replaces a review after a complete capture',()=>{m.complete=false;syncContractMails([4],'incomplete','owner');expect(view().inventory.items[0].status).toBe('observed');m.complete=true;syncContractMails([4],'complete','owner');expect(view().inventory.items[0].status).toBe('cancelled');expect(view().sync?.notices).toHaveLength(0);m.complete=false;expect(view().inventory.items[0].status).toBe('observed');});
 it('uses event time for old arrivals and keeps spam out',()=>{m.date='2026-07-01T10:00:00Z';syncContractMails([4],'history','owner');expect(view().inventory.items[0].status).toBe('observed');m.eligible=false;expect(syncContractMails([6],'spam','owner')?.recorded).toBe(0);});
 it('requires explicit local activation, refuses demo or disabled modules, and checks intake authority',()=>{settings.enabled=false;saveSettings();expect(syncContractMails([4],'off','owner')).toBeNull();settings.enabled=true;saveSettings();m.demo=true;expect(()=>syncContractMails([4],'demo','owner')).toThrow('unavailable');m.demo=false;m.allowed=false;expect(()=>syncContractMails([4],'disabled','owner')).toThrow('unavailable');m.allowed=true;const c=configure(true,'owner','test');configure(false,'owner','pause');expect(()=>syncContractMails([4],'paused','owner',c)).toThrow('paused');});
 it('does not reuse an automatic assessment after binding changes',()=>{syncContractMails([4],'old','owner');settings.profiles[0].products=['Editor Enterprise'];saveSettings();expect(view().inventory.items[0].status).toBe('observed');});
 it('refuses wildcard processor trust and preserves event audit records',()=>{settings.profiles[0].domains=['stripe.com'];expect(()=>validateContractMailSettings(settings,base)).toThrow('sender');settings.profiles[0].domains=[];saveSettings();syncContractMails([4],'audit','owner/hourly');expect(getFolioDb().prepare('SELECT actor FROM contract_mail_events').get()).toEqual({actor:'owner/hourly'});});
});
