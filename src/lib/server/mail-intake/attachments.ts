import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chmodSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { getAionLumenPath, getFolioDbPath, getPythonBinPath, isDemoVaultActive, localMailProcessEnv } from '../env.js';
import { getFeedbackRowById } from '../feedback/reader.js';
import { atomicPrivateJson, documentBytes, extractSecuredDocument, privateDirectory, secureDocument, securityRoot, sha256, storedSecurityReceipt } from '../file-intake/document-security.js';
import { db } from './state.js';
import { localMailSource } from './source.js';
import { savedMailLocations } from './mailbox-source.js';
import { memorySnapshotDigest } from '../memory/store.js';

const exec = promisify(execFile);
const POLICY = 'mail-attachment-bound-pdf-v1';
type Part = { part:string; filename:string|null; declared_mime:string; detected_mime:string; disposition:string; size:number; state:string; sha256:string|null };
type Source = { feedback_id:number; account:string; uid:number; uidvalidity:number; body:string; truncated:number };
type Proof = { receipt_id:string; security_sha256:string; original_sha256:string; extraction_id:string; extraction_sha256:string; text_sha256:string };
export interface AttachmentCheck { policy:string; feedback_id:number; body_sha256:string; header_sha256:string; checked_at:string; status:'checked'|'unavailable'; reason:string|null; parts:number; ready:number; deferred:number; }
const hash = (value:unknown) => sha256(JSON.stringify(value));
const root = () => join(dirname(getFolioDbPath()),'mail-attachments');
const code = (e:unknown) => e instanceof Error && /^[a-z_]+$/.test(e.message) ? e.message : 'attachment_processing_failed';

function database() {
 const conn=db();
 conn.exec(`CREATE TABLE IF NOT EXISTS mail_attachment_checks (feedback_id INTEGER PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS mail_attachment_bindings (source_key TEXT PRIMARY KEY REFERENCES mail_attachment_parts(source_key),feedback_id INTEGER NOT NULL,body_sha256 TEXT NOT NULL,header_sha256 TEXT NOT NULL,raw_sha256 TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS mail_attachment_binding_feedback ON mail_attachment_bindings(feedback_id);
 CREATE TABLE IF NOT EXISTS mail_attachment_evidence (sha256 TEXT PRIMARY KEY REFERENCES mail_attachment_blobs(sha256),proof TEXT NOT NULL);`);
 return conn;
}
function sourceFor(id:number) {
 if(isDemoVaultActive())throw Error('attachments_unavailable_in_demo');
 if(!Number.isSafeInteger(id)||id<1)throw Error('invalid_feedback_id');
 const row=getFeedbackRowById(id);
 const source=database().prepare('SELECT * FROM mail_intake_sources WHERE feedback_id=?').get(id) as Source|undefined;
 if(!row||!source||row.account_id!==source.account||row.imap_uid!==source.uid)throw Error('attachment_source_missing');
 const local=localMailSource(row);if(!local.bodyText||local.bodyTruncated||source.truncated)throw Error('attachment_source_incomplete');
 return {row,source,body_sha256:sha256(source.body),header_sha256:hash([row.sender,row.subject])};
}

/** Revalidate persisted proof and bytes on EVERY read; a DB flag grants nothing. */
export function readAttachmentProof(proof:Proof) {
 if(!/^[a-f0-9-]{36}$/.test(proof.receipt_id)||!/^[a-f0-9-]{36}$/.test(proof.extraction_id))throw Error('attachment_proof_invalid');
 const receipt=storedSecurityReceipt(proof.receipt_id);
 const receiptPath=join(securityRoot(),'receipts',proof.receipt_id+'.json');
 const originalPath=join(securityRoot(),'quarantine',proof.original_sha256,'original');
 const base=join(securityRoot(),'extractions',proof.receipt_id,'pdf',proof.extraction_id);
 const extractedBytes=documentBytes(join(base,'receipt.json'),16384),extracted=JSON.parse(extractedBytes.toString());
 const text=documentBytes(join(base,'text.txt'),512*1024),original=documentBytes(originalPath);
 if(receipt.status!=='clean'||receipt.original_sha256!==proof.original_sha256||sha256(original)!==proof.original_sha256||sha256(documentBytes(receiptPath))!==proof.security_sha256||sha256(extractedBytes)!==proof.extraction_sha256||extracted.status!=='extracted'||extracted.trust!=='untrusted_source'||extracted.content_type!=='pdf'||extracted.original_sha256!==proof.original_sha256||extracted.security_receipt_id!==proof.receipt_id||extracted.security_receipt_sha256!==proof.security_sha256||extracted.text_sha256!==proof.text_sha256||sha256(text)!==proof.text_sha256)throw Error('attachment_proof_changed');
 return {text:text.toString(),original,originalPath};
}
function bindings(id:number) {
 const bound=sourceFor(id);
 const rows=database().prepare(`SELECT p.source_key,p.declared_filename,p.state,p.reason_code,s.sha256,b.byte_size,b.security_status,e.proof,x.body_sha256,x.header_sha256
 FROM mail_attachment_bindings x JOIN mail_attachment_parts p USING(source_key)
 LEFT JOIN mail_attachment_sources s USING(source_key) LEFT JOIN mail_attachment_blobs b USING(sha256)
 LEFT JOIN mail_attachment_evidence e USING(sha256) WHERE x.feedback_id=?`).all(id) as Array<{source_key:string;declared_filename:string|null;state:string;reason_code:string|null;sha256:string|null;byte_size:number|null;security_status:string|null;proof:string|null;body_sha256:string;header_sha256:string}>;
 return rows.filter(r=>r.body_sha256===bound.body_sha256&&r.header_sha256===bound.header_sha256);
}
export function attachmentSummary(id:number) {
 const current=sourceFor(id),record=database().prepare('SELECT value FROM mail_attachment_checks WHERE feedback_id=?').get(id) as {value:string}|undefined;
 const check=record?JSON.parse(record.value) as AttachmentCheck:null;
 const unique=new Map<string,ReturnType<typeof bindings>[number]>();
 for(const r of bindings(id))if(!unique.has(r.sha256??r.source_key))unique.set(r.sha256??r.source_key,r);
 const items=[...unique.values()].map(r=>{
  let available=false;if(r.proof&&r.state==='extracted'){try{readAttachmentProof(JSON.parse(r.proof));available=true;}catch{/* Never display a broken proof as cleared. */}}
  let knowledge='not_reviewed',proposal_id:string|null=null;
  if(available&&r.sha256&&database().prepare("SELECT 1 FROM sqlite_master WHERE name='mail_attachment_memory'").get()){
   const stored=database().prepare('SELECT value FROM mail_attachment_memory WHERE sha256=?').get(r.sha256) as {value:string}|undefined;
   if(stored){try{
    const record=JSON.parse(stored.value);
    if(record.sha256===r.sha256&&record.source_digest===memorySnapshotDigest(attachmentDocument(record.feedback_id,r.sha256))){
     knowledge=record.absence_review?.verdict==='missed_facts'?'missed_facts':record.absence_review?.verdict==='no_personal_fact'?record.status:record.status==='needs_ocr'?'needs_ocr':'not_reviewed';
     if(record.status==='duplicate_only'&&record.duplicate_fact_ids?.length&&record.duplicate_fact_ids.every((factId:string)=>database().prepare("SELECT 1 FROM memory_facts WHERE fact_id=? AND status IN ('candidate','confirmed')").get(factId)))knowledge='duplicate_only';
     if(record.proposal_id){
      const proposal=database().prepare('SELECT status FROM memory_proposals WHERE proposal_id=?').get(record.proposal_id) as {status:string}|undefined;
      knowledge=proposal?.status==='confirmed'?'confirmed':proposal?.status==='rejected'?'rejected':'needs_review';proposal_id=record.proposal_id;
     }
    }
   }catch{/* A changed binding never inherits an old knowledge status. */}}
  }
  return {id:sha256(r.source_key),filename:r.declared_filename??'Anhang',state:r.state,reason:r.reason_code,bytes:r.byte_size,available,knowledge,proposal_id};
 });
 return {check:check?.body_sha256===current.body_sha256&&check?.header_sha256===current.header_sha256?check:null,items};
}
export function attachmentEvidence(id:number) {
 const seen=new Set<string>();
 return bindings(id).flatMap(r=>{
  if(!r.proof||!r.sha256||r.state!=='extracted'||seen.has(r.sha256))return [];
  try{const cleared=readAttachmentProof(JSON.parse(r.proof));seen.add(r.sha256);return [{sha256:r.sha256,text:cleared.text}];}catch{return [];}
 });
}
/** Bounded Memory input. Every read rechecks the exact mail binding and PDF proof. */
export function attachmentDocument(id:number,digest:string) {
 if(!/^[a-f0-9]{64}$/.test(digest))throw Error('invalid_attachment_digest');
 const source=sourceFor(id),row=bindings(id).find(r=>r.sha256===digest&&r.state==='extracted'&&r.proof);
 if(!row?.proof)throw Error('attachment_not_cleared');
 const proof=JSON.parse(row.proof) as Proof,cleared=readAttachmentProof(proof);
 return {feedback_id:id,mail_ref:`mail:${source.source.account}:${source.source.uid}`,body_sha256:source.body_sha256,header_sha256:source.header_sha256,
  source_ref:`attachment:sha256:${digest}`,sha256:digest,filename:row.declared_filename??'Anhang.pdf',proof,text:cleared.text};
}
export function attachmentDownload(id:number,attachmentId:string) {
 const row=bindings(id).find(r=>sha256(r.source_key)===attachmentId);
 if(!row?.proof||row.state!=='extracted')throw Error('attachment_not_cleared');
 return {bytes:readAttachmentProof(JSON.parse(row.proof)).original,filename:row.declared_filename??'Anhang.pdf'};
}

/** Caller holds Folio's model/intake lease. No LLM controls paths or source IDs.
 * EML is an explicit local CLI input; automatic intake uses only saved locations.
 * PDF text is available evidence, not automatically confirmed Memory. */
export async function processMailAttachments(id:number,options:{eml?:string;retry?:boolean;signal?:AbortSignal}={}):Promise<AttachmentCheck> {
 const current=sourceFor(id),{row,source}=current,conn=database();
 const previous=conn.prepare('SELECT value FROM mail_attachment_checks WHERE feedback_id=?').get(id) as {value:string}|undefined;
 if(previous&&!options.retry){const saved=JSON.parse(previous.value) as AttachmentCheck;if(saved.policy===POLICY&&saved.body_sha256===current.body_sha256&&saved.header_sha256===current.header_sha256)return saved;}
 const result:AttachmentCheck={policy:POLICY,feedback_id:id,body_sha256:current.body_sha256,header_sha256:current.header_sha256,checked_at:new Date().toISOString(),status:'unavailable',reason:null,parts:0,ready:0,deferred:0};
 privateDirectory(join(root(),'jobs'));const work=mkdtempSync(join(root(),'jobs','acquire-'));chmodSync(work,0o700);
 try {
  options.signal?.throwIfAborted();
  const saved=savedMailLocations(id,source.account),networkAccounts=new Set(saved.map(l=>l.account));
  if(!options.eml&&networkAccounts.size>1)throw Error('attachment_account_ambiguous');
  const locations=saved.map(({folder,epoch,uid})=>({folder,epoch,uid}));
  if(!options.eml&&!locations.length)throw Error('attachment_location_unknown');
  const request={account:saved[0]?.account??source.account,locations,body_sha256:current.body_sha256,subject:row.subject,sender:row.sender};
  atomicPrivateJson(join(work,'request.json'),request);
  try{await exec(getPythonBinPath(),[join(process.cwd(),'scripts/mail_attachment_fetch.py'),'--request',join(work,'request.json'),'--worker-root',getAionLumenPath(),...(options.eml?['--eml',resolve(options.eml)]:[])],{env:localMailProcessEnv(),timeout:90000,maxBuffer:4096,signal:options.signal});}
  catch(e){const reason=String((e as {stdout?:string}).stdout??'').trim();throw Error(['bound_mail_unavailable','mail_source_changed','mail_header_changed','mail_size_limit','mime_part_limit','unsafe_eml'].includes(reason)?reason:'attachment_source_unavailable');}
  const acquired=JSON.parse(documentBytes(join(work,'attachments.json'),128*1024).toString());
  if(acquired.schema!=='folio/mail-attachment-acquisition/v1'||acquired.mailbox_mutated!==false||acquired.body_sha256!==current.body_sha256||!/^[a-f0-9]{64}$/.test(acquired.raw_sha256)||!Array.isArray(acquired.parts)||acquired.parts.length>100)throw Error('attachment_manifest_invalid');
  const now=sourceFor(id);if(now.body_sha256!==current.body_sha256||now.header_sha256!==current.header_sha256)throw Error('mail_source_changed');
  const location=acquired.location;
  if(!options.eml&&!locations.some((l:any)=>l.folder===location?.folder&&l.epoch===location?.epoch&&l.uid===location?.uid))throw Error('attachment_location_changed');
  const pathHash=options.eml?sha256(basename(options.eml)):null;
  for(const part of acquired.parts as Part[]) {
   options.signal?.throwIfAborted();
   if(!/^\d{1,3}$/.test(part.part)||!Number.isSafeInteger(part.size)||part.size<0||part.size>20*1024*1024||typeof part.state!=='string'||(part.filename!==null&&(typeof part.filename!=='string'||part.filename.length>180||/[\/\\\x00-\x1f]/.test(part.filename))))throw Error('attachment_part_invalid');
   const sourceKey=options.eml?`eml:${source.account}:${pathHash}:${part.part}`:`imap:${source.account}:${hash(location)}:${part.part}`;
   let state=part.state,reason=part.state,proof:Proof|null=null,originalPath:string|null=null;
   if(part.sha256!==null) {
    if(state!=='quarantined'||!/^[a-f0-9]{64}$/.test(part.sha256)||part.detected_mime!=='application/pdf')throw Error('attachment_part_invalid');
    const bytes=documentBytes(join(work,part.sha256));if(sha256(bytes)!==part.sha256||bytes.length!==part.size||!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw Error('attachment_blob_changed');
    const prior=conn.prepare('SELECT proof FROM mail_attachment_evidence WHERE sha256=?').get(part.sha256) as {proof:string}|undefined;
    if(prior){try{const p=JSON.parse(prior.proof);originalPath=readAttachmentProof(p).originalPath;proof=p;}catch{/* Re-scan changed or incomplete evidence. */}}
    if(!proof){
     const secured=await secureDocument(join(work,part.sha256),`mail:${source.account}:${source.uid}:attachment:${part.part}`);
     originalPath=secured.original_path;
     state=secured.receipt.status;reason=secured.receipt.reason_code;
     if(secured.receipt.status==='clean'){
      const extracted=await extractSecuredDocument(secured,'pdf');state=extracted.receipt.status;reason=extracted.receipt.reason_code;
      if(extracted.receipt.status==='extracted'&&extracted.text_path&&extracted.receipt.text_sha256)proof={receipt_id:secured.receipt.receipt_id,security_sha256:sha256(documentBytes(secured.receipt_path)),original_sha256:part.sha256,extraction_id:basename(dirname(extracted.text_path)),extraction_sha256:sha256(documentBytes(extracted.receipt_path)),text_sha256:extracted.receipt.text_sha256};
     }
    }
    if(proof){readAttachmentProof(proof);state='extracted';reason='security_and_text_verified';result.ready++;}else result.deferred++;
   }else result.deferred++;
   const live=sourceFor(id);if(live.body_sha256!==current.body_sha256||live.header_sha256!==current.header_sha256)throw Error('mail_source_changed');
   conn.transaction(()=>{
    const binding=conn.prepare('SELECT feedback_id,raw_sha256 FROM mail_attachment_bindings WHERE source_key=?').get(sourceKey) as {feedback_id:number;raw_sha256:string}|undefined;
    if(binding&&(binding.feedback_id!==id||binding.raw_sha256!==acquired.raw_sha256))throw Error('attachment_identity_changed');
    const known=conn.prepare('SELECT sha256 FROM mail_attachment_sources WHERE source_key=?').all(sourceKey) as {sha256:string}[];
    if(known.some(k=>k.sha256!==part.sha256))throw Error('attachment_source_blob_conflict');
    const now=new Date().toISOString();
    conn.prepare(`INSERT INTO mail_attachment_parts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source_key) DO UPDATE SET state=excluded.state,reason_code=excluded.reason_code,decoded_size=excluded.decoded_size,detected_mime=excluded.detected_mime,updated_at=excluded.updated_at`).run(sourceKey,options.eml?'eml':'imap',source.account,location?.folder??'local-export',location?.epoch??0,location?.uid??0,part.part,acquired.message_id,pathHash,part.filename,part.declared_mime,part.detected_mime,part.disposition,null,part.size,part.size,state,reason,now,now);
    if(part.sha256&&originalPath){
     conn.prepare(`INSERT INTO mail_attachment_blobs VALUES (?,?,?,?,?,?,?) ON CONFLICT(sha256) DO UPDATE SET security_status=excluded.security_status,policy_version=excluded.policy_version`).run(part.sha256,part.size,part.detected_mime,originalPath,proof?'clean':state,POLICY,now);
     conn.prepare('INSERT OR IGNORE INTO mail_attachment_sources VALUES (?,?,?)').run(sourceKey,part.sha256,now);
     if(proof)conn.prepare('INSERT INTO mail_attachment_evidence VALUES (?,?) ON CONFLICT(sha256) DO UPDATE SET proof=excluded.proof').run(part.sha256,JSON.stringify(proof));
    }
    conn.prepare('INSERT INTO mail_attachment_bindings VALUES (?,?,?,?,?) ON CONFLICT(source_key) DO UPDATE SET feedback_id=excluded.feedback_id,body_sha256=excluded.body_sha256,header_sha256=excluded.header_sha256,raw_sha256=excluded.raw_sha256').run(sourceKey,id,current.body_sha256,current.header_sha256,acquired.raw_sha256);
   })();
   result.parts++;
  }
  result.status='checked';
 }catch(e){result.reason=code(e);}
 finally {rmSync(work,{recursive:true,force:true});result.checked_at=new Date().toISOString();conn.prepare('INSERT INTO mail_attachment_checks VALUES (?,?) ON CONFLICT(feedback_id) DO UPDATE SET value=excluded.value').run(id,JSON.stringify(result));}
 return result;
}
