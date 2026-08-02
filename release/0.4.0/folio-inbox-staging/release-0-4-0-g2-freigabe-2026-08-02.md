---
folio_import: v1
type: directive
target: 02-durchbruch
id: release-0-4-0-g2-freigabe-2026-08-02
source: cowork-release-pilot
created: 2026-08-02
title: Gesamtrelease 0.4.0 abschließen — Repos versionieren und übergeben (G2)
tags: [release, 0.4.0, deploy, gate-g2]
---

# Gesamtrelease 0.4.0 abschließen (G2)

Der Meilenstein 0.4.0 ist inhaltlich vollständig: Leuchtfeuer live und getaggt, ntfy gelandet,
Yahoo-Move verifiziert, NobleCause seit dem 2. August live, Ledger geparkt. Was fehlt, ist die
Versionierung des Erarbeiteten und die Übergabe der Aussenflächen.

**Dieser Lauf deployt keine Site.** Die Änderungen an aion-lumen.ch und mirhamed.ch gehen als
fertige Texte an die jeweiligen Sessions.

## Reihenfolge

1. **folio** — vier Commits, je ein Anliegen:
   Council-Opt-in (`env.ts` + Test), Wacht-plist, Leuchtfeuer-README-Betriebsstand,
   Release-Artefakte `0.2.0`–`0.4.0`. Danach CHANGELOG-Abschnitt `[Unreleased]`. **Kein neuer Tag.**
2. **multi-agent** — CHANGELOG-Abschnitt `0.4.0` über die vier Yahoo-Move-Commits, dann Tag
   `v0.4.0`, dann Push.
3. **Inbox-Transfer** — die sieben Dateien aus `release/0.4.0/folio-inbox-staging/` nach
   `~/.folio/inbox/`.
4. **Übergaben** — aion-lumen-Session und Karriere-Session, je mit fertigem Text.

## Definition of Done

- `folio`: Arbeitsbaum bis auf ungeprüfte Screenshots sauber, CHANGELOG trägt `[Unreleased]`.
- `multi-agent`: `v0.4.0` auf GitHub sichtbar.
- Sieben Direktiven im folio-Inbox.
- Beide Übergabedokumente abgelegt.
- Keine Screenshot-Commits ohne vorherige visuelle PII-Prüfung.
