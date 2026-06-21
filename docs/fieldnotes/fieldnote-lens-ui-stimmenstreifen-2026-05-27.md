# Field-Note — Lens-UI Stimmen-Streifen (2026-05-27)

## Was gebaut wurde

Direktive `~/Projects/direktive-lens-ui-2026-05-26.md` + Handoff 3 Bundle
(`Folio mail-handoff 3.zip` → `folio-mail/project/Folio Mail-Queue - Stimmen-Streifen (final).html`).
Mail-Listen-Zeile bekommt den **Stimmen-Streifen** — 4 Kacheln (H · L1 · L2 · L3)
mit Domain-Farbe + ember-Bühne bei Uneinigkeit. Konfidenz + Tier Spalten entfernt.

**Salienz-Prinzip:** Uneinigkeit hervorgehoben (ember `.stripe.ne` / `.ne-strong`),
Konsens ruhig (`.stripe.still`). Missing-Lens neutral-grau-dashed mit Mittelpunkt-
Glyph — eigene Sprache, NICHT in der Ember-Familie.

## Module-Änderungen

| Datei | Status | Inhalt |
|---|---|---|
| `src/lib/server/lenses/voices.ts` | NEU | `Voice`/`LensDomain`/`ConsensusState` Types exakt aus Bundle §V; `stripeState()` Berechnungsfunktion 1:1 aus Bundle; `buildVotesForFeedback()` baut 4-Voice-Array (H + L1/2/3 in regelwerk-Reihenfolge) aus feedback-row + validator_opinions[] |
| `src/lib/server/folio-db/reader.ts` | erweitert | Neuer `getValidatorOpinionsMap()` Multi-Model-Helper (Map<feedbackId, ValidatorOpinionRow[]>); alte singular-Version bleibt für Legacy-Detail-Panel |
| `src/lib/stores/mailQueue.svelte.ts` | erweitert | `UnifiedMailRow.voices?` + `.consensus_state?` als optionale Felder; alte `validator_opinion?` bleibt für Detail-Panel-Backward-Compat |
| `src/routes/(mail)/mail-queue/+page.server.ts` | erweitert | Lädt regelwerk, holt multi-opinion-map, computes `buildVotes` + `stripeState` pro Mail, propagiert `voices` + `consensus_state` an Page-Data |
| `src/lib/mail-queue/StimmenStreifen.svelte` | NEU | Dumb component: empfängt `voices` + `state`, rendert Streifen+Kacheln. CSS pixel-genau aus (final).html § STIMMEN-STREIFEN (Z. 134-198) inkl. `.qcell.missing` grau-dashed mit Mittelpunkt-Glyph (Z. 178-189). Hover-Tooltip Pflicht-Setting. |
| `src/lib/mail-queue/MailList.svelte` | umgestellt | Konfidenz-Spalte + Tier-Spalte ENTFERNT (`confTier`/`TIER_CLASS`/`fmtConf`/Validator-`⚖`-Marker dead-code raus); Stimmen-Streifen-Spalte (110px) + Marker-Spalte (32px für `↻`) rein; Header-Sub-Labels H/L1/L2/L3. **Row-Tint bei `voDisagreement` entfernt** — Ember sitzt jetzt am Streifen, kein Doppel-Alarm |
| `docs/fieldnotes/fieldnote-lens-ui-stimmenstreifen-2026-05-27.md` | NEU | dieses Doc |

## Datenfluss

```
feedback.db (yahoo rows)        folio.db (validator_opinions)        regelwerk.yaml
        │                                  │                                │
        └──────────┬───────────────────────┴──────────────┬─────────────────┘
                   │                                       │
                   ▼                                       ▼
        getFeedbackRows()              getValidatorOpinionsMap()      loadRegelwerk()
                   │                                       │                  │
                   └────────────── +page.server.ts ────────┴──────────────────┘
                                          │
                                          ▼
                         buildVotesForFeedback(feedback, opinions, regelwerk.voices)
                                          │
                                          ▼
                                   voices: Voice[4]
                                          │
                                          ▼
                                stripeState(voices)
                                          │
                                          ▼
                              consensus_state: 'still'|'ne'|'ne-strong'
                                          │
                                          ▼
                          Page-Data → MailList.svelte → <StimmenStreifen />
```

Server-side pre-computed (per Direktive §2.2): Komponente ist "dumb", erhält
fertige Daten. Konsens-Logic single-source-of-truth in `voices.ts`.

## Bundle-Adherence-Check (§ VI „NICHT v2", Browser-Verify-bestätigt)

| Anforderung | Status |
|---|---|
| Keine 5. Kachel für User-Stimme (Final/User bleibt Detail-Panel) | ✓ |
| Ember = Disagreement (NICHT Reife / Inversion) | ✓ |
| Nur 3 Bühnen-Stufen (still/ne/ne-strong), keine vierstufige Wärme-Achse | ✓ |
| Keine Corona/Lumen-Bright-Hintergründe | ✓ |
| Missing-Kachel grau-dashed (NICHT lumen-ember-dashed wie v3/v4) | ✓ |
| Missing-Lens zählt NICHT zur Stimmenzahl (3-von-3 einig = still) | ✓ (stripeState filtert kind='present') |
| Slot-Position bleibt (L2 fehlt → 3. Kachel dashed, Streifen verkürzt sich nicht) | ✓ |

## Browser-Verify-Beleg

Smoke-Skript: `~/.folio-tools/smoke-lens-ui.mjs`. Screenshots:
- `~/.folio-tools/screenshots/lens-ui-overview.png` (mail-queue overall)
- `~/.folio-tools/screenshots/lens-ui-example-row.png` (Beispiel-Zeile, 4 Kacheln einig)
- `~/.folio-tools/screenshots/lens-ui-missing-cell-row.png` (Beispiel-Zeile mit missing-Kacheln)

Structural-Asserts grün: Konfidenz/Tier-Header weg, H/L1/L2/L3-Sub-Labels da,
`.stripe.still`/`.stripe.ne-strong` rendern, `.qcell.missing` mit dashed-CSS aktiv,
Hover-Tooltips funktional („H · sagt immo" / „L1 · error").

**Hinweis zur aktuellen Datenlage:** die Mehrheit der Mails hat nur 1 voter
(Heuristik) — Validator-Pipeline ist nur 1× durchgelaufen. Daher dominiert
`ne-strong` (≤1 voter per Spec §I) im aktuellen Sample. Sobald breiter
Validator-Run läuft, werden mehr Mails 4 voices haben → mehr `still` und (bei
echten Disagreements) `ne`/`ne-strong` mit gefüllten Kacheln.

## Wichtige Trennung: Bundle-`stripeState` ≠ Python-`voice_consensus`

- `stripeState` (Bundle, UI-only): Domain-Verteilung der vorhandenen Lenses →
  visuelle Bühne (still/ne/ne-strong)
- `voice_consensus.py` (Python, Routing-Logik): `is_consensus` strikter
  Domain+Action-Match für Auto-Routing + `apply_protection_clause` Schutzklausel

→ Diese sind LEGITIM unterschiedlich. `stripeState` ist KEINE Duplikation der
Python-Routing-Logik. UI zeigt nur Stimmen-Bild, Routing-Entscheidung läuft
sowieso über das andere Modul.

## Naming-Disziplin

- **Neu lens-namespaced:** `LensDomain`, `LensReason`, `ConsensusState`,
  `StimmenStreifen.svelte`, `src/lib/server/lenses/voices.ts`-Modul
- **Bundle-Name beibehalten:** `Voice` (Type aus Bundle-Datenkontrakt § V) —
  Bundle-spec respektiert; falls Rename-Direktive `validator → lens` später
  greift, hier dazu-mitziehen
- **Bestand unverändert:** `validator_opinions`-Tabelle, `validator_*`-Spalten,
  `/api/validator/run`, `getValidatorOpinionMap` (singular) bleibt für Detail-
  Panel, `voice_consensus`/`voices[]` in regelwerk.yaml

## Bewusst NICHT migriert (per Direktive §4 Prohibitions)

1. **Detail-Panel-Multi-Lens** — DetailPanel.svelte:525-572 unverändert,
   Detail-Panel zeigt weiter nur die singular `row.validator_opinion`.
   Separate Iteration nach Council-UI-Klärung.
2. **Council-Liste** — Komponente parametrisierbar gehalten (Voice[] statt fix
   Voice[4]), Council selbst nicht gebaut.
3. **Konsens-Routing-Logik** in TS — `stripeState` ist UI-only, Routing
   weiterhin Python `voice_consensus.decide_routing` (nicht eingebunden,
   Auto-Pfad gated).
4. **Auto-Routing / Auto-Silent** — bleibt gated.
5. **`getValidatorOpinionMap` (singular) umbenennen** — bleibt, weil DetailPanel
   es nutzt.

## Stale-Reminder für künftige Iterationen

1. **Folio kein Test-Framework** — `stripeState`-Unit-Tests waren in der
   Direktive §5 vorgesehen, sind aber skipped weil Folio kein vitest hat.
   Browser-Verify deckt 4 von 6 Edge-Cases ab. Vitest-Setup wäre eigene
   Iteration.
2. **Detail-Panel-Multi-Lens** + UI-Komponente-Wiederverwendung in Council-Liste
   (Mensch-Outline-Kacheln nach Divider, per Bundle § IV-Andocken-Skizze) —
   bei Council-UI-Iteration darauf zurückgreifen.
3. **F.8-Job-Substring-Bug** wurde während der Browser-Verify-Vorbereitung
   diagnostiziert (id=375 `order-update@amazon.de` → falsch `domain=job`).
   Separate Direktive `direktive-heuristik-job-substring-fix-2026-05-26.md`
   adressiert das — Reihenfolge: erst Lens-UI gemerged, dann Heuristik-Fix.

## Quellen / Pfade

- Direktive: `~/Projects/direktive-lens-ui-2026-05-26.md`
- Bundle (autoritativ): `~/Projects/aion-lumen/multi-agent/Folio mail-handoff 3.zip` →
  `folio-mail/project/Folio Mail-Queue - Stimmen-Streifen (final).html`
- Bundle-extracted: `~/Projects/aion-lumen/multi-agent/folio-mail/project/` (vorige Handoff-Versionen, Read-only)
- Smoke + Screenshots: `~/.folio-tools/smoke-lens-ui.mjs` + `~/.folio-tools/screenshots/lens-ui-*.png`
- Branch: `feature/lens-ui-stimmenstreifen-2026-05-26`
