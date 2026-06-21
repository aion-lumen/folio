# Mail-Queue Design

Design-Referenz für die Folio Mail-Queue (Triage-UI für klassifizierte Mails).
Hi-Fi-Prototypen + Konzept-Varianten + Design-Notes. Diese Files sind **keine
production code** — sie sind die visuelle Spezifikation, gegen die `src/`
implementiert wurde.

## Status

- **Iteration 2 ist die kanonische Spezifikation.** `project/Folio Mail-Queue - Iteration 2.html` ist die Multi-Account Hi-Fi-Version, die als Vorlage für die F.4-Implementierung diente.
- **Iteration 1** zeigt 3 Konzept-Varianten (A: Kanban, B: Filter-Chips + dichte Liste, C: §-Pile/Disagreement-first) — siehe `project/design-notes.md` für die Begründung der gewählten Richtung.
- Die designs wurden ursprünglich in einem separaten Working-Folder `~/Projects/folio-mail/` entwickelt (eigenes git-Repo seit Sicherung 2026-05-21, Branch `wip/initial-snapshot-2026-05-21`, Commit `5971548`). Am 2026-05-21 in `folio/` integriert (Konsolidierungs-Direktive Phase 4).

## Inhalt

```
README.md                  — dieses Dokument
project/
├── Folio Mail-Queue - Iteration 1.html   — 3 Konzept-Varianten (A/B/C)
├── Folio Mail-Queue - Iteration 2.html   — kanonische Hi-Fi-Version (multi-account)
├── design-notes.md                       — Design-Begründungen + Konzept-Vergleich
├── colors_and_type.css                   — Design-Tokens (Farben, Typo)
├── concept-{a,b,c}.jsx                   — JSX-Snippets pro Konzept
├── design-canvas.jsx                     — gemeinsame Canvas-Komponente
├── main.jsx, main-v2.jsx                 — Render-Entry-Points
├── mq-{list,main,shared}.jsx             — Mail-Queue Sub-Komponenten
├── sample-data.js, sample-data-v2.js     — synthetische Daten (~120 records)
└── fonts/                                — Inter, JetBrainsMono (woff2)
```

## Beziehung zur produktiven Implementierung

Die Designs wurden in F.4 in echten SvelteKit-Code übersetzt. Die HTML-Prototypen
sind **Visual Spec**, nicht Struktur-Vorlage — die Svelte-Komponenten teilen die
visuelle Wirkung, nicht die innere Struktur des HTML.

| Design-File | Reale Implementierung |
|---|---|
| Iteration 2 HTML (Multi-Account Hi-Fi) | `src/routes/(mail)/mail-queue/+page.svelte` (Layout, Routing) |
| `mq-list.jsx` (Mail-List) | `src/lib/mail-queue/MailList.svelte` |
| Sender-Sidebar | `src/lib/mail-queue/SenderSidebar.svelte` |
| Detail-Panel | `src/lib/mail-queue/DetailPanel.svelte` |
| Account-Filter-Row | `src/lib/mail-queue/AccountFilterRow.svelte` |
| Action-Filter-Row | `src/lib/mail-queue/ActionFilterRow.svelte` |
| Filter-Indicator-Chip | `src/lib/mail-queue/FilterIndicator.svelte` |
| Stores (mailQueue, mailDetail) | `src/lib/stores/mailQueue.svelte.ts`, `src/lib/stores/mailDetail.svelte.ts` |
| API-Endpoints (queue, body, correction, watch) | `src/routes/api/mail/{queue,body/[uid],correction,watch}/+server.ts` |
| `colors_and_type.css` (Design-Tokens) | `src/app.css` — Mapping dokumentiert in `../../f4-token-mapping.md` |

## Hinweise zur Nutzung

- **Iteration 2 enthält die Multi-Account-Annahmen.** Account-Filter, Sender-Aggregate, Action-Tier-Marker sind dort vollständig durchgezeichnet.
- **Sample-Data ist absichtlich konstruiert** mit 6 geplanten Disagreements an realistischen Schmerzpunkten (siehe `design-notes.md`) — sie ist Testfall, nicht echte Live-Distribution.
- **HTML/CSS sind die Quelle der Wahrheit für visuelle Details.** Direkt lesen, nicht rendern. Die HTML-Files sind self-contained (alle Assets relativ) und können bei Bedarf lokal geöffnet werden, aber Screenshots ersetzen das Lesen nicht.
- **Disagreement-UX ist der zentrale Konflikt:** Der Architekt entscheidet pro Mail bei `suggested_action ≠ final_action`. Iteration 2 implementiert dies mit dezenter Ring-Markierung + dediziertem Disagreement-Toggle. Konzept C (§-Pile) hatte einen radikaleren Vorschlag — siehe `design-notes.md` falls die Disagreement-Strategie nochmal zur Disposition steht.

## Sicherung

Die ursprünglichen Files leben weiterhin parallel in `~/Projects/folio-mail/`
(eigenes git-Repo, Branch `wip/initial-snapshot-2026-05-21`, Commit `5971548`)
und in `~/Projects/backups/folio-mail-2026-05-21/`. Diese bleiben bestehen, bis
die Integration hier verifiziert ist (separater nachgelagerter Schritt).

Exakte md5-Duplikate (`design-notes.md`, `folio-mail-queue-design-prompt-2026-05-17.md`),
die in der temporären F.4-Handoff-Variante doppelt lagen, sind nach
`~/Projects/archiv/2026-05-21-root-scaffolding/` mit `dup-`-Prefix archiviert
(siehe `MANIFEST.md` dort).
