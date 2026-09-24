import type { CareerFitVerdict, CareerRequirement } from './types.js';

export const CAREER_FIT_POLICY_VERSION = 'career-fit/v1';

export class CareerFitError extends Error {}

const REQUIREMENT_CLASSES = new Set(['KNOCKOUT', 'MUST', 'SHOULD', 'CONTEXT']);
const EVIDENCE_STATES = new Set(['PROVEN', 'PARTIAL', 'NOT_PROVEN', 'UNCLEAR']);

function cleanRequirement(requirement: CareerRequirement): CareerRequirement {
	const text = requirement.text.trim();
	if (!text) throw new CareerFitError('requirement text must not be empty');
	if (!REQUIREMENT_CLASSES.has(requirement.class)) throw new CareerFitError('invalid requirement class');
	if (!EVIDENCE_STATES.has(requirement.evidence_state)) throw new CareerFitError('invalid evidence state');
	const evidenceFactIds = [...new Set(requirement.evidence_fact_ids.map((id) => id.trim()).filter(Boolean))];
	if (
		(requirement.evidence_state === 'PROVEN' || requirement.evidence_state === 'PARTIAL') &&
		evidenceFactIds.length === 0
	) {
		throw new CareerFitError(`${requirement.evidence_state} requires confirmed evidence`);
	}
	return {
		...requirement,
		text,
		evidence_fact_ids: evidenceFactIds,
		note: requirement.note?.trim() || undefined
	};
}

export function validateCareerRequirements(requirements: CareerRequirement[]): CareerRequirement[] {
	if (!requirements.length) throw new CareerFitError('at least one requirement is required');
	return requirements.map(cleanRequirement);
}

export function evaluateCareerFit(input: CareerRequirement[]): CareerFitVerdict {
	const requirements = validateCareerRequirements(input);
	const hardMissing = requirements.filter(
		(item) => (item.class === 'KNOCKOUT' || item.class === 'MUST') && item.evidence_state === 'NOT_PROVEN'
	);
	if (hardMissing.length) {
		return {
			decision: 'SKIP',
			blockers: hardMissing.map((item) => `${item.class}_NOT_PROVEN`),
			reason: `Nicht belegte zwingende Anforderung: ${hardMissing[0].text}`
		};
	}

	const hardUnclear = requirements.filter(
		(item) =>
			(item.class === 'KNOCKOUT' || item.class === 'MUST') &&
			(item.evidence_state === 'UNCLEAR' || item.evidence_state === 'PARTIAL')
	);
	if (hardUnclear.length) {
		return {
			decision: 'CLARIFY',
			blockers: hardUnclear.map((item) => `${item.class}_${item.evidence_state}`),
			reason: `Zwingende Anforderung vor einer Bewerbung klären: ${hardUnclear[0].text}`
		};
	}

	const softGaps = requirements.filter(
		(item) => item.class === 'SHOULD' && item.evidence_state !== 'PROVEN'
	);
	if (softGaps.length) {
		return {
			decision: 'APPLY_WITH_GAPS',
			blockers: [],
			reason: `Bewerbung vertretbar; transparente Wunschprofil-Lücke: ${softGaps[0].text}`
		};
	}

	return { decision: 'APPLY', blockers: [], reason: 'Alle zwingenden Anforderungen sind belegt.' };
}
