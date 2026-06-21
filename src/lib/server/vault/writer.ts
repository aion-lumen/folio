import { readFile, writeFile, rename, mkdir, readdir } from 'fs/promises';
import { join } from 'path';
import matter from 'gray-matter';
import { getVaultPath } from '../env.js';
import type { ObjectiveStatus } from '$lib/types/campaign.js';

export interface ObjectivePatch {
	status?: ObjectiveStatus;
	progress_note?: string;
	deadline?: string;
}

function chaptersDir() {
	return join(getVaultPath(), '_campaign', 'chapters');
}

async function atomicWrite(path: string, content: string): Promise<void> {
	const backupDir = join(
		process.env.HOME ?? '/home/mirha',
		'.local/share/folio/backups'
	);
	await mkdir(backupDir, { recursive: true });

	// Backup: keep max 50
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	const filename = path.split('/').pop() ?? 'file.md';
	try {
		const existing = await readFile(path, 'utf-8');
		const backups = await import('fs').then((m) => {
			try {
				return m.readdirSync(backupDir)
					.filter((f: string) => f.startsWith(filename))
					.sort()
					.reverse();
			} catch {
				return [];
			}
		});
		if (backups.length >= 50) {
			const toDelete = backups.slice(49);
			for (const b of toDelete) {
				await import('fs/promises').then((m) => m.unlink(join(backupDir, b as string)));
			}
		}
		await writeFile(join(backupDir, `${filename}.${timestamp}.bak`), existing, 'utf-8');
	} catch {
		// no existing file to back up
	}

	const tmp = `${path}.tmp`;
	await writeFile(tmp, content, 'utf-8');
	await rename(tmp, path);
}

export async function updateObjectiveStatus(
	slug: string,
	objectiveId: string,
	newStatus: ObjectiveStatus
): Promise<void> {
	const filePath = join(chaptersDir(), `${slug}.md`);
	const raw = await readFile(filePath, 'utf-8');
	const parsed = matter(raw);

	// Update the status line within the objective section
	const objRegex = new RegExp(
		`(###\\s+${objectiveId}:[\\s\\S]*?- \\*\\*status:\\*\\*\\s*)([^\\n]+)`,
		'm'
	);
	const updated = raw.replace(objRegex, `$1${newStatus}`);

	if (updated === raw) {
		throw new Error(`Objective ${objectiveId} not found in ${slug}`);
	}

	await atomicWrite(filePath, updated);
}

async function findChapterFileForObjective(objectiveId: string): Promise<string> {
	const match = objectiveId.match(/^obj-(\d+[a-z]?)-/);
	if (!match) throw new Error(`Invalid objective id: ${objectiveId}`);
	const chapterNum = match[1];
	const dir = chaptersDir();
	const files = await readdir(dir);
	const candidates = files.filter((f) => f.startsWith(chapterNum) && f.endsWith('.md'));
	if (candidates.length === 0) throw new Error(`No chapter file found for ${objectiveId}`);
	if (candidates.length === 1) return join(dir, candidates[0]);
	for (const candidate of candidates) {
		const content = await readFile(join(dir, candidate), 'utf-8');
		if (content.includes(`### ${objectiveId}:`)) return join(dir, candidate);
	}
	throw new Error(`Objective ${objectiveId} not found in any chapter file`);
}

function replaceOrInsertField(block: string, field: string, value: string): string {
	const regex = new RegExp(`(- \\*\\*${field}:\\*\\*\\s*)([^\\n]*)`, 'm');
	if (regex.test(block)) return block.replace(regex, `- **${field}:** ${value}`);
	// Insert after status line
	return block.replace(/(- \*\*status:\*\*[^\n]*\n)/, `$1- **${field}:** ${value}\n`);
}

function removeField(block: string, field: string): string {
	return block.replace(new RegExp(`\\n- \\*\\*${field}:\\*\\*[^\\n]*`, 'm'), '');
}

function appendHistoryEntry(block: string, entry: string): string {
	const historyRegex = /(\n- \*\*history:\*\*\n)((?:\s+- [^\n]+\n?)*)/;
	if (historyRegex.test(block)) {
		return block.replace(historyRegex, `$1$2  - ${entry}\n`);
	}
	// No history section yet — append before end of block (before next related_goals or at end)
	return block.trimEnd() + `\n- **history:**\n  - ${entry}\n`;
}

export async function updateObjective(objectiveId: string, patch: ObjectivePatch): Promise<void> {
	const filePath = await findChapterFileForObjective(objectiveId);
	let raw = await readFile(filePath, 'utf-8');

	// Extract the objective block
	const blockRegex = new RegExp(`(###\\s+${objectiveId}:[\\s\\S]*?)(?=\\n###\\s+obj-|\\n## |$)`);
	const blockMatch = raw.match(blockRegex);
	if (!blockMatch) throw new Error(`Objective ${objectiveId} not found in ${filePath}`);

	let block = blockMatch[1];
	const origBlock = block;
	const historyParts: string[] = [];
	const now = new Date().toISOString().slice(0, 16);

	if (patch.status !== undefined) {
		// Read old status for history
		const oldStatusMatch = block.match(/- \*\*status:\*\*\s*([^\n]+)/);
		const oldStatus = oldStatusMatch ? oldStatusMatch[1].trim() : 'unknown';
		if (oldStatus !== patch.status) {
			block = replaceOrInsertField(block, 'status', patch.status);
			historyParts.push(`status: ${oldStatus} → ${patch.status}`);
		}
		if (patch.status === 'done') {
			const completedAt = new Date().toISOString().slice(0, 10);
			block = replaceOrInsertField(block, 'completed_at', completedAt);
		} else {
			block = removeField(block, 'completed_at');
		}
	}

	if (patch.deadline !== undefined) {
		if (patch.deadline) {
			block = replaceOrInsertField(block, 'deadline', patch.deadline);
			historyParts.push(`deadline: ${patch.deadline}`);
		} else {
			block = removeField(block, 'deadline');
		}
	}

	if (patch.progress_note !== undefined) {
		if (patch.progress_note) {
			const escaped = `"${patch.progress_note.replace(/"/g, "'")}"`;
			block = replaceOrInsertField(block, 'progress_note', escaped);
			historyParts.push(`note aktualisiert`);
		} else {
			block = removeField(block, 'progress_note');
		}
	}

	if (historyParts.length > 0) {
		const entry = `${now}: ${historyParts.join('; ')}`;
		block = appendHistoryEntry(block, entry);
	}

	if (block === origBlock) return;

	raw = raw.replace(origBlock, block);

	// Update frontmatter updated date
	const today = new Date().toISOString().slice(0, 10);
	raw = raw.replace(/^(updated:\s*)(.+)$/m, `$1${today}`);

	await atomicWrite(filePath, raw);
}

export async function updateChapterProgress(slug: string, progress: number): Promise<void> {
	const filePath = join(chaptersDir(), `${slug}.md`);
	const raw = await readFile(filePath, 'utf-8');
	const parsed = matter(raw);

	const clamped = Math.max(0, Math.min(1, progress));
	parsed.data.progress = Math.round(clamped * 100) / 100;

	const updated = matter.stringify(parsed.content, parsed.data);
	await atomicWrite(filePath, updated);
}
