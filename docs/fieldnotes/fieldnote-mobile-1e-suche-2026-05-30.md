# Field-Note — Sub-Bauteil 1e: Suche

**Datum**: 2026-05-30
**Branch**: `feature/council-mobile-1e-suche-2026-05-30`
**Direktive**: Council-Mobile-UI v2 — Tab 4 (Suche)

## Was gebaut

Volltext-Suche über Council-Bestand mit Status-Filter (effectiveStatusTag-gemerged). URL-basiert, debounced Input, Treffer als ObjectCard-Liste mit Status-Pille pro Treffer.

## URL-State statt API-Endpoint

Suche ist **kein** dedizierter Endpoint, sondern URL-basiert (`?q=…&status=…`). Page-Loader liest `url.searchParams`, ruft Reader, returnt Treffer. Vorteile:
- **Bookmarkable** — User kann Suchergebnis-URL teilen
- **Browser-Back/Forward** funktioniert natürlich
- **Kein duplicate-state-management** zwischen API + UI
- **SvelteKit-idiomatic** (gleiches Pattern wie `/council?status=…` aus Bauteil 3)

Client navigiert mit `goto(url, { replaceState: true, keepFocus: true, noScroll: true })` — kein History-Spam beim Tippen, Fokus bleibt auf Input, kein Scroll-Reset.

## Tailscale-bewusste Debounce-Strategie

Architekt-Anmerkung übernommen: 250ms-Debounce auf Input. Jeder Tastendruck cancelt vorherigen Timer und setzt neuen → erst nach Tipp-Pause läuft `goto` → Server-Roundtrip. Status-Filter-Klick cancelt Timer und navigiert sofort (kein Tippen erwartet).

Konkret: bei „Rheinfelden" tippen (10 Zeichen, ~50ms zwischen Anschlägen) feuert EIN Roundtrip statt 10. Bei Tailscale-RTT 200ms = 1.5s gespart per Suche.

## LIKE statt FTS5 — Iteration 1

Heutiger Bestand: ~20 Council-Objekte. `LIKE '%query%'` über `address` + `title` mit `LOWER()` für Case-Insensitivität (auch Umlaute) ist absolut ausreichend. Limit-200-Pre-Filter + 50-Result-Cap.

FTS5 wäre saubere Lösung bei >200 Objekten (Stemming, Ranking, sub-millisecond statt full-table-scan). **Bewusst nicht eingebaut** — Iteration 2 wenn realer Schmerz auftritt. Field-Note dokumentiert Trade-off, Migration zu FTS5 wäre eine separate Mini-Bauteil mit Virtual-Table + Trigger.

## Search-Reader-Design

`searchCouncilObjects(q, status): SearchHit[]` in `council-db/reader.ts`:

```typescript
type SearchHit = {
  object: CouncilObjectRow;
  effective_status: CouncilStatusTag | 'abgelaufen';
  override_source: 'override' | 'council';
};
```

Reader-Flow:
1. SQL-Filter via LIKE auf `address` + `title` (LOWER, COALESCE für NULL)
2. Bei leerem `q` UND `status='alle'` → leer (UI zeigt Hint, nicht 1000+ Rows)
3. Override-Map lesen (folio.db, einmalig)
4. Per-Hit `effectiveStatusTag`-Merge inline (selbe Logik wie `effectiveStatusTag`-Helper aus Bauteil 0.5)
5. Status-Filter ≠ 'alle' → nur Hits behalten wo `effective === status`
6. Cap bei 50 Treffern

`override_source` ist neu exposed — UI rendert „eigene Einstufung"-Indikator wenn `'override'`.

## Status-Filter (4 Werte aus Direktive)

`alle | beobachten | kaufen | archiv`. Bei `archiv` nur exakt `status_tag='archiv'`, nicht auch 'verworfen' oder 'abgelaufen'. Konservative Interpretation der Direktive — User kann später erweitern.

## Verifikation (alle ✓)

1. `npm run check` — 0 neue Errors.
2. **Empty State**: `/council/mobile/suche` → „Suche nach Adresse…" Hint.
3. **Volltext-Treffer**: `?q=Rheinfelden` → 1 Treffer (Haus in Rheinfelden), Titel sichtbar.
4. **No-Results**: `?q=xyz123nichtsfindbar` → „Keine Treffer für…".
5. **Status-Filter-only**: `?status=kaufen` ohne Query → 0 Treffer (keine Council-Objects mit status='kaufen', keine Overrides).
6. **Status + Override-Merge**: manuell `INSERT … status_tag='kaufen' recorded_at='2099…'` → `?status=kaufen` → 1 Treffer, „eigene Einstufung"-Marker sichtbar.
7. **Cleanup**: Override-Row entfernt.

## Limitations / Out of Scope

- **FTS5**: Iteration 2 wenn >200 Objekte oder wenn LIKE-Performance leidet. Aktuell: kein Problem, Volltable-LIKE bleibt unter 5ms.
- **Range-Filter** (qm/Preis): Direktive sagt explizit „eigene spätere Iteration falls Bedarf". Nicht hier.
- **PLZ als eigener Filter**: heute via Volltext (Beispiel: q=`8000` matched „Lagos,Lagos (8000)" im Titel). Wenn PLZ-only-Filter gewünscht, könnte ein zusätzliches Input-Feld kommen.
- **Suche-History / Recent-Queries**: nicht in 1e. Lokale URL ist bereits History via Browser.
- **Suche im Verlauf / Pipeline / Meine-10**: Nope. Suche ist eine eigene Liste über alle Objekte, nicht ein kontext-spezifischer Filter pro Tab.

## Critical Files

- `src/lib/server/council-db/reader.ts` — `searchCouncilObjects`, `SearchHit`-Type (+ ~80 Z)
- `src/routes/(council)/council/mobile/suche/+page.server.ts` (neu, ersetzt Placeholder)
- `src/routes/(council)/council/mobile/suche/+page.svelte` (ersetzt Placeholder)

## Damit ist die Mobile-UI komplett

Alle vier Tabs (Verlauf · Pipeline · Meine 10 · Suche) funktional. Alle Schreib-Pfade aktiv. Detail-Ansicht voll bedienbar. Cross-DB-Reads + folio-owned Schreib-Pfade konsistent. Tailscale-Latenz-bewusste UX (Optimistic + Debounced).

**Nächste Schritte nach 1e-Merge:**
1. **Self-Test via Tailscale auf eigenem iPhone** — visuelle Verifikation, Touch-Drag in Meine-10, Notiz-Speichern, alle Tabs.
2. Anpassungen basierend auf eigenem Test.
3. **Frau-Test** als council_member via Tailscale-Header.
4. Anpassungen basierend auf Frau-Feedback.
5. **Council-Repo-Direktive**: pending_ingest-Worker (cross-DB-Read in folio.db, ingest_from_link.py, processed_at-Ack).
6. Cross-DB-Read für object_status_override im Council-Worker (Override beim Status-Lifecycle berücksichtigen, optional).

## Bauteil-Übersicht (alles auf main nach 1e-Merge)

- **0**: object_views, object_triggers, hauskauf_workflow
- **0.5**: object_status_override, user_rankings, pending_ingest
- **0.6**: object_notes
- **1a**: Routing + Tab-Shell + Verlauf + Detail-Read
- **1b**: Pipeline-Tab + Konsens-Trigger-CTA
- **1c**: Link-Ingest-Endpoint + Whitelist
- **1d**: Detail-Schreib-Aktionen + Meine-10-Drag-Drop
- **1e**: Suche

7 Schemata + 7 API-Endpoints + 4 Tabs + 1 Detail-Page. Cross-Repo Single-Source (portals.yaml). Optimistic UI durchgehend. ~5000 Zeilen neu, alle in eigenen FF-mergeable Sub-Bauteilen.
