// F.5 — Read-helpers für corrections. Latest-per-feedback_id picks via MAX(corrected_at).
// F.7 — Plus Worker-Run-History, Review-State-Map, Validator-Opinion-Map.

import { getFolioDb } from './init.js';
import type {
	CorrectionRow,
	WorkerRunRow,
	ReviewStateRow,
	ValidatorOpinionRow,
	UserRow,
	HauskaufWorkflowRow,
	ObjectStatusOverrideRow,
	MailActionabilityOverrideRow,
	PendingIngestRow,
	CouncilStatusTagAll,
	ObjectNoteRow,
	WorkerRunLogRow,
	WorkerRunSummaryRow,
	PipelineRunRow
} from './types.js';
import {
	resolveEffectiveSubstance,
	resolveEffectiveSubstanceMap
} from '../council-db/cluster-substance.js';
import {
	listRecentCouncilRuns,
	getCouncilRunByUuid,
	getCouncilRunLogs,
	getCouncilRunSummary
} from '../council-db/reader.js';

export function listCorrections(limit = 5000): CorrectionRow[] {
	return getFolioDb()
		.prepare('SELECT * FROM corrections ORDER BY corrected_at DESC LIMIT ?')
		.all(limit) as CorrectionRow[];
}

export function getLatestCorrectionForFeedback(feedbackId: number): CorrectionRow | null {
	const row = getFolioDb()
		.prepare(
			`SELECT * FROM corrections
			 WHERE feedback_id = ?
			 ORDER BY corrected_at DESC
			 LIMIT 1`
		)
		.get(feedbackId) as CorrectionRow | undefined;
	return row ?? null;
}

/**
 * Returns Map<feedback_id, latest-CorrectionRow> for efficient in-memory JOIN
 * in +page.server.ts. Iterates all corrections once, keeps newest per feedback_id.
 */
// F.7 — Worker-Run-History (Top N most-recent).
export function listRecentWorkerRuns(limit = 20): WorkerRunRow[] {
	return getFolioDb()
		.prepare('SELECT * FROM worker_runs ORDER BY started_at DESC LIMIT ?')
		.all(limit) as WorkerRunRow[];
}

export function getWorkerRunByUuid(uuid: string): WorkerRunRow | null {
	const r = getFolioDb()
		.prepare('SELECT * FROM worker_runs WHERE run_uuid = ?')
		.get(uuid) as WorkerRunRow | undefined;
	return r ?? null;
}

export function getActiveWorkerRun(): WorkerRunRow | null {
	const r = getFolioDb()
		.prepare("SELECT * FROM worker_runs WHERE status = 'running' ORDER BY started_at DESC LIMIT 1")
		.get() as WorkerRunRow | undefined;
	return r ?? null;
}

// 2026-06-07 Pre-Bauteil Pipeline-Persistenz: Per-Mail-Log-Reader.
// Wird beim Aufklappen eines Run-Eintrags im Pipeline-UI gerufen.
export function getWorkerRunLogs(uuid: string): WorkerRunLogRow[] {
	try {
		return getFolioDb()
			.prepare(
				'SELECT * FROM worker_run_logs WHERE run_uuid = ? ORDER BY seq ASC'
			)
			.all(uuid) as WorkerRunLogRow[];
	} catch {
		return [];
	}
}

export function getWorkerRunSummary(uuid: string): WorkerRunSummaryRow | null {
	try {
		const row = getFolioDb()
			.prepare('SELECT * FROM worker_run_summary WHERE run_uuid = ?')
			.get(uuid) as WorkerRunSummaryRow | undefined;
		return row ?? null;
	} catch {
		return null;
	}
}

/** Classified mail_ids eines beendeten Worker-Runs (für Auto-Validator-Handoff). */
export function getClassifiedMailIdsForRun(runUuid: string): number[] {
	try {
		const rows = getFolioDb()
			.prepare(
				`SELECT mail_id FROM worker_run_logs
				 WHERE run_uuid = ? AND event_type = 'classified' AND mail_id IS NOT NULL
				 ORDER BY seq ASC`
			)
			.all(runUuid) as { mail_id: number }[];
		return rows.map((r) => r.mail_id);
	} catch {
		return [];
	}
}

function workerRunToPipelineRow(r: WorkerRunRow): PipelineRunRow {
	return {
		run_uuid: r.run_uuid,
		parent_run_uuid: r.parent_run_uuid ?? null,
		source: 'mail',
		run_type: r.mode,
		started_at: r.started_at,
		ended_at: r.ended_at,
		status: r.status,
		n_processed: r.mails_processed,
		summary: getWorkerRunSummary(r.run_uuid)
	};
}

// 2026-06-07 Pre-Bauteil: einheitliche Pipeline-Verlauf-Liste.
// Joinet folio.db.worker_runs (+summary) mit council.db.council_runs
// (+summary) cross-DB read. Ergebnis sortiert nach started_at DESC.
// Per-Item summary ist null wenn Run noch laeuft (kein write_summary).
export function listRecentPipelineRuns(limit = 30): PipelineRunRow[] {
	const out: PipelineRunRow[] = [];

	// mail-side — Kind-Runs (parent_run_uuid) unter Parent gruppieren
	const mailRuns = listRecentWorkerRuns(limit * 3);
	const childByParent = new Map<string, PipelineRunRow[]>();
	const mailRoots: PipelineRunRow[] = [];
	for (const r of mailRuns) {
		const row = workerRunToPipelineRow(r);
		if (r.parent_run_uuid) {
			const arr = childByParent.get(r.parent_run_uuid) ?? [];
			arr.push(row);
			childByParent.set(r.parent_run_uuid, arr);
		} else {
			mailRoots.push(row);
		}
	}
	for (const root of mailRoots) {
		const children = childByParent.get(root.run_uuid) ?? [];
		if (children.length > 0) {
			children.sort(
				(a, b) => Date.parse(a.started_at.replace(' ', 'T')) - Date.parse(b.started_at.replace(' ', 'T'))
			);
			root.children = children;
		}
	}
	out.push(...mailRoots);

	// council-side
	const councilRuns = listRecentCouncilRuns(limit);
	for (const r of councilRuns) {
		out.push({
			run_uuid: r.run_uuid,
			source: 'council',
			run_type: r.run_type,
			started_at: r.started_at,
			ended_at: r.ended_at,
			status: r.status,
			n_processed: r.n_processed ?? 0,
			summary: getCouncilRunSummary(r.run_uuid)
		});
	}

	// 2026-06-07 Live-Test-Befund: mail-side schreibt ISO-Format
	// (2026-06-07T22:33:36.208Z, mit 'T'), council-side via SQLite-Default
	// datetime('now') (2026-06-07 22:52:23, mit Leerzeichen). String-Sort
	// würde falsch sortieren ('T' > ' ' im ASCII). → Date.parse mit
	// Format-Normalisierung.
	const parseTs = (s: string): number => Date.parse(s.replace(' ', 'T'));
	out.sort((a, b) => parseTs(b.started_at) - parseTs(a.started_at));
	return out.slice(0, limit);
}

// 2026-06-07 Pre-Bauteil: Detail-Reader fuer aufgeklappten Run.
// Source-Auflösung via run_uuid-Lookup in beiden DBs (mail-side first).
export function getPipelineRunDetail(uuid: string): {
	row: PipelineRunRow | null;
	logs: Array<WorkerRunLogRow | import('./types.js').CouncilRunLogRow>;
} {
	// mail-side
	const mr = getWorkerRunByUuid(uuid);
	if (mr) {
		return {
			row: workerRunToPipelineRow(mr),
			logs: getWorkerRunLogs(mr.run_uuid)
		};
	}
	// council-side
	const cr = getCouncilRunByUuid(uuid);
	if (cr) {
		return {
			row: {
				run_uuid: cr.run_uuid,
				source: 'council',
				run_type: cr.run_type,
				started_at: cr.started_at,
				ended_at: cr.ended_at,
				status: cr.status,
				n_processed: cr.n_processed ?? 0,
				summary: getCouncilRunSummary(cr.run_uuid)
			},
			logs: getCouncilRunLogs(cr.run_uuid)
		};
	}
	return { row: null, logs: [] };
}

// F.7 — Review-State (Set of feedback_ids that are marked reviewed).
export function getReviewedIds(): Set<number> {
	const rows = getFolioDb()
		.prepare('SELECT feedback_id FROM review_state')
		.all() as { feedback_id: number }[];
	return new Set(rows.map((r) => r.feedback_id));
}

// F.7 — Validator-Opinion-Map (latest opinion per feedback_id).
// Note: UNIQUE(feedback_id, validator_model) so we pick most recent model's opinion.
export function getValidatorOpinionMap(): Map<number, ValidatorOpinionRow> {
	const rows = getFolioDb()
		.prepare('SELECT * FROM validator_opinions ORDER BY evaluated_at DESC')
		.all() as ValidatorOpinionRow[];
	const out = new Map<number, ValidatorOpinionRow>();
	for (const r of rows) {
		if (!out.has(r.feedback_id)) {
			out.set(r.feedback_id, r);
		}
	}
	return out;
}

export function listValidatorOpinionsForFeedback(feedbackId: number): ValidatorOpinionRow[] {
	return getFolioDb()
		.prepare(
			'SELECT * FROM validator_opinions WHERE feedback_id = ? ORDER BY evaluated_at DESC'
		)
		.all(feedbackId) as ValidatorOpinionRow[];
}

/**
 * Multi-model variant of getValidatorOpinionMap: returns ALL opinions per
 * feedback_id grouped into a Map. Used by the Stimmen-Streifen page-loader
 * to render the multi-lens UI (Direktive lens-ui-2026-05-26 §2.1).
 * Single-query, in-memory group-by for O(N) over all opinions.
 */
export function getValidatorOpinionsMap(): Map<number, ValidatorOpinionRow[]> {
	const rows = getFolioDb()
		.prepare('SELECT * FROM validator_opinions ORDER BY evaluated_at DESC')
		.all() as ValidatorOpinionRow[];
	const out = new Map<number, ValidatorOpinionRow[]>();
	for (const r of rows) {
		const arr = out.get(r.feedback_id);
		if (arr) arr.push(r);
		else out.set(r.feedback_id, [r]);
	}
	return out;
}

export function getLatestCorrectionMap(): Map<number, CorrectionRow> {
	const rows = listCorrections();
	const out = new Map<number, CorrectionRow>();
	// rows are sorted DESC by corrected_at — first occurrence per feedback_id wins.
	for (const r of rows) {
		if (!out.has(r.feedback_id)) {
			out.set(r.feedback_id, r);
		}
	}
	return out;
}

// 2026-06-06 Bauteil 2 (Mail-zu-Council-Uebergang): latest-wins-Map fuer
// User-Overrides auf Mail-actionability. Wird im +page.server.ts vor dem
// time-decay-Fallback gemerged: effective_actionability =
//   mailOverride?.overridden_actionability
//   ?? correction?.corrected_actionability
//   ?? time_decay_fallback.
export function getLatestMailOverrideMap(): Map<number, MailActionabilityOverrideRow> {
	const rows = getFolioDb()
		.prepare(
			'SELECT * FROM mail_actionability_override ORDER BY recorded_at DESC'
		)
		.all() as MailActionabilityOverrideRow[];
	const out = new Map<number, MailActionabilityOverrideRow>();
	for (const r of rows) {
		if (!out.has(r.feedback_id)) {
			out.set(r.feedback_id, r);
		}
	}
	return out;
}

// Mobile 1b (2026-05-30): all users except `selfId`. In the two-user world
// this returns the partner row (or empty array if Frau hasn't logged in yet).
export function listOtherUsers(selfId: number): UserRow[] {
	return getFolioDb()
		.prepare('SELECT * FROM users WHERE id != ? ORDER BY id ASC')
		.all(selfId) as UserRow[];
}

// Mobile-Aufraeumen (2026-05-31): batch lookup for the Verlauf-Feed attribution.
// One query per loader call instead of N per-event roundtrips.
export function getUsersById(ids: number[]): Map<number, UserRow> {
	const out = new Map<number, UserRow>();
	const unique = Array.from(new Set(ids));
	if (unique.length === 0) return out;
	const placeholders = unique.map(() => '?').join(',');
	const rows = getFolioDb()
		.prepare(`SELECT * FROM users WHERE id IN (${placeholders})`)
		.all(...unique) as UserRow[];
	for (const r of rows) out.set(r.id, r);
	return out;
}

// Direktive 6: User-Helper für Auth-Layer (hooks.server.ts).
export function getUserByTailscaleLogin(login: string): UserRow | null {
	const row = getFolioDb()
		.prepare('SELECT * FROM users WHERE tailscale_login = ?')
		.get(login) as UserRow | undefined;
	return row ?? null;
}

export function getDefaultLocalUser(): UserRow {
	const row = getFolioDb()
		.prepare('SELECT * FROM users WHERE id = 1')
		.get() as UserRow | undefined;
	if (!row) {
		// Sollte nie passieren — init.ts macht idempotenten INSERT OR IGNORE.
		throw new Error('Default-User (id=1) fehlt in folio.db.users — Schema-Init übersprungen?');
	}
	return row;
}

/**
 * Auto-anlegen eines Users beim ersten Tailscale-Header-Sichtung.
 * Default-Rolle: `council_member`. Owner-Promotion über direkten DB-Edit
 * oder zukünftiges Admin-UI.
 */
export function upsertUserFromTailscale(login: string, displayName: string): UserRow {
	const existing = getUserByTailscaleLogin(login);
	if (existing) return existing;
	getFolioDb()
		.prepare(
			`INSERT INTO users (tailscale_login, display_name, role)
			 VALUES (?, ?, 'council_member')`
		)
		.run(login, displayName);
	const created = getUserByTailscaleLogin(login);
	if (!created) throw new Error(`upsertUserFromTailscale failed for ${login}`);
	return created;
}

// Mobile 1a (2026-05-30): single most-recent view timestamp for a user.
// Drives the default "since" for the Verlauf-Tab event stream.
export function getLatestViewedAtForUser(userId: number): string | null {
	const row = getFolioDb()
		.prepare(
			'SELECT MAX(last_viewed_at) AS ts FROM object_views WHERE user_id = ?'
		)
		.get(userId) as { ts: string | null } | undefined;
	return row?.ts ?? null;
}

// Bauteil 0 (2026-05-30): per-user view tracking. Map<object_id, last_viewed_at>
// for in-memory merge with cross-DB council reads.
export function getViewedAtForUser(userId: number): Map<string, string> {
	const rows = getFolioDb()
		.prepare('SELECT object_id, last_viewed_at FROM object_views WHERE user_id = ?')
		.all(userId) as { object_id: string; last_viewed_at: string }[];
	const out = new Map<string, string>();
	for (const r of rows) out.set(r.object_id, r.last_viewed_at);
	return out;
}

// Bauteil 0: Set of user_ids that triggered a given object. Drives consensus
// check and "X hat getriggert"-UI-indicator.
export function getTriggerSetForObject(objectId: string): Set<number> {
	const rows = getFolioDb()
		.prepare('SELECT user_id FROM object_triggers WHERE object_id = ?')
		.all(objectId) as { user_id: number }[];
	return new Set(rows.map((r) => r.user_id));
}

// Bauteil 2 (Append-only): latest-wins pro council_object_id.
// Window-Function dedupliziert; (id DESC) als Tie-Breaker bei identischem
// recorded_at-Timestamp.
export function listAllHauskaufWorkflow(): HauskaufWorkflowRow[] {
	return getFolioDb()
		.prepare(`
			SELECT id, council_object_id, status, termin, verhandlungspreis, notes,
			       recorded_at, created_by_user_id
			FROM (
				SELECT *, ROW_NUMBER() OVER (
					PARTITION BY council_object_id
					ORDER BY recorded_at DESC, id DESC
				) AS rn
				FROM hauskauf_workflow
			)
			WHERE rn = 1
			ORDER BY recorded_at DESC
		`)
		.all() as HauskaufWorkflowRow[];
}

// Bauteil-14: Read-through Cluster-Workflow (Detail-Anzeige only — Kanban
// bleibt auf realen Rows, siehe cluster-substance Exclusion-Matrix).
export function getHauskaufWorkflowForObject(
	objectId: string,
	userId = 0
): HauskaufWorkflowRow | null {
	const sub = resolveEffectiveSubstance(objectId, userId);
	return sub?.workflow.value ?? null;
}

// Bauteil 0.5 (2026-05-30): latest override per council_object_id across all
// users. The page-loader merges this with council.objects.status_tag via
// effectiveStatusTag(). Same pattern as getLatestCorrectionMap.
export function getLatestStatusOverrideMap(): Map<string, ObjectStatusOverrideRow> {
	const rows = getFolioDb()
		.prepare('SELECT * FROM object_status_override ORDER BY recorded_at DESC')
		.all() as ObjectStatusOverrideRow[];
	const out = new Map<string, ObjectStatusOverrideRow>();
	for (const r of rows) {
		if (!out.has(r.council_object_id)) out.set(r.council_object_id, r);
	}
	return out;
}

// Bauteil-14: Cluster-aware Status-Merge (own > Bruder > Council).
// Legacy-Signatur beibehalten — override-Argument wird ignoriert; Resolution
// läuft read-through über cluster-substance.
export function effectiveStatusTag(
	councilLastUpdated: string,
	councilStatusTag: CouncilStatusTagAll,
	_override: ObjectStatusOverrideRow | null,
	objectId?: string,
	userId = 0
): {
	status_tag: CouncilStatusTagAll;
	source: 'override' | 'council' | 'inherited';
	reason: string | null;
} {
	if (objectId) {
		const sub = resolveEffectiveSubstance(objectId, userId, {
			id: objectId,
			last_updated: councilLastUpdated,
			status_tag: councilStatusTag as import('../council-db/types.js').CouncilStatusTag
		} as import('../council-db/types.js').CouncilObjectRow);
		if (sub) return sub.status.value;
	}
	if (_override && _override.recorded_at > councilLastUpdated) {
		return {
			status_tag: _override.status_tag,
			source: 'override',
			reason: _override.reason ?? null
		};
	}
	return { status_tag: councilStatusTag, source: 'council', reason: null };
}

// Bauteil 0.5: per-user current top-10. Latest rank per (user_id, object_id),
// rank=0 filtered out. Two-stage select: inner picks MAX(recorded_at) per
// (user, object), outer joins for the rank value at that timestamp.
export function getUserTopRanksFor(userId: number): Map<string, number> {
	const rows = getFolioDb()
		.prepare(
			`SELECT ur.object_id, ur.rank
			 FROM user_rankings ur
			 WHERE ur.user_id = ?
			   AND ur.recorded_at = (
			       SELECT MAX(ur2.recorded_at) FROM user_rankings ur2
			       WHERE ur2.user_id = ur.user_id AND ur2.object_id = ur.object_id
			   )
			   AND ur.rank > 0`
		)
		.all(userId) as { object_id: string; rank: number }[];
	const out = new Map<string, number>();
	for (const r of rows) out.set(r.object_id, r.rank);
	return out;
}

// Bauteil 0.5: all pending_ingest rows (incl. processed). For audit/debug.
export function listPendingIngest(): PendingIngestRow[] {
	return getFolioDb()
		.prepare('SELECT * FROM pending_ingest ORDER BY submitted_at DESC')
		.all() as PendingIngestRow[];
}

// Bauteil 0.5: only unprocessed (processed_at IS NULL). Drives the Mobile
// Pipeline pending-row and the council-worker pull-query.
export function listPendingIngestUnprocessed(): PendingIngestRow[] {
	return getFolioDb()
		.prepare(
			'SELECT * FROM pending_ingest WHERE processed_at IS NULL ORDER BY submitted_at DESC'
		)
		.all() as PendingIngestRow[];
}

// Bauteil-14: Cluster-aware Note (R1–R4). Leere eigene Notiz → null (R3).
export function getLatestNoteFor(userId: number, objectId: string): ObjectNoteRow | null {
	const sub = resolveEffectiveSubstance(objectId, userId);
	if (!sub?.note.value) return null;
	const p = sub.note.provenance;
	return {
		id: 0,
		user_id: userId,
		council_object_id: objectId,
		note_text: sub.note.value,
		source: 'user_action',
		inherited_from_object_id: p.from_object_id ?? null,
		inherited_from_cluster_id: p.cluster_id ?? null,
		recorded_at: ''
	};
}

// Bauteil-14: effektive Notizen — mit objectIds Cluster-Erbe einbeziehen.
export function getLatestNotesMapForUser(
	userId: number,
	objectIds?: string[]
): Map<string, ObjectNoteRow> {
	if (objectIds && objectIds.length > 0) {
		const substance = resolveEffectiveSubstanceMap(objectIds, userId);
		const out = new Map<string, ObjectNoteRow>();
		for (const [oid, sub] of substance) {
			if (!sub.note.value) continue;
			const p = sub.note.provenance;
			out.set(oid, {
				id: 0,
				user_id: userId,
				council_object_id: oid,
				note_text: sub.note.value,
				source: 'user_action',
				inherited_from_object_id: p.from_object_id ?? null,
				inherited_from_cluster_id: p.cluster_id ?? null,
				recorded_at: ''
			});
		}
		return out;
	}
	const rows = getFolioDb()
		.prepare(
			'SELECT * FROM object_notes WHERE user_id = ? ORDER BY recorded_at DESC'
		)
		.all(userId) as ObjectNoteRow[];
	const out = new Map<string, ObjectNoteRow>();
	for (const r of rows) {
		if (out.has(r.council_object_id)) continue;
		if (r.note_text === '') {
			out.set(r.council_object_id, r);
			continue;
		}
		out.set(r.council_object_id, r);
	}
	for (const [k, v] of out) {
		if (v.note_text === '') out.delete(k);
	}
	return out;
}
