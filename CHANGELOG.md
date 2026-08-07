# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Credential-free, per-device model routing with separate always-on and on-demand slots, plus a
  fail-closed second-device demo setup that keeps its vault and mutable state isolated from real
  installations.
- Deny-by-default module registry with validated manifests, global and per-module kill switches,
  guarded Council routes and databases, and Leuchtfeuer as a second registry consumer.
- Sonar preview: a local review workspace for already imported external-derived notes, with
  immutable source notes, explicit human decisions in an append-only audit ledger, and no external
  publishing capability.

## [0.4.1] - 2026-08-07

### Added

- Credential-free execution profiles for Hermes turns, including model and local artifact identity,
  provider class, endpoint locality, quantisation, context and thinking settings, and prompt/policy
  fingerprints with explicit verification state.
- Strictly validated `hermes-context.yaml` manifests that select known Folio context sources without
  granting filesystem capabilities.
- Folio-owned session and turn correlation IDs, objective links, turn outcomes, and an auditable
  `running` / `completed` / `failed` / `aborted` lifecycle.
- Published Folio–Hermes adapter contract: Folio owns state, policy, approvals, and audit; Hermes is
  a replaceable execution runtime.

### Changed

- Council opt-in via `active-vault.json`, default off — P0.2-Entkopplung
- ntfy self-hosted channel, folio-ops error trigger (`928d022`)
- Leuchtfeuer pull plist corrected for rrsync forced command (`a94e861`) and made launchd-safe
  with an explicit rsync-3 binary plus non-interactive SSH options; the UI now labels the site
  metric accurately as server page requests and discloses possible automated probe traffic
- Import-Inbox triage now processes one document per request with visible progress, durable partial
  results, and correct cached Review counts; large batches no longer hit the browser-wide timeout
- Wacht marker watcher: separate archive dir

## [0.4.0] - 2026-07-10

### Added
- Leuchtfeuer: Heute-hub card + /leuchtfeuer detail view showing site & repo metrics
  (visits, door ratio story:system, GitHub stars, repo views) from server logs only —
  no client-side tracking, no cookies, no external analytics. Reads read-only from
  ~/.folio/metrics/; degrades to "last known state with date" when metrics are missing.
- ops/leuchtfeuer: VPS collectors (Caddy log parse w/ in-parse IP anonymisation + bot
  filter; GitHub stars/traffic snapshot), cron wrapper, Caddy logging snippet, launchd
  pull agent, unit tests (stdlib only).

### Changed
- Locked the operational triage prompt variant as an explicit `DEFAULT_PROMPT_VARIANT = 'v1'`
  (previously an implicit `?? 'v1'` default literal). No behaviour change — production always ran
  on `v1`; the earlier public "v1-strict" claim was a website statement, not the code. `v1-strict`
  stays available as an opt-in (`promptVariant` on the triage API). A regression test locks the
  default against silent drift. For reference, the hermetic 3-model eval (results-2026-07-09.json)
  measures `v1` = 13/14 with 0 false auto-commits; `v1-strict` = 11/14 (demotes real tasks via its
  "chapter fit is weak" rule).

## [0.3.0] - 2026-07-09

### Added
- Vault-scoped mail & DB stores: mail/feedback/council data is bound to the active
  vault. Demo vaults isolate to demo fixtures (konto-a/konto-b), never real IMAP
  (capability guard, not a warning).
- `make eval-full`: automated 3-model end-to-end eval over the 40-mail demo corpus
  against golden labels (`demo_labels.yaml`), writing `evals/full/<date>-report.md`
  + JSON with exit codes (Cowork-consumable). Internal ops metric, separate from the
  public triage number.
- `{{EVAL_ACCURACY}}` injector (`evals/triage/inject-eval-numbers.ts`): the number
  cascade is now scripted, not hand-edited; operator points `--file` at site/CV files.

### Changed
- Council is unregistered in demo vaults: `/council` → 404; detail pills shown only
  for `immo`; "→ Übernommen" is gated on Council registration (server 409 otherwise).
- Re-classification is gated on capability, not on account name.

### Fixed
- Demo vault no longer surfaces private accounts/labels (vault-scoping bug).

## [0.2.0] - 2026-07-09

### Added
- Source-trust policy for inbox auto-commit: objectives are only auto-created from
  trusted sources (`config/trusted_sources.yaml`); `derived_from_external` imports
  always go to manual review.
- Import type `lead` (freelance/job leads from the mail pipeline): required `rolle`/
  `quelle` + optional `deadline`/`satz`/`ort`/`link`/`dedup_key`. Committed as an
  objective in the current chapter (`target: current` sentinel). New Heute-hub card
  "Fristnahe Leads", TTL auto-archive of expired leads, and dedup grouping in review.

## [0.1.0] - 2026-04-26

First public release. life-dashboard is a local-first, privacy-respecting
life-planning tool with a markdown vault as data layer and a local AI
companion (Hermes Agent) as backend.

### Added

#### Vault & data layer
- Markdown vault as single source of truth (no database lock-in for content)
- Vault path configurable via `VAULT_PATH` environment variable
- Read/write integration for campaign, acts, chapters, objectives, leuchtfeuer
- Setup wizard offers two paths: existing vault or copy of bundled demo vault
- Demo vault template included (`templates/demo-vault/`, Alex-Persona)
- Patch-based objective edits with uniqueness guard on the `### obj-…` header

#### Layout system (Phase 1 → 4a)
- Three-pane layout: Timeline (top), Kanban (center), Chat panel (right)
- Timeline with five Acts, current-Act marker, click-to-navigate
- Kanban with four columns (open / in_progress / blocked / done) and Leuchtfeuer-Priorität (top-3 of the week)
- Chat panel with collapse/resize and cross-highlighting between selected objective and chat context
- Top bar with mail-badge and quick-actions
- Left panel: Acts → Chapters hierarchy, multi-act expand, active-chapter highlight
- Earthy Harmony color system (App-Dark, Cream, Brown, Gold, Olive)
- Typography: Epilogue (display), Caveat (script), DM Sans / Inter (body), JetBrains Mono (code)
- Aion Lumen "Pulsar" mark as branding

#### AI integration
- Hermes Agent integration via the `api_server` gateway (`/v1/responses`)
- Server-Sent Events (SSE) streaming for chat replies through `/api/hermes/chat`
- System prompt enriched with vault context (campaign, active chapter, in-progress + next-up objectives, Leuchtfeuer of the week)
- Memory-aware conversations using `~/.hermes/memories/MEMORY.md` and `USER.md`
- Tool-call surfacing in the chat stream (`tool_call` / `tool_result` / `text` event types)

#### Model profile switcher
- Three profiles selectable from the chat header dropdown:
  - **Ollama** (qwen3:30b-a3b) — default, fast tool-calling
  - **MLX Coder** (Qwen3-Coder-30B) — for coding tasks
  - **MLX Thinking** (Qwen3.6-35B-A3B) — hybrid thinking + agentic coding
- API endpoint `/api/hermes/model` (GET list + active detection, POST switches)
- Backend helpers `~/.local/bin/hermes-use-{ollama,mlx,thinking}` flip Hermes config + restart the launchd-managed gateway, and unload the inactive backend (LM Studio model or Ollama keep_alive=0) to free RAM before each switch

#### Mail integration (read-only)
- Mail-badge in top bar showing recent processing stats
- Status endpoint at `/api/vault/mail/status`
- Designed to read mail-notes written by life-mail (separate private tool)

### Architecture

- SvelteKit 2 + Svelte 5 (Runes)
- Tailwind CSS 4
- SQLite (local, file-based) via better-sqlite3 for setup state
- Local-first: no telemetry, no cloud dependencies
- Designed to run alongside a Hermes Agent gateway on the user's machine (default `http://localhost:8642`)

### Known limitations

- Setup wizard required on first run (vault path detection)
- Model profile switcher requires the `hermes-use-*` shell helpers to be present on `$PATH` (documented in setup notes)
- Approval UI for destructive Hermes commands is deferred — current install relies on `approvals.mode = smart` in the Hermes config (auxiliary LLM auto-approves low-risk, hard-coded `DANGEROUS_PATTERNS` block the rest)
- Demo GIF / screencast deferred to a later release

[0.1.0]: https://github.com/aion-lumen/life-dashboard/releases/tag/v0.1.0
