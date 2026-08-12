import { describe, expect, it } from 'vitest';
import { summarizeClassification } from './summarize-classification.js';

describe('summarizeClassification', () => {
	it('presents the job-lead provenance alias as Job', () => {
		expect(
			summarizeClassification({
				domain: 'job-lead',
				effective_actionability: 'actionable',
				heuristic_markers: ['override:recipient_alias:job-lead']
			})
		).toBe('Actionable: Job');
	});
});
