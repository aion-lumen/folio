# Fieldnote: Council Desktop Detail + Lens-Trigger (2026-05-31)

**Repo:** `~/Projects/folio/`
**Branch:** `feature/council-desktop-detail-trigger-2026-05-31` · 6 Commits, kein Push.
**Direktive:** `~/Projects/direktive-council-desktop-detail-trigger-2026-05-31.md`.
**Proposal:** `docs/proposals/proposal-lens-components-worker-trigger-2026-05-31.md` (architektur-freigegeben mit drei klauseln).
**Pendant aion-lumen:** `feature/council-lens-run-lockfile-2026-05-31` (Lockfile + LOCKFILES.md, separate FF-Merge-Reihenfolge).

## Anlass

Desktop-Detail-Panel brauchte Lens-Begründungen + prominenten Inserat-Link. Plus: Council-Lens-Lauf via UI-Button auslösbar. Verallgemeinerung-Ebene (Architekt-Klauseln) sieht Job, Kampagne, Hermes-Chat als Folge-Domains → Lens-Components werden domain-agnostic gebaut.

## Was gebaut

### Commit 1 — `docs(proposals): lens-components-worker-trigger architektur-proposal`

Vor-Bau-Architektur-Vorschlag (`docs/proposals/...`). Reichweite-Check über Council hinaus, drei Klauseln des Architekten eingebaut. Diskussionsbasis vor Implementierung.

### Commit 2 — `feat(lens-runner): generisches subprocess + lockfile-framework`

Domain-agnostisches Modul `src/lib/server/lens-runner/`:
- `types.ts`: `LensRunConfig`, `LensRunStatus` (discriminated union running/idle), `LensBusyError`.
- `status.ts`: Lockfile-JSON lesen, PID-Liveness via `process.kill(pid, 0)`, stale-Lock-Auto-Cleanup.
- `spawn.ts`: detached Subprocess, stdout/stderr in Log-Datei (kein Browser-Stream, Architekt-Wahl), `unref()` damit Folio-Server beenden kann ohne Worker mitzunehmen.

Domain-Configs leben **außerhalb** des Frameworks (Klausel 9): `src/lib/council/lens-config.server.ts` enthält `COUNCIL_LENS_CONFIG`. Job/Kampagne bringen später eigene `lens-config.server.ts` in ihren Domain-Modulen mit.

### Commit 3 — `feat(lens-types): src/lib/lens/types.ts — domain-agnostic LensReason`

**Klausel 1 in Aktion:** Heimathafen für `LensReason` + `LensConfidence` ist `src/lib/lens/types.ts`. Council-Reader importiert von dort, Mail/Job/Kampagne-Reader später ebenso. Kein impliziter Council-Status für Typen, die mehreren Domains gehören. Source-DB variiert je Domain; Type-Shape ist konsistent.

### Commit 4 — `feat(council-db): getLensReasonsForObject + lens-reasons api endpoint`

Reader im Council-Modul (Datenquelle ist Council-spezifisch), Return-Type `LensReason[]` aus dem domain-agnostic-Modul.

Aggregations-Pattern: UNION ALL über `lens_comparisons.obj_a_id/obj_b_id`, jüngste non-empty `reason` pro `(lens_id, object_id)` gewinnt. Plus latest Confidence (kann aus anderer Row als die Reason kommen), latest `rankings.rank`, Persona-Label aus `loadPersonas`.

API: `GET /api/council/[id]/lens-reasons` für on-demand-fetch beim Öffnen des Detail-Panels — spart Loader-Roundtrip wenn die Liste 100+ Objekte hat.

### Commit 5 — `feat(lens-ui): LensReasonsPanel + LensRunPanel + lens-run api`

`src/lib/lens/LensReasonsPanel.svelte`:
- Prop `reasons: LensReason[]`.
- Pro Lens eine `<details>`-Karte (default zu), Header Label+Rank+Confidence, Body Volltext-reason.
- Fallback „Keine Begründung notiert" wenn `reason` null/leer.

`src/lib/lens/LensRunPanel.svelte`:
- Prop `domain` (default `'council'`, später `'job'`, `'kampagne'`).
- Mount: GET `/api/{domain}/lens-run` → wenn running, Button disabled + Counter („läuft seit X:YY min").
- Klick (idle): POST. 409 → Toast „läuft bereits". Polling alle 5s. Lauf-Ende → `invalidateAll`.

`/api/council/lens-run/+server.ts`: GET delegiert an `status.ts`, POST an `spawn.ts` mit `COUNCIL_LENS_CONFIG`. 409 bei `LensBusyError`.

### Commit 6 — `feat(council-desktop): detail-panel integration + LensRunPanel mount`

`CouncilDetailPanel.svelte`:
- Lens-Begründungen on-mount-fetch + `<LensReasonsPanel>`.
- Inserat-Link prominenter: eigener Button-Stil-Block unter Foto-Row.
- Stammdaten-Fallback: wenn alle `qm/bj/price_value` null, OG-Title als Monospace-Block.
- Prop-Rename `state` → `voiceState` (Kollision mit Svelte 5 `$state`-Rune-Parser, sonst Type-Errors).

`/council/+page.svelte`: `<LensRunPanel domain="council" />` oben rechts neben User-Badge.

Mobile-UI unangetastet.

## Verallgemeinerungs-Garantie (Klausel-Verifikation)

- ✅ `src/lib/lens/` enthält domain-agnostic Komponenten + Types. `grep council src/lib/lens/` zeigt nur Doc-Kommentar-Beispiele + Default-Wert für `domain`-Prop.
- ✅ `src/lib/server/lens-runner/` enthält domain-agnostic Framework. `grep council src/lib/server/lens-runner/` zeigt nur ein Doc-Beispiel.
- ✅ Council-spezifisches lebt unter `src/lib/council/` (lens-config.server.ts) und `src/routes/api/council/` (Endpoints).
- ✅ Future Job/Kampagne: kopieren von `lens-config.server.ts` + neue API-Routes unter `/api/job/` bzw. `/api/kampagne/`. Kein Framework-Refactor nötig.

## Out-of-Scope (dokumentiert)

- **Typ-Parser** (Haus/Wohnung aus OG-Title/Description): eigene Direktive. Detail-Panel fällt auf Title-Fallback zurück wenn strukturierte Felder fehlen.
- **Hermes-Chat-Trigger:** siehe `mail-pipeline-hint-parameter-geplant.md` für die Vormerkung.
- **„Wer wo"-Mini-Block** bleibt Council-spezifisch in `CouncilDetailPanel`. Hochheben in shared/, wenn zweite Domain (Job) konkret wird.

## Verifikation (offen — Browser-Test)

1. Object-Klick im Desktop → Detail-Panel öffnet, Lens-Begründungen werden gefetched + collapsed angezeigt.
2. Lens-Karte klicken → expandiert Volltext-Reason.
3. Inserat-Link-Block sichtbar, öffnet im neuen Tab.
4. Stammdaten zeigen Preis/Fläche/BJ wenn vorhanden, sonst Title-Fallback.
5. LensRunPanel oben rechts: Klick startet Subprocess, Counter aktualisiert, Lockfile in `~/.council/lens-run.lock` entsteht.
6. CLI parallel: `python3 council_lens_run.py` → exit 2.
7. UI-Klick während CLI-Lauf: 409 + Toast.
8. Lauf-Ende: Liste reloadet via `invalidateAll`.

## FF-Merge-Reihenfolge

Erst `feature/council-lens-run-lockfile-2026-05-31` im aion-lumen-Repo (Lockfile-Schutz steht), dann dieser Branch im folio-Repo. Push beidseitig auf Anweisung.
