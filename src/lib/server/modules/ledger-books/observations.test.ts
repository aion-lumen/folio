import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { MemoryFactRow } from '../../memory/types.js';
import { buildFinanceObservationBatch, writeFinanceObservationExchange } from './observations.js';

const roots: string[] = [];

function fact(overrides: Partial<MemoryFactRow> = {}): MemoryFactRow {
	return {
		fact_id: 'fact_finance_1',
		proposal_id: 'proposal_finance_1',
		domain: 'finance',
		data_class: 'transaction',
		sensitivity: 'sensitive',
		subject: 'Valve Corporation',
		predicate: 'paid',
		value_text: '40.99 EUR',
		status: 'confirmed',
		source_kind: 'mail',
		source_ref: 'mail:yahoo:420401',
		source_excerpt: 'Sie haben 40,99 EUR bezahlt.',
		derived_from_external: 1,
		entity_ref: null,
		entity_type: 'merchant',
		entity_label: 'Valve Corporation',
		subject_entity_id: 'entity_valve',
		object_entity_id: null,
		valid_from: '2026-08-16',
		valid_to: null,
		supersedes_fact_id: null,
		recorded_at: '2026-08-17T08:00:00.000Z',
		confirmed_at: '2026-08-17T09:00:00.000Z',
		confirmed_by: 'owner',
		...overrides
	};
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('Ledger finance observation exchange', () => {
	it('builds stable, evidenced observations without booking state changes', () => {
		const first = buildFinanceObservationBatch([fact()], '2026-08-26T10:00:00.000Z');
		const second = buildFinanceObservationBatch([fact()], '2026-08-26T11:00:00.000Z');

		expect(first.observations[0]).toMatchObject({
			schema: 'ledger/finance-observation/v1',
			observation_type: 'transaction',
			effective_at: '2026-08-16',
			sensitivity: 'sensitive',
			subject: { kind: 'merchant', ref: 'entity_valve' },
			claims: [{ predicate: 'paid', value: '40.99 EUR', unit: null }],
			evidence: [{
				kind: 'mail',
				ref: 'mail:yahoo:420401',
				extractor: 'folio-confirmed-memory-v1',
				derived_from_external: true
			}]
		});
		expect(first.observations[0].observation_id).toBe(second.observations[0].observation_id);
		expect(first.batch_id).toBe(second.batch_id);
		expect(first.bookkeeping).toEqual({ accepted_count: 0, ledger_db_touched: false });
		expect(first.observations[0].evidence[0].sha256).toMatch(/^[a-f0-9]{64}$/);
	});

	it('writes one owner-only atomic batch for mail and file facts', () => {
		const root = mkdtempSync(join(tmpdir(), 'folio-ledger-observations-'));
		roots.push(root);
		const path = join(root, 'nested', 'finance-observations.json');
		const batch = writeFinanceObservationExchange(path, [
			fact(),
			fact({
				fact_id: 'fact_finance_2',
				data_class: 'deadline',
				predicate: 'due_on',
				value_text: '2026-09-30',
				source_kind: 'file',
				source_ref: 'document:tax-note',
				derived_from_external: 0
			})
		]);

		expect(batch.observations.map((item) => item.observation_type)).toEqual(['transaction', 'deadline']);
		expect(JSON.parse(readFileSync(path, 'utf8')).schema).toBe('ledger/finance-observation-batch/v1');
		expect(statSync(path).mode & 0o777).toBe(0o600);
	});
});
