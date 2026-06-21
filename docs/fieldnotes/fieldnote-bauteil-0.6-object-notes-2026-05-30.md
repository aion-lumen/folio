# Field-Note — Bauteil 0.6: object_notes-Schema

**Datum**: 2026-05-30
**Branch**: `feature/council-bauteil-0.6-object-notes-2026-05-30`
**Direktive**: Klärungspunkt aus Mobile-UI-Direktive v2 — eigene Schema-Tabelle

## Was gebaut

Eine neue Tabelle in folio.db: `object_notes`. Append-only, gleiches Pattern wie Bauteil 0.5. Plus zwei Reader-Helper und ein Writer-Helper. Kein API, kein UI.

## Schema-Eigener-Branch-Konvention

Architekt-Entscheidung: Notiz-Schema bekommt eigenes Bauteil, statt es im Mobile-UI-Branch 1a mitzuliefern. Begründung: Schema-Änderungen sind eine eigene Klasse von Diffs, sauber atomar isoliert (gleiche Logik wie bei Bauteil 0 und 0.5). Field-Notes bleiben pro Bauteil scannable.

## Konvention: leeres `note_text` = User-cleared

`note_text` ist im Schema NOT NULL — leere Notiz ist ein nicht-leerer String `''`, kein NULL. Vorteil: Schema-Vertrag bleibt simpel, kein Three-Valued-Logic-Spaß. Bedeutung wird im Reader interpretiert:

- `getLatestNoteFor(userId, objectId)` returnt `null` wenn die jüngste Row `note_text === ''` ist
- `getLatestNotesMapForUser(userId)` skipped cleared notes, aber respektiert die Reihenfolge (cleared-jüngste schlägt eine ältere nicht-leere Note)

So kann der User eine Notiz löschen ohne dass der Audit-Trail bricht — die Insert-Reihe bleibt für später-rekonstruktion vollständig.

## Zwei Reader-Varianten — wofür?

- **`getLatestNoteFor(userId, objectId)`**: Detail-Ansicht-Aufruf, lädt genau die eine Notiz fürs Textfeld.
- **`getLatestNotesMapForUser(userId)`**: Listen-Ansichten (Pipeline „Neu", Meine 10, Verlauf), die einen Notiz-Indikator pro Karte zeigen wollen („📝 Notiz vorhanden"). Single SELECT, in-memory dedup — kein N+1.

## Verifikation (alle ✓)

1. `npm run check` — 0 neue Errors.
2. `npm run dev`, lazy Schema-Init bei erstem Request, Tabelle + zwei Indizes vorhanden.
3. **Append-only + latest-per-(user,object)**: zwei Versionen einer Notiz inserted, Reader-Query liefert die jüngere.
4. **Cleared-Sentinel**: leere Note `''` als jüngste Row → Reader-Query liefert die leere Row; Reader-Funktion `getLatestNoteFor` würde `null` returnen.
5. Cleanup: alle Test-Rows entfernt.

JS-Level-Smoke (TS-Imports) deferred wie bei Bauteil 0.5 — wird durch Sub-Bauteil 1a API-Endpoint exercised.

## Out of Scope

- API-Endpoint `POST /api/council/[id]/note` und `GET /api/council/[id]/note` — kommt mit Sub-Bauteil 1a (Detail-Ansicht UI).
- Notiz-UI im Detail (Textfeld + Save-Button/Auto-Save) — Sub-Bauteil 1a.
- Listen-Indikator („📝 Notiz vorhanden") — Sub-Bauteile 1b/1d je nach Liste.

## Critical Files

- `src/lib/server/folio-db/init.ts` (+13 Z)
- `src/lib/server/folio-db/types.ts` (+10 Z)
- `src/lib/server/folio-db/reader.ts` (+40 Z)
- `src/lib/server/folio-db/writer.ts` (+18 Z)

## Damit ist die Schema-Vorarbeit komplett

Bauteil 0 + 0.5 + 0.6 = alles, was das Mobile-UI an folio.db braucht. Nächster Schritt: Mobile-UI-Bau in Sub-Bauteilen 1a–1e nach Direktive v2.
