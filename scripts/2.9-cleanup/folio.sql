-- 2026-06-09 Bauteil 2.9 E1c: folio.db Variante A
-- BEHALTEN: corrections, object_status_override, mail_actionability_override, users, default-substanz
-- TRUNCATE: pipeline-telemetrie + hauskauf_workflow-test + ungebrauchte tabellen
DELETE FROM worker_runs;
DELETE FROM worker_run_logs;
DELETE FROM worker_run_summary;
DELETE FROM hauskauf_workflow;
DELETE FROM validator_opinions;  -- 450 rows lens-LLM-output, wird neu erzeugt bei lens-runs
DELETE FROM object_triggers;     -- test-consensus, kein produktiv-signal
DELETE FROM object_views;        -- view-tracking, kein lern-signal
-- behalten:
-- corrections (20)
-- object_status_override (28)
-- mail_actionability_override (18)
-- users (default-user id=1)
-- review_state (approval-log)
-- object_notes (cross-link zu object_status_override)
-- pending_ingest (0, leer)
-- user_rankings (4 — top-10-bewertungen, lern-signal)
