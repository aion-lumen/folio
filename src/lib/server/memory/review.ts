import { getFolioDb } from '../folio-db/init.js';
import { getFeedbackBriefsByIds } from '../feedback/reader.js';
import { isHistoricalAppointment, zurichToday } from '../../memory/temporal.js';
import { sourceDateSpan } from '../../calendar/source-dates.js';
import { getMemoryProposalBundle } from './store.js';
import type { MemoryFactRow, MemoryProposalBundle } from './types.js';

export function splitTemporalReview(bundle: MemoryProposalBundle, today = zurichToday()) {
	const historical_facts = bundle.facts.filter(fact => fact.status === 'candidate' && isHistoricalAppointment(fact, today));
	const facts = bundle.facts.filter(fact => !historical_facts.some(old => old.fact_id === fact.fact_id));
	const hasReviewWork = facts.some(fact => fact.status === 'candidate')
		|| bundle.relations.some(item => item.status === 'candidate')
		|| (!historical_facts.length && [...bundle.entities, ...bundle.episodes].some(item => item.status === 'candidate'));
	return { ...bundle, facts, historical_facts, hasReviewWork, source_date: null as string | null };
}

/** Rebuildable projection: no status, text, provenance or calendar writes.
 * Classification happens BEFORE pagination, including on existing imports.
 */
export function listMemoryReviewQueue(covered = new Set<string>(), now = new Date(), coveredEpisodes = new Set<string>()) {
	const db = getFolioDb();
	const today = zurichToday(now);
	const ids = db.prepare("SELECT proposal_id FROM memory_proposals WHERE status = 'candidate' ORDER BY created_at DESC").all() as Array<{ proposal_id: string }>;
	const bundles = ids.map(({ proposal_id }) => {
		const bundle = getMemoryProposalBundle(proposal_id);
		return splitTemporalReview({ ...bundle, facts: bundle.facts.filter(fact => !covered.has(fact.fact_id)), episodes: bundle.episodes.filter(episode => !coveredEpisodes.has(episode.episode_id)) }, today);
	});
	const sources = db.prepare('SELECT feedback_id, account, uid FROM mail_intake_sources').all() as Array<{ feedback_id: number; account: string; uid: number }>;
	const byRef = new Map(sources.map(source => [`mail:${source.account}:${source.uid}`, source]));
	const byFeedbackId = new Map(sources.map(source => [source.feedback_id, source]));
	const relevant = [...new Set(bundles.flatMap(bundle => {
		const source = byRef.get(bundle.proposal.source_ref);
		return source ? [source.feedback_id] : [];
	}))];
	const dates = new Map<string, string>();
	// Missing offline metadata is explicitly unknown, never replaced by import time.
	try {
		for (let start = 0; start < relevant.length; start += 400) {
			for (const brief of getFeedbackBriefsByIds(relevant.slice(start, start + 400)).values()) {
				const source = byFeedbackId.get(brief.id);
				if (source && source.account === brief.account_id && source.uid === brief.imap_uid && brief.mail_date && Number.isFinite(Date.parse(brief.mail_date))) {
					dates.set(`mail:${source.account}:${source.uid}`, brief.mail_date);
				}
			}
		}
	} catch { /* Source date unavailable; history classification remains evidence-based. */ }
	for (const bundle of bundles) bundle.source_date = dates.get(bundle.proposal.source_ref) ?? null;
	const nextDate = (bundle: typeof bundles[number]) => bundle.facts
		.filter(fact => fact.status === 'candidate' && fact.predicate === 'scheduled_for')
		.map(fact => sourceDateSpan({ value_text: fact.value_text, valid_from: fact.valid_from })?.start)
		.filter((date): date is string => !!date && date >= today).sort()[0] ?? '9999';
	const active = bundles.filter(bundle => bundle.hasReviewWork).sort((a, b) =>
		nextDate(a).localeCompare(nextDate(b))
		|| (b.source_date ?? b.proposal.created_at).localeCompare(a.source_date ?? a.proposal.created_at));
	const historical = bundles.filter(bundle => bundle.historical_facts.length);
	const standalone = (db.prepare("SELECT * FROM memory_facts WHERE status = 'candidate' AND proposal_id IS NULL ORDER BY recorded_at DESC").all() as MemoryFactRow[]).filter(fact => !covered.has(fact.fact_id));
	const historicalStandalone = standalone.filter(fact => isHistoricalAppointment(fact, today));
	return {
		today, active, historical,
		standalone: standalone.filter(fact => !isHistoricalAppointment(fact, today)), historicalStandalone,
		counts: {
			historicalFacts: historical.reduce((sum, bundle) => sum + bundle.historical_facts.length, historicalStandalone.length),
			historicalOnlyBundles: historical.filter(bundle => !bundle.hasReviewWork).length,
			mixedBundles: historical.filter(bundle => bundle.hasReviewWork).length
		}
	};
}
