import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const fake=vi.hoisted(()=>({doc:null as any,calls:0,response:null as any,review:null as any}));
vi.mock('../mail-intake/attachments.js',()=>({attachmentDocument:()=>structuredClone(fake.doc)}));
vi.mock('../regelwerk/loader.js',()=>({loadRegelwerk:()=>({voice_consensus:{voices:[{role:'primary_llm',lm_studio_model:'extractor'},{role:'conditional_reviewer',lm_studio_model:'reviewer'}]}})}));
vi.mock('../agent/llm.js',()=>({callLmStudioJson:async(_p:string,m:string)=>{fake.calls++;return m==='extractor'?structuredClone(fake.response):typeof fake.review==='function'?fake.review():structuredClone(fake.review);}}));
import {resetFolioDbForTests} from '../folio-db/init.js';
import {proposeAttachmentMemory,authorizeAttachmentMemoryReview,reviewAttachmentMemory,reviewAttachmentAbsence,validateAttachmentEnvelope,materializeAttachmentSpans,restrictedPersonalIdentifier,attachmentMemoryRecord} from './attachment-candidates.js';
import {getMemoryProposalBundle,authorizeMemoryDelegation,authorizeAttachmentMemoryDelegation,proposeMemoryBundle,memorySnapshotDigest} from './store.js';
import {db} from '../mail-intake/state.js';
const hash='a'.repeat(64);let dir:string;
beforeEach(()=>{
 dir=mkdtempSync(join(tmpdir(),'folio-pdf-memory-test-'));vi.stubEnv('FOLIO_DB_PATH',join(dir,'folio.db'));resetFolioDbForTests();
 fake.doc={feedback_id:1,sha256:hash,source_ref:`attachment:sha256:${hash}`,filename:'Arbeitszeugnis.pdf',text:'[Page 1]\nAlex Example war von 2020 bis 2024 für die SAP BW Architektur verantwortlich. Dies ist ein historisches Zeugnis.',proof:{text_sha256:'b'.repeat(64)}};
 fake.response={domain:'career',disposition:'facts',facts:[{subject:'Alex Example',predicate:'documents_experience',value:'von 2020 bis 2024 für die SAP BW Architektur verantwortlich',data_class:'profile',sensitivity:'private',quote:'Alex Example war von 2020 bis 2024 für die SAP BW Architektur verantwortlich.',page:1}]};fake.calls=0;fake.review=null;
});
afterEach(()=>{resetFolioDbForTests();vi.unstubAllEnvs();rmSync(dir,{recursive:true,force:true});});
describe('verified PDF to Memory',()=>{
 it('blocks government/personnel identifiers before persistence, without blocking case references',async()=>{
  expect(restrictedPersonalIdentifier('SV-Nr. 756.1234.5678.90')).toBe(true);
  expect(restrictedPersonalIdentifier('Schadennummer 26.0403674')).toBe(false);
  fake.doc.text='[Page 1]\nAlex Example hat die SV-Nr. 756.1234.5678.90. Weitere Angaben stehen im geschützten Original.';
  fake.response.facts[0].value='SV-Nr. 756.1234.5678.90';fake.response.facts[0].quote='Alex Example hat die SV-Nr. 756.1234.5678.90.';
  await expect(proposeAttachmentMemory(1,hash)).rejects.toThrow('restricted_personal_identifier');
  expect(db().prepare('SELECT count(*) n FROM memory_facts').get()).toEqual({n:0});
 });
 it('holds a resumed older proposal containing a restricted identifier before any model confirmation',async()=>{
  const value='SV-Nr. 756.1234.5678.90';fake.doc.text='[Page 1]\n'+value;
  const bundle=proposeMemoryBundle({domain:'finance',source_kind:'attachment',source_ref:fake.doc.source_ref,extractor_id:'memory-attachment-extractor-v1:extractor',actor_id:'test-old-extraction',facts:[{subject:'Alex Example',predicate:'identified_by',value,data_class:'account_reference',sensitivity:'sensitive',source_excerpt:value}]});
  attachmentMemoryRecord(hash);
  db().prepare('INSERT INTO mail_attachment_memory VALUES (?,?)').run(hash,JSON.stringify({sha256:hash,feedback_id:1,source_digest:memorySnapshotDigest(fake.doc),proposal_id:bundle.proposal.proposal_id,pages:{[bundle.facts[0].fact_id]:1}}));
  const grant=authorizeAttachmentMemoryReview(hash,'owner:1','test resumed source');
  expect(await reviewAttachmentMemory(hash,grant.grant_id)).toMatchObject({verdict:'reject',reason_codes:['restricted_personal_identifier'],diagnostic:{stage:'source_quote_check'}});
  expect(getMemoryProposalBundle(bundle.proposal.proposal_id).facts[0].status).toBe('candidate');expect(fake.calls).toBe(0);
 });
 it('copies selected PDF lines itself and persists their exact page provenance',async()=>{
  fake.doc.text='[Page 1]\n Alex Example\n\n war von 2020 bis 2024\n für die SAP BW Architektur verantwortlich.\n[Page 2]\nEin weiterer Abschnitt mit genug Text.';
  fake.response.facts=[{subject:'Alex Example',predicate:'documents_experience',data_class:'profile',sensitivity:'private',page:1,start_line:1,end_line:3}];
  const record=await proposeAttachmentMemory(1,hash);const fact=getMemoryProposalBundle(record.proposal_id!).facts[0];
  expect(fact.value_text).toBe('Alex Example war von 2020 bis 2024 für die SAP BW Architektur verantwortlich.');
  expect(record.pages[fact.fact_id]).toBe(1);
 });
 it.each([{page:2,start_line:1,end_line:1},{page:1,start_line:0,end_line:1},{page:1,start_line:1,end_line:2},{page:1,start_line:1.5,end_line:1.5},{page:1,start_line:2,end_line:1}])('rejects nonexistent or invalid line ranges %j',span=>{
  expect(()=>materializeAttachmentSpans({facts:[span]},fake.doc.text)).toThrow('invalid_document_line_span');
 });
 it('never joins more than four lines or text across page boundaries',()=>{
  expect(()=>materializeAttachmentSpans({facts:[{page:1,start_line:1,end_line:5}]},'[Page 1]\na\nb\nc\nd\ne')).toThrow('invalid_document_line_span');
 });
 it('binds exact page evidence and confirms only under independent document grant',async()=>{
  const record=await proposeAttachmentMemory(1,hash);const bundle=getMemoryProposalBundle(record.proposal_id!);expect(bundle.facts[0].status).toBe('candidate');
  expect(db().prepare('SELECT content_hash,field_locator FROM memory_fact_origins').get()).toEqual({content_hash:hash,field_locator:'pdf-text:page:1'});
  const grant=authorizeAttachmentMemoryReview(hash,'owner:1','explicit document test');
  fake.review={verdict:'accept',reason_codes:['fully_supported'],checked_object_ids:bundle.facts.map(f=>f.fact_id),unsupported_object_ids:[]};
  await reviewAttachmentMemory(hash,grant.grant_id);expect(getMemoryProposalBundle(record.proposal_id!).facts[0]).toMatchObject({status:'confirmed',confirmed_by:'local-memory-reviewer:reviewer'});
  await proposeAttachmentMemory(1,hash);await reviewAttachmentMemory(hash,grant.grant_id);expect(fake.calls).toBe(2);
 });
 it.each(['quote','page','value','example'] as const)('rejects invalid %s attribution before persistence',async(kind)=>{
  if(kind==='quote')fake.response.facts[0].quote='Not present';if(kind==='page')fake.response.facts[0].page=2;if(kind==='value')fake.response.facts[0].value='Current job';if(kind==='example')fake.doc.filename='EDV-Profil Beispiel.pdf';
  await expect(proposeAttachmentMemory(1,hash)).rejects.toThrow();expect(db().prepare('SELECT count(*) n FROM memory_proposals').get()).toEqual({n:0});expect(fake.calls).toBe(2);
 });
 it('keeps empty scanned pages for OCR and does not ask a model to invent text',async()=>{
  fake.doc.text='[Page 1]\n\n[Page 2]\n';expect(await proposeAttachmentMemory(1,hash)).toMatchObject({status:'needs_ocr',facts:0});expect(fake.calls).toBe(0);
 });
 it('refuses changed evidence after a grant',async()=>{
  await proposeAttachmentMemory(1,hash);const grant=authorizeAttachmentMemoryReview(hash,'owner:1','test');fake.doc.text+='changed';await expect(reviewAttachmentMemory(hash,grant.grant_id)).rejects.toThrow('document_binding_changed');
 });
 it('does not allow a mail grant or a paid fact through the document path',async()=>{
  const record=await proposeAttachmentMemory(1,hash);
  expect(()=>authorizeMemoryDelegation(record.proposal_id!,'owner:1','test','f'.repeat(64),'reviewer')).toThrow();
  expect(()=>authorizeAttachmentMemoryDelegation(record.proposal_id!,'owner:1','test','f'.repeat(64),'extractor')).toThrow(/differ/);
  db().prepare("UPDATE memory_facts SET predicate='paid'").run();expect(()=>authorizeAttachmentMemoryReview(hash,'owner:1','test')).toThrow(/bounded/);
 });
 it('retains rejection as a candidate and malformed review never confirms',async()=>{
  const record=await proposeAttachmentMemory(1,hash),grant=authorizeAttachmentMemoryReview(hash,'owner:1','test');fake.review={verdict:'accept',reason_codes:['fully_supported'],checked_object_ids:[],unsupported_object_ids:[]};
  await expect(reviewAttachmentMemory(hash,grant.grant_id)).rejects.toThrow('independent_document_review_incomplete');expect(getMemoryProposalBundle(record.proposal_id!).proposal.status).toBe('candidate');
  fake.review={verdict:'reject',reason_codes:['historical_context_missing'],checked_object_ids:getMemoryProposalBundle(record.proposal_id!).facts.map(f=>f.fact_id),unsupported_object_ids:getMemoryProposalBundle(record.proposal_id!).facts.map(f=>f.fact_id)};
  await reviewAttachmentMemory(hash,grant.grant_id);expect(getMemoryProposalBundle(record.proposal_id!).proposal.status).toBe('candidate');
 });
 it('avoids duplicating identical already-stored knowledge across source kinds',async()=>{
  const f=fake.response.facts[0];proposeMemoryBundle({domain:'career',source_kind:'file',source_ref:'existing',extractor_id:'prior',actor_id:'prior',facts:[{subject:f.subject,predicate:f.predicate,value:f.value,data_class:f.data_class,sensitivity:f.sensitivity}]});
  expect(await proposeAttachmentMemory(1,hash)).toMatchObject({status:'duplicate_only',facts:0});expect(db().prepare('SELECT count(*) n FROM memory_proposals').get()).toEqual({n:1});
 });
 it('requires sensitive handling for financial identifiers',()=>{
  fake.response.domain='finance';expect(validateAttachmentEnvelope(fake.response,fake.doc).facts[0].sensitivity).toBe('sensitive');
 });
 it('independently checks empty output and permits only one evidence-driven recall repair',async()=>{
  const original=structuredClone(fake.response);fake.response={domain:'career',disposition:'example',facts:[]};
  await proposeAttachmentMemory(1,hash);
  await expect(proposeAttachmentMemory(1,hash,()=>{},true)).rejects.toThrow('document_repair_not_authorized_by_evidence');
  fake.review={verdict:'missed_facts'};expect(await reviewAttachmentAbsence(hash)).toMatchObject({verdict:'missed_facts',model:'reviewer'});
  fake.response=original;const repaired=await proposeAttachmentMemory(1,hash,()=>{},true);expect(repaired).toMatchObject({status:'candidate',facts:1,repair_attempts:1,prior_absence:{status:'example'}});
  await expect(proposeAttachmentMemory(1,hash,()=>{},true)).rejects.toThrow('document_repair_not_authorized_by_evidence');
 });
});
