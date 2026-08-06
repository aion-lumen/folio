---
folio_import: v1
type: directive
target: 02-durchbruch
id: release-v0-3-0-g2-deploy-freigabe-2026-07-09
source: cowork-release-pilot
created: 2026-07-09
title: Gesamtrelease v0.3.0 freigeben & pushen (G2)
tags: [release, v0.3.0, deploy, gate-g2]
---

# Gesamtrelease v0.3.0 freigeben & pushen

**Gate:** G2 (Go 2026-07-09) · **Deploy macht der Steward** (Knopfdruck), Cowork deployt nicht.
**Besonderheit:** 08b ist bereits auf main → KEIN Merge. Release = Version-Bump + CHANGELOG + Tag + Push + Außenflächen-Nachzug.

## Schrittfolge (jeder Schritt einzeln bestätigen)
1. folio: package.json 0.2.0→0.3.0, CHANGELOG [0.3.0] (Entwurf aus phase2), README v0.1.0→0.3.0, Tag v0.3.0, push
2. multi-agent-lab: pyproject 0.2.0→0.3.0, Tag v0.3.0, push
3. aion-lumen.ch: folio/index.html v0.1.0→0.3.0 (6 Stellen) → Live-Check
4. Inbox-Transfer: cp release/0.3.0/folio-inbox-staging/*.md ~/.folio/inbox/ (nur gültige, NICHT die gegenstandslose)
5. Verifikation ausgeloggt: Versions-Angaben konsistent, Impressum live (bereits ok), Zahlen 93%/14

## Definition of Done
- Beide Repos Tag v0.3.0, CI grün
- README + aion-lumen.ch/folio zeigen aktuellen Stand (kein v0.1.0 mehr)
- Doku-Objectives im Inbox (Council + Demo-IMAP)
- v1/v1-strict: offen bis 3-Modell-Lauf (nicht blockierend)

## Rollback
Bestehende GitHub-Actions-Kette (Health-Check + Rollback).
