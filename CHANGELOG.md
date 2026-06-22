# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
