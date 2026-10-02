import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync,mkdtempSync,rmSync,writeFileSync } from 'node:fs';
import { dirname,join } from 'node:path';
import { atomicPrivateJson,documentBytes,privateDirectory,readSecurityConfig,securityRoot } from './document-security.js';
const exec=promisify(execFile);
let pending:Promise<boolean>|null=null;
/** This updater sends no document data. Its generated configuration permits
 * only official signature downloads; imported files never supply arguments. */
export function maintainDocumentSignatures():Promise<boolean>{
 if(pending)return pending;
 pending=update().finally(()=>{pending=null;});return pending;
}
async function update(){
 const config=readSecurityConfig();if(!config)return false;
 const statePath=join(securityRoot(),'signature-maintenance.json');
 try{const s=JSON.parse(documentBytes(statePath,8192).toString());const age=Date.now()-Date.parse(s.checked_at);if(s.success&&age>=0&&age<24*3600_000)return true;if(!s.success&&age>=0&&age<15*60_000)return false;}catch{}
 const binary=join(dirname(config.scanner_bin),'freshclam');
 if(!existsSync(binary)||/[\r\n"\\]/.test(config.signatures_dir))return false;
 privateDirectory(securityRoot());const work=mkdtempSync(join(securityRoot(),'signature-update-'));
 let success=false;
 try{
  const cfg=join(work,'freshclam.conf');
  writeFileSync(cfg,`DatabaseDirectory "${config.signatures_dir}"\nDatabaseMirror database.clamav.net\nDNSDatabaseInfo current.cvd.clamav.net\nScriptedUpdates yes\nBytecode yes\nConnectTimeout 20\nReceiveTimeout 60\n`,{mode:0o600});
  await exec(binary,[`--config-file=${cfg}`,'--stdout'],{timeout:240000,maxBuffer:64*1024});success=true;
 }catch{/* Scan still independently enforces signed, fresh official databases. */}
 finally{rmSync(work,{recursive:true,force:true});atomicPrivateJson(statePath,{checked_at:new Date().toISOString(),success});}
 return success;
}
