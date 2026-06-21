# Field-Note — Detail-Panel C Werkstatt (2026-05-27)

**Direktive:** `02-direktive-panel-c-bau.md` + CC-prompt-Spec aus Bundle
`folio-mail-panel-handoff-c/`
**Branch:** `feature/panel-c-werkstatt-2026-05-27` (folio only)
**Status:** Browser-verifiziert (User-Bestätigung), 0 type-errors

## Werkstatt-Hierarchie (kippt)

Die 5 vom Bundle (`§ I`) adressierten Probleme:

| # | Problem | Lösung in Panel-C |
|---|---|---|
| A1 | Inkohärente Lese-Hierarchie | Inversion: VerdictStage oben, Beweis-Karten unten |
| A2 | Nur 1 von 4 Lens-Stimmen sichtbar | `EvidenceVoices`-Card zeigt alle 4 (H + L1+L2+L3) mit Begründungen + missing-Anzeige |
| A3 | Disagreement-Flag-Header veraltet | Header-Pill weg; einzige Quelle = 4px Ember-Top-Border in `VerdictStage` (`stripeState === 'ne' | 'ne-strong'`) |
| A4 | User-Stimme ohne eigenen Ort | `VerdictStage` IST die Bühne — Pills/Buttons/Chips/Notiz exklusiv hier |
| A5 | System/Regeln/Ich nicht getrennt | „Bühne vs. Beweis": VerdictStage = was-ich-sage; 3 Karten = warum-so |

## Komponenten-Strukturwechsel

```
src/lib/mail-queue/
├── DetailPanel.svelte               [Orchestrator: 751 LOC → 320 LOC]
├── StimmenStreifen.svelte           [unverändert, Listen-Zeile]
└── panel/                           [NEU]
    ├── PanelHeader.svelte           [§1.1: Identität + Subject + Close]
    ├── VerdictStage.svelte          [§1.2: Bühne mit Ember/Pills/Actions/Chips/Notiz]
    ├── EvidenceCard.svelte          [§1.3 generic: collapsible, ?-bump]
    ├── EvidenceVoices.svelte        [§1.3 Karte 1: 4 voice-rows]
    ├── EvidenceRules.svelte         [§1.3 Karte 2: active_rules (von D.10)]
    ├── EvidenceMarkers.svelte       [§1.3 Karte 3: heuristik + user marker]
    └── PanelBody.svelte             [§1.4: Mail-Inhalt]
```

**Voice-Type-Erweiterung** (pre-work commit `8fd3e78`): present-Voice bekommt optional `reasoning` + `modelId`, missing-Voice bekommt optional `modelId`. `validator_reasoning` (existing DB-Spalte) wird durchgereicht. Heuristik-Voice nutzt `feedback.heuristic_reason`. Bestehender StimmenStreifen (Listen-Zeile) bleibt unbetroffen.

## Annahmen-Doku

Drei Spec-Ambiguitäten, vorab pragmatisch entschieden:

### 1. Stumm-Grund-Marker multiselect (CC §1.2) vs single ENUM (D.9)

**Lösung:** CSV in single TEXT column `correction_marker`. API akzeptiert
`markers: ('zu-weit'|'zu-klein')[]` als Array, joined zu CSV. Backwards-compat:
`marker: string` (single) bleibt akzeptiert.

Begründung: kein Schema-Change. Bestehende single-Werte sind 1-element-CSV
(z.B. `"zu-weit"` parsiert via `split(',')` zu `["zu-weit"]`). Append-only-
Pattern erhalten: latest correction führt, kein walk-back im Reader nötig.

**Trade-off:** Marker-Set wird beim Domain-Wechsel ggf. überschrieben (User
muss sie re-toggle wenn sie nach Domain-Korrektur weiter relevant sind).
Aktuell explizit so gewollt: VerdictStage setzt bei action-Wechsel zu
non-archive-silent das Marker-Array auf `[]`.

### 2. Action `archive` (sichtbar) — CC §1.2 zeigt nur 2 Buttons

**Lösung:** UI hat nur `Aktionable` + `Archiv (stumm)`. Schema-Wert `archive`
bleibt nutzbar (via time-decay-Pipeline für ältere Mails — manager.ts +
applyTimeDecay setzen das automatisch). User kann `archive` nicht direkt
setzen.

Begründung: CC-prompt §1.2 ist autoritativ. „Sichtbar bei Suche"-Use-Case
ist heute wenig genutzt, kommt automatisch via time-decay wenn relevant.

### 3. Domain-Pills: 8 statt CC-prompt §1.2 „9 + n+1"

**Lösung:** alle aktuellen 8 Pills (`immo·job·shopping·finance·kontakt·werbung·system·unsorted`).
„n+1" ist Future-Hook für eine künftige Domain-Erweiterung (z.B. eigene
Direktive bei Schema-Change).

### 4. User-Korrektur 2026-05-27: alle Karten default-zu

CC-prompt §1.3 sah „bei ne-strong Karte 1 auto-expanded" vor. User hat im
Browser-Review entschieden: **alle drei Karten default zu, auch bei ne-strong**.
Begründung: die ne-strong-Auto-Expand-Ausnahme war im Bundle als Mitigation
gegen „Karteikarte ist zurückhaltend" gedacht, aber Default-zu ist konsistenter
mit dem „Erst entscheiden, dann erklären"-Prinzip.

## Verhalten

CC-prompt §4 + User-Feinjustierung:

- **Save-Strategie:** Domain/Action/Marker-Toggle = optimistic immediate POST.
  Notiz = on-blur (manueller Save-Button entfällt — wenn die Notiz nicht-leer
  ist und nicht der aktuellen correction.note entspricht, blur-Event triggert
  applyCorrection mit aktueller Klassifikation + neuer Note).
- **Stripe-State:** `row.consensus_state` (server-side pre-computed via Lens-UI-
  Build, schon vorhanden — kein Compute im Panel).
- **Keyboard:**
  - `A` → Action toggle (actionable ↔ archive-silent)
  - `1`-`8` → Domain-Pill direkt setzen (DOMAIN_KEYS-Index)
  - `?` → alle 3 Karten gleichzeitig auf/zu (cardBumpKey ++)
  - `Escape` (vorher) → Close
  - Shortcuts skipped beim Tippen in input/textarea/select
- **allMissing-Edge-Case:** alle 4 voices.kind=missing → VerdictStage zeigt
  Eyebrow „NOCH NICHT KLASSIFIZIERT", keine Pills, nur Action-Buttons + Notiz.

## Beibehaltene Outer-Frame-Spezialitäten

- **mailDetailStore** (open/close, selectedUid, cachedSnap-Fallback bei filter-out)
- **deferred auto-mark-as-read** (pendingMark, flush bei Mail-Wechsel/onDestroy)
- **isFilteredOut-Banner** (UX-Affordance bei nach-Klassifikation-aus-Filter)

## Out of scope

- Mobile-Layout (Desktop-only per CC §9)
- Bulk-Korrektur (CC §9)
- Multi-Agent (kein Worker-/Validator-Change)
- Council-Vorgriffe (eigene Iteration per Direktive §Prohibitions)
- Pixel-genauer Compare gegen wireframe.png (User-Visual-Review-Verantwortung)
- Schema-Migration für n+1-Domain oder strikt-multiselect-marker (kommen mit
  ihren eigenen Direktiven, falls je relevant)
