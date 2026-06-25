# Field-Note: Hermes/LM-Studio Reload-Loop — Fix (2026-06-25)

**Direktive:** Fix-Direktive Reload-Loop (Release-Blocker). Diagnose vorab.
**Status:** Code-Fixes umgesetzt (#2–#4), #1 ist ein manueller LM-Studio-Schritt.
Lokale Commits, kein Push/Deploy ohne Freigabe.

## Was die Schleife auslöste
Folio-Chat startete **zwei überlappende Agent-Loops** auf derselben Session →
zwei parallele Streams zum Gateway → Modell-**Eject** → die Streams scheiterten
mit `Model unloaded` → der Gateway behandelte das als **retrybaren** Fehler und
re-feuerte die Completion → LM Studio **JIT** lud das Modell neu → Dauer-
Generierung + Token-Burn bis manueller Gateway-Neustart.

## Die vier Ebenen, die das jetzt brechen

**#1 — LM Studio „Just-In-Time Model Loading" AUS (MANUELL, Pflicht).**
Server-Settings → „Just-In-Time Model Loading" deaktivieren
(`~/.lmstudio/.internal/http-server-config.json`: `justInTimeModelLoading:false`).
**Begründung:** Ohne JIT-aus lädt *jede* eingehende Completion ein ejected
Modell sofort wieder — die Reload-Schleife bleibt strukturell möglich. Dieser
Schritt ist **nicht** per CLI machbar und gehört ins Setup jeder Maschine.

**#2 — Gateway: „Model unloaded" ist nicht retrybar.**
`hermes-agent` `agent/error_classifier.py`: die LM-Studio-Strings
(`model unloaded` / `no model loaded` / …) zu `_MODEL_NOT_FOUND_PATTERNS`
ergänzt → klassifiziert als `model_not_found`, `retryable=False`. Ein sauberer
Fehler statt Retry-Storm. Transiente Netzfehler bleiben retrybar.
*(Branch `fix/model-unloaded-nonretryable`; Upstream NousResearch v0.16.0,
detached HEAD → nach einem Hermes-Upgrade neu applizieren.)*

**#3 — Folio: kein Doppel-Loop pro Session.**
`src/routes/api/hermes/chat/+server.ts`: Modul-weiter In-Flight-Guard. Läuft
schon ein Chat-Request → ein 2. paralleler POST wird mit **409** sauber
abgewiesen (kein paralleler Stream). Freigabe in `finally` + `cancel`. Der
Client (`chat.svelte.ts`) prüft jetzt `res.ok` und zeigt die Meldung.

**#4 — Folio: Härtung.**
`HERMES_API_URL` `localhost` → **`127.0.0.1`** (`.env` + Default in `env.ts`):
das Gateway bindet IPv4-only, `localhost`→`::1` gab intermittierend
`ECONNREFUSED` / „fetch failed". `client.ts`: beide Gateway-Fetches in
`hermesFetch()` mit **AbortController-Timeout (30 s)** + saubere Fehlermeldung
statt rohem „fetch failed".

## Verifikation
- **#2 unit:** `classify_api_error("Model unloaded")` → `retryable=False`;
  transienter Fehler („connection reset") → `retryable=True`. Gateway mit Patch
  neu gestartet (läuft).
- **#3/#4:** `svelte-check` 0 Errors; Gateway via `127.0.0.1:8642/health` ok.
- **Offen — End-to-End-Acceptance (nach #1 von Afshin):** JIT aus → Modell
  ejecten → im Folio-Chat schreiben → **EIN** sauberer Fehler, **kein** Reload,
  kein Burn, Modell bleibt ejected. Plus: 2 schnelle Nachrichten → nur ein
  aktiver Stream (2. → 409). (Bewusst nicht live getrieben, solange JIT an ist.)

---

## EN (brief)
Two overlapping Folio chat loops → parallel gateway streams → model eject →
`Model unloaded` treated as retryable → gateway re-fired → LM Studio JIT
reloaded the model → token-burn loop. Four layers now break it: **#1** disable
LM Studio Just-In-Time Model Loading (manual, mandatory); **#2** gateway
classifies "model unloaded" as non-retryable; **#3** Folio rejects a 2nd
concurrent chat request per session (409); **#4** 127.0.0.1 instead of
localhost + a 30 s fetch timeout with clean errors. Final end-to-end acceptance
(eject → one error, no reload) is to be run after #1 is set.
