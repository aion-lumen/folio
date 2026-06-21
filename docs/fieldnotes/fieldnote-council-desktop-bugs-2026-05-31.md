# Fieldnote: Council-Desktop-Bugs (2026-05-31)

**Repo:** `~/Projects/folio/`
**Branch:** `feature/council-desktop-bugs-2026-05-31` · 2 Commits, kein Push.
**Basis:** `feature/council-desktop-minimal-update-2026-05-31` (Desktop-Minimal-Update, ebenfalls noch ohne Push).

## Anlass

Drei Bugs aus dem Desktop-Test des Desktop-Minimal-Updates:

- **A** — Verlauf zeigt Notiz-Änderungen nicht (Top-10 erscheint mittlerweile, weil `user_rankings`-Pfad seit Aufräum-Branch funktioniert; nur `object_notes` fehlte komplett im Reader).
- **B** — Desktop-Filter-Counts (5/0/0/0/0) und Listen-Länge (9 inkl. zwei „Beobachten eigene") sind inkonsistent.
- **C** — Mobile-Suche bei Status „Alle" + leerer Query weiterhin leer; „poppen kurz auf und verschwinden" durch Skeleton + Empty-Hint-Flash.

## Was geändert

### Commit 1 — `fix(council-db): notizen-im-verlauf + counts ueber effective-status + suche-alle`

**Bug A — `object_notes` in `getRecentEvents`:**
- Neuer `VerlaufEvent`-Variant `'note'` mit `user_id` + `note_text`.
- Query analog zu `user_rankings`: `WHERE recorded_at >= ? AND note_text != ''`. Self+Partner beide, Renderer trennt via `user_id === currentUserId`. Leere Notizen (User-Cleared, Bauteil 0.6) erscheinen NICHT im Verlauf.

**Bug B — `countObjectsByEffectiveStatus`:**
- Neuer Helper, delegiert an `readAllCouncilObjects('alle', 'last_updated', userId)` und gruppiert nach `effective_status`. „Abgelaufen" fällt unter „Archiv" für die UI-Counts (keine eigene Filter-Pill).
- `countObjectsByStatus` bleibt im Reader stehen (Back-Compat).

**Bug C — `searchCouncilObjects`:**
- Hardcoded `if (!query && status === 'alle') return [];` entfernt. Der else-Pfad lädt eh `SELECT * LIMIT 500` mit Status-Filter „alle"-passthrough.

### Commit 2 — `fix(council-ui): note-event-renderer, effective-counts-loader, suche-hint`

- **Desktop-Loader** `+page.server.ts`: `countObjectsByStatus` → `countObjectsByEffectiveStatus(userId)`. Eine Wahrheit, gleicher Pfad wie die Liste.
- **Mobile-Verlauf** `mobile/+page.svelte`: neuer Switch-Case `'note'` mit `✎`-Glyph, Self/Partner-Attribution via `actorLabel`, Notiz-Snippet auf 60 Zeichen gekürzt.
- **Mobile-Suche** `mobile/suche/+page.svelte`: `showEmptyHint = data.hits.length === 0 && q.trim() === '' && status === 'alle'`. Bei vollem Bestand: keine Empty-Hint mehr, sondern direkt die Listen-Anzeige.

### Commit 3 — `fix(council-db): archiv-filter wird umbrella fuer lifecycle-tot`

**Folge-Bug aus Bug B:** Archiv-Pill zeigte Count 4, Liste sagt „Keine Objekte". `countObjectsByEffectiveStatus` mapped Inline `'abgelaufen' → 'archiv'`-Bucket, aber `readAllCouncilObjects` und `searchCouncilObjects` filterten via exact-match `effective !== status`. Inkonsistenz zwischen Counts und Liste.

**Fix:** Zentraler Helper `effectiveMatchesFilter(effective, filter)` im Reader-Modul:
- `'alle'` → alles durch.
- `'archiv'` → effective IN (`'archiv'`, `'abgelaufen'`) — Umbrella für lifecycle-tot.
- sonst exact match.

Anwendung in drei Pfaden:
- `readAllCouncilObjects` (Desktop-Liste).
- `searchCouncilObjects` (Mobile-Suche — identischer Bug, jetzt mitgefixt).
- `countObjectsByEffectiveStatus` (Desktop-Counts) — Loop über Buckets via Helper statt Inline-Mapping.

**Architekt-Entscheidung:** `'verworfen'` bleibt eigene Pille (User-Authority, nicht Lifecycle). Filter-Pill-Label „Archiv" bleibt, Semantik ist implizit Umbrella.

## Half-Switch-Check (Architekt-Beobachtung)

Alle `readCouncilTop`-Aufrufer geprüft:
- `mobile/pipeline/+page.server.ts:31` — Voices-Hydration für Borda-Top-10-Pulse. ✓
- `mobile/meine-10/+page.server.ts:18` — Voices + `bordaItems`. ✓
- `desktop/+page.server.ts:41` — Voices-Map für Liste. ✓

`readCouncilTop` wird konsistent als „Borda-Top-10-Voices-Hydration" benutzt, `readAllCouncilObjects` für Vollbestand. Counts war die einzige Stelle, die noch alten Pfad nutzte — gefixt.

## Verifikation (offen — Browser-Test)

1. **Bug A:** Notiz im Desktop-Detail-Panel schreiben + speichern (debounced 1.5 s) → Mobile-Verlauf zeigt „Du hat eine Notiz zu <Adresse> geschrieben" mit Snippet.
2. **Bug B:** Desktop-`/council` öffnen → Counts oben summieren zur Listen-Länge; Status-Override-Objekte ("beobachten eigene") werden im „Beobachten"-Count gezählt.
3. **Bug C:** Mobile-Suche-Tab, Status auf „Alle" ohne Query → voller Bestand erscheint, kein Empty-Hint-Flash.
4. Type-Check: 0 Errors (nach beiden Commits verifiziert).

## FF-Merge-Reihenfolge

1. `feature/council-desktop-minimal-update-2026-05-31` → main (FF, 3 Commits).
2. `feature/council-desktop-bugs-2026-05-31` → main (FF, 3 Commits inkl. dieser Note).
3. Push auf Anweisung.
