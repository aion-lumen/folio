# CC-Prompt — Gesamtrelease v0.2.0 durchführen (G2 erteilt)

Du hast Aufgabe 1 (Source-Trust-Policy) + Aufgabe 2 (Lead-Adapter) gebaut. Der Cowork-Release-Pilot ist durchlaufen: Phase 1–5 fertig, **G1 freigegeben, G2 (Go) erteilt**. Führe jetzt den Gesamtrelease v0.2.0 aus. Reihenfolge strikt einhalten, nach jedem Push den Health-Check abwarten. Bei rotem Health-Check stoppen und die bestehende Rollback-Kette greifen lassen.

**Kontext / bereits erledigt durch Cowork (nicht erneut tun):**
- Eval-Zahl 93 % / 0.929 / 14 Fixtures / FP 0 / FN 0 (3-Modell-Voll-Eval, v1-strict) ist gesetzt in: `carta/src/lib/data/cv.json` (DE+EN) und `aion-lumen.com/multi-agent/index.html` (Beleg-07). Beide liegen als uncommittete Änderung vor.
- Screenshots geprüft: `01-mail-queue` enthielt private Konten → Inhalt neutralisiert (Platzhalter) + README-Einbettung entfernt; `08-heute` und `10-lead-hub-fristnah` maskiert. Das `git rm` von 01 steht noch aus (Schritt 2).
- Kimi-Review trianguliert: keine offenen Blocker (alle vier Kimi-„Blocker" waren main-vs-Branch-Artefakte, da Kimi main statt der Branches sah). Details: `folio/release/0.2.0/kimi-triangulation.md`.

**Hinweis Git-Locks:** In mehreren Repos liegt eine verwaiste `.git/index.lock`. Falls Git meckert und kein git-Prozess läuft: `rm -f <repo>/.git/index.lock`.

---

## Schritt 1 — multi-agent-lab (Python)
Repo: `aion-lumen/multi-agent-lab`, Branch `feat/lead-adapter` (2 Commits vor main: `95e9064` Kategorie-System, `3d01231` Lead-Adapter).

**Merge-Checkpoint (Rückfrage an der Steward, VOR Push):** Bewerte, ob die zwei Commits zusammen als ein Release gemergt werden oder getrennt sinnvoller sind (Kategorie-System vs. Lead-Adapter). Schlag der Steward deine Empfehlung kurz vor und warte auf Bestätigung. Danach:

```
cd multi-agent-lab
# Version 0.1.0 -> 0.2.0 in pyproject.toml
git checkout main && git merge --no-ff feat/lead-adapter   # oder ff, je nach Checkpoint-Entscheid
# pyproject.toml version = "0.2.0"
git add pyproject.toml && git commit -m "chore(release): v0.2.0"
git tag v0.2.0
git push origin main --tags
```
Warte auf grünen GitHub-Actions-Health-Check.

## Schritt 2 — folio (TS)
Repo: `aion-lumen/folio`, Branch `feat/lead-type` (1 Commit vor main).

```
cd folio
rm -f .git/index.lock 2>/dev/null
git checkout main && git merge --ff-only feat/lead-type
# package.json version -> 0.2.0
# CHANGELOG.md: Überschrift "## [Unreleased]" -> "## [0.2.0] - 2026-07-09" (Inhalt bleibt)
git rm docs/screenshots/release/01-mail-queue-20260611.png
git add package.json CHANGELOG.md README.md \
        docs/screenshots/release/08-heute-20260611.png \
        docs/screenshots/release/10-lead-hub-fristnah-20260708.png
# untracked Release-Screenshots 05-10 nach Haus-Muster (wie 05-08) einchecken, falls gewünscht
git commit -m "chore(release): v0.2.0 — trust-policy + lead-adapter"
git tag v0.2.0
git push origin main --tags
```
Warte auf grünen Health-Check. **aion-lumen.ch/folio/import-spec.md zieht den lead-Typ per Deploy nach** → danach Live-Check: Spec-Mirror zeigt `lead` (additiv, v1 bleibt gültig).

## Schritt 3 — aion-lumen.ch
Repo: `aion-lumen/aion-lumen.com`, `main`, Änderung an `multi-agent/index.html` (Beleg-07 = 93 %) liegt vor.
```
cd aion-lumen.com
git add multi-agent/index.html && git commit -m "content: eval accuracy 93% (v0.2.0)"
git push origin main
```
Live-Check: Beleg-07 zeigt 93 %, Spec-Mirror zeigt lead-Typ, Bilder rendern ausgeloggt.

## Schritt 4 — mirhamed.ch / carta
Repo: `AfshinMirhamed/carta`, `main`, `src/lib/data/cv.json` (93 %/14) liegt vor. **CV-PDF regenerieren** (braucht dev-server + Chromium):
```
cd carta
git add src/lib/data/cv.json && git commit -m "cv: multi-agent eval 93% / 14 fixtures (v0.2.0)"
npm run generate-pdf      # oder build:full — erzeugt cv-de/en.pdf mit Datumsstempel
git add static/cv-*.pdf && git commit -m "cv: regenerate PDF with 2026-07-09 stamp"
git push origin main
```
Live-Check: CV-Karte + CV-PDF zeigen 93 % / 14 Fixtures.

## Schritt 5 — Verifikation (ausgeloggt)
Links, Bilder, Zahlen-Belege (93 % konsistent auf carta + aion-lumen), mobil (390 px), Hell/Dunkel. Beleg-Link `evals/triage/` zeigt nach Merge die 14 Fixtures.

---

## Definition of Done
- Beide Repos: Tag v0.2.0 gepusht, Health-Check grün.
- Spec-Mirror zeigt `lead` (additiv), Beleg-07 = 93 %.
- carta CV-Karte + PDF = 93 % / 14 Fixtures, PDF-Datumsstempel 2026-07-09.
- Screenshot 01 via `git rm` entfernt; ausgeloggte Verifikation ohne Befund.

## Explizit NICHT in diesem Release (Backlog / nächster Lauf)
- Eval-Ergebnis als eingechecktes Artefakt (`results-*.json`) — folio-Objective liegt in `release/0.2.0/folio-inbox-staging/`.
- `trusted_sources.example.yaml` Template — dito.
- folio-mail Vault-Switch-Bug — nächster Gesamtlauf.
- **Kein Scope-Zuwachs während des Laufs.**
