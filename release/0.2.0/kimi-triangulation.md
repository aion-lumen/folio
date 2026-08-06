# Kimi-Report — Triangulation & Klassifikation · v0.2.0

**Datum:** 2026-07-09 · **Durchgeführt von:** cowork-release-pilot

## Kernbefund der Triangulation

**Kimi hat den `main`-Stand beider Repos geprüft, nicht die Feature-Branches.** Die Features liegen auf `feat/lead-type` (folio, 1 Commit vor main) bzw. `feat/lead-adapter` (multi-agent, 2 Commits vor main) — **noch nicht gemergt**. Dadurch meldet Kimi mehrere „fehlende" Artefakte, die auf dem Branch vorhanden sind. Jeder Punkt unten gegen den echten Branch-Stand verifiziert.

## Blocker-Auflösung

| Kimi-Befund | Verifikation gegen Branch | Klasse nach Prüfung |
|---|---|---|
| **B1** CHANGELOG kein 0.2.0 | Auf `feat/lead-type` vorhanden unter `[Unreleased]` (Trust-Policy + Lead dokumentiert). Nur Überschrift `[0.2.0] - 2026-07-08` + Datum setzen. | **kein Blocker** → Routine-Task (war Phase-2-Entwurf 2.1) |
| **B2** `lead`-Typ fehlt in FOLIO-IMPORT.md/Spec | Auf Branch vollständig (Z. 24 Enum, 36 `derived_from_external`, 51–79 Lead-Felder + sentinel `current`). Spec-Mirror zieht per Deploy nach dem Push. | **kein Blocker** — greift nach Merge+Deploy |
| **B3** nur 12 Fixtures, keine Voll-Eval | Branch-Manifest = **14**. Voll-Eval (3 Modelle) durch der Steward gelaufen: **93 % / 0.929 / FP 0 / FN 0**. | **kein Blocker** — Zahl belegt, bereits in Kaskade gesetzt |
| **B4/F5** Screenshots 06–10 fehlen (multi-agent-lab) | Lead-Screenshots 09/10 liegen im **folio**-Repo (`docs/screenshots/release/`), nicht im multi-agent-Repo. Repo-Zuordnung, kein fehlendes Artefakt. Screenshot 10 „Account-Label" bereits maskiert. | **kein Blocker** — Zuordnungs-Irrtum; PII bereits behandelt |

**→ Ergebnis: keiner der vier Kimi-Blocker bleibt nach Branch-Verifikation ein Blocker.** Alle sind entweder Branch-vs-main-Artefakte oder bereits erledigt. Das ist selbst ein wertvoller Befund: **Der Release darf erst nach dem Merge auf main als „fertig" gelten** — bis dahin sieht jede externe Prüfung (wie Kimi) den unvollständigen main-Stand. Merge-Reihenfolge in G2 ist damit sicherheitsrelevant, nicht nur kosmetisch.

## Wichtig — davon bleibt substanziell

| Kimi-Befund | Bewertung | Aktion |
|---|---|---|
| **W-F4** „92 % accuracy" nicht durch eingechecktes Eval-Ergebnis belegt | **berechtigt.** Harness + 14 Fixtures sind öffentlich, aber es liegt keine eingecheckte Ergebnisdatei (`results.json`/`summary`) bei. Zahl jetzt 93 %. | **Update-Empfehlung (folio-directive):** Eval-Ergebnis als Artefakt einchecken, damit die Außenzahl belegbar ist. Zahl selbst bereits auf 93 %/14 aktualisiert. |
| **W-F2** trusted_sources ohne Template | `config/trusted_sources.yaml` **ist** auf Branch — aber als echte Config, kein `.example`. Für ein öffentliches Repo ist ein `.example`-Template sauberer. | **Update-Empfehlung:** `trusted_sources.example.yaml` anlegen; echte Config gitignoren falls maschinenspezifisch. |
| **W-F2 (multi-agent)** Merge-Trennung Kategorie/Lead nicht nachvollziehbar | Deckt sich mit offener Split-Frage aus dem Handoff. | **an G2-Checkpoint** (Merge-Strategie mit der Steward) |
| **W1-F1** Spec „v1 frozen" vs. neuer `lead` | **Klarstellung nötig, kein Konflikt:** `lead` ist additiv (neuer Enum-Wert + optionale Felder), v1-Regeln unangetastet → kein Breaking Change, kein v2. Kimi sah main ohne `lead`, daher der scheinbare Widerspruch. | **Doku-Notiz** in CHANGELOG/Spec: „additive, v1 stays valid" |
| **W-F5** Screenshot 05 Immobilien-Betreffs „verwirrend" | Demo-Daten, `.example`-Domains, kein PII. Kür-nah. | **Backlog** (Betreffs generischer bei nächstem Shot-Refresh) |
| **W2-F2 (multi-agent)** PILOT.md fehlt | Existiert auf `feat/lead-adapter`. Branch-vs-main. | **kein Handlungsbedarf** — greift nach Merge |

## Kür → Backlog (blockiert nicht)

- Audit-Log-Pfad `~/.folio/triage-log.jsonl` prominenter dokumentieren.
- Trust-Policy in README-2-Minuten-Übersicht sichtbarer.
- Screenshot-05 Betreffzeilen generischer.
- `mixed-intent.md` Golden-Label-Prüffall (aus Eval-Randbefund, der Steward).

## Sicherheit — Kimi bestätigt sauber

Keine Secrets/Keys (`.env.example` nur Platzhalter) · keine PII in geprüften Fixtures/Screenshots · v1 unangetastet. Deckt sich mit eigener Prüfung. **Zusätzlich eigenständig behandelt:** private Konten in Screenshot 01 (Kimi sah main-Screenshots des multi-agent-Repos, nicht die folio-Release-Shots) → 01 aus Release genommen, 08-heute/10 maskiert.
