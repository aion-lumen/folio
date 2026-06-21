---
name: Public-Release Referenz-Direktive
overview: "Direktive R (Release-Readiness): ausstehenden aion-lumen-Push abschließen, dann beide Repos referenz-fähig machen — Privacy-Audit, Portabilität, Scripts-Konsolidierung, Lizenz/README, Tests + CI."
todos:
  - id: r0-push-aion
    content: "Phase 0: aion-lumen commit (3 gestagte Direktive-D-Files) + push origin main"
    status: completed
  - id: r1-privacy-configs
    content: "user_context/immo_whitelist: example-Configs einchecken, echte enttracken + gitignoren"
    status: completed
  - id: r1-repo-hygiene
    content: Projektgeschichte nach docs/history/, gitignore Zips/Backups, folio.db ignorieren, Historie-Scan
    status: completed
  - id: r2-paths-folio
    content: "folio env.ts: alle homedir()-Hardcodes als Env-Getter zentralisieren (~12 Dateien)"
    status: completed
  - id: r2-paths-python
    content: multi-agent scripts/paths.py + Kern-Skripte umstellen (~8 Dateien)
    status: completed
  - id: r2-demo-quickstart
    content: Fixture-JSON + docs/quickstart.md (Demo-Lauf ohne IMAP/LLM)
    status: completed
  - id: r3-scripts-konsolidierung
    content: "scripts/ aufteilen: Kern / migrations/ / _archive/ + Referenz-Grep + Smoke"
    status: completed
  - id: r4-license-readme
    content: multi-agent LICENSE + englisches README (Systemkarte), folio README-Update, HTML-Superseded-Banner
    status: completed
  - id: r5-tests
    content: "pytest: Regelwerk-Loader + auto_uebernahme; folio: vitest + manager/reader-Tests"
    status: completed
  - id: r5-ci
    content: "GitHub-Actions-Workflows: folio (check+vitest), multi-agent (ruff+pytest)"
    status: completed
  - id: r6-fieldnote
    content: Field-Note Direktive R + Grep-Proof + Abschluss-Checks
    status: completed
isProject: false
---

# Direktive R — Public-Release Referenz-Fähigkeit (Vollpaket)

**Ziel:** folio + aion-lumen/multi-agent als Referenz-Architektur für Public-Release und Consulting (Option 1). Ein externer Leser kann das System verstehen, klonen und im Demo-Mode laufen lassen, ohne persönliche Daten zu sehen.

## Phase 0 — Ausstehender Push (aion-lumen/multi-agent)

Ist-Stand verifiziert: die drei Direktive-D-Dateien sind **gestaged, aber nicht committet** (`scripts/production_worker.py`, `scripts/validator_batch.py`, `tests/test_production_worker_smoke.py`); keine unpushed Commits auf `main`.

- Commit nur der drei gestagten Dateien (Message im Repo-Stil, z. B. „Direktive D (multi-agent): Cascade raus, imap_cleanup → validator_batch"), dann `git push origin main` — als **getrennte Befehle** (der Compound-Befehl war der Blocker beim letzten Versuch).
- `state/watchdog_state.json` (unstaged, Runtime-State) bleibt unangetastet.

## Phase 1 — Privacy & Repo-Hygiene (Blocker)

**multi-agent:**
- `config/user_context.yaml` (enthält `home_plz: 8000` + Lebens-Prioritäten) und `config/immo_whitelist.yaml` (Wohn-/Pendel-Korridor): je ein `*.example.yaml` mit neutralen Platzhaltern einchecken, echte Dateien via `git rm --cached` enttracken + gitignoren. Loader-Fallbacks (`DEFAULT_CONTEXT` in `domain_actionability.py`) existieren bereits — kein Code-Umbau nötig, README-Hinweis „copy example → real".
- Projektgeschichte nach `docs/history/` verschieben (git mv): `phase-*.md` (~20 Dateien), `*-report-*.md`, `handoff-2026-05-15.md`, `mini-shai-hulud-audit*.md`, Root-Befund-Docs. `cc-prompt-*.md` sind bereits gitignored.
- `.gitignore` ergänzen: `*.zip`, `state/*.bak*`, `folio-mail/` (untracked Handoff-Zips + DB-Backups bleiben lokal, kommen nie ins Repo).
- Git-Historie-Scan auf versehentlich committete Secrets/Mail-Daten (`git log --all --name-only` + Pattern-Check auf `.env`, `*.db`, Tokens). Befund dokumentieren; `git filter-repo` nur falls nötig (dann User-Rückfrage).

**folio:**
- `/folio.db` in `.gitignore` (liegt heute untracked im Root; Live-DB ist `~/.folio/`). Stray-File dem User zur Löschung melden, nicht selbst löschen.

## Phase 2 — Portabilität

- **folio:** [src/lib/server/env.ts](folio/src/lib/server/env.ts) hat bereits `getFeedbackDbPath()`/`getFolioDbPath()` mit Env-Override — dieses Pattern auf alle ~12 Dateien mit `homedir()`-Hardcodes ausweiten: `AION_LUMEN_PATH`, `COUNCIL_DB_PATH`, `LIFE_MAIL_PATH` etc. als Getter in env.ts, Konsumenten umstellen ([manager.ts](folio/src/lib/server/worker-runner/manager.ts), council-db/reader + cluster-substance + portals, regelwerk/loader, lens-config, time-decay, life-mail-Routes). Defaults = heutige Pfade, Verhalten unverändert.
- **multi-agent:** neues `scripts/paths.py` (STATE_DIR, FEEDBACK_DB, FOLIO_DB, ACCOUNTS_TOML, CONFIG_DIR aus Env-Vars mit heutigen Defaults). Nur die ~8 Kern-Skripte umstellen (production_worker, validator_batch, imap_cleanup, auto_uebernahme, folio_log_writer, domain_actionability, immo_heuristic, sender_heuristic) — Migrations-/Audit-Skripte bleiben wie sie sind (wandern in Phase 3 ins Archiv).
- **Demo-Quickstart:** `--imap-fixture` existiert — ein Fixture-JSON (5–10 synthetische Mails) + dokumentierter Demo-Lauf (`worker --imap-fixture --dry-run` → Heuristik ohne IMAP/LLM; optionaler Validator-Schritt mit LM Studio). Als `docs/quickstart.md` + Abschnitt im README.

## Phase 3 — Scripts-Konsolidierung (multi-agent)

53 Skripte in `scripts/` aufteilen:
- `scripts/` (Kern, ~10): die Pipeline-Skripte aus Phase 2 + learners + telemetry.
- `scripts/migrations/`: `migrate_*`, `backfill_*`, `apply_diagnoses`, `delete_yahoo_pre_reset`, `export_pre_reset_yahoo`.
- `scripts/_archive/` (existiert): `audit_*`, `diagnose_*`, `probe_*`, `sample_*`, `pilot_*`, einmalige Forensik.
- Nach jedem Move: Grep auf Importe/Subprocess-Referenzen (`folio/manager.ts` referenziert nur `production_worker.py` + `validator_batch.py`), Smoke-Test.

## Phase 4 — Lizenz + READMEs (englisch)

- **multi-agent:** README sagt heute „Private, all rights reserved. No public distribution" und beschreibt den Mai-Stand (Phase 3.5c, Cascade). Komplett neu auf Englisch: Systemkarte (folio ↔ multi-agent ↔ council, drei DBs, wer liest/schreibt was — Basis: `docs/cross-db-write-ausnahmen.md`), aktuelle Architektur (Direktive D: Manager-orchestrierte Kette), Quickstart-Link. LICENSE-Datei ergänzen (gleiche wie folio).
- **folio:** README um Systemkarte/Mermaid + Verweis auf multi-agent ergänzen.
- `docs/architecture/pipeline-cascade-validator-2026-06-11.html` mit „Superseded by Direktive D"-Banner markieren (zeigt noch Cascade-Stand).
- Deutsche Inline-Kommentare bleiben bewusst deutsch (konsistent > halb übersetzt).

## Phase 5 — Tests + CI

- **multi-agent (pytest, existierende Suite erweitern):** Regelwerk-Loader-Validierung, `auto_uebernahme`-Konsens-Logik (tmp-SQLite-Fixtures), Worker-Smoke bleibt.
- **folio:** vitest einrichten (kein Test-Runner vorhanden). Erste Unit-Tests: `manager.ts`-Kettenpfad (mail-ids-Handoff, failed-Run bei Spawn-Fehler — Fake-Spawn) + `reader.ts` Verlauf-Gruppierung (parent/child).
- **CI:** je Repo ein GitHub-Actions-Workflow — folio: `npm run check` + `vitest run`; multi-agent: `ruff check` + `pytest`.

## Abschluss

- Field-Note nach etabliertem Muster (`fieldnote-direktive-r-release-readiness-…`), Grep-Proof (kein `homedir()`-Hardcode außerhalb env.ts/paths.py, kein PII in tracked Configs), `npm run check` 0 errors, pytest grün.
- Commits pro Phase, Push erst nach User-Freigabe (Phase 0 ausgenommen — der ist explizit beauftragt).

## Risiken

- Phase 3 (Script-Moves) kann versteckte Referenzen brechen → Grep vor jedem Move, Smoke nach jedem Batch.
- Git-Historie-Scan kann Funde ergeben, die `filter-repo` (History-Rewrite, Force-Push) erfordern → dann Stopp + Rückfrage.