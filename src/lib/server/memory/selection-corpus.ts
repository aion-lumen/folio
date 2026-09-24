import type { FeedbackRow } from '../feedback/types.js';
import {
	MAIL_SELECTION_DOMAINS,
	type MailSelectionCandidate,
	type MailSelectionDomain
} from './selection-runner.js';

const DOMAIN_SET = new Set<string>(MAIL_SELECTION_DOMAINS);

export function normalizeSelectionDomain(value: string | null): MailSelectionDomain | null {
	const normalized = value === 'job-lead' ? 'job' : value;
	return normalized && DOMAIN_SET.has(normalized) ? normalized as MailSelectionDomain : null;
}

export function isSyntheticSelectionMail(row: Pick<FeedbackRow, 'sender' | 'subject'>): boolean {
	const sender = row.sender.toLocaleLowerCase('en');
	return sender.includes('.example') || sender.includes('@example.') ||
		/\bexample(?:-|\s)(?:marketplace|portal|bank|games|kanton)\b/iu.test(row.subject);
}

export function buildRealMailSelectionCorpus(
	rows: FeedbackRow[],
	correctedDomains: Map<number, { corrected_domain: string | null }>
): MailSelectionCandidate[] {
	const out: MailSelectionCandidate[] = [];
	for (const row of rows) {
		if (isSyntheticSelectionMail(row)) continue;
		const body = row.body_excerpt?.trim();
		const domain = normalizeSelectionDomain(correctedDomains.get(row.id)?.corrected_domain ?? row.domain);
		if (!body || !domain) continue;
		out.push({
			feedback_id: row.id,
			account_id: row.account_id,
			sender: row.sender,
			subject: row.subject,
			received_at: row.mail_date,
			mail_domain: domain,
			body
		});
	}
	return out;
}

export function mailSelectionPoolCounts(corpus: MailSelectionCandidate[]): Record<MailSelectionDomain, number> {
	const counts = Object.fromEntries(MAIL_SELECTION_DOMAINS.map((domain) => [domain, 0])) as Record<MailSelectionDomain, number>;
	for (const item of corpus) counts[item.mail_domain] += 1;
	return counts;
}
