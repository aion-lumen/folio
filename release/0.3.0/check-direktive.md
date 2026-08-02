# Check-Direktive Kimi — Gesamt-Review Release v0.3.0 (Lauf #2)

**Erzeugt:** 2026-07-09 · **Quelle:** cowork-release-pilot · **Basis:** `direktive_kimi2_gesamt-review.md`
**An:** Kimi-K2-Session (Web-Zugriff) · **Ergebnis:** EIN Markdown-Report → `folio/release/0.3.0/kimi-report.md`. Nur Befunde, keine Umsetzung, Textvorschläge nur als Einzeiler.

## WICHTIG — Prüfstand (Lehre aus Lauf #1)
**Prüfe den gemergten Release-Stand, NICHT offene Feature-Branches.** Konkret:
- Repos gegen **Branch/Tag `release/0.3.0`** (bzw. `v0.3.0` nach Merge) prüfen — nicht einen Zwischenstand.
- Falls ein erwartetes Feature „fehlt", zuerst prüfen, ob es auf dem Release-Stand liegt, bevor es als Blocker gemeldet wird.

## Auftrag & Bewertungsbrille
Volle Gesamtreview (Sites + Repos) für Release 0.3.0. Zielgruppen: (1) Recruiter/Vermittler (SAP-BI + Applied-AI), primär mirhamed.ch. (2) Pilot-Kunden regulierte Einzelpraxen, primär aion-lumen.ch. Leitfrage je Fund: hilft/schadet er bei diesen Zielgruppen? Klassifiziere: **Blocker / Wichtig / Kür**.

## Prüfobjekte
- Sites: https://mirhamed.ch · https://aion-lumen.ch · https://frag-shifu.ch · https://noblecause.ai
- Repos: github.com/aion-lumen/folio · github.com/aion-lumen/multi-agent-lab · github.com/noblecause-ai/NobleCause.ai
- Spec-Mirror: aion-lumen.ch/folio/import-spec.md

## Fokus dieses Release (0.3.0 — was neu ist)
1. **Vault-Scoping / Demo-Isolation (folio):** Zeigt der Demo-Vault ausschließlich Demo-Daten (konto-a/konto-b), niemals reale Konten/Mails? Wird im Demo-Modus ein echter IMAP-Account hart verhindert (Capability-Entzug)? → Sicherheitsrelevant.
2. **Council-Trennung:** `/council` → 404 im Demo? Council als „private Erweiterung des Betreibers" konsistent dargestellt (README, Site)? Keine toten Buttons?
3. **Eval-Ebenen-Konsistenz:** Öffentlich gezeigte Zahl = Triage-Accuracy (14 Fixtures). Die 40-Mail-E2E-Zahl (`eval-full`) ist interne Kennzahl. **Prüfe: Wird auf Sites/CV/READMEs die Bedeutung der Zahl irgendwo vermischt oder eine unbelegte Zahl gezeigt?** Beleg-Link `evals/triage/` erreichbar?
4. **CHANGELOG/Version 0.3.0** konsistent, deckt Vault-Scoping/Council/eval-full ab?

## GEZIELTER RE-CHECK (Verifikations-Test des Release-Workflows)
**frag-shifu.ch Impressum/Datenschutz:** Ein früherer Gesamtreview meldete „B2. frag-shifu.ch: Kein Impressum, keine Datenschutzerklärung — trotz Login/Account-System" (Rechts-Blocker). Es lief seither ein Fix (Impressum + Datenschutz für alle 3 Sites).
**Bitte explizit verifizieren (ausgeloggt):**
- Hat frag-shifu.ch jetzt ein erreichbares **Impressum** UND eine **Datenschutzerklärung** (Footer-Links, Seiten laden)?
- Gilt dasselbe für mirhamed.ch und aion-lumen.ch (Konsistenz)?
- Falls behoben: als „behoben (Regression-Check ok)" vermerken. Falls NICHT live: **Blocker** mit präziser Fundstelle (Repo-Route existiert evtl., aber nicht deployt?).

## Standard-Sicherheitsteil (immer)
1. Secrets/Keys in Code, Configs, Actions-Logs, **Git-Historie** beider Repos (nicht nur HEAD). Fund = Blocker.
2. PII/echte Daten in Code, Fixtures, **Screenshots**, Beispieldaten, Historie. Besonders: bestätigen, dass die vault-gescopten Demo-Screenshots keine realen Konten/Mails/Adressen mehr zeigen.
3. Interchange v1 unangetastet (0.3.0 fasst das Format nicht an — bestätigen)?

## Ausgabeformat (verbindlich)
Pro Befund: `[Blocker|Wichtig|Kür] Fläche — Beschreibung — Vorschlag(Einzeiler) — Beleg(Datei/Zeile/URL)`
Am Ende: expliziter Abschnitt **„Regression-Checks"** mit Ergebnis zu frag-shifu-Impressum/Datenschutz (behoben? / erneut offen?).

Report ablegen als `folio/release/0.3.0/kimi-report.md`.
