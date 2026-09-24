import type { MemoryProposalBundle } from './types.js';

export type MemoryCaseSelector = 'human' | 'hermes';

export interface MemoryEvaluationCase {
	case_id: string;
	domain: string;
	cohort_id: string;
	source_ref: string;
	selection: {
		method: MemoryCaseSelector;
		selector_id: string;
		rationale: string;
	};
	expected: {
		entities: Array<{ entity_type: string; canonical_label: string }>;
		facts: Array<{ predicate: string; value: string }>;
		relations: Array<{ relation_type: string }>;
		episodes: Array<{ episode_type: string; occurred_at: string }>;
	};
}

export interface MemoryEvaluationSuite {
	schema: 'folio/memory-eval-suite/v1';
	suite_id: string;
	cases_per_domain: 3;
	cases: MemoryEvaluationCase[];
}

export interface MemorySelectionAssessment {
	domain: string;
	cohort_id: string;
	method: MemoryCaseSelector;
	assessed_by: 'human';
	similarity: 0 | 1 | 2;
	coverage: 0 | 1 | 2;
	leakage: 0 | 1 | 2;
	notes: string;
}

export interface MemoryExtractionScore {
	case_id: string;
	true_positive: number;
	false_positive: number;
	false_negative: number;
	precision: number;
	recall: number;
	f1: number;
}

const ID = /^[a-z][a-z0-9_-]{0,63}$/;

function normalized(value: string): string {
	return value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('de-CH');
}

function key(kind: string, ...values: string[]): string {
	return `${kind}:${values.map(normalized).join('|')}`;
}

export function validateMemoryEvaluationSuite(value: MemoryEvaluationSuite): MemoryEvaluationSuite {
	if (value.schema !== 'folio/memory-eval-suite/v1' || !ID.test(value.suite_id) || value.cases_per_domain !== 3) {
		throw new Error('invalid memory evaluation suite header');
	}
	const seen = new Set<string>();
	const cohorts = new Map<string, MemoryEvaluationCase[]>();
	for (const item of value.cases) {
		if (!ID.test(item.case_id) || !ID.test(item.domain) || !ID.test(item.cohort_id) || !item.source_ref.trim()) {
			throw new Error('invalid memory evaluation case');
		}
		if (seen.has(item.case_id)) throw new Error(`duplicate memory evaluation case: ${item.case_id}`);
		seen.add(item.case_id);
		if (!['human', 'hermes'].includes(item.selection.method) || !item.selection.selector_id.trim() || !item.selection.rationale.trim()) {
			throw new Error(`case ${item.case_id} lacks selection provenance`);
		}
		const cohortKey = `${item.domain}:${item.cohort_id}`;
		cohorts.set(cohortKey, [...(cohorts.get(cohortKey) ?? []), item]);
	}
	for (const [cohort, cases] of cohorts) {
		if (cases.length !== 3) throw new Error(`memory evaluation cohort ${cohort} must contain exactly 3 cases`);
		if (new Set(cases.map((item) => item.selection.method)).size !== 1) {
			throw new Error(`memory evaluation cohort ${cohort} mixes selection methods`);
		}
	}
	return value;
}

export function scoreMemoryExtraction(expectedCase: MemoryEvaluationCase, actual: MemoryProposalBundle): MemoryExtractionScore {
	const expected = new Set([
		...expectedCase.expected.entities.map((item) => key('entity', item.entity_type, item.canonical_label)),
		...expectedCase.expected.facts.map((item) => key('fact', item.predicate, item.value)),
		...expectedCase.expected.relations.map((item) => key('relation', item.relation_type)),
		...expectedCase.expected.episodes.map((item) => key('episode', item.episode_type, item.occurred_at))
	]);
	const observed = new Set([
		...actual.entities.map((item) => key('entity', item.entity_type, item.canonical_label)),
		...actual.facts.map((item) => key('fact', item.predicate, item.value_text)),
		...actual.relations.map((item) => key('relation', item.relation_type)),
		...actual.episodes.map((item) => key('episode', item.episode_type, item.occurred_at))
	]);
	const truePositive = [...observed].filter((item) => expected.has(item)).length;
	const falsePositive = observed.size - truePositive;
	const falseNegative = expected.size - truePositive;
	const precision = observed.size ? truePositive / observed.size : expected.size ? 0 : 1;
	const recall = expected.size ? truePositive / expected.size : observed.size ? 0 : 1;
	return {
		case_id: expectedCase.case_id,
		true_positive: truePositive,
		false_positive: falsePositive,
		false_negative: falseNegative,
		precision,
		recall,
		f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0
	};
}

export function summarizeSelectionAssessments(assessments: MemorySelectionAssessment[]) {
	const groups = new Map<MemoryCaseSelector, MemorySelectionAssessment[]>();
	for (const assessment of assessments) {
		groups.set(assessment.method, [...(groups.get(assessment.method) ?? []), assessment]);
	}
	return [...groups.entries()].map(([method, rows]) => ({
		method,
		cohorts: rows.length,
		similarity: rows.reduce((sum, row) => sum + row.similarity, 0) / rows.length,
		coverage: rows.reduce((sum, row) => sum + row.coverage, 0) / rows.length,
		leakage: rows.reduce((sum, row) => sum + row.leakage, 0) / rows.length
	}));
}
