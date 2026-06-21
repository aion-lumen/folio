import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import matter from 'gray-matter';
import { getVaultPath } from '../env.js';
import type { Campaign, Act, Chapter, Objective, ObjectiveStatus, ObjectiveHistoryEntry } from '$lib/types/campaign.js';

function campaignDir() {
	return join(getVaultPath(), '_campaign');
}

function chapterSlug(filename: string): string {
	return filename.replace(/\.md$/, '');
}

export async function loadCampaign(): Promise<Campaign> {
	const raw = await readFile(join(campaignDir(), 'campaign.md'), 'utf-8');
	const { data, content } = matter(raw);
	return { ...data, body: content } as Campaign;
}

export async function loadAct(actNumber: number): Promise<Act> {
	const files = await readdir(join(campaignDir(), 'acts'));
	const file = files.find((f) => f.startsWith(`0${actNumber}-`) && f.endsWith('.md'));
	if (!file) throw new Error(`Act ${actNumber} not found`);
	const raw = await readFile(join(campaignDir(), 'acts', file), 'utf-8');
	const { data, content } = matter(raw);
	return { ...data, body: content } as Act;
}

export async function loadAllActs(): Promise<Act[]> {
	const dir = join(campaignDir(), 'acts');
	const files = (await readdir(dir)).filter((f) => f.endsWith('.md') && !f.startsWith('_'));
	const acts = await Promise.all(
		files.map(async (f) => {
			const raw = await readFile(join(dir, f), 'utf-8');
			const { data, content } = matter(raw);
			return { ...data, body: content } as Act;
		})
	);
	return acts.sort((a, b) => a.act_number - b.act_number);
}

export function parseObjectivesFromBody(body: string, chapterNumber: number): Objective[] {
	const objectives: Objective[] = [];
	// Match ### obj-XX-XX: Title blocks
	const sectionRegex = /###\s+(obj-[\w-]+):\s*(.+?)(?=\n###|\n##|$)/gs;
	let match;
	while ((match = sectionRegex.exec(body)) !== null) {
		const id = match[1];
		const title = match[2].split('\n')[0].trim();
		const block = match[0];

		const get = (key: string) => {
			const m = block.match(new RegExp(`- \\*\\*${key}:\\*\\*\\s*(.+)`));
			return m ? m[1].trim() : '';
		};

		const rawStatus = get('status').replace(/["`]/g, '');
		const statusMap: Record<string, ObjectiveStatus> = {
			not_started: 'not_started',
			todo: 'todo',
			in_progress: 'in_progress',
			done: 'done',
			completed: 'done',
			blocked: 'blocked',
			archived: 'archived'
		};

		const goalsRaw = get('related_goals');
		const related_goals = goalsRaw
			? goalsRaw
					.replace(/[\[\]]/g, '')
					.split(',')
					.map((g) => g.trim())
					.filter(Boolean)
			: [];

		// Parse history entries
		const historyBlock = block.match(/- \*\*history:\*\*\n((?:\s+-[^\n]+\n?)*)/);
		let history: ObjectiveHistoryEntry[] | undefined;
		if (historyBlock) {
			const entries = [...historyBlock[1].matchAll(/\s+-\s+([^\n]+)/g)].map((m) => {
				const raw = m[1].trim();
				const colonIdx = raw.indexOf(':');
				// format: "YYYY-MM-DDTHH:MM: change description"
				// timestamp has colons too, so we look for "T" pattern
				const tsMatch = raw.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}):\s*(.+)$/);
				if (tsMatch) return { timestamp: tsMatch[1], change: tsMatch[2] };
				return { timestamp: '', change: raw };
			});
			if (entries.length > 0) history = entries;
		}

		objectives.push({
			id,
			title,
			threshold: get('threshold'),
			status: statusMap[rawStatus] ?? 'not_started',
			weight: parseFloat(get('weight')) || 1.0,
			related_goals,
			deadline: get('deadline') || undefined,
			completed_at: get('completed_at') || undefined,
			progress_note: get('progress_note').replace(/"/g, '') || undefined,
			history,
			chapter_number: chapterNumber
		});
	}
	return objectives;
}

export async function loadChapter(slug: string): Promise<Chapter> {
	const raw = await readFile(join(campaignDir(), 'chapters', `${slug}.md`), 'utf-8');
	const { data, content } = matter(raw);
	const objectives = parseObjectivesFromBody(content, data.chapter_number as number);
	return {
		...data,
		body: content,
		objectives,
		slug,
		objective_ids: data.objectives ?? []
	} as Chapter;
}

export async function loadAllChapters(): Promise<Chapter[]> {
	const dir = join(campaignDir(), 'chapters');
	const files = (await readdir(dir)).filter((f) => f.endsWith('.md') && !f.startsWith('_'));
	const chapters = await Promise.all(files.map((f) => loadChapter(chapterSlug(f))));
	return chapters.sort((a, b) => {
		if (a.chapter_number !== b.chapter_number) return a.chapter_number - b.chapter_number;
		return a.slug.localeCompare(b.slug);
	});
}

export async function loadActiveChapter(currentChapter: number): Promise<Chapter | null> {
	const chapters = await loadAllChapters();
	return (
		chapters.find((c) => c.chapter_number === currentChapter && c.status === 'active') ?? null
	);
}
