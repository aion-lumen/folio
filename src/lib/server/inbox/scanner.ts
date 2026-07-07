import { mkdir, readFile, readdir, rename, writeFile } from 'fs/promises';
import { join } from 'path';
import { getInboxPath } from '../env.js';
import { getImportedIds } from './ledger.js';
import {
	displayTitle,
	parseInboxFile,
	validateDocument,
	validateFrontmatterShape
} from './schema.js';
import type { InboxScanItem, InboxScanResult } from './types.js';

export interface InboxDirs {
	inbox: string;
	rejected: string;
	imported: string;
}

export function resolveInboxDirs(base = getInboxPath()): InboxDirs {
	return {
		inbox: base,
		rejected: join(base, 'rejected'),
		imported: join(base, 'imported')
	};
}

async function ensureInboxDirs(dirs: InboxDirs): Promise<void> {
	await mkdir(dirs.inbox, { recursive: true });
	await mkdir(dirs.rejected, { recursive: true });
	await mkdir(dirs.imported, { recursive: true });
}

async function listPendingFiles(inboxDir: string): Promise<string[]> {
	const entries = await readdir(inboxDir, { withFileTypes: true });
	return entries
		.filter((e) => e.isFile() && e.name.endsWith('.md'))
		.map((e) => e.name)
		.sort();
}

async function rejectFile(
	dirs: InboxDirs,
	filename: string,
	reason: string
): Promise<void> {
	const src = join(dirs.inbox, filename);
	const dest = join(dirs.rejected, filename);
	const reasonPath = join(dirs.rejected, `${filename}.reason.txt`);
	await rename(src, dest);
	await writeFile(reasonPath, `${reason}\n`, 'utf-8');
}

/** Count .md files in inbox root (for Heute hub badge, no full validation). */
export async function countPendingInbox(base = getInboxPath()): Promise<number> {
	try {
		return (await listPendingFiles(base)).length;
	} catch {
		return 0;
	}
}

export async function scanInbox(
	dirs: InboxDirs = resolveInboxDirs(),
	ledgerPath?: string
): Promise<InboxScanResult> {
	await ensureInboxDirs(dirs);
	const importedIds = await getImportedIds(ledgerPath);
	const filenames = await listPendingFiles(dirs.inbox);
	const items: InboxScanItem[] = [];
	const byType: Record<string, number> = {};

	for (const filename of filenames) {
		const raw = await readFile(join(dirs.inbox, filename), 'utf-8');
		let doc;
		try {
			doc = parseInboxFile(filename, raw);
		} catch {
			await rejectFile(dirs, filename, 'invalid markdown/frontmatter parse');
			items.push({
				filename,
				id: null,
				type: null,
				target: null,
				title: null,
				status: 'invalid',
				error: 'invalid markdown/frontmatter parse'
			});
			continue;
		}

		const shape = validateFrontmatterShape(
			doc.frontmatter as unknown as Record<string, unknown>
		);
		if (!shape.ok) {
			await rejectFile(dirs, filename, shape.error);
			items.push({
				filename,
				id: null,
				type: null,
				target: null,
				title: null,
				status: 'invalid',
				error: shape.error
			});
			continue;
		}

		const fm = shape.data;
		if (importedIds.has(fm.id)) {
			items.push({
				filename,
				id: fm.id,
				type: fm.type,
				target: fm.target,
				title: displayTitle({ ...doc, frontmatter: fm }),
				status: 'duplicate',
				error: `duplicate id already imported: ${fm.id}`
			});
			continue;
		}

		const valid = await validateDocument({ ...doc, frontmatter: fm });
		if (!valid.ok) {
			await rejectFile(dirs, filename, valid.error);
			items.push({
				filename,
				id: fm.id,
				type: fm.type,
				target: fm.target,
				title: displayTitle({ ...doc, frontmatter: fm }),
				status: 'invalid',
				error: valid.error
			});
			continue;
		}

		byType[fm.type] = (byType[fm.type] ?? 0) + 1;
		items.push({
			filename,
			id: fm.id,
			type: fm.type,
			target: fm.target,
			title: displayTitle({ ...doc, frontmatter: fm }),
			status: 'valid',
			error: null
		});
	}

	const valid = items.filter((i) => i.status === 'valid').length;
	const invalid = items.filter((i) => i.status === 'invalid').length;
	const duplicate = items.filter((i) => i.status === 'duplicate').length;

	return {
		pending: filenames.length,
		valid,
		invalid,
		duplicate,
		items,
		byType
	};
}
