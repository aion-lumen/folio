import { describe, expect, it } from 'vitest';
import type { MailDomainReview } from '../memory/domain-reviews.js';
import type { MailSelectionCandidate } from '../memory/selection-runner.js';
import { buildBalancedRealMailEvalCohort } from './real-corpus.js';

function mail(id: number, domain: MailSelectionCandidate['mail_domain']): MailSelectionCandidate {
	return { feedback_id: id, account_id: 'test', sender: 'sender@example.test', subject: `Mail ${id}`, received_at: null, mail_domain: domain, body: `Body ${id}` };
}

function review(id: number, domain: MailDomainReview['primary_domain'], overrides: Partial<MailDomainReview> = {}): MailDomainReview {
	return {
		review_id: id, run_id: 'run', feedback_id: id, verdict: 'included', primary_domain: domain,
		secondary_domains: [], review_category: null, review_traits: [], action_required: null,
		deadline_present: null, label_schema: 'v1-exclusive', note: null, reviewed_by_user_id: 1,
		reviewed_at: '2026-08-23T00:00:00Z', ...overrides
	};
}

describe('real mail evaluation cohort', () => {
	it('balances domains and prioritizes operationally labelled cases', () => {
		const corpus = [mail(1, 'job'), mail(2, 'job'), mail(3, 'job'), mail(4, 'finance')];
		const reviews = {
			1: review(1, 'job'),
			2: review(2, 'job', { action_required: true, deadline_present: false, label_schema: 'v2-multilabel' }),
			3: review(3, 'job', { verdict: 'excluded' }),
			4: review(4, 'finance', { secondary_domains: ['shopping'], label_schema: 'v2-multilabel' })
		};
		const cohort = buildBalancedRealMailEvalCohort(corpus, reviews, 1);
		expect(cohort.cases.map((item) => item.feedback_id)).toEqual([2, 4]);
		expect(cohort.counts.by_domain.job).toBe(1);
		expect(cohort.counts.by_domain.finance).toBe(1);
		expect(cohort.counts.action_labeled).toBe(1);
		expect(cohort.counts.secondary_labeled).toBe(2);
		expect(cohort.cases[1].gold.secondary_domains).toEqual(['shopping']);
	});

	it('does not expose legacy secondary labels as gold', () => {
		const cohort = buildBalancedRealMailEvalCohort(
			[mail(1, 'job')],
			{ 1: review(1, 'job', { secondary_domains: ['kontakt'] }) }
		);
		expect(cohort.cases[0].gold.secondary_domains).toEqual([]);
	});
});
