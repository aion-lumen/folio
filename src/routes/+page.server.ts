// F.9 Block-4 — Heute-Hub Server-Load.
// Aggregiert minimal über alle Module: feedback-Counts, letzter Worker-Run.
// Vault-Daten kommen aus parent +layout.server.ts (vaultName) — kein eigenes Vault-Read,
// damit Heute auch ohne Vault-Setup lädt.

import { access } from 'fs/promises';
import { join } from 'path';
import { getVaultPath } from '$lib/server/env.js';
import { getFeedbackRows } from '$lib/server/feedback/reader.js';
import { getReviewedIds, listRecentWorkerRuns } from '$lib/server/folio-db/reader.js';
import type { PageServerLoad } from './$types.js';

async function vaultExists(): Promise<boolean> {
	try {
		await access(join(getVaultPath(), '_campaign', 'campaign.md'));
		return true;
	} catch {
		return false;
	}
}

export const load: PageServerLoad = async () => {
	const vaultPresent = await vaultExists();

	// Mail-Counts (alle Accounts) — robustes Fallback bei feedback.db-Fehler.
	let mailTotal = 0;
	let mailUnreviewed = 0;
	let unreviewedByAccount: Record<string, number> = {};
	try {
		const rows = getFeedbackRows({ limit: 5000 });
		const reviewedIds = getReviewedIds();
		mailTotal = rows.length;
		for (const r of rows) {
			if (!reviewedIds.has(r.id)) {
				mailUnreviewed++;
				const acct = r.account_id ?? 'yahoo';
				unreviewedByAccount[acct] = (unreviewedByAccount[acct] ?? 0) + 1;
			}
		}
	} catch {
		// feedback.db nicht erreichbar — Defaults bleiben 0.
	}

	// Pipeline: neuester Worker-Run für Status-Hint.
	let lastRun: ReturnType<typeof listRecentWorkerRuns>[number] | null = null;
	try {
		const recent = listRecentWorkerRuns(1);
		lastRun = recent[0] ?? null;
	} catch {
		// folio.db nicht initialisiert — Defaults bleiben null.
	}

	return {
		vaultPresent,
		mail: {
			total: mailTotal,
			unreviewed: mailUnreviewed,
			unreviewedByAccount
		},
		lastRun
	};
};
