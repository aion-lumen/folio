import type { FeedbackRow } from '../feedback/types.js';
import type { ValidatorOpinionRow } from '../folio-db/types.js';
import { getFolioDb } from '../folio-db/init.js';
import { listValidatorOpinionsForFeedback } from '../folio-db/reader.js';
import { loadRegelwerk } from '../regelwerk/loader.js';

export interface MailDomainDecision {
	domain: string | null;
	source: 'human' | 'model_consensus' | 'incomplete' | 'conflict';
	models: string[];
}
const DOMAINS = new Set(['job', 'immo', 'finance', 'kontakt', 'shopping', 'system', 'werbung', 'unsorted']);
const normalize = (domain: string | null) => domain === 'job-lead' ? 'job' : domain;

export function decideMailDomain(
	row: Pick<FeedbackRow, 'id' | 'account_id' | 'imap_uid'>,
	correction: string | null,
	opinions: ValidatorOpinionRow[],
	models: string[]
): MailDomainDecision {
	if (correction !== null) return { domain: normalize(correction), source: 'human', models: [] };
	const required = [...new Set(models)];
	const votes = required.map((model) => opinions.find((vote) => vote.validator_model === model
		&& vote.feedback_id === row.id && vote.account_id === row.account_id && vote.imap_uid === row.imap_uid));
	if (required.length < 3 || votes.some((vote) => !vote || !DOMAINS.has(normalize(vote.validator_domain) ?? ''))) {
		return { domain: null, source: 'incomplete', models: required };
	}
	const domains = new Set(votes.map((vote) => normalize(vote!.validator_domain)));
	return domains.size === 1
		? { domain: [...domains][0], source: 'model_consensus', models: required }
		: { domain: null, source: 'conflict', models: required };
}

export function resolveMailMemoryDomain(row: FeedbackRow): MailDomainDecision {
	// A later action-only correction must not erase an earlier domain correction.
	const correction = getFolioDb().prepare(`SELECT corrected_domain FROM corrections
		WHERE feedback_id = ? AND imap_uid = ? AND corrected_domain IS NOT NULL
		ORDER BY corrected_at DESC, id DESC LIMIT 1`).get(row.id, row.imap_uid) as { corrected_domain: string } | undefined;
	const models = loadRegelwerk().voice_consensus.voices
		.filter((voice) => voice.enabled !== false && ['primary_llm', 'control_llm'].includes(voice.role))
		.map((voice) => voice.lm_studio_model).filter((model): model is string => Boolean(model));
	return decideMailDomain(row, correction?.corrected_domain ?? null, listValidatorOpinionsForFeedback(row.id), models);
}

/** Full triage coverage is required even when the owner has corrected the domain. */
export function hasCompleteMailModelOpinions(row: FeedbackRow): boolean {
 const models=loadRegelwerk().voice_consensus.voices.filter(v=>v.enabled!==false && ['primary_llm','control_llm'].includes(v.role)).map(v=>v.lm_studio_model).filter((m):m is string=>Boolean(m));
 return decideMailDomain(row,null,listValidatorOpinionsForFeedback(row.id),models).source!=='incomplete';
}
