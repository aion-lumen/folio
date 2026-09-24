import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { listMemoryFacts } from '../../memory/store.js';
import type { MemoryFactRow } from '../../memory/types.js';
import { getModuleDatabasePath } from '../index.js';

const MAX_EXCHANGE_BYTES = 4 * 1024 * 1024;
const EXPORTABLE_SOURCE_KINDS = new Set([
	'mail',
	'file',
	'campaign',
	'reorg',
	'orientation',
	'owner',
	'account_export',
	'account_api'
]);

type EvidenceKind = 'mail' | 'file' | 'account_export' | 'account_api' | 'owner';
type ObservationType = 'transaction' | 'balance' | 'claim' | 'liability' | 'account_state' | 'deadline' | 'document';

export type FinanceObservation = {
	schema: 'ledger/finance-observation/v1';
	observation_id: string;
	observation_type: ObservationType;
	effective_at: string;
	observed_at: string;
	sensitivity: 'private' | 'sensitive';
	subject: { kind: string; ref: string };
	claims: Array<{ predicate: string; value: string; unit: string | null }>;
	evidence: Array<{
		kind: EvidenceKind;
		ref: string;
		sha256: string;
		extractor: 'folio-confirmed-memory-v1';
		derived_from_external: boolean;
	}>;
};

export type FinanceObservationBatch = {
	schema: 'ledger/finance-observation-batch/v1';
	batch_id: string;
	generated_at: string;
	producer: 'folio-memory';
	status: 'staged_unbooked';
	observations: FinanceObservation[];
	bookkeeping: { accepted_count: 0; ledger_db_touched: false };
};

export type FinanceObservationExchangeStatus = {
	pathAvailable: boolean;
	batchId: string | null;
	eligibleFacts: number;
	stagedObservations: number;
	generatedAt: string | null;
	byType: Array<{ type: ObservationType; count: number }>;
	error: string | null;
};

function stable(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
	if (value && typeof value === 'object') {
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
			.join(',')}}`;
	}
	return JSON.stringify(value);
}

function sha256(value: unknown): string {
	return createHash('sha256').update(typeof value === 'string' ? value : stable(value)).digest('hex');
}

function evidenceKind(fact: MemoryFactRow): EvidenceKind {
	if (fact.source_kind === 'mail' || fact.source_ref.startsWith('mail:')) return 'mail';
	if (fact.source_kind === 'account_export') return 'account_export';
	if (fact.source_kind === 'account_api') return 'account_api';
	if (['file', 'campaign', 'reorg'].includes(fact.source_kind)) return 'file';
	return 'owner';
}

function observationType(fact: MemoryFactRow): ObservationType {
	const signal = `${fact.data_class} ${fact.predicate}`.toLocaleLowerCase('en');
	if (/transaction|payment|purchase|paid|zahlung|bezahlt/.test(signal)) return 'transaction';
	if (/balance|saldo|bestand/.test(signal)) return 'balance';
	if (/deadline|due|fällig|frist/.test(signal)) return 'deadline';
	if (/liability|payable|schuld|verbindlichkeit/.test(signal)) return 'liability';
	if (/account|konto|status/.test(signal)) return 'account_state';
	if (/document|invoice|receipt|beleg|rechnung/.test(signal)) return 'document';
	return 'claim';
}

function observationForFact(fact: MemoryFactRow, observedAt: string): FinanceObservation {
	const evidenceSnapshot = {
		fact_id: fact.fact_id,
		domain: fact.domain,
		data_class: fact.data_class,
		sensitivity: fact.sensitivity,
		subject: fact.subject,
		predicate: fact.predicate,
		value: fact.value_text,
		source_kind: fact.source_kind,
		source_ref: fact.source_ref,
		source_excerpt: fact.source_excerpt,
		derived_from_external: fact.derived_from_external,
		valid_from: fact.valid_from,
		confirmed_at: fact.confirmed_at
	};
	const identity = {
		fact_id: fact.fact_id,
		predicate: fact.predicate,
		value: fact.value_text,
		source_ref: fact.source_ref,
		valid_from: fact.valid_from
	};
	return {
		schema: 'ledger/finance-observation/v1',
		observation_id: `obs_${sha256(identity).slice(0, 24)}`,
		observation_type: observationType(fact),
		effective_at: fact.valid_from ?? fact.confirmed_at ?? fact.recorded_at,
		observed_at: observedAt,
		sensitivity: fact.sensitivity === 'sensitive' ? 'sensitive' : 'private',
		subject: {
			kind: fact.entity_type ?? fact.data_class,
			ref: fact.subject_entity_id ?? fact.entity_ref ?? `memory-subject:${sha256(fact.subject).slice(0, 24)}`
		},
		claims: [{ predicate: fact.predicate, value: fact.value_text, unit: null }],
		evidence: [{
			kind: evidenceKind(fact),
			ref: fact.source_ref,
			sha256: sha256(evidenceSnapshot),
			extractor: 'folio-confirmed-memory-v1',
			derived_from_external: fact.derived_from_external === 1
		}]
	};
}

export function eligibleFinanceFacts(): MemoryFactRow[] {
	return listMemoryFacts({ domain: 'finance', status: 'confirmed', limit: 500 })
		.filter((fact) => EXPORTABLE_SOURCE_KINDS.has(fact.source_kind))
		.sort((left, right) => left.fact_id.localeCompare(right.fact_id));
}

export function buildFinanceObservationBatch(
	facts: MemoryFactRow[],
	observedAt = new Date().toISOString()
): FinanceObservationBatch {
	const observations = facts.map((fact) => observationForFact(fact, observedAt));
	const batchId = `batch_${sha256(observations.map((item) => item.observation_id)).slice(0, 24)}`;
	return {
		schema: 'ledger/finance-observation-batch/v1',
		batch_id: batchId,
		generated_at: observedAt,
		producer: 'folio-memory',
		status: 'staged_unbooked',
		observations,
		bookkeeping: { accepted_count: 0, ledger_db_touched: false }
	};
}

function exchangePath(capability: 'observations.read' | 'observations.write'): string | null {
	return getModuleDatabasePath('ledger-books', 'observation-exchange', capability);
}

export function writeFinanceObservationExchange(
	pathOverride?: string,
	factsOverride?: MemoryFactRow[]
): FinanceObservationBatch {
	const path = pathOverride ?? exchangePath('observations.write');
	if (!path) throw new Error('Ledger-Beobachtungsaustausch ist deaktiviert.');
	const batch = buildFinanceObservationBatch(factsOverride ?? eligibleFinanceFacts());
	const serialized = `${JSON.stringify(batch, null, 2)}\n`;
	if (Buffer.byteLength(serialized) > MAX_EXCHANGE_BYTES) throw new Error('Der Ledger-Beobachtungsstapel ist zu gross.');
	mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
	const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
	try {
		writeFileSync(temp, serialized, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
		renameSync(temp, path);
	} catch (error) {
		try { unlinkSync(temp); } catch { /* already absent */ }
		throw error;
	}
	return batch;
}

function parseBatch(value: unknown): FinanceObservationBatch {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid batch');
	const batch = value as Partial<FinanceObservationBatch>;
	if (batch.schema !== 'ledger/finance-observation-batch/v1' || batch.status !== 'staged_unbooked') {
		throw new Error('unsupported batch');
	}
	if (batch.bookkeeping?.ledger_db_touched !== false || batch.bookkeeping.accepted_count !== 0) {
		throw new Error('batch is no longer unbooked');
	}
	if (!Array.isArray(batch.observations) || typeof batch.generated_at !== 'string') throw new Error('invalid observations');
	for (const item of batch.observations) {
		if (item.schema !== 'ledger/finance-observation/v1' || !/^obs_[a-f0-9]{24}$/.test(item.observation_id)) {
			throw new Error('invalid observation');
		}
	}
	return batch as FinanceObservationBatch;
}

export function getFinanceObservationExchangeStatus(): FinanceObservationExchangeStatus {
	const path = exchangePath('observations.read');
	const eligibleFacts = eligibleFinanceFacts().length;
	if (!path) return { pathAvailable: false, batchId: null, eligibleFacts, stagedObservations: 0, generatedAt: null, byType: [], error: 'Austausch ist deaktiviert.' };
	try {
		if (statSync(path).size > MAX_EXCHANGE_BYTES) throw new Error('batch too large');
		const batch = parseBatch(JSON.parse(readFileSync(path, 'utf8')));
		const counts = new Map<ObservationType, number>();
		for (const observation of batch.observations) counts.set(observation.observation_type, (counts.get(observation.observation_type) ?? 0) + 1);
		return {
			pathAvailable: true,
			batchId: batch.batch_id,
			eligibleFacts,
			stagedObservations: batch.observations.length,
			generatedAt: batch.generated_at,
			byType: [...counts].sort(([left], [right]) => left.localeCompare(right)).map(([type, count]) => ({ type, count })),
			error: null
		};
	} catch (error) {
		const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT';
		return {
			pathAvailable: true,
			batchId: null,
			eligibleFacts,
			stagedObservations: 0,
			generatedAt: null,
			byType: [],
			error: missing ? null : 'Der lokale Beobachtungsaustausch ist ungültig.'
		};
	}
}
