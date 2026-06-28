# Field-Note: Folio-Toolset beschränken — Terminal-Capability entziehen (2026-06-28)

**Direktive:** `direktive-folio-toolset-beschraenken-2026-06-28.md` (HOCH, letzter
Teil des Vault-Isolations-Demo-Blockers). Folge auf
[fieldnote-hermes-vault-isolation](./fieldnote-hermes-vault-isolation-2026-06-28.md).
**Geändert:** folio (Prompt, committet) + Gateway `hermes-agent` (vendored, lokal
gepatcht). Kein Push.

## Problem
Der file_tools-Vault-Jail (Ebene 2) greift — read/write außerhalb des Vaults wird
abgelehnt. ABER im Live-Test bot das Modell an, stattdessen das **Terminal-Tool**
zu nutzen (`cat /etc/passwd`). `terminal`/`execute_code` (+ web/browser/send_message/
cronjob/delegate_task/…) waren nicht gejailt → über die Shell weiterhin Lesen UND
Schreiben außerhalb des Vaults möglich. Solange offen → Demo distributions-geblockt.

## Leitprinzip (§7.4)
> Sicherheit durch Capability-**ENTZUG**, nicht Filterung.

→ Terminal/Code für Folio-Sessions **gar nicht registrieren** (entziehen), statt die
Shell zu jailen (Katz-und-Maus mit `..`/Pipes/Subshells). Ein nicht registriertes
Tool kann nicht ausgeführt werden — die Zonengrenze ist technisch erzwungen.
**`terminal.cwd` reicht nicht:** es setzt nur das Start-Verzeichnis, ohne `cd ..`/
absolute Pfade zu verhindern (kein chroot/seccomp) — daher Entzug statt cwd.

## Lösung — Whitelist (default-deny), nicht Blacklist
Eine Blacklist (`disabled_toolsets`) müsste jedes nach-außen-Tool aufzählen und
übersähe künftige. Eine Whitelist ist das echte Capability-Entzug-Fundament.

- **Gateway A** (`toolsets.py`): neues Toolset
  `"folio" = {read_file, write_file, patch, search_files}`.
- **Gateway B** (`gateway/platforms/api_server.py` `_create_agent`): vor dem
  `AIAgent(...)`-Aufruf — `if session_cwd_override(): enabled_toolsets = ["folio"]`.
  Diskriminator = **derselbe** per-Session-Vault-Pin wie beim Jail (folio sendet
  `vault_root` → Gateway pinnt via `set_session_cwd` im Worker-Thread, **vor**
  `_create_agent`). Eine Quelle für Jail UND Toolset-Grenze → kann nicht driften.
  CLI/Council/andere api_server-Requests (kein Pin) behalten das volle Toolset.
- **Folio C** (`client.ts`): casual Prompt-Namen auf die echten Schema-Namen
  ausgerichtet — `file_read→read_file`, `file_write→write_file`,
  `list_files→search_files` (ein `list_files`-Tool existiert gar nicht). Damit Prompt
  und Whitelist exakt übereinstimmen.

## Verifikation
- `enabled_toolsets=["folio"]` resolved (Default-Args) zu **exakt**
  `{read_file, write_file, patch, search_files}` — **kein** terminal/execute_code,
  **kein** `tool_search`-Meta-Tool (das Tools nachladen könnte → kein Bypass),
  kein Zwangstool. Kontrast `["all"]` enthält terminal+execute_code (Beweis: Default
  ist ungejailt, die Whitelist entzieht real).
- folio Type-Check 0 Errors; keine casual-Namen mehr im Prompt.
- Gateway-Diff (2 Dateien, +24 Z.) appliziert sauber auf Live (`git apply --check`).
- **Live verifiziert (Gateway PID 53132, Patch committet 1ab43dd9c):** echter
  `/v1/responses`-Request mit `vault_root`=Demo, der zur Shell drängt → das Modell
  löste **0** terminal/execute_code-Calls aus und antwortete *„I don't have a
  terminal/shell tool available in my current toolset — only read_file, write_file,
  and patch."* Sein Ausweich-`read_file("/etc/passwd")` wurde vom Jail abgelehnt
  (sandboxed to active vault); **kein** `/etc/passwd`-Inhalt geleakt. → weder via
  Terminal (entzogen) noch via file_tools (Jail) erreichbar.
- **CLI/Council unverändert** (by construction): die Beschränkung greift nur im
  `if session_cwd_override()`-Zweig; ohne gepinnten Vault-Root bleibt
  `enabled_toolsets` der volle api_server-Satz (inkl. terminal/execute_code).

## Vendored-Fragilität + Persistenz
`toolsets.py` + `api_server.py` sind upstream git-tracked → fragil bei Hermes-Upgrade.
Patch: `~/Projects/hermes-folio-toolset.patch` (Basis-Commit `683f0e9f1`). Dieser
Toolset-Patch **und** der Ebene-2-Jail sind im Live-Checkout noch **uncommittet**
(CC dort permission-geblockt) → Afshin committet beide; Upstream-PR-Kandidaten.

## Demo-Blocker-Status
Mit Vault-Jail (Ebene 2) **und** Toolset-Beschränkung sind die nach-außen-
Capabilities für Folio-Sessions geschlossen → der Vault-Isolations-Blocker ist nach
Live-Apply+E2E erledigt. Verbleibende Distributions-Blocker separat: PII (erledigt),
Reload-Loop (erledigt), CDN-Fonts (offen, eigene Direktive).

---

## EN (brief)
The file-tool vault jail held, but the model offered to use the TERMINAL tool
(`cat /etc/passwd`) — terminal/execute_code/web/etc. were not jailed, so the shell
bypassed the file jail. Per the principle *remove the capability, don't filter*,
folio sessions now get a **whitelist** toolset (capability removal, not a fragile
blacklist): a new `folio` toolset = {read_file, write_file, patch, search_files};
`api_server._create_agent` selects it when a session vault root is pinned
(`session_cwd_override()` — the same per-request signal as the jail), so terminal/
execute_code are simply never registered for the session. CLI/Council keep the full
toolset. `terminal.cwd` only sets a start dir (no containment), so removal — not cwd
— is the fix. The folio prompt's casual tool names were aligned to the real schema
names (`list_files` didn't exist → `search_files`). Verified: `enabled_toolsets=
["folio"]` resolves to exactly the 4 tools with no terminal/execute_code and no
tool-search meta-tool; live request-level test pending live-apply. Gateway code is
vendored (upgrade-fragile) — patch at `~/Projects/hermes-folio-toolset.patch` (base
`683f0e9f1`); both this and the jail are uncommitted in live (Afshin commits);
upstream-PR-worthy. With jail + toolset restriction, folio's outward capabilities
are closed — the vault-isolation demo blocker is resolved after live-apply + e2e.
