import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {contractDigest,validateContractInventory} from './contracts-base.js';
export {contractDigest,validateContractInventory} from './contracts-base.js';
import {readContractUpdates} from './contract-mail-sync.js';
import {documentBytes} from '../../file-intake/document-security.js';
import {getSessionExchangePath} from '../../env.js';
import {getFeedbackRowById} from '../../feedback/reader.js';
import {localMailSource} from '../../mail-intake/source.js';
import {readHouseholdContext} from './household.js';

export function readContractInventory(){
 const path=join(getSessionExchangePath(),'ledger','contracts','inventory.json');
 if(!existsSync(path))return {inventory:null,sync:null,batch:null,stale:false,error:null};
 try{
  let inventory=validateContractInventory(JSON.parse(documentBytes(path,2*1024*1024).toString()));
  const updates=readContractUpdates(inventory); inventory=updates.inventory;
  let batch:ReturnType<typeof readHouseholdContext>['batch']|null=null;
  try{batch=readHouseholdContext().batch;}catch{/* Show the dated inventory with unavailable bank evidence. */}
  const entries=new Map(batch?.entries.map(e=>[e.entry_id,e])??[]);
  const mailCache=new Map<string,{valid:boolean;href:string}>();
  let invalid=false;
  for(const item of inventory.items)for(const e of item.evidence){
   if(e.kind==='bank')e.valid=entries.has(e.id)&&contractDigest(entries.get(e.id))===e.sha256;
   else{
    const key=e.id+':'+e.sha256;let proof=mailCache.get(key);
    if(!proof){let valid=false;try{const row=getFeedbackRowById(Number(e.id));if(row){const s=localMailSource(row);valid=contractDigest([row.id,row.mail_date,row.subject,row.sender,s.bodyText??''])===e.sha256;}}catch{}
     proof={valid,href:'/mail-queue?feedback='+e.id};mailCache.set(key,proof);
    }Object.assign(e,proof);
   }
   if(!e.valid)invalid=true;
  }
  return {inventory,sync:updates.sync,batch:batch?.batch_sha256??null,stale:invalid||batch?.batch_sha256!==inventory.batch_sha256,error:null};
 }catch{return {inventory:null,sync:null,batch:null,stale:false,error:'Die Vertragsübersicht konnte nicht geprüft werden.'};}
}
