# Field-Note — Pipeline-Seite Minimal (Direktive 3, 2026-05-28)

**Direktive:** `03-direktive-pipeline-minimal.md`
**Branch:** `feature/pipeline-minimal-2026-05-27` (folio only)
**Status:** Browser-verifiziert, 0 type-errors

## Architektur-Entscheidung (Recap)

Pipeline wird **nicht** zur Werkstatt/Kanban/Live-Choreografie ausgebaut.
Begründung: Tranchen laufen <5 Minuten durch, Live-Detail wird nicht gelesen,
nicht gebraucht. Choreografie hat ihren Ort später in Council, nicht hier.

Die Pipeline-Seite ist Operator-Tool: Trigger + Lebenszeichen + Verlauf, nichts mehr.

## Drei Sektionen

### 1. Trigger
- Account-Dropdown · Mode-Dropdown · Tranche-Number-Input · „Worker-Run starten"
- Form immer sichtbar bei idle (kein expand-Toggle mehr)
- Tranche-Default per `localStorage.pipeline.lastTrancheSize` persistiert (Default 50 wenn kalt)
- lastEnded-Banner bleibt kompakt im Form-Footer

### 2. Lebenszeichen (nur bei aktivem Run)
- Header: status-dot · „Worker-Run aktiv" / „Validator-Run aktiv" + Auto-Validator-Badge
- Sub-Header: account · mode · tranche=N (Mono)
- Status-Zeile: „läuft seit Xm Ys · ETA ~Xm"
  - `läuft seit` = `Date.now() − activeRun.startedAt`, tick-refresh 1s
  - `ETA` = `(median secondsPerMail × trancheSize) − elapsed`
- Cancel-Button rechts (rose, gleicher Endpoint wie heute)

### 3. Verlauf (tagesgruppiert)
- 4 Buckets per `started_at` relativ zu Now: Heute / Gestern / Diese Woche / Älter
- Empty-Buckets werden übersprungen
- Pro Zeile: status-icon · Zeit · mode · Account · mails · Dauer (Board-Spalte raus)
- Server-Limit: 50 → 200 für mehr Tiefe im „Älter"-Bucket
- Mobile (<640px): mode/account/mails kollabiert, nur icon+time+dauer

## ETA-Mechanik

`src/lib/util/run-eta.ts`:
- `estimateEtaSeconds(active, history)`: median seconds-per-mail über die
  letzten N=5 completed-Runs gleicher (account, mode). Cold-History-Fallback:
  3 s/mail.
- Formel: `total_estimated = trancheSize × secondsPerMail; eta = total_estimated − elapsed`
- Kein Per-Mail-Live-Tracking (Direktive-Prohibition „keine SSE-Refactors").
  Schätzung ist zeitlich, nicht remaining-mail-basiert. Genauigkeit reicht
  für „Lebenszeichen", nicht für „Live-Detail".
- `formatElapsed(ms)`: „Xm Ys" / „Xs"
- `formatEta(seconds)`: „~Xm" / „~Xs" / „gleich" / „—"

Validator-Runs (`trancheSize=0`) zeigen `ETA: —` — sind tranche-agnostisch.

## Was raus aus altem WorkerRunPanel

| Was raus | Begründung |
|---|---|
| Live-Log-Stream (`logs[]` render + `<div bind:this={logEl}>`) | Direktive §2: „KEIN Live-Log, KEINE Per-Mail-Anzeige" |
| `autoScroll`-Effect mit `logEl.scrollTop` | gehört zu Live-Log |
| Collapsible `expanded`-Toggle | Form immer sichtbar bei idle |
| Per-Mail-Status-Lines im Header | gehört zu Live-Detail |

## Was bleibt (operational)

- `workerRunStore` Module-Singleton + SSE-Subscribe (existing, kein Refactor)
- `cancel()` via DELETE-API (existing)
- `lastEnded`-Banner nach Run-End
- `triggeredBy: 'auto'`-Badge für Auto-Validator-Cascade
- Server-side Singleton-Enforcement bleibt

## Tests

- svelte-check: **0 errors**, 24 pre-existing warnings unverändert
- Browser-verifiziert (User): Trigger-Form + Tagesgruppen + Lebenszeichen
- 5er-Tranche-Lauf wird beim FF-Merge nochmal als end-to-end-Smoke gemacht

## Out of scope

- Kein SSE-Refactor (Direktive §Prohibitions)
- Kein Kanban / Diagramm / Karten
- Kein Council-Trigger (eigene Seite/Tab später)
- Kein Multi-Run-Queue (Singleton bleibt)
- Live-Log via Debug-Fallback: User kann via SSE-Subscribe direkt (existing
  `/api/worker/run/<uuid>/log`) aber nicht im UI
- Persistierung anderer Form-Felder (Mode, Account) — Direktive nennt nur
  Tranche explicit

## Cross-Reference

- Cleanup-Direktive (`868931c` multi-agent, `577e12f` folio): Board-Feld +
  Validator-Disagreements-Trigger waren bereits weg. Diese Direktive baut
  auf jenem Stand.
- Panel-C-Build (`f2d2e11` folio): unabhängig, parallel — kein gemeinsamer
  Touchpoint.
