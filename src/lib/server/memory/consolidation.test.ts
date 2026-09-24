import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('memory night shift', () => {
	let dir = '';

	afterEach(async () => {
		const llm = await import('../agent/llm.js');
		llm.setLlmOverride(null);
		const init = await import('../folio-db/init.js');
		init.resetFolioDbForTests();
		if (dir) rmSync(dir, { recursive: true, force: true });
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	async function setup() {
		dir = join(process.cwd(), 'src/lib/server/folio-db/.test-tmp', randomUUID());
		mkdirSync(dir, { recursive: true });
		vi.stubEnv('FOLIO_DB_PATH', join(dir, 'folio.db'));
		vi.resetModules();
		const init = await import('../folio-db/init.js');
		init.resetFolioDbForTests();
		init.getFolioDb();
		return { memory: await import('./store.js'), consolidation: await import('./consolidation.js') };
	}

	it.each(['applied', 'rejected'] as const)('does not ask again for %s context evidence, but allows new evidence', async (decision) => {
		const { memory, consolidation } = await setup();
		const llm = await import('../agent/llm.js');
		const ids: string[] = [];
		const add = () => {
			const fact = memory.proposeMemoryFact({ domain: 'career', data_class: 'context', sensitivity: 'private', subject: `Field ${ids.length}`, predicate: 'has_context', value: `Evidence ${ids.length}`, source_kind: 'mail', source_ref: `mail:${ids.length}`, actor_id: 'test' });
			memory.confirmMemoryFactByHuman(fact.fact_id, 'owner'); ids.push(fact.fact_id);
		};
		add(); add();
		let title = 'First context';
		llm.setLlmOverride(async () => JSON.stringify({ schema: 'folio/memory-night-shift-semantic/v1', suggestions: [], contexts: [{ title, summary: `Combined ${title}`, fact_ids: ids }] }));
		const first = await consolidation.runMemoryNightShift();
		if (decision === 'applied') consolidation.applyMemoryConsolidationBundle(first.consolidation_run_id!, 'owner');
		else consolidation.rejectMemoryConsolidationBundle(first.consolidation_run_id!, 'owner');
		title = 'A paraphrase with another title';
		const replay = await consolidation.runMemoryNightShift();
		expect(replay.semantic_context_drafts).toHaveLength(0);
		expect(replay.suppressed_contexts?.[0].suppression_reason).toContain('bereits entschieden');
		expect(replay.consolidation_run_id).toBeNull();
		add();
		const fresh = await consolidation.runMemoryNightShift();
		expect(fresh.semantic_context_drafts).toHaveLength(1);
		expect(fresh.semantic_context_drafts[0].evidence?.origin_source_count).toBe(3);
	});

	it('filters legacy recursive contexts on display and submission without changing history', async () => {
		const { memory, consolidation } = await setup();
		const { getFolioDb } = await import('../folio-db/init.js');
		const db = getFolioDb();
		const ids: string[] = [];
		for (let i = 0; i < 3; i++) {
			const fact = memory.proposeMemoryFact({ domain: 'personal', data_class: 'context', sensitivity: 'private', subject: `Family ${i}`, predicate: 'has_context', value: i === 0 ? 'My younger child is called Mira.' : 'The younger child is named Mira.', source_kind: i ? 'memory-consolidation' : 'owner', source_ref: i ? `night-shift:${i}` : 'manual:family', actor_id: 'test' });
			memory.confirmMemoryFactByHuman(fact.fact_id, 'owner');
			if (i) db.prepare("INSERT INTO memory_events (event_id, fact_id, event_type, actor_kind, actor_id, detail_json, recorded_at) VALUES (?, ?, 'confirmed', 'human', 'owner', ?, ?)").run(randomUUID(), fact.fact_id, JSON.stringify({ source_fact_ids: [...ids] }), new Date().toISOString());
			ids.push(fact.fact_id);
		}
		const report = { ...consolidation.inspectMemoryNightShift(), rebuilt_index_entries: 0, consolidation_run_id: 'legacy', semantic_suggestions: [{ suggestion_id: 'recursive-hint', domain: 'personal', kind: 'relationship' as const, title: 'Child name again', reason: 'Same family', fact_ids: ids }], semantic_context_drafts: [{ context_id: 'family', domain: 'personal', title: 'Child name', summary: 'The younger child is named Mira.', fact_ids: ids }] };
		db.prepare("INSERT INTO memory_consolidation_runs (run_id,status,report_json,generated_at) VALUES ('legacy','candidate',?,?)").run(JSON.stringify(report), report.generated_at);
		const projected = consolidation.listMemoryConsolidationBundles()[0].report;
		expect(projected.semantic_context_drafts).toHaveLength(0);
		expect(projected.semantic_suggestions).toHaveLength(0);
		expect(projected.suppressed_contexts?.[0].evidence).toMatchObject({ origin_source_count: 1, derived_fact_count: 2, unresolved: false });
		expect(() => consolidation.applyMemoryConsolidationBundle('legacy', 'owner')).toThrow('Keine neuen Änderungen');
		expect(db.prepare("SELECT report_json FROM memory_consolidation_runs WHERE run_id = 'legacy'").get()).toEqual({ report_json: JSON.stringify(report) });
		expect(memory.listMemoryFacts({ status: 'confirmed' })).toHaveLength(3);
		const llm = await import('../agent/llm.js');
		llm.setLlmOverride(async (prompt) => {
			expect(prompt).toContain(ids[0]); expect(prompt).not.toContain(ids[1]); expect(prompt).not.toContain(ids[2]);
			return JSON.stringify({ schema: 'folio/memory-night-shift-semantic/v1', suggestions: [], contexts: [] });
		});
		await consolidation.runMemoryNightShift();
	});

	it('does not present an already confirmed statement or changed supporting facts as a new context', async () => {
		const { memory, consolidation } = await setup();
		const fact = memory.proposeMemoryFact({ domain: 'career', data_class: 'context', sensitivity: 'private', subject: 'Known', predicate: 'has_context', value: 'Known statement', source_kind: 'owner', source_ref: 'manual:known', actor_id: 'test' });
		memory.confirmMemoryFactByHuman(fact.fact_id, 'owner');
		const report = { ...consolidation.inspectMemoryNightShift(), rebuilt_index_entries: 0, semantic_context_drafts: [{ context_id: 'known', domain: 'career', title: 'Another title', summary: ' KNOWN   statement ', fact_ids: [fact.fact_id] }, { context_id: 'missing', domain: 'career', title: 'Missing', summary: 'Missing evidence', fact_ids: ['missing'] }] };
		const result = consolidation.refreshMemoryConsolidationReport(report);
		expect(result.semantic_context_drafts).toHaveLength(0);
		expect(result.suppressed_contexts?.map((draft) => draft.suppression_reason)).toEqual(['Die Aussage ist bereits als Fakt bestätigt.', 'Belegkette unvollständig oder inzwischen verändert.']);
	});

	it('reports exact duplicates but keeps distinct reconciliation references separate', async () => {
		const { memory, consolidation } = await setup();
		for (const [sourceRef, value] of [['mail:finance:1', 'ORDER-123456'], ['mail:finance:2', 'ORDER-123456']]) {
			const fact = memory.proposeMemoryFact({
				domain: 'finance', data_class: 'account_reference', sensitivity: 'sensitive',
				subject: 'Bestellnummer', predicate: 'identified_by', value,
				source_kind: 'mail', source_ref: sourceRef, actor_id: 'test'
			});
			memory.confirmMemoryFactByHuman(fact.fact_id, 'owner');
		}
		const transactionCode = memory.proposeMemoryFact({
			domain: 'finance', data_class: 'account_reference', sensitivity: 'sensitive',
			subject: 'Transaktionscode', predicate: 'identified_by', value: 'TX-987654',
			source_kind: 'mail', source_ref: 'mail:finance:1', actor_id: 'test'
		});
		memory.confirmMemoryFactByHuman(transactionCode.fact_id, 'owner');

		const report = consolidation.inspectMemoryNightShift();
		expect(report.duplicate_groups).toHaveLength(1);
		expect(report.duplicate_groups[0].fact_ids).toHaveLength(2);
		expect(report.duplicate_groups[0].label).toContain('ORDER-123456');
	});

	it('keeps different semantic subjects distinct when both facts belong to one person', async () => {
		const { memory, consolidation } = await setup();
		const identity = memory.proposeMemoryBundle({
			domain: 'career', source_kind: 'owner', source_ref: 'owner:identity', extractor_id: 'test', actor_id: 'test',
			entities: [{ local_ref: 'person', entity_type: 'person', canonical_key: 'career:person:owner', canonical_label: 'Owner', sensitivity: 'private' }]
		});
		memory.confirmMemoryProposalBundle(identity.proposal.proposal_id, 'owner');
		const person = memory.findConfirmedMemoryEntity('career', 'person', 'career:person:owner')!;
		for (const subject of ['Einführung in SAP BI', 'Integrierte Geschäftsprozesse mit SAP ERP']) {
			const fact = memory.proposeMemoryFact({
				domain: 'career', data_class: 'career_training', sensitivity: 'private', subject,
				predicate: 'completed_training', value: '180 Stunden, 6 ECTS', source_kind: 'file',
				source_ref: `file:${subject}`, subject_entity_id: person.entity_id, actor_id: 'test'
			});
			memory.confirmMemoryFactByHuman(fact.fact_id, 'owner');
		}

		expect(consolidation.inspectMemoryNightShift().duplicate_groups).toEqual([]);
	});

	it('persists one review bundle and consolidates exact duplicates only after approval', async () => {
		const { memory, consolidation } = await setup();
		for (const sourceRef of ['mail:finance:1', 'mail:finance:2']) {
			const fact = memory.proposeMemoryFact({
				domain: 'finance', data_class: 'account_reference', sensitivity: 'sensitive',
				subject: 'Bestellnummer', predicate: 'identified_by', value: 'ORDER-123456',
				source_kind: 'mail', source_ref: sourceRef, actor_id: 'test'
			});
			memory.confirmMemoryFactByHuman(fact.fact_id, 'owner');
		}

		const report = await consolidation.runMemoryNightShift({ semantic: false });
		expect(report.consolidation_run_id).toBeTruthy();
		expect(consolidation.listMemoryConsolidationBundles('candidate')).toHaveLength(1);
		expect(memory.listMemoryFacts({ status: 'confirmed' })).toHaveLength(2);
		const replay = await consolidation.runMemoryNightShift({ semantic: false });
		expect(replay.consolidation_run_id).toBe(report.consolidation_run_id);
		expect(consolidation.listMemoryConsolidationBundles('candidate')).toHaveLength(1);

		const result = consolidation.applyMemoryConsolidationBundle(report.consolidation_run_id!, 'owner');
		expect(result).toEqual({ superseded_facts: 1, created_contexts: 0, linked_facts: 0 });
		expect(memory.listMemoryFacts({ status: 'confirmed' })).toHaveLength(1);
		expect(memory.listMemoryFacts({ status: 'superseded' })).toHaveLength(1);
		expect(consolidation.listMemoryConsolidationBundles('candidate')).toHaveLength(0);
		expect(consolidation.listMemoryConsolidationBundles('applied')[0].applied_summary).toEqual(result);
		expect(() => consolidation.applyMemoryConsolidationBundle(report.consolidation_run_id!, 'owner')).toThrow(/bereits entschieden/u);
	});

	it('suggests a payment anchor without rewriting confirmed facts', async () => {
		const { memory, consolidation } = await setup();
		for (const row of [
			{ data_class: 'transaction', subject: 'Example Games', predicate: 'paid', value: '17,40 EUR', valid_from: '2026-08-16' },
			{ data_class: 'account_reference', subject: 'Bestellnummer', predicate: 'identified_by', value: 'ORDER-123456', valid_from: null }
		]) {
			const fact = memory.proposeMemoryFact({
				domain: 'finance', sensitivity: 'sensitive', source_kind: 'mail', source_ref: 'mail:finance:9',
				actor_id: 'test', ...row
			});
			memory.confirmMemoryFactByHuman(fact.fact_id, 'owner');
		}
		const report = await consolidation.runMemoryNightShift({ semantic: false });
		expect(report.anchor_candidates).toEqual([expect.objectContaining({ suggested_type: 'payment', label: 'Example Games' })]);
		expect(report.rebuilt_index_entries).toBe(2);
		expect(memory.listMemoryFacts({ status: 'confirmed' })).toHaveLength(2);
	});

	it('uses the local model only for bounded, fact-linked semantic drafts', async () => {
		const { memory, consolidation } = await setup();
		const llm = await import('../agent/llm.js');
		const first = memory.proposeMemoryFact({
			domain: 'career', data_class: 'context', sensitivity: 'private', subject: 'Bewerbung',
			predicate: 'has_context', value: 'Unterlagen eingereicht', source_kind: 'mail',
			source_ref: 'mail:career:1', actor_id: 'test'
		});
		const second = memory.proposeMemoryFact({
			domain: 'career', data_class: 'context', sensitivity: 'private', subject: 'Bewerbung',
			predicate: 'has_context', value: 'Prüfung läuft', source_kind: 'mail',
			source_ref: 'mail:career:2', actor_id: 'test'
		});
		memory.confirmMemoryFactByHuman(first.fact_id, 'owner');
		memory.confirmMemoryFactByHuman(second.fact_id, 'owner');
		llm.setLlmOverride(async () => JSON.stringify({
			schema: 'folio/memory-night-shift-semantic/v1',
			suggestions: [
				{ kind: 'relationship', title: 'Ein Bewerbungsverlauf', reason: 'Beide Fakten beschreiben denselben Verlauf.', fact_ids: [first.fact_id, second.fact_id] },
				{ kind: 'relationship', title: 'Wiederholung', reason: 'Dieselbe Verbindung noch einmal.', fact_ids: [second.fact_id, first.fact_id] }
			],
			contexts: [
				{ title: 'Bewerbungsstand', summary: 'Die Unterlagen sind eingereicht und werden geprüft.', fact_ids: [first.fact_id, second.fact_id] },
				{ title: 'Bewerbungsstand wiederholt', summary: 'Die Prüfung der eingereichten Unterlagen läuft.', fact_ids: [second.fact_id, first.fact_id] },
				{ title: 'Einzelfakt', summary: 'Die Unterlagen sind eingereicht.', fact_ids: [first.fact_id] }
			]
		}));
		const report = await consolidation.runMemoryNightShift();
		expect(report.semantic_status).toBe('completed');
		expect(report.consolidation_run_id).toBeTruthy();
		expect(report.semantic_suggestions[0].fact_ids).toEqual([first.fact_id, second.fact_id].sort());
		expect(report.semantic_suggestions).toHaveLength(1);
		expect(report.semantic_context_drafts[0]).toEqual(expect.objectContaining({ domain: 'career', title: 'Bewerbungsstand' }));
		expect(report.semantic_context_drafts).toHaveLength(1);
		const result = consolidation.applyMemoryConsolidationBundle(report.consolidation_run_id!, 'owner');
		expect(result).toEqual({ superseded_facts: 0, created_contexts: 1, linked_facts: 0 });
		expect(memory.listMemoryFacts({ status: 'confirmed' })).toContainEqual(expect.objectContaining({
			source_kind: 'memory-consolidation',
			subject: 'Bewerbungsstand',
			value_text: 'Die Unterlagen sind eingereicht und werden geprüft.',
			sensitivity: 'private'
		}));
	});

	it('turns stable entity metadata into a reviewable graph repair', async () => {
		const { memory, consolidation } = await setup();
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
			entity_ref: 'career:person:owner', entity_type: 'person', entity_label: 'Alex Beispiel',
			actor_kind: 'import', actor_id: 'career-seed'
		});
		memory.confirmMemoryFactByHuman(fact.fact_id, 'owner');

		const report = await consolidation.runMemoryNightShift({ semantic: false });
		expect(report.entity_link_candidates).toEqual([expect.objectContaining({
			entity_id: person.entity_id, fact_ids: [fact.fact_id], entity_label: 'Alex Beispiel'
		})]);
		expect(memory.getMemoryFact(fact.fact_id).subject_entity_id).toBeNull();
		const result = consolidation.applyMemoryConsolidationBundle(report.consolidation_run_id!, 'owner');
		expect(result).toEqual({ superseded_facts: 0, created_contexts: 0, linked_facts: 1 });
		expect(memory.getMemoryFact(fact.fact_id).subject_entity_id).toBe(person.entity_id);
	});
});
