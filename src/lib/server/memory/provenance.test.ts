import { describe, expect, it } from 'vitest';
import { resolveMemoryEvidence } from './provenance.js';
import type { MemoryFactRow } from './types.js';

function fact(id: string, overrides: Partial<MemoryFactRow> = {}): MemoryFactRow {
	return { fact_id: id, domain: 'personal', status: 'confirmed', source_kind: 'mail', source_ref: `mail:${id}`, ...overrides } as MemoryFactRow;
}
const map = (...facts: MemoryFactRow[]) => new Map(facts.map((row) => [row.fact_id, row]));

describe('memory origin evidence', () => {
	it('counts two derivatives of one original as one source', () => {
		const result = resolveMemoryEvidence(['a', 'b', 'c'], 'personal', map(fact('a'), fact('b', { source_kind: 'memory-consolidation' }), fact('c', { source_kind: 'memory-consolidation' })), new Map([['b', ['a']], ['c', ['a', 'b']]]));
		expect(result).toEqual({ origin_fact_ids: ['a'], origin_source_count: 1, derived_fact_count: 2, unresolved: false, independence: 'not_established' });
	});
	it.each(['missing', 'cycle', 'cross-domain', 'unconfirmed'])('fails closed for %s provenance', (kind) => {
		const facts = map(fact('a', { source_kind: 'memory-consolidation' }), fact('b', kind === 'cross-domain' ? { domain: 'career' } : kind === 'unconfirmed' ? { status: 'candidate' } : {}));
		const parents = new Map(kind === 'missing' ? [] : [['a', [kind === 'cycle' ? 'a' : 'b']]]);
		expect(resolveMemoryEvidence(['a'], 'personal', facts, parents)).toMatchObject({ origin_source_count: 0, unresolved: true });
	});
	it('deduplicates a document hash across copies and legacy hash references', () => {
		const hash = 'a'.repeat(64);
		const result = resolveMemoryEvidence(['a', 'b', 'c'], 'personal', map(fact('a', { source_ref: `file:${hash}` }), fact('b', { source_ref: `file:sha256:${hash}` }), fact('c', { source_ref: 'file:copy' })), new Map(), new Map([['file:copy', hash]]));
		expect(result.origin_source_count).toBe(1);
	});
	it('does not claim that four different source refs are independent or human-confirmed', () => {
		const result = resolveMemoryEvidence(['a', 'b', 'c', 'd'], 'personal', map(...['a', 'b', 'c', 'd'].map((id) => fact(id))), new Map());
		expect(result).toMatchObject({ origin_source_count: 4, independence: 'not_established' });
	});
});
