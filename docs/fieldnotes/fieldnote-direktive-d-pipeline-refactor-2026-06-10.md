# Field-Note — Direktive D: Worker/Validator-Trennung (2026-06-10)

**Quelle:** Decision-Doc `cascade-validator-cleanup-decision-2026-06-11.md` Option **D (modifiziert)**.
**Anlass:** F10 — `validator_batch.py` lief doppelt pro Silent-Tranche (Cascade-Subprocess + Auto-Validator).
**Status:** Implementiert. Smoke-Run ist User-Aufgabe (LM Studio + Yahoo-IMAP).

---

## Ziel-Invariante

Heuristik + genau **eine** Validierung pro Tranche bei UI-Runs. Ein Run = eine Phase.
Orchestrierung vollständig in `folio/src/lib/server/worker-runner/manager.ts`.

```
manager.ts → production_worker.py (run_uuid A, nur Heuristik)
           → mail_ids aus worker_run_logs (classified)
           → validator_batch.py (--mail-ids, --account, run_uuid B, parent=A)
           → auto_uebernahme → imap_cleanup (yahoo + regelwerk gate)
```

---

## Änderungen (Substanz)

### aion-lumen/multi-agent

| Datei | Änderung |
|---|---|
| `scripts/production_worker.py` | Cascade-Block, `--cascade`, imap_cleanup-Hook entfernt |
| `scripts/validator_batch.py` | imap_cleanup-Subprocess nach `auto_uebernahme`; Logs `voice='cleanup'` |
| `tests/test_production_worker_smoke.py` | `--cascade` aus Help-Assertion entfernt |

### folio

| Datei | Änderung |
|---|---|
| `folio-db/init.ts` | `ALTER TABLE worker_runs ADD COLUMN parent_run_uuid` + Index |
| `folio-db/types.ts` | `parent_run_uuid`, `PipelineRunRow.children`, `cleanup` voice |
| `folio-db/writer.ts` | `insertWorkerRun` mit `parent_run_uuid` |
| `folio-db/reader.ts` | `getClassifiedMailIdsForRun`, Verlauf-Gruppierung Kind unter Parent |
| `worker-runner/manager.ts` | Auto-Trigger: `--mail-ids`, `--account`, `parent_run_uuid`; failed-Run bei Spawn-Fehler |
| `LiveDetail.svelte`, `+page.svelte` | `cascadePhase`-Dead-Code entfernt |
| `WorkerPanel.svelte` | Cascade-Label → „Validator auto" |
| `history/PipelineRunList.svelte`, `RunRow.svelte` | Nested Child-Runs im Verlauf |

---

## Verhaltens-Änderungen (akzeptiert)

- CLI `production_worker.py` = nur Heuristik; Validierung manuell via `validator_batch.py`.
- UI-Runs validieren weiterhin automatisch (Manager-Auto-Trigger).
- `imap_cleanup` nur nach Yahoo-Validator-Runs mit `regelwerk.imap_cleanup.enabled` (nicht nach leerem Worker).
- Cleanup-Logs: `voice='cleanup'` (Validator-Run), nicht mehr `imap_cleanup` im Worker.

---

## Grep-Proof (2026-06-10)

```bash
# Kein Cascade mehr in Produktionscode
rg '--cascade|cascade_|voice=.cascade|cascadePhase' \
  aion-lumen/multi-agent/scripts folio/src --glob '*.{py,ts,svelte}'
# → nur Docs/Fieldnotes (kein Runtime-Code)

# imap_cleanup nur noch in validator_batch
rg 'imap_cleanup' aion-lumen/multi-agent/scripts/production_worker.py
# → (leer)

rg 'imap_cleanup' aion-lumen/multi-agent/scripts/validator_batch.py
# → Hook nach auto_uebernahme
```

---

## Smoke-Checkliste (User)

1. UI: Silent-Run starten (z. B. 5 Mails).
2. Erwartung: genau **ein** Validator-Run danach (13 LLM-Calls, nicht 26).
3. Verlauf: Validator als eingerücktes Kind unter Worker-Card (`parent_run_uuid`).
4. DB: keine zweite `validated`-Serie für dieselben `mail_id` unter zweiter UUID mit gleichem Inhalt zur ersten.
5. Yahoo + `imap_cleanup.enabled`: `cleanup_started` / `cleanup_ok` am **Validator**-Run-Ende in `worker_run_logs`.

---

## Regression

- Manueller Validator-Run (Picker, scope unreviewed/all) unverändert.
- `pipelineInTransition`-Toast (BUG-J) unverändert.
- `npm run check` in folio: 0 errors.
