import { readFileSync, mkdtempSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { TABLES, privatePath, sha256, writePrivate, scoreFacts, summarizeScores, type Snapshot, type Reference } from './private-support.js';

process.umask(0o077);
const { values } = parseArgs({ options: { snapshot: { type: 'string' }, cases: { type: 'string' }, output: { type: 'string' } } });
if (!values.snapshot || !values.cases || !values.output) throw new Error('Required: --snapshot --cases --output (private paths)');
const output = privatePath(values.output);
const rawSnapshot = readFileSync(privatePath(values.snapshot,true),'utf8'), rawCases = readFileSync(privatePath(values.cases,true),'utf8');
const snapshot = JSON.parse(rawSnapshot) as Snapshot;
const suite = JSON.parse(rawCases) as { schema: string; snapshot_sha256: string; reference: string; queries: Reference[] };
if (snapshot.schema !== 'folio/private-memory-snapshot/v1' || suite.schema !== 'folio/private-retrieval-cases/v1' || suite.snapshot_sha256 !== sha256(rawSnapshot)) throw new Error('Snapshot/case schema or hash mismatch');
if (Object.keys(snapshot.tables).sort().join() !== [...TABLES].sort().join()) throw new Error('Unexpected snapshot tables');
if (Object.values(snapshot.tables).some(rows => rows.some(r => r.domain === 'finance'))) throw new Error('Finance outside replay scope');
if (new Set(suite.queries.map(q=>q.id)).size !== suite.queries.length) throw new Error('Duplicate case IDs');
const factById = new Map(snapshot.tables.memory_facts.map(f => [String(f.fact_id),f]));
for (const q of suite.queries) {
 if (!q.query.trim() || q.domain === 'finance' || !q.family || !q.answer_note) throw new Error('Invalid case');
 for (const slot of q.slots) {
  if (!slot.length || slot.some(id => factById.get(id)?.status !== 'confirmed')) throw new Error(`Invalid confirmed reference: ${q.id}`);
 }
 for (const id of q.forbidden_ids ?? []) if (!factById.has(id)) throw new Error(`Unknown forbidden reference: ${q.id}`);
}
const runtime = mkdtempSync(join(dirname(output),'replay-'));
delete process.env.FOLIO_LEDGER_DEMO_ROOT;
process.env.FOLIO_DB_PATH = join(runtime,'folio.db');
process.env.FOLIO_VAULT_OVERRIDE = join(runtime,'vault');
process.env.FEEDBACK_DB_PATH = join(runtime,'feedback.db');
process.env.FOLIO_MEMORY_SEMANTIC = '1';
process.env.FOLIO_MEMORY_EMBEDDING_URL ??= 'http://127.0.0.1:1235/v1/embeddings';
process.env.FOLIO_MEMORY_EMBEDDING_MODEL ??= 'intfloat/multilingual-e5-small@614241f622f53c4eeff9890bdc4f31cfecc418b3/qint8';
process.env.FOLIO_MEMORY_EMBEDDING_REVISION ??= '614241f622f53c4eeff9890bdc4f31cfecc418b3';
process.env.FOLIO_MEMORY_EMBEDDING_DIMENSIONS = '384';
process.env.FOLIO_MEMORY_EMBEDDING_QUERY_PREFIX = 'query: ';
process.env.FOLIO_MEMORY_EMBEDDING_PASSAGE_PREFIX = 'passage: ';
// Review-fix regression settings: freeze before the run; no sweep on these known cases.
process.env.FOLIO_MEMORY_SEMANTIC_MIN_SIMILARITY = '0.78';
process.env.FOLIO_MEMORY_SEMANTIC_MIN_MARGIN = '0.05';
process.env.FOLIO_MEMORY_SEMANTIC_MAX_CANDIDATES = '2';
const { getFolioDb, resetFolioDbForTests } = await import('../../src/lib/server/folio-db/init.js');
const { rebuildMemoryFts } = await import('../../src/lib/server/memory/store.js');
const { compileMemoryContext, renderMemoryContext } = await import('../../src/lib/server/memory/compiler.js');
const { compileMemoryContextHybrid } = await import('../../src/lib/server/memory/hybrid.js');
const { companionMemory, companionMemoryHybrid } = await import('../../src/lib/server/focus/memory.js');
const { indexMemoryVectors, semanticIndexPath } = await import('../../src/lib/server/memory/semantic.js');
const { embeddingConfig, embeddingProfile } = await import('../../src/lib/server/memory/embedding.js');
const { getFolioDbPath } = await import('../../src/lib/server/env.js');
if (getFolioDbPath() !== join(runtime,'folio.db')) throw new Error('Replay database isolation failed');
const db = getFolioDb();
try {
 db.transaction(() => {
  db.pragma('defer_foreign_keys = ON');
  for (const table of TABLES) {
   if ((db.prepare(`SELECT COUNT(*) n FROM ${table}`).get() as {n:number}).n) throw new Error('Replay requires an empty database');
   const columns = (db.prepare(`PRAGMA table_info(${table})`).all() as {name:string}[]).map(c=>c.name);
   for (const row of snapshot.tables[table]) {
    const keys = Object.keys(row);
    if (keys.some(k=>!columns.includes(k))) throw new Error(`Snapshot schema drift: ${table}`);
    db.prepare(`INSERT INTO ${table} (${keys.map(k=>`"${k}"`).join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).run(...keys.map(k=>row[k]));
   }
  }
  if ((db.pragma('foreign_key_check') as unknown[]).length) throw new Error('Incomplete snapshot graph');
 })();
 rebuildMemoryFts();
 const before = sha256(db.serialize());
 const config = embeddingConfig()!;
 const index = await indexMemoryVectors(config), update = await indexMemoryVectors(config);
 type Run = ReturnType<typeof scoreFacts> & { at_5: ReturnType<typeof scoreFacts>; at_10: ReturnType<typeof scoreFacts> | null; duration_ms: number; context: unknown; retrieval: unknown };
 const cases: (Reference & { runs: Record<string, Run> })[] = [];
 let degradedSearches = 0;
 for (const q of suite.queries) {
  const request = { consumer_id: 'owner-preview' as const, domain: q.domain, query: q.query, max_sensitivity: 'sensitive' as const, limit: 5 };
  const runs: Record<string, Run> = {};
  for (const mode of ['preview_lexical','preview_hybrid','companion_lexical','companion_hybrid'] as const) {
   const start = performance.now();
   const bundle = mode === 'preview_lexical' ? compileMemoryContext(request) : mode === 'preview_hybrid' ? await compileMemoryContextHybrid(request) : null;
   const facts = bundle?.facts ?? (mode === 'companion_lexical' ? companionMemory(q.query) : await companionMemoryHybrid(q.query));
   const duration = performance.now()-start;
   if (bundle?.retrieval?.semantic_status === 'unavailable') degradedSearches++;
   const at = (limit:number) => scoreFacts(facts.slice(0,limit).map(f=>f.fact_id),q);
   const invalid = facts.filter(f => {
    const original = factById.get(f.fact_id);
    return !original || original.domain === 'finance' || (!f.verification && original.status !== 'confirmed') ||
     (original.valid_to && String(original.valid_to) <= new Date().toISOString());
   }).map(f=>f.fact_id);
   if (invalid.length || at(20).forbidden_hits.length) throw new Error(`Policy violation: ${q.id}, ${mode}`);
   runs[mode] = { ...at(mode.startsWith('preview')?5:20), at_5: at(5), at_10: mode.startsWith('preview') ? null : at(10), duration_ms: duration,
    context: bundle ? renderMemoryContext(bundle) : facts, retrieval: bundle?.retrieval ?? null };
  }
  cases.push({ ...q, runs });
  console.log(`Completed ${cases.length}/${suite.queries.length}: ${q.id}`);
 }
 const summarize = (items: typeof cases, mode: string, k?: 5 | 10) => {
  const times = items.map(q=>q.runs[mode].duration_ms).sort((a,b)=>a-b);
  return { ...summarizeScores(items.map(q => k ? q.runs[mode][`at_${k}`]! : q.runs[mode])),
   p50_ms: times[Math.floor(times.length*.5)], p95_ms: times[Math.min(times.length-1,Math.floor(times.length*.95))] };
 };
 const modes = Object.keys(cases[0]?.runs ?? {});
 const fixedBudgets = Object.fromEntries(([5,10] as const).map(k => [k,
  Object.fromEntries(modes.filter(m => k === 5 || m.startsWith('companion')).map(m => [m,summarize(cases,m,k)]))]));
 // Same number of facts in each pair, in addition to the shared maximum k.
 const matchedCounts = Object.fromEntries(([5,10] as const).map(k => [k,
  Object.fromEntries(['lexical','hybrid'].map(variant => [variant,summarizeScores(cases.map(q => {
   const count = Math.min(k,q.runs.companion_lexical.found.length,q.runs.companion_hybrid.found.length);
   return scoreFacts(q.runs[`companion_${variant}`].found.slice(0,count),q);
  }))]))]));
 const canonicalUnchanged = before === sha256(db.serialize());
 if (!canonicalUnchanged) throw new Error('Retrieval/indexing mutated the replay canonical database');
 writePrivate(output, { schema: 'folio/private-retrieval-report/v2', created_at: new Date().toISOString(),
  reference: suite.reference, snapshot_sha256: sha256(rawSnapshot), cases_sha256: sha256(rawCases), runtime,
  profile: { ...config, profile: embeddingProfile(config) }, index, unchanged_update: update,
  index_bytes: statSync(semanticIndexPath()).size, canonical_unchanged: canonicalUnchanged, degraded_preview_searches: degradedSearches,
  limitations: ['AI-authored questions reconstructed from historical confirmed Memory, not verbatim user queries or independent human judgments.',
   'References are evidence slots; other hits are unjudged, not automatically irrelevant.',
   'Context sufficiency only; no generated answers evaluated. Real timestamps and statuses retained; no Finance/Ledger corpus.',
   'Known regression cases, not an independent acceptance set.',
   'Preview uses five facts; companion hybrid uses ten when semantic search is ready, lexical/fallback twenty. Compare fixed_budgets and matched_companion_counts.'],
  fixed_budgets: fixedBudgets, matched_companion_counts: matchedCounts,
  summary: Object.fromEntries(modes.map(m=>[m,summarize(cases,m)])),
  by_kind: Object.fromEntries([...new Set(cases.map(q=>q.kind))].map(k=>[k,Object.fromEntries(modes.map(m=>[m,summarize(cases.filter(q=>q.kind===k),m)]))])), cases });
 console.log(JSON.stringify({ output, index, summary: Object.fromEntries(modes.map(m=>[m,summarize(cases,m)])) },null,2));
} finally { resetFolioDbForTests(); }
