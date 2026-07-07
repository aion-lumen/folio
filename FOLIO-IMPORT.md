# Folio Interchange Format v1

**Spec URL (stable):** `https://raw.githubusercontent.com/aion-lumen/folio/main/FOLIO-IMPORT.md`

## Design decisions

| Decision | Rationale |
|----------|-----------|
| **Staging inbox outside vault** | Agents never write to the vault or `folio.db`. Drop files in `~/.folio/inbox/` (override: `FOLIO_INBOX_PATH`). Folio commits only after human confirmation. |
| **Markdown + YAML frontmatter** | Vault stays human-readable; AI agents and humans share one format. |
| **Idempotent `id`** | Same `id` twice → skip on import, never duplicate vault content. Ledger: `~/.folio/import-ledger.json`. |
| **v1 frozen** | Breaking changes require `folio_import: v2` alongside v1, never in-place edits to v1 rules. |

## File format

One document per `.md` file. YAML frontmatter + Markdown body.

### Required frontmatter (all types)

| Field | Type | Description |
|-------|------|-------------|
| `folio_import` | literal `v1` | Format version |
| `type` | enum | `directive` \| `field-note` \| `objective-update` \| `note` |
| `target` | string | Anchor in the vault (see Target IDs below) |
| `id` | string | Unique import id (slug, e.g. `pilot-checklist-2026-07`) |
| `source` | string | Delivering session or agent name |
| `created` | string | ISO-8601 date or datetime |

### Optional frontmatter

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Display title (defaults to first heading in body) |
| `tags` | string[] | Free-form labels |

### Type-specific fields

**`objective-update`** — requires `patch`:

```yaml
patch:
  status: in_progress          # optional: todo | not_started | in_progress | blocked | done | archived
  progress_note: "Short note"  # optional
  deadline: 2026-08-15         # optional, ISO date
```

**`directive` | `field-note` | `note`** — body is the full Markdown content committed to the vault.

### Target IDs

Valid `target` values (must exist in the active vault):

| Pattern | Example | Resolves to |
|---------|---------|-------------|
| `obj-{chapter}-{seq}` | `obj-02-07` | Objective section in `_campaign/chapters/` |
| `chapter-{n}` or `{n}` | `chapter-2`, `02` | Chapter number (supports branch chapters e.g. `03a`) |
| `act-{n}` | `act-1` | Act file in `_campaign/acts/` |
| `{chapter-slug}` | `02-durchbruch` | Chapter filename without `.md` |

Regex for objectives: `^obj-\d+[a-z]?-\d+$` (matches Folio vault reader).

### Commit destinations (Folio import flow)

| `type` | Vault path after commit |
|--------|-------------------------|
| `objective-update` | Patches existing `### obj-…` block via `writer.ts` |
| `field-note` | `{vault}/internal/fieldnotes/{id}.md` |
| `directive`, `note` | `{vault}/internal/imports/{id}.md` |

## Examples

### Example 1 — `directive`

```markdown
---
folio_import: v1
type: directive
target: obj-02-07
id: therapist-pilot-followup-2026-07
source: cv-session-fable
created: 2026-07-07
title: Therapist pilot follow-up checklist
tags: [pilot, p6]
---

# Follow-up after CV session

- Confirm August start only with assisted setup call
- Send PILOT.md link before first run
```

### Example 2 — `field-note`

```markdown
---
folio_import: v1
type: field-note
target: chapter-2
id: fieldnote-mirhamed-first-tranche-2026-07-07
source: engineer-session
created: 2026-07-07T18:00:00+02:00
title: mirhamed.ch first tranche ingested
tags: [dogfooding, mail]
---

## Observation

First production tranche from `mirhamed` account completed successfully.
Heute hub shows today's triage counters.
```

### Example 3 — `objective-update`

```markdown
---
folio_import: v1
type: objective-update
target: obj-02-07
id: obj-02-07-pilot-install-checkbox-2026-07
source: engineer-session
created: 2026-07-07
patch:
  status: in_progress
  progress_note: "Standalone install path documented; Zweitrechner test pending"
---

_(Body ignored for objective-update; patch drives the commit.)_
```

## Error cases

| Problem | Result |
|---------|--------|
| Missing required field (e.g. no `id`) | File → `inbox/rejected/`, reason: `missing field: id` |
| `folio_import` not `v1` | Rejected: `unsupported folio_import version` |
| Unknown `type` | Rejected: `unknown type: …` |
| `target` not found in vault | Rejected: `unknown target: …` |
| `objective-update` without `patch` | Rejected: `objective-update requires patch` |
| Duplicate `id` (already in ledger) | Preview shows `duplicate`; commit skips with message |

## Agent delivery checklist

1. Write one `.md` file per document to `~/.folio/inbox/`.
2. Use a new, unique `id` per delivery.
3. Never write directly into the vault path or `folio.db`.
4. Read this spec from the stable URL above when unsure.

## Versioning

- **v1** — initial release (2026-07-07). Frozen.
- **v2+** — future formats use `folio_import: v2` and a separate spec section; Folio may support multiple versions in parallel.
