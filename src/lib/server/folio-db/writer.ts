// F.5 — Write-helper für corrections. Append-only (kein UPDATE, kein DELETE).
// F.7 — Plus Worker-Run-Lifecycle, Review-State-UPSERT/DELETE, Validator-Opinion-Insert.

import { getFolioDb } from './init.js';
import type {
	CorrectionRow,
	InsertCorrectionInput,
	WorkerRunRow,
	WorkerRunStatus,
	InsertWorkerRunInput,
	ReviewStateRow,
	ValidatorOpinionRow,
	InsertValidatorOpinionInput,
	ObjectViewRow,
	HauskaufStatus,
	HauskaufVerdict,
	HauskaufWorkflowRow,
	ObjectStatusOverrideRow,
	MailActionabilityOverride,
	MailActionabilityOverrideRow,
	PendingIngestRow,
	CouncilStatusTagAll,
	ObjectNoteRow,
	WorkerRunLogRow,
	WorkerRunSummaryRow,
	UpsertWorkerRunSummaryInput
} from './types.js';

export function insertCorrection(input: InsertCorrectionInput): CorrectionRow {
	const correctedAt = new Date().toISOString();
	// F.8 Block-E: corrected_action wird mit `${domain}/${actionability}` compact-string
	// belegt (Schema-NOT-NULL-Constraint), aber neue 2-axes columns sind primaer.
	const compactAction =
		input.corrected_action ||
		`${input.corrected_domain}/${input.corrected_actionability}`;
	const stmt = getFolioDb().prepare(
		`INSERT INTO corrections
		 (feedback_id, imap_uid, previous_action, corrected_action,
		  corrected_domain, corrected_actionability, note, correction_marker,
		  heuristic_markers_snapshot, source, corrected_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	);
	const result = stmt.run(
		input.feedback_id,
		input.imap_uid,
		input.previous_action,
		compactAction,
		input.corrected_domain,
		input.corrected_actionability,
		input.note,
		input.correction_marker ?? null,
		input.heuristic_markers_snapshot ?? null,
		input.source,
		correctedAt
	);
	const row = getFolioDb()
		.prepare('SELECT * FROM corrections WHERE id = ?')
		.get(result.lastInsertRowid) as CorrectionRow;
	return row;
}

// F.7 — Worker-Run Lifecycle
export function insertWorkerRun(input: InsertWorkerRunInput): WorkerRunRow {
	const result = getFolioDb()
		.prepare(
			`INSERT INTO worker_runs
			 (run_uuid, parent_run_uuid, account, board, mode, tranche_size, pid, status, started_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.run(
			input.run_uuid,
			input.parent_run_uuid ?? null,
			input.account,
			input.board,
			input.mode,
			input.tranche_size,
			input.pid,
			input.status,
			input.started_at
		);
	return getFolioDb()
		.prepare('SELECT * FROM worker_runs WHERE id = ?')
		.get(result.lastInsertRowid) as WorkerRunRow;
}

export function updateWorkerRunStatus(
	runUuid: string,
	status: WorkerRunStatus,
	patch?: { exit_code?: number | null; error_summary?: string | null; mails_processed?: number }
): void {
	const endedAt = ['completed', 'failed', 'cancelled'].includes(status)
		? new Date().toISOString()
		: null;
	getFolioDb()
		.prepare(
			`UPDATE worker_runs
			 SET status = ?,
			     ended_at = COALESCE(?, ended_at),
			     exit_code = COALESCE(?, exit_code),
			     error_summary = COALESCE(?, error_summary),
			     mails_processed = COALESCE(?, mails_processed)
			 WHERE run_uuid = ?`
		)
		.run(
			status,
			endedAt,
			patch?.exit_code ?? null,
			patch?.error_summary ?? null,
			patch?.mails_processed ?? null,
			runUuid
		);
}

// F.7 — Review-State UPSERT (mark reviewed). Idempotent.
export function upsertReviewState(
	feedbackId: number,
	accountId: string,
	imapUid: number,
	source: 'auto-open' | 'manual-toggle'
): ReviewStateRow {
	const now = new Date().toISOString();
	getFolioDb()
		.prepare(
			`INSERT INTO review_state (feedback_id, account_id, imap_uid, reviewed_at, source)
			 VALUES (?, ?, ?, ?, ?)
			 ON CONFLICT(feedback_id) DO UPDATE SET
			   reviewed_at = excluded.reviewed_at,
			   source = excluded.source`
		)
		.run(feedbackId, accountId, imapUid, now, source);
	return getFolioDb()
		.prepare('SELECT * FROM review_state WHERE feedback_id = ?')
		.get(feedbackId) as ReviewStateRow;
}

// F.7 — Review-State DELETE (mark unreviewed). Idempotent.
export function deleteReviewState(feedbackId: number): boolean {
	const result = getFolioDb()
		.prepare('DELETE FROM review_state WHERE feedback_id = ?')
		.run(feedbackId);
	return result.changes > 0;
}

// F.7 + F.8 Block-E — Validator-Opinion Insert (REPLACE on conflict — same model overrides).
export function insertValidatorOpinion(input: InsertValidatorOpinionInput): ValidatorOpinionRow {
	const now = new Date().toISOString();
	getFolioDb()
		.prepare(
			`INSERT INTO validator_opinions
			 (feedback_id, account_id, imap_uid, validator_model, validator_action,
			  validator_domain, validator_actionability,
			  validator_confidence, validator_reasoning, evaluated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT(feedback_id, validator_model) DO UPDATE SET
			   validator_action = excluded.validator_action,
			   validator_domain = excluded.validator_domain,
			   validator_actionability = excluded.validator_actionability,
			   validator_confidence = excluded.validator_confidence,
			   validator_reasoning = excluded.validator_reasoning,
			   evaluated_at = excluded.evaluated_at`
		)
		.run(
			input.feedback_id,
			input.account_id,
			input.imap_uid,
			input.validator_model,
			input.validator_action,
			input.validator_domain,
			input.validator_actionability,
			input.validator_confidence,
			input.validator_reasoning,
			now
		);
	return getFolioDb()
		.prepare(
			'SELECT * FROM validator_opinions WHERE feedback_id = ? AND validator_model = ?'
		)
		.get(input.feedback_id, input.validator_model) as ValidatorOpinionRow;
}

// Bauteil 0 (2026-05-30): UPSERT per-user view timestamp.
export function upsertObjectView(objectId: string, userId: number): ObjectViewRow {
	const now = new Date().toISOString();
	getFolioDb()
		.prepare(
			`INSERT INTO object_views (object_id, user_id, last_viewed_at)
			 VALUES (?, ?, ?)
			 ON CONFLICT(object_id, user_id) DO UPDATE SET
			   last_viewed_at = excluded.last_viewed_at`
		)
		.run(objectId, userId, now);
	return getFolioDb()
		.prepare('SELECT * FROM object_views WHERE object_id = ? AND user_id = ?')
		.get(objectId, userId) as ObjectViewRow;
}

// Bauteil 0 (2026-05-30): atomic trigger + consensus-check + workflow-create.
//
// Race-condition guard: when both users click "antriggern" within a few ms,
// each request must see the other's trigger row before deciding whether
// consensus is reached. Wrapping UPSERT + lookup + conditional INSERT in
// better-sqlite3's db.transaction() serialises them within the process; SQLite's
// WAL lock-manager serialises across processes. Result: at most one
// hauskauf_workflow row per object even under concurrent triggers.
export function triggerObjectAndMaybeCreateWorkflow(
	objectId: string,
	userId: number
): { triggered_by: number[]; workflow_created: boolean } {
	const db = getFolioDb();
	const tx = db.transaction((oid: string, uid: number) => {
		const now = new Date().toISOString();
		db.prepare(
			`INSERT INTO object_triggers (object_id, user_id, triggered_at)
			 VALUES (?, ?, ?)
			 ON CONFLICT(object_id, user_id) DO UPDATE SET
			   triggered_at = excluded.triggered_at`
		).run(oid, uid, now);

		const rows = db
			.prepare('SELECT user_id FROM object_triggers WHERE object_id = ?')
			.all(oid) as { user_id: number }[];
		const userIds = rows.map((r) => r.user_id);

		let workflowCreated = false;
		if (userIds.length >= 2) {
			const result = db
				.prepare(
					`INSERT OR IGNORE INTO hauskauf_workflow
					   (council_object_id, status, created_by_user_id)
					 VALUES (?, 'offen', ?)`
				)
				.run(oid, uid);
			workflowCreated = result.changes > 0;
		}
		return { triggered_by: userIds, workflow_created: workflowCreated };
	});
	return tx(objectId, userId);
}

// 2026-06-08 Bauteil 2.7c: Append-only insert fuer hauskauf_workflow.
// Jeder Status-Uebergang ist ein neuer INSERT mit frischem recorded_at.
// Reader (listAllHauskaufWorkflow) macht latest-wins pro council_object_id.
// CHECK-constraint auf DB-Seite enforced:
//   offen      → termin/verhandlungspreis duerfen NULL sein
//   in_arbeit  → termin NOT NULL required
//   blockiert  → notes typisch als block-grund
//   erledigt   → verhandlungspreis NOT NULL required, verdict optional
// verdict ist optional (favorisiert | verworfen | null), nur bei
// status=erledigt semantisch sinnvoll.
export interface InsertHauskaufWorkflowInput {
	council_object_id: string;
	status: HauskaufStatus;
	termin?: string | null;
	verhandlungspreis?: number | null;
	notes?: string | null;
	verdict?: HauskaufVerdict | null;
	created_by_user_id: number;
}
export function insertHauskaufWorkflow(
	input: InsertHauskaufWorkflowInput
): HauskaufWorkflowRow {
	const result = getFolioDb()
		.prepare(
			`INSERT INTO hauskauf_workflow
			   (council_object_id, status, termin, verhandlungspreis, notes,
			    verdict, created_by_user_id)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`
		)
		.run(
			input.council_object_id,
			input.status,
			input.termin ?? null,
			input.verhandlungspreis ?? null,
			input.notes ?? null,
			input.verdict ?? null,
			input.created_by_user_id
		);
	return getFolioDb()
		.prepare('SELECT * FROM hauskauf_workflow WHERE id = ?')
		.get(result.lastInsertRowid) as HauskaufWorkflowRow;
}

// Bauteil 0.5 (2026-05-30): append-only per-user status override. Reader
// merges with council.objects.status_tag via effectiveStatusTag().
// 2026-06-05: reason optional fuer Verwerfen-Sub-Optionen (zu weit / zu klein).
export function insertStatusOverride(
	objectId: string,
	userId: number,
	statusTag: CouncilStatusTagAll,
	reason: string | null = null
): ObjectStatusOverrideRow {
	const now = new Date().toISOString();
	const result = getFolioDb()
		.prepare(
			`INSERT INTO object_status_override
			   (council_object_id, user_id, status_tag, reason, recorded_at)
			 VALUES (?, ?, ?, ?, ?)`
		)
		.run(objectId, userId, statusTag, reason, now);
	return getFolioDb()
		.prepare('SELECT * FROM object_status_override WHERE id = ?')
		.get(result.lastInsertRowid) as ObjectStatusOverrideRow;
}

// 2026-06-06 Bauteil 2 (Mail-zu-Council-Uebergang): append-only User-
// Override fuer Mail-Status. Latest-wins via recorded_at DESC. Council-
// Worker liest cross-DB read-only und holt Mails mit overridden_
// actionability='uebernommen' (zusaetzlich zu feedback.actionability=
// 'uebernommen' aus Auto-Promotion).
export function insertMailActionabilityOverride(
	feedbackId: number,
	userId: number,
	status: MailActionabilityOverride
): MailActionabilityOverrideRow {
	const result = getFolioDb()
		.prepare(
			`INSERT INTO mail_actionability_override
			   (feedback_id, user_id, overridden_actionability)
			 VALUES (?, ?, ?)`
		)
		.run(feedbackId, userId, status);
	return getFolioDb()
		.prepare('SELECT * FROM mail_actionability_override WHERE id = ?')
		.get(result.lastInsertRowid) as MailActionabilityOverrideRow;
}

// Bauteil 0.5: append-only user top-10 batch. All rows share the same
// recorded_at so a UI-reader sees an atomic snapshot. rank=0 marks removal.
// Use one INSERT per (object_id, rank) pair — caller decides whether to send
// only moved rows or the full top-10 each time.
export function insertUserRankingBatch(
	userId: number,
	batch: Array<{ object_id: string; rank: number }>
): void {
	if (batch.length === 0) return;
	const db = getFolioDb();
	const now = new Date().toISOString();
	const stmt = db.prepare(
		`INSERT INTO user_rankings (user_id, object_id, rank, recorded_at)
		 VALUES (?, ?, ?, ?)`
	);
	const tx = db.transaction((rows: Array<{ object_id: string; rank: number }>) => {
		for (const r of rows) stmt.run(userId, r.object_id, r.rank, now);
	});
	tx(batch);
}

// Bauteil 0.5: link queue insert. Returns the row so the UI can immediately
// show the pending line with submitted_at + id.
export function insertPendingIngest(url: string, userId: number): PendingIngestRow {
	const result = getFolioDb()
		.prepare(
			`INSERT INTO pending_ingest (url, submitted_by_user_id)
			 VALUES (?, ?)`
		)
		.run(url, userId);
	return getFolioDb()
		.prepare('SELECT * FROM pending_ingest WHERE id = ?')
		.get(result.lastInsertRowid) as PendingIngestRow;
}

// Bauteil 0.5 / Aufraeumen 2026-05-31: ACK-reconciliation marker.
// Called by the pipeline-loader after it has read a council.ingest_acks row
// — folio sets processed_at in its OWN scope (no cross-DB write). Optional
// `ts` lets the caller propagate the worker's ACK timestamp instead of
// stamping "now"; defaults to now() for adhoc/manual calls.
export function markPendingIngestProcessed(id: number, ts?: string): void {
	const stamp = ts ?? new Date().toISOString();
	getFolioDb()
		.prepare('UPDATE pending_ingest SET processed_at = ? WHERE id = ?')
		.run(stamp, id);
}

// Bauteil 0.6 (2026-05-30): append-only note write. Empty noteText means
// user cleared the note; reader returns null in that case.
export function insertObjectNote(
	userId: number,
	objectId: string,
	noteText: string
): ObjectNoteRow {
	const now = new Date().toISOString();
	const result = getFolioDb()
		.prepare(
			`INSERT INTO object_notes (user_id, council_object_id, note_text, recorded_at)
			 VALUES (?, ?, ?, ?)`
		)
		.run(userId, objectId, noteText, now);
	return getFolioDb()
		.prepare('SELECT * FROM object_notes WHERE id = ?')
		.get(result.lastInsertRowid) as ObjectNoteRow;
}

// 2026-06-07 Pre-Bauteil Pipeline-Persistenz: Per-Mail-Logs schreiben.
// Wird heute primaer vom Python-Side-Helper folio_log_writer.py
// (multi-agent) genutzt — TS-Helper hier fuer den Fall, dass manager.ts
// selbst zusaetzliche Log-Zeilen ergaenzen will (z.B. spawn-error).
// seq inkrementiert via Subquery auf MAX(seq) pro run_uuid.
export function insertWorkerRunLog(
	run_uuid: string,
	voice: string,
	event_type: string,
	message: string | null,
	opts: { mail_id?: number | null; object_id?: string | null; level?: string } = {}
): WorkerRunLogRow {
	const db = getFolioDb();
	const seqRow = db
		.prepare(
			'SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq FROM worker_run_logs WHERE run_uuid = ?'
		)
		.get(run_uuid) as { next_seq: number };
	const result = db
		.prepare(
			`INSERT INTO worker_run_logs
			   (run_uuid, seq, voice, mail_id, object_id, event_type, message, level)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.run(
			run_uuid,
			seqRow.next_seq,
			voice,
			opts.mail_id ?? null,
			opts.object_id ?? null,
			event_type,
			message,
			opts.level ?? 'info'
		);
	return db
		.prepare('SELECT * FROM worker_run_logs WHERE id = ?')
		.get(result.lastInsertRowid) as WorkerRunLogRow;
}

// 2026-06-07 Pre-Bauteil: Run-Ende-Aggregat. INSERT OR REPLACE per
// run_uuid (PK). JSON-Felder werden serialisiert.
export function upsertWorkerRunSummary(
	input: UpsertWorkerRunSummaryInput
): WorkerRunSummaryRow {
	const db = getFolioDb();
	const rb =
		input.reason_breakdown != null
			? JSON.stringify(input.reason_breakdown)
			: null;
	const wis =
		input.worker_imports_sample != null
			? JSON.stringify(input.worker_imports_sample)
			: null;
	db.prepare(
		`INSERT OR REPLACE INTO worker_run_summary
		   (run_uuid, geprueft, uebernommen, actionable, archive_silent,
		    council_objects, marker_count, reason_breakdown,
		    worker_imports_sample, written_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
	).run(
		input.run_uuid,
		input.geprueft ?? 0,
		input.uebernommen ?? 0,
		input.actionable ?? 0,
		input.archive_silent ?? 0,
		input.council_objects ?? 0,
		input.marker_count ?? 0,
		rb,
		wis
	);
	return db
		.prepare('SELECT * FROM worker_run_summary WHERE run_uuid = ?')
		.get(input.run_uuid) as WorkerRunSummaryRow;
}
