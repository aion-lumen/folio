import { getFolioDb } from '../folio-db/init.js';
import type { MemoryFactRow } from './types.js';

export interface MemoryEvidence {
	origin_fact_ids: string[];
	origin_source_count: number;
	derived_fact_count: number;
	unresolved: boolean;
	// Distinct records (even with different refs) do not establish independence.
	independence: 'not_established';
}

export function resolveMemoryEvidence(
	factIds: string[],
	domain: string,
	facts: Map<string, MemoryFactRow>,
	parents: Map<string, string[]>,
	contentHashes: Map<string, string> = new Map()
): MemoryEvidence {
	const origins = new Set<string>();
	const derived = new Set<string>();
	const sources = new Set<string>();
	const expanded = new Set<string>();
	let unresolved = false;
	function visit(id: string, path: Set<string>): void {
		const fact = facts.get(id);
		if (!fact || fact.status !== 'confirmed' || fact.domain !== domain || path.has(id) || path.size >= 64) {
			unresolved = true;
			return;
		}
		if (expanded.has(id)) return;
		if (fact.source_kind === 'memory-consolidation') {
			derived.add(id);
			const ids = parents.get(id);
			if (!ids?.length) { unresolved = true; return; }
			for (const parent of ids) visit(parent, new Set([...path, id]));
			expanded.add(id);
			return;
		}
		origins.add(id);
		const root = sourceRoot(fact.source_ref);
		const hash = contentHashes.get(root) ?? contentHashes.get(fact.source_ref)
			?? /^file:(?:sha256:)?([a-f0-9]{64})$/i.exec(fact.source_ref)?.[1];
		if (!fact.source_ref.trim()) unresolved = true;
		else sources.add(hash ? `hash:${hash.toLowerCase()}` : `ref:${root}`);
		expanded.add(id);
	}
	for (const id of new Set(factIds)) visit(id, new Set());
	return {
		origin_fact_ids: [...origins].sort(), origin_source_count: sources.size,
		derived_fact_count: derived.size, unresolved, independence: 'not_established'
	};
}

export const normalizeClaim = (value: string) => value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('de-CH');
type ClaimFact = Pick<MemoryFactRow, 'domain' | 'subject_entity_id' | 'predicate' | 'subject'>;
const languages: Record<string, string> = { deutsch: 'de', german: 'de', englisch: 'en', english: 'en', französisch: 'fr', french: 'fr', persisch: 'fa', farsi: 'fa', persian: 'fa' };

/** Qualifiers describe a property, never its value or its array position. No fuzzy aliases. */
export function claimSlot(fact: ClaimFact): { parts: string[]; ambiguous: boolean } {
 let qualifier = '';
 let ambiguous = false;
 if (fact.predicate === 'level') {
  const language = languages[normalizeClaim(fact.subject)];
  qualifier = language ? `language:${language}` : `unresolved:${normalizeClaim(fact.subject)}`;
  ambiguous = !language;
 } else if (fact.predicate === 'documents_own_project') {
  qualifier = `project:${normalizeClaim(fact.subject)}`;
  ambiguous = !normalizeClaim(fact.subject);
 } else if (['documents_competency', 'documents_experience', 'documents_project', 'certified_by', 'holds_degree', 'documents_skills'].includes(fact.predicate)) {
  // Legacy multi-valued properties need reviewed stable IDs; do not infer them from indices.
  qualifier = `unresolved:${normalizeClaim(fact.subject)}`;
  ambiguous = true;
 }
 return { parts: [fact.domain, fact.subject_entity_id ?? '', fact.predicate, qualifier], ambiguous };
}

export interface FactOrigin { fact_id: string; root_ref: string; content_hash: string; field_locator: string; excerpt: string; recorded_at: string }
export function factOrigin(factId: string): FactOrigin | undefined {
 return getFolioDb().prepare('SELECT * FROM memory_fact_origins WHERE fact_id=?').get(factId) as FactOrigin | undefined;
}
/** Known importer relationship is useful for deduplication, never proof of a historic version. */
export function sourceRoot(sourceRef: string): string {
 if (sourceRef.startsWith('carta:cv:')) return 'carta:cv';
 if (sourceRef.startsWith('carta:handoff:')) return 'carta:handoff';
 return sourceRef;
}
export function provenanceSnapshot(fact: Pick<MemoryFactRow, 'fact_id' | 'source_ref'>) {
 const binding = factOrigin(fact.fact_id) ?? null;
 const rootRef = binding?.root_ref ?? sourceRoot(fact.source_ref);
 const db = getFolioDb();
 const source = (ref: string) => db.prepare('SELECT source_ref,status,content_hash,origin_document_id FROM memory_sources WHERE source_ref=?').get(ref) ?? null;
 return { binding, rootRef, root: source(rootRef), source: source(fact.source_ref) };
}

/** Import-time only. Existing facts are never rebound to the current file version. Not an independence attestation. */
export function bindFactOrigin(input: Omit<FactOrigin, 'recorded_at'>): void {
 const db = getFolioDb();
 db.transaction(() => {
  if (!/^[a-f0-9]{64}$/.test(input.content_hash) || !input.root_ref.trim() || !input.field_locator.trim() || !input.excerpt.trim() || input.excerpt.length > 16000) throw new Error('Ungültiger Dokumentbeleg.');
  const fact = db.prepare('SELECT * FROM memory_facts WHERE fact_id=?').get(input.fact_id) as MemoryFactRow | undefined;
  const root = db.prepare('SELECT content_hash,status FROM memory_sources WHERE source_ref=?').get(input.root_ref) as { content_hash: string; status: string } | undefined;
  if (!fact || !root || root.content_hash !== input.content_hash || ['rejected','tombstoned'].includes(root.status)) throw new Error('Dokumentversion nicht verfügbar.');
  if (sourceRoot(fact.source_ref) !== input.root_ref || fact.source_kind === 'memory-consolidation') throw new Error('Root-Zuordnung nicht belegt.');
  if (!normalizeClaim(input.excerpt).includes(normalizeClaim(fact.value_text))) throw new Error('Feldbeleg unterstützt Aussage nicht.');
  const existing = factOrigin(input.fact_id);
  if (existing) {
   if (Object.entries(input).every(([key, value]) => existing[key as keyof FactOrigin] === value)) return;
   throw new Error('Historischer Dokumentbeleg ist unveränderlich.');
  }
  db.prepare('INSERT INTO memory_fact_origins VALUES (?,?,?,?,?,?)').run(input.fact_id,input.root_ref,input.content_hash,input.field_locator,input.excerpt,new Date().toISOString());
 })();
}
