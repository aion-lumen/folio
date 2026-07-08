// Lead TTL: archive pending leads whose deadline has passed (and were never
// committed to an objective). Mirrors the commit.ts rename-to-imported pattern
// and records a ledger entry. Best-effort — callers wrap in try/catch.

import { rename } from 'fs/promises';
import { join } from 'path';
import { recordImport } from './ledger.js';
import { resolveInboxDirs, scanInbox, type InboxDirs } from './scanner.js';

/**
 * Move expired pending leads (deadline < today, still in inbox) to the imported
 * dir and record a `lead-expired` ledger entry. Returns the number archived.
 */
export async function archiveExpiredLeads(
	dirs: InboxDirs = resolveInboxDirs(),
	ledgerPath?: string,
	now: Date = new Date()
): Promise<number> {
	const scan = await scanInbox(dirs, ledgerPath);
	const startOfToday = new Date(now);
	startOfToday.setHours(0, 0, 0, 0);

	let archived = 0;
	for (const item of scan.items) {
		if (item.type !== 'lead' || item.status !== 'valid' || !item.deadline) continue;
		const dl = new Date(item.deadline);
		if (Number.isNaN(dl.getTime()) || dl >= startOfToday) continue;

		const ts = now.toISOString().replace(/[:.]/g, '-');
		await rename(
			join(dirs.inbox, item.filename),
			join(dirs.imported, `${ts}-expired-${item.filename}`)
		);
		await recordImport(
			{
				id: item.id ?? item.filename,
				filename: item.filename,
				type: 'lead-expired',
				target: item.target ?? 'current'
			},
			ledgerPath
		);
		archived++;
	}
	return archived;
}
