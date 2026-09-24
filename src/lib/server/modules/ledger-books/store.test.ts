import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readBooksReviewBatch } from './store.js';

describe('Ledger Books review store', () => {
	let path: string;
	let previousPath: string | undefined;

	beforeEach(() => {
		path = join(tmpdir(), `folio-ledger-books-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
		previousPath = process.env.LEDGER_BOOKS_STAGING_PATH;
		process.env.LEDGER_BOOKS_STAGING_PATH = path;
	});

	afterEach(() => {
		if (previousPath === undefined) delete process.env.LEDGER_BOOKS_STAGING_PATH;
		else process.env.LEDGER_BOOKS_STAGING_PATH = previousPath;
		rmSync(path, { force: true });
	});

	it('exposes only the masked, unbooked review projection', () => {
		writeFileSync(
			path,
			JSON.stringify({
				schema: 'ledger/books-import-batch/v0',
				batch_id: 'batch_test',
				generated_at: '2026-08-26T10:00:00Z',
				status: 'staged_unbooked',
				account: { label: 'DKB Girokonto', owner_context: 'Testkonto', account_key_hash: 'secret-account-hash' },
				coverage: {
					sources: [{ role: 'current', source_id: 'source_current', row_count: 1, booking_date_from: '2026-08-01', booking_date_to: '2026-08-01', source_path: '/private/source.csv' }],
					booking_date_from: '2026-08-01',
					booking_date_to: '2026-08-01',
					row_count_before_deduplication: 1,
					transaction_count: 1,
					duplicate_count: 0,
					uncovered_intervals: [],
					coverage_status: 'contiguous_exports'
				},
				totals: [{ currency: 'EUR', debits: '-12.50', credits: '0.00', net: '-12.50', debit_count: 1, credit_count: 0, zero_count: 0 }],
				entries: [{
					entry_id: 'entry_test', booking_date: '2026-08-01', value_date: '2026-08-01', amount: '-12.50', currency: 'EUR', direction: 'debit', status: 'Gebucht', transaction_type: 'Kartenzahlung', counterparty: 'Beispiel', purpose: 'Test', counterparty_account_hash: 'secret-counterparty-hash', counterparty_account_hint: '••1234', references: ['reference'], source_rows: [{ source_id: 'source_current', row_number: 2 }]
				}],
				bookkeeping: { accepted_count: 0, ledger_db_touched: false, note: 'Noch nicht gebucht.' }
			}),
			{ mode: 0o600 }
		);

		const review = readBooksReviewBatch();
		expect(review.available).toBe(true);
		expect(review.batch?.entries[0]).toEqual(expect.objectContaining({ counterparty_account_hint: '••1234' }));
		const serialized = JSON.stringify(review);
		expect(serialized).not.toContain('secret-account-hash');
		expect(serialized).not.toContain('secret-counterparty-hash');
		expect(serialized).not.toContain('/private/source.csv');
	});

	it('fails closed once a batch is no longer unbooked', () => {
		writeFileSync(path, JSON.stringify({ schema: 'ledger/books-import-batch/v0', status: 'accepted' }));
		const review = readBooksReviewBatch();
		expect(review.available).toBe(false);
		expect(review.batch).toBeNull();
	});
});
