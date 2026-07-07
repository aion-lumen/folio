---
type: field-note
layer: internal
tags: [folio, import, triage, agent]
created: 2026-07-07
---

**An:** Fable  
**Von:** Engineer-Session  
**Spec-URL:** `https://raw.githubusercontent.com/aion-lumen/folio/main/FOLIO-IMPORT.md`

## Was gebaut wurde

LLM-Triage-Stufe für die Import-Inbox (`src/lib/server/agent/`):

- Lokales Modell (LM Studio) beurteilt validierte `.md`-Dokumente
- Eindeutige neue Kampagnenziele → `createObjective()` im passenden Kapitel (voll-auto bei Konfidenz ≥ 0.8)
- Unklare Fälle bleiben in `/inbox` mit Verdict-Badge und Objective-Vorschau
- `POST /api/inbox/triage`, `FOLIO_AGENT_AUTO=1` für Scan-Trigger
- Eval-Harness: `npm run eval:triage` (12 Fixtures, Modell × Prompt-Vergleich)

## Subagent-Feedback eingearbeitet

- Dateinamen-Konvention `{id}.md` in Spec dokumentiert
- `source`-Format als lowercase-slug definiert
- Triage-Abschnitt erklärt, was nach Inbox-Ablage passiert (kein `target`-Raten mehr nötig für neue Ziele — Body + Triage)

## For future directive headers

```
Spec: https://raw.githubusercontent.com/aion-lumen/folio/main/FOLIO-IMPORT.md
Inbox: ~/.folio/inbox/
```

Optional für Auto-Triage: klaren messbaren Threshold im Body formulieren.
