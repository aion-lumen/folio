import { getFolioDb } from '../folio-db/init.js';
import { DOMAIN_KEYS, type DomainKey } from '../folio-db/types.js';
import type { MailSelectionCategory, MailSelectionTrait } from './selection-runner.js';

export type MailDomainReviewVerdict = 'included' | 'excluded';

export interface MailDomainReview {
	review_id: number;
	run_id: string;
	feedback_id: number;
	verdict: MailDomainReviewVerdict;
	primary_domain: DomainKey;
	secondary_domains: DomainKey[];
	review_category: MailSelectionCategory | null;
	review_traits: MailSelectionTrait[];
	action_required: boolean | null;
	deadline_present: boolean | null;
	label_schema: 'v1-exclusive' | 'v2-multilabel';
	note: string | null;
	reviewed_by_user_id: number;
	reviewed_at: string;
}

interface MailDomainReviewRow extends Omit<MailDomainReview, 'secondary_domains' | 'review_traits' | 'action_required' | 'deadline_present'> {
	secondary_domains_json: string;
	review_traits_json: string;
	action_required: number | null;
	deadline_present: number | null;
}

export interface RecordMailDomainReviewInput {
	run_id: string;
	feedback_id: number;
	verdict: MailDomainReviewVerdict;
	primary_domain: DomainKey;
	secondary_domains: DomainKey[];
	review_traits: MailSelectionTrait[];
	action_required?: boolean | null;
	deadline_present?: boolean | null;
	note?: string | null;
	reviewed_by_user_id: number;
}

const DOMAIN_SET = new Set<string>(DOMAIN_KEYS);
// Human selection traits describe why a mail belongs in the evaluation cohort.
// Operational importance is recorded independently in its own nullable columns.
const TRAIT_SET = new Set<string>(['boundary', 'cross_domain', 'detail_rich']);

function parseSecondaryDomains(value: string): DomainKey[] {
	try {
		const parsed = JSON.parse(value) as unknown;
		if (!Array.isArray(parsed) || !parsed.every((domain) => typeof domain === 'string' && DOMAIN_SET.has(domain))) return [];
		return parsed as DomainKey[];
	} catch {
		return [];
	}
}

function view(row: MailDomainReviewRow): MailDomainReview {
	const { secondary_domains_json, review_traits_json, action_required, deadline_present, ...rest } = row;
	let reviewTraits: MailSelectionTrait[] = [];
	try {
		const parsed = JSON.parse(review_traits_json) as unknown;
		if (Array.isArray(parsed) && parsed.every((trait) => typeof trait === 'string' && TRAIT_SET.has(trait))) {
			reviewTraits = parsed as MailSelectionTrait[];
		}
	} catch { /* legacy rows derive their single label below */ }
	if (rest.label_schema === 'v1-exclusive' && rest.review_category && rest.review_category !== 'normal') {
		reviewTraits = [rest.review_category];
	}
	return {
		...rest,
		secondary_domains: parseSecondaryDomains(secondary_domains_json),
		review_traits: reviewTraits,
		action_required: action_required == null ? null : action_required === 1,
		deadline_present: deadline_present == null ? null : deadline_present === 1
	};
}

export function validateMailDomainReview(input: RecordMailDomainReviewInput): void {
	if (!input.run_id.trim()) throw new Error('Auswahllauf fehlt.');
	if (!Number.isSafeInteger(input.feedback_id) || input.feedback_id < 1) throw new Error('Ungültige Mail-ID.');
	if (input.verdict !== 'included' && input.verdict !== 'excluded') throw new Error('Ungültiges Prüfresultat.');
	if (!DOMAIN_SET.has(input.primary_domain)) throw new Error('Ungültige Primärdomäne.');
	if (!Array.isArray(input.secondary_domains) || input.secondary_domains.length > 2) {
		throw new Error('Es sind höchstens zwei Sekundärdomänen erlaubt.');
	}
	if (new Set(input.secondary_domains).size !== input.secondary_domains.length ||
		input.secondary_domains.some((domain) => !DOMAIN_SET.has(domain) || domain === input.primary_domain)) {
		throw new Error('Sekundärdomänen müssen eindeutig und von der Primärdomäne verschieden sein.');
	}
	if (!Array.isArray(input.review_traits) || new Set(input.review_traits).size !== input.review_traits.length ||
		input.review_traits.some((trait) => !TRAIT_SET.has(trait))) throw new Error('Ungültige Prüfmerkmale.');
	if (input.action_required != null && typeof input.action_required !== 'boolean') throw new Error('Ungültiger Handlungsbedarf.');
	if (input.deadline_present != null && typeof input.deadline_present !== 'boolean') throw new Error('Ungültige Fristangabe.');
	if (input.review_traits.includes('cross_domain') && input.secondary_domains.length === 0) {
		throw new Error('Domänenübergreifende Fälle brauchen mindestens eine Sekundärdomäne.');
	}
	if (input.secondary_domains.length > 0 && !input.review_traits.includes('cross_domain')) {
		throw new Error('Sekundärdomänen müssen als domänenübergreifend markiert sein.');
	}
	if (!Number.isSafeInteger(input.reviewed_by_user_id) || input.reviewed_by_user_id < 1) throw new Error('Prüfende Person fehlt.');
	if ((input.note?.length ?? 0) > 500) throw new Error('Notiz ist zu lang.');
}

export function recordMailDomainReview(input: RecordMailDomainReviewInput): MailDomainReview {
	validateMailDomainReview(input);
	const reviewedAt = new Date().toISOString();
	const result = getFolioDb().prepare(`
		INSERT INTO memory_mail_domain_reviews (
			run_id, feedback_id, verdict, primary_domain, secondary_domains_json,
			review_category, review_traits_json, label_schema, action_required, deadline_present,
			note, reviewed_by_user_id, reviewed_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, 'v2-multilabel', ?, ?, ?, ?, ?)
	`).run(
		input.run_id, input.feedback_id, input.verdict, input.primary_domain,
		JSON.stringify(input.secondary_domains), null, JSON.stringify(input.review_traits),
		input.action_required == null ? null : Number(input.action_required),
		input.deadline_present == null ? null : Number(input.deadline_present),
		input.note?.trim() || null, input.reviewed_by_user_id, reviewedAt
	);
	const row = getFolioDb().prepare('SELECT * FROM memory_mail_domain_reviews WHERE review_id = ?')
		.get(Number(result.lastInsertRowid)) as MailDomainReviewRow;
	return view(row);
}

export function listLatestMailDomainReviews(runId: string): MailDomainReview[] {
	const rows = getFolioDb().prepare(`
		SELECT review.*
		FROM memory_mail_domain_reviews review
		JOIN (
			SELECT feedback_id, MAX(review_id) AS review_id
			FROM memory_mail_domain_reviews
			WHERE run_id = ?
			GROUP BY feedback_id
		) latest ON latest.review_id = review.review_id
		ORDER BY review.review_id ASC
	`).all(runId) as MailDomainReviewRow[];
	return rows.map(view);
}

export function mailDomainReviewMap(runId: string): Record<number, MailDomainReview> {
	return Object.fromEntries(listLatestMailDomainReviews(runId).map((review) => [review.feedback_id, review]));
}

/** Merge frozen review runs from oldest to newest; a later human decision wins. */
export function mailDomainReviewMapForRuns(runIds: string[]): Record<number, MailDomainReview> {
	const reviews: Record<number, MailDomainReview> = {};
	for (const runId of [...new Set(runIds)]) {
		for (const review of listLatestMailDomainReviews(runId)) reviews[review.feedback_id] = review;
	}
	return reviews;
}
