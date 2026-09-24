import type { MailDomainReview } from '../memory/domain-reviews.js';
import {
	MAIL_SELECTION_DOMAINS,
	type MailSelectionCandidate,
	type MailSelectionDomain
} from '../memory/selection-runner.js';

export type RealMailEvalGold = {
	primary_domain: MailSelectionDomain;
	secondary_domains: MailSelectionDomain[];
	secondary_labeled: boolean;
	action_required: boolean | null;
	deadline_present: boolean | null;
};

export type RealMailEvalCase = {
	feedback_id: number;
	account_id: string;
	sender: string;
	subject: string;
	received_at: string | null;
	body: string;
	gold: RealMailEvalGold;
};

export type RealMailEvalCohort = {
	cases: RealMailEvalCase[];
	counts: {
		by_domain: Record<MailSelectionDomain, number>;
		secondary_labeled: number;
		action_labeled: number;
		deadline_labeled: number;
	};
};

function priority(review: MailDomainReview): number {
	return Number(review.action_required != null || review.deadline_present != null) * 4 +
		Number(review.label_schema === 'v2-multilabel') * 2 +
		Number(review.secondary_domains.length > 0);
}

/**
 * Freeze a small, balanced cohort from human-reviewed real mail. Operationally
 * labelled cases come first so the expensive run measures more than routing.
 */
export function buildBalancedRealMailEvalCohort(
	corpus: MailSelectionCandidate[],
	reviews: Record<number, MailDomainReview>,
	perDomain = 8
): RealMailEvalCohort {
	if (!Number.isSafeInteger(perDomain) || perDomain < 1 || perDomain > 25) {
		throw new Error('Invalid real-mail cohort size');
	}
	const corpusById = new Map(corpus.map((item) => [item.feedback_id, item]));
	const cases: RealMailEvalCase[] = [];
	const byDomain = Object.fromEntries(
		MAIL_SELECTION_DOMAINS.map((domain) => [domain, 0])
	) as Record<MailSelectionDomain, number>;

	for (const domain of MAIL_SELECTION_DOMAINS) {
		const domainReviews = Object.values(reviews)
			.filter((review) => review.verdict === 'included' && review.primary_domain === domain && corpusById.has(review.feedback_id))
			.sort((left, right) => priority(right) - priority(left) || left.feedback_id - right.feedback_id)
			.slice(0, perDomain);
		for (const review of domainReviews) {
			const mail = corpusById.get(review.feedback_id)!;
			cases.push({
				feedback_id: mail.feedback_id,
				account_id: mail.account_id,
				sender: mail.sender,
				subject: mail.subject,
				received_at: mail.received_at,
				body: mail.body.slice(0, 1_500),
				gold: {
					primary_domain: review.primary_domain,
					secondary_domains: review.label_schema === 'v2-multilabel' ? review.secondary_domains : [],
					secondary_labeled: review.label_schema === 'v2-multilabel',
					action_required: review.action_required,
					deadline_present: review.deadline_present
				}
			});
			byDomain[domain] += 1;
		}
	}

	return {
		cases,
		counts: {
			by_domain: byDomain,
			secondary_labeled: cases.filter((item) => reviews[item.feedback_id]?.label_schema === 'v2-multilabel').length,
			action_labeled: cases.filter((item) => item.gold.action_required != null).length,
			deadline_labeled: cases.filter((item) => item.gold.deadline_present != null).length
		}
	};
}
