import { getFolioAgentConfidence } from '../env.js';
import { loadAllChapters } from '../vault/reader.js';
import type { TriageAssessment, TriageObjectiveProposal, TriageVerdict } from './types.js';

const VERDICTS = new Set<TriageVerdict>(['task', 'unclear', 'not-a-task']);

export function validateGuardrails(
	assessment: TriageAssessment,
	confidenceThreshold = getFolioAgentConfidence()
): string | null {
	if (!VERDICTS.has(assessment.verdict)) return `invalid verdict: ${assessment.verdict}`;
	if (
		typeof assessment.confidence !== 'number' ||
		assessment.confidence < 0 ||
		assessment.confidence > 1
	) {
		return 'confidence must be 0.0-1.0';
	}
	if (assessment.verdict !== 'task') return null;

	if (assessment.confidence < confidenceThreshold) {
		return `confidence ${assessment.confidence} below threshold ${confidenceThreshold}`;
	}
	if (!assessment.chapter_slug?.trim()) return 'task verdict requires chapter_slug';
	if (!assessment.objective) return 'task verdict requires objective';

	const obj = assessment.objective;
	if (!obj.title?.trim()) return 'objective.title required';
	if (!obj.threshold?.trim()) return 'objective.threshold required';
	if (typeof obj.weight !== 'number' || obj.weight < 0.5 || obj.weight > 3) {
		return 'objective.weight must be 0.5-3.0';
	}
	if (!Array.isArray(obj.related_goals) || obj.related_goals.length === 0) {
		return 'objective.related_goals must be non-empty array';
	}
	if (obj.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(obj.deadline)) {
		return 'objective.deadline must be YYYY-MM-DD';
	}
	return null;
}

export async function validateChapterExists(chapterSlug: string): Promise<boolean> {
	const chapters = await loadAllChapters();
	return chapters.some((c) => c.slug === chapterSlug);
}

export async function runGuardrails(
	assessment: TriageAssessment,
	confidenceThreshold = getFolioAgentConfidence()
): Promise<string | null> {
	const basic = validateGuardrails(assessment, confidenceThreshold);
	if (basic) return basic;
	if (assessment.verdict === 'task' && assessment.chapter_slug) {
		const exists = await validateChapterExists(assessment.chapter_slug);
		if (!exists) return `unknown chapter_slug: ${assessment.chapter_slug}`;
	}
	return null;
}

export function normalizeLlmAssessment(
	raw: Record<string, unknown>,
	model: string
): TriageAssessment | null {
	const verdict = String(raw.verdict ?? '') as TriageVerdict;
	if (!VERDICTS.has(verdict)) return null;

	const confidence = Number(raw.confidence);
	if (!Number.isFinite(confidence)) return null;

	let objective: TriageObjectiveProposal | null = null;
	if (raw.objective && typeof raw.objective === 'object') {
		const o = raw.objective as Record<string, unknown>;
		const weight = Number(o.weight);
		const goals = Array.isArray(o.related_goals)
			? o.related_goals.map(String).filter(Boolean)
			: [];
		objective = {
			title: String(o.title ?? '').trim(),
			threshold: String(o.threshold ?? '').trim(),
			weight: Number.isFinite(weight) ? weight : 1,
			related_goals: goals,
			deadline: o.deadline ? String(o.deadline) : undefined
		};
	}

	return {
		verdict,
		confidence,
		chapter_slug: raw.chapter_slug ? String(raw.chapter_slug) : null,
		objective,
		reasoning: String(raw.reasoning ?? '').slice(0, 500),
		model
	};
}

export function isAutoEligible(assessment: TriageAssessment): boolean {
	return assessment.verdict === 'task' && !assessment.guardrail_violation;
}
