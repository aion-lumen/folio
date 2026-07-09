# Field-Note: Namens-/Env-Proxies als Fähigkeits-Guards (2026-07-09, 08b)

## Fehlerklasse
Ein **Name oder Env-String** wird als **Stellvertreter (Proxy) für eine Fähigkeit** benutzt. Sobald
sich der Name/das Env-Verhalten ändert, bricht die Fähigkeit **still** — kein Fehler, nur „weg".
Der Guard prüft das Etikett, nicht die tatsächliche Bedingung.

## Drei beobachtete Instanzen (gleiche Wurzel)
1. **`getFeedbackDbPath()` — `kitEnv().FEEDBACK_DB_PATH` als Proxy für „aktueller Mail-Store".**
   `$env/dynamic/private` propagiert den `demo-server.sh`-Export nicht → Demo las die **echte**
   feedback.db. Fix (Aufgabe 1): Store aus dem **aktiven Vault** ableiten (active-vault.json), nicht
   aus dem fragilen Env-String. Gleiche kitEnv-Klasse traf auch `getFolioDbPath` / `getCouncilDbPath`.
2. **`getCouncilDbPath()` — dieselbe kitEnv-Klasse + `council-demo.db`-Annahme.**
   Fix (Aufgabe 4): Council hängt am Vault; Demo registriert Council strukturell nicht (`null`).
3. **`isYahoo = row.account === 'yahoo'` — Account-**Name** als Proxy für „re-klassifizierbare
   feedback-Row".** Aufgabe-1.4-Maskierung (account → `konto-a/konto-b`) ⇒ `isYahoo` immer false ⇒
   der „MEIN URTEIL/Meine Stimme"-Block (`VerdictStage`) verschwand im Demo (auch bei immo).
   Fix (08b): `canReclassify(row)` = `!row.isMock && numerische feedback_id` (`util/reclassify.ts`) —
   die **echte** Fähigkeit, kein zweiter Name.

## Lehre / Prüf-Heuristik
- **Guard auf die Fähigkeit, nicht auf ein Etikett.** „Existiert eine echte feedback-Row?" statt
  „heißt der Account 'yahoo'?"; „welchen Store registriert der aktive Vault?" statt „was steht im
  Env?".
- **Namens-Ersatz durch Namens-Ersatz ist kein Fix** (`account.startsWith('konto')` wäre der nächste
  stille Bruch beim nächsten Account-Namen).
- **Robuster Auflösungs-Mechanismus** wie `getVaultPath()` (liest active-vault.json zuerst, Env nur als
  letzter Fallback) ist das Vorbild — env-unabhängig.

## Scan-Ergebnis (2026-07-09, folio `src/`)
- Weitere **Account-Name-Capability-Guards**: **keine** (nur `isYahoo`, jetzt gefixt). Übrige
  `account === '…'`-Treffer sind Filter-Werte (`filters.account === 'all'`), Mock-Daten-Farben
  (`mail-mock.ts`) und CSS-Klassen-Bindings (`ScopePills`/`ScopeDropdown`) — keine Fähigkeits-Gates.
- **Vault-Name-Proxies in Guards**: **keine**.
- **kitEnv-only Store-Getter** (feedback/folio/council/inbox): die in Aufgabe 1/4 bereits robust
  gemachten Instanzen; die restlichen kitEnv-Getter sind Config-Pfade (nicht demo-gescopte Stores),
  daher geringeres Risiko derselben Klasse.
