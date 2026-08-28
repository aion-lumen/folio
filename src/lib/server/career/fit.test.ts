import { describe, expect, it } from 'vitest';
import { CareerFitError, evaluateCareerFit } from './fit.js';

const evidence = ['fact-confirmed'];

describe('career fit gate', () => {
	it('hard-stops on one unproven mandatory requirement', () => {
		expect(evaluateCareerFit([
			{ text: 'SAP BW/4HANA', class: 'MUST', evidence_state: 'PROVEN', evidence_fact_ids: evidence },
			{ text: 'C-level strategy ownership', class: 'MUST', evidence_state: 'NOT_PROVEN', evidence_fact_ids: [] }
		])).toEqual(expect.objectContaining({ decision: 'SKIP', blockers: ['MUST_NOT_PROVEN'] }));
	});

	it('clarifies partial mandatory evidence instead of upgrading it', () => {
		expect(evaluateCareerFit([
			{ text: 'Five years productive MLOps', class: 'MUST', evidence_state: 'PARTIAL', evidence_fact_ids: evidence }
		])).toEqual(expect.objectContaining({ decision: 'CLARIFY', blockers: ['MUST_PARTIAL'] }));
	});

	it('allows transparent gaps only for should requirements', () => {
		expect(evaluateCareerFit([
			{ text: 'SAP BW/4HANA', class: 'MUST', evidence_state: 'PROVEN', evidence_fact_ids: evidence },
			{ text: 'TOGAF', class: 'SHOULD', evidence_state: 'NOT_PROVEN', evidence_fact_ids: [] }
		])).toEqual(expect.objectContaining({ decision: 'APPLY_WITH_GAPS', blockers: [] }));
	});

	it('rejects positive evidence states without a fact reference', () => {
		expect(() => evaluateCareerFit([
			{ text: 'Product ownership', class: 'MUST', evidence_state: 'PROVEN', evidence_fact_ids: [] }
		])).toThrow(CareerFitError);
	});

	it('rejects unknown classes and evidence states at runtime', () => {
		expect(() => evaluateCareerFit([
			{ text: 'Claim', class: 'MAYBE' as 'MUST', evidence_state: 'NOT_PROVEN', evidence_fact_ids: [] }
		])).toThrow('invalid requirement class');
		expect(() => evaluateCareerFit([
			{ text: 'Claim', class: 'MUST', evidence_state: 'LIKELY' as 'PROVEN', evidence_fact_ids: [] }
		])).toThrow('invalid evidence state');
	});
});
