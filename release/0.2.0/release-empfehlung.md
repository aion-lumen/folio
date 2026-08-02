# Release-Empfehlung v0.2.0 — G1

**Datum:** 2026-07-09 · **Trigger:** Aufgabe 1 (Source-Trust-Policy) + Aufgabe 2 (Lead-Adapter), Features gebaut/getestet, merge-bereit auf Branches · **Kimi-Schleife:** ja (durchlaufen)

## Version
Vorschlag: **folio v0.2.0** + **multi-agent-lab v0.2.0** (semver **minor**: additive Features, kein Breaking Change — `lead`-Typ + optionale Felder erweitern v1, ohne bestehende Regeln zu ändern).

## Änderungsliste
- **Source-Trust-Policy** (folio): Auto-Commit nur aus vertrauten Quellen; `derived_from_external` erzwingt manuelle Review. Fail-closed.
- **Lead-Adapter** (folio + multi-agent): neuer Interchange-Typ `lead`, Mail-Pipeline erzeugt deterministisch Lead-Dateien, Heute-Hub „Fristnahe Leads" (≤48 h), TTL-Auto-Archiv, Cross-Portal-Dedup.
- **Eval**: 3-Modell-Voll-Eval → 93 % / 0.929 / FP 0 / FN 0 über 14 Fixtures (konsistent über Modellfamilien, v1-strict).

## Betroffene Flächen (mit Stand)
| Fläche | Stand |
|---|---|
| folio README / FOLIO-IMPORT.md / CHANGELOG | im Branch fertig; CHANGELOG-Überschrift auf `[0.2.0]` datieren |
| multi-agent PILOT.md | im Branch fertig |
| Spec-Mirror aion-lumen.ch/folio/import-spec.md | zieht nach Push per Deploy nach |
| carta CV-Karte DE+EN | **93 % / 14 Fixtures gesetzt** ✓ |
| aion-lumen.ch/multi-agent Beleg-07 | **93 % gesetzt** ✓ |
| carta CV-PDF | Regeneration offen (G2, braucht Chromium+dev-server) |
| Screenshots 05–10 | geprüft; 01 entfernt (PII), 08-heute/10 maskiert |

## Kimi-Befunde — nach Triangulation
**Entscheidender Befund:** Kimi prüfte den **main-Stand**, aber die Features liegen ungemergt auf den Branches. **Alle vier Kimi-„Blocker" lösen sich damit auf** (CHANGELOG, lead-Typ, 12-vs-14 Fixtures, Screenshots) — sie sind main-vs-Branch-Artefakte oder bereits erledigt. Details in `kimi-triangulation.md`.

**→ Keine offenen Blocker für v0.2.0.**

Substanzielle Wichtig-Punkte (→ als folio-Objectives exportiert, Staging in `folio-inbox-staging/`):
1. **Eval-Ergebnis als Artefakt einchecken** — Zahl belegbar machen (`results-*.json`).
2. **trusted_sources.example.yaml** — Template fürs öffentliche Repo.

Weitere Wichtig → G2-Checkpoint bzw. Doku:
3. Merge-Trennung Kategorie/Lead (multi-agent) — Split-Entscheidung mit dir bei G2.
4. Klarstellung „`lead` additiv, v1 bleibt gültig" in CHANGELOG/Spec.

Kür → Backlog: Audit-Log-Pfad prominenter, Trust-Policy in README-Kurzübersicht, Screenshot-05-Betreffs generischer, `mixed-intent.md` Golden-Label.

## Offene Entscheidungen für dich (G1)
1. **Freigabe** der Release-Empfehlung insgesamt?
2. **Wichtig-Punkte 1+2**: im selben Release miterledigen (kleiner Zusatz) — oder als folio-Objectives ins Backlog (Import-Dateien liegen bereit)?
3. **Merge-Split** (Punkt 3): Kategorie-System + Lead zusammen mergen, oder getrennt? (Finale Entscheidung ohnehin erst bei G2.)

## Info (kein Blocker)
- folio-mail switcht bei Vault-Wechsel nicht — von dir gemeldet, nächster Gesamtlauf.
- Git in dieser Session gesperrt (`.git/index.lock`, Berechtigung) → alle Git-Mutationen laufen bei dir in G2.

---
**G1: Bitte Freigabe · Änderungswünsche · Stopp.**
