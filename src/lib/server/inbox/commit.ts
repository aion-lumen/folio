import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import { join } from 'path';
import matter from 'gray-matter';
import { getVaultPath } from '../env.js';
import { updateObjective, createObjective } from '../vault/writer.js';
import { loadCampaign, loadActiveChapter } from '../vault/reader.js';
import type { ObjectiveStatus } from '$lib/types/campaign.js';
import { isImportedId, recordImport } from './ledger.js';
import { normalizeDeadline, parseInboxFile, validateDocument, validateFrontmatterShape } from './schema.js';
import { resolveInboxDirs, type InboxDirs } from './scanner.js';
import type { CommitResult, CommitResultItem, FolioImportFrontmatter } from './types.js';

async function atomicWriteVault(path: string, content: string): Promise<void> {
	await mkdir(join(path, '..'), { recursive: true });
	const tmp = `${path}.tmp`;
	await writeFile(tmp, content, 'utf-8');
	await rename(tmp, path);
}

function buildVaultMarkdown(fm: FolioImportFrontmatter, body: string): string {
	const { patch: _patch, ...rest } = fm;
	return matter.stringify(body, rest);
}

async function commitObjectiveUpdate(fm: FolioImportFrontmatter): Promise<void> {
	const patch = fm.patch ?? {};
	await updateObjective(fm.target, {
		status: patch.status as ObjectiveStatus | undefined,
		progress_note: patch.progress_note,
		deadline: patch.deadline
	});
}

async function commitMarkdownFile(
	subdir: 'fieldnotes' | 'imports',
	fm: FolioImportFrontmatter,
	body: string
): Promise<void> {
	const dest = join(getVaultPath(), 'internal', subdir, `${fm.id}.md`);
	await atomicWriteVault(dest, buildVaultMarkdown(fm, body));
}

/**
 * Commit a lead as a new objective in the current chapter (deterministic, no LLM).
 * `target: 'current'` (the emitter sentinel) resolves to the active chapter at
 * commit time; an explicit target is used as the chapter slug. Leads always reach
 * this path via manual review — the trust gate blocks any auto-commit.
 */
async function commitLead(fm: FolioImportFrontmatter): Promise<string> {
	let slug: string | null;
	if (fm.target && fm.target !== 'current') {
		slug = fm.target;
	} else {
		const campaign = await loadCampaign();
		const active = await loadActiveChapter(campaign.current_chapter);
		slug = active?.slug ?? null;
	}
	if (!slug) throw new Error('no active chapter to attach lead');
	const deadline = normalizeDeadline(fm.deadline);
	return createObjective(slug, {
		title: `Lead: ${fm.rolle ?? '?'} @ ${fm.quelle ?? '?'}`,
		threshold: `Bewerbung abgeschickt${deadline ? ` bis ${deadline}` : ''}`,
		weight: 1,
		related_goals: [],
		deadline,
		historyNote: `created from lead ${fm.id}`
	});
}

async function commitOne(
	dirs: InboxDirs,
	filename: string,
	ledgerPath?: string
): Promise<CommitResultItem> {
	const path = join(dirs.inbox, filename);
	let raw: string;
	try {
		raw = await readFile(path, 'utf-8');
	} catch {
		return { id: filename, filename, ok: false, message: 'file not found in inbox' };
	}

	const doc = parseInboxFile(filename, raw);
	const shape = validateFrontmatterShape(doc.frontmatter as unknown as Record<string, unknown>);
	if (!shape.ok) {
		return { id: filename, filename, ok: false, message: shape.error };
	}
	const fm = shape.data;

	if (await isImportedId(fm.id, ledgerPath)) {
		return { id: fm.id, filename, ok: false, message: `duplicate id already imported: ${fm.id}` };
	}

	const valid = await validateDocument({ ...doc, frontmatter: fm });
	if (!valid.ok) {
		return { id: fm.id, filename, ok: false, message: valid.error };
	}

	try {
		switch (fm.type) {
			case 'objective-update':
				await commitObjectiveUpdate(fm);
				break;
			case 'field-note':
				await commitMarkdownFile('fieldnotes', fm, doc.body);
				break;
			case 'directive':
			case 'note':
				await commitMarkdownFile('imports', fm, doc.body);
				break;
			case 'lead':
				await commitLead(fm);
				break;
		}
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		return { id: fm.id, filename, ok: false, message: msg };
	}

	const ts = new Date().toISOString().replace(/[:.]/g, '-');
	const archived = join(dirs.imported, `${ts}-${filename}`);
	await rename(path, archived);

	await recordImport(
		{
			id: fm.id,
			filename,
			type: fm.type,
			target: fm.target
		},
		ledgerPath
	);

	return { id: fm.id, filename, ok: true, message: `committed ${fm.type} → ${fm.target}` };
}

export async function commitInboxItems(
	filenames: string[],
	dirs: InboxDirs = resolveInboxDirs(),
	ledgerPath?: string
): Promise<CommitResult> {
	const committed: CommitResultItem[] = [];
	const skipped: CommitResultItem[] = [];

	for (const filename of filenames) {
		const result = await commitOne(dirs, filename, ledgerPath);
		if (result.ok) committed.push(result);
		else skipped.push(result);
	}

	return { committed, skipped };
}

/** Commit all valid pending items (used when user confirms import all). */
export async function commitAllValid(
	validFilenames: string[],
	dirs: InboxDirs = resolveInboxDirs(),
	ledgerPath?: string
): Promise<CommitResult> {
	return commitInboxItems(validFilenames, dirs, ledgerPath);
}
