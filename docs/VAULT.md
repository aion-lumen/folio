# Vault Structure

The vault is a directory of plain Markdown files that Folio reads directly.
No database, no proprietary format — everything is human-readable and git-friendly.

## Directory layout

```
your-vault/
├── _campaign/
│   ├── campaign.md          # Campaign metadata (name, current act/chapter)
│   ├── acts/
│   │   ├── 01-foundation.md
│   │   ├── 02-expansion.md
│   │   └── ...              # Up to 5 acts
│   └── chapters/
│       ├── 01-repositioning.md   # Contains objectives as sections
│       ├── 02-breakthrough.md
│       └── ...
├── _meta/                   # Dashboard metadata (not edited manually)
│   ├── leuchtfeuer.md       # Weekly focus priorities
│   └── mail/                # Optional: life-mail state
│       └── state.json
└── restricted/              # Optional: life-mail output
    └── internal/open/mail/
        └── YYYY-MM-DD-slug.md
```

## campaign.md

```yaml
---
name: My Campaign
current_act: 1
current_chapter: 2
start_year: 2025
---
```

## Act files

```yaml
---
act_number: 1
title: Foundation
years: "2025–2030"
theme: Building the base
---

Description of this act's purpose and goals.
```

## Chapter files

Each chapter file contains its objectives as level-3 headings:

```markdown
---
chapter_number: 2
parent_act: 1
title: Breakthrough
atmosphere: The first furnace is running
progress: 0.0
---

### obj-01-02: Title of objective
- **threshold:** What done looks like
- **status:** open
- **deadline:** 2026-06-30
- **weight:** 1.0
- **related_goals:** [career, finances]

Progress notes, context, and history go here as free-form markdown.
```

## Status values

| Value       | Meaning                          |
|-------------|----------------------------------|
| `open`      | Not started                      |
| `in_progress` | Currently being worked on      |
| `blocked`   | Waiting on something external    |
| `done`      | Complete                         |
| `archived`  | Removed from active view         |

## Leuchtfeuer

`_meta/leuchtfeuer.md` contains the three weekly focus priorities:

```yaml
---
week: "2026-W17"
updated: 2026-04-21
---

1. Objective title
2. Objective title
3. Objective title
```

## Notes

- All files are UTF-8 encoded
- Frontmatter is YAML between `---` delimiters
- Objectives that lack a `status` field are treated as `open`
- The vault can be a git repository — the dashboard does not interfere with git operations
