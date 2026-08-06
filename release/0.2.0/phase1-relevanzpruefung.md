# Phase 1 — Relevanzprüfung · Release v0.2.0 (folio) / v0.2.0 (multi-agent)

**Datum:** 2026-07-08 · **Trigger:** Feature-Abschluss Aufgabe 1+2 (Source-Trust-Policy + Lead-Adapter), gemergt-bereit auf Branches
**Durchgeführt von:** cowork-release-pilot · **Quelle Übergabe:** `fable-2026-07-08-trust-policy-lead-adapter.md`, cc-Stand „Go 2 erledigt"

## Verifizierter Ausgangsstand

| Repo | Branch | HEAD | vor main | Working tree |
|---|---|---|---|---|
| multi-agent (`aion-lumen/multi-agent`) | `feat/lead-adapter` | `3d01231` | 2 Commits (`95e9064` Kategorie-System + `3d01231` Lead-Adapter) | clean |
| folio (`folio`) | `feat/lead-type` | `4f9cea4` | 3 Commits (trust-policy Merge + lead-type) | clean, Screenshots 09/10 untracked |

Beide Commits/Branches gegen Git verifiziert. Verifikationszahlen aus Übergabe (multi-agent: 90 pytest / ruff clean / 3 Leads demo; folio: 28 vitest / 0 check-errors / eval 86 % · 0.857 / Screenshots ✓) übernommen — **Voll-Eval über 3 Modelle steht noch aus** (siehe Blocker-Kandidat unten).

## Matrix-Einordnung

Zutreffende Zeilen (mehrere gleichzeitig):

| Matrix-Zeile | trifft zu? | Konsequenz |
|---|---|---|
| Neues Feature / Verhalten | **ja** | folio-README ✓ (bereits im Branch), CHANGELOG ✓ (bereits im Branch), aion-lumen.ch Folio-Hub, carta Eigenentwicklungen-Karte DE+EN, Screenshots |
| Agent/Triage berührt | **ja** | `eval:triage` NEU über alle 3 Modelle laufen lassen → Zahl auf Site/CV nachziehen (Beleg-Link!) |
| Interchange Format berührt | **ja, aber additiv** | Neuer Typ `lead` + optionale Felder (`derived_from_external`, `duplicate_of`, sentinel `current`). **v1-Regeln unangetastet → KEIN Breaking Change → KEIN v2.** Spec-Mirror auf aion-lumen.ch zieht per Deploy nach. |
| Install-/Betriebsrelevant | **teilweise** | PILOT.md im multi-agent-Branch aktualisiert (Kategorien-Config, Praxis-Preset). Kein Pilot-Kunde live → kein Migrationshinweis/Kundeninfo nötig. |
| Nur intern / Refactor | nein | — Kimi-Schleife läuft. |

**Entscheidung: Kimi-Schleife JA** (Feature + Agent/Triage + Interchange berührt).

## Betroffene Flächen (Ergebnis)

1. **folio-Repo** — README + CHANGELOG bereits im Branch enthalten; Version `0.1.0 → 0.2.0` (semver **minor**: additive Features, kein Breaking Change). `package.json` version anheben (offen, im Branch noch `0.1.0`).
2. **multi-agent-Repo** — PILOT.md aktualisiert (im Branch); Version `0.1.0 → 0.2.0` (minor). Merge-Split-Frage (95e9064 vs. 3d01231) → G2-Checkpoint mit der Steward.
3. **FOLIO-IMPORT.md / Spec** — additiv erweitert (im Branch). Mirror aion-lumen.ch/folio/import-spec.md zieht per Deploy.
4. **eval:triage** — Voll-Eval über 3 Modelle ausstehend (Phase 2). Aktuelle schlanke Zahl 86 % / 0.857 ist Einzelmodell (qwen3-30b-a3b-thinking-2507).
5. **carta (mirhamed.ch) CV-Karte DE+EN** — trägt aktuell **„92 % Accuracy über 12 Fixtures"** (`carta/src/lib/data/cv.json` Z. 235/236). Muss auf neuen Stand — **erst nach Voll-Eval**.
6. **aion-lumen.ch Folio-Hub / Multi-Agent-Streifen** — nur anfassen, falls sich Zahlen ändern (Fable-Vorgabe). Prüfen, ob dort eine Accuracy-/Fixture-Zahl steht.
7. **Screenshots** — `docs/screenshots/release/09-lead-inbox-dedup` + `10-lead-hub-fristnah` vorhanden (untracked, wie 05–08). Gegen `make demo` zu verifizieren, ohne PII.

## Vormerkung Blocker-Kandidat (für Kimi + G1)

- **Zahlen-Konsistenz:** carta sagt „92 % / 12 Fixtures", neuer Stand „86 % / 0.857", Manifest enthält aktuell 14 (nicht 16) Fixtures. Diese drei Zahlen müssen vor jedem Außenflächen-Update zusammengeführt werden. **Keine Zahl auf Site/CV ziehen, bevor die Voll-Eval über 3 Modelle die belastbare Zahl liefert.**

## Offene Entscheidungen (an G1/G2 delegiert)

1. Per-Repo Merge/Push-Go für beide Branches nach main (G2).
2. `95e9064`-Split in multi-agent (Kategorie-System vs. Lead-Commit zusammen/getrennt) — Merge-Checkpoint mit der Steward (G2).
3. carta/aion-lumen eval-Zahl-Nachzug — abhängig von Voll-Eval-Ergebnis.
