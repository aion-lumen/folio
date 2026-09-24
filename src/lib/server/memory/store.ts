import { assertAuthorization } from '../mail-intake/state.js';
import { CORRECTION_KINDS } from '../../memory/correction.js';
import { isHistoricalAppointment, zurichToday } from '../../memory/temporal.js';
import { createHash, randomUUID } from 'node:crypto';
import { getFolioDb } from '../folio-db/init.js';
import type {
	MemoryEventRow,
	MemoryEntityRow,
	MemoryDossier,
	MemoryEpisodeRow,
	MemoryFactFilter,
	MemoryFactRow,
	MemoryOverview,
	MemoryProposalBundle,
	MemoryProposalRow,
	MemoryRelationRow,
	MemorySearchPolicy,
	MemorySensitivity,
	ProposeMemoryBundleInput,
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

function normalizeAlias(value: string): string {
	return value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('de-CH');
}

function addEntityAlias(entityId: string, alias: string, sourceKind: string, sourceRef: string): void {
	const value = required(alias, 'entity alias');
	getFolioDb().prepare(
		`INSERT OR IGNORE INTO memory_entity_aliases
		 (alias_id, entity_id, alias_text, normalized_alias, source_kind, source_ref, recorded_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`
	).run(randomUUID(), entityId, value, normalizeAlias(value), sourceKind, sourceRef, new Date().toISOString());
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

function appendLedger(
	proposalId: string | null,
	objectKind: 'proposal' | 'entity' | 'fact' | 'relation' | 'episode' | 'projection',
	objectId: string,
	eventType: string,
	actorKind: 'human' | 'system' | 'import',
	actorId: string,
	detail: Record<string, unknown> = {}
): void {
	getFolioDb().prepare(
		`INSERT INTO memory_ledger
		 (event_id, proposal_id, object_kind, object_id, event_type, actor_kind, actor_id, detail_json, recorded_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
	).run(randomUUID(), proposalId, objectKind, objectId, eventType, actorKind, required(actorId, 'actor_id'), JSON.stringify(detail), new Date().toISOString());
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

function indexMemoryObject(kind: 'entity' | 'relation' | 'episode', row: MemoryEntityRow | MemoryRelationRow | MemoryEpisodeRow): void {
	const db = getFolioDb();
	const objectId = kind === 'entity'
		? (row as MemoryEntityRow).entity_id
		: kind === 'relation'
			? (row as MemoryRelationRow).relation_id
			: (row as MemoryEpisodeRow).episode_id;
	db.prepare('DELETE FROM memory_objects_fts WHERE object_kind = ? AND object_id = ?').run(kind, objectId);
	if (row.status !== 'confirmed') return;
	const title = kind === 'entity'
		? (row as MemoryEntityRow).canonical_label
		: kind === 'relation'
			? (row as MemoryRelationRow).relation_type
			: (row as MemoryEpisodeRow).title;
	const body = kind === 'entity'
		? `${(row as MemoryEntityRow).entity_type} ${(row as MemoryEntityRow).canonical_key}`
		: kind === 'relation'
			? `${(row as MemoryRelationRow).subject_entity_id} ${(row as MemoryRelationRow).object_entity_id}`
			: (row as MemoryEpisodeRow).summary;
	db.prepare(
		`INSERT INTO memory_objects_fts (object_kind, object_id, domain, title, body)
		 VALUES (?, ?, ?, ?, ?)`
	).run(kind, objectId, row.domain, title, body);
}

export function proposeMemoryBundle(input: ProposeMemoryBundleInput): MemoryProposalBundle {
	const db = getFolioDb();
	const proposalId = randomUUID();
	const recordedAt = new Date().toISOString();
	const domain = assertId(input.domain, 'domain');
	const sourceKind = required(input.source_kind, 'source_kind');
	const sourceRef = required(input.source_ref, 'source_ref');
	const actorKind = input.actor_kind ?? 'system';
	const actorId = required(input.actor_id, 'actor_id');
	const refs = new Map<string, string>();
	for (const entity of input.entities ?? []) {
		const ref = assertId(entity.local_ref, 'entity local_ref');
		if (refs.has(ref)) throw new MemoryStoreError(`duplicate entity local_ref: ${ref}`);
		refs.set(ref, randomUUID());
	}
	const resolve = (ref: string | null | undefined): string | null => {
		if (!ref) return null;
		const id = refs.get(ref);
		if (!id) throw new MemoryStoreError(`unknown entity local_ref: ${ref}`);
		return id;
	};

	db.transaction(() => {
		db.prepare(
			`INSERT INTO memory_proposals
			 (proposal_id, domain, source_kind, source_ref, status, extractor_id, selection_method, created_at)
			 VALUES (?, ?, ?, ?, 'candidate', ?, ?, ?)`
		).run(proposalId, domain, sourceKind, sourceRef, required(input.extractor_id, 'extractor_id'), input.selection_method?.trim() || 'workflow', recordedAt);
		appendLedger(proposalId, 'proposal', proposalId, 'proposed', actorKind, actorId);

		for (const entity of input.entities ?? []) {
			const entityId = resolve(entity.local_ref)!;
			db.prepare(
				`INSERT INTO memory_entities
				 (entity_id, proposal_id, domain, entity_type, canonical_key, canonical_label,
				  sensitivity, status, source_kind, source_ref, source_excerpt,
				  derived_from_external, valid_from, recorded_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, 'candidate', ?, ?, ?, ?, ?, ?)`
			).run(
				entityId, proposalId, domain, assertId(entity.entity_type, 'entity_type'),
				required(entity.canonical_key, 'canonical_key'), required(entity.canonical_label, 'canonical_label'),
				entity.sensitivity, sourceKind, sourceRef, entity.source_excerpt?.trim() || null,
				entity.derived_from_external ? 1 : 0, entity.valid_from ?? null, recordedAt
			);
			appendLedger(proposalId, 'entity', entityId, 'proposed', actorKind, actorId);
		}

		for (const fact of input.facts ?? []) {
			const factId = randomUUID();
			const subjectEntityId = resolve(fact.subject_ref);
			const objectEntityId = resolve(fact.object_ref);
			db.prepare(
				`INSERT INTO memory_facts
				 (fact_id, proposal_id, domain, data_class, sensitivity, subject, predicate, value_text,
				  status, source_kind, source_ref, source_excerpt, derived_from_external,
				  subject_entity_id, object_entity_id, valid_from, recorded_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'candidate', ?, ?, ?, ?, ?, ?, ?, ?)`
			).run(
				factId, proposalId, domain, assertId(fact.data_class, 'data_class'), fact.sensitivity,
				required(fact.subject, 'subject'), required(fact.predicate, 'predicate'), required(fact.value, 'value'),
				sourceKind, sourceRef, fact.source_excerpt?.trim() || null,
				fact.derived_from_external ? 1 : 0, subjectEntityId, objectEntityId,
				fact.valid_from ?? null, recordedAt
			);
			appendEvent(factId, 'proposed', actorKind, actorId, { proposal_id: proposalId });
			appendLedger(proposalId, 'fact', factId, 'proposed', actorKind, actorId);
		}

		for (const relation of input.relations ?? []) {
			const relationId = randomUUID();
			db.prepare(
				`INSERT INTO memory_relations
				 (relation_id, proposal_id, domain, relation_type, subject_entity_id, object_entity_id,
				  sensitivity, status, source_kind, source_ref, source_excerpt,
				  derived_from_external, valid_from, recorded_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, 'candidate', ?, ?, ?, ?, ?, ?)`
			).run(
				relationId, proposalId, domain, assertId(relation.relation_type, 'relation_type'),
				resolve(relation.subject_ref), resolve(relation.object_ref), relation.sensitivity,
				sourceKind, sourceRef, relation.source_excerpt?.trim() || null,
				relation.derived_from_external ? 1 : 0, relation.valid_from ?? null, recordedAt
			);
			appendLedger(proposalId, 'relation', relationId, 'proposed', actorKind, actorId);
		}

		for (const episode of input.episodes ?? []) {
			const episodeId = randomUUID();
			db.prepare(
				`INSERT INTO memory_episodes
				 (episode_id, proposal_id, domain, episode_type, title, summary, occurred_at,
				  sensitivity, status, source_kind, source_ref, source_excerpt,
				  derived_from_external, recorded_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'candidate', ?, ?, ?, ?, ?)`
			).run(
				episodeId, proposalId, domain, assertId(episode.episode_type, 'episode_type'),
				required(episode.title, 'episode title'), required(episode.summary, 'episode summary'),
				required(episode.occurred_at, 'occurred_at'), episode.sensitivity,
				sourceKind, sourceRef, episode.source_excerpt?.trim() || null,
				episode.derived_from_external ? 1 : 0, recordedAt
			);
			for (const link of episode.entity_refs ?? []) {
				db.prepare(
					`INSERT INTO memory_episode_entities (episode_id, entity_id, role) VALUES (?, ?, ?)`
				).run(episodeId, resolve(link.ref), assertId(link.role, 'episode entity role'));
			}
			appendLedger(proposalId, 'episode', episodeId, 'proposed', actorKind, actorId);
		}
	})();
	return getMemoryProposalBundle(proposalId);
}

export function proposeMemoryFact(input: ProposeMemoryFactInput): MemoryFactRow {
	const factId = randomUUID();
	const recordedAt = new Date().toISOString();
	const db = getFolioDb();
	const tx = db.transaction(() => {
		db.prepare(
			`INSERT INTO memory_facts
			 (fact_id, proposal_id, domain, data_class, sensitivity, subject, predicate, value_text,
			  status, source_kind, source_ref, source_excerpt, derived_from_external,
			  entity_ref, entity_type, entity_label, subject_entity_id, object_entity_id,
			  valid_from, supersedes_fact_id, recorded_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'candidate', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		).run(
			factId,
			input.proposal_id?.trim() || null,
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
			input.entity_ref?.trim() || null,
			input.entity_type?.trim() || null,
			input.entity_label?.trim() || null,
			input.subject_entity_id?.trim() || null,
			input.object_entity_id?.trim() || null,
			input.valid_from ?? null,
			input.supersedes_fact_id ?? null,
			recordedAt
		);
		appendEvent(factId, 'proposed', input.actor_kind ?? 'system', input.actor_id, {
			derived_from_external: input.derived_from_external === true
		});
		appendLedger(input.proposal_id?.trim() || null, 'fact', factId, 'proposed', input.actor_kind ?? 'system', input.actor_id);
	});
	tx();
	return getMemoryFact(factId);
}

function confirmMemoryFactInTransaction(factId: string, actorId: string): MemoryFactRow {
	const db = getFolioDb();
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
	appendLedger(fact.proposal_id, 'fact', factId, 'confirmed', 'human', actorId);
	return confirmed;
}

export function confirmMemoryFactByHuman(factId: string, actorId: string): MemoryFactRow {
	const db = getFolioDb();
	return db.transaction(() => confirmMemoryFactInTransaction(factId, actorId))();
}

export function candidateCorrectionVersion(fact: MemoryFactRow): string | null {
	if (fact.status !== 'candidate' || fact.subject_entity_id || fact.object_entity_id
		|| !CORRECTION_KINDS.some((kind) => kind.predicate === fact.predicate)) return null;
	if (!fact.proposal_id) return memorySnapshotDigest(fact);
	const snapshot = getMemoryReviewSnapshot(fact.proposal_id);
	if (snapshot.bundle.proposal.status !== 'candidate' || snapshot.bundle.entities.length
		|| snapshot.bundle.relations.length || snapshot.episode_entities.length) return null;
	return memorySnapshotDigest(snapshot);
}

/** Append a replacement candidate. Never mutate content, lower trust, or confirm implicitly. */
export function correctMemoryCandidate(input: {
	fact_id: string; expected_version: string; predicate: string; value: string;
	valid_from: string | null; reason: string;
}, actorId: string): MemoryFactRow {
	const db = getFolioDb();
	return db.transaction(() => {
		const previous = getMemoryFact(input.fact_id);
		const version = candidateCorrectionVersion(previous);
		if (!version || version !== input.expected_version) throw new MemoryStoreError('Vorschlag verändert oder nicht einzeln korrigierbar. Bitte neu laden.');
		const kind = CORRECTION_KINDS.find((kind) => kind.predicate === input.predicate);
		const value = required(input.value, 'value');
		const reason = required(input.reason, 'reason');
		if (!kind || value.length > 8000 || reason.length > 1000) throw new MemoryStoreError('Ungültige Korrektur.');
		const date = input.valid_from;
		if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))
			|| new Date(date).toISOString().slice(0, 10) !== date)) throw new MemoryStoreError('Ungültiges Ereignisdatum.');
		if (['paid', 'scheduled_for'].includes(kind.predicate) && !date) throw new MemoryStoreError('Zahlung und Termin benötigen ein belegtes Ereignisdatum.');
		if (kind.predicate === previous.predicate && kind.dataClass === previous.data_class
			&& value === previous.value_text && date === previous.valid_from) throw new MemoryStoreError('Die Aussage ist unverändert.');
		const replacement = proposeMemoryFact({
			...previous, value, predicate: kind.predicate, data_class: kind.dataClass,
			valid_from: date, supersedes_fact_id: previous.fact_id,
			derived_from_external: previous.derived_from_external === 1,
			actor_kind: 'human', actor_id: actorId
		});
		db.prepare("UPDATE memory_facts SET status = 'superseded', valid_to = ? WHERE fact_id = ?").run(new Date().toISOString(), previous.fact_id);
		appendEvent(previous.fact_id, 'superseded', 'human', actorId, { by: replacement.fact_id, reason });
		appendLedger(previous.proposal_id, 'fact', previous.fact_id, 'corrected', 'human', actorId, { replacement: replacement.fact_id, reason });
		// Summaries can repeat the wrong assertion. Keep their text as history, never confirm it.
		if (previous.proposal_id) {
			const bundle = getMemoryProposalBundle(previous.proposal_id);
			for (const episode of bundle.episodes.filter((item) => item.status === 'candidate')) {
				db.prepare("UPDATE memory_episodes SET status = 'rejected' WHERE episode_id = ?").run(episode.episode_id);
				appendLedger(previous.proposal_id, 'episode', episode.episode_id, 'invalidated_by_correction', 'human', actorId, { fact_id: previous.fact_id, replacement: replacement.fact_id });
			}
		}
		return replacement;
	})();
}

export function confirmMemoryCandidatesBySource(
	domain: string,
	sourceRef: string,
	actorId: string,
	currentReviewOnly = false
): MemoryFactRow[] {
	const db = getFolioDb();
	return db.transaction(() => {
		const candidates = listMemoryFactsBySource(domain, sourceRef)
			.filter((fact) => fact.status === 'candidate' && (!currentReviewOnly || !isHistoricalAppointment(fact)));
		if (!candidates.length) throw new MemoryStoreError('no candidates remain for this source');
		return candidates.map((fact) => confirmMemoryFactInTransaction(fact.fact_id, actorId));
	})();
}

function rejectMemoryCandidateInTransaction(factId: string, actorId: string): MemoryFactRow {
	const db = getFolioDb();
	const fact = getMemoryFact(factId);
	if (fact.status !== 'candidate') {
		throw new MemoryStoreError(`only candidates can be rejected: ${fact.status}`);
	}
	db.prepare("UPDATE memory_facts SET status = 'rejected' WHERE fact_id = ?").run(factId);
	appendEvent(factId, 'rejected', 'human', actorId);
	appendLedger(fact.proposal_id, 'fact', factId, 'rejected', 'human', actorId);
	return getMemoryFact(factId);
}

export function rejectMemoryCandidatesBySource(
	domain: string,
	sourceRef: string,
	actorId: string
): MemoryFactRow[] {
	const db = getFolioDb();
	return db.transaction(() => {
		const candidates = listMemoryFactsBySource(domain, sourceRef)
			.filter((fact) => fact.status === 'candidate');
		if (!candidates.length) throw new MemoryStoreError('no candidates remain for this source');
		return candidates.map((fact) => rejectMemoryCandidateInTransaction(fact.fact_id, actorId));
	})();
}

export function rejectMemoryCandidate(factId: string, actorId: string): MemoryFactRow {
	const db = getFolioDb();
	return db.transaction(() => rejectMemoryCandidateInTransaction(factId, actorId))();
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
			 entity_ref = NULL, entity_type = NULL, entity_label = NULL,
			 valid_to = ?, confirmed_by = NULL
			 WHERE fact_id = ?`
		).run(now, factId);
		indexFact({ ...fact, status: 'tombstoned' });
		appendEvent(factId, 'tombstoned', 'human', actorId);
		appendLedger(fact.proposal_id, 'fact', factId, 'tombstoned', 'human', actorId);
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

export function findMemoryFactBySource(domain: string, sourceRef: string): MemoryFactRow | null {
	const row = getFolioDb()
		.prepare(
			`SELECT * FROM memory_facts
			 WHERE domain = ? AND source_ref = ? AND status != 'tombstoned'
			 ORDER BY recorded_at DESC LIMIT 1`
		)
		.get(assertId(domain, 'domain'), required(sourceRef, 'source_ref')) as MemoryFactRow | undefined;
	return row ?? null;
}

export function findConfirmedMemoryEntity(
	domain: string,
	entityType: string,
	canonicalKey: string
): MemoryEntityRow | null {
	const row = getFolioDb().prepare(
		`SELECT * FROM memory_entities
		 WHERE domain = ? AND entity_type = ? AND canonical_key = ? AND status = 'confirmed'
		 ORDER BY confirmed_at, rowid LIMIT 1`
	).get(
		assertId(domain, 'domain'),
		assertId(entityType, 'entity_type'),
		required(canonicalKey, 'canonical_key')
	) as MemoryEntityRow | undefined;
	return row ?? null;
}

/**
 * Repair a flat import without rewriting its fact text or provenance.
 * Only unambiguous, confirmed facts can be attached to one confirmed entity.
 */
export function linkConfirmedMemoryFactsToEntity(
	entityId: string,
	factIds: string[],
	actorId: string,
	actorKind: 'human' | 'system' | 'import' = 'human'
): number {
	const db = getFolioDb();
	const uniqueFactIds = [...new Set(factIds.map((id) => id.trim()).filter(Boolean))];
	if (!uniqueFactIds.length) return 0;
	const entity = db.prepare(
		"SELECT * FROM memory_entities WHERE entity_id = ? AND status = 'confirmed'"
	).get(required(entityId, 'entity_id')) as MemoryEntityRow | undefined;
	if (!entity) throw new MemoryStoreError('entity must be confirmed before facts can be linked');
	const placeholders = uniqueFactIds.map(() => '?').join(',');
	const facts = db.prepare(
		`SELECT * FROM memory_facts WHERE fact_id IN (${placeholders})`
	).all(...uniqueFactIds) as MemoryFactRow[];
	if (facts.length !== uniqueFactIds.length) throw new MemoryStoreError('unknown fact in entity link request');
	if (facts.some((fact) => fact.status !== 'confirmed' || fact.domain !== entity.domain)) {
		throw new MemoryStoreError('only confirmed facts from the entity domain can be linked');
	}
	if (facts.some((fact) => fact.subject_entity_id && fact.subject_entity_id !== entity.entity_id)) {
		throw new MemoryStoreError('fact is already linked to another subject entity');
	}

	return db.transaction(() => {
		let linked = 0;
		for (const fact of facts) {
			if (fact.subject_entity_id === entity.entity_id) continue;
			const changed = db.prepare(
				`UPDATE memory_facts
				 SET subject_entity_id = ?, entity_ref = ?, entity_type = ?, entity_label = ?
				 WHERE fact_id = ? AND status = 'confirmed' AND subject_entity_id IS NULL`
			).run(entity.entity_id, entity.canonical_key, entity.entity_type, entity.canonical_label, fact.fact_id);
			if (changed.changes !== 1) throw new MemoryStoreError('fact changed while its entity link was applied');
			appendLedger(fact.proposal_id, 'fact', fact.fact_id, 'linked', actorKind, actorId, {
				subject_entity_id: entity.entity_id,
				canonical_key: entity.canonical_key
			});
			linked += 1;
		}
		return linked;
	})();
}

export function listMemoryFactsBySource(domain: string, sourceRef: string): MemoryFactRow[] {
	return getFolioDb()
		.prepare(
			`SELECT * FROM memory_facts
			 WHERE domain = ? AND source_ref = ? AND status != 'tombstoned'
			 ORDER BY recorded_at, rowid`
		)
		.all(assertId(domain, 'domain'), required(sourceRef, 'source_ref')) as MemoryFactRow[];
}

export function getMemoryProposalBundle(proposalId: string): MemoryProposalBundle {
	const db = getFolioDb();
	const proposal = db.prepare('SELECT * FROM memory_proposals WHERE proposal_id = ?').get(proposalId) as MemoryProposalRow | undefined;
	if (!proposal) throw new MemoryStoreError(`unknown memory proposal: ${proposalId}`);
	return {
		proposal,
		entities: db.prepare('SELECT * FROM memory_entities WHERE proposal_id = ? ORDER BY recorded_at, rowid').all(proposalId) as MemoryEntityRow[],
		facts: db.prepare('SELECT * FROM memory_facts WHERE proposal_id = ? ORDER BY recorded_at, rowid').all(proposalId) as MemoryFactRow[],
		relations: db.prepare('SELECT * FROM memory_relations WHERE proposal_id = ? ORDER BY recorded_at, rowid').all(proposalId) as MemoryRelationRow[],
		episodes: db.prepare('SELECT * FROM memory_episodes WHERE proposal_id = ? ORDER BY occurred_at, rowid').all(proposalId) as MemoryEpisodeRow[]
	};
}

export function listMemoryProposalBundles(status: 'candidate' | 'confirmed' | 'rejected' = 'candidate', limit = 100): MemoryProposalBundle[] {
	const proposalIds = getFolioDb().prepare(
		`SELECT proposal_id FROM memory_proposals WHERE status = ? ORDER BY created_at DESC LIMIT ?`
	).all(status, Math.max(1, Math.min(500, limit))) as Array<{ proposal_id: string }>;
	return proposalIds.map((row) => getMemoryProposalBundle(row.proposal_id));
}

/**
 * Assemble canonical application dossiers across proposal/source boundaries.
 * Proposal bundles remain the review and provenance unit; dossiers are a
 * rebuildable read model over confirmed canonical objects.
 */
export function listMemoryDossiers(limit = 50): MemoryDossier[] {
	const db = getFolioDb();
	const roots = db.prepare(
		`SELECT * FROM memory_entities
		 WHERE entity_type = 'application' AND status = 'confirmed'
		 ORDER BY COALESCE(confirmed_at, recorded_at) DESC
		 LIMIT ?`
	).all(Math.max(1, Math.min(200, limit))) as MemoryEntityRow[];

	return roots.map((root) => {
		const relations = db.prepare(
			`SELECT * FROM memory_relations
			 WHERE domain = ? AND status = 'confirmed'
			   AND (subject_entity_id = ? OR object_entity_id = ?)
			 ORDER BY recorded_at, rowid`
		).all(root.domain, root.entity_id, root.entity_id) as MemoryRelationRow[];
		const entityIds = [...new Set([
			root.entity_id,
			...relations.flatMap((relation) => [relation.subject_entity_id, relation.object_entity_id])
		])];
		const placeholders = entityIds.map(() => '?').join(',');
		const entities = db.prepare(
			`SELECT * FROM memory_entities
			 WHERE status = 'confirmed' AND entity_id IN (${placeholders})
			 ORDER BY CASE WHEN entity_id = ? THEN 0 ELSE 1 END, recorded_at, rowid`
		).all(...entityIds, root.entity_id) as MemoryEntityRow[];
		const facts = db.prepare(
			`SELECT * FROM memory_facts
			 WHERE domain = ? AND status = 'confirmed'
			   AND (subject_entity_id IN (${placeholders}) OR object_entity_id IN (${placeholders}))
			 ORDER BY COALESCE(valid_from, recorded_at), rowid`
		).all(root.domain, ...entityIds, ...entityIds) as MemoryFactRow[];
		const episodes = db.prepare(
			`SELECT DISTINCT e.* FROM memory_episodes e
			 JOIN memory_episode_entities x ON x.episode_id = e.episode_id
			 WHERE e.domain = ? AND e.status = 'confirmed'
			   AND x.entity_id IN (${placeholders})
			 ORDER BY e.occurred_at, e.recorded_at, e.rowid`
		).all(root.domain, ...entityIds) as MemoryEpisodeRow[];
		const sourceRefs = [...new Set([
			root.source_ref,
			...entities.map((item) => item.source_ref),
			...facts.map((item) => item.source_ref),
			...relations.map((item) => item.source_ref),
			...episodes.map((item) => item.source_ref)
		])];
		return {
			root_entity: root,
			entities,
			facts,
			relations,
			episodes,
			source_refs: sourceRefs
		};
	});
}

export function findActiveMemoryProposalBySource(domain: string, sourceRef: string): MemoryProposalBundle | null {
	const row = getFolioDb().prepare(
		`SELECT proposal_id FROM memory_proposals
		 WHERE domain = ? AND source_ref = ? AND status IN ('candidate','confirmed')
		 ORDER BY created_at DESC LIMIT 1`
	).get(assertId(domain, 'domain'), required(sourceRef, 'source_ref')) as { proposal_id: string } | undefined;
	return row ? getMemoryProposalBundle(row.proposal_id) : null;
}

export function hasMemorySourceDomainConflict(domain: string, sourceRef: string): boolean {
	const db = getFolioDb();
	return Boolean(db.prepare(`SELECT 1 FROM memory_proposals WHERE source_ref = ? AND domain <> ? AND status IN ('candidate','confirmed') LIMIT 1`).get(sourceRef, domain)
		|| db.prepare(`SELECT 1 FROM memory_facts WHERE source_ref = ? AND domain <> ? AND status IN ('candidate','confirmed') LIMIT 1`).get(sourceRef, domain));
}

function confirmBundle(proposalId: string, actorId: string, actorKind: 'human' | 'system', detail: Record<string, unknown> = {}, reviewToday?: string): MemoryProposalBundle {
	const db = getFolioDb();
	db.transaction(() => {
		const bundle = getMemoryProposalBundle(proposalId);
		if (bundle.proposal.status !== 'candidate') {
			throw new MemoryStoreError(`only candidate proposals can be confirmed: ${bundle.proposal.status}`);
		}
		const historical = new Set(bundle.facts.filter(fact => fact.status === 'candidate' && reviewToday && isHistoricalAppointment(fact, reviewToday)).map(fact => fact.fact_id));
		const factsToConfirm = bundle.facts.filter(fact => fact.status === 'candidate' && !historical.has(fact.fact_id));
		if (historical.size && !factsToConfirm.length && !bundle.relations.some(item => item.status === 'candidate')) {
			throw new MemoryStoreError('Nur historische Termine verbleiben; keine aktuelle Bestätigung erforderlich.');
		}
		if (historical.size) detail = { ...detail, review_scope: 'current_only', as_of: reviewToday, historical_fact_ids: [...historical], summaries_not_confirmed: true };
		const now = new Date().toISOString();
		const reviewer = required(actorId, 'actor_id');
		for (const candidate of bundle.entities.filter(item => item.status === 'candidate')) {
			const canonical = db.prepare(
				`SELECT * FROM memory_entities
				 WHERE domain = ? AND entity_type = ? AND canonical_key = ? AND status = 'confirmed'
				 ORDER BY confirmed_at, rowid LIMIT 1`
			).get(candidate.domain, candidate.entity_type, candidate.canonical_key) as MemoryEntityRow | undefined;
			if (!canonical) {
				db.prepare("UPDATE memory_entities SET status = 'confirmed', confirmed_at = ?, confirmed_by = ? WHERE entity_id = ?").run(now, reviewer, candidate.entity_id);
				addEntityAlias(candidate.entity_id, candidate.canonical_label, candidate.source_kind, candidate.source_ref);
				continue;
			}
			db.prepare('UPDATE memory_facts SET subject_entity_id = ? WHERE proposal_id = ? AND subject_entity_id = ?').run(canonical.entity_id, proposalId, candidate.entity_id);
			db.prepare('UPDATE memory_facts SET object_entity_id = ? WHERE proposal_id = ? AND object_entity_id = ?').run(canonical.entity_id, proposalId, candidate.entity_id);
			db.prepare('UPDATE memory_relations SET subject_entity_id = ? WHERE proposal_id = ? AND subject_entity_id = ?').run(canonical.entity_id, proposalId, candidate.entity_id);
			db.prepare('UPDATE memory_relations SET object_entity_id = ? WHERE proposal_id = ? AND object_entity_id = ?').run(canonical.entity_id, proposalId, candidate.entity_id);
			for (const episode of bundle.episodes) {
				const links = db.prepare('SELECT role FROM memory_episode_entities WHERE episode_id = ? AND entity_id = ?').all(episode.episode_id, candidate.entity_id) as Array<{ role: string }>;
				for (const link of links) {
					db.prepare('INSERT OR IGNORE INTO memory_episode_entities (episode_id, entity_id, role) VALUES (?, ?, ?)').run(episode.episode_id, canonical.entity_id, link.role);
				}
				db.prepare('DELETE FROM memory_episode_entities WHERE episode_id = ? AND entity_id = ?').run(episode.episode_id, candidate.entity_id);
			}
			db.prepare("UPDATE memory_entities SET status = 'merged', merged_into_entity_id = ?, valid_to = ? WHERE entity_id = ?").run(canonical.entity_id, now, candidate.entity_id);
			addEntityAlias(canonical.entity_id, candidate.canonical_label, candidate.source_kind, candidate.source_ref);
			appendLedger(proposalId, 'entity', candidate.entity_id, 'merged', actorKind, reviewer, { ...detail, into: canonical.entity_id });
		}
		for (const fact of factsToConfirm) {
			db.prepare("UPDATE memory_facts SET status = 'confirmed', confirmed_at = ?, confirmed_by = ? WHERE fact_id = ? AND status = 'candidate'").run(now, actorId, fact.fact_id);
		}
		db.prepare("UPDATE memory_relations SET status = 'confirmed', confirmed_at = ?, confirmed_by = ? WHERE proposal_id = ? AND status = 'candidate'").run(now, actorId, proposalId);
		// A mixed summary can repeat the historical appointments. Do not approve it
		// invisibly when the owner is reviewing only the remaining context/facts.
		if (!historical.size) db.prepare("UPDATE memory_episodes SET status = 'confirmed', confirmed_at = ?, confirmed_by = ? WHERE proposal_id = ? AND status = 'candidate'").run(now, actorId, proposalId);
		db.prepare('UPDATE memory_proposals SET status = ?, reviewed_at = ?, reviewed_by = ? WHERE proposal_id = ?').run(historical.size ? 'candidate' : 'confirmed', now, actorId, proposalId);
		const confirmed = getMemoryProposalBundle(proposalId);
		for (const entity of confirmed.entities.filter((item) => item.status === 'confirmed' && bundle.entities.some(before => before.entity_id === item.entity_id && before.status === 'candidate'))) {
			indexMemoryObject('entity', entity);
			appendLedger(proposalId, 'entity', entity.entity_id, 'confirmed', actorKind, actorId, detail);
		}
		for (const fact of confirmed.facts.filter((item) => factsToConfirm.some(before => before.fact_id === item.fact_id))) {
			indexFact(fact);
			appendEvent(fact.fact_id, 'confirmed', actorKind, actorId, { ...detail, proposal_id: proposalId });
			appendLedger(proposalId, 'fact', fact.fact_id, 'confirmed', actorKind, actorId, detail);
		}
		for (const relation of confirmed.relations.filter((item) => item.status === 'confirmed' && bundle.relations.some(before => before.relation_id === item.relation_id && before.status === 'candidate'))) {
			indexMemoryObject('relation', relation);
			appendLedger(proposalId, 'relation', relation.relation_id, 'confirmed', actorKind, actorId, detail);
		}
		for (const episode of confirmed.episodes.filter((item) => item.status === 'confirmed' && bundle.episodes.some(before => before.episode_id === item.episode_id && before.status === 'candidate'))) {
			indexMemoryObject('episode', episode);
			appendLedger(proposalId, 'episode', episode.episode_id, 'confirmed', actorKind, actorId, detail);
		}
		appendLedger(proposalId, 'proposal', proposalId, historical.size ? 'reviewed_current_scope' : 'confirmed', actorKind, actorId, detail);
	})();
	return getMemoryProposalBundle(proposalId);
}

export function confirmMemoryProposalBundle(proposalId: string, actorId: string): MemoryProposalBundle {
	return confirmBundle(proposalId, actorId, 'human');
}

/** Human daily review excludes historical appointments even from stale forms. */
export function confirmMemoryReviewProposalBundle(proposalId: string, actorId: string, now = new Date()): MemoryProposalBundle {
	return confirmBundle(proposalId, actorId, 'human', {}, zurichToday(now));
}

export function memorySnapshotDigest(value: unknown): string {
	const stable = (item: unknown): unknown => Array.isArray(item) ? item.map(stable)
		: item && typeof item === 'object' ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => [key, stable(v)])) : item;
	return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

export interface MemoryDelegation {
	grant_id: string;
	proposal_id: string;
	authorized_by: string;
	authorization_ref: string;
	standing?: { id: string; run_id: string; feedback_id: number };
	bundle_digest: string;
	source_digest: string;
	review_model: string;
	extractor_id: string;
	expires_at: string;
	review_policy: string;
}

export const MEMORY_REVIEW_POLICY = 'mail-memory-evidence-v1';
export const ATTACHMENT_MEMORY_REVIEW_POLICY = 'attachment-memory-evidence-v1';

export function getMemoryReviewSnapshot(proposalId: string) {
	const bundle = getMemoryProposalBundle(proposalId);
	const episode_entities = getFolioDb().prepare(`SELECT link.episode_id, link.entity_id, link.role
		FROM memory_episode_entities AS link JOIN memory_episodes AS episode ON episode.episode_id = link.episode_id
		WHERE episode.proposal_id = ? ORDER BY link.episode_id, link.entity_id, link.role`).all(proposalId) as Array<{ episode_id: string; entity_id: string; role: string }>;
	return { bundle, episode_entities };
}

function assertDelegatable(bundle: MemoryProposalBundle, policy = MEMORY_REVIEW_POLICY): void {
	const attachment = policy === ATTACHMENT_MEMORY_REVIEW_POLICY;
	if (![MEMORY_REVIEW_POLICY,ATTACHMENT_MEMORY_REVIEW_POLICY].includes(policy)) throw new MemoryStoreError('Unknown review policy.');
	const kind = attachment ? 'attachment' : 'mail';
	const objects = [...bundle.facts, ...bundle.entities, ...bundle.relations, ...bundle.episodes];
	if (attachment && (!/^attachment:sha256:[a-f0-9]{64}$/.test(bundle.proposal.source_ref) || !bundle.proposal.extractor_id.startsWith('memory-attachment-extractor-v1:')
		|| bundle.entities.length || bundle.relations.length || bundle.episodes.length || bundle.facts.length>5 || bundle.facts.some(f=>f.predicate==='paid'))) throw new MemoryStoreError('Attachment review requires a bounded document-only proposal.');
	if (bundle.proposal.source_kind !== kind || bundle.proposal.status !== 'candidate' || !objects.length
		|| objects.some((item) => item.status !== 'candidate' || item.domain !== bundle.proposal.domain
			|| item.source_ref !== bundle.proposal.source_ref || item.source_kind !== kind
			|| ('supersedes_fact_id' in item && item.supersedes_fact_id)
			|| ('supersedes_relation_id' in item && item.supersedes_relation_id))) {
		throw new MemoryStoreError('Only intact, unreviewed mail bundles can be delegated.');
	}
}

// Only an authenticated owner action may call this; the grant is not a model tool.
export function authorizeMemoryDelegation(proposalId: string, ownerId: string, authorizationRef: string, sourceDigest: string, reviewModel: string, standing?: MemoryDelegation['standing']): MemoryDelegation {
	return authorizeDelegation(proposalId,ownerId,authorizationRef,sourceDigest,reviewModel,MEMORY_REVIEW_POLICY,standing);
}
/** Explicit document selection only; mail standing grants never broaden to attachments. */
export function authorizeAttachmentMemoryDelegation(proposalId:string,ownerId:string,authorizationRef:string,sourceDigest:string,reviewModel:string):MemoryDelegation {
	return authorizeDelegation(proposalId,ownerId,authorizationRef,sourceDigest,reviewModel,ATTACHMENT_MEMORY_REVIEW_POLICY);
}
function authorizeDelegation(proposalId: string, ownerId: string, authorizationRef: string, sourceDigest: string, reviewModel: string, policy:string, standing?: MemoryDelegation['standing']): MemoryDelegation {
	const bundle = getMemoryProposalBundle(proposalId);
	assertDelegatable(bundle,policy);
	if(policy===ATTACHMENT_MEMORY_REVIEW_POLICY&&bundle.proposal.extractor_id===`memory-attachment-extractor-v1:${reviewModel}`)throw new MemoryStoreError('Reviewer must differ from extraction model.');
	if (!/^[a-f0-9]{64}$/.test(sourceDigest)) throw new MemoryStoreError('Invalid source digest.');
	if (standing) assertAuthorization(standing.id, standing.run_id, standing.feedback_id, ownerId);
	const grant: MemoryDelegation = {
		...(standing ? { standing } : {}),
		grant_id: randomUUID(), proposal_id: proposalId, authorized_by: required(ownerId, 'owner'),
		authorization_ref: required(authorizationRef, 'authorization_ref'),
		bundle_digest: memorySnapshotDigest(getMemoryReviewSnapshot(proposalId)), source_digest: sourceDigest,
		review_model: required(reviewModel, 'review_model'), extractor_id: bundle.proposal.extractor_id,
		review_policy: policy,
		expires_at: new Date(Date.now() + 60 * 60_000).toISOString()
	};
	appendLedger(proposalId, 'proposal', proposalId, 'delegation_authorized', standing ? 'system' : 'human', standing ? 'mail-intake' : grant.authorized_by, { ...grant });
	return grant;
}

export function getMemoryDelegation(grantId: string): MemoryDelegation {
	const row = getFolioDb().prepare(`SELECT detail_json FROM memory_ledger WHERE event_type = 'delegation_authorized'
		AND (actor_kind = 'human' OR (actor_kind = 'system' AND actor_id = 'mail-intake')) AND json_extract(detail_json, '$.grant_id') = ?`).get(grantId) as { detail_json: string } | undefined;
	if (!row) throw new MemoryStoreError('Delegation not found.');
	return JSON.parse(row.detail_json) as MemoryDelegation;
}

export function getMemoryDelegationResult(grantId: string): Record<string, unknown> | null {
	const row = getFolioDb().prepare(`SELECT detail_json FROM memory_ledger WHERE event_type = 'delegated_reviewed'
		AND json_extract(detail_json, '$.grant_id') = ?`).get(grantId) as { detail_json: string } | undefined;
	return row ? JSON.parse(row.detail_json) : null;
}

export function revokeMemoryDelegation(grantId: string, ownerId: string): void {
	const grant = getMemoryDelegation(grantId);
	if (getMemoryDelegationResult(grantId)) throw new MemoryStoreError('Review already completed; use the normal memory correction workflow.');
	appendLedger(grant.proposal_id, 'proposal', grant.proposal_id, 'delegation_revoked', 'human', required(ownerId, 'owner'), { grant_id: grantId });
}

export function isMemoryDelegationRevoked(grantId: string): boolean {
	return Boolean(getFolioDb().prepare(`SELECT 1 FROM memory_ledger WHERE event_type = 'delegation_revoked'
		AND json_extract(detail_json, '$.grant_id') = ? LIMIT 1`).get(grantId));
}

export function finishDelegatedMemoryReview(grantId: string, sourceDigest: string, model: string, verdict: 'accept' | 'reject', reasonCodes: string[], diagnostic?: {stage:'source_quote_check'|'semantic_review';checked_object_ids:string[];unsupported_object_ids:string[]}): Record<string, unknown> {
	return getFolioDb().transaction(() => {
		const previous = getMemoryDelegationResult(grantId);
		if (previous) return previous;
		const grant = getMemoryDelegation(grantId);
		if (grant.standing) assertAuthorization(grant.standing.id, grant.standing.run_id, grant.standing.feedback_id, grant.authorized_by);
		const bundle = getMemoryProposalBundle(grant.proposal_id);
		assertDelegatable(bundle,grant.review_policy);
		if ((grant.review_policy===ATTACHMENT_MEMORY_REVIEW_POLICY&&(grant.standing||!diagnostic)) || isMemoryDelegationRevoked(grantId) || Date.parse(grant.expires_at) <= Date.now() || sourceDigest !== grant.source_digest
			|| memorySnapshotDigest(getMemoryReviewSnapshot(grant.proposal_id)) !== grant.bundle_digest || model !== grant.review_model) {
			throw new MemoryStoreError('Delegation expired or evidence, proposal or reviewer changed.');
		}
		if (!['accept', 'reject'].includes(verdict) || !reasonCodes.length
			|| (verdict === 'accept' && (reasonCodes.length !== 1 || reasonCodes[0] !== 'fully_supported'))) {
			throw new MemoryStoreError('Invalid delegated verdict.');
		}
		if(diagnostic){
			const ids=[...bundle.facts.map(x=>x.fact_id),...bundle.entities.map(x=>x.entity_id),...bundle.relations.map(x=>x.relation_id),...bundle.episodes.map(x=>x.episode_id)];
			if(!['source_quote_check','semantic_review'].includes(diagnostic.stage)||diagnostic.checked_object_ids.length!==ids.length||new Set(diagnostic.checked_object_ids).size!==ids.length||!ids.every(id=>diagnostic.checked_object_ids.includes(id))||diagnostic.unsupported_object_ids.some(id=>!ids.includes(id))||(verdict==='accept'&&diagnostic.unsupported_object_ids.length))throw new MemoryStoreError('Invalid review diagnostic.');
		}
		const detail = { ...grant, review_kind: 'delegated_local_model', verdict, reason_codes: reasonCodes, ...(diagnostic?{diagnostic}:{}) };
		const actor = `local-memory-reviewer:${model}`;
		appendLedger(grant.proposal_id, 'proposal', grant.proposal_id, 'delegated_reviewed', 'system', actor, detail);
		if (verdict === 'accept') confirmBundle(grant.proposal_id, actor, 'system', detail);
		return detail;
	})();
}

export function listDelegatedMemoryReviews(limit = 30): Array<{ proposal_id: string; recorded_at: string; detail: Record<string, unknown> }> {
	const rows = getFolioDb().prepare(`SELECT proposal_id, recorded_at, detail_json FROM memory_ledger AS latest
		WHERE event_type = 'delegated_reviewed' AND rowid = (
			SELECT rowid FROM memory_ledger WHERE event_type = 'delegated_reviewed' AND proposal_id = latest.proposal_id
			ORDER BY recorded_at DESC, rowid DESC LIMIT 1
		) ORDER BY recorded_at DESC, rowid DESC LIMIT ?`).all(Math.min(100, Math.max(1, limit))) as Array<{ proposal_id: string; recorded_at: string; detail_json: string }>;
	return rows.map(({ detail_json, ...row }) => ({ ...row, detail: JSON.parse(detail_json) }));
}

export function rejectMemoryProposalBundle(proposalId: string, actorId: string): MemoryProposalBundle {
	const db = getFolioDb();
	db.transaction(() => {
		const bundle = getMemoryProposalBundle(proposalId);
		if (bundle.proposal.status !== 'candidate') {
			throw new MemoryStoreError(`only candidate proposals can be rejected: ${bundle.proposal.status}`);
		}
		const now = new Date().toISOString();
		for (const table of ['memory_entities', 'memory_facts', 'memory_relations', 'memory_episodes']) {
			db.prepare(`UPDATE ${table} SET status = 'rejected' WHERE proposal_id = ? AND status = 'candidate'`).run(proposalId);
		}
		db.prepare("UPDATE memory_proposals SET status = 'rejected', reviewed_at = ?, reviewed_by = ? WHERE proposal_id = ?").run(now, required(actorId, 'actor_id'), proposalId);
		for (const fact of bundle.facts.filter((item) => item.status === 'candidate')) appendEvent(fact.fact_id, 'rejected', 'human', actorId, { proposal_id: proposalId });
		appendLedger(proposalId, 'proposal', proposalId, 'rejected', 'human', actorId);
	})();
	return getMemoryProposalBundle(proposalId);
}

export function listConfirmedMemoryEntities(domain: string, maxSensitivity: MemorySensitivity, limit = 100): MemoryEntityRow[] {
	return getFolioDb().prepare(
		`SELECT * FROM memory_entities
		 WHERE domain = ? AND status = 'confirmed'
		   AND CASE sensitivity WHEN 'public' THEN 0 WHEN 'private' THEN 1 ELSE 2 END <= ?
		 ORDER BY recorded_at DESC LIMIT ?`
	).all(assertId(domain, 'domain'), SENSITIVITY_RANK[maxSensitivity], Math.max(1, Math.min(500, limit))) as MemoryEntityRow[];
}

export function listConfirmedMemoryEntitiesByIds(
	domain: string,
	entityIds: string[],
	maxSensitivity: MemorySensitivity
): MemoryEntityRow[] {
	if (!entityIds.length) return [];
	const placeholders = entityIds.map(() => '?').join(',');
	return getFolioDb().prepare(
		`SELECT * FROM memory_entities
		 WHERE domain = ? AND status = 'confirmed'
		   AND CASE sensitivity WHEN 'public' THEN 0 WHEN 'private' THEN 1 ELSE 2 END <= ?
		   AND entity_id IN (${placeholders})`
	).all(assertId(domain, 'domain'), SENSITIVITY_RANK[maxSensitivity], ...entityIds) as MemoryEntityRow[];
}

export function listConfirmedMemoryRelationsForEntities(
	domain: string,
	entityIds: string[],
	maxSensitivity: MemorySensitivity,
	limit = 100
): MemoryRelationRow[] {
	if (!entityIds.length) return [];
	const placeholders = entityIds.map(() => '?').join(',');
	return getFolioDb().prepare(
		`SELECT * FROM memory_relations
		 WHERE domain = ? AND status = 'confirmed'
		   AND CASE sensitivity WHEN 'public' THEN 0 WHEN 'private' THEN 1 ELSE 2 END <= ?
		   AND (subject_entity_id IN (${placeholders}) OR object_entity_id IN (${placeholders}))
		 ORDER BY recorded_at DESC LIMIT ?`
	).all(
		assertId(domain, 'domain'), SENSITIVITY_RANK[maxSensitivity],
		...entityIds, ...entityIds, Math.max(1, Math.min(500, limit))
	) as MemoryRelationRow[];
}

export function listConfirmedMemoryEpisodesForEntities(
	domain: string,
	entityIds: string[],
	maxSensitivity: MemorySensitivity,
	limit = 50
): MemoryEpisodeRow[] {
	if (!entityIds.length) return [];
	const placeholders = entityIds.map(() => '?').join(',');
	return getFolioDb().prepare(
		`SELECT DISTINCT e.* FROM memory_episodes e
		 JOIN memory_episode_entities x ON x.episode_id = e.episode_id
		 WHERE e.domain = ? AND e.status = 'confirmed'
		   AND CASE e.sensitivity WHEN 'public' THEN 0 WHEN 'private' THEN 1 ELSE 2 END <= ?
		   AND x.entity_id IN (${placeholders})
		 ORDER BY e.occurred_at DESC LIMIT ?`
	).all(
		assertId(domain, 'domain'), SENSITIVITY_RANK[maxSensitivity],
		...entityIds, Math.max(1, Math.min(200, limit))
	) as MemoryEpisodeRow[];
}

export function listConfirmedMemoryFactsByEntity(
	domain: string,
	entityId: string,
	maxSensitivity: MemorySensitivity,
	limit = 20
): MemoryFactRow[] {
	const boundedLimit = Math.max(1, Math.min(50, limit));
	return getFolioDb()
		.prepare(
			`SELECT * FROM memory_facts
			 WHERE domain = ? AND (subject_entity_id = ? OR object_entity_id = ?) AND status = 'confirmed'
			   AND CASE sensitivity WHEN 'public' THEN 0 WHEN 'private' THEN 1 ELSE 2 END <= ?
			 ORDER BY recorded_at DESC
			 LIMIT ?`
		)
		.all(
			assertId(domain, 'domain'),
			required(entityId, 'entity_id'),
			entityId,
			SENSITIVITY_RANK[maxSensitivity],
			boundedLimit
		) as MemoryFactRow[];
}

export function searchMemoryEntities(query: string, policy: MemorySearchPolicy): MemoryEntityRow[] {
	assertId(policy.domain, 'domain');
	const limit = Math.max(1, Math.min(50, policy.limit ?? 10));
	return getFolioDb().prepare(
		`SELECT e.* FROM memory_objects_fts x
		 JOIN memory_entities e ON e.entity_id = x.object_id
		 WHERE memory_objects_fts MATCH ? AND x.object_kind = 'entity'
		   AND e.domain = ? AND e.status = 'confirmed'
		   AND CASE e.sensitivity WHEN 'public' THEN 0 WHEN 'private' THEN 1 ELSE 2 END <= ?
		 ORDER BY bm25(memory_objects_fts), e.recorded_at DESC LIMIT ?`
	).all(ftsQuery(query), policy.domain, SENSITIVITY_RANK[policy.max_sensitivity], limit) as MemoryEntityRow[];
}

export function listMemoryFacts(filter: MemoryFactFilter = {}): MemoryFactRow[] {
	const limit = Math.max(1, Math.min(5_000, filter.limit ?? 200));
	const clauses: string[] = ["status != 'tombstoned'"];
	const params: Array<string | number> = [];
	if (filter.domain) {
		clauses.push('domain = ?');
		params.push(assertId(filter.domain, 'domain'));
	}
	if (filter.status) {
		clauses.push('status = ?');
		params.push(filter.status);
	}
	params.push(limit);
	return getFolioDb()
		.prepare(
			`SELECT * FROM memory_facts
			 WHERE ${clauses.join(' AND ')}
			 ORDER BY CASE status WHEN 'candidate' THEN 0 WHEN 'confirmed' THEN 1 ELSE 2 END,
			          recorded_at DESC
			 LIMIT ?`
		)
		.all(...params) as MemoryFactRow[];
}

export function getMemoryOverview(): MemoryOverview {
	const db = getFolioDb();
	const totals = db.prepare(
		`SELECT
		   COUNT(*) AS total,
		   SUM(CASE WHEN status = 'candidate' THEN 1 ELSE 0 END) AS candidates,
		   SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed
		 FROM memory_facts
		 WHERE status != 'tombstoned'`
	).get() as { total: number; candidates: number | null; confirmed: number | null };
	const domains = db.prepare(
		`SELECT domain,
		        SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS facts,
		        SUM(CASE WHEN status = 'candidate' THEN 1 ELSE 0 END) AS candidates
		 FROM memory_facts
		 WHERE status != 'tombstoned'
		 GROUP BY domain
		 ORDER BY domain`
	).all() as Array<{ domain: string; facts: number; candidates: number }>;
	return {
		total: totals.total,
		candidates: totals.candidates ?? 0,
		confirmed: totals.confirmed ?? 0,
		domains
	};
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
		db.prepare('DELETE FROM memory_objects_fts').run();
		const facts = db
			.prepare("SELECT * FROM memory_facts WHERE status = 'confirmed'")
			.all() as MemoryFactRow[];
		for (const fact of facts) indexFact(fact);
		const entities = db.prepare("SELECT * FROM memory_entities WHERE status = 'confirmed'").all() as MemoryEntityRow[];
		const relations = db.prepare("SELECT * FROM memory_relations WHERE status = 'confirmed'").all() as MemoryRelationRow[];
		const episodes = db.prepare("SELECT * FROM memory_episodes WHERE status = 'confirmed'").all() as MemoryEpisodeRow[];
		for (const entity of entities) indexMemoryObject('entity', entity);
		for (const relation of relations) indexMemoryObject('relation', relation);
		for (const episode of episodes) indexMemoryObject('episode', episode);
		appendLedger(null, 'projection', 'memory-fts', 'rebuilt', 'system', 'memory-store', {
			facts: facts.length, entities: entities.length, relations: relations.length, episodes: episodes.length
		});
		return facts.length + entities.length + relations.length + episodes.length;
	});
	return tx();
}

export function listMemoryEvents(factId: string): MemoryEventRow[] {
	return getFolioDb()
		.prepare('SELECT * FROM memory_events WHERE fact_id = ? ORDER BY recorded_at, rowid')
		.all(factId) as MemoryEventRow[];
}
