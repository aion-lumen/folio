# CC-Deploy-Prompt — Gesamtrelease 0.4.0 abschließen

**G2 erteilt:** Leitstand, 2026-08-02 · **Maßgeblich:** `folio/release/0.4.0/release-empfehlung.md`
(Abschnitt 5 = korrigierte Texte, Abschnitt 3 = W-4) und `phase2-update-entwuerfe.md` (Abschnitt C).

**Dieser Lauf deployt keine Site.** aion-lumen.ch und mirhamed.ch bleiben unverändert; ihre Texte
gehen an die Übergabesessions.

---

## Schritt 1 — folio, vier Commits, je ein Anliegen. Nicht pushen.

| # | Commit | Dateien |
|---|---|---|
| 1a | `feat(scoping): Council opt-in per active-vault.json, default off` | `src/lib/server/env.ts`, `src/lib/server/env.scoping.test.ts` |
| 1b | `fix(ntfy): wacht watcher plist — separate archive dir` | `release/0.4.0/ntfy/com.aionlumen.wacht-ntfy-watcher.plist` |
| 1c | `docs(leuchtfeuer): README reflects production status, not pending setup` | `ops/leuchtfeuer/README.md` |
| 1d | `docs(release): pilot artefacts 0.2.0–0.4.0` | `release/0.2.0/`, `release/0.3.0/`, `release/0.4.0/` |

Zu **1c**: Zeile 43 und 70 tragen wörtlich „placeholder". Kopfzeile ergänzen — produktiv seit
Juli 2026, Pull über den read-only-User `leuchtfeuer-pull` mit forced command — und die
Platzhalter-Sprache auflösen oder klar als Einrichtungsanleitung kennzeichnen.

**Ausdrücklich nicht aufnehmen:** `Fotos/`, `docs/screenshots/release/*.png`,
`ops/leuchtfeuer/demo-fill.py`. Die brauchen erst eine visuelle PII-Prüfung gegen echte Konten,
Mail-Adressen und Anschriften. Nach jedem Commit `git status` zeigen, damit sichtbar bleibt, was
liegen bleibt.

## Schritt 2 — folio CHANGELOG

Neuer Abschnitt `## [Unreleased]` über `## [0.4.0]`:

- Council opt-in via `active-vault.json`, default off — P0.2-Entkopplung
- ntfy self-hosted channel, folio-ops error trigger (`928d022`)
- Leuchtfeuer pull plist corrected for rrsync forced command (`a94e861`)
- Wacht marker watcher: separate archive dir

`package.json` bleibt auf `0.4.0`. **Kein neuer Tag.**
Commit 1e: `docs(changelog): unreleased section for post-0.4.0 work`

## Schritt 3 — multi-agent

`pyproject.toml` von `0.3.0` auf `0.4.0`.
Commit: `chore(release): v0.4.0 — Yahoo move (P0.2 / P0.4a / P0.4c)`
Tag `v0.4.0` auf diesen Commit. **Nicht pushen.**

## Schritt 4 — vorlegen und anhalten

`git log --oneline` und `git status` je Repo, dazu die Tag-Liste von multi-agent.
**Der Push ist des Stewards Hand, in beiden Repos.**

## Schritt 5 — nach dem Push: Inbox-Transfer

Genau diese sieben Dateien, **kein Wildcard**. Im Staging liegt zusätzlich eine G2-Datei vom
10. Juli, die nicht erneut importiert werden darf.

```bash
cd ~/Projects/folio/release/0.4.0/folio-inbox-staging
cp nc-familien-zuordnung-0-4-0-2026-08-02.md \
   al-folio-version-0-4-0-2026-08-02.md \
   al-roadmap-spalte-0-4-0-2026-08-02.md \
   mh-projektkarten-0-4-0-2026-08-02.md \
   folio-leuchtfeuer-readme-0-4-0-2026-08-02.md \
   nc-review-wortlaut-0-4-0-2026-08-02.md \
   release-0-4-0-g2-freigabe-2026-08-02.md \
   ~/.folio/inbox/
```

## Schritt 6 — Verifikation

- `v0.4.0` von multi-agent auf GitHub sichtbar
- folio `main` trägt die fünf Commits
- sieben neue Dateien in `~/.folio/inbox/`
- aion-lumen.ch und mirhamed.ch unverändert

## Verbote

Kein Push ohne des Stewards Wort. Kein folio-Tag. Keine Screenshot-Commits ohne PII-Sichtung. Keine
Änderung an `aion-lumen.com` oder `carta`. Kein Wildcard-`cp` in den Inbox.
