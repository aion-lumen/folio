# Screenshot-PII-Status · Release v0.2.0

**Datum:** 2026-07-09 · Alle 9 Release-Screenshots geprüft (visuell) + bereinigt.

## Ergebnis

| Screenshot | Release v0.2.0? | PII-Befund | Aktion |
|---|---|---|---|
| 01-mail-queue-20260611 | nein (Juni-Altbestand) | **private Konten** (gmail/yahoo/mirhamed.ch als Chips) | **komplett aus Release genommen** — Inhalt durch neutralen Platzhalter ersetzt (PII entfernt); README-Einbettung entfernt; `git rm` offen (G2, siehe unten) |
| 05-import-inbox | nein | sauber (`folio-demo-shots.local`) | — |
| 06-heute-import | nein | sauber | — |
| 07-campaign-view | nein | sauber (Demo „Alex", `folio-demo-shots.local`) | — |
| 08-heute-20260611 | nein (Juni) | „yahoo" in Mail-Audit | maskiert → „konto-a" (Zahl 40 bleibt) |
| 08-inbox-trust-policy | ja (trust) | sauber (`folio-demo.local`) | — |
| 09-campaign-overview | nein | sauber (`demo-vault.local`) | — |
| **09-lead-inbox-dedup** | **ja** | sauber (Demo-Rollen/-Quellen, `folio-demo.local`) | — |
| **10-lead-hub-fristnah** | **ja** | „mirhamed"/„yahoo" in Mail-Audit | maskiert → „konto-a/b" (Zahlen bleiben) |

## Git-Vollzug offen (in G2-Schrittfolge)

`.git/index.lock` in der Session nicht entfernbar (Berechtigung) → Cowork kann keine Git-Mutation ausführen (konsistent mit Leitplanke „kein Commit durch Cowork"). Folgende Schritte macht der Steward bei G2:

```
# tote Lock entfernen, falls kein git-Prozess läuft:
rm -f folio/.git/index.lock
cd folio
git rm docs/screenshots/release/01-mail-queue-20260611.png
git add README.md docs/screenshots/release/08-heute-20260611.png docs/screenshots/release/10-lead-hub-fristnah-20260708.png
# 05-10 (untracked) nach Wunsch einchecken (wie 05-08 Haus-Muster)
```

Inhaltlich ist 01 bereits PII-frei (Platzhalter), falls es doch mitgepusht würde.

## Info-Befund (kein Blocker, nächster Gesamtlauf)

**folio-mail switcht bei Vault-Wechsel nicht** — Bug von der Steward gemeldet. Nicht Teil von v0.2.0-Scope, wird im nächsten Gesamtlauf behandelt. Hier nur dokumentiert (kein Scope-Zuwachs).
