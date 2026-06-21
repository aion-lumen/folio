# Field-Note — Sub-Bauteil 1b: Pipeline-Tab + Konsens-Trigger-CTA

**Datum**: 2026-05-30
**Branch**: `feature/council-mobile-1b-pipeline-konsens-trigger-2026-05-30`
**Direktive**: Council-Mobile-UI v2 — Tab 2 (Pipeline) + Konsens-Trigger-Karte

## Was gebaut

Pipeline-Tab vier Blöcke nach Direktive: Puls-Header · Link-Eingabe (Stub) · Neu · Workflow. Konsens-Trigger-Card mit funktionalem CTA, eingesetzt sowohl im Pipeline-Workflow-Block oben als auch in der Detail-Ansicht. Vorhandener Placeholder ersetzt.

## Pulse-Helper als Aggregator-Stil

Architekt-Anmerkung übernommen: `getPipelinePulse(userId, since): PipelinePulse` ist ein dedizierter Aggregator-Helper im Stil von `getRecentEvents` (1a), nicht inline im Page-Loader. Eine Quelle, ein Komposit-Type, klare Wiederverwendbarkeit.

```typescript
type PipelinePulse = {
  bewegt: number;   // distinct object_ids mit lens-moved seit since (aus getRecentEvents)
  konsens: number;  // count(getConsensusReadyObjectIds())
  pipeline: number; // count(listAllHauskaufWorkflow())
  neu: number;      // count(getUnseenCouncilObjectsForUser(userId))
  partner: { user_id, display_name, last_action_ts, last_action_summary } | null;
};
```

`bewegt` und `partner` werden aus dem `getRecentEvents`-Output abgeleitet (eine Cross-DB-Query, zwei Konsumenten). Konsens-Detection ist eine separate Query weil sie eine andere Logik braucht (latest-rank pro user/object, ≥2 user mit rank ≤ 3, kein Workflow vorhanden) — diese landet in `getConsensusReadyObjectIds()`.

## Cross-DB-Logik für Konsens-Detection

`getConsensusReadyObjectIds()` (folio.db only):

```sql
-- Inner: latest rank per (user, object) where rank in [1..3]
-- Outer: GROUP BY object_id HAVING COUNT(DISTINCT user_id) >= 2
-- Filter: object_id NOT IN (SELECT council_object_id FROM hauskauf_workflow)
```

Beides liest aus folio-Tabellen (`user_rankings` + `hauskauf_workflow` aus Bauteil 0/0.5), kein Cross-DB-Read nötig — Konsens ist semantisch ein Folio-Konzept. Object-Resolution (Foto/Adresse) passiert dann via `getCouncilObjectById` im Page-Loader.

## Trigger-Roundtrip

`ConsensusTriggerCard.svelte` ruft beim Klick `fetch('POST /api/council/[id]/trigger')` (Endpoint existiert seit Bauteil 0, atomar via `db.transaction`). Response: `{ok, triggered_by, workflow_created}`. Statt Optimistic-UI: `invalidateAll()` (SvelteKit) → Server-Reload des Page-Loaders → Konsens-Karte verschwindet, Workflow-Sektion zeigt neue „Offen"-Row.

Begründung gegen Optimistic-Update in 1b: weniger Code, transaktionale Korrektheit aus Bauteil 0 reicht zur Konsistenz. Optimistic-Polish wäre eine spätere Iteration.

## Verifikation (alle ✓)

1. `npm run check` — 0 neue Errors.
2. `/council/mobile/pipeline` (200) rendert mit allen 4 Blöcken: Pulse-Chips, Link-Eingabe-Stub, Neu-Sektion (5 Objekte), Workflow-Sektion.
3. **Pulse-Zahlen reagieren korrekt**:
   - Leerer Zustand: `bewegt=0, konsens=0, pipeline=0, neu=+5` (5 status='neu'-Objekte ungesehen).
   - Nach INSERT user_rankings für (User 1 rank=1) und (User 2 rank=2) auf selbem Objekt: `konsens=1` ✓
   - Pulse-Partner-Zeile zeigt: „Frau · zuletzt aktiv 22:29 · Top-10 verschoben" (aus `user_rankings`-Event)
4. **ConsensusTriggerCard rendert** im Workflow-Block oben mit ObjectCard-Mini + Status-Rows + CTA-Button.
5. **Trigger-Roundtrip 2-User**:
   - User 1 (localhost-default): `POST trigger` → `{triggered_by:[1], workflow_created:false}`, Karte bleibt, Pulse unverändert.
   - User 2 (Tailscale-Header `frau@example.com`): `POST trigger` → `{triggered_by:[1,2], workflow_created:true}`. Karte verschwindet, Workflow-Group „Offen" zeigt die neue Row, Pulse: `konsens=0, pipeline=1`.
6. **Detail-Page Konsens-Block** zeigt jetzt `ConsensusTriggerCard` statt Stub-Zeile. Selber CTA, selbe `invalidateAll`-Mechanik.
7. **Cleanup**: alle Test-Rows (`hauskauf_workflow`, `object_triggers`, `user_rankings`, `users id=2`, `object_views`) entfernt.

## Limitations / Out of Scope

- **Konsens-Karte sichtbar**: erst wenn `user_rankings`-Daten existieren. Bis Sub-Bauteil 1d (Drag-Drop in Meine-10 + In-Top-10-Picker im Detail) bleibt sie in der Praxis leer. Heutige Test-Daten kamen aus manuellen INSERTs.
- **LinkInputBox Stub**: visuell vollständig, Button disabled. Funktional ab Sub-Bauteil 1c (`POST /api/council/ingest` → `insertPendingIngest`).
- **Optimistic-UI für Trigger**: nicht in 1b. Aktuell `invalidateAll()` nach Server-Bestätigung.
- **Pulse anchor-Scroll**: die Chips sind `<a href="#neu">`/`href="#workflow">`-Anker. Smooth-Scroll nutzt Browser-Default, kein JS.
- **Edge-Case "abgelaufenes Objekt im Konsens"**: wenn ein Konsens-Objekt zwischen User-Ranking und jetzt 'abgelaufen' wurde, hat es kein photo_url + kein address → ObjectCard zeigt '⌂' und '—'. Sichtbar, würdig, nicht hübsch — Architekt-Entscheidung ob Filter eingebaut werden soll, in 1b nicht beschnitten.

## Critical Files

### Reader-Layer
- `src/lib/server/council-db/reader.ts` — `PipelinePulse`, `getPipelinePulse`, `getUnseenCouncilObjectsForUser`, `getConsensusReadyObjectIds`, `getWorkflowGrouped` (+ ~140 Z)
- `src/lib/server/folio-db/reader.ts` — `listOtherUsers(selfId)` (+7 Z)

### Komponenten (alle neu unter `src/lib/council/mobile/`)
- `PulseBlock.svelte` (4 Chips + Partner-Line)
- `StatusPill.svelte` (wiederverwendbar für offen/terminiert/besichtigt/kaufen/beobachten/verworfen/neu)
- `LinkInputBox.svelte` (Stub)
- `ConsensusTriggerCard.svelte` (mit funktionalem CTA)
- `WorkflowGroup.svelte` (eine Status-Gruppe + Pille rechts oben)

### Routes
- `src/routes/(council)/council/mobile/pipeline/+page.{server.ts,svelte}` — Placeholder ersetzt
- `src/routes/(council)/council/mobile/[id]/+page.svelte` — Konsens-Stub-Block durch `ConsensusTriggerCard` ersetzt; alte inline-CSS entfernt

## Damit ist 1b komplett

Frau kann nach Merge auf `/council/mobile/pipeline` die Pulse-Zahlen lesen, scannen was neu ist, und (sobald Top-10 existiert) den Konsens-Trigger klicken. Workflow-Sektion zeigt was im Loop ist. Was fehlt vor Frau-Test: Link-Eingabe-Backend (1c), Schreib-Aktionen im Detail + Meine-10 (1d), Suche (1e).
