# Phase 1 — Relevanzprüfung · Release v0.3.0 (Lauf #2)

**Datum:** 2026-07-09 · **Trigger:** 08b vollständig gebaut, verifiziert, gemergt · **Durchgeführt von:** cowork-release-pilot
**Quelle:** Übergabe-Notiz „Release-Pilot-Lauf Nr. 2"

## Verifizierter Ausgangsstand (gegen echte Repos)

| Repo | main HEAD | Handoff-Soll | Tests | Working tree |
|---|---|---|---|---|
| multi-agent (`aion-lumen/multi-agent`) | `d10e5eb` | `d10e5eb` ✓ | pytest 90 grün | clean |
| folio (`folio`) | `2a9b5c5` | `2a9b5c5` ✓ | npm test 37 grün, check 0 err | untracked-Reste aus Lauf #1 (05–09-Screens, `release/`, `Fotos/`) — nicht Teil dieses Laufs |

Vault = `life` (`.env` VAULT_PATH). **Beide Repos bereits auf main gemergt** → anders als Lauf #1 gibt es KEINE Feature-Branches zu mergen; 0.3.0 tagged den gemergten Stand.

## Was 08b geändert hat (folio commits seit v0.2.0)

- `23bfca7` Mail/DB-Stores auf aktiven Vault scopen (Demo-Isolation)
- `31f8a16` Council in Demo-Vaults abmelden + immo-only Detail-Pillen (Aufgabe 4)
- `d1627ca` Re-Klassifikation an Capability koppeln, nicht an Account-Namen
- `2399e20` „→ Übernommen" an Council-Registrierung koppeln (kein toter Button im Demo)
- `f51ec1d` Merge vault-mail-scoping
- `2a9b5c5` **Eval: triage results-Artefakt + `{{EVAL_ACCURACY}}`-Injektor**

multi-agent: `make eval-full` (40-Mail-E2E, `evals/full/`), Golden Labels `demo_labels.yaml`.

## Matrix-Einordnung

| Zeile | trifft zu? | Konsequenz |
|---|---|---|
| Neues Feature / Verhalten | **ja** | Vault-Scoping (Demo-Isolation), Council-Trennung (`/council`→404), Eval-Infrastruktur. README/CHANGELOG. |
| Agent/Triage berührt | **ja** | `make eval-full` + Injektor. ABER: öffentliche Zahl bleibt Triage (14 Fixtures); Voll-3-Modell-Lauf steht aus → keine neue Außenzahl (s.u.). |
| Interchange Format berührt | **nein** | 08b fasst das Format nicht an. |
| Install-/Betriebsrelevant | **teilweise** | `make eval-full` als neues Betriebs-Target; PILOT.md ggf. Erwähnung. Kein Pilot-Kunde live. |
| Nur intern / Refactor | nein | Kimi-Schleife läuft. |

**Kimi-Schleife: JA** — aber (Lehre aus Lauf #1) **erst nach Merge auf `release/0.3.0`-Branch**, nicht gegen main.

## Betroffene Flächen (Ergebnis)

1. **folio-Repo** — README (Vault-Scoping/Council-Trennung/eval-full), CHANGELOG `[0.3.0]`, `package.json` 0.2.0→0.3.0.
2. **multi-agent-Repo** — README/PILOT (eval-full-Target), `pyproject.toml` 0.2.0→0.3.0.
3. **Screenshots** — Demo-Vault jetzt sauber gescoped (konto-a/b). Neue/aktualisierte Shots: Council-`/council`→404, Detail-Pillen nur `immo`, gescopte Mail-Audit. **Vor G1 ALLE auf private Labels gegenprüfen** (Lehre Lauf #1, nicht nur den bekannten).
4. **Eval-Injektor** — Mechanik gebaut; Cowork zeigt `--file` auf Site/CV. **In diesem Lauf NICHT scharf** (s.u.).
5. **Außenflächen carta/aion-lumen** — tragen bereits „93 % / 14 Fixtures" (Lauf #1, belastbar). **Keine Änderung** in 0.3.0.

## Zahlen-Regel (KRITISCH, aus Handoff)

- Öffentlich gezeigte Zahl = **Triage-Accuracy (14 Fixtures)**. Die 40-Mail-E2E-Zahl (`eval-full`) ist **interne Betriebskennzahl**, NICHT die Website-Zahl. Bedeutung nicht unbemerkt wechseln.
- `results-2026-07-09.json` enthält aktuell nur **1 Modell** (`qwen3-30b-a3b-thinking-2507`, acc 0.9286) = CCs **Slim-Verify**, beweist nur die Mechanik.
- Der belastbare **3-Modell-Voll-Lauf steht aus** (Afschin fährt ihn thermisch). **Bis dahin keine vorläufige Zahl auf die Außenfläche.**
- Praktisch: Außenflächen zeigen bereits 93 %/14 (Lauf #1). → In 0.3.0 **keine Außenzahl-Änderung**; Injektor bleibt bereit, wird erst mit dem 3-Modell-Ergebnis scharf.

## Bewusst NICHT Teil dieses Laufs (nicht einsammeln → 08c)

1. API-Guard `isCouncilRegistered()` über schreibende `/api/council/*`-Routen (heute nur via 404-Seiten erreichbar).
2. 4(c)-Pillen visuell belegen (`distance_threshold_km` im Demo null).
3. Council-Modul-Extraktion / Registrierungs-API.

Diese sind im 08b-Field-Note inventarisiert; kein Scope-Zuwachs während des Laufs.

## Prozess-Tiefe (Entscheid Afschin)

**Volle Runde inkl. Kimi-Gesamtreview** — bewusst gewählt als Test der Selbstverbesserung: Prüfen, ob wiederkehrende Befunde aus Lauf #1 / der Sites-Gesamtreview inzwischen behoben sind oder erneut gemeldet werden.

**Expliziter Prüfpunkt — frag-shifu-Impressum:**
- Ursprungsbefund: Kimi-Gesamtreview `report_kimi2_gesamt.pdf` → „B2. frag-shifu.ch: Kein Impressum, keine Datenschutzerklärung — trotz Login/Account-System" (Rechts-Blocker).
- Fix-Kette: `direktive-rechts-konsistenz-fixpaket-2026-07-08.md` → Impressum+Datenschutz für 3 Sites.
- Ist-Stand Repo: `frag-shifu/src/routes/impressum/+page.svelte` + `datenschutz/` existieren; Lauf-#1-Screenshot #7 zeigt Footer „Impressum · Datenschutz · AGB".
- **Erwartung:** Befund sollte behoben sein. Test: Meldet Kimi ihn erneut (→ nicht live/deployt?) oder ist er still weg (→ Fix-Kette hat gegriffen)? In die Kimi-Direktive als gezielten Re-Check aufnehmen.

**Prozess-Optimierung (Grundsatz, festgehalten):** Nicht jeder Release fasst alles an oder braucht die volle Kimi-Runde. Die **Matrix entscheidet die Prozess-Tiefe**, nicht Gewohnheit. Lauf #1 war teuer als Erstlauf; künftige Läufe sollen sich verschlanken (Kurz-Release / enger Check, wenn keine neue Außenfläche/kein neuer Claim/keine Interchange-Änderung). Für 0.3.0 hier bewusst volle Runde nur zwecks Verifikations-Test.

## Offene Entscheidungen (an G1/G2)

1. Version 0.3.0 bestätigen (minor).
2. Screenshot-Set für 0.3.0: welche neu (Council-404, gescopte Ansichten)?
3. Merge nicht nötig (schon auf main) → G2 = Version-Bump + CHANGELOG + Tag + Push (+ Inbox-cp-Schritt).
