# Field-Note — Pipeline-Persistenz-Diagnose (2026-06-07)

**Quelle:** `direktive-pipeline-persistenz-diagnose-2026-06-07.md` +
`Pipeline redisign.zip` (Claude-Design-Handoff
`design_handoff_pipeline_fluss/`).
**Modus:** Read-only Diagnose. Kein Bau.
**Anlass:** Spec-Abgleich vor UI-Bau, damit Schema + Schreib-Hooks
sauber landen.

---

## Spec-Quelle

ZIP enthält:

| Datei | Inhalt |
|---|---|
| `Pipeline-Fluss.html` | High-Fidelity-Mockup der konsolidierten `/pipeline`-Seite (Naming-Drift: in der Direktive `pipeline-unified.html` genannt). |
| `Pipeline-Update · Notiz.html` | Design-Begründung + Persistenz-Specs (§4 Run-Logs, §6 Kampagne). |
| `README.md` | Selbsttragende Übersicht inkl. Schema-SQL. |
| `p-data.js` | Daten-Shapes mit konkreten Run/Live/Tally-Beispielen. |

### Spec-Schemata (verbatim aus README)

```sql
CREATE TABLE worker_run_logs (
  id INTEGER PRIMARY KEY,
  run_id INTEGER REFERENCES worker_runs(id),
  seq INTEGER, ts TEXT, voice TEXT, mail_id INTEGER,
  kind TEXT,                  -- classify | promote | object | block | info
  text TEXT, marker TEXT
);

CREATE TABLE worker_run_summary (
  run_id INTEGER PRIMARY KEY REFERENCES worker_runs(id),
  checked INTEGER, uebernommen INTEGER,
  actionable INTEGER, archive_silent INTEGER,
  objects_created INTEGER, markers_created INTEGER,
  blocks_json TEXT            -- {"job":9,"out_of_corridor":4,...}
);

CREATE TABLE hauskauf_workflow (
  id INTEGER PRIMARY KEY, object_id TEXT, status TEXT,
  viewing_date TEXT, negotiated_price INTEGER, note TEXT,
  actor TEXT, created_at TEXT
);
```

**Worker-Imports** sind explizit **keine** neue Tabelle — Projektion
aus `worker_run_logs WHERE kind='classify'` + `feedback`.

---

## A · Existing `worker_runs` (folio.db)

Schema steht seit längerem, 13 Spalten:

```sql
CREATE TABLE worker_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_uuid TEXT NOT NULL UNIQUE,
  account TEXT NOT NULL, board TEXT NOT NULL,
  mode TEXT NOT NULL,             -- 'learning' | 'silent' | 'validator'
  tranche_size INTEGER NOT NULL,
  pid INTEGER, status TEXT NOT NULL,
  started_at TEXT NOT NULL, ended_at TEXT,
  exit_code INTEGER, error_summary TEXT,
  mails_processed INTEGER DEFAULT 0
);
CREATE INDEX idx_worker_runs_started ON worker_runs(started_at DESC);
```

- **Schreiber:** ausschließlich `folio/src/lib/server/worker-runner/manager.ts`
  (UI-getriggerte Worker-Spawns über Pipeline-Page-Buttons).
- **Leser:** `folio/src/lib/server/folio-db/reader.ts` —
  `listRecentWorkerRuns(limit=20)`, `getWorkerRunByUuid(uuid)`,
  `getActiveWorkerRun()`.

Schema bleibt im Pre-Bauteil unverändert. Die zwei neuen Tabellen
hängen sich als 1:N (`worker_run_logs`) bzw. 1:1
(`worker_run_summary`) dran.

---

## B · Schreib-Hooks pro Worker-Typ

| Worker | Trigger | worker_runs-Eintrag heute? | Per-Mail-Logs heute |
|---|---|---|---|
| `production_worker.py` | UI-Spawn (mode=silent/learning) ODER CLI | ✓ UI; ✗ CLI | stdout `log.info`, im MemoryBuffer von manager.ts, nach Run weg |
| `validator_batch.py` | UI-Spawn (mode=validator) ODER CLI | ✓ UI; ✗ CLI | stdout `log.info("lens=%s i=%d uid=%d → ...")`, MemoryBuffer, weg |
| `auto_uebernahme.py` | Hook am Ende validator_batch.main() ODER CLI standalone | ✗ kein eigener Eintrag — läuft im run_uuid des validator_batch (gleicher Prozess) | stdout `log.info("promoted feedback_id=%d → uebernommen")` |
| `council/ingest_from_mail.py` | launchd `com.aionlumen.council-mail-ingest` :25 stündlich ODER CLI | ✗ kein worker_runs-Eintrag; Persistenz nur in `council.mail_ingest_acks` pro feedback_id | stdout + ACK pro Mail |
| `council/council_lens_run.py` | launchd 4h-Intervall ODER CLI | ✗ kein worker_runs-Eintrag; Lockfile `~/.council/lens-run.lock` + `getLensRunStatus` in folio | stdout per Persona; keine Per-Object-Persistenz |

### Befund Per-Mail-Logs

Heute komplett **ephemerer Stream** im MemoryBuffer von manager.ts
— nach Worker-Close weg. **Genau die Lücke, die `worker_run_logs`
schließen soll.**

### Schreib-Hook-Liste für Pre-Bauteil

Pro Worker müsste eine Log-Zeile pro Per-Mail-Event entstehen. Spec-
`kind`-Enum (`classify | promote | object | block | info`) mapped
direkt auf:

| Worker | kind | wann schreiben | text/marker-Substanz |
|---|---|---|---|
| production_worker | `classify` | pro INSERT in feedback | domain + actionability als compact-string |
| production_worker | `block` | wenn heuristic-Block-Marker greift | block-grund (tier1:projektiert, …) als marker |
| validator_batch | `info` (pro voice-load) | beim model-swap | voice-id (gemma/qwen/qwthink) |
| validator_batch | `classify` (pro voice × mail) | nach `write_opinion` | voice + (domain, actionability) |
| auto_uebernahme | `promote` | nach erfolgreichem UPDATE auf 'uebernommen' | mail_id, „4/4 stimmen einig" als text |
| council_ingest (body-parser-pfad) | `object` | nach `upsert_object` insert | object_id, address, plz als text |
| council_ingest (body-parser-pfad) | `block` | bei `out_of_corridor:*` / `body_parse_skipped:auto_reply` | marker |
| council_ingest (fetch-pfad) | `object` / `block` | analog | marker |

**Streng:** Worker dürfen weiterhin nur stdout schreiben (keine
Cross-DB-Writes von Python). Engineer-Empfehlung: stdout-Format
strukturieren (z.B. `[mail=638 kind=block marker=out_of_corridor:8000]`)
und in manager.ts via Regex-Parser extrahieren + in `worker_run_logs`
inserten. Damit bleibt die Ownership-Regel intakt (folio schreibt
folio.db, Python schreibt nur seine eigenen DBs).

Ausnahme bereits etabliert: `validator_batch.py` schreibt direkt in
`folio.db.validator_opinions`. Wenn Architekt das auch für
`worker_run_logs` zulässt, könnten die Worker direkt persistieren —
keine Parser-Logik nötig in manager.ts. Engineer-Wahl im Pre-Bauteil.

---

## C · Council-Lens-Indikator

User-Klarstellung in der Direktive: „Council-Lens: nur 'läuft / läuft
nicht'-Indikator nötig. Kein Per-Objekt-Live-Status."

**Existierende Infrastruktur deckt das voll ab:**
- `~/.council/lens-run.lock` mit `{pid, started_at}` JSON, geschrieben
  von `council_lens_run.py::run_with_lock` via
  `fcntl.flock(LOCK_EX | LOCK_NB)`.
- `folio/src/lib/server/lens-runner/status.ts::getLensRunStatus(config)`
  liest die Lockfile, prüft `process.kill(pid, 0)` für Liveness, räumt
  stale Locks auf, liefert `{running: true, pid, started_at,
  elapsed_seconds}` oder `{running: false}`.

→ **Kein zusätzlicher Eintrag in `worker_runs` nötig.** Reuse.

**Aber:** Spec-Mockup widerspricht. README §3 Datenfluss zeigt
Council-Lens als ember-pulsierenden Knoten mit Live-Substanz
„Stimme 2/3 · qwen". Das ist Per-Voice-Live-Detail (wie validator_batch),
nicht „nur läuft/läuft nicht". Siehe Klärung 3 unten.

---

## D · Migration-Risiko

### `worker_runs`
Bleibt unverändert. Verlauf-Loader liest weiter.

### `worker_run_logs` + `worker_run_summary`
Neu, additiv, **keine Konflikte mit Bestand**. Engineer-Anmerkungen:

1. **FK-Form** — Spec sagt `REFERENCES worker_runs(id)` (INTEGER).
   Folio-Pattern arbeitet konsequent mit `run_uuid` (TEXT). Engineer-
   Empfehlung: FK auf `run_uuid TEXT REFERENCES worker_runs(run_uuid)`
   ändern. Worker hat die `uuid` schon als CLI-Arg/env, müsste den
   numerischen `id`-Wert sonst extra holen.
2. **`seq INTEGER` ohne DEFAULT** — Caller muss inkrementieren. Eine
   Subquery `(SELECT COALESCE(MAX(seq),0)+1 FROM worker_run_logs WHERE
   run_uuid=?)` pro INSERT funktioniert, ist aber bei vielen Events
   nicht trivial. Alternative: Caller-Counter im manager.ts/Python-
   Side, der den seq als Argument liefert.

### `hauskauf_workflow` — 🚨 Schema-Konflikt mit Bauteil 2

**Existing (folio.db, läuft produktiv seit commit `7b0182a`
2026-06-05, aktuell 0 Datensätze):**

```sql
CREATE TABLE hauskauf_workflow (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  council_object_id TEXT NOT NULL,                  -- Spec: object_id
  status TEXT NOT NULL DEFAULT 'offen'
    CHECK(status IN ('offen','terminiert','besichtigt')),  -- Spec: offen|in_arbeit|erledigt
  termin TEXT,                                      -- Spec: viewing_date
  verhandlungspreis REAL,                           -- Spec: negotiated_price
  notes TEXT,                                       -- Spec: note
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),  -- Spec: created_at
  created_by_user_id INTEGER NOT NULL,              -- Spec: actor (TEXT)
  FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  CHECK ((status='offen') OR
         (status='terminiert' AND termin IS NOT NULL) OR
         (status='besichtigt' AND verhandlungspreis IS NOT NULL))
);
```

Spec-Variante (vermutlich vor 2026-06-05-Refactor entworfen, ohne
zu wissen dass die Tabelle schon da ist):

| Spec | Existing |
|---|---|
| `object_id` | `council_object_id` |
| `status IN (offen, in_arbeit, erledigt)` | `status IN (offen, terminiert, besichtigt)` |
| `viewing_date` | `termin` |
| `negotiated_price` (INTEGER) | `verhandlungspreis` (REAL) |
| `note` | `notes` |
| `created_at` | `recorded_at` |
| `actor` (TEXT, free-form) | `created_by_user_id` (INT FK auf users) |
| keine CHECK-Klausel | Status-bedingte Pflichtfeld-CHECK |
| kein Append-only-Hinweis | Append-only via recorded_at DESC + Index |

**Engineer-Empfehlung:** **(a)** Existing Tabelle behalten, Spec-
README-§Persistenz in dieser Sektion als veraltet markieren. Begründung:
- Existing Schema ist semantisch reicher (Status-CHECK + FK auf users).
- UI-Mapping macht `KampagneStatusPille.svelte` schon (terminiert →
  „Terminiert"). DB-Spalten-Namen sind Folio-intern.
- Bauteil 4 (Kampagne-Seite + Endpoint) ist auf die Existing-Spalten
  gebaut — Spec-Variante würde Folio-Code-Migration auslösen.

**Architekt-Entscheidung nötig** (siehe Klärung 1).

---

## E · Konsequenz — eine UI-Sicht, drei Substanz-Schichten

Direktive frug nach „Strom/Fluss/Werkbank-Konsequenz, drei
Darstellungen". Die Spec liefert **eine** Pipeline-Seite (`/pipeline`,
durchgehender Scroll, max 1240px) mit fünf Sektionen:

1. Page-Header (Status-Pille rechts oben)
2. Config-Bar (Account + „Jetzt prüfen")
3. **Datenfluss** (zwei Lanes mit Lit-Nodes)
4. Live-Run-Detail (Tally-Chips, Live-Log)
5. **Übergang → Kampagne** (Gate-Chip + Kanban)
6. **Verlauf** (kollabierbare Run-Einträge mit Auswertung +
   Block-Gründe + Worker-Imports + Run-Log)

Strom + Fluss + Werkbank sind in dieser einen Seite verschmolzen, nicht
drei separate Sichten. Die Persistenz-Spec (3 Tabellen) trägt alle
Sektionen.

### Engineer-Beobachtungen

- `worker_run_logs.kind`-Enum ist klar typisiert → reicht für UI-Color-
  Coding (Live-Log Spec: weiß=aktiv, grün=promote, ember=object,
  rot=block).
- `worker_run_summary.blocks_json` ist Free-Form-JSON (z.B.
  `{"job":9,"out_of_corridor":4}`) — flexibel für neue Block-Typen
  ohne Schema-Migration. Aggregate-Queries über Block-Typen werden
  später ggf. eine normalisierte `worker_run_blocks (run_uuid, kind,
  count)`-Tabelle brauchen. Für jetzt: JSON OK.
- **Worker-Imports** sind die wichtigste Schreib-Stelle: alle
  classify-Events müssen mail_id + Klassifikation in
  `worker_run_logs` schreiben, sonst kein Run-Detail-Aufklapp möglich.

---

## Empfehlung — Pre-Bauteil vorab

**Schema-Migration als Pre-Bauteil — empfohlen.** Trennung von der
UI-Direktive.

Begründung:
- Schema + Schreib-Hooks in den vier Worker-Skripten sind isoliert von
  der UI-Substanz (eigenständiger Branch, eigener Commit).
- UI-Bauteil profitiert: kann gegen echte Persistenz bauen, nicht
  gegen Schema-Mockup.
- Risiko-Trennung: wenn Schreib-Hooks Bugs haben, sichtbar in einem
  Run vor UI-Bau.
- Wachstums-Stelle: weitere Worker (council_ingest, council_lens_run)
  später nachgezogen ohne UI-Blocker.

### Pre-Bauteil-Scope

1. Schema-Add `worker_run_logs` + `worker_run_summary` in
   `folio/src/lib/server/folio-db/init.ts` (FK auf `run_uuid`).
2. Writer-Helper in `folio/src/lib/server/folio-db/writer.ts`:
   `insertWorkerRunLog`, `upsertWorkerRunSummary`.
3. **manager.ts** schreibt Logs im stdout-Stream-Hook (statt nur
   MemoryBuffer) plus Summary beim close.
4. **production_worker / validator_batch / auto_uebernahme** stdout-
   Format strukturieren (z.B. `[mail=638 kind=promote text=...]` als
   parsebares Pattern) — damit Manager die Per-Mail-Substanz
   extrahieren kann ohne Python-Cross-DB-Write.
5. Reader-Helper `getWorkerRunLogs(run_uuid)` +
   `getWorkerRunSummary(run_uuid)`.
6. ggf. **council_ingest** + **council_lens_run**: launchd-Skripte
   bekommen optional eigenen worker_runs-Eintrag (Klärung 2/3).

### UI-Bauteil (separate Folge-Direktive)

Baut die fünf-Sektionen-Pipeline-Seite gegen die dann fertige
Persistenz. Reuse-Komponenten aus dem Spec-Mockup (`p-shell.jsx` als
Referenz, nicht 1:1-Port da React vs Svelte).

---

## Klärungs-Bedarf an Architekt

### 1 · `hauskauf_workflow`-Schema-Konflikt
Spec definiert eine Tabelle, die in Bauteil 2 (commit `7b0182a`) schon
mit anderen Spalten-Namen + Status-Werten existiert. Engineer-
Empfehlung: existing behalten, Spec-README-Sektion als veraltet
markieren. Bestätigen oder Spec-Variante explizit fordern (dann
Migration nötig + Folio-Kampagne-Code anpassen).

### 2 · Council-Mail-Ingest in Pipeline-Verlauf?
launchd-`ingest_from_mail.py` hat heute keinen worker_runs-Eintrag.
Spec-README listet `Council-Ingest` als Typ (tone: ember, mode:
ingest) und zeigt eigene Lane im Datenfluss. Optionen:
- (a) Python-Skript schreibt eigenen worker_runs-Eintrag (Cross-DB-
  Write council → folio.db, Pattern via validator_opinions schon
  etabliert).
- (b) Folio-Cron poll-aggregiert `mail_ingest_acks`.
Engineer-Empfehlung: **(a)** für Konsistenz mit Validator-Spur.

### 3 · Council-Lens-Detail-Tiefe
**Widerspruch:** User-Direktive sagt „nur läuft/läuft nicht",
Spec-Mockup zeigt Per-Voice-Live-Detail („Stimme 2/3 · qwen"). Welche
Variante gilt?
- Wenn User-Klarstellung: reicht `lens-runner.getLensRunStatus`
  (existing), Mockup wird vereinfacht.
- Wenn Spec-Variante: Council-Lens braucht eigenen worker_runs-Eintrag
  + worker_run_logs-Hooks (wie validator_batch). Plus stdout-Parsing
  oder Python-Side-Cross-DB-Writes für die Voice-Substanz.

### 4 · `worker_run_logs.run_id` FK-Form
Spec sagt `REFERENCES worker_runs(id)` (INT). Folio-Pattern arbeitet
mit `run_uuid` (TEXT). Engineer-Empfehlung: FK auf `run_uuid TEXT`.
Bestätigen?

---

## Tag-0-Anker

| Eckdatum | Wert |
|---|---|
| Spec-ZIP empfangen | 2026-06-07, `~/Projects/Pipeline redisign.zip` |
| ZIP-Inhalt | 15 Files, 768 KB, `design_handoff_pipeline_fluss/` |
| Existing `worker_runs`-Schema | unverändert seit folio-init.ts ursprünglich, 13 Spalten |
| Existing `hauskauf_workflow`-Schema | refactored 2026-06-05 (commit `7b0182a`), append-only |
| `lens-runner.getLensRunStatus` | existing, lockfile-basiert, deckt „läuft/läuft nicht" voll ab |
| `manager.ts` Schreib-Pattern | ephemerer MemoryBuffer pro Run, nach Close weg |

---

## Stopp

Diagnose abgeschlossen. Architekt entscheidet:
- Pre-Bauteil vorab vs. integriert in UI-Direktive.
- Vier Klärungs-Punkte oben.
- Dann Engineer baut entsprechend.
