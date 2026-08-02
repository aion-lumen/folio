---
folio_import: v1
type: directive
target: 02-durchbruch
id: folio-leuchtfeuer-readme-0-4-0-2026-08-02
source: cowork-release-pilot
created: 2026-08-02
title: folio — Leuchtfeuer-README beschreibt Produktives als ausstehend
tags: [release, 0.4.0, folio, doku]
---

# Leuchtfeuer-README auf den Betriebsstand bringen

`ops/leuchtfeuer/README.md` führt in Zeile 43 und 70 den VPS-Teil als ausstehend und den SSH-Host
als Platzhalter, während Live-Impressum und Betrieb ihn seit Juli als laufend führen. Der Commit
`a94e861` hat die plist korrigiert und die Platzhalter-Sprache stehen lassen.

Nicht das Impressum ist falsch, sondern das README ist veraltet.

## Definition of Done

- Kopfzeile mit Betriebsstand: produktiv seit Juli 2026, Pull über den read-only-User
  `leuchtfeuer-pull` mit forced command.
- Platzhalter-Formulierungen in Zeile 43 und 70 aufgelöst oder klar als Einrichtungsanleitung
  gekennzeichnet.
- Kein Widerspruch mehr zwischen README und Impressum.
