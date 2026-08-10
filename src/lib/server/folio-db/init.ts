// F.5 — Folio-owned DB (state/folio.db). Append-only corrections table.
// WAL-mode für concurrent reads/writes. State-directory auto-create.

import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { getFolioDbPath } from '../env.js';

let _conn: Database.Database | null = null;
let _connPath: string | null = null;

/** Test-only: close cached connection so FOLIO_DB_PATH can change. */
export function resetFolioDbForTests(): void {
	if (_conn) {
		_conn.close();
		_conn = null;
		_connPath = null;
	}
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS corrections (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    feedback_id     INTEGER NOT NULL,
    imap_uid        INTEGER NOT NULL,
    previous_action TEXT,
    corrected_action TEXT NOT NULL,
    -- F.8 Block-E: 2-axes columns (NULLable; corrected_action bleibt fuer Back-Compat)
    corrected_domain         TEXT,
    corrected_actionability  TEXT,
    -- 2026-06-08 (panel-c werkstatt): correction_marker als CSV der User-
    -- Quick-Action-Tags (zu-weit/zu-klein etc.).
    correction_marker        TEXT,
    -- 2026-06-09 Bauteil 6: heuristic_markers_snapshot als JSON-Array.
    -- Eingefrorener Stand der feedback.heuristic_markers zum Zeitpunkt
    -- der Korrektur — überlebt feedback.db-Cleanup, ist Lern-Anker für
    -- spätere Heuristik-Justage.
    heuristic_markers_snapshot TEXT,
    note            TEXT,
    source          TEXT NOT NULL,
    corrected_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_corrections_feedback ON corrections(feedback_id);
CREATE INDEX IF NOT EXISTS idx_corrections_corrected_at ON corrections(corrected_at);
CREATE INDEX IF NOT EXISTS idx_corrections_domain ON corrections(corrected_domain);
CREATE INDEX IF NOT EXISTS idx_corrections_actionability ON corrections(corrected_actionability);

-- F.7 Worker-Run-Tracking
CREATE TABLE IF NOT EXISTS worker_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_uuid TEXT NOT NULL UNIQUE,
    account TEXT NOT NULL,
    board TEXT NOT NULL,
    mode TEXT NOT NULL,
    tranche_size INTEGER NOT NULL,
    pid INTEGER,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    exit_code INTEGER,
    error_summary TEXT,
    mails_processed INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_worker_runs_started ON worker_runs(started_at DESC);

-- F.7 Review-State
CREATE TABLE IF NOT EXISTS review_state (
    feedback_id INTEGER PRIMARY KEY,
    account_id TEXT NOT NULL,
    imap_uid INTEGER NOT NULL,
    reviewed_at TEXT NOT NULL,
    source TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_review_account ON review_state(account_id);

-- F.7 + F.8 Block-E Validator-Opinions (2-axes columns)
CREATE TABLE IF NOT EXISTS validator_opinions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feedback_id INTEGER NOT NULL,
    account_id TEXT NOT NULL,
    imap_uid INTEGER NOT NULL,
    validator_model TEXT NOT NULL,
    validator_action TEXT NOT NULL,
    -- F.8 Block-E: 2-axes columns (NULLable; validator_action ist compact-string fuer Back-Compat)
    validator_domain         TEXT,
    validator_actionability  TEXT,
    validator_confidence REAL,
    validator_reasoning TEXT,
    evaluated_at TEXT NOT NULL,
    UNIQUE(feedback_id, validator_model)
);
CREATE INDEX IF NOT EXISTS idx_validator_feedback ON validator_opinions(feedback_id);
CREATE INDEX IF NOT EXISTS idx_validator_domain ON validator_opinions(validator_domain);
CREATE INDEX IF NOT EXISTS idx_validator_actionability ON validator_opinions(validator_actionability);

-- Direktive 6 (council-iteration-1.5): Multi-User + Auth via Tailscale-Header.
-- Default-User (id=1) für localhost-Direktzugriff ohne Header (idempotent).
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tailscale_login TEXT UNIQUE,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('owner', 'council_member')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_tailscale ON users(tailscale_login);

INSERT OR IGNORE INTO users (id, tailscale_login, display_name, role)
    VALUES (1, NULL, 'owner', 'owner');

-- Bauteil 0 (2026-05-30): per-user view tracking. object_id references
-- council.db objects(id) cross-DB and is not enforced.
CREATE TABLE IF NOT EXISTS object_views (
    object_id       TEXT    NOT NULL,
    user_id         INTEGER NOT NULL,
    last_viewed_at  TEXT    NOT NULL,
    PRIMARY KEY (object_id, user_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_object_views_user ON object_views(user_id);

-- Bauteil 0 (2026-05-30): per-user trigger clicks. 2-user consensus on the
-- same object spawns a hauskauf_workflow row (atomic write in writer.ts).
CREATE TABLE IF NOT EXISTS object_triggers (
    object_id       TEXT    NOT NULL,
    user_id         INTEGER NOT NULL,
    triggered_at    TEXT    NOT NULL,
    PRIMARY KEY (object_id, user_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_object_triggers_object ON object_triggers(object_id);

-- Bauteil 0 (2026-05-30): viewing/negotiation workflow per council object.
-- Bauteil 2 (2026-06-06, commit 7b0182a): Append-only Workflow-History.
-- Bauteil 2.7c (2026-06-08): Status-Vokabular umbenannt auf LIFE-Grammatik
-- (offen/in_arbeit/blockiert/erledigt), plus optionale verdict-Spalte
-- (favorisiert/verworfen) fuer erledigte Karten. Migration der Live-DB
-- erfolgt im Init-Hook (alte CHECK-Constraint mit terminiert/besichtigt
-- erkannt → temp-Tabelle, copy, drop, rename — Tabelle ist leer, daher
-- ohne Datenverlust).
CREATE TABLE IF NOT EXISTS hauskauf_workflow (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    council_object_id     TEXT    NOT NULL,
    status                TEXT    NOT NULL DEFAULT 'offen'
                            CHECK(status IN ('offen', 'in_arbeit', 'blockiert', 'erledigt')),
    termin                TEXT,
    verhandlungspreis     REAL,
    notes                 TEXT,
    verdict               TEXT    NULL
                            CHECK(verdict IS NULL OR verdict IN ('favorisiert', 'verworfen')),
    recorded_at           TEXT    NOT NULL DEFAULT (datetime('now')),
    created_by_user_id    INTEGER NOT NULL,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id),
    CHECK (
        (status = 'offen') OR
        (status = 'in_arbeit' AND termin IS NOT NULL) OR
        (status = 'blockiert') OR
        (status = 'erledigt' AND verhandlungspreis IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS idx_hauskauf_workflow_status ON hauskauf_workflow(status);
CREATE INDEX IF NOT EXISTS idx_hauskauf_workflow_object_recorded
    ON hauskauf_workflow(council_object_id, recorded_at DESC);

-- Bauteil 0.5 (2026-05-30): per-user status_tag override for council.objects.
-- Append-only; reader merges with council.objects.status_tag picking the
-- younger writer (override.recorded_at vs council.objects.last_updated).
-- 2026-06-05: reason TEXT NULL fuer Verwerfen-Sub-Optionen (zu weit / zu klein).
-- Validierung im Endpoint (TS), nicht via SQL-CHECK — leichter erweiterbar.
CREATE TABLE IF NOT EXISTS object_status_override (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    council_object_id   TEXT    NOT NULL,
    user_id             INTEGER NOT NULL,
    status_tag          TEXT    NOT NULL
        CHECK(status_tag IN ('neu','kaufen','beobachten','verworfen','archiv','abgelaufen')),
    reason              TEXT    NULL,
    -- Bauteil-9 (2026-06-09) source: 'user_action' (default) |
    -- 'cluster_match' (Cross-Portal-Übertrag von Council-Worker).
    source              TEXT    DEFAULT 'user_action',
    recorded_at         TEXT    NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_oso_object ON object_status_override(council_object_id);
CREATE INDEX IF NOT EXISTS idx_oso_recorded ON object_status_override(recorded_at DESC);

-- 2026-06-06 Bauteil 2 (Mail-zu-Council-Uebergang): User-Override fuer
-- Mail-Status. Wird vom Council-Mail-Ingest-Worker cross-DB read-only
-- gelesen (zusaetzlich zu feedback.actionability='uebernommen' aus Auto-
-- Promotion). Append-only, latest-wins via recorded_at DESC. CHECK-Constraint
-- enthaelt alle drei aktiven Werte; alte time-decay 'archive' bleibt
-- gueltig in feedback.db, wird im UI mit 'archive-silent' im Stumm-Tab
-- zusammen gemerged.
CREATE TABLE IF NOT EXISTS mail_actionability_override (
    id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    feedback_id              INTEGER NOT NULL,
    user_id                  INTEGER NOT NULL,
    overridden_actionability TEXT    NOT NULL
        CHECK(overridden_actionability IN ('actionable', 'uebernommen', 'archive-silent')),
    recorded_at              TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_mao_feedback_recorded
    ON mail_actionability_override(feedback_id, recorded_at DESC);

-- Bauteil 0.5 (2026-05-30): per-user personal Top-10 ranking. Append-only.
-- rank=0 is the explicit removal sentinel (no DELETE in append-only model).
-- Drag-drop writes a batch in one transaction with identical recorded_at so
-- the reader sees an atomic snapshot.
CREATE TABLE IF NOT EXISTS user_rankings (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,
    object_id       TEXT    NOT NULL,
    rank            INTEGER NOT NULL,
    recorded_at     TEXT    NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_ur_user ON user_rankings(user_id);
CREATE INDEX IF NOT EXISTS idx_ur_recorded ON user_rankings(recorded_at DESC);

-- Bauteil 0.5 (2026-05-30): inbound link queue for council ingest. Folio
-- writes (user submits link); council-worker reads cross-DB on its 4h tick
-- and stamps processed_at back as the only sanctioned reverse cross-DB
-- write (single column update).
CREATE TABLE IF NOT EXISTS pending_ingest (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    url                     TEXT    NOT NULL,
    submitted_by_user_id    INTEGER NOT NULL,
    submitted_at            TEXT    NOT NULL DEFAULT (datetime('now')),
    processed_at            TEXT,
    FOREIGN KEY (submitted_by_user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_pi_pending ON pending_ingest(processed_at) WHERE processed_at IS NULL;

-- Bauteil 0.6 (2026-05-30): per-user free-text note per council object.
-- Append-only; reader picks latest per (user_id, council_object_id).
-- Empty note_text means user cleared the note — reader returns null.
CREATE TABLE IF NOT EXISTS object_notes (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id                     INTEGER NOT NULL,
    council_object_id           TEXT    NOT NULL,
    note_text                   TEXT    NOT NULL,
    -- Bauteil-11 D1 (2026-06-10) Cluster-Inheritance:
    -- source='user_action' (default) | 'cluster_match'
    -- inherited_from_object_id = original-object aus dem die Notiz
    --                            vererbt wurde (NULL bei user_action)
    -- inherited_from_cluster_id = cluster_id zur Telemetrie
    source                      TEXT    DEFAULT 'user_action',
    inherited_from_object_id    TEXT    NULL,
    inherited_from_cluster_id   INTEGER NULL,
    recorded_at                 TEXT    NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_on_user_object ON object_notes(user_id, council_object_id);
CREATE INDEX IF NOT EXISTS idx_on_recorded ON object_notes(recorded_at DESC);

-- 2026-06-07 Pre-Bauteil Pipeline-Persistenz: Per-Mail-Logs pro Worker-Run.
-- 1:N zu worker_runs.run_uuid. FK per Konvention (kein SQL-FK wg. order-of-
-- init). seq inkrementiert der Caller via COALESCE(MAX(seq),0)+1 Subquery.
-- Schreiber:
--   - multi-agent/scripts/folio_log_writer.py (production_worker /
--     validator_batch / auto_uebernahme — etablierte Cross-DB-Write-
--     Ausnahme, siehe multi-agent/docs/cross-db-write-ausnahmen.md).
--   - folio/worker-runner/manager.ts ergaenzt am Run-Ende ggf. ein Aggregat.
CREATE TABLE IF NOT EXISTS worker_run_logs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    run_uuid     TEXT    NOT NULL,
    seq          INTEGER NOT NULL,
    recorded_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    voice        TEXT    NOT NULL,
                -- 'heuristik' | 'gemma' | 'qwen' | 'qwen-thinking' | 'auto'
    mail_id      INTEGER,                 -- feedback.id (cross-DB ref)
    object_id    TEXT,                    -- council.objects.id (cross-DB ref)
    event_type   TEXT    NOT NULL,
                -- 'classified' | 'validated' | 'promoted' | 'no_consensus' | 'info'
    message      TEXT,
    level        TEXT    DEFAULT 'info'   -- 'info' | 'warn' | 'error'
);
CREATE INDEX IF NOT EXISTS idx_wrl_run_uuid_seq ON worker_run_logs(run_uuid, seq);
CREATE INDEX IF NOT EXISTS idx_wrl_recorded ON worker_run_logs(recorded_at DESC);

-- 2026-06-07 Pre-Bauteil Pipeline-Persistenz: Run-Ende-Aggregat.
-- 1:1 per run_uuid, INSERT OR REPLACE beim close.
-- reason_breakdown ist JSON (block-marker-prefix → count), worker_imports_
-- sample ist JSON-Array von 10-20 Sample-Mails fuer die Lauf-Spur-UI.
CREATE TABLE IF NOT EXISTS worker_run_summary (
    run_uuid              TEXT    PRIMARY KEY,
    geprueft              INTEGER NOT NULL DEFAULT 0,
    uebernommen           INTEGER NOT NULL DEFAULT 0,
    actionable            INTEGER NOT NULL DEFAULT 0,
    archive_silent        INTEGER NOT NULL DEFAULT 0,
    council_objects       INTEGER NOT NULL DEFAULT 0,
    marker_count          INTEGER NOT NULL DEFAULT 0,
    reason_breakdown      TEXT,
    worker_imports_sample TEXT,
    written_at            TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- v0.4.1: Folio owns Hermes session/turn traceability. Hermes remains the
-- execution runtime; no Hermes database is used as Folio's audit source.
CREATE TABLE IF NOT EXISTS hermes_sessions (
    session_id         TEXT PRIMARY KEY,
    conversation_id    TEXT NOT NULL UNIQUE,
    vault_fingerprint  TEXT NOT NULL,
    started_at         TEXT NOT NULL,
    last_activity_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hermes_sessions_activity
    ON hermes_sessions(last_activity_at DESC);

CREATE TABLE IF NOT EXISTS hermes_session_objectives (
    session_id    TEXT NOT NULL,
    objective_id  TEXT NOT NULL,
    linked_at     TEXT NOT NULL,
    PRIMARY KEY (session_id, objective_id),
    FOREIGN KEY (session_id) REFERENCES hermes_sessions(session_id)
);
CREATE INDEX IF NOT EXISTS idx_hso_objective
    ON hermes_session_objectives(objective_id, linked_at DESC);

CREATE TABLE IF NOT EXISTS hermes_turns (
    turn_id                 TEXT PRIMARY KEY,
    session_id              TEXT NOT NULL,
    execution_profile_json  TEXT NOT NULL,
    status                  TEXT NOT NULL CHECK(status IN ('running','completed','failed','aborted')),
    error_summary           TEXT,
    started_at              TEXT NOT NULL,
    completed_at            TEXT,
    FOREIGN KEY (session_id) REFERENCES hermes_sessions(session_id)
);
CREATE INDEX IF NOT EXISTS idx_hermes_turns_session
    ON hermes_turns(session_id, started_at DESC);

-- v0.5.0 baseline: Folio-owned canonical memory. Search is a disposable
-- projection; facts and their provenance remain in the ordinary SQLite table.
CREATE TABLE IF NOT EXISTS memory_facts (
    fact_id                TEXT PRIMARY KEY,
    domain                 TEXT NOT NULL,
    data_class             TEXT NOT NULL,
    sensitivity            TEXT NOT NULL CHECK(sensitivity IN ('public','private','sensitive')),
    subject                TEXT NOT NULL,
    predicate              TEXT NOT NULL,
    value_text             TEXT NOT NULL,
    status                 TEXT NOT NULL CHECK(status IN ('candidate','confirmed','rejected','superseded','tombstoned')),
    source_kind            TEXT NOT NULL,
    source_ref             TEXT NOT NULL,
    source_excerpt         TEXT,
    derived_from_external  INTEGER NOT NULL DEFAULT 0 CHECK(derived_from_external IN (0,1)),
    valid_from             TEXT,
    valid_to               TEXT,
    supersedes_fact_id     TEXT,
    recorded_at            TEXT NOT NULL,
    confirmed_at           TEXT,
    confirmed_by           TEXT,
    FOREIGN KEY (supersedes_fact_id) REFERENCES memory_facts(fact_id)
);
CREATE INDEX IF NOT EXISTS idx_memory_facts_scope
    ON memory_facts(domain, sensitivity, status, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_facts_source
    ON memory_facts(source_kind, source_ref);

CREATE TABLE IF NOT EXISTS memory_events (
    event_id     TEXT PRIMARY KEY,
    fact_id      TEXT NOT NULL,
    event_type   TEXT NOT NULL CHECK(event_type IN ('proposed','confirmed','rejected','superseded','tombstoned')),
    actor_kind   TEXT NOT NULL CHECK(actor_kind IN ('human','system','import')),
    actor_id     TEXT NOT NULL,
    detail_json  TEXT NOT NULL DEFAULT '{}',
    recorded_at  TEXT NOT NULL,
    FOREIGN KEY (fact_id) REFERENCES memory_facts(fact_id)
);
CREATE INDEX IF NOT EXISTS idx_memory_events_fact
    ON memory_events(fact_id, recorded_at);
CREATE TRIGGER IF NOT EXISTS memory_events_no_update
    BEFORE UPDATE ON memory_events BEGIN
        SELECT RAISE(ABORT, 'memory_events is append-only');
    END;
CREATE TRIGGER IF NOT EXISTS memory_events_no_delete
    BEFORE DELETE ON memory_events BEGIN
        SELECT RAISE(ABORT, 'memory_events is append-only');
    END;

CREATE VIRTUAL TABLE IF NOT EXISTS memory_facts_fts USING fts5(
    fact_id UNINDEXED,
    domain UNINDEXED,
    subject,
    predicate,
    value_text,
    source_excerpt,
    tokenize = 'unicode61'
);

-- v0.5.0 Session Relay: metadata and the approval ledger live in Folio.
-- Unapproved request bodies remain under ~/.folio/session-exchange. Only approved
-- handoff artifacts and bound responses enter the configured session bridge.
CREATE TABLE IF NOT EXISTS relay_cases (
    case_id            TEXT PRIMARY KEY,
    domain             TEXT NOT NULL,
    source_kind        TEXT NOT NULL,
    source_ref         TEXT NOT NULL,
    subject            TEXT NOT NULL,
    capability         TEXT NOT NULL,
    target_id          TEXT NOT NULL,
    target_locality    TEXT NOT NULL CHECK(target_locality IN ('local','cloud')),
    data_classes_json  TEXT NOT NULL,
    status             TEXT NOT NULL CHECK(status IN ('detected','staged','approved','shared','claimed','needs_context','answered','reviewed','applied','closed','rejected','expired')),
    request_hash       TEXT NOT NULL,
    request_body_path  TEXT NOT NULL,
    response_hash      TEXT,
    retention_until    TEXT NOT NULL,
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_relay_cases_status
    ON relay_cases(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_relay_cases_domain
    ON relay_cases(domain, updated_at DESC);

CREATE TABLE IF NOT EXISTS relay_egress_approvals (
    approval_id        TEXT PRIMARY KEY,
    case_id            TEXT NOT NULL,
    request_hash       TEXT NOT NULL,
    target_id          TEXT NOT NULL,
    data_classes_json  TEXT NOT NULL,
    approved_by        TEXT NOT NULL,
    approved_at        TEXT NOT NULL,
    revoked_at         TEXT,
    FOREIGN KEY (case_id) REFERENCES relay_cases(case_id)
);
CREATE INDEX IF NOT EXISTS idx_relay_approvals_case
    ON relay_egress_approvals(case_id, approved_at DESC);

CREATE TABLE IF NOT EXISTS relay_events (
    event_id     TEXT PRIMARY KEY,
    case_id      TEXT NOT NULL,
    event_type   TEXT NOT NULL,
    actor_kind   TEXT NOT NULL CHECK(actor_kind IN ('human','system','adapter')),
    actor_id     TEXT NOT NULL,
    detail_json  TEXT NOT NULL DEFAULT '{}',
    recorded_at  TEXT NOT NULL,
    FOREIGN KEY (case_id) REFERENCES relay_cases(case_id)
);
CREATE INDEX IF NOT EXISTS idx_relay_events_case
    ON relay_events(case_id, recorded_at);
CREATE TRIGGER IF NOT EXISTS relay_events_no_update
    BEFORE UPDATE ON relay_events BEGIN
        SELECT RAISE(ABORT, 'relay_events is append-only');
    END;
CREATE TRIGGER IF NOT EXISTS relay_events_no_delete
    BEFORE DELETE ON relay_events BEGIN
        SELECT RAISE(ABORT, 'relay_events is append-only');
    END;

CREATE TABLE IF NOT EXISTS relay_applications (
    application_id  TEXT PRIMARY KEY,
    case_id          TEXT NOT NULL UNIQUE,
    artifact_kind   TEXT NOT NULL CHECK(artifact_kind IN ('mail_draft','objective','context_request')),
    target_ref       TEXT NOT NULL,
    applied_by       TEXT NOT NULL,
    applied_at       TEXT NOT NULL,
    FOREIGN KEY (case_id) REFERENCES relay_cases(case_id)
);
CREATE INDEX IF NOT EXISTS idx_relay_applications_case
    ON relay_applications(case_id, applied_at DESC);
`;

export function getFolioDb(): Database.Database {
	const path = getFolioDbPath();
	// Reopen when the resolved path changes (vault switch real↔demo) — vault-scoped store.
	if (_conn && _connPath === path) return _conn;
	if (_conn) _conn.close();
	mkdirSync(dirname(path), { recursive: true });
	_conn = new Database(path);
	_connPath = path;
	_conn.pragma('journal_mode = WAL');
	// better-sqlite3/SQLite does not make the schema's FK declarations a reliable
	// runtime guard unless enforcement is enabled on every connection.
	_conn.pragma('foreign_keys = ON');
	_conn.exec(SCHEMA);

	// Early 0.4.1 worktrees created hermes_turns before `aborted` became a
	// first-class terminal state. SQLite cannot ALTER a CHECK constraint, so copy
	// the table atomically while preserving every recorded turn.
	const hermesTurnsSql = _conn
		.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='hermes_turns'")
		.get() as { sql: string } | undefined;
	if (hermesTurnsSql && !hermesTurnsSql.sql.includes("'aborted'")) {
		_conn.exec(`
			BEGIN;
			CREATE TABLE hermes_turns__new (
				turn_id                 TEXT PRIMARY KEY,
				session_id              TEXT NOT NULL,
				execution_profile_json  TEXT NOT NULL,
				status                  TEXT NOT NULL
				                          CHECK(status IN ('running','completed','failed','aborted')),
				error_summary           TEXT,
				started_at              TEXT NOT NULL,
				completed_at            TEXT,
				FOREIGN KEY (session_id) REFERENCES hermes_sessions(session_id)
			);
			INSERT INTO hermes_turns__new
			  (turn_id, session_id, execution_profile_json, status, error_summary, started_at, completed_at)
			SELECT turn_id, session_id, execution_profile_json, status, error_summary, started_at, completed_at
			FROM hermes_turns;
			DROP TABLE hermes_turns;
			ALTER TABLE hermes_turns__new RENAME TO hermes_turns;
			CREATE INDEX idx_hermes_turns_session
			  ON hermes_turns(session_id, started_at DESC);
			COMMIT;
		`);
	}
	// 2026-06-05: object_status_override.reason — Spalten-Migration fuer
	// existierende DBs (CREATE TABLE IF NOT EXISTS triggert sonst nicht).
	const hasReason = (
		_conn
			.prepare("PRAGMA table_info(object_status_override)")
			.all() as Array<{ name: string }>
	).some((c) => c.name === 'reason');
	if (!hasReason) {
		_conn.exec('ALTER TABLE object_status_override ADD COLUMN reason TEXT NULL');
	}

	// Bauteil-9 (2026-06-09): object_status_override.source.
	// 'user_action' (default fuer alte Rows) / 'cluster_match' (Cross-
	// Portal-Wiedererkennung, Council-Worker schreibt cross-DB nach
	// find_or_create_cluster wenn Cluster-Mitglied existing-Status hat).
	const hasOsoSource = (
		_conn
			.prepare("PRAGMA table_info(object_status_override)")
			.all() as Array<{ name: string }>
	).some((c) => c.name === 'source');
	if (!hasOsoSource) {
		_conn.exec(
			"ALTER TABLE object_status_override ADD COLUMN source TEXT DEFAULT 'user_action'",
		);
	}

	// Bauteil-11 D1 (2026-06-10) object_notes Cluster-Inheritance:
	// source + inherited_from_object_id + inherited_from_cluster_id
	// analog Bauteil-9-Pattern. Council-Worker schreibt nach
	// find_or_create_cluster cross-DB cluster_match-Rows.
	const notesCols = _conn
		.prepare("PRAGMA table_info(object_notes)")
		.all() as Array<{ name: string }>;
	if (!notesCols.some((c) => c.name === 'source')) {
		_conn.exec(
			"ALTER TABLE object_notes ADD COLUMN source TEXT DEFAULT 'user_action'",
		);
	}
	if (!notesCols.some((c) => c.name === 'inherited_from_object_id')) {
		_conn.exec(
			"ALTER TABLE object_notes ADD COLUMN inherited_from_object_id TEXT NULL",
		);
		_conn.exec(
			"ALTER TABLE object_notes ADD COLUMN inherited_from_cluster_id INTEGER NULL",
		);
	}

	// Bauteil-11 D2 (2026-06-10) hauskauf_workflow Cluster-Inheritance:
	// analog object_notes.
	const hkwCols = _conn
		.prepare("PRAGMA table_info(hauskauf_workflow)")
		.all() as Array<{ name: string }>;
	if (!hkwCols.some((c) => c.name === 'source')) {
		_conn.exec(
			"ALTER TABLE hauskauf_workflow ADD COLUMN source TEXT DEFAULT 'user_action'",
		);
	}
	if (!hkwCols.some((c) => c.name === 'inherited_from_object_id')) {
		_conn.exec(
			"ALTER TABLE hauskauf_workflow ADD COLUMN inherited_from_object_id TEXT NULL",
		);
		_conn.exec(
			"ALTER TABLE hauskauf_workflow ADD COLUMN inherited_from_cluster_id INTEGER NULL",
		);
	}

	// 2026-06-09 Bauteil 6: corrections-Spalten nachziehen.
	// - correction_marker existiert seit panel-c werkstatt in der Live-DB,
	//   wurde aber nie in init.ts CREATE-TABLE ergänzt (Schema-Drift fix).
	// - heuristic_markers_snapshot ist neu — JSON-Array der
	//   feedback.heuristic_markers zum Zeitpunkt der Korrektur (Lern-Anker
	//   überlebt feedback.db-Cleanup).
	const correctionsCols = _conn
		.prepare("PRAGMA table_info(corrections)")
		.all() as Array<{ name: string }>;
	const hasCorrectionMarker = correctionsCols.some((c) => c.name === 'correction_marker');
	if (!hasCorrectionMarker) {
		_conn.exec('ALTER TABLE corrections ADD COLUMN correction_marker TEXT');
	}
	const hasMarkersSnapshot = correctionsCols.some((c) => c.name === 'heuristic_markers_snapshot');
	if (!hasMarkersSnapshot) {
		_conn.exec('ALTER TABLE corrections ADD COLUMN heuristic_markers_snapshot TEXT');
	}

	// Direktive D (2026-06-10): Worker→Validator-Pipeline-Verkettung in Verlauf.
	const workerRunCols = _conn
		.prepare('PRAGMA table_info(worker_runs)')
		.all() as Array<{ name: string }>;
	if (!workerRunCols.some((c) => c.name === 'parent_run_uuid')) {
		_conn.exec('ALTER TABLE worker_runs ADD COLUMN parent_run_uuid TEXT NULL');
		_conn.exec(
			'CREATE INDEX IF NOT EXISTS idx_worker_runs_parent ON worker_runs(parent_run_uuid)'
		);
	}

	// 2026-06-08 Bauteil 2.7c: hauskauf_workflow Status-Vokabular gewechselt
	// auf LIFE-Grammatik. Zwei separate Migrationen:
	//   (a) verdict-Spalte additiv ergaenzen (ADD COLUMN ist atomar).
	//   (b) Wenn die alte CHECK-Constraint (terminiert/besichtigt) noch
	//       aktiv ist: temp-Tabelle, copy, drop, rename. Tabelle ist leer
	//       in der Live-DB, daher kein Datenverlust. Atomar in einer
	//       Transaction.
	const cols = _conn
		.prepare("PRAGMA table_info(hauskauf_workflow)")
		.all() as Array<{ name: string }>;
	const hasVerdict = cols.some((c) => c.name === 'verdict');
	if (!hasVerdict) {
		_conn.exec(
			"ALTER TABLE hauskauf_workflow ADD COLUMN verdict TEXT NULL"
		);
	}
	// CHECK-Constraint-Test: sqlite_master.sql liest die echte CREATE-
	// TABLE-Definition. Wenn 'terminiert' noch drin steht, ist die alte
	// Constraint aktiv → Migration noetig. Robuster + idempotent vs
	// probe-INSERT (kein State-Mutation, FK-unabhaengig).
	const tableSql = (_conn
		.prepare(
			"SELECT sql FROM sqlite_master WHERE type='table' AND name='hauskauf_workflow'"
		)
		.get() as { sql: string } | undefined);
	const needsCheckMigration = tableSql ? tableSql.sql.includes("'terminiert'") : false;
	if (needsCheckMigration) {
		_conn.exec(`
			BEGIN;
			CREATE TABLE hauskauf_workflow__new (
				id                    INTEGER PRIMARY KEY AUTOINCREMENT,
				council_object_id     TEXT    NOT NULL,
				status                TEXT    NOT NULL DEFAULT 'offen'
				                        CHECK(status IN ('offen','in_arbeit','blockiert','erledigt')),
				termin                TEXT,
				verhandlungspreis     REAL,
				notes                 TEXT,
				verdict               TEXT    NULL
				                        CHECK(verdict IS NULL OR verdict IN ('favorisiert','verworfen')),
				recorded_at           TEXT    NOT NULL DEFAULT (datetime('now')),
				created_by_user_id    INTEGER NOT NULL,
				FOREIGN KEY (created_by_user_id) REFERENCES users(id),
				CHECK (
					(status = 'offen') OR
					(status = 'in_arbeit' AND termin IS NOT NULL) OR
					(status = 'blockiert') OR
					(status = 'erledigt' AND verhandlungspreis IS NOT NULL)
				)
			);
			INSERT INTO hauskauf_workflow__new
			  (id, council_object_id, status, termin, verhandlungspreis, notes,
			   verdict, recorded_at, created_by_user_id)
			SELECT id, council_object_id,
			  CASE status
			    WHEN 'terminiert' THEN 'in_arbeit'
			    WHEN 'besichtigt' THEN 'erledigt'
			    ELSE status
			  END,
			  termin, verhandlungspreis, notes, verdict, recorded_at, created_by_user_id
			FROM hauskauf_workflow;
			DROP TABLE hauskauf_workflow;
			ALTER TABLE hauskauf_workflow__new RENAME TO hauskauf_workflow;
			CREATE INDEX IF NOT EXISTS idx_hauskauf_workflow_status
			  ON hauskauf_workflow(status);
			CREATE INDEX IF NOT EXISTS idx_hauskauf_workflow_object_recorded
			  ON hauskauf_workflow(council_object_id, recorded_at DESC);
			COMMIT;
		`);
	}

	// Bauteil-14 (2026-06-10): Push-Model cluster_match-Rows entfernen.
	// Read-through Resolution in cluster-substance.ts ersetzt Council-Copy.
	const statusMatchCount = (
		_conn
			.prepare(
				"SELECT COUNT(*) AS n FROM object_status_override WHERE source = 'cluster_match'"
			)
			.get() as { n: number }
	).n;
	if (statusMatchCount > 5) {
		throw new Error(
			`Bauteil-14 migration aborted: ${statusMatchCount} object_status_override ` +
				`cluster_match rows (expected ≤5). Verify migration count manually before retry.`
		);
	}
	if (statusMatchCount > 0) {
		_conn.exec("DELETE FROM object_status_override WHERE source = 'cluster_match'");
	}
	_conn.exec("DELETE FROM object_notes WHERE source = 'cluster_match'");
	_conn.exec("DELETE FROM hauskauf_workflow WHERE source = 'cluster_match'");

	return _conn;
}
