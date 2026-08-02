---
folio_import: v1
type: directive
target: 02-durchbruch
id: release-v0-4-0-g2-deploy-freigabe-2026-07-10
source: cowork-release-pilot
created: 2026-07-10
title: Gesamtrelease v0.4.0 Leuchtfeuer freigeben & pushen (G2)
tags: [release, v0.4.0, deploy, gate-g2]
---

# Gesamtrelease v0.4.0 (Leuchtfeuer) freigeben & pushen

**Gate:** G2 (Go 2026-07-10) · **Deploy macht Afschin/CC** (Knopfdruck), Cowork deployt nicht.

## Schrittfolge (jeder Schritt einzeln bestätigen)
1. folio: package.json 0.4.0, CHANGELOG [0.4.0], README-Absatz; privacy-drafts.md Quell-Fix; feat/leuchtfeuer → main; Tag v0.4.0; push
2. aion-lumen.ch: Datenschutz-Reconciliation (impressum) push → Live-Check
3. mirhamed.ch (carta): Datenschutz-Reconciliation push → Live-Check
4. noblecause.ai: Datenschutz-Reconciliation push → Live-Check
5. frag-shifu.ch: neuer Abschnitt Reichweitenmessung push → Live-Check
6. Inbox-cp: gültige Staging-Dateien → ~/.folio/inbox/
7. Verifikation ausgeloggt: 4 Datenschutz-Seiten nennen Reichweitenmessung/anonym/7 Tage; frag-shifu sagt "Keine Tracking-Cookies" (NICHT "keine Cookies"); Leuchtfeuer-Karte degradiert sauber

## Definition of Done
- folio Tag v0.4.0, CI grün, Karte live (degradiert bis Metrik-Pull)
- 4 Sites: Datenschutz konsistent mit Server-Log-Reichweitenmessung
- Markenversprechen 0-externe-Calls wörtlich wahr (kein Client-Tracking)

## NICHT Teil des folio-Push (Afschins separate Ops-Schritte)
- VPS-Apply (Caddy-Logging, Collectors, Cron), Mac-launchd-Pull
- metrics-Fluss-Design (SSH-Pull vs Endpoint) — beim aion-lumen-Architekten
