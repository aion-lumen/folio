// F.3 — feedback.db Read-Only Reader.
// WAL-mode aware (Architekt-aktiviert vor F.3-Code-Start).
// Worker (production_worker.py) owns the DB. Folio is read-only consumer.

import Database from 'better-sqlite3';
import { getFeedbackDbPath } from '../env.js';
import type { FeedbackRow, FeedbackFilter, FeedbackCounts } from './types.js';

let _conn: Database.Database | null = null;
let _connPath: string | null = null;

function getConn(): Database.Database {
	const path = getFeedbackDbPath();
	// Reopen when the resolved path changes (e.g. vault switch real↔demo) — the mail
	// store is vault-scoped, so a cached connection to the old DB must not linger.
	if (_conn && _connPath === path) return _conn;
	if (_conn) _conn.close();
	_conn = new Database(path, { readonly: true, fileMustExist: true });
	_connPath = path;
	// Verify WAL is on (sanity for concurrent worker-writes)
	const mode = _conn.pragma('journal_mode', { simple: true });
	if (mode !== 'wal') {
		console.warn(`[feedback/reader] journal_mode=${mode} (expected 'wal'). Concurrent reads may block on writes.`);
	}
	return _conn;
}

function buildWhere(filter: FeedbackFilter): { sql: string; params: unknown[] } {
	const where: string[] = [];
	const params: unknown[] = [];
	if (filter.userFinalAction) {
		where.push('user_final_action = ?');
		params.push(filter.userFinalAction);
	}
	if (filter.heuristicAction) {
		where.push('heuristic_suggested_action = ?');
		params.push(filter.heuristicAction);
	}
	if (filter.pluginValue) {
		where.push('plugin_value = ?');
		params.push(filter.pluginValue);
	}
	if (filter.senderDomain) {
		where.push('sender LIKE ?');
		params.push(`%@%${filter.senderDomain}%`);
	}
	if (filter.disagreementOnly) {
		where.push('(suggested_action_confirmed = 0 OR user_final_action != heuristic_suggested_action)');
	}
	if (filter.dateFrom) {
		where.push('created_at >= ?');
		params.push(filter.dateFrom);
	}
	if (filter.dateTo) {
		where.push('created_at <= ?');
		params.push(filter.dateTo);
	}
	return {
		sql: where.length ? `WHERE ${where.join(' AND ')}` : '',
		params
	};
}

export function getFeedbackRows(filter: FeedbackFilter = {}): FeedbackRow[] {
	const db = getConn();
	const { sql, params } = buildWhere(filter);
	const limit = filter.limit ?? 200;
	const offset = filter.offset ?? 0;
	const stmt = db.prepare(`SELECT * FROM feedback ${sql} ORDER BY created_at DESC LIMIT ? OFFSET ?`);
	return stmt.all(...params, limit, offset) as FeedbackRow[];
}

export function getFeedbackRowById(id: number): FeedbackRow | null {
	const row = getConn().prepare('SELECT * FROM feedback WHERE id = ?').get(id) as FeedbackRow | undefined;
	return row ?? null;
}

export function getFeedbackCounts(): FeedbackCounts {
	const db = getConn();
	const byUserFinalAction: Record<string, number> = {};
	const byHeuristicAction: Record<string, number> = {};
	const totalRow = db.prepare('SELECT COUNT(*) AS n FROM feedback').get() as { n: number };
	const ufaRows = db
		.prepare('SELECT user_final_action AS k, COUNT(*) AS n FROM feedback GROUP BY user_final_action')
		.all() as Array<{ k: string | null; n: number }>;
	for (const r of ufaRows) byUserFinalAction[r.k ?? 'null'] = r.n;
	const hsaRows = db
		.prepare('SELECT heuristic_suggested_action AS k, COUNT(*) AS n FROM feedback GROUP BY heuristic_suggested_action')
		.all() as Array<{ k: string | null; n: number }>;
	for (const r of hsaRows) byHeuristicAction[r.k ?? 'null'] = r.n;
	return { byUserFinalAction, byHeuristicAction, total: totalRow.n };
}

// 2026-06-05 (B4): Helper fuer Council-Detail-Distance — liest
// heuristic_markers fuer eine feedback_id (JSON-Array-Spalte).
// Council-Object hat from_feedback_ids → erste id → diese Funktion.
export function getHeuristicMarkersForFeedbackId(feedbackId: number): string[] {
	const conn = getConn();
	const row = conn
		.prepare('SELECT heuristic_markers FROM feedback WHERE id = ?')
		.get(feedbackId) as { heuristic_markers: string | null } | undefined;
	if (!row || !row.heuristic_markers) return [];
	try {
		const parsed = JSON.parse(row.heuristic_markers);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

// 2026-06-08 Bauteil 2.7 (Aufgabe 1): Batch-lookup fuer Kampagne-Karten.
// Liefert nur die Felder die fuer die Mail-Brueckenlinks gebraucht werden
// (subject + sender + account_id). Wird mit einer kleinen Anzahl IDs
// aufgerufen (1-3 pro Workflow); IN(?,?,...) ist OK fuer diese Skala.
export interface FeedbackBrief {
	id: number;
	subject: string;
	sender: string;
	account_id: string | null;
	mail_date: string | null;
}
export function getFeedbackBriefsByIds(ids: number[]): Map<number, FeedbackBrief> {
	const out = new Map<number, FeedbackBrief>();
	if (ids.length === 0) return out;
	const placeholders = ids.map(() => '?').join(',');
	const rows = getConn()
		.prepare(
			`SELECT id, subject, sender, account_id, mail_date
			 FROM feedback WHERE id IN (${placeholders})`
		)
		.all(...ids) as FeedbackBrief[];
	for (const r of rows) out.set(r.id, r);
	return out;
}

export function getDisagreementRows(limit = 50): FeedbackRow[] {
	return getFeedbackRows({ disagreementOnly: true, limit });
}
