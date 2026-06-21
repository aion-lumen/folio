# Field-Note — Pipeline-Findings 2026-06-11

**Vorgang:** `directive-pipeline-findings-2026-06-11.md`
**Vorher:** Model-Status-Panel-Build vom 2026-06-10. Vier Smoke-Findings → Diagnose-Stop-Point → minimaler Fix-Bundle.

---

## F1 — Top-Progress-Bar bleibt 0 mid-run

**Befund.** Zwei unabhängige Live-Quellen mit gleichem Symptom:

- *Worker (silent):* `LiveDetail.progressDone` zog aus `activeRun.mails_processed`. Dieses Feld wird vom Python-Worker erst am Run-Ende persistiert; während des Laufs ist es `0`. Sichtbar wurde das, weil die Cascade (siehe F3) die Run-Lifetime auf ~14 min ausgedehnt hat — vorher fiel es kaum auf.
- *Lens:* mein neues `panelProgress` las `LensPersonaStatus.scored` der `evaluating`-Persona. Der Lens-Runner-Log-Parser füllt `scored` aber erst bei Phasen-Übergang auf `done`. Konsequenz: Bar steht `0` während der langsamsten Phase jeder Persona.

**Fix.** Beide Quellen auf log-derivierte Counts umgestellt.

- `LiveDetail.svelte` (silent): `progressDone = logs.filter(l => l.voice === 'heuristik' && l.event_type === 'classified').length`. Validator-Mode unverändert (war schon log-basiert).
- `+page.svelte` (Lens-`panelProgress`): `done = personas.filter(p => p.phase === 'done').length; total = personas.length; unit = 'Personas'`. Die `lensStatus.progress.eta_seconds` bleibt als ETA erhalten.

Beide Counts inkrementieren live über den 5s-Loader-Invalidate.

---

## F2 — Block-Gründe zeigt nur eine Kategorie

**Befund.** Kein UI-Bug. SQL-Spotcheck gegen `folio.db`:

| run_uuid (head) | reason_breakdown |
|---|---|
| `b9c4a328…` (2026-06-11) | `{"decay": 19}` |
| `084f63b8…` (älter) | `{"out_of_corridor": 3, "price_on_request": 1, "blocked_by": 1, "decay": 16}` |

`history/BlockBreakdown.svelte` parst und sortiert alle Einträge im JSON-Map und rendert pro nicht-Null-Eintrag einen Bar. Der konkrete 11.06.-Run hatte echt nur Decay-Treffer.

**Fix.** Keiner. Close-with-Note.

---

## F3 — qwen-thinking-Zeilen im Worker-Live-Log

**Befund.** Keine Pipeline-Regression. Commit `cf7b1dd` 2026-06-09 *"G3: Cascade-Default-on + Code-Hook"* (aion-lumen/multi-agent) aktivierte `--cascade=True` per Default. `production_worker.py` startet nach der Heuristik-Phase `validator_batch.py` als Subprocess unter demselben `run_uuid`. Folio-Log-Sequenz:

```
seq 1–30   heuristik|classified     (production_worker.py)
seq 31     cascade|info             (cascade_started)
seq 32–61  gemma|validated          (validator_batch subprocess)
seq 62–91  qwen|validated
seq 92–121 qwen-thinking|validated
seq 122+   imap_cleanup|info, cascade|info cascade_ok
```

Die Direktive vom 10.06. (Model-Status-Panel) hat keine Orchestrierung verändert — die Cascade lief vor dem Panel-Build bereits zwei Tage produktiv. Tatsächlich fehlerhaft war nur das UI-Labeling: `LiveDetail.stationLabel` zeigte über die volle Lifetime „Worker", obwohl die Phase längst gewechselt hatte; das Model-Status-Panel blieb im Idle-Zustand, weil `activeRun.mode === 'silent'` blieb.

**Fix.** Phasen-Awareness in der UI, ohne Worker-Eingriff.

- `LiveDetail.svelte`: neuer `cascadePhase`-Derive (`pre | running | post`) aus `voice='cascade'`-Events. `stationLabel`:
  - `pre` → `Worker`
  - `running` → `Validator-Kaskade`
  - `post` → `Worker · Aufräumen`
  - Mode `validator` → `Validator` (unverändert)
- `LiveDetail`-Progress-Bar wird in `cascadePhase === 'running'` ausgeblendet — Panel übernimmt (Direktive 2026-06-10 „render once").
- `+page.svelte`: `panelStack = 'validator'` und `panelActive = true` während Cascade. `panelModels` zieht die Live-Daten aus denselben `validated`-Log-Counts wie für einen Standalone-Validator-Run.

Resultat: die qwen-thinking-Zeilen bleiben sichtbar (sie sind echt), aber der Kontext stimmt jetzt — Station heißt während der Cascade `Validator-Kaskade`, und die drei Model-Karten transitionen WARTET → LÄUFT(1/3→2/3→3/3) → FERTIG.

---

## F4 — Tranchengröße wieder wählbar

**Befund.** Commit `f532d5d` (Pipeline-Redesign) ersetzte das alte `WorkerRunPanel` durch eine minimale ConfigBar. Picker fiel raus; `onclick` setzte `trancheSize = 30` hart. API (`POST /api/worker/run`) akzeptiert `tranche_size` (0..5000) weiterhin; Store hatte das Feld als mutable `$state`.

**Fix.** Picker zurück.

- `+page.svelte`: `<select aria-label="Tranche-Größe">` mit Presets `[5, 10, 30, 50]`, gebunden an `workerRunStore.trancheSize` per `value=` + `onchange={setTrancheSize}`.
- Hint-Span: dynamisch — `silent · tranche {workerRunStore.trancheSize}`.
- `onclick`-Block des „Jetzt prüfen"-Buttons: hartcodierte `trancheSize = 30`-Zeile entfernt.
- localStorage-Persistenz: Key `pipeline.lastTrancheSize`. Read in `$effect` mit `browser`-Guard (analog zum existierenden `view`-Effect). Write in `setTrancheSize()`.
- Store-Default in `workerRun.svelte.ts`: `30` (war `50`) — damit der SSR-First-Render bereits den Direktive-konformen Wert zeigt, bevor localStorage übernimmt.

---

## Verifikation

- `npm run check`: 0 Errors, 42 vorhandene Warnings (fremde Dateien, unverändert).
- Dev-Server-Smoke: Page rendert HTTP 200; Picker mit `<option value="30" selected>` SSR-korrekt; Hint-Span `silent · tranche 30` ohne JS-Hydration.

Volles User-Acceptance: ein kleiner Worker-Lauf (Picker auf 5) zeigt Heuristik-Bar live zählend (1→5), Übergang auf `Validator-Kaskade` mit Model-Karten-Transition, anschließend `Worker · Aufräumen`. Ein Lens-Lauf zeigt `0/3 Personas → 1/3 → 2/3 → 3/3`. F2 close-with-note bleibt.

---

## Touched

- `folio/src/lib/pipeline/LiveDetail.svelte` — cascadePhase, stationLabel, progressDone (Log-Counts)
- `folio/src/routes/(mail)/pipeline/+page.svelte` — cascadePhase, panelStack/Active-Override, Lens-Metrik, Tranchen-Picker, localStorage
- `folio/src/lib/stores/workerRun.svelte.ts` — Store-Default 30
- `folio/docs/fieldnotes/fieldnote-pipeline-findings-2026-06-11.md` — diese Notiz

Branch + FF-Merge auf Architekten-Anweisung. Push auf Anweisung.

---

## Follow-up 2026-06-11 — Live-Reaktivität

Bundle-1 hat `npm run check` + SSR-Smoke bestanden, scheiterte aber im echten Run: Bar/Label/Glow erst nach manuellem Refresh, Validator-Bar zeigte `5 / 0`, Lens schien bei `0/3` zu hängen. SQL-Spotcheck gegen `~/.folio/folio.db` lieferte drei separate Ursachen:

### F5 — Polling startet nie nach Submit

`workerRunStore.submit()` machte POST → `fetchStatus()` (Store-State) → SSE-Subscribe, ohne den Page-Loader zu invalidieren. Der 5s-Polling-`$effect` in `+page.svelte:48-55` ist gegated auf `data.activeRun || data.lensStatus?.running` — beide bleiben null bis ein Loader-Run sie befüllt. Hen-und-Ei: Polling startet nur, wenn data.activeRun truthy, das wird nur durch Loader-Invalidate truthy.

**Fix.** `await invalidate('workerRun.submit')` nach `fetchStatus()` in `submit()`.

### F6 — Silent→Auto-Validator-Übergang ohne Loader-Invalidate

DB-Beleg für Auto-Trigger-Pattern: silent `e9e8b71c…` endete 05:38:08.097, validator `0772096c…` startete 05:38:08.097 — gleiche Sekunde. `maybeResubscribeForAutoTrigger()` (Z. 277-297) pollt 120/300/600 ms nach dem neuen Run und abonniert dessen SSE, ohne den Page-Loader anzustoßen. statusLabel/FlowDiagram bleiben auf dem alten Silent-Wert.

**Fix.** `await invalidate('workerRun.auto-trigger.resubscribed')` direkt nach `subscribeLogs()` im Auto-Branch; symmetrisch im Manual-Branch.

### F7 — Auto-Validator hat `tranche_size = 0` in DB

```
0772096c…  validator  tranche_size=0  mails_processed=0
e9e8b71c…  silent     tranche_size=5  mails_processed=5
```

Pattern über alle Auto-Validator-Runs. `LiveDetail.progressTotal` und `+page.svelte:panelProgress`-Validator-Branch lasen `tranche_size` direkt → Bar `5 / 0`. Backend-Ursache (Auto-Spawn vererbt `tranche_size` nicht) gehört in eine separate aion-lumen-Direktive.

**Fix.** UI-Fallback: bei `tranche_size === 0` → `total = done`. Bar zeigt 100% statt div-by-zero.

**Backend-Update (same patch, Architect-Greenlight).** `startValidatorRun` (`worker-runner/manager.ts:253`) bekam `opts.trancheSize?: number`. Am Auto-Trigger-Callsite (Z. 217) wird `ctx.mailsProcessed` durchgereicht. Konsequenz: Auto-Validator landet jetzt mit `tranche_size = worker.mails_processed` in DB → Bar zeigt korrekte X/5. Der UI-Fallback bleibt für manuelle Validator-Runs (scope `unreviewed`/`all` — keine feste Denominator-Logik) als Defense-in-Depth bestehen — keine Code-Regression.

### F8 — LensRunPanel symmetrisch

`LensRunPanel.trigger()` invalidiert erst beim Run-Ende. Falls Lens jemals von einer Loader-relevanten Page (z.B. `/pipeline` mit Embed) gestartet wird, gilt dieselbe Klemme. `await invalidateAll()` nach `fetchStatus()` im success-Pfad.

### Verifikation

- `npm run check`: 0 Errors, 42 Warnings (Baseline unverändert).
- Dev-Server-Smoke: HTTP 200, Picker korrekt, Hint korrekt. Zusätzlich: ein paralleler Lens-Run wird live korrekt gerendert — Top-Pille „Council-Lens läuft", Panel „1 / 3 Personas geprüft · ETA 8m", Cards baumeister=FERTIG / rechner=LÄUFT·2/3 / ortskundige=WARTET. Bestätigt: sobald `data.lensStatus.running` da ist, läuft das Polling sauber.

### Touched (Follow-up)

- `folio/src/lib/stores/workerRun.svelte.ts` — F5 + F6 (drei `invalidate`-Inserts)
- `folio/src/lib/pipeline/LiveDetail.svelte` — F7 (progressTotal-Fallback)
- `folio/src/routes/(mail)/pipeline/+page.svelte` — F7 (panelProgress-Fallback) + F9 (Variante-A Bar-Semantik)
- `folio/src/lib/lens/LensRunPanel.svelte` — F8 (eine Zeile)
- `folio/src/lib/server/worker-runner/manager.ts` — F7 Backend (Auto-Validator erbt `trancheSize` von Worker)
- `folio/docs/architecture/pipeline-cascade-validator-2026-06-11.html` — F9 Architektur-Snapshot (single-file, 32 KB)

### F9 — Bar-Semantik: distinct mail_ids → Log-Zeilen

Architekt-Beobachtung im Validator-Run: Bar zählt 0/5 → 5/5 für die erste Stimme (gemma), bleibt dann stehen. Ursache: `panelProgress.done = new Set(validated.map(l => l.mail_id)).size`. Distinct mail_ids saturieren bei `tranche_size` nach der ersten Stimme — qwen und qwen-thinking fügen keine neuen mail_ids hinzu, also bewegt sich die Bar nicht mehr.

**Fix (Variante A).** `panelProgress.done` zählt Log-Zeilen statt distinct-mails. `total = tranche_size × 3` (drei Voices in der Cascade). Unit wechselt von „Mails" auf „Stimmen" — semantisch konsistent mit `LiveDetail.progressUnit` im Validator-Mode (die das schon so machte). Code in `+page.svelte:254–291`. Fallback bei `tranche_size === 0` (manuelle Validator-Runs mit scope `unreviewed`/`all`) → `total = done` (Bar zeigt 100%) bleibt erhalten.

Begleitend: vollständiges Architektur-Snapshot HTML `docs/architecture/pipeline-cascade-validator-2026-06-11.html` (8 Sections, 5 SVG-Diagramme, voller LENS_PROMPT in `<details>`, 46 KB).

### F10 — Doppel-Ausführung von validator_batch.py (Resolved by Direktive D)

Beim Schreiben der HTML-Architektur-Doku wurde durch DB-Spotcheck verifiziert, dass `validator_batch.py` pro Worker-Lauf **zweimal** läuft auf denselben Mails:

```
silent  e9e8b71c… (12.5 min)  validated: gemma=5, qwen=5, qwen-thinking=3
validator 0772096c… (11.0 min)  validated: gemma=5, qwen=5, qwen-thinking=3
                                  (identische mail_ids 1222–1226)
```

**Ursache.** Cascade wurde 2026-06-09 (commit `cf7b1dd`) im Worker eingebaut, der Auto-Validator-Trigger in `worker-runner/manager.ts:212` wurde dabei nicht deaktiviert. Beide Pfade laufen seither parallel-redundant. Endergebnis bleibt korrekt (UPSERT auf `(feedback_id, validator_model)` idempotent), aber ~10 min LLM-Compute pro 5er-Tranche ist Doppelarbeit.

**Mögliche Fixes (Architekten-Entscheidung, nicht in diesem Patch):**
- (1) Manager skipt Auto-Trigger, wenn `cascade_ok` im silent run vorkam (signal-basiert).
- (2) Manager skipt Auto-Trigger generell bei `silent` + `cascade=true` (annahme-basiert).
- (3) Cascade abschaffen, nur Auto-Validator behalten — verliert „same run_uuid"-Pattern.

Dokumentiert im HTML §1+§2+§8. Decision-Doc für den Architekten mit allen vier Lösungsvorschlägen + Empfehlung (B · bedingt skippen, ~40 min Engineer-Wall-Clock): `docs/architecture/cascade-validator-cleanup-decision-2026-06-11.md`. Code-Implementation erst nach Architekten-Entscheidung.

**Resolved 2026-06-10.** Architekt hat Variante D (modifiziert) gewählt: Cascade-Subprocess komplett aus `production_worker.py` entfernt, Validator läuft jetzt als eigener Run mit `parent_run_uuid` auf den Worker — race-frei via explizitem `--mail-ids`-Handoff. Commits: `d789706` aion-lumen, `f7f0eee` folio. Details im `fieldnote-direktive-d-pipeline-refactor-2026-06-10.md`.

### Außerhalb dieses Patches

- Cascade-Awareness für `statusLabel` + `FlowDiagram` — derzeit „Worker läuft" während Cascade (semantisch korrekt: `mode='silent'`). Falls die Top-Pille auch „Validator-Kaskade" zeigen soll, UX-Erweiterung von F3 — nicht hier.
- `phase='done'`-Latenz im lens-runner — wenn Personas weiterhin 10+ min brauchen, ist das ein Lens-Sequenzierungs-Issue, kein UI-Bug.
