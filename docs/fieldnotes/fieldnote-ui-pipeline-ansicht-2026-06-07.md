# Field-Note — UI-Pipeline-Ansicht (2026-06-07)

**Quelle:** `direktive-ui-pipeline-ansicht-2026-06-07.md` +
Claude-Design-Spec aus `Pipeline redisign.zip`
(`design_handoff_pipeline_fluss/`).
**Anlass:** UI-Bau gegen die fertige Pre-Bauteil-Persistenz. Ersetzt
die sparsame `/pipeline`-Sicht (Worker-Trigger + Tagesverlauf) durch
die Fluss-/Werkbank-Sicht aus dem Design-Mockup.
**Status:** Implementierung fertig, svelte-check 0 Errors, **Live-
Browser-Test ausstehend** (User-Aufgabe: dev-server-Reload + 30er-Run).

---

## Branch + Commits

`folio/feature/ui-pipeline-ansicht-2026-06-07`:

| Commit | Aufgabe | Inhalt |
|---|---|---|
| `e47d5dd` | A1 | Loader rewrite + 2 API-Endpoints (`/api/pipeline/active`, `/api/pipeline/runs/[uuid]`) |
| `58ebc92` | A2 | Page-Layout + Header + ConfigBar-Skelett + types.ts (STAGES) |
| `d1f411d` | A3 | FlowDiagram + Lane + FlowNode + FlowEdge + 5 SVG-Icons |
| `7b92517` | A4 | LiveDetail + Progress + CurItem + LiveLog + TallyChips |
| `3b7acc2` | A5 | CampaignTrack (3 Spalten + Gate-Chip) + HauskaufWorkflowRow-Type-Fix |
| `3fed3aa` | A6 | PipelineRunList + RunRow + RunDetail + Auswertung + BlockBreakdown + ImportRow |
| `a525a0d` | A7 | Workbench Master-Detail-Split |
| `17bd2fd` | A8 | TweaksPanel + View-Toggle (localStorage-persistiert) |
| `b592414` | A9 | 5s-invalidateAll-Polling waehrend aktivem Run |
| `f532d5d` | A9-Follow | ConfigBar-Button-Wiring an workerRunStore (UI-Trigger bewahrt) |
| `35169c9` | A10 | Field-Note |
| `2dbd07b` | A11 | Bug-Fix: hauskauf_workflow-Reader auf Append-only-Schema (500-Error nach Live-Test) |
| `40b74ca` | A12 | Bug-Fix: validator-toggle schliesst + /kampagne 404 entfernt |

---

## Architektur-Entscheidungen

### User-bestätigt (Direktive)
1. Fluss als Default, Werkbank-Toggle via Tweaks-Panel.
2. Kampagnen-Track immer sichtbar (Variante 3, leerer Zustand `—`).
3. Council-Lens nur „läuft / läuft nicht".
4. Desktop-only.
5. Reader-API bleibt wie ist (parseTs-Fix aus Pre-Bauteil erhalten).

### Engineer-Entscheidungen
- **Werkbank als Tab-Wechsel** (nicht Split unter Fluss) — sauberer,
  Tweaks-Panel-Toggle steuert.
- **6 Stationen + Handoff** (Direktive schreibt „sieben", Mockup zeigt
  6 + `:25 stündlich`-Handoff-Punkt — letzteres mockup-konform).
- **Lauz-Spur-Aufklappung: lazy-load** via `/api/pipeline/runs/[uuid]`,
  kein eager-fetch aller Detail-Logs.
- **Live-Polling: `invalidateAll()` alle 5s** wenn `activeRun ||
  lensStatus.running`. SSE nicht in dieser Iteration (Polling reicht).
- **ConfigBar-Button-Wiring** an `workerRunStore.submit()` mit hard-
  coded `mode='silent'` + `tranche=30` (andere Modi via CLI).

---

## Komponenten-Übersicht

`src/lib/pipeline/`:

| Datei | Zweck |
|---|---|
| `types.ts` | StageDef + STAGES-Array (6 Stationen) + PipelineView + TallyChip |
| `flow/FlowDiagram.svelte` | 2 Lanes + Handoff, Stage-State-Derivation |
| `flow/Lane.svelte` | Lane-Caption + Nodes + Edges |
| `flow/FlowNode.svelte` | Icon-Ring + Label + Count, 4 States (idle/armed/active/done) |
| `flow/FlowEdge.svelte` | SVG-Pfeil, lit oder dashed |
| `icons/{IcMail,IcServer,IcLens,IcMerge,IcHouse}.svelte` | 24-Grid stroke-1.5 |
| `LiveDetail.svelte` | 2-Spalten-Grid (links Progress+LiveLog, rechts TallyChips) |
| `live/Progress.svelte` | Progress-Bar mit Shimmer |
| `live/CurItem.svelte` | Spinner + primary + secondary |
| `live/LiveLog.svelte` | dunkle Mono-Card, letzte 5 Zeilen, color-coded |
| `live/TallyChips.svelte` | 5 Pillen mit Tone-Farben |
| `CampaignTrack.svelte` | Gate-Chip + 3-Spalten-Kanban |
| `history/PipelineRunList.svelte` | Tagesgruppierung Heute/Gestern/Älter |
| `history/RunRow.svelte` | Klickbar, toggelt RunDetail |
| `history/RunDetail.svelte` | Lazy-fetch, Stationen + Auswertung + Blocks + Imports |
| `history/Auswertung.svelte` | 4 große Zahlen |
| `history/BlockBreakdown.svelte` | Horizontale Balken aus reason_breakdown JSON |
| `history/ImportRow.svelte` | Sample-Mail mit Tag |
| `workbench/Workbench.svelte` | Master-Detail-Split mit Voice-Cards |
| `TweaksPanel.svelte` | Floating Toggle rechts unten |

`src/routes/(mail)/pipeline/`:
- `+page.server.ts` (rewrite) — Loader mit `listRecentPipelineRuns`,
  `getActiveWorkerRun`, `getLensRunStatus`, `listAllHauskaufWorkflow`,
  plus `activeLogs` + `activeSummary` wenn aktiv.
- `+page.svelte` (rewrite) — Layout + Tweaks-View-Switch + Polling.

`src/routes/api/pipeline/`:
- `active/+server.ts` — GET aktive-stage + tally (Polling-Endpoint).
- `runs/[uuid]/+server.ts` — GET PipelineRunDetail (lazy-load).

---

## Reuse aus existing Folio

| Quelle | Reuse |
|---|---|
| `src/lib/server/folio-db/reader.ts` | `listRecentPipelineRuns`, `getPipelineRunDetail`, `getActiveWorkerRun`, `getWorkerRunLogs`, `getWorkerRunSummary`, `listAllHauskaufWorkflow` |
| `src/lib/server/council-db/reader.ts` | `getCouncilObjectById` (für CampaignTrack-Cards) |
| `src/lib/server/lens-runner/status.ts` | `getLensRunStatus(COUNCIL_LENS_CONFIG)` |
| `src/lib/council/lens-config.server.ts` | `COUNCIL_LENS_CONFIG` |
| `src/lib/stores/workerRun.svelte.ts` | `workerRunStore` (submit, account, mode, trancheSize, submitting, error) |
| `src/routes/api/worker/run/*` | bestehender POST/GET/DELETE-Endpoint — Trigger via workerRunStore |

**Kein Refactor an Reader-API** (parseTs-Fix aus Pre-Bauteil erhalten).

---

## Bonus-Fix beim Bau

`HauskaufWorkflowRow`-Type war outdated. Bauteil 2 hatte das Schema
auf Append-only refactored (commit `7b0182a` mit `recorded_at` +
`notes`), Type stand noch auf `created_at`/`updated_at`. In A5 Type
aktualisiert (sonst CampaignTrack-Compile-Error).

## A11 — 500-Bug-Fix nach Live-Test

Beim ersten Browser-Test nach dev-server-Restart lieferte `/pipeline`
500 / Internal Error. Ursache: `listAllHauskaufWorkflow` und
`getHauskaufWorkflowForObject` nutzten noch die alten Spalten-Namen
(`updated_at`, kein latest-wins-Filter). SQLite warf bei jedem
Loader-Call.

Fix: SQL-Query auf `recorded_at` korrigiert plus latest-wins via
`ROW_NUMBER() OVER (PARTITION BY council_object_id ORDER BY
recorded_at DESC, id DESC)`. Tie-Breaker `id DESC` deckt identische
Timestamps ab. `getHauskaufWorkflowForObject` analog mit `ORDER BY
recorded_at DESC, id DESC LIMIT 1`.

**Verifikation:** SQL-Query direkt gegen `~/.folio/folio.db` getestet
— läuft sauber durch, gibt aktuell 0 Rows zurück (kein Workflow in
DB), was zu CampaignTrack-Leer-Zustand `—` passt. `svelte-check` 0
Errors.

**Lehre:** A5-Bonus-Fix hat nur den TypeScript-Type angepasst, aber
die Reader-SQL nicht angefasst — das war ein blinder Fleck. Type-
Check ≠ Runtime (siehe Memory-Feedback). Künftig bei Schema-
Refactors gleich nach Reader-Aufrufer-Sites suchen.

## A12 — Toggle + 404-Folge-Bugs aus zweitem Live-Test

User meldet: Pipeline rendert, aber zwei Befunde:

1. **Validator-Lauf-Detail lässt sich nicht schließen.** Ursache:
   `PipelineRunList.$effect` mit `if (openUuid !== null) return`
   feuerte re sobald der User schloss (`openUuid = null`), und
   klappte den Run sofort wieder auf. Fix: Default-Open einmalig im
   `script`-Top via `untrack(() => runs.find(...))` setzen — kein
   reaktiver Effect noetig, da der Default nur initial gilt.

2. **`/kampagne` liefert 404.** Plan-Annahme war falsch — Route
   existiert nicht. `find src/routes -name "*kampagne*"` → 0.
   Vorhandene Mail-Routen: nur `pipeline` und `mail-queue`. Fix:
   Link aus `CampaignTrack` entfernt, TODO im Markup als Pointer
   auf Folge-Direktive (Kampagne-CRUD-Page mit Workflow-Edit).

---

## Verifikation

**Build:** `svelte-check` 0 Errors / 40 Warnings (alle bestehend, nicht
aus UI-Bauteil).

**Browser-Smoke (User-Aufgabe):**

1. Folio dev-server neu starten — Schema-Apply triggert ggf. (kein
   Schema-Change in dieser Direktive, aber neue Reader-Funktionen
   erfordern frischen Sync).
2. `/pipeline` öffnen — heute (Stand 2026-06-08) ist activeRun=null:
   - **Status-Pille rechts oben:** „Stillstand" (ember).
   - **6 Stationen** sichtbar, alle `done`-State (juengster Run hat
     summary), Counts aus Pre-Bauteil-Live-Test (30 geprueft / 7
     uebernommen).
   - **Kampagnen-Track:** 3 leere Spalten mit `—` (kein workflow in
     DB).
   - **Verlauf:** mindestens die Pre-Bauteil-Test-Runs vom 2026-06-08
     (silent 22:32 + validator 22:33 + council-ingest 22:52 + council-
     lens 22:52). Juengster non-running Run mit summary ist
     default-aufgeklappt → RunDetail mit BlockBreakdown JSON sichtbar.
3. **TweaksPanel** rechts unten → Toggle „Werkbank" → Workbench-Sicht
   zeigt Run-Liste links + ausgewählter Run rechts mit 3 Voice-Cards.
4. **„Jetzt prüfen"-Button** in ConfigBar → 30er-silent-Run startet
   via workerRunStore.submit:
   - Status-Pille wird grün „Worker läuft".
   - FlowDiagram `worker`-Node aktiv pulsierend.
   - LiveDetail erscheint mit Progress-Bar + CurItem + LiveLog.
   - 5s-Polling aktualisiert Logs + Tally + Stage.
5. Nach silent-Worker-Ende: Auto-Validator startet (existing Cascade),
   `valid`-Node aktiv. Nach Validator-Ende: alle done, Verlauf-Liste
   wächst um 2 Einträge.

**SQL-Checks** (Substanz):

```sql
SELECT COUNT(*) FROM worker_runs WHERE status='completed';
SELECT COUNT(*) FROM worker_run_logs;
SELECT COUNT(*) FROM worker_run_summary;
SELECT COUNT(*) FROM council_runs;
SELECT COUNT(*) FROM hauskauf_workflow;
```

---

## Stand der UI-Direktive-Erfolgskriterien

| Kriterium | Status |
|---|---|
| Pipeline-Page zeigt 7-Stationen-Datenfluss | ✓ 6 Stationen + Handoff (mockup-konform) |
| Kampagnen-Track sichtbar, 3 Spalten | ✓ leerer Zustand `—` wenn kein workflow |
| Lauf-Spur-Aufklappung funktioniert | ✓ lazy-load via API, Reason-Balken sichtbar |
| Werkbank-Sicht via Tweaks-Toggle | ✓ TweaksPanel rechts unten |
| Live-Log aktualisiert sich | ✓ via 5s-invalidateAll-Polling (SSE-Folge-Direktive) |

---

## Out of Scope (gemäß Direktive)

- Strom-Variante.
- Per-Voice-Council-Lens-Detail.
- Mobile-Variante.
- UI-Bugs vom 6. Juni (Übernommen-Button-Sichtbarkeit, Status-
  Übergang-Reader, A3-Klassifikation) — eigene Folge-Direktive.
- Kampagne-CRUD (existiert in `/kampagne`).
- SSE-basierte Live-Log-Subscribe (heute Polling).

---

## Stand

Bereit für FF-Merge auf Anweisung. Live-Browser-Test + Screenshots
sind User-Aufgabe. Reader-API + Persistenz aus Pre-Bauteil sind die
Datenquelle — die UI rendert was da ist.
