import { loadAllChapters, loadCampaign } from '../vault/reader.js';
import type { MemorySensitivity } from '../memory/types.js';

export interface OrientationSourceEvidence {
	id: string;
	question_id: string;
	source_kind: 'campaign';
	source_ref: string;
	source_label: string;
	source_excerpt: string;
	suggested_value: string;
	sensitivity: MemorySensitivity;
}

function section(body: string, heading: string): string {
	const marker = `## ${heading}`;
	const start = body.indexOf(marker);
	if (start < 0) return '';
	const contentStart = body.indexOf('\n', start + marker.length);
	if (contentStart < 0) return '';
	const next = body.indexOf('\n## ', contentStart + 1);
	return body.slice(contentStart + 1, next < 0 ? body.length : next).trim();
}

function bullets(value: string, pattern?: RegExp): string[] {
	return value
		.split('\n')
		.map((line) => line.match(/^\s*-\s+(.+)$/)?.[1]?.trim() ?? '')
		.filter((line) => line && (!pattern || pattern.test(line)));
}

function plainCampaignText(value: string): string {
	return value.replace(/\*\*/gu, '').replace(/\s+/gu, ' ').trim();
}

function labelledCampaignValue(value: string, label: string): string {
	const plain = plainCampaignText(value);
	const match = plain.match(new RegExp(`(?:^|;\\s*)${label}:\\s*([^;]+)`, 'iu'));
	return match?.[1]?.trim().replace(/[.;]+$/u, '') ?? '';
}

function evidence(input: Omit<OrientationSourceEvidence, 'source_kind'>): OrientationSourceEvidence {
	return { ...input, source_kind: 'campaign' };
}

/**
 * Read-only adapter from the active LIFE campaign into the domain compass.
 * Campaign text remains the source of record. These rows are editable proposals,
 * never confirmed Memory and never a second campaign projection.
 */
export async function loadCampaignOrientationEvidence(): Promise<OrientationSourceEvidence[]> {
	try {
		const [campaign, chapters] = await Promise.all([loadCampaign(), loadAllChapters()]);
		const results: OrientationSourceEvidence[] = [];
		const endState = bullets(section(campaign.body, 'Endbild (2036)'), /Finanz|Einkommensfeld|Dach über dem Kopf/iu);
		const current = bullets(section(campaign.body, 'Aktueller Stand'));

		const financeGoals = endState.filter((line) => /Finanz|Einkommensfeld/iu.test(line));
		if (financeGoals.length) {
			results.push(evidence({
				id: 'campaign-finance-goal',
				question_id: 'finance-goal',
				source_ref: '_campaign/campaign.md#endbild-2036',
				source_label: 'Kampagne · Endbild 2036',
				source_excerpt: financeGoals.join(' · '),
				suggested_value: financeGoals.join('; ') + '.',
				sensitivity: 'sensitive'
			}));
		}

		const careerLines = current.filter((line) => /Aktive Pfade|Phase:|Kapitel:/iu.test(line));
		if (careerLines.length) {
			const phase = careerLines.map((line) => labelledCampaignValue(line, 'Phase')).find(Boolean) ?? '';
			const activePaths = careerLines.map((line) => labelledCampaignValue(line, 'Aktive Pfade')).find(Boolean) ?? '';
			const careerDirection = [
				phase ? `Aktuelle berufliche Phase: ${phase}` : '',
				activePaths ? `Aktive berufliche Pfade: ${activePaths}` : ''
			].filter(Boolean);
			const fallback = careerLines.map(plainCampaignText).join(' · ');
			results.push(evidence({
				id: 'campaign-career-direction',
				question_id: 'career-direction',
				source_ref: '_campaign/campaign.md#aktueller-stand',
				source_label: 'Kampagne · Aktueller Stand',
				source_excerpt: careerDirection.join(' · ') || fallback,
				suggested_value: `${careerDirection.join('; ') || fallback}.`,
				sensitivity: 'private'
			}));
		}

		const homeGoal = endState.find((line) => /Dach über dem Kopf/iu.test(line));
		if (homeGoal) {
			results.push(evidence({
				id: 'campaign-immo-goal',
				question_id: 'immo-goal',
				source_ref: '_campaign/campaign.md#endbild-2036',
				source_label: 'Kampagne · Endbild 2036',
				source_excerpt: homeGoal,
				suggested_value: `${homeGoal}.`,
				sensitivity: 'private'
			}));
		}

		const activeObjectives = chapters.flatMap((chapter) => chapter.objectives.map((objective) => ({ chapter, objective })))
			.filter(({ objective }) => objective.status === 'todo' || objective.status === 'in_progress');
		const objectiveEvidence = [
			{ questionId: 'career-priority', tags: /karriere|jobsuche|einkommen/iu, label: 'Karriere' },
			{ questionId: 'finance-priority', tags: /finanzen/iu, label: 'Finanzen' },
			{ questionId: 'ai-projects', tags: /ai-bauen|produkt/iu, label: 'AI & Folio' }
		];
		for (const group of objectiveEvidence) {
			const matches = activeObjectives.filter(({ objective }) =>
				objective.related_goals.some((goal) => group.tags.test(goal))
			);
			if (!matches.length) continue;
			const excerpt = matches.slice(0, 6).map(({ objective }) => `${objective.id}: ${objective.title} (${objective.status})`).join(' · ');
			results.push(evidence({
				id: `campaign-${group.questionId}`,
				question_id: group.questionId,
				source_ref: `_campaign/chapters/#aktive-objectives-${group.questionId}`,
				source_label: `Kampagne · aktive ${group.label}-Objectives`,
				source_excerpt: excerpt,
				suggested_value: matches.slice(0, 6).map(({ objective }) => objective.title).join('; ') + '.',
				sensitivity: group.questionId === 'finance-priority' ? 'sensitive' : 'private'
			}));
		}

		return results;
	} catch {
		return [];
	}
}

export function findOrientationEvidence(
	evidenceRows: OrientationSourceEvidence[],
	evidenceId: string,
	questionId: string
): OrientationSourceEvidence | null {
	return evidenceRows.find((row) => row.id === evidenceId && row.question_id === questionId) ?? null;
}
