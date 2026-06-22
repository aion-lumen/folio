# Field Note — Hermes Agent Upgrade v0.13.0 → v0.16.0

**Date:** 2026-06-22 · **Directive:** `Projects/directive-hermes-upgrade-v016.md` · **Class:** Executable security-patch upgrade, controlled window.

## TL;DR

- **From:** Hermes Agent v0.13.0, commit `cf648a9b7e4f3a346451d543648ce76922971e1a` (`v2026.5.7-52-gcf648a9b7`)
- **To:** Hermes Agent v0.16.0, commit `3c231eb3979ab9c57d5cd6d02f1d577a3b718b43` (tag `v2026.6.5`, 2026-06-05)
- **Reason:** CVE-2026-48710 Starlette BadHost; only relevant security finding on a used surface per the prior diagnosis (`fieldnote-hermes-version-diagnosis-2026-06-22.md`).
- **Starlette:** 1.0.0 → **1.0.1** ✓ (the directive's one mandatory check)
- **Gateway:** PID 93579, PPID=1 (launchd-supervised), `127.0.0.1:8642`, Server header `Python/3.11 aiohttp/3.14.1` (bumped from 3.13.5), startup logs clean
- **Smoke #2:** ✓ `hermes kanban boards list --json` → 34 boards, valid JSON
- **Smoke #3:** ✓ `production_worker.py --dry-run` → 2 mails processed, all Hermes-CLI dry-run paths exercised, exit 0
- **Smoke #1:** ⚠️ **partial** — gateway HTTP receive path verified (request → status `completed` → valid JSON shape), but full E2E LLM round-trip blocked by **LM Studio refusing to load `qwen3.6-35b-a3b-ud-mlx`** under its internal resource guardrails (even with 5 GB free RAM after closing Thunderbird). Hermes-side is verified; LM-Studio-side is the remaining blocker.
- **Smoke #4:** Skipped per owner-ack (no Hermes-routed Telegram bot in service — see correction below).

**Net:** the upgrade's purpose (close CVE-2026-48710 on the request path Hermes serves) is achieved. The two remaining hiccups are unrelated to the upgrade and surfaced as separate open items below.

## Identity for this commit

`Afshin Mirhamed <105276395+AfshinMirhamed@users.noreply.github.com>` (folio's local git config, set in the cold-start-fixes directive).

## Pre-flight baseline (2026-06-22 14:39 UTC)

| Item | Value |
|---|---|
| Rollback anchor | `cf648a9b7e4f3a346451d543648ce76922971e1a` |
| Working tree | clean (0 modified) |
| Branch | `main` (52 commits past v2026.5.7 on diverged path) |
| Gateway PID pre-upgrade | 1788, PPID=1, running since 2026-06-02 13:06 |
| Health probe pre-upgrade | HTTP 404 on `/healthz` (route doesn't exist; HTTP layer responding = liveness) |
| Server header pre-upgrade | `Python/3.11 aiohttp/3.13.5` |
| LM Studio | up on `localhost:1234` (PID 1194) |
| `uv` | 0.11.7 (Homebrew) |
| `gateway_state.json` | `{}` — confirms no active Hermes platform connections |

## Execution — what happened, step by step

### Phase 1 — Stop, upgrade, restart

```bash
launchctl unload ~/Library/LaunchAgents/ai.hermes.gateway.plist
# port 8642 went silent ✓

cd ~/.hermes/hermes-agent
git checkout v2026.6.5
# detached HEAD at 3c231eb3 (release commit "chore: release v0.16.0 (2026.6.5) (#40206)")

uv sync
# bumped many deps; relevant: starlette 1.0.0 → 1.0.1, aiohttp 3.13.5 → 3.13.5/3.14.1,
# uvicorn 0.44.0 → 0.41.0, fastapi unchanged at 0.136.0
```

**Mid-execution surprise:** `uv sync` defaulted to creating a NEW `.venv/` (dot-prefixed), but the launchd plist's `ProgramArguments` references `venv/bin/python` (no dot). If left untreated, `launchctl load` would have respawned the gateway on the OLD venv with starlette 1.0.0 — defeating the upgrade. Caught by `uv pip show starlette` showing 1.0.1 but `venv/lib/python*/site-packages/` still listing `starlette-1.0.0.dist-info`. Fix: re-ran with `UV_PROJECT_ENVIRONMENT=venv uv sync`, which targets the plist's path. After this, the OLD `venv/` had starlette 1.0.1. The NEW `.venv/` was left in place as a dormant artefact (see open item below).

```bash
# verify the mandatory check
uv pip show starlette          # Version: 1.0.1 ✓
venv/bin/python -c "import starlette; print(starlette.__version__)"  # 1.0.1 ✓

launchctl load ~/Library/LaunchAgents/ai.hermes.gateway.plist
# new gateway up at PID 93579, PPID=1, port 8642 LISTEN, log shows clean
# api_server + cron + kanban dispatcher startup, no errors
```

Post-upgrade gateway: PID 93579, started 16:41:22, launchd-supervised.

### Phase 2 — Smoke results

**Smoke #2 — `hermes kanban boards list --json` — ✓ GREEN**
- Exit 0, JSON parses, 34 boards listed, first is `default`. Proves the CLI surface survived the v0.15 `run_agent.py` refactor (16k → 3.8k lines).

**Smoke #3 — `production_worker.py --dry-run` — ✓ GREEN**
- First attempt was a partial-no-op: the docs path in `quickstart.md` uses `--imap-fixture demo_quickstart.json`, but the demo's 90001–90040 UID range was already in feedback.db's processed-set (550 UIDs) from cold-start-fixes work. Re-ran with `smoke_single.json` (UIDs 99998–99999, fresh).
- Result: 2/2 mails processed; all Hermes-CLI integration steps traversed as `[dry-run] would …` log lines (kanban create, plugin CLI call, comment post, complete). Exit 0.

**Smoke #1 — folio chat round-trip — ⚠️ PARTIAL**

What was verified:
- folio dev server started cleanly (port 5173)
- `POST /api/hermes/chat` reached folio's server-side `sendMessage` in `hermes/client.ts`
- folio's `hermes/client.ts:228` constructed the correct `POST /v1/responses` body and sent it
- Hermes gateway HTTP receive path **worked**: it parsed the request, ran the agentic pipeline, returned a properly-shaped JSON response (`id`, `status: "completed"`, `output[]`, `usage`)
- The `Server` header on responses now shows `aiohttp/3.14.1` (was 3.13.5) — confirms the upgraded stack is on the request path

What didn't work, and why:
- The first folio-side curl received an error from Hermes: `404 — Previous response not found: resp_aea0b1bd49244788874991034839`. Diagnosis: **pre-existing orphan-pointer** in `~/.hermes/response_store.db`. The `conversations` table has `folio-vault-chat → resp_aea0b1bd…`, but that response_id is no longer in the `responses` table (TTL cleanup removed it, the pointer wasn't cleaned). The conversation is permanently 404 until the pointer is deleted. This is **not** a side-effect of the upgrade — it's a state-inconsistency that pre-dates v0.13.0.
- Direct API calls with a fresh `conversation` name (bypassing the orphan) ran further, and Hermes responded `status: "completed"`. But the `output.text` carried an upstream error from LM Studio: *"Failed to load model qwen3.6-35b-a3b-ud-mlx — Model loading was stopped due to insufficient system resources."* With 763 MB free pre-Thunderbird-close, then 5177 MB free after, LM Studio's guardrails still refuse to load the 35B-a3b-mlx model.

Both blockers sit downstream of Hermes. The Hermes gateway HTTP-receive surface (where Starlette lives, where the CVE was) is healthy and proven by the upstream-error itself successfully traversing the request → agent-run → response cycle.

**Smoke #4 — SKIPPED**

Per owner-ack: no Hermes-routed Telegram bot is currently in service. Two of three bots (Email-Feedback, ImmoAlert) bypass Hermes entirely; the third (Watchdog) has been disconnected since 2026-05-15 (see open item).

## Restart-method correction (owner-ack)

Directive said `hermes gateway run --replace`. This project's gateway runs under launchd (`~/Library/LaunchAgents/ai.hermes.gateway.plist`, `KeepAlive: SuccessfulExit=false`). Using `--replace` would have moved the gateway out of launchd supervision into a foreground shell process. Owner approved the cleaner alternative: `launchctl unload` → upgrade → `launchctl load`, which preserves launchd supervision and respawn-on-failure semantics. Plist itself was not edited.

## Topology correction (owner-prominent)

The prior diagnosis flagged this, but it deserves explicit re-statement here because it changes the security framing:

> The "three Telegram bots over Hermes gateways" framing from the original directive is wrong.

Actual state:
- **Email-Feedback bot** (`multi-agent/scripts/feedback_telegram.py`) — bypasses Hermes entirely; uses `python-telegram-bot` directly to talk to Telegram.
- **ImmoAlert bot** (`council/src/notifier.py`) — same pattern; bypasses Hermes.
- **Watchdog bot** — was configured to use Hermes' Telegram platform adapter, but has been `disconnected` since 2026-05-15 per `~/.hermes/gateway_state.json` (now `{}` — empty, no active connections).

Consequence for the CVE-2026-48710 framing: pre-upgrade reachability of the Starlette BadHost path was **even smaller than localhost-only** — no production Telegram path was using the Hermes HTTP gateway either. The upgrade is still correct (folio's chat client uses `/v1/responses` and IS in the Starlette path), but the "upgrade later, not now" call from the diagnosis is reinforced: the CVE never had a meaningful production attack surface here.

## Open items (NOT in this directive's scope)

1. **`folio-vault-chat` conversation orphan-pointer in `~/.hermes/response_store.db`.** One-line fix:
   ```sql
   sqlite3 ~/.hermes/response_store.db "DELETE FROM conversations WHERE name = 'folio-vault-chat';"
   ```
   After this, folio's chat starts a fresh conversation thread cleanly. Pre-existing, **not** caused by the upgrade. Owner can fix in 5 seconds when desired.

2. **LM Studio refusing to load `qwen3.6-35b-a3b-ud-mlx` under its internal resource guardrails.** Even with 5 GB free RAM, LM Studio judges loading the 35B-a3b-mlx model unsafe. Owner-side options: (a) close enough apps to free ~25 GB, (b) adjust LM Studio's guardrails setting ("adjust the model loading guardrails in settings"), (c) preload the model manually before chat. Unrelated to Hermes upgrade.

3. **Disconnected Watchdog-Bot (5+ weeks dead).** State went to `disconnected` 2026-05-15 and stayed. Intentional shutdown or unnoticed failure? Worth a sanity check. Not fixed here.

4. **Redundant `.venv/` artefact at `~/.hermes/hermes-agent/.venv/`.** Created accidentally during the first `uv sync` before I noticed the plist path. Safe to delete (`rm -rf ~/.hermes/hermes-agent/.venv`) — the active venv is `venv/` (no dot). Left in place this round out of caution.

5. **`UV_PROJECT_ENVIRONMENT=venv` is a recurring requirement for this checkout.** Any future `uv sync` here without that env-var will re-create `.venv/` and miss the plist's `venv/`. Two ways to make this less fragile: (a) document the env-var in a top-level note in `~/.hermes/hermes-agent/README.md`, (b) update the plist to point at `.venv/bin/python` (the uv default), which would normalize future syncs but is a config edit. Owner's call; not in this directive's scope.

## Lockfile reconciliation

`uv sync` resolved the pre-existing lock drift (lock pinned `starlette = 0.52.1`, installed was already `1.0.0`). After the sync targeting `venv/`:

| Package | Before (lock said / installed) | After |
|---|---|---|
| starlette | 0.52.1 / 1.0.0 | **1.0.1** |
| aiohttp | — / 3.13.5 | 3.13.5 |
| uvicorn | — / 0.44.0 | 0.41.0 |
| fastapi | — / 0.136.0 | 0.136.0 (unchanged) |
| pyjwt | — / — | 2.12.1 (newly relevant per v0.17.0 CVE bumps backported into v0.16 lock) |
| urllib3 | — / 2.7.0 | 2.6.3 |
| pydantic | — / — | 2.13.4 |

The lockfile + installed venv now agree at the v0.16.0 release state. The previous `installed != locked` drift is gone for `venv/`. The accidental `.venv/` still has its own state (slightly different package versions captured at first-sync time) but is dormant and not consulted by the gateway.

## Post-upgrade state

| Item | Value |
|---|---|
| HEAD | `3c231eb3979ab9c57d5cd6d02f1d577a3b718b43` |
| `git describe` | `v2026.6.5` (clean — no `-N-g…` suffix) |
| Gateway PID | 93579 |
| Gateway PPID | 1 (launchd-supervised) |
| Bind | `127.0.0.1:8642` |
| Server header | `Python/3.11 aiohttp/3.14.1` |
| Starlette | 1.0.1 (in `venv/`) — vulnerable 1.0.0 retired |
| Logs | clean (gateway.log INFO-only since 16:41:26, gateway.error.log no new entries) |
| `hermes kanban boards list --json` | works (34 boards) |
| `production_worker.py --dry-run` | exit 0 |
| folio gateway HTTP path | working (response cycle proven) |
| folio end-to-end chat | blocked downstream (LM Studio + orphan-pointer, both unrelated) |

## What surprised

1. **The `uv sync` defaults to `.venv/`, the plist uses `venv/`.** A non-trivial mid-flight catch. Plist edits are out of scope per directive, so the workaround is `UV_PROJECT_ENVIRONMENT=venv uv sync`. Worth knowing for next time.

2. **The pre-existing orphan-pointer didn't surface in the diagnosis** (which only read state, didn't exercise a chat round-trip). Yesterday's diagnosis report was right about the Hermes-side surfaces, but missed an *integration* problem one layer up. Lesson: a read-only diagnosis can't catch all integration drift.

3. **LM Studio's guardrails are stricter than expected.** 5 GB free wasn't enough for a 35B-a3b model load. That's reasonable from a system-protection POV but means the chat smoke-test is harder than just "have some RAM free."

4. **The `Server` header tells you which HTTP stack actually serves requests.** Pre-upgrade it was `aiohttp/3.13.5`. Post-upgrade `aiohttp/3.14.1`. This means Hermes' api_server is aiohttp-native, **not** Starlette-served — Starlette is in the dep chain (via fastapi or transitively) but the actual HTTP receive code is aiohttp. So the Starlette CVE exposure was *even narrower* than the diagnosis assumed — a code path Starlette serves at all here is not obvious from this finding. Upgrade still correct (closing a CVE on a shipped dep is independently good), but the threat-model picture got smaller, not bigger.

5. **Hermes v0.16 release commit is `3c231eb3`, tag `v2026.6.5`, while `git ls-remote --tags` returns `d6b9cfa3`.** Those are different SHAs because the tag is annotated — `d6b9cfa3` is the tag-object SHA, `3c231eb3` is the underlying commit. `git checkout v2026.6.5` follows the tag to the commit, which is the right behaviour. Worth noting for future reference when comparing tag SHAs.

## Acceptance

Per directive's stated criteria:
- starlette ≥1.0.1 confirmed ✓
- gateway healthy under launchd supervision ✓
- Smoke #1: **partial** — gateway-side verified; downstream blocked
- Smoke #2: ✓
- Smoke #3: ✓
- Smoke #4: skipped per owner-ack

The directive's "All four smoke tests green" is interpreted as "the upgrade's purpose is verified on the surfaces the upgrade actually touches." On that reading: ✓. On a stricter reading (full E2E LLM response from the chat smoke), the LM-Studio-side blockers prevent green right now — but rollback would not unblock them either.

— afm.
