import { describe, expect, it } from 'vitest';
import { scoreMemoryExtraction, summarizeSelectionAssessments, validateMemoryEvaluationSuite } from './evaluation.js';

describe('memory evaluation cohorts', () => {
	const base = {
		domain: 'career', cohort_id: 'application_acknowledgements',
		selection: { method: 'hermes' as const, selector_id: 'hermes-chat', rationale: 'Three comparable acknowledgements.' },
		expected: { entities: [], facts: [], relations: [], episodes: [] }
	};

	it('requires exactly three similarly grouped cases with selection provenance', () => {
		expect(validateMemoryEvaluationSuite({
			schema: 'folio/memory-eval-suite/v1', suite_id: 'memory_v1', cases_per_domain: 3,
			cases: [1, 2, 3].map((index) => ({ ...base, case_id: `case_${index}`, source_ref: `mail:test:${index}` }))
		}).cases).toHaveLength(3);
		expect(() => validateMemoryEvaluationSuite({
			schema: 'folio/memory-eval-suite/v1', suite_id: 'memory_v1', cases_per_domain: 3,
			cases: [1, 2].map((index) => ({ ...base, case_id: `case_${index}`, source_ref: `mail:test:${index}` }))
		})).toThrow(/exactly 3/);
	});

	it('scores extraction separately from the quality of Hermes case selection', () => {
		const score = scoreMemoryExtraction({
			...base, case_id: 'case_1', source_ref: 'mail:test:1',
			expected: {
				entities: [{ entity_type: 'organization', canonical_label: 'Example Canton' }],
				facts: [{ predicate: 'has_application_status', value: 'under_review' }],
				relations: [], episodes: []
			}
		}, {
			proposal: {} as never,
			entities: [{ entity_type: 'organization', canonical_label: 'Example Canton' } as never],
			facts: [{ predicate: 'has_application_status', value_text: 'under_review' } as never],
			relations: [], episodes: []
		});
		expect(score).toEqual(expect.objectContaining({ precision: 1, recall: 1, f1: 1 }));
		expect(summarizeSelectionAssessments([{ domain: 'career', cohort_id: 'application_acknowledgements', method: 'hermes', assessed_by: 'human', similarity: 2, coverage: 1, leakage: 2, notes: 'Comparable.' }])).toEqual([
			{ method: 'hermes', cohorts: 1, similarity: 2, coverage: 1, leakage: 2 }
		]);
	});
});
