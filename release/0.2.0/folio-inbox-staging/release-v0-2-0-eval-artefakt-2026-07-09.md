---
folio_import: v1
type: directive
target: 02-durchbruch
id: release-v0-2-0-eval-artefakt-2026-07-09
source: cowork-release-pilot
created: 2026-07-09
title: Eval-Ergebnis als belegbares Artefakt einchecken (v0.2.0)
tags: [release, v0.2.0, eval]
---

# Eval-Ergebnis als belegbares Artefakt einchecken

**Herkunft:** Kimi-Gesamtreview v0.2.0, Klasse Wichtig (F4) · trianguliert von cowork-release-pilot

## Was ist zu tun
Die Außenzahl „93 % Accuracy über 14 Fixtures" (aion-lumen.ch/multi-agent Beleg-07, carta CV) ist reproduzierbar (Harness `evals/triage/run.ts` + 14 Fixtures öffentlich), aber es liegt kein eingechecktes Ergebnis-Artefakt bei. Ergebnisdatei der 3-Modell-Voll-Eval einchecken, damit die Zahl für ausgeloggte Besucher belegbar ist.

## Definition of Done
- `evals/triage/results-2026-07.json` (o.ä.) im Repo: Accuracy 0.929, 14 Fixtures, FP 0 / FN 0, Modell-Combo gemma-4-26b-a4b-it-mlx / v1-strict.
- Beleg-Link auf carta/aion-lumen zeigt (mittelbar) auf das Ergebnis.

## Fläche
folio/evals/triage/ · aion-lumen.ch/multi-agent · carta CV-Karte
