# Field-Note — Pre-Bauteil Pipeline-Persistenz (2026-06-07)

**Quelle:** `direktive-pre-bauteil-pipeline-persistenz-2026-06-07.md`
(plus Diagnose-Field-Note 2026-06-07).
**Anlass:** Persistenz-Schicht für die UI-Pipeline-Ansicht. Isoliert
vom UI-Bau gebaut, damit die UI gegen fertige Substanz baut statt
gegen Schema-Mockup.
**Status:** Implementierung fertig, Smoke grün, **End-to-End-Live-Test
(30er-Mail-Run) ausstehend** (User-Aufgabe, braucht UI-Klick +
LM-Studio).

---

## Branches + Commits

Drei Repos, ein Branch-Name pro Repo (`feature/pipeline-persistenz-2026-06-07`):

| Repo | Commits | Inhalt |
|---|---|---|
| folio | `0cb5582`, `e775e94`, `bc0d767`, `1a8fb1f` | Schema (worker_run_logs + worker_run_summary), writer/reader-helper inkl. cross-DB-join, manager.ts run_uuid-Propagation, ROADMAP cross-ref |
| multi-agent | `7db066c→`, `9c95b49`, `1386fff`, `208a259` | folio_log_writer.py, Hook-Calls in 3 mail-side Workern (production_worker, validator_batch, auto_uebernahme), cross-db-write-ausnahmen.md |
| council | `7db066c`, `4fba1c3`, `4290dc1` | Schema (council_runs + council_run_logs + council_run_summary), db_v2 writer-helper, Hook-Calls in 2 launchd-Workern (ingest_from_mail, council_lens_run) |

---

## Architektur-Entscheidungen (Direktive-Vorgaben)

1. ✓ `hauskauf_workflow` bleibt wie aus Bauteil 2 (commit `7b0182a`).
   Spec-Variante aus pipeline-fluss-README als „superseded" markiert
   in der Diagnose-Field-Note.
2. ✓ Council-Mail-Ingest-Anzeige via Cross-DB read — kein Write.
3. ✓ Council-Lens nur „läuft / läuft nicht" via existing
   `getLensRunStatus`. Keine Per-Voice-Logs.
4. ✓ FK-Form: `run_uuid` (TEXT) als Folio-Pattern.
5. ✓ Cross-DB-Pattern Hybrid (User-Bestätigung): mail-side direkt,
   launchd-Worker lokal in council.db.

---

## Schema-Diff

### `folio.db` — additiv (worker_runs unverändert)

| Tabelle | Spalten | Indizes |
|---|---|---|
| `worker_run_logs` | id PK, run_uuid, seq, recorded_at, voice, mail_id, object_id, event_type, message, level | `idx_wrl_run_uuid_seq (run_uuid, seq)`, `idx_wrl_recorded (recorded_at DESC)` |
| `worker_run_summary` | run_uuid PK, geprueft, uebernommen, actionable, archive_silent, council_objects, marker_count, reason_breakdown (JSON), worker_imports_sample (JSON), written_at | — |

### `council.db` — additiv (V2.5)

| Tabelle | Spalten | Indizes |
|---|---|---|
| `council_runs` | run_uuid PK, run_type, started_at, ended_at, status, n_processed, exit_code, error_summary | `idx_council_runs_started (started_at DESC)` |
| `council_run_logs` | id PK, run_uuid, seq, recorded_at, voice, mail_id, object_id, event_type, message, level | `idx_crl_run_uuid_seq (run_uuid, seq)` |
| `council_run_summary` | run_uuid PK, geprueft, objects_created, marker_count, reason_breakdown (JSON), written_at | — |

`CREATE TABLE IF NOT EXISTS` Pattern — additiv, kein neuer Migration-
Hook nötig. Bestand komplett erhalten.

---

## Worker-Schreib-Hooks

### mail-side (multi-agent → folio.db, Cross-DB-Ausnahme)

| Worker | Datei | Hook | Event-Type |
|---|---|---|---|
| `production_worker.py::process_envelope` | nach `write_feedback_row` | `write_log(voice='heuristik')` mit mail_id=lastrowid | `classified` |
| `production_worker.py::main` | nach mainloop | `write_summary` mit cross-DB-feedback-aggregat | summary |
| `validator_batch.py::main` Voice-Loop | nach `write_opinion` | `write_log(voice=gemma\|qwen\|qwen-thinking)` mit mail_id | `validated` |
| `validator_batch.py::main` Run-Ende | nach auto_uebernahme-Hook | `write_summary` (nach auto-promote-Effekt sichtbar) | summary |
| `auto_uebernahme.py::promote_eligible` | pro promote | `write_log(voice='auto')` mit mail_id | `promoted` |
| `auto_uebernahme.py::promote_eligible` | pro no-fit (nur immo+actionable) | `write_log(voice='auto')` | `no_consensus` |

**run_uuid-Propagation:**
- manager.ts setzt `--run-uuid <uuid>` CLI-arg + `FOLIO_RUN_UUID` env.
- Python liest via `folio_log_writer.get_run_uuid_from_env_or_args(args.run_uuid)`.
- None bei CLI-Direkt-Aufruf → alle Hook-Calls no-op (kein Crash).

### council-side (lokal in council.db)

| Worker | Datei | Hook | Event-Type |
|---|---|---|---|
| `ingest_from_mail.py::main` | beim Start (vor `_run`) | `write_council_run(run_type='council-ingest', status='running')` | — |
| `ingest_from_mail.py::_handle_body_parser_mail` | nach ACK | `write_council_log(voice='council-ingest')` mit mail_id | `ingested` / `filtered_out_of_corridor` / `all_failed` (aus ack_status abgeleitet) |
| `ingest_from_mail.py::_run` | Run-Ende | `write_council_summary` mit reason_breakdown aus mail_inserat_markers (8 Marker-Prefix-Buckets) | summary |
| `ingest_from_mail.py::main` | im finally | `write_council_run(status='completed'/'failed', ended_at, exit_code, n_processed)` | — |
| `council_lens_run.py::main` | beim Lockfile-Acquire | `write_council_run(run_type='council-lens', status='running')` | — |
| `council_lens_run.py::main` | im finally | `write_council_run(status, ended_at, exit_code)` | — (keine Per-Voice-Logs) |

---

## Migration-Befund

**Risikolos.** Alle 5 neuen Tabellen sind via `CREATE TABLE IF NOT
EXISTS` additiv. Kein Refactor an existing Tabellen
(`worker_runs`, `mail_ingest_acks`, `hauskauf_workflow`,
`object_status_override` etc. unverändert).

Bestand:
- `worker_runs`: alle Reader (`listRecentWorkerRuns`,
  `getWorkerRunByUuid`, `getActiveWorkerRun`) lesen weiter wie heute.
- `mail_inserat_markers`: bleibt für Council-Worker Per-Inserat-Marker.
  `council_run_logs` ist parallel auf Run-Ebene (nicht redundant).

---

## Verifikation (Pre-Bauteil, ohne Live-Run)

**Schema-Smoke:** alle 5 Tabellen + Indizes existieren, korrekte
Spalten + Defaults. Verifiziert via `.schema` + `PRAGMA table_info`.

**Helper-Smoke** (synthetisch):
- `folio_log_writer.write_log` × 3 (heuristik / gemma / auto) +
  `write_summary` mit JSON-Felder → read-back grün, cleanup OK.
- `db_v2.write_council_run` (running + completed) + `write_council_log`
  + `write_council_summary` mit JSON → read-back grün, cleanup OK.

**TypeScript-Compile:** `svelte-check` 0 Errors / 35 Warnings (alte
Warnings, nicht aus Pre-Bauteil).

**Cross-DB-Reader-Helper:** TS-Code compiliert + Logic über
`listRecentCouncilRuns` / `getCouncilRunByUuid` / `getCouncilRunLogs` /
`getCouncilRunSummary` in `council-db/reader.ts` + Join in
`folio-db/reader.ts::listRecentPipelineRuns` /
`getPipelineRunDetail`. Live-Test mit echten Daten erst nach 30er-Run.

---

## End-to-End-Live-Test (2026-06-08, verifiziert)

User hat 30er-Run gefahren, Engineer hat council-ingest +
council_lens_run nachgezogen. Ergebnisse:

### Mail-side (run_uuid `983bde1e...` silent + `39eac532...` validator)

```
worker_run_logs:
  classified (heuristik):   30
  validated  (gemma):       30
  validated  (qwen):        30
  validated  (qwen-thinking): 30
  promoted   (auto):         7
  → total 127 Logs, exakt wie erwartet (30 + 90 + 7)

worker_run_summary:
  silent-run:    geprueft=30 uebernommen=0  actionable=13 archive_silent=17
  validator-run: geprueft=30 uebernommen=7  actionable=6  archive_silent=17
  → validator schreibt nach auto_uebernahme-Effekt (7 promoted sichtbar)
  → worker_imports_sample JSON valide mit 15 Sample-Mails
  → reason_breakdown leer (keine Block-Marker bei diesen 30 Mails — korrekt)
```

### Council-side (run_uuid `74453088...` ingest + `83be5919...` lens)

```
council_runs:
  council-ingest: status=completed n_processed=7
  council-lens:   status=completed n_processed=0  (User-Klarstellung)

council_run_logs:
  ingested (council-ingest): 5

council_run_summary (council-ingest):
  geprueft=7 objects_created=10 marker_count=13
  reason_breakdown = {
    "no_image_in_body": 5,
    "corridor_check_skipped": 6,
    "expired": 1,
    "corridor_match_fuzzy": 1
  }  → JSON valide, deutsche Marker-Keys
```

### Cross-DB-Reader-Verifikation (vereinheitlichte Pipeline-Verlauf-Liste)

```
2026-06-07 22:52:55  council  council-lens     83be5919  n=0   completed
2026-06-07 22:52:23  council  council-ingest   74453088  n=7   completed  [obj=10 mark=13]
2026-06-07 22:33:36  mail     validator        39eac532  n=0   completed  [ueb=7 act=6 sil=17]
2026-06-07 22:32:46  mail     silent           983bde1e  n=30  completed  [ueb=0 act=13 sil=17]
2026-06-07 22:25:04  council  council-ingest   6ad38a0d  n=0   completed
2026-06-07 12:56:49  mail     validator        22aaec94  n=0   completed
…
```

### Live-Test-Befund: Date-Sort-Bug + Fix (commit `cf31928`)

Erster Reader-Smoke sortierte council-runs faelschlich als „älter":

- mail-side schreibt ISO mit `'T'`: `'2026-06-07T22:33:36.208Z'`
- council-side via SQLite `datetime('now')`: `'2026-06-07 22:52:23'`
- String-Sort: `'T' (0x54) > ' ' (0x20)` → mail-side als „newer" sortiert,
  obwohl council-runs später liefen.

Fix in `folio-db/reader.ts::listRecentPipelineRuns`: `parseTs(s)`
ersetzt Leerzeichen durch `'T'` und nutzt `Date.parse` für
numerischen Vergleich. Re-Run grün (siehe Tabelle oben).

---

## End-to-End-Test-Anleitung (für Folge-Runs)

Direktive-Erfolgskriterium braucht echten 30er-Mail-Run + Council-Lens-
Smoke. **Engineer kann das nicht selbst auslösen** (UI-Klick, LM-Studio,
ggf. echte Mails).

Vorgehen:

```bash
# 1. Folio dev-server neu starten (Schema-Init triggert die zwei neuen
#    Tabellen, falls die DB älter ist).
# Im Browser: vite dev läuft, neue Schema-Apply beim ersten Request.

# 2. UI-Klick: 30er-Mail-Run starten (mode=silent).
#    → production_worker + validator_batch + auto_uebernahme laufen,
#      schreiben in worker_run_logs / worker_run_summary.

# 3. Manuell council ingest (oder warten auf launchd :25):
cd ~/Projects/aion-lumen/council && source .venv/bin/activate
python scripts/ingest_from_mail.py --write-db
# → schreibt in council_runs / council_run_logs / council_run_summary.

# 4. Manuell council_lens (smoke ohne LLM):
python scripts/council_lens_run.py --no-llm --skip-borda
# → schreibt 1 row in council_runs (run_type='council-lens').
```

**SQL-Checks nach Run:**

```sql
-- folio.db: Pipeline-Run-Logs
SELECT COUNT(*) FROM worker_run_logs WHERE event_type='classified';  -- ≥30
SELECT COUNT(*) FROM worker_run_logs WHERE event_type='validated';   -- ~90 (30 × 3 voices)
SELECT COUNT(*) FROM worker_run_logs WHERE event_type='promoted';    -- ≤30
SELECT geprueft, uebernommen, actionable, archive_silent, reason_breakdown
  FROM worker_run_summary ORDER BY written_at DESC LIMIT 1;
-- reason_breakdown muss gültiges JSON sein

-- council.db:
SELECT run_type, status, n_processed, started_at, ended_at FROM council_runs
  ORDER BY started_at DESC LIMIT 5;
SELECT COUNT(*) FROM council_run_logs;
SELECT geprueft, objects_created, marker_count, reason_breakdown
  FROM council_run_summary ORDER BY written_at DESC LIMIT 1;
```

**JSON-Validity-Check:**

```bash
sqlite3 ~/.folio/folio.db \
  "SELECT reason_breakdown FROM worker_run_summary ORDER BY written_at DESC LIMIT 1" \
  | python3 -m json.tool
```

---

## Cross-DB-Ausnahmen-Doku

Neue zentrale Dokumentation:
`aion-lumen/multi-agent/docs/cross-db-write-ausnahmen.md` (commit
`208a259`).

**4 Tabellen-Liste** (alle mail-side multi-agent → folio.db):
1. `validator_opinions` — etabliert 2026-05-26 (Direktive F.8 Block-E).
2. `worker_run_logs` — neu in diesem Pre-Bauteil.
3. `worker_run_summary` — neu in diesem Pre-Bauteil.
4. `worker_runs` — **keine multi-agent-Ausnahme** (Folio schreibt das
   selbst via manager.ts beim UI-Spawn). Python kriegt run_uuid nur als
   CLI-arg + env-fallback.

**Council-side:** kein Cross-DB-Write. Folio liest cross-DB.

**Cross-Reference:** `folio/docs/ROADMAP.md` neue Architecture-Sektion
mit Link auf die Liste (commit `1a8fb1f`).

---

## Engineer-Wahl beim Schema-Naming

Direktive erwähnt sowohl Englisch (`checked`, `uebernommen`) als auch
Deutsch (`geprüft`, `übernommen`) in den Spec-Vorschlägen. Engineer-
Wahl:

- **`geprueft`** (deutsch, ohne Umlaut) — konsistent mit
  `uebernommen` (Direktive verwendet diese Schreibweise). Umlaute in
  Spalten-Namen vermeiden für SQLite-Portabilität.
- **`reason_breakdown`** (englisch, JSON-Schlüssel deutsch:
  `out_of_corridor`, `auto_reply`, etc.) — Spalten-Name englisch
  konsistent mit etablierter Konvention; JSON-Inhalt deutsch
  konsistent mit Marker-Namen.

---

## Out of Scope (Folge-Bauteil)

- **UI-Implementation** der Pipeline-Ansicht (Pipeline-Fluss-Spec
  aus Claude Design ZIP). Kommt als separate Direktive — baut auf
  dem hier fertiggestellten Reader (`listRecentPipelineRuns` +
  `getPipelineRunDetail`) auf.
- Live-Polling vom Frontend (Reader-Pattern, SSE oder Pull).
- Voice-Live-Detail für Council-Lens (User-Klarstellung: nur „läuft").
- worker_imports_sample-Schema-Normalisierung (bleibt JSON, ggf.
  später eigene Tabelle wenn Aggregat-Queries das brauchen).

---

## Reihenfolge FF-Merge (auf Architekt-Anweisung)

Reihenfolge spielt keine kritische Rolle (alle Schemas additiv, keine
Code-Cross-Dependencies). Pragmatisch:

1. **multi-agent** `feature/pipeline-persistenz-2026-06-07` →
   `b0627f3..208a259` (3 Commits: folio_log_writer + Worker-Hooks +
   Doku).
2. **council** `feature/pipeline-persistenz-2026-06-07` →
   `c2a6a05..4290dc1` (3 Commits: Schema + Writer + Worker-Hooks).
3. **folio** `feature/pipeline-persistenz-2026-06-07` →
   `a0089ea..1a8fb1f` (4 Commits: Schema + Writer/Reader +
   manager.ts + ROADMAP cross-ref).

Nach jedem Merge: `git push origin main`. Branch lokal löschen.
