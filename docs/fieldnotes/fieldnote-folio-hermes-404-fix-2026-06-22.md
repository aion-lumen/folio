# Field Note — folio Hermes Chat 404 (orphan previous_response_id) — Fix

**Date:** 2026-06-22 · **Directive:** `Projects/directive-folio-hermes-404.md` · **Class:** Bugfix (Open Item #1 from yesterday's v0.16 upgrade report, now closed).

## Symptom

folio vault chat returned `404 — Previous response not found: resp_aea0b1bd…` on every message. Hard error in the UI; no chat reachable.

## Diagnosis (read-only first, before any fix)

Confirmed in 4 read steps:

1. **folio carries no client-side `previous_response_id` state.** `client.ts:228–241` sends only `{model, input, instructions, conversation: 'folio-vault-chat', store: true}`. `chat.svelte.ts:101`'s `id: crypto.randomUUID()` is just a UI message-render key.
2. **Hermes' `~/.hermes/response_store.db` had the orphan.** Schema: `conversations(name PK, response_id)` + `responses(response_id PK, data, accessed_at)`. The `conversations` table had `folio-vault-chat → resp_aea0b1bd49244788874991034839`, but `responses` had no row for that response_id.
3. **LEFT JOIN over all 4 conversation rows** showed **every single one** was orphan — including 3 smoke-test artefacts from yesterday's work (`folio-smoke-default`, `folio-smoke-ha`, `folio-aux-fix-test`).
4. **Mechanism:** Hermes auto-looks-up `conversations[name]` on every `POST /v1/responses` with `conversation: X` + `store: true`. When the pointer is stale (response TTL prunes the row but leaves the pointer behind), Hermes 404s before reaching the LLM.

Pre-existing condition — pre-dates the v0.16 upgrade. Yesterday's diagnosis already flagged it; today we hit it live and closed it.

## Fix — two layers

Per directive, both fixes applied; the robustness fix is the durable one.

### 1. Data fix — clean the orphan(s)

```sql
DELETE FROM conversations
WHERE name IN ('folio-vault-chat', 'folio-smoke-default',
               'folio-smoke-ha', 'folio-aux-fix-test');
```

Run against `~/.hermes/response_store.db` after the LEFT JOIN confirmed all four were orphan. `responses` table (100 rows) untouched.

### 2. Robustness fix — `folio/src/lib/server/hermes/client.ts`

Two changes:

**a)** Extended the `HermesEvent` type union (`client.ts` + `chat.svelte.ts`) to include a new `'system_notice'` event type.

**b)** On `POST /v1/responses` failure, detect the specific 404 "Previous response not found" condition. If matched: clear the orphan pointer in Hermes' `response_store.db` via a surgical `DELETE FROM conversations WHERE name = ?` (better-sqlite3, which folio already uses for `~/.folio/folio.db`), then **retry with the original body**. Hermes now treats the conversation name as fresh, stores the new response, and the pointer self-heals to a valid response_id on the same call. Prepend a `'system_notice'` event so the user sees that context was reset.

**c)** Frontend (`MessageList.svelte`) adds a render case for `'system_notice'` events: subtle inline italic in muted color (`ℹ Chat-Verlauf zurückgesetzt …`), not a regular assistant bubble.

### Why a one-shot DELETE from folio into Hermes' DB, not "drop conversation/store on retry"

The naive recovery (retry without `conversation` + `store`) doesn't heal the orphan pointer — every subsequent message would show the system_notice again, indefinitely. The directive said the data fix is acceptable; doing it programmatically at the exact moment we have evidence the pointer is stale (Hermes' own 404 told us) is the safe automation of that same operation. `response_store.db` is in WAL mode, so a concurrent DELETE from a second sqlite client is safe.

The DELETE failure path is non-fatal — if folio can't open the DB (e.g. permission, missing file), the retry still happens; the user sees a system_notice and a response. The orphan persists, but the user-facing behavior is still "no 404, response received." Compounded reliability.

## Verification — 4 scenarios

`npm run check` clean (0 errors), `npm run test` 4/4 pass after the changes.

Smoke test against running folio dev (port 5173):

| Scenario | Request | Result |
|---|---|---|
| Healthy chain, fresh post-Phase-3 cleanup | `POST /api/hermes/chat` | ✓ no system_notice, plain `text` event, pointer auto-updates to new resp_id |
| Deliberate orphan injected | inject `resp_deliberate_orphan_test…` then chat | ✓ `system_notice` + `text` events; pointer self-heals to a NEW fresh resp_id (`resp_13a7edad3dc0…`) |
| Follow-up after recovery | next chat right after | ✓ no system_notice, chain works normally |
| Re-inject orphan, retry | repeat injection + chat | ✓ self-heals again (`resp_64470a0a895f…`), confirms cycle is repeatable |

Every test returned **without** a 404 to the UI. The LM Studio `Failed to load model qwen3.6-35b-a3b-ud-mlx` error appears in the response **text content** in every scenario — that's the separate Open Item #2 from yesterday's upgrade field note (LM Studio refuses to load the 35B-a3b-mlx model under its resource guardrails), unaffected by this fix. The acceptance gate of this directive — "vault chat completes a round-trip without the 404" — is met regardless.

## What surprised

1. **All 4 stale conversations were orphan, not just one.** The 3 smoke-test artefacts from yesterday's upgrade work (`folio-smoke-default`, `folio-smoke-ha`, `folio-aux-fix-test`) all pointed at long-pruned response_ids. Suggests Hermes' response TTL has been quietly pruning rows out from under conversation pointers for a while — this isn't a one-time anomaly, this is the steady-state behavior.

2. **"Retry without conversation/store" looked simpler but had a UX bug.** First version of the fix dropped `conversation` + `store` on the retry. That worked once, but every subsequent message re-hit the orphan (because the conversations row was never cleared), showed the system_notice again, indefinitely. The right fix is to clear the orphan and retry with the same body — Hermes then self-heals via auto-store.

3. **`previous_response_id: null` does not override Hermes' auto-lookup.** Tried as a less-invasive alternative to the cross-process DB write; Hermes still 404s when the conversations-table pointer is broken, regardless of an explicit null in the request body. So the DB-side fix is structurally required.

4. **Cross-process sqlite write from folio into `response_store.db` is awkward architecturally but safe operationally.** WAL mode handles the concurrent writer cleanly. The alternative (showing the system_notice forever, or sending a manual sqlite command each time it recurs) is worse.

## Recurrence expectation

Hermes' response_store has a TTL/cleanup cycle that prunes old `responses` rows. The `conversations` pointers don't get cleaned in the same pass — that's the source of this class of bug. With this fix in place, each recurrence:
- Manifests as a single `system_notice` event in the chat UI ("Chat-Verlauf zurückgesetzt …")
- Self-heals the underlying pointer
- Lets the user keep typing without intervention

A cleaner fix would live in Hermes itself (heal-on-404 in the gateway code, or a periodic clean-orphans job). Out of scope for this directive (no Hermes config/gateway changes).

## Files changed

**folio:**
- `src/lib/server/hermes/client.ts` — `+50` lines (type union extended, retry+clearOrphan path, `parseHermesOutput` helper extracted)
- `src/lib/stores/chat.svelte.ts` — `+1` (type union)
- `src/lib/components/chat/MessageList.svelte` — `+4` (render case for `system_notice`)

**Hermes state (one-time cleanup):**
- `~/.hermes/response_store.db` — `DELETE FROM conversations WHERE name IN (…)` (4 rows removed). Future orphans get cleaned by the robustness path automatically.

## Open items still standing (from v0.16 upgrade report)

Unchanged by this fix:
- **#2** LM Studio refusing `qwen3.6-35b-a3b-ud-mlx` (resource guardrails) — affects E2E chat content but not the 404. Owner-side LM Studio fix needed for full conversational chat.
- **#3** Watchdog-Bot disconnected since 2026-05-15.
- **#4** Redundant `~/.hermes/hermes-agent/.venv/` artefact.
- **#5** `UV_PROJECT_ENVIRONMENT=venv` hazard for future `uv sync`.

— afm.
