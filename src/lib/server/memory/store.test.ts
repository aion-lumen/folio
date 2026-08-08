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
			subject: 'Afschin', predicate: 'available_from', value: 'September',
			source_kind: 'owner', source_ref: 'manual:1', actor_kind: 'human', actor_id: 'owner'
		});
		memory.confirmMemoryFactByHuman(oldFact.fact_id, 'owner');
		const nextFact = memory.proposeMemoryFact({
			domain: 'career', data_class: 'availability', sensitivity: 'private',
			subject: 'Afschin', predicate: 'available_from', value: 'October',
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
});
