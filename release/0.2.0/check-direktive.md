# Check-Direktive Kimi — Gesamt-Review Release v0.2.0

**Erzeugt:** 2026-07-08 · **Quelle:** cowork-release-pilot · **Basis:** `direktive_kimi2_gesamt-review.md`
**An:** Kimi-K2-Session (Web-Zugriff) · **Ergebnis:** EIN Markdown-Report → ablegen als `folio/release/0.2.0/kimi-report.md`. **Nur Befunde, keine Umsetzung, keine Textvorschläge über Einzeiler hinaus.**

## Auftrag & Bewertungsbrille
Prüfe den Release-Stand (Source-Trust-Policy + Lead-Adapter) auf Release-Reife, **verengt auf die unten genannten Flächen** + Standard-Sicherheitsteil. Klassifiziere jeden Befund als **Blocker**, **Wichtig** oder **Kür**.

Kontext (Zielgruppen, gegen die bewertet wird): (1) Recruiter/Vermittler für SAP-BI- und Applied-AI-Mandate, primär mirhamed.ch. (2) Potenzielle Pilot-Kunden aus regulierten Einzelpraxen (local-first Mail-/Dokumenten-Triage), primär aion-lumen.ch. Leitfrage je Fund: **Hilft oder schadet er bei diesen Zielgruppen?**

## Betroffene Flächen (Fokus dieses Release)

**F1 — folio-Repo (github.com/aion-lumen/folio, nach Merge auf main)**
- README: Verstehen Fremde in 2 Min. Trust-Policy + `lead`-Typ? Rendern Bilder ausgeloggt?
- FOLIO-IMPORT.md: Ist die `lead`-Erweiterung **wirklich additiv** (v1-Regeln unangetastet)? Widerspricht nichts der öffentlichen Spec unter aion-lumen.ch/folio/import-spec.md?
- CHANGELOG: Version 0.2.0 korrekt, Einträge decken Trust-Policy + Lead ab?
- Konsistenz Repo ↔ Spec-Mirror (aion-lumen.ch/folio/import-spec.md).

**F2 — multi-agent-Repo (github.com/aion-lumen/multi-agent-lab bzw. -lab, nach Merge)**
- PILOT.md: Quickstart plausibel nachvollziehbar? Kategorien-Config/Praxis-Preset konsistent?
- Merge-Struktur: Kategorie-System (`95e9064`) + Lead-Adapter (`3d01231`) — inhaltlich sauber getrennt/dokumentiert?

**F3 — Interchange Format / Trust-Policy (Sicherheitskern dieses Release)**
- Bedrohungsmodell: Mail-abgeleitete Dokumente (`derived_from_external: true`) dürfen **niemals** Auto-Commit auslösen, auch bei vertrauter erzeugender Quelle. Ist diese Invariante im dokumentierten Verhalten lückenlos?
- Kann eine unvertraute `source` durch Konfidenz allein Auto-Commit erreichen? (Muss: nein.)
- Prompt-Injection-Fläche: Gelangt LLM-Freitext aus Mail-Inhalten ins Frontmatter (außer den deterministisch extrahierten Lead-Feldern)? (Muss: nein.)

**F4 — Zahlen-Konsistenz (Außenflächen, KRITISCH)**
- carta CV-Karte trägt „92 % / 12 Fixtures". Neuer belastbarer Stand: **14 Fixtures**, Accuracy aus 3-Modell-Voll-Eval (noch ausstehend). aion-lumen.ch/multi-agent Beleg-07 trägt „92 % accuracy".
- Prüfe: Gibt es **weitere** Fundstellen einer Accuracy-/Fixture-Zahl auf mirhamed.ch, aion-lumen.ch, in READMEs oder Repos, die beim Nachzug vergessen würden? Liste ALLE Fundstellen.
- Ist der Beleg-Link (evals/triage) nach Merge öffentlich und zeigt er die 14 Fixtures?

**F5 — Screenshots (Release-Evidenz)**
- `10-lead-hub-fristnah`: Mail-Audit-Karte zeigt Account-Label „mirhamed". Ist das ein PII-/Privacy-Problem für eine öffentliche Repo-Datei? (cowork-Vorbefund: Blocker-Kandidat.)
- Enthält irgendein Release-Screenshot (05–10) echte Namen, Mailadressen, Betreffzeilen oder Adressen?

## Standard-Sicherheitsteil (immer)
1. **Secrets/Keys** in Code, Configs, GitHub-Actions-Logs oder **Git-Historie** beider Repos (nicht nur HEAD). Fund = BLOCKER, präzise Fundstelle.
2. **PII / echte Daten** (Mails, Namen, Adressen) in Code, Fixtures, Screenshots, Beispieldaten, Historie. Besonders: die neuen Lead-Fixtures (freelancermap-Beispielmail) — wirklich anonymisiert?
3. **Interchange v1 unangetastet?** Falls doch ein Breaking Change vorliegt → müsste v2 daneben liegen statt v1-Edit. Prüfen.

## Ausgabeformat (verbindlich)
Pro Befund eine Zeile:
`[Blocker|Wichtig|Kür] Fläche(F1–F5/Sicherheit) — Beschreibung — Vorschlag(Einzeiler) — Beleg(Datei/Zeile/URL)`

Abschließend: Liste **aller** gefundenen Accuracy-/Fixture-Zahl-Fundstellen (für F4-Kaskade).

Report ablegen als `folio/release/0.2.0/kimi-report.md`.
