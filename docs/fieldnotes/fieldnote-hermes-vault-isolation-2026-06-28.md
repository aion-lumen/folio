# Field-Note: Hermes Vault-Isolation (Sicherheits-Blocker, 3 Ebenen) — 2026-06-28

**Direktive:** `direktive-hermes-vault-isolation-2026-06-28.md` (HOCH, Fix-vor-Demo-Deploy).
Realisiert Arbeitspaket 1 aus §7.4 des folio-strategie-handoff (Tool-Surface-Erzwingung pro Modul).
**Geändert:** folio (Ebene 1+3, committet) + Gateway `hermes-agent` (Ebene 2, vendored, lokal gepatcht). Kein Push.

## Problem
Hermes las bei aktivem **Demo**-Vault echte Inhalte aus dem **Privat**-Vault
(`~/Projects/life/_campaign/chapters/…`). Zwei Ursachen + eine UI-Lücke:
1. **Kein Vault-Jail im Gateway:** `tools/file_tools.py` gab absolute/`~`-Pfade
   ungeankert (`p.resolve()`) ohne Root-Prüfung zurück; read **und** write
   konnten jeden Home-Pfad treffen (nur `/proc` + Credential-Muster geblockt).
2. **Folio-Prompt zeigte auf Privates:** `client.ts buildSystemPrompt` hardcodete
   `~/Projects/life/`, nutzte `getVaultPath()` nicht.
3. **Setup-Wahl nicht durchgehalten:** `VAULT_PATH` gesetzt, aber Prompt + Tools
   ignorierten ihn; Pfad-Eingabe war ein fehleranfälliges Textfeld.

## Leitprinzip (Maßstab)
> Sicherheit durch **Capability-Entzug**, nicht durch Erkennung/Filterung.
Ebene 1+3 beheben das sichtbare Verhalten; **Ebene 2 (Gateway-Jail) ist das
Fundament** — echtes `relative_to(root)`-Jail, keine Blacklist.

## Ebene 1 — Folio-Prompt auf aktiven Vault
`client.ts`: `const vaultRoot = getVaultPath()`, alle `~/Projects/life/`-Pfade →
`${vaultRoot}`. Zusätzlich sendet `sendMessage` das Feld **`vault_root: getVaultPath()`**
im `/v1/responses`-Body → die Quelle des Roots für den Gateway-Jail.
*Verifiziert:* `grep -rn "Projects/life" src/` zeigt keinen hardcodierten
Privat-Pfad mehr in der Hermes-Surface; Type-Check 0 Errors.

## Ebene 2 — Gateway file_tools Vault-Jail (FUNDAMENT)
Kette **Folio → Gateway → Tool**:
- `api_server._handle_responses` liest `vault_root` (string-validiert) und reicht
  es an `_run_agent` durch.
- `_run_agent._run()` pinnt es **im Worker-Thread** via `set_session_cwd(vault_root)`
  (clear in `finally`). **Wichtig:** `loop.run_in_executor` kopiert die
  Contextvars des async-Handlers **nicht** in den Worker — der Pin MUSS im Thread
  passieren (spiegelt den bestehenden `/v1/runs`-Pfad). Das war das Kernrisiko.
- `runtime_cwd.session_cwd_override()` (neu, public) liefert den **explizit**
  gepinnten Root — **ohne** `TERMINAL_CWD`-Fallback, damit der Jail nur folio-
  Sessions greift und CLI/cron/Council unberührt bleiben.
- `file_tools._check_vault_jail()` erzwingt `resolved.relative_to(root)` für
  read/write/patch. `_resolve_path_for_task` ruft `.resolve()` → **Symlink-Escape**
  wird am realen Ziel gefangen. Absolute/`~`/`..` resolven durch denselben Pfad.
- **write-Härtung:** Der Guard sitzt **oben** in `write_file_tool` (vor dessen
  Resolver-Fallback, der eine im Resolver geworfene Ablehnung sonst schluckt und
  trotzdem schriebe). write ist nie laxer als read. Unauflösbarer Root →
  **fail-closed** (alles abgelehnt), nie fail-open.

### Verifikation (live, gegen den neu gestarteten Gateway)
- **16/16** Funktions- + Thread-Tests grün: legit innen erlaubt; absolut, `~`,
  `..`, **Symlink** für read **und** write abgelehnt; write außerhalb legt **keine**
  Datei an; kein Inhalt geleakt; Jail aus → unverändert (CLI/Council).
- **Thread-Propagation bewiesen:** Pin *im* Worker → Jail sichtbar; nur im Main
  gesetzt → im Worker **nicht** sichtbar (belegt, warum der In-Thread-Pin nötig ist).
- **Request-Level (echter `/v1/responses`, vault_root=Demo):** Hermes rief
  `read_file("/etc/passwd")` → Tool-Ergebnis *„Access denied … OUTSIDE the active
  vault (…/life-demo)"*. Ganze Kette Body→Thread→Contextvar→Tool greift.

### ⚠️ Verbleibende Lücke (eskaliert, NICHT Teil dieser Direktive)
Im Request-Test bot das Modell an, stattdessen das **Terminal-Tool** zu nutzen
(`cat /etc/passwd`). Der Jail deckt nur `file_tools` (read/write/patch) — **nicht**
Terminal/`execute_code`. Nach dem Leitprinzip ist das eine offene nach-außen-
Capability: über `cat`/Shell ließe sich der Vault weiterhin verlassen (lesen UND
schreiben). **Der Demo bleibt distributions-geblockt**, bis Terminal/Code für
folio-Sessions ebenfalls auf den Vault-Root gejailt oder abgeschaltet sind. →
Folge-Direktive empfohlen (gleiches `session_cwd`-Muster auf den Terminal-Tool
ziehen, oder Toolset für folio auf read/write/patch/list_files beschränken).

### Vendored-Fragilität (Re-Apply-/Upstream-Kandidat)
`file_tools.py` + `api_server.py` + `runtime_cwd.py` sind upstream git-tracked →
wie der `error_classifier`-Patch **fragil bei Hermes-Upgrade**. Der Patch liegt unter
`~/Projects/hermes-vault-jail-ebene2.patch` (Basis-Commit `928b4e74c`), appliziert
sauber via `git apply`. Sauberes `relative_to`-Jail wäre **PR-würdig upstream**.

## Ebene 3 — Setup-UI: Ordner-Browser + Wahl durchhalten
folio ist **reine Browser-SvelteKit-App** (adapter-node, kein Electron/Tauri);
die Browser-`showDirectoryPicker`-API liefert nur ein Sandbox-Handle, **keinen
Server-Pfad** — der Vault wird server-seitig (Node) gelesen. Lösung:
- **Server-Browse-Endpoint** `setup/browse/+server.ts` (read-only): listet
  Unterordner ab `$HOME`, markiert Vault-Ordner (`_campaign/campaign.md`).
- `setup/existing/+page.svelte`: Picker (Navigieren, „Vault"-Badge, „Diesen Ordner
  verwenden") + Textfeld als Fallback. Gewählter **absoluter** Pfad → bestehende
  `+server.ts`-Validierung/`VAULT_PATH`-Schreibung.
Die Setup-Wahl ist damit die einzige Root-Quelle für Prompt (Ebene 1) **und** Jail
(Ebene 2). Type-Check 0 Errors.

---

## EN (brief)
Hermes read the PRIVATE vault while the DEMO vault was active. Root causes: (1) no
vault jail in the gateway file tools (absolute/`~` paths resolved unanchored, read
AND write), (2) folio's prompt hardcoded the private path, (3) the setup choice
never reached the prompt/tools. Fix in 3 layers under the principle *remove the
capability, don't filter*: **(1)** folio prompt uses `getVaultPath()` and sends
`vault_root` on `/v1/responses`; **(2)** the gateway pins that root per request
**inside the worker thread** (`set_session_cwd`; `run_in_executor` doesn't copy
contextvars — mirrors the `/v1/runs` path) and `file_tools._check_vault_jail`
enforces `relative_to(root)` for read/write/patch, symlink-safe via `.resolve()`,
write-guard above the resolver-fallback so a denial can't be swallowed, fail-closed;
**(3)** a server-side directory browser replaces the text field (browser app → no
native dialog; FS Access API gives no server path). Verified live: 16/16 unit +
thread tests, plus a real request where the model's `read_file("/etc/passwd")` was
denied with "OUTSIDE the active vault". **Known gap (escalated):** the jail covers
file tools only — the model offered `cat /etc/passwd` via the TERMINAL tool, which
is not jailed; the demo stays distribution-blocked until terminal/code is jailed or
removed for folio sessions. Gateway code is vendored (upgrade-fragile) — patch at
`~/Projects/hermes-vault-jail-ebene2.patch` (base `928b4e74c`); upstream-PR-worthy.
