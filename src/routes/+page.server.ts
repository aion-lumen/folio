// F.9 Block-4 — Heute-Hub Server-Load.
// Aggregiert minimal über alle Module: feedback-Counts, letzter Worker-Run.
// Vault-Daten kommen aus parent +layout.server.ts (vaultName) — kein eigenes Vault-Read,
// damit Heute auch ohne Vault-Setup lädt.

import { access } from 'fs/promises';
import { join } from 'path';
import { getVaultPath } from '$lib/server/env.js';
import { getFeedbackRows } from '$lib/server/feedback/reader.js';
import { getReviewedIds, listRecentWorkerRuns } from '$lib/server/folio-db/reader.js';
import { countPendingInbox } from '$lib/server/inbox/scanner.js';
import type { FeedbackRow } from '$lib/server/feedback/types.js';
import type { PageServerLoad } from './$types.js';

function startOfTodayLocal(): Date {
	const d = new Date();
	d.setHours(0, 0, 0, 0);
	return d;
}

function parseMailDate(raw: string | null): Date | null {
	if (!raw) return null;
	const iso = Date.parse(raw);
	if (!Number.isNaN(iso)) return new Date(iso);
	// RFC2822 fallback (IMAP Date header)
	const rfc = Date.parse(raw.replace(/ \(.*\)$/, ''));
	return Number.isNaN(rfc) ? null : new Date(rfc);
}

function isToday(row: FeedbackRow): boolean {
	const dt = parseMailDate(row.mail_date) ?? parseMailDate(row.created_at);
	if (!dt) return false;
	return dt >= startOfTodayLocal();
}

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
	let triageTodayByDomain: Record<string, number> = {};
	let triageTodayActionable: Array<{
		domain: string;
		sender: string;
		subject: string;
		actionability: string;
	}> = [];
	try {
		const rows = getFeedbackRows({ limit: 5000 });
		const reviewedIds = getReviewedIds();
		mailTotal = rows.length;
		const todayRows = rows.filter(isToday);
		for (const r of todayRows) {
			const domain = r.domain ?? 'unsorted';
			triageTodayByDomain[domain] = (triageTodayByDomain[domain] ?? 0) + 1;
		}
		triageTodayActionable = todayRows
			.filter((r) => (r.actionability ?? r.effective_actionability) === 'actionable')
			.slice(0, 5)
			.map((r) => ({
				domain: r.domain ?? 'unsorted',
				sender: r.sender,
				subject: r.subject,
				actionability: r.actionability ?? r.effective_actionability ?? 'actionable'
			}));
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

	let inboxPending = 0;
	try {
		inboxPending = await countPendingInbox();
	} catch {
		// inbox path not writable — 0
	}

	return {
		vaultPresent,
		inboxPending,
		mail: {
			total: mailTotal,
			unreviewed: mailUnreviewed,
			unreviewedByAccount,
			triageTodayByDomain,
			triageTodayActionable
		},
		lastRun
	};
};
