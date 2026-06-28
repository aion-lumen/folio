# Field-Note: Folio-Chat Streaming + Idle-Timeout (2026-06-28)

**Direktive:** `direktive-folio-streaming-idle-timeout-2026-06-27.md` (strukturell,
nach Thinking-Cap). folio-only. Kein Push.

## Problem
folios Hermes-Call war **gepuffert** (`await response.json()`) + fester **30s-Timeout**
→ das UI blieb bis Generierungsende leer, und gesunde lange Turns brachen ab.
Akuter Auslöser (Diagnose): bei großer Konversation macht der Gateway **~57–67s
Preflight-Kontext-Kompression** (keine Tokens) VOR der Completion → folio brach
bei 30s ab, obwohl LM Studio sauber arbeitete. Selbst „hallo" timeoutete.

## Fix
**Streaming + Idle-Timeout** (ersetzt den festen 30s-Timeout).

- `client.ts`: `sendMessage` ist jetzt ein **async-Generator**, der `/v1/responses`
  mit `stream: true` öffnet, die OpenAI-Responses-SSE liest und Events
  **inkrementell yielded** (`response.output_text.delta` → Text, `output_item.done`
  function_call/output → tool_call/tool_result, `response.failed` → error). Der
  buffernde `parseHermesOutput`/`response.json()` ist weg.
- **Idle-Timeout 45s** statt 30s-Gesamt: ein Timer, der bei **jedem** empfangenen
  Chunk resettet — Daten-Event **oder** das gateway-seitige `: keepalive` (alle
  30s, auch während Kompression). Erst 45s **ganz ohne Bytes** (kein Token, kein
  Keepalive = echter Hänger) → Abbruch mit einer sauberen Meldung.
- `+server.ts`: `for await (const event of sendMessage(...))` → enqueued jedes
  Event sofort (progressives UI). In-Flight-Guard unverändert; bei Client-Disconnect
  (`cancel`) wird zusätzlich der Gateway-Stream via AbortSignal abgebrochen.
- UI/Store: **unverändert** — `chat.svelte.ts` merged Text-Deltas schon inkrementell.

## Warum 45s
Keepalive-Kadenz 30s → 45s = 1,5× Marge. Bridges die 57–67s-Kompression
(Keepalives resetten den Timer). Ein echter Stillstand (Gateway/Modell tot → gar
keine Bytes) greift in 45s — **schärfer** als der alte 30s-Gesamt-Timeout, der
gesunde Turns kappte.

## Drei Schutzschichten (Zusammenspiel)
1. Reload-Loop-Classifier (Gateway retryt „model unloaded" nicht) — erste Linie.
2. In-Flight-Guard (kein 2. Parallel-Stream pro Session) — 409.
3. **Idle-Timeout** (ersetzt den festen 30s) — fängt Stillstand, ohne lange Turns zu kappen.

## Verifikation (28.06., gegen den laufenden Gateway)
- **Gateway streamt** `stream:true` → progressive `response.output_text.delta`.
- **Folio streamt progressiv:** Antwort kommt als einzelne Delta-Frames statt Block.
- **Lange Turns überbrückt:** Turn mit **~57s Kompression** (187k→6 msgs) lief
  durch — kein Abbruch, Antwort streamte danach progressiv (`POST 200, 6139 bytes`).
- **In-Flight-Guard:** 2 parallele POSTs → 2. = 409; danach Session frei (200).
- **Abort-on-Disconnect:** Client-Abbruch → Gateway loggt `interrupted_by_user`.

## Beobachtung (separat)
Die Konversation `folio-vault-chat` ist stark angewachsen (~187k Tokens) →
Kompression feuert ~57s pro Turn. Das Streaming macht das **tolerierbar** (kein
Abbruch, progressive Antwort), aber jeder Turn zahlt den Kompressions-Zoll. Eine
eigene Maßnahme (Konversation zurücksetzen/trimmen oder Kompressions-Kosten senken)
wäre sinnvoll — nicht Teil dieser Direktive.

---

## EN (brief)
folio's chat was buffered (`response.json()`) + a fixed 30s timeout, so the UI was
empty until the end and healthy long turns aborted — notably the gateway's ~57–67s
preflight context compression (no tokens) tripped the 30s timeout. Fix: `sendMessage`
is now an async generator consuming `/v1/responses` with `stream:true`, yielding
events incrementally; the fixed 30s timeout is replaced by a **45s idle-timeout**
reset on every chunk including the gateway's `: keepalive` (every 30s), so
compression and long generation stream through while a true stall (no bytes at all)
is caught in 45s. `+server.ts` uses `for await` + aborts the gateway stream on
client disconnect; in-flight guard unchanged; UI already incremental. Verified: a
turn with ~57s compression streamed through without aborting; progressive deltas;
409 on concurrent; `interrupted_by_user` on disconnect. Note: the `folio-vault-chat`
conversation is very large (~187k tokens) → compression every turn; streaming makes
it tolerable but a reset/trim is worth a separate step.
