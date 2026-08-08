import { randomUUID } from 'node:crypto';
import { getFolioDb } from '../folio-db/init.js';
import type {
	MemoryEventRow,
	MemoryFactRow,
	MemorySearchPolicy,
	MemorySensitivity,
	ProposeMemoryFactInput
} from './types.js';

const ID = /^[a-z][a-z0-9_-]{0,63}$/;
const SENSITIVITY_RANK: Record<MemorySensitivity, number> = {
	public: 0,
	private: 1,
	sensitive: 2
};

export class MemoryStoreError extends Error {}

function required(value: string, label: string): string {
	const normalized = value.trim();
	if (!normalized) throw new MemoryStoreError(`${label} must not be empty`);
	return normalized;
}

function assertId(value: string, label: string): string {
	if (!ID.test(value)) throw new MemoryStoreError(`invalid ${label}: ${value}`);
	return value;
}

function ftsQuery(query: string): string {
	const terms = query
		.trim()
		.split(/\s+/u)
		.map((term) => term.replaceAll('"', '""'))
		.filter(Boolean);
	if (!terms.length) throw new MemoryStoreError('search query must not be empty');
	return terms.map((term) => `"${term}"*`).join(' AND ');
}

function appendEvent(
	factId: string,
	eventType: MemoryEventRow['event_type'],
	actorKind: MemoryEventRow['actor_kind'],
	actorId: string,
	detail: Record<string, unknown> = {}
): void {
	getFolioDb()
		.prepare(
			`INSERT INTO memory_events
			 (event_id, fact_id, event_type, actor_kind, actor_id, detail_json, recorded_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`
		)
		.run(
			randomUUID(),
			factId,
			eventType,
			actorKind,
			required(actorId, 'actor_id'),
			JSON.stringify(detail),
			new Date().toISOString()
		);
}

function indexFact(fact: MemoryFactRow): void {
	const db = getFolioDb();
	db.prepare('DELETE FROM memory_facts_fts WHERE fact_id = ?').run(fact.fact_id);
	if (fact.status !== 'confirmed') return;
	db.prepare(
		`INSERT INTO memory_facts_fts
		 (fact_id, domain, subject, predicate, value_text, source_excerpt)
		 VALUES (?, ?, ?, ?, ?, ?)`
	).run(
		fact.fact_id,
		fact.domain,
		fact.subject,
		fact.predicate,
		fact.value_text,
		fact.source_excerpt ?? ''
	);
}

export function proposeMemoryFact(input: ProposeMemoryFactInput): MemoryFactRow {
	const factId = randomUUID();
	const recordedAt = new Date().toISOString();
	const db = getFolioDb();
	const tx = db.transaction(() => {
		db.prepare(
			`INSERT INTO memory_facts
			 (fact_id, domain, data_class, sensitivity, subject, predicate, value_text,
			  status, source_kind, source_ref, source_excerpt, derived_from_external,
			  valid_from, supersedes_fact_id, recorded_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, 'candidate', ?, ?, ?, ?, ?, ?, ?)`
		).run(
			factId,
			assertId(input.domain, 'domain'),
			assertId(input.data_class, 'data_class'),
			input.sensitivity,
			required(input.subject, 'subject'),
			required(input.predicate, 'predicate'),
			required(input.value, 'value'),
			required(input.source_kind, 'source_kind'),
			required(input.source_ref, 'source_ref'),
			input.source_excerpt?.trim() || null,
			input.derived_from_external ? 1 : 0,
			input.valid_from ?? null,
			input.supersedes_fact_id ?? null,
			recordedAt
		);
		appendEvent(factId, 'proposed', input.actor_kind ?? 'system', input.actor_id, {
			derived_from_external: input.derived_from_external === true
		});
	});
	tx();
	return getMemoryFact(factId);
}

export function confirmMemoryFactByHuman(factId: string, actorId: string): MemoryFactRow {
	const db = getFolioDb();
	const tx = db.transaction(() => {
		const fact = getMemoryFact(factId);
		if (fact.status !== 'candidate') {
			throw new MemoryStoreError(`only candidates can be confirmed: ${fact.status}`);
		}
		const now = new Date().toISOString();
		if (fact.supersedes_fact_id) {
			const previous = getMemoryFact(fact.supersedes_fact_id);
			if (previous.domain !== fact.domain) {
				throw new MemoryStoreError('a fact cannot supersede another domain');
			}
			if (previous.status === 'confirmed') {
				db.prepare(
					`UPDATE memory_facts SET status = 'superseded', valid_to = ? WHERE fact_id = ?`
				).run(now, previous.fact_id);
				indexFact({ ...previous, status: 'superseded', valid_to: now });
				appendEvent(previous.fact_id, 'superseded', 'human', actorId, { by: factId });
			}
		}
		db.prepare(
			`UPDATE memory_facts
			 SET status = 'confirmed', confirmed_at = ?, confirmed_by = ?
			 WHERE fact_id = ?`
		).run(now, required(actorId, 'actor_id'), factId);
		const confirmed = getMemoryFact(factId);
		indexFact(confirmed);
		appendEvent(factId, 'confirmed', 'human', actorId);
	});
	tx();
	return getMemoryFact(factId);
}

export function rejectMemoryCandidate(factId: string, actorId: string): MemoryFactRow {
	const db = getFolioDb();
	const tx = db.transaction(() => {
		const fact = getMemoryFact(factId);
		if (fact.status !== 'candidate') {
			throw new MemoryStoreError(`only candidates can be rejected: ${fact.status}`);
		}
		db.prepare("UPDATE memory_facts SET status = 'rejected' WHERE fact_id = ?").run(factId);
		appendEvent(factId, 'rejected', 'human', actorId);
	});
	tx();
	return getMemoryFact(factId);
}

export function tombstoneMemoryFact(factId: string, actorId: string): MemoryFactRow {
	const db = getFolioDb();
	const tx = db.transaction(() => {
		const fact = getMemoryFact(factId);
		if (fact.status === 'tombstoned') return;
		const now = new Date().toISOString();
		db.prepare(
			`UPDATE memory_facts SET
			 status = 'tombstoned', subject = '[deleted]', predicate = '[deleted]',
			 value_text = '', source_ref = '[deleted]', source_excerpt = NULL,
			 valid_to = ?, confirmed_by = NULL
			 WHERE fact_id = ?`
		).run(now, factId);
		indexFact({ ...fact, status: 'tombstoned' });
		appendEvent(factId, 'tombstoned', 'human', actorId);
	});
	tx();
	return getMemoryFact(factId);
}

export function getMemoryFact(factId: string): MemoryFactRow {
	const row = getFolioDb()
		.prepare('SELECT * FROM memory_facts WHERE fact_id = ?')
		.get(factId) as MemoryFactRow | undefined;
	if (!row) throw new MemoryStoreError(`unknown fact: ${factId}`);
	return row;
}

export function searchMemoryFacts(query: string, policy: MemorySearchPolicy): MemoryFactRow[] {
	assertId(policy.domain, 'domain');
	const limit = Math.max(1, Math.min(50, policy.limit ?? 10));
	return getFolioDb()
		.prepare(
			`SELECT f.*
			 FROM memory_facts_fts x
			 JOIN memory_facts f ON f.fact_id = x.fact_id
			 WHERE memory_facts_fts MATCH ?
			   AND f.domain = ?
			   AND f.status = 'confirmed'
			   AND CASE f.sensitivity
			         WHEN 'public' THEN 0 WHEN 'private' THEN 1 ELSE 2 END <= ?
			 ORDER BY bm25(memory_facts_fts), f.recorded_at DESC
			 LIMIT ?`
		)
		.all(ftsQuery(query), policy.domain, SENSITIVITY_RANK[policy.max_sensitivity], limit) as MemoryFactRow[];
}

export function rebuildMemoryFts(): number {
	const db = getFolioDb();
	const tx = db.transaction(() => {
		db.prepare('DELETE FROM memory_facts_fts').run();
		const facts = db
			.prepare("SELECT * FROM memory_facts WHERE status = 'confirmed'")
			.all() as MemoryFactRow[];
		for (const fact of facts) indexFact(fact);
		return facts.length;
	});
	return tx();
}

export function listMemoryEvents(factId: string): MemoryEventRow[] {
	return getFolioDb()
		.prepare('SELECT * FROM memory_events WHERE fact_id = ? ORDER BY recorded_at, rowid')
		.all(factId) as MemoryEventRow[];
}
