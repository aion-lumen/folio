# Fieldnote: Council Desktop Minimal-Update (2026-05-31)

**Repo:** `~/Projects/folio/`
**Branch:** `feature/council-desktop-minimal-update-2026-05-31` · 2 Commits, kein Push.
**Direktive:** `~/Projects/direktive-council-desktop-minimal-update-2026-05-31.md`.

## Anlass

Desktop `/council` zeigte bisher nur die Borda-Top-10. Vor weiterer Mail-Verarbeitung soll der Desktop ebenfalls bewerten + pflegen können — Filter, Sort, Detail-Panel. Code-Reuse aus Mobile, keine Design-Iteration.

## Vor-Schritte

### Manueller Worker-Run (User-Anfrage, 17:43 vor :05-Tick)

```
~/Projects/aion-lumen/council/.venv/bin/python3 \
  ~/Projects/aion-lumen/council/scripts/ingest_pending_worker.py
```

Output: `Nothing to process (pending_ingest is empty or all processed).` — erwartet, weil die einzige Pending-Row `id=5` schon vom End-to-End-Test-Run als `failed` markiert ist und Reconciliation `processed_at` gesetzt hat.

### Verlauf-Bug-Diagnose: kein Bug

DB-Check direkt:
- `folio.object_views` `last_viewed_at` für `user_id=1`: `2026-05-31T15:32:41Z`.
- `folio.object_status_override` Self-Aktionen (user_id=1): 2 Rows, beide vom **30.5.** (22:09, 21:59) — also **älter als lastView**.
- `folio.user_rankings`: 1 Self-Row, ebenfalls älter als lastView.
- `folio.object_triggers`: 0 Self-Rows.

Reader-Verhalten ist korrekt: Verlauf zeigt nur Events SEIT `lastView`. Da nach lastView keine Self-Aktionen existieren, ist der Verlauf legitim leer. **Kein Bug-Fix nötig.** Sobald eine neue Status-Tag-Aktion gesetzt wird, erscheint sie im Verlauf-Tab.

## Was geändert

### Commit 1 — `feat(council-db): readAllCouncilObjects fuer desktop-vollbestand`

**Bug-Wurzel:** `readCouncilTop()` in `src/lib/server/council-db/reader.ts:133-260` ist hardcoded auf `consolidated_top10` limitiert (Zeilen 148, 164: `WHERE id IN (top10-ids)`). Selbst bei `status='all'` kommen nur ~10 Borda-Objekte raus. `countObjectsByStatus()` zählt aber den vollen Bestand. Diskrepanz war der „Alle"-Filter-Bug.

**Fix:** Neue Funktion `readAllCouncilObjects(status, sort, userId)`:
- Source: `SELECT * FROM objects WHERE object_class='annonce' LIMIT 500` — kein `consolidated_top10`-Constraint.
- Effective-Status-Merge mit `object_status_override` (cross-DB, Pattern aus `searchCouncilObjects` übernommen).
- Pro Item zusätzlich `borda_rank` (nullable) und `user_rank` (nullable) — Caller kann drei Sort-Modi ohne extra Queries unterstützen.
- Sort-Modi: `'last_updated' | 'borda' | 'mine'`, jeweils NULLS LAST.

`readCouncilTop()` bleibt unverändert — Semantik „Borda-Top-10-Ansicht" ist korrekt (Mobile-Meine-10-Toggle).

### Commit 2 — `feat(council-desktop): vollbestand + filter + sort + detail-panel`

**Loader** (`+page.server.ts`):
- `readAllCouncilObjects(status, sort, userId)` + `countObjectsByStatus()` + `readCouncilTop('all')` als Voices-Map für Borda-Objekte + `getUserTopRanksFor(userId)` + `getLatestNotesMapForUser(userId)` für NoteEditor-Initial + `listOtherUsers(userId)` für Partner-Block.
- `depends('council:list')` als Marker für künftige gezielte Invalidations (aktuell triggert Mobile-Reuse `invalidateAll()` von sich aus — akzeptiert, da Desktop kein Latenz-Problem hat).

**Page** (`+page.svelte`):
- 5 Filter-Pills (Alle / Kaufen / Beobachten / Verwerfen / Archiv) mit echten Counts.
- 3 Sort-Pills (Eingang / Council-Borda / Meine Top-10).
- Card-Click setzt lokalen `openId`-State → Detail-Panel öffnet.

**CouncilObjectCard:**
- Nimmt jetzt `CouncilListItem` statt `CouncilTopObject`. Voices/state als optionale Props (übergeben aus voicesByObject-Map).
- Borda-Rang zeigt bei Borda-Objekten, sonst User-Rank bei Self-Top-10-Objekten, sonst kein Rang-Indikator.
- `<div role="button">` für Click + Keyboard. Portal-Link mit `stopPropagation` damit der Listen-Click nicht feuert.

**CouncilDetailPanel** (neu): `src/lib/council/CouncilDetailPanel.svelte`:
- Slide-in von rechts (480px wide, fixed-position), Backdrop-Klick + ESC schließen.
- Header: Adresse + Portal-Link, Close-Button.
- Body: Foto + Specs-Liste, Lens-Stimmen (voll-Variante `CouncilStimmenStreifen`), „Wer wo"-Mini-Block (Self/Partner/Council-Borda).
- Aktionen: `StatusTagButtons`, `NoteEditor`, `TopTenPicker` aus Mobile (1:1 Reuse via `.council-mobile-root`-Wrapper).

## Architektur-Klauseln

- **B-Klausel (Mobile-Tokens):** Token-Set bleibt unter `:where(.council-mobile-root)`. Detail-Panel ist im Council-Scope (nicht „außerhalb Council"), Trigger für Promotion auf Root-Ebene ist **NICHT gezündet**. Wenn der Architekt später konsistenten Desktop-Look will, separate Iteration.
- **Mobile-UI-Garantie:** `mobile-tokens.css`, `/council/mobile/`-Routen und Mobile-Detail-Komponenten alle **unangetastet**. Detail-Komponenten unter `src/lib/council/mobile/detail/` — Desktop importiert direkt.

## Mobile-Reuse-Strategie

Die drei Mobile-Detail-Komponenten (`StatusTagButtons`, `NoteEditor`, `TopTenPicker`) sind HTTP-agnostisch und nutzen nur HSL-Fallback-Tokens. 1:1-Reuse via `.council-mobile-root`-Wrapper ist sauber.

Side-Effect: Mobile-Komponenten rufen intern `invalidateAll()` nach Save. Auf Desktop bedeutet das, der Council-Loader läuft neu — minimaler Overhead, keine Latenz-Probleme (kein Tailscale). Bewusst akzeptiert.

## Verifikation (offen — Browser-Test)

1. `/council` öffnet, „Alle"-Filter zeigt Count = Summe aller Status-Counts (sollte 500-ish Objekte sein, vorher waren es nur ~10).
2. Status-Filter wechseln: Counts ändern sich, Liste ändert sich.
3. Sort-Wechsel: Reihenfolge ändert sich.
4. Card-Click öffnet Detail-Panel von rechts. Backdrop-Klick / ESC schließen.
5. Status-Tag im Panel ändern: Liste reflektiert Änderung nach `invalidateAll`.
6. Notiz speichern (debounced 1.5 s), Top-10-Picker schreibt user_rankings.
7. Mobile-UI prüfen: alle vier Tabs identisch wie vorher (Regression-Check).

## FF-Merge

Auf Anweisung von Afshin. Frau-Test danach.
