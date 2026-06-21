# Field-Note — Direktive Mock Data & Release Screenshots (2026-06-11)

**Direktive:** `directive-mock-data-screenshots.md` (pre-release content work, public-ready beide Repos).
**Status:** Phase A + Phase B abgeschlossen. PII-Grep + Push pending auf Architekten-Freigabe.

---

## Zusammenfassung

Folio + multi-agent für public-release aufbereitet:
- **Fiktive Persona** Alex + Maya (Lissabon, Algarve-Hauskauf-Suche) in den untracked Real-Config-Files
- **Isolierte Demo-DBs** (`~/.folio/folio-demo.db`, `~/.council/council-demo.db`, `state/feedback-demo.db`) damit private Daten beim Demo-Render nie auftauchen
- **8 kanonische Screenshots** in `docs/screenshots/release/` + Einbettung in beide READMEs
- **folio LICENSE** auf kanonische AGPL-3.0 umgestellt
- **One-Command Demo-Seed:** `make demo` + `bash folio/scripts/demo-server.sh` auf Port 5174

---

## Phase A — Mock Persona + Demo-Seeding

### Inventory nach `make demo`

```
council-demo.db    7 objects · 18 rankings · 1 cluster (2 members) ·
                   9 lens_comparisons · 2 council_runs · 6 consolidated_top10
folio-demo.db      2 worker_runs · 21 logs · 15 validator_opinions ·
                   2 worker_run_summary · 2 object_overrides · 3 hauskauf_workflow
feedback-demo.db   40 mails (uids 90001-90040, 5 domains)
```

### Persona — Alex + Maya

Konfig in `multi-agent/config/user_context.yaml` (untracked, gitignored seit R):
- Alex (34, Softwareengineer, Munich → Lissabon Ende 2025, SaaS-Validation, B1-Portugiesisch — existierte schon in `folio/templates/demo-vault/_campaign/`)
- Maya (32, Yoga-Lehrerin + freelance Übersetzerin, Lissabon, German native)
- home_plz: 8000 (Faro), Algarve-Korridor als `immo_whitelist.yaml`

Reale Mai-Inhalte (PLZ 8000, reale Lebens-Prio) gesichert nach `state/*-real-backup-2026-06-11.yaml.bak`, gitignored.

### Course-Correction A.7 — Isolation + Photos + Provenance

Owner-Review nach erster Phase-A-Inventory fand drei Probleme:

1. **Keine DB-Isolation** — Demo-Rows wurden direkt in die echten DBs inseriert. Owner sah private Daten gemischt mit Demo-State.
2. **Keine Photos** — `photo_url` zeigte auf nicht-resolvende `https://idealista.example/...`-Hosts.
3. **„Provenance-Pill" ungeklärt** — Term aus dem Inventory verwendet, ohne Erklärung. Tatsächlich: kleine „via homegate"-Badge im DetailPanel auf Cluster-Sibling-Karten (`CouncilDetailPanel.svelte:204`, kommt aus `note_provenance.kind === 'inherited'`).

**Fixes:**
- A.7.1 `make demo-clean` gegen die echten DBs (entfernt Demo-Rows, lässt private Daten unberührt)
- A.7.2 `init_demo_dbs.sh`: klont SCHEMA via `sqlite3 .schema | sqlite3` von echten DBs nach `*-demo.db` (kein Datentransfer)
- A.7.3 `folio/scripts/demo-server.sh`: setzt `FOLIO_DB_PATH/COUNCIL_DB_PATH/FEEDBACK_DB_PATH/VAULT_PATH/FOLIO_HOME_PLZ/LAT/LNG/CITY` env vars und startet vite dev auf Port 5174 (parallel-fähig mit real-dev-server auf 5173)
- A.7.4 Sechs Midjourney-PNGs (1.5-1.9 MB pro File, 1024×1024) in `folio/static/demo-assets/photos/` — vom Owner über MJ-Pro-Account generiert basierend auf 6 Algarve-Real-Estate-Prompts
- A.7.5 `object_clusters` + `cluster_members` für Olhão-Pair in `council.db` plus `object_status_override` + `object_notes` mit source='user_action' für cluster-a — triggert die Inheritance-Display auf cluster-b

### Iterations 2+3 — Viewport + Domain-Chips

**Iteration 2 — Wide viewport:** vorige Shots in 800×500@2x rendered (= 1600×1000 Output) — Layout zu eng, Content cropped. Direktive spec war „1600×1000 logical, 2x scale". Playwright-config korrigiert auf 1600×1000 logical + DPR=2 → 3200×2000 PNG. Shot 07 explizit auf `.kboard`-Region geclippt sonst identisch mit Shot 02.

**Iteration 3 — Domain-Chips:** Mail-Queue zeigte nur graue Action-Text-Pillen statt farbiger DOMAIN-Chips + Emojis. Root cause: `MailList.svelte:148` rendert anders je nach `r.domain` (`null` → Legacy-Action-Text). Mein `seed_pipeline_demo.py` INSERT setzte nur `heuristic_suggested_action` aber nicht die neueren columns `domain`/`actionability`/`effective_actionability`/`mail_date`. INSERT erweitert, re-seed, Shot 01 zeigt jetzt korrekt:
- Immo (rot) · Job (lila) · Shopping (orange) · Finance (grün) · Werbung (orange) · Kontakt (pink) — farbige Domain-Chips
- Action-Emojis (→ ✓ ✗ ⌫) neben jedem Domain-Chip
- H/L1/L2/L3 Voice-Stripes für die 5 Mails mit Validator-Opinions

---

## Phase B — Screenshots + READMEs + LICENSE

### Acht Shots (`folio/docs/screenshots/release/<NN>-<area>-20260611.png`)

| # | Area | Wie capture'd |
|---|---|---|
| 01 | mail-queue | direkt /mail-queue, 40 demo mails |
| 02 | pipeline-idle | /pipeline, Stillstand, last-run dimmed |
| 03 | pipeline-validator | `add_midrun_snapshot.py --add-validator` (5+5+3 partial logs), `qwen-thinking` LÄUFT 3/3 |
| 04 | pipeline-lens | `add_midrun_snapshot.py --add-lens` mit `--pid $(playwright PID)` (lockfile braucht live PID damit `getLensRunStatus` nicht stale erkennt), 1/3 done · 1/3 evaluating · 1/3 pending |
| 05 | verlauf-detail | /pipeline, `defaultOpen` öffnet ältesten worker mit summary, BlockBreakdown rendert 4 reasons (decay 4, out_of_corridor 1, price_on_request 1, projektiert 1) |
| 06 | council | /council, 7 Algarve-Objekte mit Midjourney-Photos, Borda-Ränge, Voice-Stripes |
| 07 | hauskauf | /pipeline geclippt auf `.eyebrow KAMPAGNE` → `.kboard` end (Offen/In Arbeit/Erledigt) |
| 08 | heute | /, Heute-Dashboard cards |

Viewport: 1600×1000 logical, DPR=2, locale `de-DE`, color-scheme `light`. Output PNGs alle 3200×2000 (außer 07 geclippt). Total disk: 3.1 MB.

### Spec-Files
- `folio/tests/e2e/screenshots.spec.ts` — Shots 1,2,5,6,7,8 gegen completed demo-state
- `folio/tests/e2e/screenshots-midrun.spec.ts` — Shots 3,4 mit `add_midrun_snapshot.py`-orchestrator (beforeEach/afterEach add+clean für State-Isolation)

### Mid-Run-Helper

`multi-agent/scripts/add_midrun_snapshot.py`:
- `--add-validator`: fügt `demo-midrun-validator-snapshot` worker_run mit `status='running'` + 13 partial validated logs (5+5+3) in folio-demo.db
- `--add-lens`: schreibt `~/.council/lens-run.lock` (mit Caller-PID via `--pid` damit lockfile nicht-stale erkannt wird) + fake `lens-run-ui-demo-midrun.log` mit baumeister=done, rechner=evaluating, ortskundige=pending
- `--clean`: entfernt alle midrun-Rows + lockfile + log

Wichtig: log-prefix muss `lens-run-ui` sein (per `lens-config.server.ts:18`), nicht `council_lens_run`.

### README-Embeds

- `folio/README.md`: alle 8 Shots nach Quick-Start-Sektion, jeweils mit deutscher Caption + width=720 (für GitHub-Rendering)
- `multi-agent/README.md`: drei pipeline-relevante (2, 3, 5) mit absoluten github.com/aion-lumen/folio/raw URLs (Single-Source-of-Truth)

### LICENSE

`folio/LICENSE` von MIT auf kanonische AGPL-3.0 v3 Volltext (235 Zeilen, von SPDX-license-list-data) + CC-BY-4.0-Klausel für Design-Assets. GitHub erkennt jetzt „AGPL-3.0" statt „Other".

`multi-agent/LICENSE` bleibt canonical MIT (unverändert).

---

## Touched files

### Folio (tracked changes)
- `LICENSE` — MIT → AGPL-3.0 canonical
- `README.md` — Screenshots-Sektion mit 8 embedded
- `package.json` + `package-lock.json` — `@playwright/test` devDependency
- `playwright.config.ts` — neu
- `tests/e2e/screenshots.spec.ts` — neu, 6 shots
- `tests/e2e/screenshots-midrun.spec.ts` — neu, 2 shots
- `scripts/demo-server.sh` — neu, isolated demo-server-wrapper
- `static/demo-assets/photos/*.png` — 6 Midjourney-PNGs
- `static/demo-assets/photos/*.svg` — 6 SVG-Fallbacks (kann später entfernt werden)
- `docs/screenshots/release/0[1-8]-*.png` — 8 release-Shots
- `docs/fieldnotes/fieldnote-direktive-mock-data-screenshots-2026-06-11.md` — diese Notiz

### Multi-agent (tracked changes)
- `README.md` — Screenshots-Sektion mit 3 pipeline-relevante
- `docs/quickstart.md` — `make demo` Sektion + Inventory
- `tests/fixtures/imap/demo_quickstart.json` — 2 → 40 fixture mails
- `Makefile` — neu, demo/demo-force/demo-clean/inventory targets
- `scripts/init_demo_dbs.sh` — neu, schema-clone real → demo
- `scripts/seed_council_demo.py` — neu, 7 council objects + cluster
- `scripts/seed_pipeline_demo.py` — neu, 40 feedback rows + 2 worker_runs + opinions + overrides + hauskauf
- `scripts/add_midrun_snapshot.py` — neu, validator + lens mid-run helper
- `scripts/fetch_demo_photos.py` — neu, picsum-fallback (nicht verwendet — Owner liefert Midjourney)

### NICHT tracked (per gitignore seit Direktive R)
- `multi-agent/config/user_context.yaml` — Alex+Maya Mock (lokal)
- `multi-agent/config/immo_whitelist.yaml` — Algarve-Korridor (lokal)
- `state/*-real-backup-2026-06-11.yaml.bak` — Owner's reale Mai-Configs (gitignored)
- `~/.folio/folio-demo.db`, `~/.council/council-demo.db`, `multi-agent/state/feedback-demo.db` — Demo-DBs

---

## Pending

### Pre-Publish Owner-Actions

1. **PII-Grep + History-Scan** (Direktive Acceptance §3+§4):
   - Owner liefert privat (nicht in Files speichern) reale PLZ + Namen + Mail-Adressen
   - `git grep -i <term>` über staged + tracked Files + `demo_quickstart.json` + alle Shots
   - `gitleaks detect` über folio + multi-agent
   - `git log --all --name-only | rg <pattern>` über history beide Repos
   - Hits → STOP, Architect entscheidet (filter-repo vs. fresh-history)

2. **`folio/static/demo-assets/photos/*.svg`** löschen (6 Files, ~11 KB) — werden nicht mehr referenziert seit Midjourney-PNGs. Defensive fallbacks. Architect-Entscheidung.

3. **Demo-DBs nie pushen** — bereits gitignored, aber Hinweis: niemand sollte versuchen `~/.folio/folio-demo.db` zu committen.

4. **`folio/folio.db` stray-file** — wurde schon in vorigem Patch (D18) gelöscht, bleibt gitignored.

### Architekten-Anweisung

Push erfolgt erst nach grünem PII-Grep. Beide Repos getrennt (folio: D19+? · multi-agent: D17+?). Commit-Messages nach etabliertem D-Schema.

---

## Verifikation

- `npm run check` (folio): 0 errors (Phase B unverändert)
- `npx playwright test`: 8/8 passed
- `make demo` + `bash scripts/demo-server.sh`: alle 8 Shots reproducible
- Privacy-Smoke: curl `/council`, `/vault`, `/pipeline`, `/mail-queue` gegen 5174 → keine privaten PLZ, Stadtnamen, Mail-Adressen, Vault-Chapters sichtbar
