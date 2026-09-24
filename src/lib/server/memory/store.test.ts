import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Folio canonical memory baseline', () => {
	let dir = '';

	afterEach(async () => {
		const { resetFolioDbForTests } = await import('../folio-db/init.js');
		resetFolioDbForTests();
		if (dir) rmSync(dir, { recursive: true, force: true });
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	async function store() {
		dir = join(process.cwd(), 'src/lib/server/folio-db/.test-tmp', randomUUID());
		mkdirSync(dir, { recursive: true });
		vi.stubEnv('FOLIO_DB_PATH', join(dir, 'folio.db'));
		vi.resetModules();
		const init = await import('../folio-db/init.js');
		init.resetFolioDbForTests();
		return { db: init.getFolioDb(), memory: await import('./store.js') };
	}

	it('keeps external-derived facts candidate-only until a human confirms them', async () => {
		const { memory } = await store();
		const fact = memory.proposeMemoryFact({
			domain: 'career',
			data_class: 'contact_fact',
			sensitivity: 'private',
			subject: 'Recruiter',
			predicate: 'prefers',
			value: 'Tuesday calls',
			source_kind: 'mail',
			source_ref: 'mail:42',
			derived_from_external: true,
			actor_kind: 'import',
			actor_id: 'mail-worker'
		});
		expect(fact.status).toBe('candidate');
		expect(memory.searchMemoryFacts('Tuesday', { domain: 'career', max_sensitivity: 'sensitive' })).toEqual([]);

		memory.confirmMemoryFactByHuman(fact.fact_id, 'owner');
		expect(memory.searchMemoryFacts('Tuesday', { domain: 'career', max_sensitivity: 'private' })).toHaveLength(1);
		expect(memory.searchMemoryFacts('Tuesday', { domain: 'politics', max_sensitivity: 'sensitive' })).toEqual([]);
		expect(memory.searchMemoryFacts('Tuesday', { domain: 'career', max_sensitivity: 'public' })).toEqual([]);
		expect(memory.listMemoryEvents(fact.fact_id).map((event) => event.event_type)).toEqual([
			'proposed',
			'confirmed'
		]);
	});

	it('supersedes old truth and can rebuild the disposable FTS projection', async () => {
		const { db, memory } = await store();
		const oldFact = memory.proposeMemoryFact({
			domain: 'career', data_class: 'availability', sensitivity: 'private',
			subject: 'Alex', predicate: 'available_from', value: 'September',
			source_kind: 'owner', source_ref: 'manual:1', actor_kind: 'human', actor_id: 'owner'
		});
		memory.confirmMemoryFactByHuman(oldFact.fact_id, 'owner');
		const nextFact = memory.proposeMemoryFact({
			domain: 'career', data_class: 'availability', sensitivity: 'private',
			subject: 'Alex', predicate: 'available_from', value: 'October',
			source_kind: 'owner', source_ref: 'manual:2', supersedes_fact_id: oldFact.fact_id,
			actor_kind: 'human', actor_id: 'owner'
		});
		memory.confirmMemoryFactByHuman(nextFact.fact_id, 'owner');
		expect(memory.getMemoryFact(oldFact.fact_id).status).toBe('superseded');
		expect(memory.searchMemoryFacts('September', { domain: 'career', max_sensitivity: 'private' })).toEqual([]);
		db.prepare('DELETE FROM memory_facts_fts').run();
		expect(memory.rebuildMemoryFts()).toBe(1);
		expect(memory.searchMemoryFacts('October', { domain: 'career', max_sensitivity: 'private' })[0].fact_id).toBe(nextFact.fact_id);
	});

	it('tombstones content and enforces an append-only event journal', async () => {
		const { db, memory } = await store();
		const fact = memory.proposeMemoryFact({
			domain: 'career', data_class: 'contact_fact', sensitivity: 'sensitive',
			subject: 'Third party', predicate: 'email', value: 'person@example.invalid',
			source_kind: 'mail', source_ref: 'mail:99', source_excerpt: 'private excerpt',
			derived_from_external: true, actor_kind: 'import', actor_id: 'mail-worker'
		});
		memory.confirmMemoryFactByHuman(fact.fact_id, 'owner');
		const tombstone = memory.tombstoneMemoryFact(fact.fact_id, 'owner');
		expect(tombstone).toEqual(expect.objectContaining({
			status: 'tombstoned', subject: '[deleted]', value_text: '', source_ref: '[deleted]', source_excerpt: null
		}));
		expect(memory.searchMemoryFacts('person', { domain: 'career', max_sensitivity: 'sensitive' })).toEqual([]);
		expect(() => db.prepare('DELETE FROM memory_events WHERE fact_id = ?').run(fact.fact_id)).toThrow(/append-only/);
	});

	it('lists review work separately from confirmed domain memory', async () => {
		const { memory } = await store();
		const candidate = memory.proposeMemoryFact({
			domain: 'ai', data_class: 'product_fact', sensitivity: 'public',
			subject: 'Folio', predicate: 'has_product_fact', value: 'Folio is local-first.',
			source_kind: 'owner', source_ref: 'manual:1', actor_kind: 'human', actor_id: 'owner'
		});
		const confirmed = memory.proposeMemoryFact({
			domain: 'career', data_class: 'profile', sensitivity: 'private',
			subject: 'Alex', predicate: 'has_profile_fact', value: 'Works in enterprise data.',
			source_kind: 'owner', source_ref: 'manual:2', actor_kind: 'human', actor_id: 'owner'
		});
		memory.confirmMemoryFactByHuman(confirmed.fact_id, 'owner');

		expect(memory.listMemoryFacts({ status: 'candidate' }).map((fact) => fact.fact_id)).toEqual([candidate.fact_id]);
		expect(memory.listMemoryFacts({ domain: 'career', status: 'confirmed' }).map((fact) => fact.fact_id)).toEqual([confirmed.fact_id]);
		expect(memory.getMemoryOverview()).toEqual({
			total: 2,
			candidates: 1,
			confirmed: 1,
			domains: [
				{ domain: 'ai', facts: 0, candidates: 1 },
				{ domain: 'career', facts: 1, candidates: 0 }
			]
		});
	});

	it('confirms or rejects every candidate from one source as one atomic review decision', async () => {
		const { memory } = await store();
		for (const [index, dataClass] of ['transaction', 'account_reference'].entries()) {
			memory.proposeMemoryFact({
				domain: 'finance', data_class: dataClass, sensitivity: 'sensitive',
				subject: `Payment ${index}`, predicate: index === 0 ? 'paid' : 'identified_by',
				value: `Value ${index}`, source_kind: 'mail', source_ref: 'mail:finance:42',
				derived_from_external: true, actor_kind: 'import', actor_id: 'mail-worker'
			});
		}
		memory.proposeMemoryFact({
			domain: 'finance', data_class: 'transaction', sensitivity: 'sensitive',
			subject: 'Other payment', predicate: 'paid', value: 'Other value',
			source_kind: 'mail', source_ref: 'mail:finance:43', derived_from_external: true,
			actor_kind: 'import', actor_id: 'mail-worker'
		});

		const confirmed = memory.confirmMemoryCandidatesBySource('finance', 'mail:finance:42', 'owner');
		expect(confirmed).toHaveLength(2);
		expect(confirmed.every((fact) => fact.status === 'confirmed')).toBe(true);
		expect(memory.listMemoryFactsBySource('finance', 'mail:finance:43')[0].status).toBe('candidate');

		const rejected = memory.rejectMemoryCandidatesBySource('finance', 'mail:finance:43', 'owner');
		expect(rejected.map((fact) => fact.status)).toEqual(['rejected']);
	});

	it('promotes a connected proposal atomically and reuses canonical entities in later episodes', async () => {
		const { db, memory } = await store();
		const input = (sourceRef: string, status: string, occurredAt: string) => ({
			domain: 'career', source_kind: 'mail', source_ref: sourceRef,
			extractor_id: 'test', actor_kind: 'import' as const, actor_id: 'mail-extractor',
			entities: [
				{ local_ref: 'application', entity_type: 'application', canonical_key: 'application:stable', canonical_label: 'Platform Lead · Example Canton', sensitivity: 'private' as const },
				{ local_ref: 'organization', entity_type: 'organization', canonical_key: 'organization:example', canonical_label: 'Example Canton', sensitivity: 'private' as const }
			],
			facts: [{ data_class: 'application', sensitivity: 'private' as const, subject: 'Application', predicate: 'has_application_status', value: status, subject_ref: 'application', valid_from: occurredAt }],
			relations: [{ relation_type: 'application_at', subject_ref: 'application', object_ref: 'organization', sensitivity: 'private' as const }],
			episodes: [{ episode_type: 'application_status', title: status, summary: `Status ${status}`, occurred_at: occurredAt, sensitivity: 'private' as const, entity_refs: [{ ref: 'application', role: 'subject' }] }]
		});

		const first = memory.proposeMemoryBundle(input('mail:test:1', 'received', '2026-08-12'));
		memory.confirmMemoryProposalBundle(first.proposal.proposal_id, 'owner');
		const second = memory.proposeMemoryBundle(input('mail:test:2', 'interview', '2026-08-20'));
		const confirmedSecond = memory.confirmMemoryProposalBundle(second.proposal.proposal_id, 'owner');

		expect(confirmedSecond.entities.every((entity) => entity.status === 'merged')).toBe(true);
		expect(db.prepare("SELECT COUNT(*) AS n FROM memory_entities WHERE status = 'confirmed'").get()).toEqual({ n: 2 });
		expect(db.prepare("SELECT COUNT(*) AS n FROM memory_episodes WHERE status = 'confirmed'").get()).toEqual({ n: 2 });
		const applicationId = memory.getMemoryProposalBundle(first.proposal.proposal_id).entities.find((entity) => entity.entity_type === 'application')!.entity_id;
		expect(confirmedSecond.facts[0].subject_entity_id).toBe(applicationId);
		expect(memory.listConfirmedMemoryEpisodesForEntities('career', [applicationId], 'private')).toHaveLength(2);
		const dossiers = memory.listMemoryDossiers();
		expect(dossiers).toHaveLength(1);
		expect(dossiers[0].root_entity.entity_id).toBe(applicationId);
		expect(dossiers[0].entities.map((entity) => entity.entity_type).sort()).toEqual(['application', 'organization']);
		expect(dossiers[0].facts.map((fact) => fact.value_text)).toEqual(['received', 'interview']);
		expect(dossiers[0].episodes.map((episode) => episode.title)).toEqual(['received', 'interview']);
		expect(dossiers[0].source_refs.sort()).toEqual(['mail:test:1', 'mail:test:2']);
		expect(() => db.prepare('DELETE FROM memory_ledger').run()).toThrow(/append-only/);
	});

	it('confirms only separately reviewed context, never hidden historical appointments or mixed summaries', async () => {
		const { db, memory } = await store();
		const bundle = memory.proposeMemoryBundle({
			domain: 'property', source_kind: 'mail', source_ref: 'mail:test:historical', extractor_id: 'test', actor_id: 'test',
			facts: [
				{ data_class: 'appointment', sensitivity: 'private', subject: 'Contract', predicate: 'scheduled_for', value: '2026-04-24T12:00', valid_from: '2026-04-24' },
				{ data_class: 'context', sensitivity: 'private', subject: 'Contract', predicate: 'has_context', value: 'The notary requested documents at the time.' }
			],
			episodes: [{ episode_type: 'context', title: 'Old urgent mail', summary: 'Signing on 2026-04-24; notary requested documents.', occurred_at: '2026-04-17', sensitivity: 'private' }]
		});
		const now = new Date('2026-09-16T12:00:00Z');
		const reviewed = memory.confirmMemoryReviewProposalBundle(bundle.proposal.proposal_id, 'owner', now);
		expect(reviewed.facts.find(fact => fact.predicate === 'scheduled_for')).toMatchObject({ status: 'candidate', confirmed_at: null });
		expect(reviewed.facts.find(fact => fact.predicate === 'has_context')?.status).toBe('confirmed');
		expect(reviewed.episodes[0].status).toBe('candidate');
		expect(reviewed.proposal.status).toBe('candidate');
		expect(db.prepare("SELECT event_type FROM memory_ledger WHERE object_kind = 'proposal' AND proposal_id = ? ORDER BY rowid DESC LIMIT 1").get(bundle.proposal.proposal_id)).toEqual({ event_type: 'reviewed_current_scope' });
		expect(() => memory.confirmMemoryReviewProposalBundle(bundle.proposal.proposal_id, 'owner', now)).toThrow(/historische Termine/);
		expect(memory.getMemoryProposalBundle(bundle.proposal.proposal_id)).toEqual(reviewed);
	});

	it('attaches a legacy flat import to one confirmed entity without changing its source', async () => {
		const { db, memory } = await store();
		const proposal = memory.proposeMemoryBundle({
			domain: 'career', source_kind: 'carta-cv', source_ref: 'carta:identity:owner',
			extractor_id: 'career-evidence/v2', actor_kind: 'import', actor_id: 'career-seed',
			entities: [{
				local_ref: 'person', entity_type: 'person', canonical_key: 'career:person:owner',
				canonical_label: 'Alex Beispiel', sensitivity: 'private'
			}]
		});
		const confirmed = memory.confirmMemoryProposalBundle(proposal.proposal.proposal_id, 'owner');
		const person = confirmed.entities.find((entity) => entity.status === 'confirmed')!;
		const fact = memory.proposeMemoryFact({
			domain: 'career', data_class: 'career_education', sensitivity: 'private',
			subject: 'Alex Beispiel', predicate: 'holds_degree', value: 'B.Sc. Informatik',
			source_kind: 'carta-cv', source_ref: 'carta:cv:education:0',
			actor_kind: 'import', actor_id: 'career-seed'
		});
		memory.confirmMemoryFactByHuman(fact.fact_id, 'owner');

		expect(memory.linkConfirmedMemoryFactsToEntity(person.entity_id, [fact.fact_id], 'career-seed', 'import')).toBe(1);
		expect(memory.getMemoryFact(fact.fact_id)).toMatchObject({
			source_ref: 'carta:cv:education:0',
			subject_entity_id: person.entity_id,
			entity_ref: 'career:person:owner'
		});
		expect(memory.linkConfirmedMemoryFactsToEntity(person.entity_id, [fact.fact_id], 'career-seed', 'import')).toBe(0);
		expect(db.prepare("SELECT COUNT(*) AS n FROM memory_ledger WHERE object_id = ? AND event_type = 'linked'").get(fact.fact_id)).toEqual({ n: 1 });
	});
});
