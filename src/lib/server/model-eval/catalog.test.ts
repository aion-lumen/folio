import { describe, expect, it } from 'vitest';
import { loadModelEvalCatalog, parseModelEvalCatalog } from './catalog.js';

const validCatalog = {
	schema: 'folio/model-eval-catalog/v1',
	suite: { id: 'mail-triage-demo-v1', label: '40 synthetische Mails', cases: 40 },
	candidates: [
		{
			id: 'qwen', label: 'Qwen', model_id: 'qwen-test', response_strip: 'code_fence',
			variant: '27B', default: true
		}
	]
};

describe('model-eval catalog', () => {
	it('accepts the small allow-listed catalog', () => {
		expect(parseModelEvalCatalog(validCatalog)).toMatchObject({
			suite: { cases: 40 }, candidates: [{ id: 'qwen', model_id: 'qwen-test' }]
		});
	});

	it('rejects duplicate candidates and unknown response cleanup', () => {
		expect(() => parseModelEvalCatalog({
			...validCatalog,
			candidates: [...validCatalog.candidates, validCatalog.candidates[0]]
		})).toThrow('duplicate');
		expect(() => parseModelEvalCatalog({
			...validCatalog,
			candidates: [{ ...validCatalog.candidates[0], response_strip: 'guess' }]
		})).toThrow('response strip');
	});

	it('uses the canonical Qwen 3.8 load identifier in the shipped catalog', () => {
		const qwen = loadModelEvalCatalog().candidates.find((candidate) => candidate.id === 'qwen38');
		expect(qwen?.model_id).toBe('qwen3.8-27b-mlx');
	});
});
