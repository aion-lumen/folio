---
folio_import: v1
type: directive
target: 02-durchbruch
id: al-folio-version-0-4-0-2026-08-02
source: cowork-release-pilot
created: 2026-08-02
title: aion-lumen.ch — Folio-Version auf v0.4.0 und Leuchtfeuer-Zeile ergänzen
tags: [release, 0.4.0, aion-lumen]
---

# aion-lumen.ch auf 0.4.0 nachziehen

Die Live-Seite nennt Folio an fünf Stellen `v0.3.0`, während Tag, CHANGELOG und `package.json`
übereinstimmend `v0.4.0` ausweisen. Leuchtfeuer, das Kopf-Feature des Meilensteins, kommt auf der
Site nirgends vor.

Wortlaut und Fundstellen: `folio/release/0.4.0/phase2-update-entwuerfe.md`, Abschnitt A.

## Definition of Done

- Alle fünf Fundstellen in `folio/index.html` auf `v0.4.0` (Zeilen 681, 682, 697, 711, 865, 938).
- Leuchtfeuer-Zeile als Punkt 07 in „Was heute funktioniert", DE und EN, im Wortlaut aus dem Entwurf.
- Live gegengeprüft: keine `v0.3.0`-Fundstelle mehr auffindbar, Leuchtfeuer-Zeile sichtbar.
