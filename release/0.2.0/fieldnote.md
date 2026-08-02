# Field Note — Release v0.2.0 (Source-Trust-Policy + Lead-Adapter)

**Datum:** 2026-07-09 · **Autor:** cowork-release-pilot · **Doppelzweck:** erster echter Durchlauf des Cowork-Release-Piloten — die Reibungspunkte sind hier Deliverable erster Klasse.

## Was raus ist
- **multi-agent-lab v0.2.0** — gemergt (ff, zusammen), getaggt, gepusht, CI grün (`976a5a7`). Kategorie-System + Lead-Adapter.
- **folio v0.2.0** — gemergt, getaggt, gepusht, CI grün (`1cfb9b3`). Source-Trust-Policy, `lead`-Typ (additiv, v1 unangetastet), Heute-Hub „Fristnahe Leads", TTL, Dedup. Screenshot 01 via `git rm` entfernt, 08 maskiert, 10 hinzugefügt.
- **aion-lumen.ch** — Beleg-07 live = 93 % (DE+EN); Spec-Mirror zeigt `lead`.
- **carta/mirhamed.ch** — CV-Web-Karte live = „93 % Accuracy über 14 Fixtures".
- Ausgeloggte Verifikation: Zahlen konsistent (93 % auf beiden Sites), Spec zeigt `lead`.

## Belege
- folio `1cfb9b3` (tag v0.2.0) · multi-agent-lab `976a5a7` (tag v0.2.0)
- Eval: 93 % / Score 0.929 / 14 Fixtures / FP 0 / FN 0, konsistent über alle 3 Modellfamilien auf v1-strict (bestes Combo gemma-4-26b-a4b-it-mlx).

## Reale Dauer
- **Feature-Bau** (CC/Engineer, Aufgabe 1+2): separate Session vorab.
- **Cowork-Release-Lauf:** Start Phase 1 ~08.07. 21:15 → Release live 09.07. vormittags. Netto-Arbeitszeit Cowork ~2 h (Phase 1–4), unterbrochen von zwei menschlichen Wartephasen (Voll-Eval + Kimi-Review über Nacht). G2-Deploy durch CC/Afschin ~kurz, alle CI grün beim ersten Versuch.

## Reibungspunkte (Deliverable erster Klasse)

1. **Kimi prüft main, nicht die Feature-Branches.** Alle vier Kimi-„Blocker" (CHANGELOG, `lead`-Typ, 12-vs-14 Fixtures, Screenshots) lösten sich in der Triangulation auf — sie waren main-vs-Branch-Artefakte. **Lehre:** Der Release ist extern erst nach dem Merge auf main prüfbar; die Check-Direktive sollte Kimi künftig explizit sagen, gegen welchen Branch/Tag geprüft wird (oder erst nach Merge laufen). Merge-Reihenfolge ist damit sicherheitsrelevant, nicht kosmetisch.

2. **Git in der Cowork-Session gesperrt.** `.git/index.lock` (0 Byte, verwaist) nicht entfernbar (Sandbox-Berechtigung auf `.git/`). Cowork konnte Datei-*inhalte* ändern, aber keine Git-Mutationen — konsistent mit der Leitplanke „Cowork committet/deployt nicht". Alle `git rm`/`git add`/Tags liefen bei CC/Afschin in G2. **Lehre:** Skill-Doku sollte den Staging-Ansatz (Dateien vorbereiten, Git beim Menschen) als Normalfall führen.

3. **folio-Inbox nicht im Session-HOME.** `~/.folio/inbox/` existiert nur auf Afschins Maschine. folio-Export A/B (Update-Empfehlungen + G2-Freigabe) wurden daher in `release/0.2.0/folio-inbox-staging/` erzeugt statt direkt in den Inbox — der vorgesehene Zwischenschritt. Kopieren in den echten Inbox macht Afschin.

4. **CV-PDF-Regeneration nicht durchführbar/abbildbar.** Zwei Ebenen: (a) Cowork-Sandbox hat kein Chromium + keinen dev-server (localhost:5173). (b) Tiefer: `scripts/generate-pdf.js` ist stale — schreibt eine einzelne `static/cv.pdf` (nur DE, ohne `?lang`), während die Live-Seite `cv-de.pdf`/`cv-en.pdf` verlinkt (seit `099134e` nie nachgezogen). Zudem lebt die Eval-Zahl in `projects[].description` → rendert nur die Web-Karte; `/print` hat keinen Projekte-Abschnitt und kein Datum. **DoD-Punkte „PDF = 93 %/14" + „Datumsstempel" sind mit dem aktuellen `/print` nicht abbildbar.** PDF-Regen bewusst verworfen; die committeten PDFs bleiben aktuell. → eigener kleiner Zyklus (siehe Backlog).

5. **Live-Deploy-Classifier-Schranke.** GitHub-Code-Repos (multi-agent, folio) pushte CC; die Live-Site-Pushes (aion-lumen.ch, carta) fuhr Afschin per `!` (Classifier-Schranke auf Live-Deploys). Sauberer Split, beide grün. **Lehre:** Deploy-Grenze „Cowork bereitet vor, Mensch drückt" hat in der Praxis exakt gegriffen.

6. **PII-Fund in Alt-Screenshots.** Reale Konten (gmail/yahoo/mirhamed.ch) in 01 + 08-heute (Juni-Altbestand), nicht in den neuen v0.2.0-Shots. Cowork fand & bereinigte es eigenständig (Kimi sah diese Shots nicht, da main-Prüfung). **Lehre:** Screenshot-PII-Check gehört fest in Phase 2, unabhängig vom Kimi-Report.

7. **Nebenbefund (nicht Scope):** privater SSH-Key im Klartext in `Projects/aionlumen_deploy`. Nur gemeldet, nicht angefasst.

## Ins Backlog gewandert (kein Blocker, kein Scope-Zuwachs im Lauf)
- Eval-Ergebnis als eingechecktes Artefakt (`results-*.json`) — folio-Objective in `folio-inbox-staging/`.
- `trusted_sources.example.yaml` Template — dito.
- `generate-pdf.js`-Fix (zweisprachig) + `/print`-Projekte-Abschnitt mit Eval-Zahl + Datum — eigener kleiner Zyklus.
- folio-mail Vault-Switch-Bug — nächster Gesamtlauf.
- `mixed-intent.md` Golden-Label-Prüffall (Eval-Randbefund).
- Kür aus Kimi: Audit-Log-Pfad prominenter, Trust-Policy in README-Kurzübersicht, Screenshot-05-Betreffs generischer.

## Pilot-Kunde
Kein Pilot-Kunde live → kein Kundeninfo-Versand nötig.

## Gesamturteil Workflow
Der Release-Pilot hat gehalten: zwei Gates sauber getroffen, Deploy-Grenze real wirksam, kein Deploy ohne G2, kein Scope-Zuwachs. Die wertvollste strukturelle Erkenntnis: **Kimi gegen den gemergten Stand (main/Tag) laufen lassen, nicht gegen die offenen Branches** — sonst produziert der Review Phantom-Blocker.
