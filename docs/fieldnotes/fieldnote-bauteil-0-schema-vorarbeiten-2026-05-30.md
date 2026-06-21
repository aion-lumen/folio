# Field-Note — Bauteil 0: Schema-Vorarbeiten Council-Mobile-UI

**Datum**: 2026-05-30
**Branch**: `feature/council-bauteil-0-schemata-2026-05-30`
**Direktive**: Bauteil 0 vor Council-Mobile-UI (Vier-Tab Verlauf · Pipeline · Meine 10 · Suche)

## Was gebaut

Drei neue Tabellen in `~/.folio/folio.db`, drei Reader + drei Writer, ein Cross-DB-Helper im council-Reader, zwei Schreib-API-Endpoints. Kein UI.

| Tabelle | Zweck | PK |
|---|---|---|
| `object_views` | per-User-Sicht-Tracking („ungesehen für User X seit letzter Lens-Bewertung") | (object_id, user_id) |
| `object_triggers` | per-User „antriggern"-Klicks; Vor-Stufe zum Konsens | (object_id, user_id) |
| `hauskauf_workflow` | Workflow-Status pro Objekt: offen → terminiert → besichtigt | id (UNIQUE auf council_object_id) |

## Drei-Tabellen-Skizze + Warum drei statt zwei

Die ursprüngliche Direktive listet nur zwei Tabellen (object_views + hauskauf_workflow). `object_triggers` wurde als dritte hinzugefügt, weil die Konsens-Logik („beide User klicken antriggern → status='offen'") einen Zwischenzustand braucht: zwischen „1. User hat geklickt" und „2. User hat geklickt" muss der erste Klick *irgendwo* gespeichert sein. Optionen:

- direkt in `hauskauf_workflow` mit pseudo-Status `'pending-konsens'` → würde den Status-Begriff verwässern und CHECK-Constraint komplizieren.
- in council.db schreiben → bricht die Cross-DB-Ownership-Regel (council ist von Python-Workern owned).
- **eigene Tabelle `object_triggers`** → sauber separiert; `hauskauf_workflow` entsteht erst beim 2. Trigger und bleibt semantisch klar „Workflow gestartet".

## Cross-DB-Decision: `last_lens_evaluation`

Council.objects hat *keine* Spalte `last_lens_evaluation`. Drei Quell-Optionen wurden diskutiert; gewählt: **Hybrid**.

`council-db/reader.ts::lastLensEvaluationMap()` ermittelt:
1. `MAX(rankings.recorded_at)` per object_id wo `participant_id LIKE 'lens-%'`.
2. Fallback `objects.last_updated` für Objekte ohne Lens-Rankings (frisch ingestiert, noch nicht bewertet).

Ergebnis: `Map<object_id, ts>`. Die finale „ungesehen pro User"-Filterung passiert später im Mobile-Page-Loader durch In-Memory-Merge von `lastLensEvaluationMap()` + `getViewedAtForUser(locals.user.id)`.

## Race-Condition-Behandlung

Szenario: Owner (Desktop) und Frau (Tablet) klicken im selben Sekundenbruchteil „antriggern" auf dasselbe Objekt. Ohne Atomarität liest jeder Request den Trigger-Set ohne den anderen → beide entscheiden „kein Konsens" → keine `hauskauf_workflow`-Row entsteht trotz beider Trigger.

Lösung: `writer.ts::triggerObjectAndMaybeCreateWorkflow()` bündelt drei Steps in einer `db.transaction(...)`:

```
1. UPSERT object_triggers (object_id, user_id, NOW)
2. SELECT user_id FROM object_triggers WHERE object_id = ?
3. IF count >= 2: INSERT OR IGNORE INTO hauskauf_workflow ...
```

better-sqlite3 serialisiert Transaktionen innerhalb eines Node-Prozesses; SQLite-WAL serialisiert über Prozesse hinweg. Multi-Tab und Tablet+Desktop simultan sind beide abgedeckt. `INSERT OR IGNORE` + UNIQUE(council_object_id) macht Step 3 zusätzlich idempotent — bei Race-Verlust gewinnt der erste Insert, der zweite ist No-Op.

## API-Vertrag

### `POST /api/council/[id]/view`
- Request: kein Body.
- Auth: `locals.user` (Tailscale-Header oder localhost-Default).
- Response: `{ ok: true, viewed_at: <iso-string> }`.
- Effekt: UPSERT object_views(object_id=params.id, user_id=locals.user.id, last_viewed_at=NOW).

### `POST /api/council/[id]/trigger`
- Request: kein Body.
- Auth: `locals.user`.
- Response: `{ ok: true, triggered_by: number[], workflow_created: boolean }`.
- Effekt: atomare Trigger-UPSERT + bedingter Workflow-INSERT (s. Race-Condition).

Beide Endpoints schreiben nur in folio.db. Council.db bleibt read-only.

## FK-Klauseln

`FOREIGN KEY (user_id) REFERENCES users(id)` und FK auf created_by_user_id sind im SCHEMA mitgeschrieben, werden aber von SQLite **nicht erzwungen**, weil `PRAGMA foreign_keys=ON` projektweit nicht gesetzt ist. Cross-DB-FK (object_id → council.objects.id) ist syntaktisch sowieso nicht möglich — als Kommentar dokumentiert. Zweck: Selbst-Dokumentation für Tooling (DB-Browser, ER-Diagramm-Generatoren) und falls später projektweit FK-Enforcement aktiviert wird.

## Verifikation (alle ✓)

1. `npm run check` — 0 Errors, 24 Warnings (alle aus Pre-Existing-Code).
2. `npm run dev` startet, lazy Schema-Init bei erstem Request, drei neue Tabellen erscheinen in folio.db.
3. `POST /view` → `{ ok:true, viewed_at:... }`, Row in object_views.
4. `POST /trigger` als User 1 → `triggered_by:[1], workflow_created:false`. Keine Workflow-Row.
5. `POST /trigger` als User 2 (via Tailscale-Header `frau@example.com`) → `triggered_by:[1,2], workflow_created:true`. Workflow-Row mit status='offen'.
6. `POST /trigger` erneut User 2 → `workflow_created:false`. Workflow-Count bleibt 1 (UNIQUE-Constraint).
7. CHECK-Constraint: `UPDATE status='terminiert'` ohne termin → SQLite-Reject (`CHECK constraint failed`). Mit termin → erfolgreich. Analog `status='besichtigt'` ohne verhandlungspreis → Reject.
8. Test-Daten danach manuell entfernt (`DELETE FROM ...`).

## Limitations / Out of Scope

- **Kein UI**: weder Mobile-Tabs noch Desktop-Vault-Workflow-Pflege. Status-Übergang `offen → terminiert → besichtigt` braucht später ein UI das `updateHauskaufWorkflowStatus(id, status, patch)` ruft.
- **Keine Status-History**: `hauskauf_workflow` ist UPDATE-in-place (im Gegensatz zum projektweiten append-only-Pattern von corrections/rankings). Begründung: nur eine aktive Workflow-Row pro Objekt, History bisher nicht angefragt. Falls je gebraucht → separates `hauskauf_workflow_history`-Log-Schema oder Umbau auf append-only mit Latest-Wins-Query.
- **Council-Status-Tag `'abgelaufen'`** im folio-Reader fehlt nach wie vor (3-LOC-Lücke aus Council-Härtung 2026-05-28). Separate Aufgabe, nicht in diesem Branch.
- **`object_views`-Cleanup**: kein TTL, keine GC. Wenn Objekte aus council.db verschwinden, bleiben verwaiste object_views-Rows liegen. Quantitativ vernachlässigbar (eine Row pro User pro je-besuchtem Objekt).

## Nächste Direktive (Mobile-UI) — was bereit liegt

- `getViewedAtForUser(userId)` + `lastLensEvaluationMap()` → in-Memory-Merge für „Neu · noch nicht eingeordnet"-Sektion.
- `getTriggerSetForObject(objectId)` → „X hat getriggert"-Indikator.
- `listAllHauskaufWorkflow()` + `getHauskaufWorkflowForObject(objectId)` → Workflow-Block (Offen · Terminiert · Besichtigt).
- `POST /api/council/[id]/view` → Aufruf beim Öffnen einer Objekt-Detail-Ansicht.
- `POST /api/council/[id]/trigger` → Aufruf beim „antriggern"-Klick.

## Critical Files

- `src/lib/server/folio-db/init.ts` (+47 Z)
- `src/lib/server/folio-db/types.ts` (+30 Z)
- `src/lib/server/folio-db/reader.ts` (+30 Z)
- `src/lib/server/folio-db/writer.ts` (+80 Z)
- `src/lib/server/council-db/reader.ts` (+30 Z)
- `src/routes/api/council/[id]/view/+server.ts` (neu)
- `src/routes/api/council/[id]/trigger/+server.ts` (neu)
