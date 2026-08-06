---
folio_import: v1
type: directive
target: 02-durchbruch
id: release-v0-2-0-g2-deploy-freigabe-2026-07-09
source: cowork-release-pilot
created: 2026-07-09
title: Gesamtrelease v0.2.0 freigeben & pushen (G2)
tags: [release, v0.2.0, deploy, gate-g2]
---

# Gesamtrelease v0.2.0 freigeben & pushen

**Gate:** G2 (Go erteilt 2026-07-09) · **Deploy macht der Steward** (Knopfdruck), Cowork deployt nicht.

## Schrittfolge (Push = Deploy überall, jeder Schritt einzeln bestätigen)
1. multi-agent-lab: Merge-Split entscheiden, feat/lead-adapter → main, Tag v0.2.0, push
2. folio: feat/lead-type → main, package.json 0.2.0, CHANGELOG datieren, Tag v0.2.0, push
3. aion-lumen.ch (zieht Spec-Mirror + Beleg-07-Zahl mit) → Live-Check
4. mirhamed.ch/carta (CV-Karte 93%/14, CV-PDF regenerieren) → Live-Check
5. Verifikation ausgeloggt: Links, Bilder, Zahlen-Belege, mobil

## Definition of Done
- Beide Repos: Tag v0.2.0 gepusht, GitHub-Action grün (Health-Check)
- Spec-Mirror zeigt lead-Typ (v1 additiv), Beleg-07 zeigt 93%
- carta CV-Karte + CV-PDF zeigen 93%/14 Fixtures, PDF mit Datumsstempel
- Screenshot 01 via git rm entfernt; ausgeloggte Verifikation ohne Befund

## Rollback
Bestehende GitHub-Actions-Kette (Health-Check + Rollback). Bei rotem Health-Check autom. Rollback; sonst Tag zurückziehen.
