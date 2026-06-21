# Field-Note — Direktive R: Public-Release Referenz-Fähigkeit (2026-06-11)

**Ziel:** folio + multi-agent als Referenz-Architektur für Public-Release und Consulting.
**Status:** Implementiert.

---

## Phasen

| Phase | Inhalt |
|---|---|
| 0 | aion-lumen Direktive D push (`d789706` → origin/main) |
| 1 | Example-Configs, personal YAML untracked, `docs/history/`, gitignore |
| 2 | `env.ts` / `paths.py`, quickstart + `demo_quickstart.json` |
| 3 | `scripts/migrations/`, `scripts/_archive/` |
| 4 | LICENSE, englisches README, folio README pipeline section, HTML superseded |
| 5 | pytest + vitest, GitHub Actions CI |

---

## Privacy

- `config/user_context.yaml`, `config/immo_whitelist.yaml` → gitignored; `*.example.yaml` tracked
- `folio.db` root → gitignored
- Git history: `state/*.db` snapshots in history (May 2026) — documented, no filter-repo (forensic snapshots, not live mail)

---

## Grep-Proof

```bash
# folio: homedir only in env.ts (+ user-local .local/.council lock paths)
rg 'homedir\(\)' folio/src --glob '*.ts' | rg -v env.ts

# multi-agent core: Path.home only in paths.py
rg 'Path\.home\(\)' multi-agent/scripts/production_worker.py multi-agent/scripts/validator_batch.py
# → (empty)

rg 'cascadePhase|--cascade' folio/src aion-lumen/multi-agent/scripts
# → (empty)
```

---

## Smoke

- `npm run check` + `npm run test` (folio)
- `pytest tests/ -q` (multi-agent, smoke e2e optional locally with venv)
- Demo: `docs/quickstart.md`

---

## User action

- Delete stray `folio/folio.db` in repo root if present (gitignored now)
- Set `FOLIO_HOME_PLZ` env if distance pill needed (hardcoded default removed from env.ts)
