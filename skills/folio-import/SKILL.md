---
name: folio-import
description: Deliver structured Markdown documents to Folio via the staging inbox. Use when the user asks to send content to Folio, update vault objectives, or file a field note for import.
---

# Folio Import Skill

## When to use

Activate when the user asks to:
- deliver content to Folio
- file a directive, note, or field note for the LIFE vault
- update an objective status via import (not direct vault edit)

## Security rule (non-negotiable)

**Never write to the vault path or `folio.db`.**  
Only write `.md` files to the staging inbox: `~/.folio/inbox/` (or `FOLIO_INBOX_PATH`).

Folio commits to the vault only after Afschin confirms in the UI.

## Format authority

Read and follow **[FOLIO-IMPORT.md](https://aion-lumen.ch/folio/import-spec.md)** — the single source of truth for v1.

Mirror (repo): `https://raw.githubusercontent.com/aion-lumen/folio/main/FOLIO-IMPORT.md`

Local copy (if repo present): `folio/FOLIO-IMPORT.md`

## Delivery

1. Drop `{id}.md` into `~/.folio/inbox/` (filename = frontmatter `id`).
2. `source`: lowercase slug (e.g. `fable-session`).
3. For **new campaign goals**: state a clear title + measurable threshold in the body — Folio triage may auto-create an objective when unambiguous.
4. Field notes / status updates: use `type: field-note` or `objective-update`; triage will not auto-create objectives for those.

Required frontmatter: `folio_import: v1`, `type`, `target`, `id`, `source`, `created`.

## Quick example

```markdown
---
folio_import: v1
type: field-note
target: chapter-2
id: my-unique-slug-2026-07-07
source: your-session-name
created: 2026-07-07
title: Short title
---

## Body

Your markdown content here.
```

## After writing

Tell the user to open Folio → Heute → **Import-Inbox** (or `/inbox`) to preview and commit.
