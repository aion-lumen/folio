// F.5 — Folio-DB domain types. Mirror of state/folio.db schema.

export type ActionKey =
	| 'keep'
	| 'move_immo_portal'
	| 'move_immo_privat'
	| 'move_paketzustellung'
	| 'move_zu_pruefen';

export const ACTION_KEYS: ActionKey[] = [
	'keep',
	'move_immo_portal',
	'move_immo_privat',
	'move_paketzustellung',
	'move_zu_pruefen'
];

// F.8 Block-E — Domain × Actionability 2-Axes Classification.
// F.8.5: correspondence → kontakt rename + werbung als 8. Domain.
export type DomainKey =
	| 'immo'
	| 'job'
	| 'shopping'
	| 'finance'
	| 'kontakt'
	| 'werbung'
	| 'system'
	| 'unsorted';

// Bauteil-7 G5 (2026-06-09): zwei neue Werte —
//   'uebernommen' war latenter Drift seit Bauteil 2.7 (multi-agent
//     hatte ihn als Auto-Promotion-Endzustand, folio nicht im Typ).
//   'auto_reply' kommt mit Bauteil 7 fuer Makler-Auto-Replies
//     (Widerrufsbelehrung, Maklerauftrag etc.). Council-Ingest skipt,
//     Mail-Tab versteckt, IMAP-Cleanup verschiebt in _AionLumen/
//     Korrespondenz (bleibt fuer Bauteil 8 Mail-Council-Verlinkung).
export type ActionabilityKey =
	| 'actionable'
	| 'archive'
	| 'archive-silent'
	| 'uebernommen'
	| 'auto_reply';

export const DOMAIN_KEYS: DomainKey[] = [
	'immo',
	'job',
	'shopping',
	'finance',
	'kontakt',
	'werbung',
	'system',
	'unsorted'
];

export const ACTIONABILITY_KEYS: ActionabilityKey[] = [
	'actionable',
	'archive',
	'archive-silent',
	'uebernommen',
	'auto_reply'
];

// Review-Followup D.9 2026-05-27: strukturiertes Trainings-Signal für
// archive-silent-Korrekturen. „zu-weit" (zu weit weg, z.B. Distanz-Filter)
// und „zu-klein" (zu klein/zu billig, z.B. Wohnfläche/Preis-Filter) als
// erste ENUM-Werte. Marker ist additiv zur freitextigen note.
export type CorrectionMarker = 'zu-weit' | 'zu-klein';

export interface CorrectionRow {
	id: number;
	feedback_id: number;
	imap_uid: number;
	previous_action: string | null;
	corrected_action: ActionKey;
	// F.8 Block-E: 2-axes columns (back-compat columns above bleiben fuer alte
	// rows ohne 2-axes-Werte; corrected_action wird ab F.8 NICHT mehr beschrieben).
	corrected_domain: DomainKey | null;
	corrected_actionability: ActionabilityKey | null;
	note: string | null;
	correction_marker: CorrectionMarker | null;
	// 2026-06-09 Bauteil 6: JSON-Array (string-serialisiert) der
	// feedback.heuristic_markers zum Zeitpunkt der Korrektur. NULL bei
	// Alt-Eintraegen vor Schema-Erweiterung. Reader-Wahl beim Umgang
	// mit NULL.
	heuristic_markers_snapshot: string | null;
	source: string;
	corrected_at: string;
}

export interface InsertCorrectionInput {
	feedback_id: number;
	imap_uid: number;
	previous_action: string | null;
	// F.8 Block-E: corrected_action behalten fuer Schema-Back-Compat (NOT NULL constraint
	// im DB-Schema). Wird mit `${domain}/${actionability}` compact-string belegt.
	corrected_action: ActionKey | string;
	corrected_domain: DomainKey;
	corrected_actionability: ActionabilityKey;
	note: string | null;
	correction_marker?: CorrectionMarker | null;
	// 2026-06-09 Bauteil 6: Snapshot der heuristic_markers-Liste.
	// Engineer-Wahl beim Caller: JSON.stringify(markers_array).
	heuristic_markers_snapshot?: string | null;
	source: string;
}

// F.7 Worker-Run-Tracking
export type WorkerRunStatus =
	| 'queued'
	| 'running'
	| 'completed'
	| 'failed'
	| 'cancelled';

export type WorkerRunMode = 'learning' | 'silent' | 'validator';

export interface WorkerRunRow {
	id: number;
	run_uuid: string;
	parent_run_uuid: string | null;
	account: string;
	board: string;
	mode: WorkerRunMode;
	tranche_size: number;
	pid: number | null;
	status: WorkerRunStatus;
	started_at: string;
	ended_at: string | null;
	exit_code: number | null;
	error_summary: string | null;
	mails_processed: number;
}

export interface InsertWorkerRunInput {
	run_uuid: string;
	parent_run_uuid?: string | null;
	account: string;
	board: string;
	mode: WorkerRunMode;
	tranche_size: number;
	pid: number | null;
	status: WorkerRunStatus;
	started_at: string;
}

// 2026-06-07 Pre-Bauteil Pipeline-Persistenz: Per-Mail-Logs pro Run.
export type WorkerRunLogVoice =
	| 'heuristik'
	| 'gemma'
	| 'qwen'
	| 'qwen-thinking'
	| 'auto'
	| 'cleanup';

export type WorkerRunLogEvent =
	| 'classified'
	| 'validated'
	| 'promoted'
	| 'no_consensus'
	| 'info';

export interface WorkerRunLogRow {
	id: number;
	run_uuid: string;
	seq: number;
	recorded_at: string;
	voice: string;
	mail_id: number | null;
	object_id: string | null;
	event_type: string;
	message: string | null;
	level: string | null;
}

export interface WorkerRunSummaryRow {
	run_uuid: string;
	geprueft: number;
	uebernommen: number;
	actionable: number;
	archive_silent: number;
	council_objects: number;
	marker_count: number;
	reason_breakdown: string | null;       // JSON {marker_prefix: count}
	worker_imports_sample: string | null;  // JSON [{id, subject, sender, tag}]
	written_at: string;
}

export interface UpsertWorkerRunSummaryInput {
	run_uuid: string;
	geprueft?: number;
	uebernommen?: number;
	actionable?: number;
	archive_silent?: number;
	council_objects?: number;
	marker_count?: number;
	reason_breakdown?: Record<string, number> | null;
	worker_imports_sample?: Array<Record<string, unknown>> | null;
}

export type HermesTurnStatus = 'running' | 'completed' | 'failed' | 'aborted';

export interface HermesSessionRow {
	session_id: string;
	conversation_id: string;
	vault_fingerprint: string;
	started_at: string;
	last_activity_at: string;
}

export interface HermesTurnRow {
	turn_id: string;
	session_id: string;
	execution_profile_json: string;
	status: HermesTurnStatus;
	error_summary: string | null;
	started_at: string;
	completed_at: string | null;
}

export interface StartHermesTurnInput {
	session_id: string;
	turn_id: string;
	conversation_id: string;
	vault_fingerprint: string;
	objective_ids: string[];
	execution_profile: object;
}

// Council-side parallel-symmetrische Strukturen (cross-DB read).
export type CouncilRunType = 'council-ingest' | 'council-lens';

export interface CouncilRunRow {
	run_uuid: string;
	run_type: string;
	started_at: string;
	ended_at: string | null;
	status: string;
	n_processed: number;
	exit_code: number | null;
	error_summary: string | null;
}

export interface CouncilRunLogRow {
	id: number;
	run_uuid: string;
	seq: number;
	recorded_at: string;
	voice: string;
	mail_id: number | null;
	object_id: string | null;
	event_type: string;
	message: string | null;
	level: string | null;
}

export interface CouncilRunSummaryRow {
	run_uuid: string;
	geprueft: number;
	objects_created: number;
	marker_count: number;
	reason_breakdown: string | null;
	written_at: string;
}

// Vereinheitlichter Pipeline-Run fuer die UI-Verlauf-Liste — joint mail-
// side worker_runs (+summary) und council-side council_runs (+summary).
export interface PipelineRunRow {
	run_uuid: string;
	parent_run_uuid?: string | null;
	source: 'mail' | 'council';
	run_type: string;   // mode (mail) oder run_type (council)
	started_at: string;
	ended_at: string | null;
	status: string;
	n_processed: number;
	summary: WorkerRunSummaryRow | CouncilRunSummaryRow | null;
	/** Verkettete Kind-Runs (z. B. Auto-Validator unter Silent-Worker). */
	children?: PipelineRunRow[];
}

// F.7 Review-State
export interface ReviewStateRow {
	feedback_id: number;
	account_id: string;
	imap_uid: number;
	reviewed_at: string;
	source: 'auto-open' | 'manual-toggle';
}

// F.7 Validator-Opinions + F.8 Block-E 2-Axes-Extension
export interface ValidatorOpinionRow {
	id: number;
	feedback_id: number;
	account_id: string;
	imap_uid: number;
	validator_model: string;
	validator_action: string; // F.8: compact `${domain}/${actionability}` for back-compat
	validator_domain: DomainKey | null; // F.8 Block-E: primary
	validator_actionability: ActionabilityKey | null; // F.8 Block-E: primary
	validator_confidence: number | null;
	validator_reasoning: string | null;
	evaluated_at: string;
}

export interface InsertValidatorOpinionInput {
	feedback_id: number;
	account_id: string;
	imap_uid: number;
	validator_model: string;
	validator_action: string;
	validator_domain: DomainKey;
	validator_actionability: ActionabilityKey;
	validator_confidence: number | null;
	validator_reasoning: string | null;
}

// Direktive 6: Multi-User + Auth via Tailscale-Header. Default-User (id=1)
// für localhost-Direktzugriff ohne Tailscale.
export type UserRole = 'owner' | 'council_member';

export interface UserRow {
	id: number;
	tailscale_login: string | null;
	display_name: string;
	role: UserRole;
	created_at: string;
}

// Bauteil 0 (2026-05-30): per-user view tracking. object_id references
// council.db objects(id) cross-DB (not enforced).
export interface ObjectViewRow {
	object_id: string;
	user_id: number;
	last_viewed_at: string;
}

// Bauteil 0 (2026-05-30): per-user trigger clicks. 2 distinct user_ids on
// the same object spawn a hauskauf_workflow row.
export interface ObjectTriggerRow {
	object_id: string;
	user_id: number;
	triggered_at: string;
}

// Bauteil 0 (2026-05-30): viewing/negotiation workflow per council object.
// Bauteil 2.7c (2026-06-08): Status-Vokabular gewechselt von
// 'offen/terminiert/besichtigt' auf LIFE-Grammatik
// 'offen/in_arbeit/blockiert/erledigt'. Plus optionaler verdict-Tag
// auf erledigten Karten (Favorit-vs-Verworfen-Sortierung nach
// dritter Besichtigung).
export type HauskaufStatus = 'offen' | 'in_arbeit' | 'blockiert' | 'erledigt';
export type HauskaufVerdict = 'favorisiert' | 'verworfen';

export interface HauskaufWorkflowRow {
	id: number;
	council_object_id: string;
	status: HauskaufStatus;
	termin: string | null;
	verhandlungspreis: number | null;
	notes: string | null;
	verdict: HauskaufVerdict | null;
	// 2026-06-05 Append-only-Refactor (commit 7b0182a): created_at/
	// updated_at zusammengefasst auf recorded_at. Latest-wins per
	// recorded_at DESC.
	recorded_at: string;
	created_by_user_id: number;
	// Bauteil-11 D2 (2026-06-10) Cluster-Inheritance.
	source: 'user_action' | 'cluster_match';
	inherited_from_object_id: string | null;
	inherited_from_cluster_id: number | null;
}

// Bauteil 0.5 (2026-05-30): full 6-value council status enum (council-db/types
// still on 5 — 'abgelaufen' lücke aus council-härtung 2026-05-28).
export type CouncilStatusTagAll =
	| 'neu'
	| 'kaufen'
	| 'beobachten'
	| 'verworfen'
	| 'archiv'
	| 'abgelaufen';

// Bauteil 0.5: per-user status_tag override. Reader merges with
// council.objects.status_tag picking the younger writer.
// 2026-06-05: reason fuer Verwerfen-Sub-Optionen (zu weit / zu klein).
export interface ObjectStatusOverrideRow {
	id: number;
	council_object_id: string;
	user_id: number;
	status_tag: CouncilStatusTagAll;
	reason: string | null;
	// Bauteil-9 (2026-06-09) source: 'user_action' (default für alle
	// Rows < Bauteil 9) | 'cluster_match' (Cross-Portal-Übertrag via
	// Council-Worker find_or_create_cluster).
	source: 'user_action' | 'cluster_match';
	recorded_at: string;
}

// 2026-06-06 Bauteil 2 (Mail-zu-Council-Uebergang): User-Override fuer
// Mail-Status. Append-only, latest-wins per feedback_id. Wird von council-
// mail-ingest-Worker cross-DB read-only gelesen.
export type MailActionabilityOverride = 'actionable' | 'uebernommen' | 'archive-silent';

export interface MailActionabilityOverrideRow {
	id: number;
	feedback_id: number;
	user_id: number;
	overridden_actionability: MailActionabilityOverride;
	recorded_at: string;
}

// Bauteil 0.5: per-user personal Top-10. Append-only, rank=0 means removed.
export interface UserRankingRow {
	id: number;
	user_id: number;
	object_id: string;
	rank: number;
	recorded_at: string;
}

// Bauteil 0.5: inbound link queue for council-worker pull.
export interface PendingIngestRow {
	id: number;
	url: string;
	submitted_by_user_id: number;
	submitted_at: string;
	processed_at: string | null;
}

// Bauteil 0.6 (2026-05-30): per-user free-text note per council object.
// Append-only; empty note_text means user-cleared (reader returns null).
export interface ObjectNoteRow {
	id: number;
	user_id: number;
	council_object_id: string;
	note_text: string;
	// Bauteil-11 D1 (2026-06-10) Cluster-Inheritance.
	source: 'user_action' | 'cluster_match';
	inherited_from_object_id: string | null;
	inherited_from_cluster_id: number | null;
	recorded_at: string;
}
