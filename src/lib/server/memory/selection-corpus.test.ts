import { describe, expect, it } from 'vitest';
import type { FeedbackRow } from '../feedback/types.js';
import { buildRealMailSelectionCorpus, normalizeSelectionDomain } from './selection-corpus.js';

function row(overrides: Partial<FeedbackRow>): FeedbackRow {
	return {
		id: 1, task_id: 'task', account_id: 'yahoo', imap_uid: 1,
		sender: 'shop@merchant.invalid', subject: 'Lieferung unterwegs', body_hash: 'hash',
		plugin_value: null, plugin_confidence: null, plugin_evidence: null,
		heuristic_suggested_action: null, heuristic_reason: null, heuristic_confidence: null,
		heuristic_markers: null, user_classification: null, user_final_action: null,
		suggested_action_confirmed: null, response_time_ms: null, timeout_occurred: null,
		created_at: '2026-08-17T10:00:00Z', mail_date: '2026-08-17T09:00:00Z',
		domain: 'shopping', actionability: 'archive', effective_actionability: 'archive',
		body_excerpt: 'Ihre Sendung wurde zugestellt.', ...overrides
	};
}

describe('real memory-selection corpus', () => {
	it('keeps the original mail domain and folds job-lead into job only', () => {
		expect(normalizeSelectionDomain('shopping')).toBe('shopping');
		expect(normalizeSelectionDomain('job-lead')).toBe('job');
	});

	it('excludes synthetic and body-less rows while honoring a human correction', () => {
		const rows = [
			row({ id: 1 }),
			row({ id: 2, sender: 'noreply@dhl.example', subject: 'Lieferung erfolgreich zugestellt' }),
			row({ id: 3, body_excerpt: null }),
			row({ id: 4, domain: 'kontakt' })
		];
		const corpus = buildRealMailSelectionCorpus(rows, new Map([[4, { corrected_domain: 'finance' }]]));
		expect(corpus.map((item) => [item.feedback_id, item.mail_domain])).toEqual([[1, 'shopping'], [4, 'finance']]);
	});
});
