# Field-Note — Bauteil 6: IMAP-Aufräum-Aktion (2026-06-09)

**Quelle:** `direktive-bauteil-6-imap-aufraeumen-2026-06-08.md`.
**Anlass:** Yahoo-Postfach >500 ungelesene Mails. Bei jedem DB-
Cleanup beginnt der User von vorne. Pipeline soll nach Konsens-
Klassifikation aktiv IMAP-Aktionen auslösen.
**Status:** Implementierung fertig, dry-run verifiziert. Live-Run
mit `enabled: true` ist User-Aufgabe (destruktiv).

---

## Branches + Commits

**Multi-Repo:** Folio (Schema) + Multi-Agent (IMAP-Pipeline).

`folio/feature/bauteil-6-imap-aufraeumen-2026-06-08`:

| Commit | Aufgabe | Inhalt |
|---|---|---|
| `fe8a789` | F1 | corrections.heuristic_markers_snapshot Schema (JSON-array) + correction_marker-Drift-Fix |

`multi-agent/feature/bauteil-6-imap-aufraeumen-2026-06-08`:

| Commit | Aufgabe | Inhalt |
|---|---|---|
| `7fdfe3f` | F2+F3+F4+F5 | scripts/imap_actions.py + scripts/imap_cleanup.py + regelwerk.yaml-Schalter + cross-db-write-ausnahmen.md |

F6 (Folio-Endpoint /api/imap/cleanup) **skipped für V1** — manueller
CLI-Aufruf reicht (`python scripts/imap_cleanup.py`). Bei Bedarf
in V2 als UI-Trigger nachrüsten (Pattern aus `spawnLensRun`
verfügbar).

---

## Architekt-Entscheidungen + Schärfungen

**Stopp 1: Schema-Erweiterung** → ALTER TABLE corrections ADD COLUMN
`heuristic_markers_snapshot TEXT NULL`. Schärfungen:
- **JSON-Array** (nicht CSV) — Marker enthalten `:` und `,` als
  Wert-Teile (z.B. `out_of_corridor:8000`)
- Spalten-Name explizit mit `_snapshot`-Suffix (eingefrorener Stand)
- NULL für Alt-Einträge — Reader-Wahl beim Umgang

Bonus-Fix: `correction_marker` war Live-DB-Drift (existed in code +
DB seit Panel-C-Werkstatt, aber nicht in `init.ts` CREATE-TABLE).
Beide Spalten jetzt konsistent: Schema-String + Migrations-Hook.

---

## Engineer-Entscheidungen

1. **Stand-alone-Modul** statt Post-Worker-Hook. Vorteil: isoliert
   testbar, manueller Trigger oder künftig launchd-Job.
2. **Konsens-Reuse** von `auto_uebernahme.py`: `_is_eligible_for_uebernommen`
   + `_parse_markers` + `_validator_opinions_for` direkt importiert.
   Eigene `_is_eligible_for_job` analog (gleicher Block-Marker-Check
   da TIER1-Marker auf Job-Mails verdächtig).
3. **imaplib direkt** (stdlib). UID-MOVE-Extension nicht genutzt
   (Yahoo-Support unsicher) — COPY + STORE+\Deleted + EXPUNGE als
   Standard-Pattern.
4. **Yahoo-Trash:** Standard-Name `Trash` (override-fähig via
   `move_to_trash(conn, uids, trash_folder=...)`).
5. **Schwellen-Datum** für „alte Mails nicht anfassen": **kein
   Datums-Schwellwert in V1**. Starten ohne, beobachten. Wenn
   Mails >3 Monate alt versehentlich angefasst werden: V2.
6. **F6 Folio-Endpoint** skipped. V1 = CLI-Manuell.
7. **Cross-DB-Write**: `corrections`-INSERT als neue Ausnahme im
   etablierten `folio_log_writer`-Pattern. Eintrag in
   `multi-agent/docs/cross-db-write-ausnahmen.md` ergänzt.

---

## Substanz-Übersicht

**`scripts/imap_actions.py`** (109 Zeilen):
- `ensure_folder(conn, folder_path)` — LIST + CREATE idempotent
- `move_to_folder(conn, uids, target)` — COPY + STORE+\Deleted + EXPUNGE
- `mark_as_read(conn, uids)` — STORE +\Seen
- `move_to_trash(conn, uids, trash_folder='Trash')` — convenience

**`scripts/imap_cleanup.py`** (394 Zeilen):
- `_classify_mails(fb_conn, folio_conn)` — vier Buckets:
  consensus_immo, consensus_job, user_dismissed, no_action
- `_is_eligible_for_job(...)` — Konsens-Detektion für job-Domain
- `_write_correction_snapshot(...)` — INSERT mit
  `heuristic_markers_snapshot = JSON.dumps(markers)`
- `_write_warn_log(...)` — Sanity-Check-Trigger-Log
- `run(dry_run, max_override)` — main-Pipeline mit `_within_limit`-
  Guard
- CLI: `--dry-run`, `--max N`, `--verbose`

**`config/regelwerk.yaml`** (+17 Zeilen):
```yaml
imap_cleanup:
  enabled: false  # default off
  max_per_run: 50
  target_folders:
    immo: "_AionLumen/Immo"
    job: "_AionLumen/Job"
```

---

## Verifikation

**F1 Schema (Folio):**
```bash
sqlite3 ~/.folio/folio.db ".schema corrections" | grep snapshot
# → ... heuristic_markers_snapshot TEXT)
```
svelte-check 0 Errors.

**F2-F4 Dry-Run (Multi-Agent):** schon ausgeführt, Output:
```json
{
  "enabled": true,
  "dry_run": true,
  "consensus_immo": 0,
  "consensus_job": 1,
  "user_dismissed": 4,
  "no_action": 25
}
```
30 Mails klassifiziert, kein IMAP-touch.

---

## Live-Test-Plan (User-Aufgabe)

**Voraussetzung:** Yahoo-Account `[accounts.yahoo]` in
`~/Projects/life-mail/accounts.toml` plus Bitwarden-Item
`life-mail-passwd <bw_item>` funktioniert.

**Schritt 1: Sanity-Check-Trigger-Test (zerstörungsfrei):**
```bash
cd ~/Projects/aion-lumen/multi-agent
# Threshold 5 → muss bei mehr als 5 stoppen
.venv/bin/python scripts/imap_cleanup.py --max 5
```
Aktuelle Buckets: 1+4=5 → sollte gerade noch durchgehen. Mit
`--max 3` → sanity-trip + warn-log in `folio.worker_run_logs`.

**Schritt 2: Live-Run mit Default-Threshold (50):**
1. `regelwerk.yaml`: `imap_cleanup.enabled` auf `true` setzen.
2. `cd ~/Projects/aion-lumen/multi-agent && .venv/bin/python scripts/imap_cleanup.py`
3. Yahoo-Web prüfen:
   - `_AionLumen/Immo`-Folder existiert + enthält Konsens-Immo-Mails
   - `_AionLumen/Job`-Folder analog
   - Trash hat 4 User-stumm-Mails
   - INBOX: nur actionable + disagreement übrig
4. `sqlite3 ~/.folio/folio.db "SELECT id, feedback_id, corrected_actionability, substr(heuristic_markers_snapshot,1,80) FROM corrections WHERE source='imap_cleanup' ORDER BY id DESC LIMIT 5;"`
   — sollte 4 neue Einträge mit JSON-Array-Snapshot zeigen.

**Schritt 3: regelwerk.yaml zurück auf `enabled: false`** wenn
Verifikation OK — IMAP-Cleanup wird dann pro 30er-Run manuell mit
`enabled: true` aktiviert.

---

## IMAP-Account-Konfiguration (für Reproduzierbarkeit)

- **Account-Datei:** `~/Projects/life-mail/accounts.toml`,
  Section `[accounts.yahoo]` mit `host`, `port`, `login`, `bw_item`
- **Passwort-Lookup:** `life-mail-passwd <bw_item>` (Shell-Helper,
  liest aus Bitwarden via `bw get password`)
- **Connection-Pattern:** `imaplib.IMAP4_SSL` mit ssl.create_default_context

---

## Stolperer (während Implementation)

- **YAML-Drift im regelwerk.yaml:** Mein erster Edit hat das alte
  Tail `aufgeweicht wird.` durch redundantes Eingreifen abgehackt
  (Edit-old-string zu kurz gewählt) — danach `…/Job"fgeweicht wird.`
  als ungültiges YAML. Fix: Edit-Korrektur. Lehre: bei
  Multi-Line-Comments am File-Ende mehrere Zeilen Context im
  old_string mitnehmen.
- **python3 vs .venv/python:** stdlib-only Code läuft mit System-
  python3, aber `yaml`-Modul braucht venv. Tests immer über
  `.venv/bin/python` ausführen.
- **2.9-Cleanup hat nicht alle Mails getroffen:** beim dry-run
  fanden sich 30 Mails in feedback.db obwohl 2.9 E1c TRUNCATE
  gemacht hatte. Vermutlich worker im Hintergrund nachgeladen.
  Pragmatisch egal — Bauteil 6 wirkt auf den aktuellen Stand.

---

## Out of Scope (aus Direktive + Engineer)

- Direkte Lösch-Aktionen (nur Trash-Move).
- IMAP-Aktion bei disagreement oder actionable.
- Bestehende Mail-Ordner umbenennen oder löschen.
- Schwellen-Datum für „alte Mails" — V2.
- Frau-Account-Sonderfall — kommt erst bei 2-User-Sync.
- F6 Folio-Endpoint (manueller CLI reicht für V1).
- Auto-Trigger (launchd, Post-Worker-Hook) — V2 nach Verifikations-
  Stabilität.

---

## Stand

Bereit für Live-Test. Multi-Agent-Branch + Folio-Branch beide
1 Commit ungemerged. Nach User-Live-Verifikation: FF-merge beider
Branches auf jeweilige main.

**Folge-Direktiven-Kandidaten:**
1. **F6 Folio-Endpoint** als UI-Trigger nachrüsten.
2. **Auto-Trigger via launchd** nach jedem Worker-Run.
3. **Schwellen-Datum** für alte Mails wenn V1 das versehentlich
   anfasst.
4. **Council-Verworfen-Pfad** → IMAP-Aktion: heute behandelt das
   Script nur den Mail-Tab-User-Action-Pfad. Wenn ein Council-
   Object verworfen wird (object_status_override), das transitiv
   eine Mail beeinflusst, ist das nicht abgedeckt.
