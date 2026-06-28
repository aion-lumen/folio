# Field-Note: Vault-Chat-History-Leak (entgiften + vault-binden) — 2026-06-28

**Direktive:** `direktive-vault-chat-history-leak-2026-06-28.md` (HOCH, gravierendster
Demo-Blocker). **Geändert:** folio (Ebene B, committet) + `~/.hermes/response_store.db`
(Ebene A, Daten-Op, von Afshin ausgeführt). Kein Push.

## Problem (der vierte Kanal)
Frische Demo-Session lieferte private Vault-Inhalte (RAV/Wohnungsverkauf) **ohne
read_file-Tool-Call**, auch nach Neustart. Quelle = die **persistente Gateway-
Konversation** `folio-vault-chat` in `response_store.db`: Folio sendet einen
**festen** conversation-Namen + `store:true`; der Gateway spielt die gespeicherte
`conversation_history` zurück (~2,2 MB, 380 Messages, 2308× `Projects/life/` vs.
21× `life-demo` — aufgebaut VOR Jail/Ebene-1). „Neuer Chat" im UI setzte den
Gateway-Pointer nie zurück.

**Warum die drei bisherigen Schichten nicht griffen:** Jail (file_tools),
Toolset-Entzug und Ebene-1 (Prompt) sitzen an anderer Stelle. Hier kam nichts aus
Datei/Tool/Prompt — der private Inhalt war bereits als **zurückgespielte History**
im Kontext. Ein vierter, unabhängiger Kanal.

## Ebene A — Entgiften (Daten-Op auf response_store.db)
Backup-first, präziser Scope (kein pauschales Leeren):
- Backup `response_store.db.bak-2026-06-28` (außerhalb Git; wie PII → nach Verifikation löschen).
- `DELETE FROM responses WHERE data LIKE '%Projects/life/%'` (29 Privat-Rows: 1 aktiv
  + 28 verwaiste Snapshots; `%Projects/life/%` trifft den echten Vault, **nicht**
  `life-demo`) + `DELETE FROM conversations WHERE name='folio-vault-chat'`.
- **Verifiziert:** Privat-Rows 29 → **0**; RAV/Wohnungsverkauf-Rows **0**; die drei
  `verify-*`-Testkonversationen intakt (71 Rows verbleiben). Keine Council/CLI im Store.
- CC ist am `~/.hermes`-Schreibzugriff permission-geblockt → Afshin führte die
  vorbereiteten Befehle aus, CC verifizierte read-only.

## Ebene B — Vault-gebundene, rücksetzbare Identität (Folio-only, KEIN Gateway-Code)
Der conversation-Name ist client-seitig (Folio wählt ihn, der Gateway keyed darauf)
→ kein vendored Patch nötig.
- `client.ts`: `vaultConversationName()` = `folio-vault-${sha256(getVaultPath())[:12]}`
  statt fix `'folio-vault-chat'`. Demo- und Privat-Vault → **getrennte** Identitäten,
  teilen nie History. `resetConversation()` exportiert (löscht den vault-gebundenen
  Pointer via vorhandenes `clearHermesConversationPointer`).
- `POST /api/hermes/reset` → `resetConversation()`.
- `chat.svelte.ts` `newChat()` = Pointer-Reset (Server) **+** lokales `clear()`.
  Der Header-Button rief vorher nur `clear()` (nur lokales UI) — genau die Falle, die
  den Gateway-Thread weiterwachsen ließ; jetzt `newChat()`.

## Verifikation
- **Ebene A:** 29 → 0 Privat-Rows; `verify-*` intakt (siehe oben).
- **Ebene B / E2E** (gegen laufenden Gateway): frische vault-gebundene Demo-Konversation
  `folio-vault-93eb01ed7673` (existierte nicht → frisch), `vault_root`=Demo, Frage
  „offene Fäden Kapitel 1" → **0 Privat-Marker**; 3× `read_file` auf das **Demo**-Kapitel
  (Jail erlaubt); Antwort rein Demo (Portugiesisch B1, Notgroschen 9.200/15.000 EUR) —
  kein RAV/Wohnungsverkauf. Der ursprüngliche „Inhalt-ohne-Tool-Call"-Effekt ist weg.
- **Nebeneffekt:** die Konversation wächst nicht mehr unbegrenzt → behebt die
  2,2-MB-/~57s-Dauerkompression an der Wurzel.

## Restschritte (Afshin)
- Folio-Dev neu starten, damit die laufende Instanz Ebene B (vault-gebundener Name)
  nutzt.
- DB-Backup nach grünem Test löschen: `rm ~/.hermes/response_store.db.bak-2026-06-28`.

---

## EN (brief)
A fresh demo session returned private vault content (RAV/Wohnungsverkauf) **without a
read_file call**, even after restart. Source: the persistent gateway conversation
`folio-vault-chat` in `response_store.db` — folio sent a **fixed** conversation name +
`store:true`, so the gateway replayed ~2.2 MB of stored history (380 msgs, overwhelmingly
from the real vault, built before the jail/level-1 fixes); the UI "new chat" never reset
the gateway pointer. This is a **fourth channel** (replayed history) that the jail,
toolset removal, and prompt fix don't cover. **Level A (detox):** backup-first, precise
`DELETE` of the 29 private rows (`data LIKE '%Projects/life/%'`, which excludes
`life-demo`) + the folio pointer — 29 → 0, `verify-*` kept; backup handled like PII.
Run by Afshin (CC is permission-blocked on `~/.hermes`). **Level B (root, folio-only,
no gateway code):** conversation name derived from the active `VAULT_PATH`
(`folio-vault-${sha256(path)[:12]}`) so demo and private never share history;
`resetConversation()` + `POST /api/hermes/reset` + store `newChat()` + the header button
now reset the gateway pointer (it previously cleared only the local UI — the trap).
Verified: detox 29→0; E2E fresh demo conversation reads only the demo chapter (3
read_file calls) and returns demo-only content with 0 private markers. Side benefit: the
conversation no longer grows unbounded (fixes the 2.2 MB / ~57 s compression). Remaining:
restart folio dev to load level B; delete the DB backup after the green test.
