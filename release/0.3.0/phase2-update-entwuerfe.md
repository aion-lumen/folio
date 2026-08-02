# Phase 2 — Update-Entwürfe · Release v0.3.0 (Lauf #2)

**Datum:** 2026-07-09 · **Durchgeführt von:** cowork-release-pilot
Regeln: Screenshots ohne PII (ALLE gegenprüfen, nicht nur den bekannten) · destruktive Ops nur mit Dateiliste · kein Scope-Zuwachs · Zahlen-Regel (keine neue Außenzahl bis 3-Modell-Lauf).

## 2.1 Versionsanhebung (semver: minor)

Begründung: Council-Trennung + Eval-Infrastruktur sind Feature-Umfang (Vault-Scoping allein wäre patch). → **minor 0.2.0 → 0.3.0**.

| Datei | von | auf | Status |
|---|---|---|---|
| `folio/package.json` | 0.2.0 | 0.3.0 | offen (G2) |
| `aion-lumen/multi-agent/pyproject.toml` | 0.2.0 | 0.3.0 | offen (G2) |
| `folio/CHANGELOG.md` | endet bei [0.2.0] | neuer `[0.3.0]`-Block | **Entwurf unten** |

## 2.2 CHANGELOG-Entwurf (folio, [0.3.0])

```markdown
## [0.3.0] - 2026-07-09

### Added
- Vault-scoped mail & DB stores: mail/feedback/council data is bound to the active
  vault. Demo vaults isolate to demo fixtures (konto-a/konto-b), never real IMAP
  (capability guard, not a warning).
- `make eval-full`: automated 3-model end-to-end eval over the 40-mail demo corpus
  against golden labels (`demo_labels.yaml`), writing `evals/full/<date>-report.md`
  + JSON with exit codes (Cowork-consumable). Internal ops metric, separate from the
  public triage number.
- `{{EVAL_ACCURACY}}` injector (`evals/triage/inject-eval-numbers.ts`): the number
  cascade is now scripted, not hand-edited; operator points `--file` at site/CV files.

### Changed
- Council is unregistered in demo vaults: `/council` → 404; detail pills shown only
  for `immo`; "→ Übernommen" is gated on Council registration (server 409 otherwise).
- Re-classification is gated on capability, not on account name.

### Fixed
- Demo vault no longer surfaces private accounts/labels (vault-scoping bug).
```

## 2.3 README / PILOT (Entwürfe)

- **folio/README.md** — kurzen Absatz „Vault-scoped mail (demo isolation)" + „Council is a private operator extension, unregistered in demo (`/council` → 404)" ergänzen. Trust-Policy-Erwähnung bleibt.
- **multi-agent/README.md + PILOT.md** — `make eval-full` als Betriebs-Target dokumentieren (was es tut, wo der Report landet, dass es die interne 40-Mail-Kennzahl ist — nicht die Website-Zahl).

## 2.4 Eval-Injektor — Mechanik, NICHT scharf in 0.3.0

- Injektor ist gebaut + getestet (Slim-Verify). Cowork zeigt `--file` künftig auf `carta/src/lib/data/cv.json` und `aion-lumen.com/multi-agent/index.html`.
- **In 0.3.0 NICHT ausführen:** `results-2026-07-09.json` = 1 Modell (Slim-Verify), beweist nur Mechanik. Außenflächen tragen bereits belastbare 93 %/14 (Lauf #1). **Keine Außenzahl-Änderung.**
- Sobald Afschins 3-Modell-Lauf eine neue `results-<date>.json` liefert: `npx tsx evals/triage/inject-eval-numbers.ts --file <site-datei> --write` → dann als eigener Mini-Nachzug oder Teil des nächsten Laufs.

## 2.5 Screenshots (Belege 08b) — ALLE vor G1 auf private Labels prüfen

Kandidaten für 0.3.0 (belegen die 08b-Änderungen sichtbar):
1. **Gescopte Mail-Audit** (Demo-Vault, konto-a/b) — belegt Vault-Scoping. Vorhanden aus Portfolio-Set (`folio_mail-audit-lens-spalten`), sauber.
2. **`/council` → 404** — belegt Council-Trennung. **Neu aufzunehmen** (Demo-Vault).
3. **Detail-Pillen nur `immo`** — belegt Aufgabe 4. **Neu** (oder aus vorhandenem Detail-Panel).
4. **„→ Übernommen" gated** (Council nicht registriert → 409) — optional, betrieblich.

**Aufnahme-Weg:** an Kimi/Afschin auslagern (Lehre aus Portfolio-Set), mit spezifischer Anweisung. **PII-Gegenprüfung durch cowork bleibt Pflicht** — jeder neue Shot vor G1 auf reale Konten/Mails/Adressen prüfen, nicht nur den bekannten.

## Zusammenfassung offener Punkte für G1

1. package.json + pyproject 0.3.0, CHANGELOG [0.3.0] (Entwurf steht) — G2.
2. README/PILOT-Ergänzungen (Vault-Scoping, eval-full) — Entwurf steht.
3. Injektor bleibt bereit, NICHT scharf (Zahlen-Regel).
4. Screenshots 08b: Council-404 + Pillen neu; alle PII-gegengeprüft.
