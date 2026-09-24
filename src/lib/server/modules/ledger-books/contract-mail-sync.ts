import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {getSessionExchangePath,isDemoVaultActive} from '../../env.js';
import {documentBytes} from '../../file-intake/document-security.js';
import {getFolioDb} from '../../folio-db/init.js';
import {getFeedbackRowById} from '../../feedback/reader.js';
import {localMailSource} from '../../mail-intake/source.js';
import {mailSourceEligibilitySnapshot} from '../../mail-intake/mailbox-source.js';
import {config,type Config,type IntakeRun} from '../../mail-intake/state.js';
import {hasModuleCapability} from '../index.js';
import {contractDigest,loadContractBase} from './contracts-base.js';
import {contractMailCandidate,detectContractEvent,projectContractEvents,senderAddress,type ContractMailProfile,type ContractMailEvent,type ContractMailNotice} from './contract-mail-events.js';
import type {ContractInventory} from '$lib/ledger-contracts.js';

const POLICY='contract-mail-v1';
export interface ContractMailSettings {schema:'folio/contract-mail-sync/v1';enabled:boolean;authorization:string;profiles:ContractMailProfile[];}
interface SyncReport {runId:string;checkedAt:string;checked:number;recorded:number;state:'completed'|'failed';}
function store(){const db=getFolioDb();db.exec(`CREATE TABLE IF NOT EXISTS contract_mail_events (id TEXT PRIMARY KEY, scope TEXT NOT NULL, value TEXT NOT NULL, recorded_at TEXT NOT NULL, actor TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS contract_mail_sync (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);`);return db;}
export function validateContractMailSettings(raw:unknown,base:ContractInventory):ContractMailSettings {
 const s=raw as ContractMailSettings,ids=new Set(base.items.map(i=>i.id));
 if(s?.schema!=='folio/contract-mail-sync/v1'||typeof s.enabled!=='boolean'||typeof s.authorization!=='string'||!s.authorization.trim()||s.authorization.length>1000||!Array.isArray(s.profiles)||s.profiles.length>150||new Set(s.profiles.map(p=>p.id)).size!==s.profiles.length)throw Error('contract_mail_settings');
 for(const p of s.profiles){
  if(!ids.has(p.id)||typeof p.reviewOnly!=='boolean'||![p.accounts,p.senders,p.domains,p.products,p.exclude].every(a=>Array.isArray(a)&&a.length<=40&&a.every(t=>typeof t==='string'&&t.length>0&&t.length<200))||!p.accounts.length||!p.products.length||!p.senders.length&&!p.domains.length)throw Error('contract_mail_binding');
  if(p.senders.some(s=>senderAddress(s)!==s)||p.domains.some(d=>!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(d)||['stripe.com','paypal.com','paypal.de','google.com'].includes(d)))throw Error('contract_mail_sender');
 }
 return s;
}
export function loadContractMailSettings(base:ContractInventory){
 const path=join(getSessionExchangePath(),'ledger','contracts','mail-sync.json');
 return existsSync(path)?validateContractMailSettings(JSON.parse(documentBytes(path,128*1024).toString()),base):null;
}
const scopeFor=(base:ContractInventory,settings:ContractMailSettings)=>contractDigest([POLICY,base,settings]);
function assertAvailable(){if(isDemoVaultActive()||!hasModuleCapability('ledger-books','contracts.reconcile'))throw Error('contract_mail_unavailable');}
export function inspectContractMails(ids:number[],base:ContractInventory,settings:ContractMailSettings):ContractMailEvent[] {
 if(ids.length>25000||ids.some(id=>!Number.isSafeInteger(id)||id<1))throw Error('contract_mail_scope');
 const eligible=mailSourceEligibilitySnapshot(),events:ContractMailEvent[]=[];
 for(const id of new Set(ids)){
  const row=getFeedbackRowById(id);if(!row||!contractMailCandidate(row.subject))continue;
  const source=localMailSource(row),body=source.bodyText??'';
  const hash=contractDigest([row.id,row.mail_date,row.subject,row.sender,body]);
  const date=row.mail_date&&Number.isFinite(Date.parse(row.mail_date))?new Date(row.mail_date).toISOString():'';
  const event=detectContractEvent({id,date,sender:row.sender,subject:row.subject,body,account:row.account_id,complete:!!body&&!source.bodyTruncated,hash,eligible:eligible(id,row.account_id)},settings.profiles);
  if(event){
   // Content duplicate imports share an event key even when feedback IDs differ.
   const key=contractDigest([scopeFor(base,settings),date,row.sender,row.subject,body,event.contractId,event.kind,event.reason]);
   events.push({...event,id:key});
  }
 }
 return events;
}
/** No network, provider operation, bank write, or LLM authority. Source-bound local events only. */
export function syncContractMails(ids:number[],runId:string,actor:string,expected?:Config){
 assertAvailable();
 if(expected){const current=config();if(!current?.enabled||current.authorization_id!==expected.authorization_id)throw Error('contract_mail_paused');}
 const base=loadContractBase();if(!base)return null;
 const settings=loadContractMailSettings(base);if(!settings?.enabled)return null;
 const db=store(),scope=scopeFor(base,settings);
 const report:SyncReport={runId,checkedAt:new Date().toISOString(),checked:ids.length,recorded:0,state:'completed'};
 try{
  const events=inspectContractMails(ids,base,settings);
  db.transaction(()=>{
   for(const event of events)report.recorded+=db.prepare('INSERT OR IGNORE INTO contract_mail_events VALUES (?,?,?,?,?)').run(event.id,scope,JSON.stringify(event),report.checkedAt,actor).changes;
   db.prepare('INSERT INTO contract_mail_sync VALUES (1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(JSON.stringify(report));
  })();return report;
 }catch(e){report.state='failed';db.prepare('INSERT INTO contract_mail_sync VALUES (1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(JSON.stringify(report));throw e;}
}
export function syncIntakeContracts(run:IntakeRun,c:Config){if(!hasModuleCapability('ledger-books','contracts.reconcile'))return null;return syncContractMails(run.items.map(i=>i.id),run.id,`${c.owner}/hourly-mail/${c.authorization_id}`,c);}

export function readContractUpdates(base:ContractInventory){
 const settings=loadContractMailSettings(base);
 if(!settings)return {inventory:base,sync:null};
 assertAvailable();
 const db=store(),scope=scopeFor(base,settings),eligible=mailSourceEligibilitySnapshot(),events:ContractMailEvent[]=[],invalid:ContractMailNotice[]=[];
 const saved=db.prepare('SELECT value FROM contract_mail_events WHERE scope=? ORDER BY rowid').all(scope) as {value:string}[];
 const latest=new Map<number,ContractMailEvent>();
 for(const {value} of saved){const event=JSON.parse(value) as ContractMailEvent;latest.set(event.mailId,event);}
 for(const e of latest.values()){
  const row=getFeedbackRowById(e.mailId),source=row?localMailSource(row):null;
  if(!row||!source||!eligible(row.id,row.account_id)||contractDigest([row.id,row.mail_date,row.subject,row.sender,source.bodyText??''])!==e.sourceHash){invalid.push({mailId:e.mailId,contractId:e.contractId,label:e.subject,reason:'Quelle geändert oder nicht mehr verfügbar; Änderung nicht übernommen.'});continue;}
  // Re-evaluate completeness and the binding; a changed capture must not retain an old automatic verdict.
  const current=detectContractEvent({id:row.id,date:e.date,sender:row.sender,subject:row.subject,body:source.bodyText??'',account:row.account_id,complete:!!source.bodyText&&!source.bodyTruncated,hash:e.sourceHash,eligible:true},settings.profiles);
  if(!current||current.kind!==e.kind||current.contractId!==e.contractId){invalid.push({mailId:e.mailId,contractId:e.contractId,label:e.subject,reason:'Quellenprüfung hat sich geändert; erneuten Abgleich abwarten.'});continue;}
  events.push(e);
 }
 const result=projectContractEvents(base,events),row=db.prepare('SELECT value FROM contract_mail_sync WHERE id=1').get() as {value:string}|undefined;
 return {inventory:result.inventory,sync:{enabled:settings.enabled,profiles:settings.profiles.length,automatic:settings.profiles.filter(p=>!p.reviewOnly).length,total:base.items.length,report:row?JSON.parse(row.value) as SyncReport:null,changed:result.changed.length,notices:[...invalid,...result.notices]}};
}
