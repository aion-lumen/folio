# Field-Note — Mail-Detail-Fix + Drei-Status-Pillen (2026-06-05)

**Repo:** `~/Projects/folio/`
**Branch:** `feature/mail-detail-fix-plus-pillen-2026-06-05` · 4 Commits.
**Direktive:** `~/Projects/direktive-filter-diagnose-und-verfeinerung-2026-06-04.md`
Teil 3 + Teil 4.

## Anlass

Aus Diagnose: EvidenceCard default-expanded-Bug (state persistiert
über Mail-Wechsel hinweg). Plus Anforderung: Drei-Status-Pillen
(Entfernung/qm²/Preis) prominent im Mail-Detail UND Council-Detail-
Panel — Schwellen-Farbe macht „passt / passt nicht" sofort sichtbar.

## Was gebaut

### B1 — `fix(mail-detail): evidence-cards re-mount pro mail-oeffnen`

`DetailPanel.svelte` Zeilen 268-308: `{#key row.uid}` um den
evidence-cards-Container. Svelte mounted die EvidenceCard-Components
bei jedem `row.uid`-Wechsel komplett neu → lokales `expanded`-State
zurück auf `defaultExpanded=false`.

Root-Cause: `let expanded = $state<boolean | null>(null);` +
`$effect: if (expanded === null) expanded = defaultExpanded;` läuft
nur einmal pro Component-Mount. Wenn DetailPanel die Components reused
(Mail-Wechsel ohne Re-Mount), greift der Init-Effect nicht.

### B2 — `feat(shared): StatusPillen-Component`

Neu: `src/lib/shared/StatusPillen.svelte`. Drei Pillen mit
Status-Farbe:
- ok (grün) = wert innerhalb Schwelle (kaufen-Token)
- over (rot) = wert überschreitet Schwelle (verwerfen-Token)
- unknown (grau) = wert null oder preis_on_request

Props: `entfernung: {km, threshold}`, `qm: {value, min}`,
`preis: {value, max, on_request?}`, `nurEntfernung?: boolean`.

### B3 — `feat(mail-detail): entfernungs-pille mit schwellen-farbe`

`DetailPanel.svelte`: `<StatusPillen nurEntfernung>` direkt vor
`<section class="evidence-section">`. Daten aus `row.active_rules`
(distance_actual_km + distance_threshold_km existieren seit
2026-05-28).

qm/preis im Mail-Detail nicht verfügbar (kommen erst nach Ingest
in council.objects) → `nurEntfernung` Mode.

### B4 — `feat(council-detail): drei status-pillen (mobile mit cross-db distance, desktop ohne)`

**Cross-DB-Distance (mobile only):**
- `feedback/reader.ts`: `getHeuristicMarkersForFeedbackId(id)` —
  liest JSON-Array aus feedback.db read-only.
- `council-db/reader.ts`: `getDistanceKmForCouncilObject(objectId, homeCoords)`
  — pro Object: erste `from_feedback_ids` → markers → plz_coords →
  haversine gegen homeCoords. Returnt null bei missing-data.
- `mobile/[id]/+page.server.ts`: Loader berechnet distance +
  schwellen aus regelwerk, attached an `data.distance_km`/`data.schwellen`.
- `mobile/[id]/+page.svelte`: `<StatusPillen entfernung qm preis>`
  in eigener `.pillen-wrap`-Section nach Hero.

**Desktop (CouncilDetailPanel.svelte):**
- StatusPillen mit qm + preis aus `o.qm`/`o.price_value` (title-
  parser). Schwellen hardcoded (40 km, qm_min 100, preis_max 500_000)
  weil List-Loader heute keine schwellen attached.
- **Distance = null (grau)** — Cross-DB-Batch-Load pro List-Render
  (26 Objects × 1 Query = 26 Queries pro pageload) ist eigene
  Folge-Direktive. Aktuell: User sieht qm + preis Status-Farbe,
  Entfernung grau "—".

## Verifikation

- `svelte-check`: 0 Errors über alle 4 Commits. Pre-existing
  CSS-Warnings unverändert (35 warnings, alle bekannt).
- Manueller UI-Test deferred.

## Architektur-Entscheidungen

- **Schwellen hardcoded im Desktop:** pragmatischer Cut. Heute
  reflektieren sie die Werte aus dem multi-agent regelwerk.yaml.
  Wenn Werte ändern, sind sie an zwei Stellen zu pflegen (Multi-
  Agent regelwerk + folio CouncilDetailPanel). Folge-Direktive:
  List-Loader holt schwellen aus regelwerk cross-repo.
- **Cross-DB-Distance nur Mobile:** 1 Object pro Mobile-Detail-
  Pageload, Mobile-User-Journey ist „klick Object → Detail" sequenziell.
  Desktop-Liste mit 26 Objects × Cross-DB-Query wäre erhöht. Lieber
  Batch-Reader in Folge-Direktive.
- **Schwellen-Reader via loadRegelwerk():** `mobile/[id]/+page.server.ts`
  ruft loadRegelwerk direkt — kein neuer Helper. Wenn Schwellen-
  Konsum häufiger wird: eigener helper `getHauskaufSchwellen()`.

## Out of Scope (eigene Folge-Direktiven)

- **Desktop List-Loader Distance-Batch:** alle objects in einer
  Cross-DB-Pass laden, batched-haversine, an Detail-Panel-Props
  weiterreichen.
- **Schwellen-Konsumation im Desktop**: List-Loader liest aus
  regelwerk cross-repo, schickt schwellen-dict an Detail-Panel.
- **Notification-Mails ohne PLZ**: 8 von 15 actionable-Mails
  (Diagnose-Befund) → Sender-Whitelist matched, aber keine
  Distanz-Bewertung möglich. Pille zeigt grau „—". Akzeptiert.

## Folge-Schritte

1. FF-Merge auf Anweisung, Push.
2. Manueller UI-Test:
   - Mail-Detail: EvidenceCard re-mount verifizieren bei
     Mail-Wechsel.
   - Mail-Detail: Entfernungs-Pille mit Farbe (grün bei Basel-Mail,
     rot bei Karlsruhe-Mail).
   - Council-Mobile-Detail: 3 Pillen (Lagos-Inserat: alle grün;
     Wehr-Inserat falls vorhanden: Entfernung rot).
   - Council-Desktop-Detail-Panel: 2 Pillen + 1 grau (Entfernung).
3. Folge-Direktive für Desktop-Distance-Batch falls priorisiert.
