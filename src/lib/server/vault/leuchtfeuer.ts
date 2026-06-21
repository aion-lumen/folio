import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { getVaultPath } from '../env.js';

export interface LeuchtfeuerState {
	ids: string[];
	week: number;
	year: number;
}

function statePath(): string {
	return join(getVaultPath(), '_campaign', 'state.md');
}

// ISO 8601 week number, Monday = start of week (German convention)
function getISOWeek(date: Date): { week: number; year: number } {
	const d = new Date(date);
	d.setHours(0, 0, 0, 0);
	d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
	const week1 = new Date(d.getFullYear(), 0, 4);
	const week =
		1 +
		Math.round(
			((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
		);
	return { week, year: d.getFullYear() };
}

function sectionHeader(week: number, year: number): string {
	return `## Leuchtfeuer KW ${week} (${year})`;
}

function parseSection(lines: string[], week: number, year: number): string[] {
	const header = sectionHeader(week, year);
	const headerIdx = lines.findIndex((l) => l.startsWith(header));
	if (headerIdx === -1) return [];
	const ids: string[] = [];
	for (let i = headerIdx + 1; i < lines.length; i++) {
		const line = lines[i].trim();
		if (line.startsWith('## ')) break;
		const m = line.match(/^-\s+(obj-[\w-]+)/);
		if (m) ids.push(m[1]);
	}
	return ids;
}

export async function getLeuchtfeuer(): Promise<LeuchtfeuerState> {
	const { week, year } = getISOWeek(new Date());
	try {
		const raw = await readFile(statePath(), 'utf-8');
		const ids = parseSection(raw.split('\n'), week, year);
		return { ids, week, year };
	} catch {
		return { ids: [], week, year };
	}
}

export async function toggleLeuchtfeuer(
	objectiveId: string
): Promise<LeuchtfeuerState & { added: boolean; max_reached: boolean }> {
	const { week, year } = getISOWeek(new Date());
	const today = new Date().toISOString().slice(0, 10);

	let raw = '';
	try {
		raw = await readFile(statePath(), 'utf-8');
	} catch {
		raw = `---\ntype: state\nupdated: ${today}\n---\n`;
	}

	const lines = raw.split('\n');
	const currentIds = parseSection(lines, week, year);

	// Toggle
	let newIds: string[];
	let added: boolean;

	if (currentIds.includes(objectiveId)) {
		newIds = currentIds.filter((id) => id !== objectiveId);
		added = false;
	} else if (currentIds.length >= 3) {
		return { ids: currentIds, week, year, added: false, max_reached: true };
	} else {
		newIds = [...currentIds, objectiveId];
		added = true;
	}

	// Build section lines
	const header = sectionHeader(week, year);
	const newSection = [header, '', ...newIds.map((id) => `- ${id}`), ''];

	// Find existing section bounds
	const headerIdx = lines.findIndex((l) => l.startsWith(header));
	if (headerIdx === -1) {
		// Append
		const updated = raw.trimEnd() + '\n\n' + newSection.join('\n') + '\n';
		await writeFile(statePath(), updateDate(updated, today), 'utf-8');
	} else {
		let endIdx = headerIdx + 1;
		while (endIdx < lines.length && !lines[endIdx].startsWith('## ')) endIdx++;
		lines.splice(headerIdx, endIdx - headerIdx, ...newSection);
		await writeFile(statePath(), updateDate(lines.join('\n'), today), 'utf-8');
	}

	return { ids: newIds, week, year, added, max_reached: false };
}

function updateDate(raw: string, date: string): string {
	return raw.replace(/^(updated:\s*)(.+)$/m, `$1${date}`);
}
