# Field-Note — Bauteil 0.5: Cross-DB-Write-Ersatz-Schemata

**Datum**: 2026-05-30
**Branch**: `feature/council-bauteil-0.5-cross-db-write-ersatz-2026-05-30`
**Direktive**: Vor-Bauteil zur Mobile-UI-Direktive

## Architektur-Begründung

Drei UI-Schreibpfade der Mobile-Direktive (Status-Tag, Per-User-Top-10, Link-Ingest) sollten ursprünglich in council.db schreiben. Das bricht die HANDOFF-Ownership-Regel („wer schreibt, owned. Cross-DB-Reads read-only, never cross-write").

Diskutiert wurden drei Pfade:

- **A — HTTP-Bridge** (Council bekommt FastAPI-Server, folio ruft via HTTP). Verworfen: macht den periodischen launchd-Worker zum Long-Running-Daemon, neue Auth+Lifecycle-Infra.
- **B — Zentrale Queue-Tabelle in folio.db**. Verworfen: drei Schreibpfade haben unterschiedliche Konsumenten und Lebenszeiten, ein generischer Queue-Tisch mit Typ-Discriminator wäre weniger klar als drei eigene Tabellen.
- **C — Owner-Verteilung reframen**. Gewählt: die drei UI-Schreibpfade *gehören* semantisch folio (User-Inputs, nicht Lens-Outputs). Drei eigene folio-Tabellen, append-only, gleiches Pattern wie Bauteil 0.

## Drei Tabellen

| Tabelle | Schreibt | Liest |
|---|---|---|
| `object_status_override` | Folio (User-Klick Kaufen/Beobachten/Verwerfen) | Folio-Reader merged mit `council.objects.status_tag` |
| `user_rankings` | Folio (Drag-Drop in „Meine 10") | Folio-Reader für UI; später optional Council-Worker für Borda-Gewichtung |
| `pending_ingest` | Folio (Link-Eingabe in Pipeline-Tab) | Council-Worker beim 4h-Tick |

## Konventionen

- **Append-only**: jeder Schreibvorgang ist INSERT, kein UPDATE/DELETE. Gleich wie corrections, rankings, validator_opinions.
- **Latest-wins pro Key**: Reader picks die jüngste Row pro (object_id) bzw. (user_id, object_id). SQL-Pattern: inneres MAX(recorded_at) Subquery.
- **`rank=0` als Removal-Sentinel** in `user_rankings`: ohne DELETE-Möglichkeit muss ein Objekt das nicht mehr in Top-10 gehört explizit per neuer Row mit rank=0 markiert werden. Reader filtert auf `rank > 0`.

## Drag-Drop-Batch-Mechanik

Ein Reorder-Vorgang in „Meine 10" verschiebt typisch mehrere Objekte gleichzeitig (Objekt X von #5 nach #2 → #2/#3/#4 rutschen auf #3/#4/#5). `insertUserRankingBatch(userId, batch)` schreibt alle betroffenen Rows in **einer better-sqlite3-Transaktion** mit **identischem ISO-Timestamp** für `recorded_at`. So sieht der UI-Reader entweder den ganzen alten oder den ganzen neuen Stand, nie einen halben.

## Effective-Status-Tag-Merge

`effectiveStatusTag(councilLastUpdated, councilStatusTag, override)`:
- override existiert und `override.recorded_at > councilLastUpdated` → override gewinnt
- sonst Council-Wert

So bleibt der Lens-Worker autoritativ für Lifecycle-Tags wie `'abgelaufen'` (wird er später setzen via Cleanup-Lauf), während User-Klicks sofort sichtbar sind und solange gelten, bis der Worker den Status erneuert (z.B. abgelaufenes Inserat → User-Override „beobachten" wird vom Worker mit jüngerem `'abgelaufen'` überschrieben — gewünschtes Verhalten).

## `pending_ingest.processed_at` — die eine Ausnahme

Der Council-Worker schreibt nach Verarbeitung des Links den `processed_at`-Timestamp zurück nach folio.db. Das ist **die einzige sanktionierte Reverse-Cross-DB-Write** und auf eine Spalte einer Tabelle begrenzt. Dokumentiert hier, damit der Code-Reviewer der zukünftigen Council-Direktive nicht überrascht ist.

Alternative wäre Folio-Polling („existiert source_url bereits in council.objects?"). Verworfen, weil:
- mehrere Pending-Links können dieselbe URL durchlaufen (canonical-Resolution macht sie identisch erst nach Ingest)
- Ack-Marker erlaubt User-Feedback („dein Link ist drin, hier ist das Objekt"), Polling nur „nicht mehr drin im pending"

## `CouncilStatusTagAll` vs heutiger folio-Reader-Lücke

Die Override-CHECK kennt 6 Werte (`neu | kaufen | beobachten | verworfen | archiv | abgelaufen`), parität mit council.objects.status_tag.

Im folio-Reader `src/lib/server/council-db/types.ts` ist `CouncilStatusTag` heute aber nur 5er (kein `'abgelaufen'`) — Lücke aus Council-Härtung 2026-05-28. Der HANDOFF erwähnt das als 3-LOC-Update für `readCouncilTop`. **Nicht in dieser Direktive aufgeräumt**; flagging für eine spätere Konsolidierung.

## Verifikation (alle ✓)

1. `npm run check` — 0 neue Errors, 24 Warnings (alle pre-existing).
2. `npm run dev` startet, lazy Schema-Init bei erstem Request, drei Tabellen + Indizes (inkl. Partial-Index `WHERE processed_at IS NULL`) sind in folio.db.
3. **CHECK-Constraint**: `INSERT … status_tag='unbekannt'` → SQLite-Reject.
4. **Override latest-wins** (raw SQL): zwei Rows pro Objekt mit unterschiedlichen recorded_at → Query `ORDER BY recorded_at DESC LIMIT 1` picks die jüngere.
5. **User-Rankings**: drei Batches simuliert (A=1, B=2, C=3 → A=2, B=1 → C=0). Reader-Query liefert nach Batch 3: `{B:1, A:2}`, C ist raus.
6. **Pending-Ingest-Ack**: zwei Inserts, einer ack'd → nur der ungeack'd erscheint in `processed_at IS NULL`-Query, beide in voller Liste.
7. **Cleanup**: alle Test-Rows nach Verifikation entfernt (`DELETE FROM ...`), Tabellen-Counts wieder 0/0/0.

JS-Level-Smoke der TypeScript-Reader/Writer wurde nicht ausgeführt (kein tsx/vite-node installiert, und ad-hoc Project-Pollution vermieden). Die SQL-Queries der Reader sind identisch zu den hier verifizierten Raw-Queries; `npm run check` validiert Type-Konsistenz. End-to-end-Exercise der TS-Funktionen geschieht in der Mobile-UI-Direktive durch die echten API-Endpoints.

## Out of Scope

- **API-Endpoints**: kommen mit Mobile-UI (`POST /api/council/[id]/status`, `POST /api/council/me/rankings`, `POST /api/council/ingest`). Diese Direktive baut nur die DB-Grundlage.
- **Council-Worker-Erweiterung**: liest cross-DB die drei folio-Tabellen, prozessiert `pending_ingest`, setzt `processed_at` zurück. Eigene Council-Repo-Direktive.
- **`CouncilStatusTag` 5er → 6er-Konsolidierung** im folio-Reader.
- **History-Aggregat** über `user_rankings`: wenn jemals interessant zu sehen wann ein User welches Objekt wohin verschoben hat, ist das ein einfaches GROUP-BY-Query auf der Tabelle — keine zusätzlichen Spalten nötig.

## Critical Files

- `src/lib/server/folio-db/init.ts` (+47 Z)
- `src/lib/server/folio-db/types.ts` (+35 Z)
- `src/lib/server/folio-db/reader.ts` (+62 Z)
- `src/lib/server/folio-db/writer.ts` (+72 Z)
