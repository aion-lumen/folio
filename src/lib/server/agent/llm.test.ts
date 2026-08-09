import { afterEach, describe, expect, it, vi } from 'vitest';
import { callLmStudio } from './llm.js';

describe('LM Studio response channels', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('uses reasoning_content only when a structured caller explicitly opts in', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				choices: [{ message: { content: '', reasoning_content: '{"classifications":[]}' } }]
			})
		});
		vi.stubGlobal('fetch', fetchMock);

		await expect(callLmStudio('classify', 'local-model')).resolves.toBeNull();
		await expect(callLmStudio('classify', 'local-model', {
			acceptReasoningAsContent: true,
			reasoningEffort: 'low',
			maxTokens: 600,
			responseFormat: { type: 'json_schema' }
		})).resolves.toBe('{"classifications":[]}');

		const request = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
		expect(request).toEqual(expect.objectContaining({
			reasoning_effort: 'low',
			max_tokens: 600,
			response_format: { type: 'json_schema' }
		}));
	});

	it('prefers ordinary content when both response channels are present', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				choices: [{ message: { content: '{"answer":"visible"}', reasoning_content: '{"answer":"hidden"}' } }]
			})
		}));

		await expect(callLmStudio('classify', 'local-model', {
			acceptReasoningAsContent: true
		})).resolves.toBe('{"answer":"visible"}');
	});
});
