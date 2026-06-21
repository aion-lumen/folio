-- 2026-06-09 Bauteil 2.9 E1c: Cleanup Variante A (Lern-Anker erhalten)
-- council.db: nur Objects + Cascade-Rows behalten die in folio.object_status_override referenziert sind

-- Schritt 1: 10 zu-behaltende object_ids in temp-Tabelle
CREATE TEMP TABLE keep_ids (object_id TEXT PRIMARY KEY);
INSERT INTO keep_ids VALUES
  ('03e844ac00d8059393063123bd8fe19fc06ad6ca2b593f1bbf180957825853d2'),
  ('0967ccac302750117c56a279c32a1342a7268f5bd861fd6155c82dcdb6599b0c'),
  ('14ba71a896674b6066bffd72c702d40265500f4ab1ee51e618a0729144a8c8be'),
  ('1c133cb19e6811f3316e1325b3bd963a2eee9f6175c2f08e08f54300357eb6db'),
  ('4aacf44cf05cf98b40dd44e8043370190d16aa02e47c7ad01cc8c03a90d616f3'),
  ('7bf58b9b9d26bb4ee6ecf83f5fae49c3325a34d383e97341f4bd736ee07767fb'),
  ('90b8da8e5b1274b9b127cfe7f7f7f12d68a566e2ee49e8b970e213d6910804e7'),
  ('99a8334a58dddc7eb9a297700fc2136c96cc2f755be7b0a3b0ee688f71014852'),
  ('c5b959771d34b506ed3a7b9e095e990c450c2bad65ef37111f176cc5f44f7e1f'),
  ('e7aa4f4d062feeabe119886bd1d384e74ff9ecbfae9f31d3e8c06900be7f2ea0');

-- Schritt 2: cascade-tabellen filtern (Object-referenced)
DELETE FROM rankings WHERE object_id NOT IN (SELECT object_id FROM keep_ids);
DELETE FROM consolidated_top10 WHERE object_id NOT IN (SELECT object_id FROM keep_ids);
DELETE FROM lens_comparisons WHERE obj_a_id NOT IN (SELECT object_id FROM keep_ids) OR obj_b_id NOT IN (SELECT object_id FROM keep_ids);
DELETE FROM object_lifecycle_events WHERE object_id NOT IN (SELECT object_id FROM keep_ids);
DELETE FROM user_actions WHERE object_id NOT IN (SELECT object_id FROM keep_ids);
-- mail_inserat_markers / mail_ingest_acks haben keinen object_id-FK, sondern feedback_id → bei feedback.db-truncate werden die orphans
DELETE FROM mail_inserat_markers;  -- raw-mail-marker, brauchen wir nicht mehr
DELETE FROM mail_ingest_acks;       -- ack-historie, irrelevant nach feedback-truncate
DELETE FROM ingest_acks;            -- analog

-- Schritt 3: objects-Tabelle filtern (zuletzt wegen FK)
DELETE FROM objects WHERE id NOT IN (SELECT object_id FROM keep_ids);

-- Schritt 4: Pipeline-Telemetrie TRUNCATE (kein Lern-Signal)
DELETE FROM council_runs;
DELETE FROM council_run_logs;
DELETE FROM council_run_summary;
