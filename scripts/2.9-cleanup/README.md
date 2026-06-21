# Bauteil 2.9 E1c — Cleanup-Scripts (Variante A: Lern-Anker erhalten)

Reproduzierbare SQL-Scripts für den Cleanup vor Frau-Test.
**Architekt-Entscheidung Stopp 1:** Variante A.

## Voraussetzung: Pre-Snapshot

```bash
SNAP=~/Projects/aion-lumen/backups/db-cleanup-2026-06-09-pre
mkdir -p "$SNAP"
sqlite3 ~/.folio/folio.db ".backup '$SNAP/folio.db'"
sqlite3 ~/.council/council.db ".backup '$SNAP/council.db'"
sqlite3 ~/Projects/aion-lumen/multi-agent/state/feedback.db ".backup '$SNAP/feedback.db'"
```

## Reihenfolge

```bash
sqlite3 ~/.council/council.db < council-variante-a.sql
sqlite3 ~/.folio/folio.db < folio.sql
sqlite3 ~/Projects/aion-lumen/multi-agent/state/feedback.db < feedback.sql
```

## Lern-Anker (bleibt erhalten in folio.db)

- `corrections` — 20 user-klicks (16 immo→archive-silent als spam-signal)
- `object_status_override` — 28 user-bewertungen (25 verworfen, 80% mit reason)
- `mail_actionability_override` — 18 user-übernommen-clicks
- `user_rankings` — 4 top-10-bewertungen
- `users` — default user (id=1)

## Council-Objects (10 behalten = die 10 mit aktivem override)

Hardcoded in `council-variante-a.sql` als temp-table.
