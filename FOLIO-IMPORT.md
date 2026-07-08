# Folio Interchange Format v1

**Spec URL (stable):** `https://aion-lumen.ch/folio/import-spec.md`  
**Mirror (repo):** `https://raw.githubusercontent.com/aion-lumen/folio/main/FOLIO-IMPORT.md`

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
| `type` | enum | `directive` \| `field-note` \| `objective-update` \| `note` \| `lead` |
| `target` | string | Anchor in the vault (see Target IDs below) |
| `id` | string | Unique import id (slug, e.g. `pilot-checklist-2026-07`) |
| `source` | string | Delivering session or agent name |
| `created` | string | ISO-8601 date or datetime |

### Optional frontmatter

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Display title (defaults to first heading in body) |
| `tags` | string[] | Free-form labels |
| `derived_from_external` | boolean | Content derived from external material (e.g. an incoming mail). Forces manual review — never auto-committed, regardless of confidence. Defaults to `false`. |

### Type-specific fields

**`objective-update`** — requires `patch`:

```yaml
patch:
  status: in_progress          # optional: todo | not_started | in_progress | blocked | done | archived
  progress_note: "Short note"  # optional
  deadline: 2026-08-15         # optional, ISO date
```

**`directive` | `field-note` | `note`** — body is the full Markdown content committed to the vault.

**`lead`** — a freelance/job lead derived from mail (always `derived_from_external: true`,
so never auto-committed). On review-commit it becomes an objective in the **current chapter**.

| Field | Type | Description |
|-------|------|-------------|
| `rolle` | string | **Required.** Role/title of the lead. |
| `quelle` | string | **Required.** Source/portal (e.g. `freelancermap`). |
| `deadline` | string | Optional ISO date; drives the "Fristnahe Leads" hub card + TTL auto-archive. |
| `satz` | string | Optional rate (e.g. `800 EUR/Tag`). |
| `ort` | string | Optional location (or `Remote`). |
| `link` | string | Optional portal detail URL. |
| `dedup_key` | string | Optional cross-portal dedup key; identical leads group in review. |
| `duplicate_of` | string | Optional id of the first lead with this `dedup_key`. |

The `target` of a lead is the sentinel `current` — folio resolves it to the active chapter at
commit time (see Target IDs). Leads only ever reach commit via manual review (the trust gate
blocks auto-commit); expired leads (deadline passed, uncommitted) are auto-archived.

### Target IDs

Valid `target` values (must exist in the active vault):

| Pattern | Example | Resolves to |
|---------|---------|-------------|
| `obj-{chapter}-{seq}` | `obj-02-07` | Objective section in `_campaign/chapters/` |
| `chapter-{n}` or `{n}` | `chapter-2`, `02` | Chapter number (supports branch chapters e.g. `03a`) |
| `act-{n}` | `act-1` | Act file in `_campaign/acts/` |
| `{chapter-slug}` | `02-durchbruch` | Chapter filename without `.md` |
| `current` (leads only) | `current` | Active chapter, resolved at commit time |

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
2. **Filename:** use `{id}.md` where `id` matches the frontmatter `id` field (e.g. `pilot-checklist-2026-07.md`).
3. Use a new, unique `id` per delivery.
4. **`source`:** lowercase slug of the delivering agent/session (e.g. `fable-session`, `engineer-session`).
5. Never write directly into the vault path or `folio.db`.
6. Read this spec from the stable URL above when unsure.
7. For **new campaign goals**, write a clear title and measurable threshold in the body — Folio's triage agent may auto-create an `### obj-…` objective when unambiguous.

## Automatic triage (Folio agent)

After schema validation, Folio can run a **local LLM triage** (LM Studio) on valid inbox documents:

| Verdict | Meaning |
|---------|---------|
| `task` (eindeutig) | New campaign objective — auto-created in the matching chapter when confidence ≥ `FOLIO_AGENT_CONFIDENCE` (default 0.8) **and** the source is trusted (see below) |
| `unclear` | Might be a task — stays in `/inbox` for human review with LLM reasoning |
| `not-a-task` | Field note, status update, or observation — manual import only |

**Environment:**

| Variable | Default | Description |
|----------|---------|-------------|
| `FOLIO_AGENT_AUTO` | off | `1` = run triage on every inbox scan (Heute hub, `/inbox`) |
| `FOLIO_AGENT_MODEL` | `gemma-4-26b-a4b-it-mlx` | LM Studio model (tune via `npm run eval:triage`) |
| `FOLIO_AGENT_CONFIDENCE` | `0.8` | Minimum confidence for auto-creating objectives |
| `FOLIO_TRUSTED_SOURCES_PATH` | `config/trusted_sources.yaml` | List of sources eligible for auto-commit |
| `LM_STUDIO_BASE_URL` | `http://127.0.0.1:1234` | LM Studio OpenAI-compatible API |

**Source-Trust-Policy.** Auto-commit is additionally gated on the import's `source`: only sources
listed in `config/trusted_sources.yaml` may be auto-committed. An import whose `source` is not on the
list, or that carries `derived_from_external: true`, **always** goes to manual review — regardless of
verdict or confidence. Trust is derived from `source`; it is never a frontmatter field itself. If the
config is missing, no source is trusted (fail-closed → everything is reviewed).

**API:** `POST /api/inbox/triage` — assess all valid pending items; auto-commits eligible ones.

Audit log: `~/.folio/triage-log.jsonl` (records `source` + `source_trust`). Assessment cache: `~/.folio/triage-cache.json`.

Auto-created objectives always get `status: todo` and a history entry `created via inbox-triage`.

## Versioning

- **v1** — initial release (2026-07-07). Frozen.
- **v2+** — future formats use `folio_import: v2` and a separate spec section; Folio may support multiple versions in parallel.
