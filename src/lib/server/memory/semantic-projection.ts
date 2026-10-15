import { createHash } from 'node:crypto';
import { getFolioDb } from '../folio-db/init.js';
import type { MemoryFactRow, MemorySensitivity } from './types.js';

export const SEMANTIC_TEXT_VERSION = 'folio-memory-fact-v1';
export const MAX_SEMANTIC_FACTS = 5000;
export const sensitivityRank: Record<MemorySensitivity, number> = { public: 0, private: 1, sensitive: 2 };
export interface ProjectedFact { fact: MemoryFactRow; text: string; hash: string }

/** Canonical, current facts only. Finance keeps its existing exact retrieval path. */
export function projectMemoryFacts(policy: { domain?: string; max_sensitivity: MemorySensitivity; as_of: string }): ProjectedFact[] {
	if (policy.domain === 'finance') return [];
	const db = getFolioDb();
	const rows = db.prepare(`SELECT f.*,
		(SELECT canonical_label FROM memory_entities e WHERE e.entity_id=f.subject_entity_id
		 AND e.domain=f.domain AND e.status='confirmed'
		 AND CASE e.sensitivity WHEN 'public' THEN 0 WHEN 'private' THEN 1 ELSE 2 END <= CASE f.sensitivity WHEN 'public' THEN 0 WHEN 'private' THEN 1 ELSE 2 END
		 AND (e.valid_from IS NULL OR e.valid_from<=@asof) AND (e.valid_to IS NULL OR e.valid_to>@asof)) AS subject_label,
		(SELECT canonical_label FROM memory_entities e WHERE e.entity_id=f.object_entity_id
		 AND e.domain=f.domain AND e.status='confirmed'
		 AND CASE e.sensitivity WHEN 'public' THEN 0 WHEN 'private' THEN 1 ELSE 2 END <= CASE f.sensitivity WHEN 'public' THEN 0 WHEN 'private' THEN 1 ELSE 2 END
		 AND (e.valid_from IS NULL OR e.valid_from<=@asof) AND (e.valid_to IS NULL OR e.valid_to>@asof)) AS object_label
		FROM memory_facts f WHERE f.status='confirmed' AND f.domain!='finance'
		 AND (@domain IS NULL OR f.domain=@domain)
		 AND CASE f.sensitivity WHEN 'public' THEN 0 WHEN 'private' THEN 1 ELSE 2 END <= @rank
		 AND (f.valid_from IS NULL OR f.valid_from<=@asof) AND (f.valid_to IS NULL OR f.valid_to>@asof)
		 ORDER BY f.fact_id LIMIT @limit`).all({ domain: policy.domain ?? null, asof: policy.as_of,
		 rank: sensitivityRank[policy.max_sensitivity], limit: MAX_SEMANTIC_FACTS + 1 }) as (MemoryFactRow & { subject_label: string | null; object_label: string | null })[];
	if (rows.length > MAX_SEMANTIC_FACTS) throw new Error('semantic corpus exceeds the configured bounded projection');
	return rows.map(({ subject_label, object_label, ...fact }) => {
		const text = [fact.subject, fact.predicate.replaceAll('_', ' '), fact.value_text, subject_label, object_label]
			.filter(Boolean).join(' — ').normalize('NFKC').replace(/\s+/g, ' ').trim();
		// Also invalidate on source, permission or lifecycle changes, not just wording.
		const { source_excerpt: _excerpt, ...identity } = fact;
		const hash = createHash('sha256').update(JSON.stringify([SEMANTIC_TEXT_VERSION, identity, text])).digest('hex');
		return { fact, text, hash };
	});
}
