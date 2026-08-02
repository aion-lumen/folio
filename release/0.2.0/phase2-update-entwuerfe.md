# Phase 2 — Update-Entwürfe · Release v0.2.0

**Datum:** 2026-07-08 · **Durchgeführt von:** cowork-release-pilot
Regeln: Screenshots ohne PII/echte Daten · destruktive Ops nur mit expliziter Dateiliste · kein Scope-Zuwachs.

## 2.1 Versionsanhebung (semver: minor)

Begründung: additive Features (neuer Typ `lead`, Trust-Policy, Heute-Hub-Karte), keine Breaking Changes. → **minor**.

| Datei | von | auf | Status |
|---|---|---|---|
| `folio/package.json` | `0.1.0` | `0.2.0` | **offen** — im Branch noch 0.1.0, muss vor Tag angehoben werden |
| `aion-lumen/multi-agent/pyproject.toml` | `0.1.0` | `0.2.0` | **offen** — analog |
| `folio/CHANGELOG.md` | `[Unreleased]` | `[0.2.0] - 2026-07-08` | **offen** — Inhalt bereits im Branch unter [Unreleased], nur Überschrift + Datum setzen |

## 2.2 Bereits im Branch enthalten (verifiziert, kein neuer Entwurf nötig)

- `folio/README.md` — Trust-Policy + `lead`-Absatz ergänzt ✓
- `folio/FOLIO-IMPORT.md` — `lead`-Typ + optionale Felder additiv, v1 unangetastet ✓
- `folio/CHANGELOG.md` — Inhalt unter [Unreleased] ✓ (nur Versionierung offen, s.o.)
- `multi-agent/PILOT.md` — Kategorien-Config/Praxis-Preset ✓

## 2.3 Zahlen-Kaskade (Außenflächen) — PLATZHALTER, wartet auf 3-Modell-Voll-Eval

**Belastbare Fixture-Zahl steht fest: 14** (siehe `fixture-klaerung.md`). Die **Accuracy/Score** kommt aus Afschins lokaler 3-Modell-Voll-Eval. Bis dahin bleiben die Außenflächen auf dem alten Stand — **nichts live ändern**.

Platzhalter-Konvention: `{{EVAL_ACCURACY}}` (z.B. „88 %"), `{{EVAL_SCORE}}` (z.B. „0.87"), Fixtures fix = **14**, false auto-commits = **0** (unverändert, Trust-Gate).

### Fundstellen (3 Stück, alle identisch zu ersetzen)

**A) `carta/src/lib/data/cv.json` Z.235 (DE):**
- alt: „… internem Eval-Harness (**92 % Accuracy über 12 Fixtures**, 0 falsche Auto-Commits) …"
- neu: „… internem Eval-Harness (**{{EVAL_ACCURACY}} Accuracy über 14 Fixtures**, 0 falsche Auto-Commits) …"

**B) `carta/src/lib/data/cv.json` Z.236 (EN):**
- alt: „… internal eval harness (**92% accuracy across 12 fixtures**, 0 false auto-commits) …"
- neu: „… internal eval harness (**{{EVAL_ACCURACY}} accuracy across 14 fixtures**, 0 false auto-commits) …"

**C) `aion-lumen.com/multi-agent/index.html` Z.173 (Beleg-07-Caption, DE+EN):**
- alt: „v1-strict — **92 % accuracy**, 0 false auto-commits" / „v1-strict — **92 % Accuracy**, 0 false auto-commits"
- neu: „v1-strict — **{{EVAL_ACCURACY}} accuracy**, 0 false auto-commits" (analog DE)
- Hinweis: hier steht keine Fixture-Zahl → nur Accuracy ersetzen.

**Beleg-Link** (bleibt): `https://github.com/aion-lumen/folio/tree/main/evals/triage` — nach Merge zeigt der auf die 14 Fixtures inkl. Leads.

## 2.4 Screenshots (gegen `make demo`, PII-Check)

| Screenshot | Inhalt | PII-Check |
|---|---|---|
| `09-lead-inbox-dedup-20260708.png` | Import-Inbox, 3 Leads, Dedup-Gruppierung „2× GLEICHER LEAD" | **sauber** — `folio-demo.local`, Demo-Rollen, Demo-Quellen (gulp/freelancermap/freelance), Demo-IDs `lead-demoK*` |
| `10-lead-hub-fristnah-20260708.png` | Heute-Hub, „Fristnahe Leads"-Block zuoberst | **BEFUND** — Mail-Audit-Karte zeigt Account-Label **„mirhamed" (5)** neben „yahoo" (517). Realer Account-Bezeichner auf potenziell öffentlichem Screenshot. → Blocker-Kandidat, an Kimi/G1. |

Beide sind untracked (wie 05–08). Entscheidung „einchecken oder nicht" folgt Haus-Muster der Screenshots 05–08 — an G1 klären.

## 2.5 CV-PDF-Regenerierung

carta CV-PDF mit Datumsstempel neu erzeugen — **erst nachdem** die Zahl gesetzt ist (2.3), sonst enthält das PDF die alte 92 %/12-Zahl. Also: Teil der Zahlen-Kaskade, wartet auf Eval.

## Zusammenfassung offener Punkte für G1

1. package.json + pyproject.toml auf 0.2.0, CHANGELOG-Überschrift datieren (kann sofort).
2. Zahlen-Kaskade A/B/C — Platzhalter gesetzt, wartet auf Afschins Eval-Zahl.
3. Screenshot-10 PII-Befund („mirhamed"-Label) — an Kimi/G1.
4. CV-PDF neu — nach Zahl.
