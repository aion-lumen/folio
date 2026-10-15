import { createHash } from 'node:crypto';
import { realpathSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type Database from 'better-sqlite3';

// Only retrieval inputs: no Ledger tables, mail archive, audit log or app settings.
export const TABLES = ['memory_proposals', 'memory_entities', 'memory_entity_aliases',
 'memory_facts', 'memory_relations', 'memory_episodes', 'memory_episode_entities',
 'memory_sources', 'memory_source_domains', 'memory_fact_origins',
 'memory_origin_attestations', 'memory_quorum_receipts'] as const;
export type Row = Record<string, string | number | null>;
export type Snapshot = { schema: 'folio/private-memory-snapshot/v1'; captured_at: string;
 excluded_domains: string[]; tables: Record<typeof TABLES[number], Row[]> };
export const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const repository = realpathSync(fileURLToPath(new URL('../../', import.meta.url)));
export function privatePath(path: string, existing = false): string {
 const actual = existing ? realpathSync(path) : resolve(realpathSync(dirname(path)), path.split(sep).at(-1)!);
 if (actual === repository || actual.startsWith(repository + sep)) throw new Error('Private data must stay outside the public repository');
 return actual;
}
export function writePrivate(path: string, data: unknown): void {
 writeFileSync(privatePath(path), JSON.stringify(data, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
}
export function readMemorySnapshot(db: Database.Database): Snapshot {
 const all = (table: typeof TABLES[number], where = '') => db.prepare(`SELECT * FROM ${table} ${where} ORDER BY rowid`).all() as Row[];
 const tables = Object.fromEntries(TABLES.map(t => [t, []])) as unknown as Snapshot['tables'];
 for (const table of ['memory_proposals','memory_entities','memory_facts','memory_relations','memory_episodes'] as const) {
  tables[table] = all(table, "WHERE domain != 'finance'");
 }
 const ids = (table: typeof TABLES[number], field: string) => new Set(tables[table].map(r => r[field]));
 const entities = ids('memory_entities','entity_id'), facts = ids('memory_facts','fact_id'), episodes = ids('memory_episodes','episode_id');
 tables.memory_entity_aliases = all('memory_entity_aliases').filter(r => entities.has(r.entity_id));
 tables.memory_episode_entities = all('memory_episode_entities').filter(r => entities.has(r.entity_id) && episodes.has(r.episode_id));
 tables.memory_fact_origins = all('memory_fact_origins').filter(r => facts.has(r.fact_id));
 const refs = new Set(Object.values(tables).flatMap(rows => rows.flatMap(r => [r.source_ref, r.root_ref].filter(Boolean))));
 const sources = all('memory_sources');
 // Preserve root provenance metadata for selected records without copying source bodies.
 let expanded = true;
 while (expanded) {
  expanded = false;
  for (const row of sources) if (refs.has(row.source_ref) && row.origin_document_id) {
   const root = `file:${row.origin_document_id}`;
   if (!refs.has(root)) { refs.add(root); expanded = true; }
  }
 }
 tables.memory_sources = sources.filter(r => refs.has(r.source_ref));
 const sourceIds = ids('memory_sources','source_id');
 tables.memory_source_domains = all('memory_source_domains').filter(r => sourceIds.has(r.source_id) && r.domain !== 'finance');
 const supported = (r: Row) => (JSON.parse(String(r.supporting_fact_ids ?? r.supported_fact_ids)) as string[]).every(id => facts.has(id));
 tables.memory_origin_attestations = all('memory_origin_attestations').filter(r => refs.has(r.source_ref) && supported(r));
 tables.memory_quorum_receipts = all('memory_quorum_receipts').filter(r => facts.has(r.canonical_fact_id) && supported(r));
 // Refuse a partial graph rather than silently promoting or changing a record.
 for (const table of TABLES) {
  const links = db.prepare(`PRAGMA foreign_key_list(${table})`).all() as { table: string; from: string; to: string }[];
  for (const link of links) {
   if (!TABLES.includes(link.table as typeof TABLES[number])) throw new Error(`Unsupported foreign key in ${table}`);
   const targets = ids(link.table as typeof TABLES[number], link.to);
   if (tables[table].some(r => r[link.from] !== null && !targets.has(r[link.from]))) throw new Error(`Cross-scope foreign key in ${table}; use a reviewed cohort`);
  }
 }
 return { schema: 'folio/private-memory-snapshot/v1', captured_at: new Date().toISOString(), excluded_domains: ['finance'], tables };
}

export type Reference = { id: string; family: string; kind: string; domain: string; query: string;
 // Each slot needs one of these equivalent fact IDs. Empty slots means no approved answer.
 slots: string[][]; answer_note: string; forbidden_ids?: string[] };
export function scoreFacts(found: string[], query: Reference) {
 const slotsFound = query.slots.map(alternatives => alternatives.some(id => found.includes(id)));
 const expected = new Set(query.slots.flat());
 return { found, slot_recall: query.slots.length ? slotsFound.filter(Boolean).length / query.slots.length : null,
  complete_support: query.slots.length ? slotsFound.every(Boolean) : null,
  nonreference_ids: found.filter(id => !expected.has(id)),
  context_count: found.length,
  nonreference_count: found.filter(id => !expected.has(id)).length,
  forbidden_hits: found.filter(id => query.forbidden_ids?.includes(id)),
  unsupported_context: !query.slots.length && found.length > 0 };
}

export function summarizeScores(scores: ReturnType<typeof scoreFacts>[]) {
 const answerable = scores.filter(s => s.slot_recall !== null), absent = scores.filter(s => s.slot_recall === null);
 const median = (values: number[]) => {
  const sorted = values.slice().sort((a,b) => a-b), mid = Math.floor(sorted.length / 2);
  return sorted.length ? (sorted[mid] + sorted[Math.floor((sorted.length-1)/2)]) / 2 : null;
 };
 return { cases: scores.length, answerable: answerable.length, absent: absent.length,
  macro_slot_recall: answerable.length ? answerable.reduce((sum,s) => sum + s.slot_recall!,0)/answerable.length : null,
  complete_support: answerable.filter(s => s.complete_support).length,
  median_context_count: median(scores.map(s => s.context_count)),
  median_nonreference_answerable: median(answerable.map(s => s.nonreference_count)),
  total_nonreference_answerable: answerable.reduce((sum,s) => sum+s.nonreference_count,0),
  absent_with_context: absent.filter(s => s.unsupported_context).length,
  absent_context_count: absent.reduce((sum,s) => sum+s.context_count,0),
  median_absent_context_count: median(absent.map(s => s.context_count)) };
}
