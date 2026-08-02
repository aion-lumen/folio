# Check-Direktive ChatGPT — Konsistenz-Review Release v0.3.0 (Lauf #2, Reviewer-Test)

**Reviewer:** ChatGPT (Pro, Web-Browsing aktiviert) · **Von:** cowork-release-pilot
**Ergebnis:** EIN Markdown-Report → `folio/release/0.3.0/chatgpt-report.md`. Nur Befunde, keine Umsetzung.

## Auftrag — WICHTIG: nur Konsistenz & Fakten, KEINE Bewertung
Dies ist ein **reiner Konsistenz- und Faktencheck**, kein Design- oder Marketing-Review.

**NICHT tun (explizit ausgeschlossen):**
- Keine ästhetischen Urteile (Hintergrundbild, Typografie-Wirkung, „wirkt professionell", Farbstimmung, Layout-Geschmack).
- Keine Zielgruppen-Simulation („was denkt ein Recruiter nach 90 Sekunden").
- Keine Verbesserungsvorschläge zu Ton/Stil/Story.
- Keine Empfehlungen, die nicht aus einem konkreten Widerspruch oder Fehler folgen.

**NUR tun:** überprüfbare Fakten. Stimmt X mit Y überein? Ist X erreichbar (HTTP)? Existiert eine Pflichtangabe? Widersprechen sich Zahlen/Versionen/Claims zwischen Site und Repo?

## Regel gegen Halluzination (kritisch — Vorgänger-Reviewer scheiterte hier)
Für **jede** URL, die du prüfst, protokolliere: die **exakt aufgerufene URL** und den **HTTP-Status** (200 / 404 / Timeout / Redirect-Ziel).
- Wenn du eine Seite **nicht laden kannst**, schreibe **„konnte nicht prüfen (Grund: …)"** — NIEMALS „fehlt" oder „existiert nicht" aus einem fehlgeschlagenen Zugriff ableiten.
- „Fehlt" nur behaupten, wenn die Seite nachweislich lud (HTTP 200) und die Angabe dort nicht vorhanden war.

## Prüfobjekte
- Sites: https://mirhamed.ch · https://aion-lumen.ch · https://frag-shifu.ch · https://noblecause.ai
- Repos: github.com/aion-lumen/folio · github.com/aion-lumen/multi-agent-lab · github.com/noblecause-ai/NobleCause.ai
- Spec-Mirror: https://aion-lumen.ch/folio/import-spec.md

## Konsistenz-Prüfkatalog (nur Fakten)

**A — Erreichbarkeit & Pflichtangaben (pro Site, mit HTTP-Status protokollieren)**
1. Startseite lädt? (200)
2. `/impressum` — Status? Wenn 200: enthält Name + Adresse + Kontakt? (nur Vorhandensein, keine Bewertung)
3. `/datenschutz` (bzw. Footer-Link) — Status? Vorhanden?
4. Footer-Links: zeigen sie auf erreichbare Ziele (kein 404)?

**B — Zahlen-/Claim-Konsistenz (Site ↔ Repo)**
1. Jede messbare Aussage auf einer Site (Accuracy, Fixtures, Versionen, „proven", Nutzerzahlen) auflisten und gegen die Belegquelle prüfen. Konkret: „93 % Accuracy über 14 Fixtures" auf mirhamed.ch/aion-lumen.ch — deckt sich das mit `github.com/aion-lumen/folio/tree/main/evals/triage`?
2. Widersprechen sich Versions-/Feature-/Lizenz-Angaben zwischen Sites und Repos?
3. Interchange-Spec: Repo `FOLIO-IMPORT.md` vs. Mirror `aion-lumen.ch/folio/import-spec.md` — identischer Stand? v1 als frozen gekennzeichnet?

**C — Repo-Konsistenz (0.3.0-Fokus)**
1. CHANGELOG/Tag/Version: Ist ein Release-Stand konsistent (Tag ↔ CHANGELOG ↔ package.json/pyproject)? *(Hinweis: release/0.3.0 wird erst kurz vor dem Review gemergt — falls noch nicht vorhanden, als „noch nicht geschnürt" vermerken, NICHT als Fehler.)*
2. Verweisen READMEs auf existierende Pfade/Dateien (keine toten Links im README)?

**D — Sicherheit (Fakten, kein Ermessen)**
1. Secrets/Keys in Code, Configs, sichtbaren Actions-Logs, Git-Historie? Fund = präzise Fundstelle.
2. Echte PII (Namen außer dem Betreiber, fremde Mails/Adressen) in Code, Fixtures, Screenshots, Historie?
3. Interchange v1 unangetastet?

## Gezielter Re-Check (Regression)
frag-shifu.ch, aion-lumen.ch, mirhamed.ch: Impressum + Datenschutz erreichbar (200)? **Mit protokolliertem Status.** (Kontext: ein früherer Reviewer meldete diese fälschlich als fehlend, obwohl sie live sind — daher hier der Status-Nachweis.)

## Ausgabeformat (verbindlich)
Pro Befund: `[Blocker|Wichtig|Kür] Fläche — Fakt/Widerspruch — Beleg(URL + HTTP-Status / Datei:Zeile)`
Plus eine **Tabelle „URL-Zugriffsprotokoll"**: URL | Status | Ergebnis. Seiten, die du nicht laden konntest, dort als „konnte nicht prüfen" führen — nicht als Befund.

Report ablegen als `folio/release/0.3.0/chatgpt-report.md`.
