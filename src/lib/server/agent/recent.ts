import { readFile } from 'fs/promises';
import { getImportLedgerPath, getTriageLogPath } from '../env.js';
import type { ImportLedger } from '../inbox/ledger.js';

export interface RecentInboxActivity {
	at: string;
	document_id: string;
	filename: string;
	verdict: string;
	confidence: number;
	objective_id: string | null;
	chapter_slug: string | null;
	auto_committed: boolean;
	reasoning: string;
}

export async function getRecentInboxActivity(): Promise<RecentInboxActivity | null> {
	try {
		const raw = await readFile(getTriageLogPath(), 'utf-8');
		const lines = raw.trim().split('\n').filter(Boolean);
		if (lines.length === 0) return null;
		const last = JSON.parse(lines[lines.length - 1]!) as Record<string, unknown>;

		let objectiveId =
			(last.committed_objective_id as string | null | undefined) ??
			(last.auto_committed ? null : null);

		// Ledger is authoritative for committed objective id
		try {
			const ledgerRaw = await readFile(getImportLedgerPath(), 'utf-8');
			const ledger = JSON.parse(ledgerRaw) as ImportLedger;
			const docId = String(last.document_id ?? '');
			const entry = [...ledger.entries].reverse().find((e) => e.id === docId);
			if (entry?.type === 'objective-created') objectiveId = entry.target;
		} catch {
			// no ledger
		}

		return {
			at: String(last.ts ?? ''),
			document_id: String(last.document_id ?? ''),
			filename: String(last.filename ?? ''),
			verdict: String(last.verdict ?? ''),
			confidence: Number(last.confidence ?? 0),
			objective_id: objectiveId,
			chapter_slug: last.chapter_slug ? String(last.chapter_slug) : null,
			auto_committed: Boolean(last.auto_committed) || objectiveId !== null,
			reasoning: String(last.reasoning ?? '')
		};
	} catch {
		return null;
	}
}
