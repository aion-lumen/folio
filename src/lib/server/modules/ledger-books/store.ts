import { readFileSync, statSync } from 'node:fs';
import { getModuleDatabasePath } from '../index.js';

const MAX_BATCH_BYTES = 8 * 1024 * 1024;

type SourceCoverage = {
	role: string;
	source_id: string;
	row_count: number;
	booking_date_from: string | null;
	booking_date_to: string | null;
};

type ReviewEntry = {
	entry_id: string;
	booking_date: string;
	value_date: string | null;
	amount: string;
	currency: string;
	direction: 'debit' | 'credit' | 'zero';
	status: string | null;
	transaction_type: string | null;
	counterparty: string | null;
	purpose: string | null;
	counterparty_account_hint: string | null;
	references: string[];
	source_ids: string[];
};

export type BooksReviewBatch = {
	available: boolean;
	error: string | null;
	batch: null | {
		batch_id: string;
		generated_at: string;
		status: 'staged_unbooked';
		account: { label: string; owner_context: string | null };
		coverage: {
			sources: SourceCoverage[];
			booking_date_from: string | null;
			booking_date_to: string | null;
			row_count_before_deduplication: number;
			transaction_count: number;
			duplicate_count: number;
			uncovered_intervals: Array<{ from: string; to: string; days: number }>;
			coverage_status: 'gap_detected' | 'contiguous_exports';
		};
		totals: Array<{
			currency: string;
			debits: string;
			credits: string;
			net: string;
			debit_count: number;
			credit_count: number;
			zero_count: number;
		}>;
		entries: ReviewEntry[];
		bookkeeping: { accepted_count: number; ledger_db_touched: false; note: string };
	};
};

function object(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid object');
	return value as Record<string, unknown>;
}

function text(value: unknown, nullable = false): string | null {
	if (nullable && value === null) return null;
	if (typeof value !== 'string') throw new Error('invalid text');
	return value;
}

function number(value: unknown): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('invalid number');
	return value;
}

function sourceView(value: unknown): SourceCoverage {
	const source = object(value);
	return {
		role: text(source.role)!,
		source_id: text(source.source_id)!,
		row_count: number(source.row_count),
		booking_date_from: text(source.booking_date_from, true),
		booking_date_to: text(source.booking_date_to, true)
	};
}

function entryView(value: unknown): ReviewEntry {
	const entry = object(value);
	const sourceRows = Array.isArray(entry.source_rows) ? entry.source_rows.map(object) : [];
	const direction = text(entry.direction);
	if (direction !== 'debit' && direction !== 'credit' && direction !== 'zero') {
		throw new Error('invalid direction');
	}
	return {
		entry_id: text(entry.entry_id)!,
		booking_date: text(entry.booking_date)!,
		value_date: text(entry.value_date, true),
		amount: text(entry.amount)!,
		currency: text(entry.currency)!,
		direction,
		status: text(entry.status, true),
		transaction_type: text(entry.transaction_type, true),
		counterparty: text(entry.counterparty, true),
		purpose: text(entry.purpose, true),
		counterparty_account_hint: text(entry.counterparty_account_hint, true),
		references: Array.isArray(entry.references) ? entry.references.map((item) => text(item)!) : [],
		source_ids: sourceRows.map((item) => text(item.source_id)!)
	};
}

export function readBooksReviewBatch(): BooksReviewBatch {
	const path = getModuleDatabasePath('ledger-books', 'staging', 'batches.read');
	if (!path) return { available: false, error: 'Ledger Books ist deaktiviert.', batch: null };
	try {
		if (statSync(path).size > MAX_BATCH_BYTES) throw new Error('batch too large');
		const root = object(JSON.parse(readFileSync(path, 'utf8')));
		if (root.schema !== 'ledger/books-import-batch/v0' || root.status !== 'staged_unbooked') {
			throw new Error('unsupported batch');
		}
		const account = object(root.account);
		const coverage = object(root.coverage);
		const bookkeeping = object(root.bookkeeping);
		if (bookkeeping.ledger_db_touched !== false || number(bookkeeping.accepted_count) !== 0) {
			throw new Error('batch is no longer unbooked');
		}
		const gaps = Array.isArray(coverage.uncovered_intervals)
			? coverage.uncovered_intervals.map((value) => {
					const gap = object(value);
					return { from: text(gap.from)!, to: text(gap.to)!, days: number(gap.days) };
				})
			: [];
		const coverageStatus = text(coverage.coverage_status);
		if (coverageStatus !== 'gap_detected' && coverageStatus !== 'contiguous_exports') {
			throw new Error('invalid coverage status');
		}
		const totals = Array.isArray(root.totals)
			? root.totals.map((value) => {
					const total = object(value);
					return {
						currency: text(total.currency)!,
						debits: text(total.debits)!,
						credits: text(total.credits)!,
						net: text(total.net)!,
						debit_count: number(total.debit_count),
						credit_count: number(total.credit_count),
						zero_count: number(total.zero_count)
					};
				})
			: [];
		return {
			available: true,
			error: null,
			batch: {
				batch_id: text(root.batch_id)!,
				generated_at: text(root.generated_at)!,
				status: 'staged_unbooked',
				account: {
					label: text(account.label)!,
					owner_context: text(account.owner_context, true)
				},
				coverage: {
					sources: Array.isArray(coverage.sources) ? coverage.sources.map(sourceView) : [],
					booking_date_from: text(coverage.booking_date_from, true),
					booking_date_to: text(coverage.booking_date_to, true),
					row_count_before_deduplication: number(coverage.row_count_before_deduplication),
					transaction_count: number(coverage.transaction_count),
					duplicate_count: number(coverage.duplicate_count),
					uncovered_intervals: gaps,
					coverage_status: coverageStatus
				},
				totals,
				entries: Array.isArray(root.entries) ? root.entries.map(entryView) : [],
				bookkeeping: {
					accepted_count: 0,
					ledger_db_touched: false,
					note: text(bookkeeping.note)!
				}
			}
		};
	} catch (error) {
		const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT';
		return {
			available: false,
			error: missing
				? 'Noch kein Ledger-Prüfstapel vorhanden.'
				: 'Der lokale Ledger-Prüfstapel ist ungültig oder nicht sicher lesbar.',
			batch: null
		};
	}
}
