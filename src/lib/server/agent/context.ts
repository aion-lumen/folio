import { loadAllChapters } from '../vault/reader.js';
import type { Chapter } from '$lib/types/campaign.js';

export interface CampaignContext {
	chapters: Array<{
		slug: string;
		title: string;
		chapter_number: number | string;
		status: string;
		objective_ids: string[];
	}>;
	objective_ids: string[];
}

export async function buildCampaignContext(): Promise<CampaignContext> {
	const chapters = await loadAllChapters();
	const objective_ids: string[] = [];
	for (const ch of chapters) {
		for (const obj of ch.objectives) objective_ids.push(obj.id);
	}
	return {
		chapters: chapters.map((ch: Chapter) => ({
			slug: ch.slug,
			title: ch.title,
			chapter_number: ch.chapter_number,
			status: ch.status,
			objective_ids: ch.objective_ids ?? ch.objectives.map((o) => o.id)
		})),
		objective_ids
	};
}

export function formatCampaignContextForPrompt(ctx: CampaignContext): string {
	const lines = ctx.chapters.map(
		(ch) =>
			`- slug: ${ch.slug} | chapter ${ch.chapter_number} | "${ch.title}" | status: ${ch.status} | objectives: ${ch.objective_ids.join(', ') || '(none)'}`
	);
	return `## Campaign chapters (use slug for chapter_slug)\n${lines.join('\n')}\n\n## All objective IDs\n${ctx.objective_ids.join(', ') || '(none)'}`;
}
