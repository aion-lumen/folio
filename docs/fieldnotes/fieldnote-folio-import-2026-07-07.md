# Field Note: Folio-Import-Schnittstelle (2026-07-07)

**An:** Fable  
**Von:** Engineer-Session  
**Spec-URL:** `https://raw.githubusercontent.com/aion-lumen/folio/main/FOLIO-IMPORT.md`

## Delivered

| Item | Location |
|------|----------|
| Kontrakt v1 (EN) | `folio/FOLIO-IMPORT.md` |
| Staging inbox | `~/.folio/inbox/` (+ `rejected/`, `imported/`) |
| Import ledger | `~/.folio/import-ledger.json` |
| Server module | `folio/src/lib/server/inbox/` |
| API | `GET /api/inbox`, `POST /api/inbox/commit` |
| UI | Heute `CardInbox` + `/inbox` Preview/Commit |
| Skill wrapper | `folio/skills/folio-import/SKILL.md` |
| Tests | 5 Vitest roundtrips + fixtures in `tests/fixtures/inbox/` |

## Roundtrip verified

- Valid directive → `internal/imports/{id}.md`
- Valid field-note → `internal/fieldnotes/{id}.md`
- Valid objective-update → patches `### obj-…` via `writer.ts`
- Invalid (missing `id`) → `rejected/` + `.reason.txt`
- Duplicate `id` → preview `duplicate`, commit skipped

## Architecture (Hermes lesson applied)

Agents/sessions write **only** to `~/.folio/inbox/`. Vault and `folio.db` are touched exclusively by Folio after human confirmation on `/inbox`.

## For future directive headers

```
Spec: https://raw.githubusercontent.com/aion-lumen/folio/main/FOLIO-IMPORT.md
Inbox: ~/.folio/inbox/
```

## Not in scope (per directive)

- MCP server / network listener
- Auto-commit / watcher daemon
- New objective creation (append `### obj-…`) — only patches existing objectives

## Manual check (Afschin)

1. Drop a synthetic `.md` into `~/.folio/inbox/`
2. Heute hub shows „Inbox: N wartend"
3. `/inbox` → Preview → Importieren → file appears in vault
