# CC-Prompt — Gesamtrelease v0.3.0 durchführen (G2 erteilt)

08b ist gebaut, gemergt, verifiziert. Cowork-Release-Pilot Lauf #2 ist durch: Phase 1–5 fertig, **G1 freigegeben, G2 (Go) erteilt**. Führe den Gesamtrelease v0.3.0 aus. **Kein Merge nötig** — 08b ist bereits auf main; dies ist Version-Bump + CHANGELOG + Tag + Push + Außenflächen-Nachzug.

**Bereits erledigt durch Cowork (nicht erneut tun):**
- Review trianguliert (Reviewer war ChatGPT statt Kimi). Keine Blocker. Zwei echte Konsistenz-Befunde (siehe unten).
- Kimi-Fehlalarme (Impressum angeblich fehlend) widerlegt — Impressum aller Sites ist live.
- Zahlen-Regel: keine Außenzahl-Änderung; öffentliche Zahl bleibt Triage 93 %/14.

**Git-Locks:** Bei `.git/index.lock`-Meckern und keinem laufenden git-Prozess: `rm -f <repo>/.git/index.lock`.

---

## Schritt 1 — folio (TS)
```
cd folio
rm -f .git/index.lock 2>/dev/null
# package.json version -> 0.3.0
# CHANGELOG.md: neuen [0.3.0]-Block einfügen (Entwurf: release/0.3.0/phase2-update-entwuerfe.md, Abschnitt 2.2)
# README.md Zeile 23: "Status: v0.1.0 public preview" -> "Status: v0.3.0" (bzw. aktueller Wortlaut ohne v0.1.0)
git add package.json CHANGELOG.md README.md
git commit -m "chore(release): v0.3.0 — vault-scoping + council separation + eval infra"
git tag v0.3.0
git push origin main --tags
```
CI-Health-Check abwarten.

## Schritt 2 — multi-agent-lab (Python)
```
cd multi-agent-lab
# pyproject.toml version = "0.3.0"
git add pyproject.toml && git commit -m "chore(release): v0.3.0"
git tag v0.3.0
git push origin main --tags
```
CI-Health-Check abwarten.

## Schritt 3 — aion-lumen.ch Versions-Nachzug (Außenfläche)
Repo `aion-lumen/aion-lumen.com`, `main`. In `folio/index.html` stehen **6 Fundstellen** „v0.1.0" bzw. „Public preview" (Zeilen ~681, 682, 697, 711, 865, 938) — auf aktuellen Stand ziehen (v0.3.0; „Public preview" nur ändern, falls gewünscht — mit Afschin kurz abstimmen, ob Reifegrad-Label bleibt).
```
cd aion-lumen.com
# folio/index.html: v0.1.0 -> v0.3.0 (6 Stellen)
git add folio/index.html && git commit -m "content(folio): bump shown version to v0.3.0"
git push origin main
```
Live-Check: aion-lumen.ch/folio zeigt v0.3.0, kein v0.1.0 mehr.

## Schritt 4 — Inbox-Transfer (cp-Schritt, Lehre aus Lauf #1)
```
# NUR gültige Objectives kopieren, NICHT die gegenstandslose Datei:
cp folio/release/0.3.0/folio-inbox-staging/release-v0-3-0-council-imap-doku-2026-07-09.md ~/.folio/inbox/
cp folio/release/0.3.0/folio-inbox-staging/release-v0-3-0-g2-deploy-freigabe-2026-07-09.md ~/.folio/inbox/
# release-v0-3-0-impressum-deploy-*.md ist GEGENSTANDSLOS (Kimi-Fehlalarm) — NICHT kopieren.
```

## Schritt 5 — Verifikation (ausgeloggt)
- Beide Repos: Tag v0.3.0, CI grün.
- README + aion-lumen.ch/folio: kein v0.1.0 mehr.
- Zahlen 93 %/14 unverändert konsistent.
- Impressum-Seiten weiterhin live (Stichprobe).

---

## Explizit NICHT / Backlog
- **v1-strict vs. v1** (ChatGPT-Befund W2): Site sagt „v1-strict", results-Datei sagt „v1". Klären, wenn der **3-Modell-Voll-Eval** läuft — dann entweder Site auf „v1" korrigieren oder results mit v1-strict-Ergebnis aktualisieren. Nicht in diesem Release (Zahlen-Regel).
- **08c** (API-Guard, 4c-Pillen, Council-Extraktion) — nicht einsammeln.
- **Kein Scope-Zuwachs.**
