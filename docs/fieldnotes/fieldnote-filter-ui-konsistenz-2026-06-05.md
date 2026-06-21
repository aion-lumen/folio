# Field-Note — Filter-UI-Konsistenz (Korrekturen A1/B1/B2/B3, 2026-06-05)

**Repo:** `~/Projects/folio/`
**Branch:** `feature/filter-ui-konsistenz-2026-06-05` · 4 Commits.
**Direktive:** `~/Projects/direktive-filter-diagnose-und-verfeinerung-2026-06-04.md`
(Follow-Up nach Mail-Welle-Test).

## Anlass

Mail-Welle-Iteration vom 5.6. (Korridor-Filter, StatusPillen,
Override-Endpoint) ist gemerged — User-Test hat 4 Korrekturen
identifiziert. Reihenfolge: 4 (Diagnose-first) → 3 → 2 → 1.

## Diagnose Korrektur 4 (Override-Pfad)

Override-Pfad ist 3-schichtig:

| Schicht | Status | Fix |
|---|---|---|
| (a) UI → folio.db.corrections | ✓ funktional | — |
| (b) `effective_actionability` respektiert correction | ✗ **offen** | A1 |
| (c) Worker-Konsumation / Re-Training | ✗ offen | Folge-Direktive |

**Engineer-Korrektur des Plans:** Bauteil A1 ist NICHT
multi-agent-Worker-Konsumation (wie ursprünglich vermutet), sondern
Folio-effective_actionability-Berechnung. Beweis: production_worker.py
INSERT OR IGNORE skipped Re-Klassifikation pro imap_uid — Override
würde nie greifen via Worker. Aber Folio rechnet
`effective_actionability` dynamisch im Mail-Queue-Loader und ignoriert
heute die `correction`-Map. Fix dort = sofortige UI-Wirkung.

## Was gebaut

### A1 — `fix(mail-queue): user-override beeinflusst effective_actionability`

`src/routes/(mail)/mail-queue/+page.server.ts`: `correctionMap.get(r.id)?.corrected_actionability`
als erste Quelle in der `effective_actionability`-Berechnung, vor
`applyTimeDecay`. `CorrectionRow.corrected_actionability` ist seit
F.8 Block-E im Type — nur Konsumstelle fehlte.

### B1 — `fix(mail-detail): final_blockers + marker-konsistenz`

`src/lib/server/regelwerk/active-rules.ts`: `ActiveRules.final_blockers`
hinzu. Computation filtert `heuristic_markers` nach Prefixes
`out_of_country:`/`out_of_corridor:`/`blocked_by:` — diese sind die
Marker, die in `classify_domain_actionability` Step 7/8/9 die
actionability überschrieben haben.

`EvidenceRules.svelte`: prominenter Status-Block oben wenn
`final_blockers` non-empty ("⚠ Archive-silent durch:
out_of_corridor:8000"). Rules-Liste wird gedämpft (opacity 0.55).

`EvidenceMarkers.svelte`: Blocker-Marker rot-rendert. Passt-Marker
(`tier2:location_whitelist:*`, `tier1:portal_domain:*`) wenn
blockers aktiv: opacity 0.45, line-through, „überschrieben"-Tag.

### B2 — `feat(council): desktop-detail distance via list-loader-batch`

`council-db/reader.ts`: `getDistancesForAllCouncilObjects(homeCoords)`
Batch-Helper (Map<objectId, distance|null>) + `CouncilListItem.distance_km`-
Field. `readAllCouncilObjects` bekommt optional homeCoords-Param.

`council/+page.server.ts`: `getHomePlz()` → homeCoords →
`readAllCouncilObjects(..., homeCoords)`. Distance pro Item vorberechnet.

`CouncilDetailPanel.svelte`: `item.distance_km` statt hardcoded null
an `<StatusPillen>`.

Performance: 41 Objects × 1 cross-DB-Query = negligible. Folge-
Direktive bei >1000 Objects (Denormalisierung via Worker-Bauteil).

### B3 — `feat(mail-detail): qm+preis-pillen via on-demand cross-db-lookup`

`council-db/reader.ts`: `getCouncilObjectByFirstFeedbackId(feedbackId)`
Reverse-Lookup. JSON-LIKE über alle objects (~41 → negligible).

`api/council/object-by-feedback/[id]/+server.ts` (neu): GET-Endpoint
liefert `{ found, qm, price_value, price_currency, council_object_id }`.

`DetailPanel.svelte`: `$effect` fetcht endpoint pro `row.uid`-Wechsel.
StatusPillen nutzt `qmPreis?.qm`/`?.price_value`. `nurEntfernung` entfällt
→ Drei-Pillen-Layout. Wenn Mail noch nicht in council.objects ingested
(`found: false`): qm/preis bleiben null → Pillen grau.

`CouncilObjectRow.from_feedback_ids` als Type-Field hinzu (im DB-Schema
schon, im TS-Type vergessen).

## Verifikation

- `svelte-check`: 0 Errors über alle 4 Commits.
  Pre-existing CSS-Warnings unverändert (35 warnings).
- A1: Engineer-Pfad-Verifikation via Code-Inspektion. Manueller Test:
  User klickt „actionable" auf archive-silent-Mail → Liste zeigt
  actionable nach reload.
- B1: Manueller UI-Test: Mail mit out_of_corridor:8000 → roter
  Status-Block, Whitelist-Marker als „überschrieben" gerendert.
- B2: Manueller UI-Test: Council-Desktop, Object öffnen →
  Entfernungs-Pille mit km-Zahl + Farbe.
- B3: Manueller UI-Test: Mail-Detail-Panel, ingested Mail → 3 Pillen
  mit qm+preis-Werten.

## Architektur-Entscheidungen

- **A1 als Folio-Fix statt Worker-Refactor:** Folio rechnet
  effective_actionability ohnehin dynamisch → Override-Konsum dort
  ist die natürliche Schicht. Worker konsumiert Korrekturen nicht
  und braucht es auch nicht für sofortige User-Wirkung.
- **B2 Batch-Strategie:** 41 Objects → Batch im List-Loader
  pragmatisch. On-Demand-Endpoint wäre unnötig komplex bei dieser
  Skalierung.
- **B3 On-Demand-Endpoint:** Mail-Liste hat 100+ Mails, qm/preis nur
  für aktuell-geöffnete Detail-Mail relevant → Batch im List-Loader
  wäre Overkill. Lazy-load via $effect bei row.uid-Wechsel ist
  effizient.
- **CouncilObjectRow.from_feedback_ids als Type-Field:** war im DB-
  Schema schon präsent, aber im TS-Type vergessen. svelte-check
  hätte das vorher nicht erkannt, weil keine Komsumstelle existierte.

## Out of Scope (eigene Folge-Direktiven)

- **Schicht (c) Re-Training-Script** für User-Korrektur-Pattern
  (Sender-Pre-Bias, Heuristik-Adjustment).
- **Worker-seitige Re-Klassifikation alter Mails** mit Korrekturen.
- **Schwellen-Konsumstelle im Desktop**: hardcoded (40/100/500000)
  in CouncilDetailPanel + DetailPanel — Konsolidierung mit regelwerk-
  Reader bleibt offen.
- **Distance-Denormalisierung** in council.objects bei Skalierung
  (>1000 Objects).
- **Reactivated-Lifecycle-Trigger** (alt-Befund): weiterhin offen.

## Folge-Schritte

1. FF-Merge auf Anweisung, Push.
2. Manueller UI-Test komplett (4 Korrekturen).
3. Bei neuer Mail-Welle: Override-Wirkung beobachten + Marker-
   Konsistenz-Test mit echten out_of_corridor-Mails.
