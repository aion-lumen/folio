import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const fake=vi.hoisted(()=>({response:null as any,review:null as any,calls:0,prompts:[] as string[]}));
vi.mock('../regelwerk/loader.js',()=>({loadRegelwerk:()=>({voice_consensus:{voices:[{role:'primary_llm',lm_studio_model:'extractor'},{role:'conditional_reviewer',lm_studio_model:'reviewer'}]}})}));
vi.mock('../agent/llm.js',()=>({callLmStudioJson:async(p:string,m:string)=>{fake.calls++;fake.prompts.push(p);return m==='extractor'?(typeof fake.response==='function'?fake.response():structuredClone(fake.response)):typeof fake.review==='function'?fake.review():structuredClone(fake.review);}}));
import {resetFolioDbForTests} from '../folio-db/init.js';
import {db} from '../mail-intake/state.js';
import {proposeFileMemory,authorizeFileMemoryReview,reviewFileMemory,fileMemoryRecord,type FileMemoryDocument} from './file-candidates.js';
import {getMemoryProposalBundle,authorizeMemoryDelegation,authorizeAttachmentMemoryDelegation,authorizeFileMemoryDelegation,finishDelegatedMemoryReview,confirmMemoryProposalBundle} from './store.js';
import {companionMemory} from '../focus/memory.js';
import {bindFactOrigin,factOrigin} from './provenance.js';
import {confirmMemoryFactByHuman,confirmMemoryCandidatesBySource,confirmMemoryReviewProposalBundle} from './store.js';
let dir:string,doc:FileMemoryDocument;const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'folio-file-memory-'));vi.stubEnv('FOLIO_DB_PATH',join(dir,'folio.db'));resetFolioDbForTests();const raw='Original test source';writeFileSync(join(dir,'source.txt'),raw);const text='[Page 1]\nStand: 2024-03-01\nAlex Example arbeitete 2020 bis 2024 im Projekt Orion.\nFür Objekt Orion ist eine Bearbeitungsgebühr von 75 EUR vereinbart.';doc={sha256:sha(raw),original_path:join(dir,'source.txt'),filename:'Projekt.txt',text,text_sha256:sha(text),extraction_method:'test-only',complete:true};fake.calls=0;fake.prompts=[];fake.review=null;fake.response={domain:'projects',disposition:'facts',facts:[{domain:'projects',subject:'Alex Example',predicate:'documents_project',data_class:'project_fact',sensitivity:'private',claim_kind:'event',page:1,start_line:2,end_line:2},{domain:'finance',subject:'Objekt Orion',predicate:'has_context',data_class:'context',sensitivity:'sensitive',claim_kind:'state',page:1,start_line:3,end_line:3}]};});
afterEach(()=>{resetFolioDbForTests();vi.unstubAllEnvs();rmSync(dir,{recursive:true,force:true});});
const accept=(pid:string)=>({verdict:'accept',reason_codes:['fully_supported'],checked_object_ids:getMemoryProposalBundle(pid).facts.map(f=>f.fact_id),unsupported_object_ids:[]});
const setText=(text:string)=>{doc.text=text;doc.text_sha256=sha(text);};
const makeLegacy=async()=>{const r=await proposeFileMemory(doc);for(const [id,evidence] of Object.entries(r.evidence!))db().prepare('UPDATE memory_facts SET value_text=? WHERE fact_id=?').run(evidence.raw_value,id);delete r.quality_policy;delete r.evidence;db().prepare('UPDATE memory_file_reviews SET value=? WHERE sha256=?').run(JSON.stringify(r),doc.sha256);return r;};
describe('explicit file memory review',()=>{
 it('asks for substantive evidence after a header-only archive proposal without storing the header',async()=>{
  setText('[Page 1]\n# Projektbericht\nDatum: 2024-03-01\nAlex Example leitete von 2020 bis 2022 Projekt Orion.');
  const base={...fake.response,facts:[{...fake.response.facts[0],start_line:1,end_line:2}]};
  fake.response=()=>fake.calls===1?base:{...base,facts:[{...base.facts[0],start_line:3,end_line:3}]};
  const r=await proposeFileMemory(doc);expect(fake.calls).toBe(2);
  expect(fake.prompts[1]).toContain('archive_metadata_without_claim');
  expect(getMemoryProposalBundle(r.proposal_ids[0]).facts[0].source_excerpt).toBe('Alex Example leitete von 2020 bis 2022 Projekt Orion.');
 });
 it('explains inclusive span counts and accepts only a newly selected complete passage',async()=>{
  fake.prompts=[];
  setText('[Page 1]\nStand: 2024-03-01\nAlex Example leitete von 2020 bis 2022 Projekt Orion.\nWeitere Notiz.\nAndere Notiz.\nLetzte Notiz.');
  const base={...fake.response,facts:[{...fake.response.facts[0],start_line:1,end_line:5}]};
  fake.response=()=>fake.calls===1?base:{...base,facts:[{...base.facts[0],start_line:2,end_line:2}]};
  const result=await proposeFileMemory(doc);
  expect(fake.calls).toBe(2);expect(fake.prompts[1]).toContain('"line_count":5');
  expect(fake.prompts[1]).toContain('end_line - start_line + 1, maximum 4');
  expect(getMemoryProposalBundle(result.proposal_ids[0]).facts[0].source_excerpt).toBe('Alex Example leitete von 2020 bis 2022 Projekt Orion.');
 });
 it('still refuses an oversized archive quote after the one permitted correction',async()=>{
  setText('[Page 1]\nStand: 2024-03-01\nAlex Example leitete Projekt Orion.\nWeitere Notiz.\nAndere Notiz.\nLetzte Notiz.');
  fake.response.facts=[{...fake.response.facts[0],start_line:1,end_line:5}];
  await expect(proposeFileMemory(doc)).rejects.toThrow('invalid_document_line_span');
  expect(fake.calls).toBe(2);expect(db().prepare('SELECT count(*) n FROM memory_proposals').get()).toEqual({n:0});
 });
 it('keeps an undated contractual obligation as a rule through review and retrieval',async()=>{
  setText('[Page 1]\nVereinbarung Orion\nDer Mieter soll die Wohnung pfleglich behandeln.');
  fake.response.facts=[{...fake.response.facts[0],domain:'immo',subject:'Vertrag Orion',claim_kind:'rule',start_line:2,end_line:2}];
  const r=await proposeFileMemory(doc),pid=r.proposal_ids[0];
  expect(r.evidence![getMemoryProposalBundle(pid).facts[0].fact_id]).toMatchObject({claim_kind:'rule',source_date:null});
  const g=authorizeFileMemoryReview(doc,pid,'owner','synthetic scope');fake.review=accept(pid);await reviewFileMemory(doc,g.grant_id);
  const f=getMemoryProposalBundle(pid).facts[0];expect(f.status).toBe('confirmed');
  expect(f.value_text).toContain('dokumentierte Regel; heutige Gültigkeit ungeprüft');
  expect(companionMemory('pfleglich behandeln')[0].value).toBe(f.value_text);
 });
 it('does not weaken the verbatim source rule for general provenance or mail claims',async()=>{
  const r=await proposeFileMemory(doc),f=getMemoryProposalBundle(r.proposal_ids[0]).facts[0],origin=factOrigin(f.fact_id)!;
  expect(()=>bindFactOrigin(origin)).toThrow('Feldbeleg unterstützt Aussage nicht');
  db().prepare("UPDATE memory_facts SET source_kind='mail' WHERE fact_id=?").run(f.fact_id);
  expect(()=>bindFactOrigin(origin,r.evidence![f.fact_id])).toThrow('Archivkontext unterstützt Aussage nicht');
 });
 it('keeps an old personal intention dated through confirmation and retrieval',async()=>{
  setText('[Page 1]\nStand: 2023-02-04\nIch möchte das Atelier verkaufen.');
  fake.response.facts=[{...fake.response.facts[0],domain:'personal',subject:'Atelier',predicate:'has_profile_fact',data_class:'profile',claim_kind:'state',start_line:2,end_line:2}];
  const r=await proposeFileMemory(doc),pid=r.proposal_ids[0],g=authorizeFileMemoryReview(doc,pid,'owner','synthetic scope');fake.review=accept(pid);await reviewFileMemory(doc,g.grant_id);
  const f=getMemoryProposalBundle(pid).facts[0];expect(f).toMatchObject({predicate:'has_context',data_class:'context',valid_from:null});
  expect(f.value_text).toContain('Stand laut Dokument: 2023-02-04; damaliger Plan; Umsetzung nicht belegt');
  expect(f.source_excerpt).toBe('Ich möchte das Atelier verkaufen.');
  expect(companionMemory('Atelier verkaufen')[0].value).toBe(f.value_text);
 });
 it('holds undated plans and executor noise while preserving useful project history',async()=>{
  setText('[Page 1]\nIch möchte eine Werkstatt eröffnen.\nPID: 17723\nAlex Example leitete von 2020 bis 2022 das Projekt Orion.');
  fake.response.facts=[{...fake.response.facts[0],claim_kind:'event',start_line:1,end_line:1},{...fake.response.facts[0],claim_kind:'rule',start_line:2,end_line:2},{...fake.response.facts[0],claim_kind:'event',start_line:3,end_line:3}];
  const r=await proposeFileMemory(doc);expect(r.facts).toBe(1);expect(r.quality_holds?.map(h=>h.reason)).toEqual(['historical_context_missing','transient_or_low_value']);
  expect(getMemoryProposalBundle(r.proposal_ids[0]).facts[0].value_text).toContain('2020 bis 2022');
 });
 it('records a quality hold when all extracted facts are transient',async()=>{
  setText('[Page 1]\nPID: 17723');fake.response.facts=[{...fake.response.facts[0],claim_kind:'rule',start_line:1,end_line:1}];
  expect(await proposeFileMemory(doc)).toMatchObject({status:'quality_hold',facts:0,proposal_ids:[]});
  expect(db().prepare('SELECT count(*) n FROM memory_facts').get()).toEqual({n:0});
 });
 it('requires explicit reassessment of legacy candidates and preserves their history',async()=>{
  const old=await makeLegacy();
  await expect(proposeFileMemory(doc)).rejects.toThrow('file_quality_reassessment_required');
  expect(()=>authorizeFileMemoryReview(doc,old.proposal_ids[0],'owner','test')).toThrow('file_quality_reassessment_required');
  const next=await proposeFileMemory(doc,()=>{},{reassessLegacy:true});
  expect(next.previous_attempt?.proposal_ids).toEqual(old.proposal_ids);expect(next.proposal_ids).not.toEqual(old.proposal_ids);
  const retired=getMemoryProposalBundle(old.proposal_ids[0]);
  expect(retired.proposal.status).toBe('rejected');expect(retired.facts.every(f=>f.status==='superseded')).toBe(true);
  expect(()=>confirmMemoryFactByHuman(retired.facts[0].fact_id,'owner')).toThrow('only candidates');
  expect(()=>confirmMemoryReviewProposalBundle(retired.proposal.proposal_id,'owner')).toThrow('only candidate proposals');
  const current=getMemoryProposalBundle(next.proposal_ids[0]);
  expect(confirmMemoryCandidatesBySource(current.proposal.domain,`file:${doc.sha256}`,'owner').map(f=>f.fact_id)).toEqual(current.facts.map(f=>f.fact_id));
  const audit=db().prepare("SELECT detail_json FROM memory_ledger WHERE object_id=? AND event_type='quality_reassessed'").get(retired.facts[0].fact_id) as {detail_json:string};
  expect(JSON.parse(audit.detail_json).replacement_proposal_ids).toEqual(next.proposal_ids);
  expect(()=>authorizeFileMemoryReview(doc,old.proposal_ids[0],'owner','test')).toThrow('file_proposal_binding_changed');
 });
 it('retires unsafe legacy suggestions even when reassessment yields no replacement',async()=>{
  const old=await makeLegacy();fake.response={domain:'projects',disposition:'no_personal_fact',facts:[]};
  const next=await proposeFileMemory(doc,()=>{},{reassessLegacy:true});expect(next.proposal_ids).toEqual([]);
  for(const id of old.proposal_ids){const b=getMemoryProposalBundle(id);expect(b.facts.every(f=>f.status==='superseded')).toBe(true);expect(()=>confirmMemoryCandidatesBySource(b.proposal.domain,`file:${doc.sha256}`,'owner')).toThrow('no candidates');}
 });
 it('retires every still-confirmable generation in a legacy reassessment history',async()=>{
  const first=await makeLegacy(),second=await proposeFileMemory(doc,()=>{},{reassessLegacy:true});
  // Reproduce v2 history: its first attempt remained candidate after replacement.
  for(const pid of first.proposal_ids){db().prepare("UPDATE memory_facts SET status='candidate' WHERE proposal_id=?").run(pid);db().prepare("UPDATE memory_proposals SET status='candidate' WHERE proposal_id=?").run(pid);}
  delete second.quality_policy;db().prepare('UPDATE memory_file_reviews SET value=? WHERE sha256=?').run(JSON.stringify(second),doc.sha256);
  const third=await proposeFileMemory(doc,()=>{},{reassessLegacy:true});
  for(const pid of [...first.proposal_ids,...second.proposal_ids]){const b=getMemoryProposalBundle(pid);expect(b.facts.every(f=>f.status==='superseded')).toBe(true);expect(()=>confirmMemoryReviewProposalBundle(pid,'owner')).toThrow('only candidate proposals');}
  expect(third.previous_attempt?.previous_attempt?.proposal_ids).toEqual(first.proposal_ids);
 });
 it('preserves a human decision made while legacy extraction is running',async()=>{
  const old=await makeLegacy(),response=structuredClone(fake.response);
  const before=(db().prepare('SELECT count(*) n FROM memory_facts').get() as {n:number}).n;
  fake.response=()=>{confirmMemoryProposalBundle(old.proposal_ids[0],'concurrent owner');return response;};
  await expect(proposeFileMemory(doc,()=>{},{reassessLegacy:true})).rejects.toThrow('confirmed_file_requires_quality_reopen');
  expect(getMemoryProposalBundle(old.proposal_ids[0]).proposal.status).toBe('confirmed');
  expect(db().prepare('SELECT count(*) n FROM memory_facts').get()).toEqual({n:before});
  expect(fileMemoryRecord(doc.sha256)?.proposal_ids).toEqual(old.proposal_ids);
 });
 it('does not replace already confirmed legacy facts' ,async()=>{
  const old=await makeLegacy();confirmMemoryProposalBundle(old.proposal_ids[0],'synthetic owner');
  await expect(proposeFileMemory(doc,()=>{},{reassessLegacy:true})).rejects.toThrow('confirmed_file_requires_quality_reopen');
  expect(fileMemoryRecord(doc.sha256)?.proposal_ids).toEqual(old.proposal_ids);
 });
 it('binds the context metadata to the independent review grant',async()=>{
  const r=await proposeFileMemory(doc),pid=r.proposal_ids[0],g=authorizeFileMemoryReview(doc,pid,'owner','test');fake.review=accept(pid);
  const id=getMemoryProposalBundle(pid).facts[0].fact_id;r.evidence![id].source_date='2026-10-14';
  db().prepare('UPDATE memory_file_reviews SET value=? WHERE sha256=?').run(JSON.stringify(r),doc.sha256);
  await expect(reviewFileMemory(doc,g.grant_id)).rejects.toThrow('file_grant_changed');expect(fake.calls).toBe(1);
 });
 it('refuses a forged qualification even with a fresh grant',async()=>{
  const r=await proposeFileMemory(doc),pid=r.proposal_ids[0],id=getMemoryProposalBundle(pid).facts[0].fact_id;
  r.evidence![id].value='Alle Angaben sind heute gültig.';db().prepare('UPDATE memory_facts SET value_text=? WHERE fact_id=?').run(r.evidence![id].value,id);
  db().prepare('UPDATE memory_file_reviews SET value=? WHERE sha256=?').run(JSON.stringify(r),doc.sha256);
  const g=authorizeFileMemoryReview(doc,pid,'owner','test');fake.review=accept(pid);
  expect((await reviewFileMemory(doc,g.grant_id)).verdict).toBe('reject');expect(fake.calls).toBe(1);
 });
 it('requires separate grants per domain and records system confirmation and section provenance',async()=>{const r=await proposeFileMemory(doc);expect(r.proposal_ids.length).toBe(2);for(const pid of r.proposal_ids){expect(getMemoryProposalBundle(pid).proposal.status).toBe('candidate');const g=authorizeFileMemoryReview(doc,pid,'owner','explicit selected hash');fake.review=accept(pid);await reviewFileMemory(doc,g.grant_id);expect(getMemoryProposalBundle(pid).facts[0]).toMatchObject({status:'confirmed',confirmed_by:'local-memory-reviewer:reviewer'});}expect(db().prepare('SELECT count(*) n FROM memory_fact_origins WHERE field_locator LIKE ?').get('extracted-text:section:%')).toEqual({n:2});expect((await proposeFileMemory(doc)).proposal_ids).toEqual(r.proposal_ids);expect(fake.calls).toBe(3);});
 it.each(['original','text','complete'] as const)('fails closed when %s changes',async(kind)=>{const r=await proposeFileMemory(doc),g=authorizeFileMemoryReview(doc,r.proposal_ids[0],'owner','test');fake.review=accept(r.proposal_ids[0]);if(kind==='original')writeFileSync(doc.original_path,'changed');if(kind==='text')doc.text+='changed';if(kind==='complete')(doc as any).complete=false;await expect(reviewFileMemory(doc,g.grant_id)).rejects.toThrow('file_source_binding_changed');expect(fake.calls).toBe(1);});
 it('refuses mail and attachment grants, same-model checks and paid facts',async()=>{const r=await proposeFileMemory(doc),pid=r.proposal_ids[0];expect(()=>authorizeMemoryDelegation(pid,'owner','test','a'.repeat(64),'reviewer')).toThrow();expect(()=>authorizeAttachmentMemoryDelegation(pid,'owner','test','a'.repeat(64),'reviewer')).toThrow();expect(()=>authorizeFileMemoryDelegation(pid,'owner','test','a'.repeat(64),'extractor')).toThrow(/differ/);db().prepare("UPDATE memory_facts SET predicate='paid' WHERE proposal_id=?").run(pid);expect(()=>authorizeFileMemoryReview(doc,pid,'owner','test')).toThrow(/bounded/);});
 it('cannot confirm a file using only a quote check',async()=>{const r=await proposeFileMemory(doc),pid=r.proposal_ids[0],g=authorizeFileMemoryReview(doc,pid,'owner','test');expect(()=>finishDelegatedMemoryReview(g.grant_id,g.source_digest,'reviewer','accept',['fully_supported'],{stage:'source_quote_check',checked_object_ids:getMemoryProposalBundle(pid).facts.map(f=>f.fact_id),unsupported_object_ids:[]})).toThrow('independent semantic review');expect(getMemoryProposalBundle(pid).proposal.status).toBe('candidate');});
 it('never confirms an incomplete or rejecting review',async()=>{const r=await proposeFileMemory(doc),pid=r.proposal_ids[0],g=authorizeFileMemoryReview(doc,pid,'owner','test');fake.review={...accept(pid),checked_object_ids:[]};await expect(reviewFileMemory(doc,g.grant_id)).rejects.toThrow('independent_file_review_incomplete');fake.review={...accept(pid),verdict:'reject',reason_codes:['historical_context_missing']};await reviewFileMemory(doc,g.grant_id);expect(getMemoryProposalBundle(pid).proposal.status).toBe('candidate');});
 it('checks cancellation again after inference before confirmation',async()=>{const r=await proposeFileMemory(doc),pid=r.proposal_ids[0],g=authorizeFileMemoryReview(doc,pid,'owner','test');let stopped=false;fake.review=()=>{stopped=true;return accept(pid)};await expect(reviewFileMemory(doc,g.grant_id,()=>{if(stopped)throw Error('stopped')})).rejects.toThrow('stopped');expect(getMemoryProposalBundle(pid).proposal.status).toBe('candidate');});
 it('keeps exact duplicate claims out of repeated proposals',async()=>{await proposeFileMemory(doc);const raw='Another original';writeFileSync(join(dir,'other.txt'),raw);const second={...doc,sha256:sha(raw),original_path:join(dir,'other.txt')};expect(await proposeFileMemory(second)).toMatchObject({status:'duplicate_only',facts:0});expect(db().prepare('SELECT count(*) n FROM memory_facts').get()).toEqual({n:2});});
 it('does not extract from a tombstoned source',async()=>{await proposeFileMemory(doc);db().prepare("UPDATE memory_sources SET status='tombstoned'").run();await expect(proposeFileMemory(doc)).rejects.toThrow('source_rejected_or_forgotten');expect(fake.calls).toBe(1);});
});
