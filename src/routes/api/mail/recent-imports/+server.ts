// 2026-05-25 — Recent Worker-Imports endpoint für MailDetailModal.
// Liest aus feedback.db (F.7+ Worker-Pipeline) statt aus Vault-Notes (legacy
// life-mail). User-Feedback Tranche-2: Modal-Liste sollte sich aktualisieren
// nach Worker-Run.

import { json } from '@sveltejs/kit';
import Database from 'better-sqlite3';
import { getFeedbackDbPath } from '$lib/server/env.js';
import type { RequestHandler } from './$types.js';

interface RecentImport {
	t: string;       // formatted time/date
	fr: string;      // sender email
	subj: string;    // subject
	out: 'ok' | 'skip' | 'herm' | 'fail';  // status indicator
	res: string;     // result label (domain · actionability)
}

let _conn: Database.Database | null = null;
function getConn(): Database.Database {
	if (_conn) return _conn;
	_conn = new Database(getFeedbackDbPath(), { readonly: true, fileMustExist: true });
	return _conn;
}

function formatTime(iso: string): string {
	const d = new Date(iso);
	if (isNaN(d.getTime())) return '—';
	const now = new Date();
	const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
	if (diffDays === 0) return d.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
	if (diffDays === 1) return 'gestern';
	return d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit' });
}

function statusFromActionability(act: string | null): 'ok' | 'skip' | 'herm' | 'fail' {
	// Mappt actionability → mm-mail dot color.
	// actionable → ok (grün), archive → skip (grau), archive-silent → skip (grau)
	if (act === 'actionable') return 'ok';
	if (act === 'archive' || act === 'archive-silent') return 'skip';
	return 'herm'; // unbekannt → amber
}

function extractEmail(sender: string): string {
	const m = sender.match(/<([^>]+)>/);
	return m ? m[1] : sender;
}

export const GET: RequestHandler = async ({ url }) => {
	const limit = Math.min(Number(url.searchParams.get('limit') ?? 10), 50);

	try {
		const rows = getConn().prepare(`
			SELECT sender, subject, created_at, domain, effective_actionability, actionability
			FROM feedback
			ORDER BY created_at DESC
			LIMIT ?
		`).all(limit) as Array<{
			sender: string;
			subject: string;
			created_at: string;
			domain: string | null;
			effective_actionability: string | null;
			actionability: string | null;
		}>;

		const out: RecentImport[] = rows.map((r) => {
			const act = r.effective_actionability ?? r.actionability;
			const resLabel = r.domain
				? `${r.domain}${act ? ' · ' + act : ''}`
				: act ?? '—';
			return {
				t: formatTime(r.created_at),
				fr: extractEmail(r.sender),
				subj: r.subject,
				out: statusFromActionability(act),
				res: resLabel
			};
		});

		return json(out);
	} catch (e) {
		console.warn('[api/mail/recent-imports] DB read failed:', e);
		return json([], { status: 200 });
	}
};
