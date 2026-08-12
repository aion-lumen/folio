import { afterEach, describe, expect, it } from 'vitest';
import { setLlmOverride } from '../../agent/llm.js';
import { classifyFollowingBatch } from './classifier.js';

const profiles = [
	{ accountId: '10', username: 'local_ai', name: 'Local AI', description: 'Local models and agents' },
	{ accountId: '20', username: 'policy', name: 'Policy', description: 'Swiss public policy' }
];

describe('Sonar following classifier', () => {
	afterEach(() => setLlmOverride(null));

	it('accepts one complete, bounded classification response', async () => {
		setLlmOverride(async () =>
			JSON.stringify({
				classifications: [
					{ account_id: '10', category: 'ai', confidence: 0.96, reason: 'Lokale Modelle und Agenten.' },
					{ account_id: '20', category: 'politics', confidence: 0.91, reason: 'Schweizer Politik und Verwaltung.' }
				]
			})
		);
		await expect(classifyFollowingBatch(profiles)).resolves.toEqual([
			{ accountId: '10', category: 'ai', confidence: 0.96, reason: 'Lokale Modelle und Agenten.' },
			{ accountId: '20', category: 'politics', confidence: 0.91, reason: 'Schweizer Politik und Verwaltung.' }
		]);
	});

	it('rejects omitted, duplicate, or invented account IDs', async () => {
		setLlmOverride(async () =>
			JSON.stringify({
				classifications: [
					{ account_id: '10', category: 'ai', confidence: 0.9, reason: 'AI.' },
					{ account_id: '99', category: 'politics', confidence: 0.9, reason: 'Politik.' }
				]
			})
		);
		await expect(classifyFollowingBatch(profiles)).rejects.toThrow('invalid');
	});

	it('rejects oversized batches before contacting the model', async () => {
		await expect(
			classifyFollowingBatch(Array.from({ length: 25 }, (_, index) => ({
				accountId: String(index + 1), username: `user_${index}`, name: 'User', description: ''
			})))
		).rejects.toThrow('1–24');
	});
});
