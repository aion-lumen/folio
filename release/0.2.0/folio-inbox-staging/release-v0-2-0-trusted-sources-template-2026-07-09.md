---
folio_import: v1
type: directive
target: 02-durchbruch
id: release-v0-2-0-trusted-sources-template-2026-07-09
source: cowork-release-pilot
created: 2026-07-09
title: trusted_sources.example.yaml als Template (v0.2.0)
tags: [release, v0.2.0, security]
---

# trusted_sources.example.yaml als Template ins Repo

**Herkunft:** Kimi-Gesamtreview v0.2.0, Klasse Wichtig (F3) · trianguliert von cowork-release-pilot

## Was ist zu tun
`config/trusted_sources.yaml` liegt aktuell als echte Config im Branch. Für ein öffentliches Repo ein `.example`-Template beilegen (dokumentiert das Format), und prüfen, ob die reale Config maschinenspezifisch ist und gitignored gehört. Fail-closed-Verhalten (fehlende Config ⇒ keine Quelle vertraut) im Kommentar festhalten.

## Definition of Done
- `config/trusted_sources.example.yaml` im Repo mit Beispiel-Einträgen (`fable-session-claude-ai`, `cowork-release-pilot`) + Kommentar zur fail-closed-Semantik.
- README/FOLIO-IMPORT.md verweist aufs Template.

## Fläche
folio/config/ · FOLIO-IMPORT.md
