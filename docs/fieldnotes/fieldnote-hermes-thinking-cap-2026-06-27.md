# Field-Note: Hermes Output-/Thinking-Cap (2026-06-27)

**Direktive:** `direktive-thinking-cap-2026-06-27.md` (Root-Cause vor Streaming).
**Geändert:** Gateway-Config `~/.hermes/config.yaml` (lokal, untracked). Kein Push.

## Befund
Qwen3.6-35B (MLX, lokal) erzeugte für eine **349-Zeichen-Antwort 40.991
Output-Tokens** (Thinking) → **754s / 12,5 min**, ein einziger Call,
`finish_reason=stop` (natürlich), `tool_turns=0`. Normale Turns im Log: **36–361**
Output-Tokens, 3–25s. Verteilung bimodal — der Marathon war die Wurzel, kein
Timeout-Wert löst das (das Problem ist die Token-Explosion, nicht die Wartezeit).

Ursache: der Gateway sendete **gar kein `max_tokens`** an LM Studio
(Request-Dump bestätigt) → Output unbegrenzt.

## Fix
`~/.hermes/config.yaml` → `model: max_tokens: 4096`. Der Gateway liest
`model.max_tokens` bereits (`agent_init.py`) und reicht es an LM Studio durch;
es war nur nie gesetzt. **Eine Config-Zeile, kein Source-Patch** (config.yaml ist
untracked → upgrade-safe).

**Warum 4096:** ~11× über dem größten normalen Turn (361) → großzügiger Puffer,
schneidet legitimes Denken nicht ab; ~10× unter dem 41k-Marathon. Decode ~54 tok/s
→ ein voll ausgeschöpfter Call ~76s (gedeckelt, statt 754s).

**qwen3.6 hat KEIN separates Thinking-Budget** (kein `/think`-Soft-Switch, kein
reasoning-token-limit). Thinking zählt zum Output; nur `max_tokens` begrenzt es,
ohne Thinking ganz abzuschalten (`enable_thinking:false` würde Qualität kosten).
→ `max_tokens` ist die einzige passende Stellschraube.

## Wichtig: der Cap ist per-Call (+ Auto-Continuation)
Hermes setzt bei `finish_reason=length` automatisch fort (bis ~3 Continuation-
Versuche), dann Abbruch mit Hinweis. Heißt:
- **Normale/schwere Antworten** enden natürlich **unter** dem Cap (ein Call,
  `finish_reason=stop`, vollständig). Beispiel verifiziert: denk-intensiver Prompt
  → out=**1675**, `stop`, 5710-Zeichen-Antwort vollständig, **29,8s**.
- **Legitim lange** Antworten (>4096) werden via Continuation fortgesetzt
  (gestückelt), nicht hart abgeschnitten.
- **Pathologische** Explosionen (41k) sind effektiv auf ~Cap×(1+3) ≈ 16k gebunden
  statt unbegrenzt.

## Verifikation
- Cap geladen, Gateway neu gestartet (error_classifier-Patch bleibt aktiv).
- Durchsetzung bewiesen: Cap=64 (temporär) → Turn lief in die Decke, Gateway
  continued 3× → „Response remained truncated after 3 continuation attempts".
  Danach auf 4096 zurückgesetzt.
- Keine Truncation echter Antworten bei 4096 (1675-Token-Antwort `stop`/vollständig).

## Hinweise
- Globaler Default → gilt auch für andere Default-Modell-Agents (Council/
  Validatoren); 4096 großzügig, geringes Truncation-Risiko. Braucht ein Profil
  mehr, setzt es ein eigenes `max_tokens`.
- Anschluss: die saubere Timeout-Lösung (folio-Chat streamen + Idle-Timeout)
  kommt separat (Streaming-Direktive) — danach sind auch Continuation-lange Turns
  UI-seitig entspannt.

---

## EN (brief)
Qwen3.6 produced **40,991 output tokens (754s) for a 349-char answer** because the
gateway sent **no `max_tokens`**. Fix: set `model.max_tokens: 4096` in
`~/.hermes/config.yaml` (the gateway already reads it; untracked → upgrade-safe).
qwen3.6 has no separate thinking budget, so `max_tokens` is the only knob that
bounds thinking without disabling it. The cap is **per-call** and Hermes
auto-continues on `finish_reason=length` (~3×), so: normal/heavy answers finish
naturally under the cap in one clean call (verified: a heavy prompt → 1675 tokens,
`stop`, complete, 30s); legitimately long answers continue in chunks; pathological
explosions are bounded to ~4× the cap instead of unbounded. Enforcement proven via
a temporary cap=64. Proper UI timeout fix (streaming) follows separately.
