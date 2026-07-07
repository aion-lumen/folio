import { readFile, rename } from 'fs/promises';
import { join } from 'path';
import { createObjective } from '../vault/writer.js';
import { recordImport } from '../inbox/ledger.js';
import { parseInboxFile } from '../inbox/schema.js';
import type { InboxDirs } from '../inbox/scanner.js';
import type { TriageAssessment, TriageCommitItem } from './types.js';

export async function commitTriageObjective(
	dirs: InboxDirs,
	filename: string,
	assessment: TriageAssessment,
	ledgerPath?: string
): Promise<TriageCommitItem> {
	const path = join(dirs.inbox, filename);
	let raw: string;
	try {
		raw = await readFile(path, 'utf-8');
	} catch {
		return { filename, id: filename, ok: false, message: 'file not found in inbox' };
	}

	const doc = parseInboxFile(filename, raw);
	const fm = doc.frontmatter;
	const chapterSlug = assessment.chapter_slug;
	const proposal = assessment.objective;

	if (!chapterSlug || !proposal) {
		return { filename, id: fm.id, ok: false, message: 'missing chapter_slug or objective proposal' };
	}

	try {
		const objectiveId = await createObjective(chapterSlug, {
			title: proposal.title,
			threshold: proposal.threshold,
			weight: proposal.weight,
			related_goals: proposal.related_goals,
			deadline: proposal.deadline,
			historyNote: `created via inbox-triage from import ${fm.id}`
		});

		const ts = new Date().toISOString().replace(/[:.]/g, '-');
		const archived = join(dirs.imported, `${ts}-${filename}`);
		await rename(path, archived);

		await recordImport(
			{
				id: fm.id,
				filename,
				type: 'objective-created',
				target: objectiveId
			},
			ledgerPath
		);

		return {
			filename,
			id: fm.id,
			ok: true,
			message: `auto-created objective ${objectiveId} in ${chapterSlug}`,
			objective_id: objectiveId
		};
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		return { filename, id: fm.id, ok: false, message: msg };
	}
}
