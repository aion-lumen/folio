# Field Note — Hermes Agent Version Diagnosis (pre-distribution, diagnostic-only)

**Date:** 2026-06-22 · **Directive:** Hermes Agent Version Diagnosis (`Projects/directive-hermes-agent-version-diagnosis.md`-style) · **Class:** Read-only research — no upgrade, no config changes, no feature adoption.

## TL;DR

- **Installed:** Hermes Agent v0.13.0 (release 2026-05-07), local checkout `~/.hermes/hermes-agent/` at commit `cf648a9b7` (`v2026.5.7-52-gcf648a9b7`). Running as gateway PID 1788 on **`127.0.0.1:8642` (localhost-only)**.
- **Latest upstream:** v0.17.0 (2026-06-19) — directive's "v0.15.0 current" is already 2 releases stale.
- **One real security finding on a used surface:** **CVE-2026-48710 (Starlette BadHost)** — installed Starlette `1.0.0`, fix is `≥1.0.1`, landed in Hermes v0.16.0 (2026-06-05). Reachability is **local-only** (gateway is 127.0.0.1-bound; no reverse-proxy, no Tailscale fronting 8642). DNS-rebinding via the user's browser is the realistic attack path — folio's server-side calls don't expose it directly.
- **Other security work** in v0.14.0–v0.17.0 (SSRF off-loop, OAuth PKCE, sudo brute-force block, Bedrock token strip, dangerous-command tightening, Brainworm-class promptware defense, urllib3/PyJWT CVE bumps) → **all touch surfaces this project does not use** (autonomous code-execution, browser tool, Bedrock provider, MCP stdio probing). N/A for this setup.
- **Breaking-change risk: low.** The `run_agent.py` 16k→3.8k refactor (v0.15.0) is explicitly behavior-preserving (release notes guarantee external-caller compatibility). Kanban CLI grew massively (104 PRs) but additively — the 4–5 subcommands multi-agent uses (`boards list`, `--board X list`, `show --json`, `create`, `comment`, `complete`) are unchanged. Folio's `/v1/responses` HTTP contract is the OpenAI-shape canonical, no breaks reported. Email-classification plugin runs as a subprocess (not via Hermes plugin-loader), immune to plugin-protocol changes.

**Recommendation: upgrade later** — schedule a clean upgrade window. Not "now" (no exploitable network-exposed CVE). Not "safe as-is" (a real CVE on a used dep is a real finding, even with low reachability).

## 1. Installed version

| | Value | Source |
|---|---|---|
| Hermes package version | **0.13.0** | `~/.hermes/hermes-agent/pyproject.toml` line 5 |
| Git commit | `cf648a9b7e4f3a346451d543648ce76922971e1a` | `git -C ~/.hermes/hermes-agent rev-parse HEAD` |
| `git describe` | `v2026.5.7-52-gcf648a9b7` | local checkout is **52 commits past v0.13.0 tag** on a diverged path (does not include v0.14.0 tag) |
| Gateway process | PID 1788 | `~/.hermes/gateway.pid` |
| Gateway running since | 2026-06-02 | `ps -p 1788 -o lstart` |
| Latest upstream release | **v0.17.0** (2026-06-19) | `gh release list --repo NousResearch/hermes-agent` |
| Distance to current | 2 minor versions + 6 weeks of releases (v0.14.0, v0.15.0, v0.15.1, v0.15.2, v0.16.0, v0.17.0) | release list |

Single-machine setup; no remote production gateway to also check.

## 2. Network exposure

| Surface | Bind | Exposure | Notes |
|---|---|---|---|
| **Hermes gateway** (port 8642) | `127.0.0.1` | **localhost-only** | No reverse-proxy, no Tailscale fronting. Confirmed via `lsof -i :8642`. |
| Folio prod dev server (5173) | `0.0.0.0` | LAN-reachable | Standard Vite default. Does not relay to 8642. |
| Folio demo server (5174) | `0.0.0.0` | LAN-reachable | `scripts/demo-server.sh` uses `--host`. Does not relay to 8642. |
| Telegram Bot API | external | Outbound HTTPS | Bots send to `api.telegram.org`. No inbound webhook. |

Network-exposure conclusion: **Hermes is not reachable from outside the laptop.** The two Vite servers expose folio's HTTP API (5173/5174) on the LAN, but they don't proxy to 8642 — folio's server-side code calls Hermes from within the same process.

## 3. Used Hermes surfaces

| Surface | Used? | How |
|---|---|---|
| **HTTP API gateway** (`POST /v1/responses`) | Yes | `folio/src/lib/server/hermes/client.ts:228`. Auth via `Bearer ${API_SERVER_KEY}` (fallback `HERMES_API_KEY`, lazy-read from `~/.hermes/.env`). OpenAI Responses-API shape (input/instructions/conversation/store). |
| **CLI** (`hermes kanban …`) | Yes | `multi-agent/scripts/production_worker.py` (4 patterns), `production_telemetry.py` (1), `marketing_learner.py` + `sender_learner.py` (read-only telemetry). Subcommands: `boards list --json`, `--board X list`, `show --json`, `create`, `comment`, `complete`. |
| **Plugin** (email-classification) | Yes | But invoked as **subprocess** via Hermes Worker's `terminal` tool: `python ~/.hermes/plugins/email-classification/cli.py <task_id>`. Not loaded via Hermes plugin-loader Python API. |
| **Telegram gateway** | No (effectively) | Only the Watchdog-Bot profile in `~/.hermes/config.yaml` would route through Hermes' Telegram adapter, and its state is `disconnected` since 2026-05-15 per `gateway_state.json`. The two production bots (Email-Feedback in multi-agent, ImmoAlert in council) bypass Hermes entirely and use `python-telegram-bot` directly. |
| **Browser / code-execution / sandbox** | No | No autonomous tool execution. Pipeline is human-in-the-loop button presses. |
| **MCP stdio** | No | No MCP servers configured. |
| **AWS Bedrock provider** | No | LM Studio local + Hermes-bundled providers only. |

## 4. Security delta v0.13.0 → v0.17.0 on **used** surfaces

Surveyed via GitHub release notes (`v2026.5.16` v0.14.0, `v2026.5.28` v0.15.0, `v2026.5.29.2` v0.15.2, `v2026.6.5` v0.16.0, `v2026.6.19` v0.17.0) + local `git log` for security commits not yet in HEAD.

### 4a — Hits on used surfaces

| Finding | Version | Affects this project? | Reachability |
|---|---|---|---|
| **CVE-2026-48710 (Starlette BadHost)** — pin Starlette ≥1.0.1 ([#35118](https://github.com/NousResearch/hermes-agent/pull/35118)) | v0.16.0 | **YES** — folio's HTTP API client hits the FastAPI/Starlette app on 8642 | **localhost-only**. Local actor (browser via DNS rebinding, malicious local app) is the realistic attack path. Folio server-side calls don't open this. |

That's the entire list of "hits on used surfaces."

### 4b — Misses (security work that does not touch this project)

| Finding | Version | Why N/A here |
|---|---|---|
| SSRF off-loop hardening in async paths ([#39046](https://github.com/NousResearch/hermes-agent/pull/39046)) | v0.16.0 | Affects Hermes' web/browser tool when fetching URLs autonomously. Not used. |
| OAuth PKCE state/verifier separation ([#26830](https://github.com/NousResearch/hermes-agent/pull/26830)) | v0.14.0 | OAuth provider auth path. Local LM Studio doesn't use OAuth. |
| Strip Bedrock bearer token from subprocess env ([#34498](https://github.com/NousResearch/hermes-agent/pull/34498)) | v0.16.0 | Bedrock provider not used. |
| Approval/sudo context guard in `execute_code`, docker DANGEROUS_PATTERNS, shell-escape denylist | v0.14.0–v0.17.0 | Autonomous code-execution not used. |
| Brainworm/Promptware defense ([#32269](https://github.com/NousResearch/hermes-agent/pull/32269)) | v0.15.0 | Defends agent context against tool-output prompt injection. Email plugin is deterministic; LLM is only consulted as classifier with bounded prompt. Margin-positive but not a current attack vector here. |
| urllib3 + PyJWT CVE bumps | v0.17.0 | Transitive deps. Worth picking up but not actively exploited via the surfaces used. |
| Sanitize tool error strings, sanitize invisible unicode in vetted skills | v0.14.0/v0.16.0 | Affects autonomous tool chains. N/A. |
| MCP stdio exfil-shaped config block | v0.17.0 | No MCP servers configured. |

### 4c — Notes on Starlette delta specifically

- `uv.lock` pins `starlette = 0.52.1` but installed is `1.0.0` (lockfile drift — likely from a `pip install -e .` after a `git pull` without `uv sync`).
- CVE-2026-48710 is a "BadHost" class CVE — typically Host-header validation issues that enable cross-origin attacks via DNS rebinding or proxy abuse.
- The Hermes Worker's gateway runs FastAPI on Starlette. The vulnerable Starlette 1.0.0 is in the request path of every `/v1/responses` call.
- Mitigations in place: (a) localhost-only bind; (b) `API_SERVER_KEY` bearer auth required on every request (no anonymous calls); (c) folio is the only legitimate caller in this setup.
- Residual: a hostile local actor (browser tab loading attacker-controlled page → DNS-rebind to 127.0.0.1 → forge requests) could conceivably exploit the BadHost class. The bearer-token auth helps but doesn't fully neutralize host-header attacks.

## 5. Breaking-change touchpoints

### 5a — `run_agent.py` refactor (v0.15.0, 16,083 → 3,821 lines)

Release notes ([#27248](https://github.com/NousResearch/hermes-agent/pull/27248)) explicitly guarantee:

> Behavior is unchanged: every extraction keeps a thin forwarder on `AIAgent`, every test patch path still works, every external caller is compatible.

This project's external surfaces (HTTP `/v1/responses` and `hermes kanban` CLI) are firewalled from internal Python imports. **No breakage expected.**

### 5b — Kanban CLI surface

v0.15.0 added 104 PRs of kanban functionality (`swarm`, scheduled tasks, per-task model overrides, worktree-per-task, etc.) — but **additively**. Multi-agent calls only 6 distinct subcommands:

| Subcommand | Multi-agent call site | v0.15+ status |
|---|---|---|
| `boards list --json` | `production_worker.py:119` | Stable |
| `--board <slug> list` | `production_telemetry.py` | Stable |
| `--board <slug> show <id> --json` | `production_telemetry.py:107`, `marketing_learner.py`, `sender_learner.py` | Stable |
| `create` (with `--idempotency-key`, `--json`) | `production_worker.py:143` | Stable (idempotency-key landed in v0.13) |
| `comment <id> --body …` | `production_worker.py` (per docstring `:18`) | Stable |
| `complete <id> --summary …` | `production_worker.py` (per docstring `:19`) | Stable |

None of these appear in v0.14–v0.17 BREAKING / DEPRECATED lists. Risk: small.

### 5c — `/v1/responses` HTTP contract (folio)

Folio constructs:
```typescript
POST /v1/responses
Headers: { Authorization: "Bearer ...", Content-Type: "application/json" }
Body:    { model, input, instructions, conversation, store: true }
```

Parses response.output[] for `type ∈ {function_call, function_call_output, message}` with the standard call_id / arguments fields. This is the **OpenAI Responses API shape** — Hermes adopted it as canonical. No format-change reported between v0.13 and v0.17. v0.14.0 added approval-event surfacing (additive).

Risk: small.

### 5d — Email-classification plugin

Invoked as subprocess via the Hermes Worker's `terminal` tool:
```bash
python ~/.hermes/plugins/email-classification/cli.py <task_id>
```

The plugin is **not loaded by Hermes' plugin-loader Python API** (per its own docstring, this is a Phase-N workaround because Hermes v0.13 didn't route user-plugin tools into the Worker session). It only consumes `task_id` and the kanban DB at `~/.hermes/kanban/boards/<slug>/kanban.db`.

This pattern is immune to plugin-protocol changes; the only fragile assumption is that `~/.hermes/kanban/boards/<slug>/kanban.db` keeps its schema. No schema changes flagged in release notes.

Risk: very small.

### 5e — Lockfile / runtime drift

Existing drift: `uv.lock` pins `starlette = 0.52.1`, installed is `1.0.0`. Indicates owner ran `pip install -e .` directly rather than `uv sync`. After an upgrade, owner should either:
- run `uv sync` to align with locked versions, or
- regenerate `uv.lock` (`uv lock`) and accept the resolved versions

This is independent of the upgrade itself — just a process note.

## 6. Recommendation

**Upgrade later.**

The single relevant CVE (Starlette BadHost CVE-2026-48710) is real but mitigated by localhost-only binding + bearer-auth. There is no broadly-reachable RCE / DoS / SSRF on the surfaces this project uses. The breaking-change risk is low because the refactor was behavior-preserving and the CLI surface grew additively.

"Upgrade now" would be warranted if: gateway were network-exposed (it's not), or autonomous code-execution paths were active (they're not), or one of the missing fixes affected a used surface critically (none do).

"Safe as-is" would be wrong because a Starlette CVE on a dep we ship in the request path is a real finding — it just hasn't been exploited and isn't easily exploited from outside the laptop.

**Suggested upgrade window:** plan a 30–60 min slot:
1. `cd ~/.hermes/hermes-agent && git fetch && git checkout <latest-tag>`
2. `uv sync` (or `pip install -e .` + verify Starlette 1.0.1+)
3. Restart gateway: `hermes gateway run --replace`
4. Smoke-test folio chat (one `/v1/responses` round-trip should still work)
5. Smoke-test `hermes kanban boards list --json`
6. Run multi-agent dry-run (`production_worker.py --dry-run --no-telegram --imap-fixture …`) to confirm the kanban path
7. Field-note the upgrade result

If anything regresses, `git checkout cf648a9b7 && uv sync` rolls back cleanly.

## 7. Out of scope (per directive, explicit)

- **The upgrade itself** (owner-decision, not this directive)
- Adoption of new features: Kanban improvements (swarm, scheduled tasks), Cron watchdog, Curator, dashboard MCP catalog, desktop app, Bitwarden Secrets Manager
- Re-architecture of the 3 Telegram bots (would Hermes' new platform plugins replace the direct `python-telegram-bot` usage in Email-Feedback + ImmoAlert? Maybe, separate scope.)
- Re-enabling the Watchdog-Bot (currently `disconnected` since 2026-05-15)
- Folio code changes to consume new Hermes API features
- Council repo work (still out of scope per cold-start-fixes directive)
- multi-agent-lab visibility flip (owner action)
- Distribution / release-packaging beyond v0.1.0 tag

## 8. What surprised

1. **The directive's "v0.15.0 current" is 2 releases stale** — already at v0.17.0. The Starlette CVE the directive mentions actually landed in **v0.16.0**, not v0.15.0. The directive author had partial visibility into upstream.

2. **"SSRF hardening in gateway paths" does not exist as named.** Searching commit history + release notes, the SSRF work is in `browser` + `skills-hub` subsystems, not the API gateway. The v0.16.0 release notes say *"Run URL SSRF checks off the event loop in async paths"* — affects Hermes' own URL-fetching tools, not the HTTP gateway accepting external requests. This is a fix for cases where Hermes-as-client could be tricked into SSRF; the project doesn't use Hermes-as-client for autonomous fetching at all.

3. **The biggest risk surface for THIS project (HTTP gateway path) only got one real fix** — Starlette pin. Everything else is autonomous-tool-execution hardening, which this project doesn't expose.

4. **`uv.lock` drift was already present.** Starlette pinned to 0.52.1, installed is 1.0.0. So the owner already does manual `pip install` overrides. After an upgrade, a clean `uv sync` would also reconcile this.

— afm.
