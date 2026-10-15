import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getFolioDb, resetFolioDbForTests } from '../../src/lib/server/folio-db/init.js';
import { proposeMemoryFact, confirmMemoryFactByHuman } from '../../src/lib/server/memory/store.js';
import { privatePath, readMemorySnapshot, scoreFacts, summarizeScores, sha256, TABLES, type Reference } from './private-support.js';

describe('private Memory replay boundary', () => {
 let previous: NodeJS.ProcessEnv;
 beforeEach(() => {
  previous = { ...process.env };
  const root = mkdtempSync(join(tmpdir(),'memory-export-test-'));
  delete process.env.FOLIO_LEDGER_DEMO_ROOT;
  process.env.FOLIO_DB_PATH = join(root,'folio.db');
  process.env.FOLIO_VAULT_OVERRIDE = join(root,'vault');
 });
 afterEach(() => { resetFolioDbForTests(); process.env = previous; });
 const fact = (domain: string, confirmed: boolean) => {
  const f = proposeMemoryFact({ domain, data_class:'context', sensitivity:'private', subject:'Synthetic project',
   predicate:'documents', value:'Synthetic evidence', source_kind:'owner', source_ref:`synthetic:${domain}`,
   actor_kind:'human', actor_id:'synthetic-owner' });
  if (confirmed) confirmMemoryFactByHuman(f.fact_id,'synthetic-owner');
  return f;
 };
 it('keeps statuses and provenance without copying Finance or mutating the source', () => {
  const yes = fact('career',true), pending = fact('ai',false); fact('finance',true);
  const db = getFolioDb(), before = sha256(db.serialize());
  db.pragma('query_only = ON');
  const snapshot = db.transaction(()=>readMemorySnapshot(db))();
  expect(snapshot.tables.memory_facts.map(f=>f.fact_id).sort()).toEqual([yes.fact_id,pending.fact_id].sort());
  expect(snapshot.tables.memory_facts.find(f=>f.fact_id===pending.fact_id)?.status).toBe('candidate');
  expect(snapshot.tables.memory_facts.find(f=>f.fact_id===yes.fact_id)?.source_ref).toBe('synthetic:career');
  expect(Object.keys(snapshot.tables)).toEqual([...TABLES]);
  expect(sha256(db.serialize())).toBe(before);
 });
 it('refuses an incomplete graph across the excluded domain', () => {
  const finance = fact('finance',true), career = fact('career',true);
  getFolioDb().prepare('UPDATE memory_facts SET supersedes_fact_id=? WHERE fact_id=?').run(finance.fact_id,career.fact_id);
  expect(()=>readMemorySnapshot(getFolioDb())).toThrow('Cross-scope foreign key');
 });
 it('refuses private outputs inside the repository', () => {
  expect(()=>privatePath(new URL('./private-fixture.json',import.meta.url).pathname)).toThrow('outside the public repository');
 });
});
describe('evidence-slot scoring', () => {
 const q: Reference = { id:'synthetic', family:'case', kind:'multi-fact', domain:'career', query:'Which evidence?',
  slots:[['a','equivalent-a'],['b']], answer_note:'Both slots required', forbidden_ids:['withdrawn'] };
 it('accepts equivalent sources once and requires every answer slot', () => {
  expect(scoreFacts(['equivalent-a','other'],q)).toMatchObject({slot_recall:.5,complete_support:false,nonreference_ids:['other']});
  expect(scoreFacts(['a','equivalent-a','b'],q)).toMatchObject({slot_recall:1,complete_support:true});
 });
 it('does not treat a related result as an answer to a missing-evidence question', () => {
  expect(scoreFacts(['a'],{...q,slots:[]})).toMatchObject({slot_recall:null,complete_support:null,unsupported_context:true});
  expect(scoreFacts([],{...q,slots:[]})).toMatchObject({unsupported_context:false});
 });
 it('records withdrawn references independently of answer coverage', () => {
  expect(scoreFacts(['a','b','withdrawn'],q)).toMatchObject({complete_support:true,forbidden_hits:['withdrawn']});
 });
 it('reports context volume and nonreference evidence separately from recall and unknown answers', () => {
  const absent = {...q,slots:[]};
  const scores = [scoreFacts(['a','b','other'],q),scoreFacts(['equivalent-a'],q),scoreFacts(['unjudged','other'],absent),scoreFacts([],absent)];
  expect(summarizeScores(scores)).toEqual({ cases:4, answerable:2, absent:2, macro_slot_recall:.75, complete_support:1,
   median_context_count:1.5, median_nonreference_answerable:.5, total_nonreference_answerable:1,
   absent_with_context:1, absent_context_count:2, median_absent_context_count:1 });
  expect(summarizeScores([])).toMatchObject({macro_slot_recall:null,median_context_count:null,absent_context_count:0});
 });
});
