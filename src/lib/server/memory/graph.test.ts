import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('memory graph projection', () => {
	let dir = '';

	afterEach(async () => {
		const init = await import('../folio-db/init.js');
		init.resetFolioDbForTests();
		if (dir) rmSync(dir, { recursive: true, force: true });
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	it('connects confirmed objects through explicit semantic and provenance evidence', async () => {
		dir = join(process.cwd(), 'src/lib/server/folio-db/.test-tmp', randomUUID());
		mkdirSync(dir, { recursive: true });
		vi.stubEnv('FOLIO_DB_PATH', join(dir, 'folio.db'));
		vi.resetModules();
		const init = await import('../folio-db/init.js');
		init.resetFolioDbForTests();
		init.getFolioDb();
		const memory = await import('./store.js');
		const graph = await import('./graph.js');
		const sources = await import('./sources.js');
		const bundle = memory.proposeMemoryBundle({
			domain: 'career', source_kind: 'mail', source_ref: 'mail:career:1', extractor_id: 'test', actor_id: 'test',
			entities: [
				{ local_ref: 'application', entity_type: 'application', canonical_key: 'application:1', canonical_label: 'KI-Serviceplattform', sensitivity: 'private' },
				{ local_ref: 'organization', entity_type: 'organization', canonical_key: 'organization:1', canonical_label: 'Kanton Zürich', sensitivity: 'private' }
			],
			facts: [{ data_class: 'application', sensitivity: 'private', subject: 'KI-Serviceplattform', predicate: 'has_application_status', value: 'submitted', subject_ref: 'application' }],
			relations: [{ relation_type: 'application_at', subject_ref: 'application', object_ref: 'organization', sensitivity: 'private' }],
			episodes: [{ episode_type: 'submitted', title: 'Bewerbung eingereicht', summary: 'Unterlagen eingereicht.', occurred_at: '2026-08-12', sensitivity: 'private', entity_refs: [{ ref: 'application', role: 'application' }] }]
		});
		memory.confirmMemoryProposalBundle(bundle.proposal.proposal_id, 'owner');
		const standalone = memory.proposeMemoryFact({
			domain: 'personal', data_class: 'context', sensitivity: 'private', subject: 'Eigenständig', predicate: 'has_context', value: 'Noch nicht verbunden', source_kind: 'owner', source_ref: 'manual:1', actor_id: 'owner'
		});
		memory.confirmMemoryFactByHuman(standalone.fact_id, 'owner');
		sources.upsertMemorySourceCandidate({
			source_kind: 'file', source_ref: 'file:career:1', title: 'Bewerbungsnotiz', relative_path: 'Documents/Bewerbung.md',
			primary_domain: 'career', secondary_domains: ['finance'], reviewed_by: 'owner'
		});

		const projection = graph.buildMemoryGraph();
		expect(projection.stats).toEqual({
			entities: 2, facts: 2, episodes: 1, relations: 1, connected_nodes: 11, isolated_nodes: 0,
			sources: 3, stored_sources: 1, derived_sources: 2, source_links: 4, evidence_links: 5, derived_links: 0
		});
		expect(projection.edges.filter((edge) => edge.kind === 'evidence')).toHaveLength(5);
		expect(projection.edges.filter((edge) => edge.kind === 'source_domain')).toHaveLength(4);
		expect(projection.edges.map((edge) => edge.kind)).toEqual(expect.arrayContaining(['episode', 'fact_subject', 'relation']));
		expect(projection.nodes.find((node) => node.id === standalone.fact_id)).toEqual(expect.objectContaining({ kind: 'fact', domain: 'personal' }));
		expect(projection.nodes.find((node) => node.kind === 'source' && node.source_ref === 'file:career:1')).toEqual(expect.objectContaining({ domains: ['career', 'finance'], type: 'source_candidate' }));
		expect(projection.nodes.find((node) => node.kind === 'source' && node.source_ref === 'manual:1')).toEqual(expect.objectContaining({ type: 'derived_evidence_source' }));
		expect(projection.edges.some((edge) => edge.kind === 'evidence' && edge.target === standalone.fact_id)).toBe(true);

		const context = memory.proposeMemoryFact({
			domain: 'personal', data_class: 'context', sensitivity: 'private', subject: 'Zusammenhang',
			predicate: 'has_context', value: 'Aus bestätigten Fakten abgeleitet', source_kind: 'memory-consolidation',
			source_ref: 'night-shift:test', actor_id: 'owner'
		});
		memory.confirmMemoryFactByHuman(context.fact_id, 'owner');
		init.getFolioDb().prepare(`INSERT INTO memory_events
			(event_id, fact_id, event_type, actor_kind, actor_id, detail_json, recorded_at)
			VALUES (?, ?, 'confirmed', 'human', 'owner', ?, ?)`
		).run(randomUUID(), context.fact_id, JSON.stringify({ source_fact_ids: [standalone.fact_id] }), new Date().toISOString());
		const withContext = graph.buildMemoryGraph();
		expect(withContext.stats.derived_links).toBe(1);
		expect(withContext.edges).toContainEqual(expect.objectContaining({ kind: 'derived_from', source: context.fact_id, target: standalone.fact_id }));
	});
});
