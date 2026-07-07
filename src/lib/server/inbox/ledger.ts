import { mkdir, readFile, writeFile, rename } from 'fs/promises';
import { join } from 'path';
import { getImportLedgerPath } from '../env.js';

export interface LedgerEntry {
	id: string;
	importedAt: string;
	filename: string;
	type: string;
	target: string;
}

export interface ImportLedger {
	version: 1;
	entries: LedgerEntry[];
}

async function readLedger(path = getImportLedgerPath()): Promise<ImportLedger> {
	try {
		const raw = await readFile(path, 'utf-8');
		const parsed = JSON.parse(raw) as ImportLedger;
		if (parsed.version === 1 && Array.isArray(parsed.entries)) return parsed;
	} catch {
		// fresh ledger
	}
	return { version: 1, entries: [] };
}

async function writeLedger(ledger: ImportLedger, path = getImportLedgerPath()): Promise<void> {
	await mkdir(join(path, '..'), { recursive: true });
	const tmp = `${path}.tmp`;
	await writeFile(tmp, JSON.stringify(ledger, null, 2), 'utf-8');
	await rename(tmp, path);
}

export async function isImportedId(id: string, ledgerPath?: string): Promise<boolean> {
	const ledger = await readLedger(ledgerPath);
	return ledger.entries.some((e) => e.id === id);
}

export async function recordImport(
	entry: Omit<LedgerEntry, 'importedAt'> & { importedAt?: string },
	ledgerPath?: string
): Promise<void> {
	const path = ledgerPath ?? getImportLedgerPath();
	const ledger = await readLedger(path);
	if (ledger.entries.some((e) => e.id === entry.id)) return;
	ledger.entries.push({
		...entry,
		importedAt: entry.importedAt ?? new Date().toISOString()
	});
	await writeLedger(ledger, path);
}

export async function getImportedIds(ledgerPath?: string): Promise<Set<string>> {
	const ledger = await readLedger(ledgerPath);
	return new Set(ledger.entries.map((e) => e.id));
}
