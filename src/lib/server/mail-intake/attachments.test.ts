import { beforeEach,afterEach,describe,it,expect,vi } from 'vitest';
import { mkdtempSync,rmSync,writeFileSync } from 'node:fs';
import { dirname,join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
const fake=vi.hoisted(()=>({status:'clean',badName:false,calls:0,scan:vi.fn(),extract:vi.fn(),receipt:null as any,extraction:null as any}));
vi.mock('../feedback/reader.js',()=>({getFeedbackRowById:(id:number)=>({id,account_id:'own',imap_uid:id,sender:'s@example.invalid',subject:'Document',task_id:'dryrun-task-id'})}));
vi.mock('node:child_process',()=>({execFile:(_bin:string,args:string[],_opts:unknown,callback:Function)=>{
 fake.calls++;const root=dirname(args[args.indexOf('--request')+1]);
 const bytes=Buffer.from('%PDF-synthetic'),digest=createHash('sha256').update(bytes).digest('hex');
 writeFileSync(join(root,digest),bytes);
 writeFileSync(join(root,'attachments.json'),JSON.stringify({schema:'folio/mail-attachment-acquisition/v1',mailbox_mutated:false,body_sha256:createHash('sha256').update('Bound body').digest('hex'),raw_sha256:'a'.repeat(64),message_id:'synthetic',location:null,parts:[{part:'2',filename:fake.badName?'../bad.pdf':'Document.pdf',declared_mime:'application/pdf',detected_mime:'application/pdf',disposition:'attachment',size:bytes.length,state:'quarantined',sha256:digest}]}));
 callback(null,'','');
}}));
vi.mock('../file-intake/document-security.js',async original=>({
 ...await original<object>(),secureDocument:fake.scan,extractSecuredDocument:fake.extract,
 storedSecurityReceipt:()=>fake.receipt
}));
import { atomicPrivateJson,documentBytes,privateDirectory,securityRoot,sha256 } from '../file-intake/document-security.js';
import { resetFolioDbForTests } from '../folio-db/init.js';
import { db } from './state.js';
import { attachmentDocument,attachmentDownload,attachmentEvidence,attachmentSummary,processMailAttachments } from './attachments.js';
import { memorySnapshotDigest } from '../memory/store.js';
let dir:string;
beforeEach(()=>{
 dir=mkdtempSync(join(tmpdir(),'folio-attachments-test-'));vi.stubEnv('FOLIO_DB_PATH',join(dir,'folio.db'));resetFolioDbForTests();fake.status='clean';fake.badName=false;fake.calls=0;vi.clearAllMocks();
 for(const id of [1,2]){db().prepare('INSERT INTO mail_intake_sources VALUES (?,?,?,?,?,?)').run(id,'own',id,8,'Bound body',0);db().prepare('INSERT INTO mail_intake_source_capture VALUES (?,?)').run(id,'v1');}
 fake.scan.mockImplementation(async(path:string)=>{
  const bytes=documentBytes(path),digest=sha256(bytes),receiptId='11111111-1111-1111-1111-111111111111';
  const original=join(securityRoot(),'quarantine',digest,'original');privateDirectory(dirname(original));writeFileSync(original,bytes);
  fake.receipt={schema:'folio/document-security/v1',receipt_id:receiptId,status:fake.status,original_sha256:digest,reason_code:'synthetic'};
  const receiptPath=join(securityRoot(),'receipts',receiptId+'.json');atomicPrivateJson(receiptPath,fake.receipt);
  return {receipt:fake.receipt,receipt_path:receiptPath,original_path:original};
 });
 fake.extract.mockImplementation(async(secured:any)=>{
  const base=join(securityRoot(),'extractions',secured.receipt.receipt_id,'pdf','22222222-2222-2222-2222-222222222222');privateDirectory(base);
  const textPath=join(base,'text.txt');writeFileSync(textPath,'Synthetic evidence');
  fake.extraction={schema:'folio/document-extraction/v1',status:'extracted',trust:'untrusted_source',content_type:'pdf',original_sha256:secured.receipt.original_sha256,security_receipt_id:secured.receipt.receipt_id,security_receipt_sha256:sha256(documentBytes(secured.receipt_path)),text_sha256:sha256('Synthetic evidence')};
  atomicPrivateJson(join(base,'receipt.json'),fake.extraction);
  return {receipt:fake.extraction,receipt_path:join(base,'receipt.json'),text_path:textPath};
 });
});
afterEach(()=>{resetFolioDbForTests();vi.unstubAllEnvs();rmSync(dir,{recursive:true,force:true});});
describe('source-bound attachments',()=>{
 it('deduplicates bytes, preserves distinct sources and makes replay idempotent',async()=>{
  expect(await processMailAttachments(1,{eml:'/explicit/one.eml'})).toMatchObject({status:'checked',ready:1});
  expect(await processMailAttachments(2,{eml:'/explicit/two.eml'})).toMatchObject({status:'checked',ready:1});
  expect(fake.scan).toHaveBeenCalledTimes(1);expect(fake.extract).toHaveBeenCalledTimes(1);
  expect(db().prepare('SELECT count(*) n FROM mail_attachment_blobs').get()).toEqual({n:1});
  expect(db().prepare('SELECT count(*) n FROM mail_attachment_bindings').get()).toEqual({n:2});
  await processMailAttachments(1,{eml:'/explicit/one.eml'});expect(fake.calls).toBe(2);
  expect(attachmentEvidence(1)[0].text).toBe('Synthetic evidence');
 });
 it('shows a file once when EML and another saved source contain the same bytes',async()=>{await processMailAttachments(1,{eml:'/explicit/one.eml'});await processMailAttachments(1,{eml:'/explicit/second-copy.eml',retry:true});expect(attachmentSummary(1).items).toHaveLength(1);expect(db().prepare('SELECT count(*) n FROM mail_attachment_bindings').get()).toEqual({n:2});});
 it('never parses or serves a blocked scan',async()=>{
  fake.status='blocked';expect(await processMailAttachments(1,{eml:'/explicit/one.eml'})).toMatchObject({ready:0,deferred:1});
  expect(fake.extract).not.toHaveBeenCalled();expect(attachmentEvidence(1)).toEqual([]);
  const item=attachmentSummary(1).items[0];expect(item.available).toBe(false);expect(()=>attachmentDownload(1,item.id)).toThrow('attachment_not_cleared');
 });
 it('invalidates a download and corpus evidence when extracted text changes',async()=>{
  await processMailAttachments(1,{eml:'/explicit/one.eml'});const item=attachmentSummary(1).items[0];
  const base=join(securityRoot(),'extractions',fake.receipt.receipt_id,'pdf','22222222-2222-2222-2222-222222222222');writeFileSync(join(base,'text.txt'),'Changed');
  expect(attachmentEvidence(1)).toEqual([]);expect(()=>attachmentDownload(1,item.id)).toThrow('attachment_proof_changed');
 });
 it('invalidates source bindings after a stored mail changes',async()=>{
  await processMailAttachments(1,{eml:'/explicit/one.eml'});db().prepare('UPDATE mail_intake_sources SET body=? WHERE feedback_id=1').run('Changed source');
  expect(attachmentSummary(1)).toMatchObject({check:null,items:[]});expect(attachmentEvidence(1)).toEqual([]);
 });
 it('records missing locations explicitly without guessing INBOX or fetching',async()=>{
  expect(await processMailAttachments(1)).toMatchObject({status:'unavailable',reason:'attachment_location_unknown'});expect(fake.calls).toBe(0);
 });
 it('refuses filename paths before any attachment is persisted',async()=>{
  fake.badName=true;expect(await processMailAttachments(1,{eml:'/explicit/one.eml'})).toMatchObject({status:'unavailable',reason:'attachment_part_invalid'});
  expect(db().prepare('SELECT count(*) n FROM mail_attachment_parts').get()).toEqual({n:0});
 });
 it('shows document knowledge outcomes only for unchanged independently reviewed evidence',async()=>{
  await processMailAttachments(1,{eml:'/explicit/one.eml'});const digest=attachmentEvidence(1)[0].sha256;
  db().exec('CREATE TABLE mail_attachment_memory (sha256 TEXT PRIMARY KEY,value TEXT NOT NULL)');
  const record:any={sha256:digest,feedback_id:1,source_digest:memorySnapshotDigest(attachmentDocument(1,digest)),status:'example'};
  const save=()=>db().prepare('INSERT OR REPLACE INTO mail_attachment_memory VALUES (?,?)').run(digest,JSON.stringify(record));
  save();expect(attachmentSummary(1).items[0].knowledge).toBe('not_reviewed');
  record.absence_review={verdict:'missed_facts'};save();expect(attachmentSummary(1).items[0].knowledge).toBe('missed_facts');
  record.source_digest='wrong';save();expect(attachmentSummary(1).items[0].knowledge).toBe('not_reviewed');
 });
});
