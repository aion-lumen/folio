# Roadmap

## Architecture

- **Cross-DB-Write-Ausnahmen** (mail-side multi-agent → folio.db):
  Liste der vier etablierten Schreibpunkte (validator_opinions,
  worker_runs, worker_run_logs, worker_run_summary) ist gepflegt in
  [`aion-lumen/multi-agent/docs/cross-db-write-ausnahmen.md`](https://github.com/aion-lumen/multi-agent-lab/blob/main/docs/cross-db-write-ausnahmen.md).

## v0.1 — Current release

- [x] Campaign timeline with 5 Acts
- [x] Chapter-based kanban view
- [x] Objective cards with status, deadlines, progress notes
- [x] Hermes chat panel with vault context and tool-calls
- [x] Objective detail panel with history
- [x] Leuchtfeuer (weekly focus priorities)
- [x] Setup wizard with demo vault
- [x] Mail status badge + detail modal (optional, requires life-mail)

## v0.2 — Next

- [ ] Voice input (STT) for chat and quick objective updates
- [ ] Interview-style setup wizard for vault creation
- [ ] Mobile PWA layout
- [ ] Command palette (⌘K) for fast navigation
- [ ] Vault explorer sidebar
- [ ] Settings panel

## v0.3 — Planned

- [ ] Frostpunk-inspired resource view (generator metaphor, decay mechanics)
- [ ] Gantt view alongside kanban
- [ ] Weekly review flow (guided Leuchtfeuer refresh)
- [ ] Export to PDF / print-friendly layout

## v1.0 — Long-term

- [ ] NAS / home server deployment guide
- [ ] Multi-vault support
- [ ] Public vault templates
- [ ] Offline-first with local sync

---

This roadmap reflects current priorities. Order and scope may shift.
