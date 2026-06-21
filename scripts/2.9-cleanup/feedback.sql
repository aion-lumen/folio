-- 2026-06-09 Bauteil 2.9 E1c: feedback.db = raw mails
-- Komplett TRUNCATE — werden bei nächstem worker-ingest neu.
-- Corrections.feedback_id wird zu toten refs, aber kein FK-constraint.
DELETE FROM feedback;
