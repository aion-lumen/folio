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

## Vierte Instanz — umgekehrtes Vorzeichen: FEHLENDER Guard (2026-07-09, 08b Schritt 2)
Nicht „falscher Guard" (Name statt Fähigkeit), sondern **fehlender Guard**: eine **Aktion mit
Datenwirkung** prüft nicht, ob ihr **Ziel existiert**.
- **`→ Übernommen`** (VerdictStage) = „Mail in Council ingestieren" → POST `/api/mail/override`
  (`overridden_actionability: 'uebernommen'`). Der Button rendert im Demo bei immo-Mails, obwohl
  Council dort **nicht registriert** ist (Aufgabe 4b) → **tote Aktion**: die UI verspricht eine
  Fähigkeit, die die Registrierung entzogen hat.
- **Fix (08b):** Aktion an dieselbe Bedingung wie Council koppeln. (i) **Server** (`/api/mail/override`)
  weist `'uebernommen'` mit 409 ab, wenn `!isCouncilRegistered()` — echte Capability-Entziehung, nicht
  nur Anzeige. (ii) **UI** (VerdictStage) rendert den Button nur bei `councilRegistered` (Flag aus der
  mail-queue-Load). Versteckter Button **plus** offene API wäre genau die Falle „angenommen statt
  geprüft".

**Gemeinsamer Nenner aller vier Instanzen:** *Fähigkeiten werden angenommen statt geprüft* — mal über
ein falsches Etikett (Name/Env), mal über eine fehlende Prüfung (Aktion ohne Ziel-Check).

### Council-Einstiegspunkt-Inventar (Scan 2026-07-09) — nicht nur die eine Stelle
- `/council`, `/council/mobile*` (Seiten): **404 im Demo** (Layout-Guard, 4b). ✓
- `/api/mail/override` (`uebernommen`): **jetzt geguarded** (Server 409 + Button-Hide). ✓
- `/api/council/object-by-feedback/[id]` (read): liefert im Demo `found:false` (Council-DB `null`) —
  harmlos, kein Leak. ✓
- **Offen/Follow-up:** die schreibenden `/api/council/*`-Routen (`ingest`, `[id]/{trigger,status,view,
  note}`, `me/rankings`) sind **nur** über die (im Demo 404) Council-Seiten erreichbar — im Demo-UI
  also nicht live —, aber auf **API-Ebene ungeguarded**. Empfehlung: gemeinsamer
  `isCouncilRegistered()`-Guard (bzw. ein `+server.ts`-Hook/Helper) über diese Routen — **08c**, wenn
  die Council-Registrierungs-API ohnehin gebaut wird. Hier nur als Inventar dokumentiert, nicht gefixt
  (Scope 08b = die eine live-erreichbare Aktion).

## Verifikations-Loch (4c, notiert)
Die Council-Pillen (ENTFERNUNG/QM²/PREIS, 4c) sind **visuell nicht belegbar**, weil im Demo
`active_rules.distance_threshold_km === null` ist (Korridor-Config im Demo nicht gesetzt) → die Pillen
rendern für **keine** Mail. Der 4c-Guard (`&& domain === 'immo'`) ist **code-verifiziert**; der
Demo-Zustand kann ihn nicht zeigen. Optionen: (a) Demo-Korridor-Config setzen (dann 4c auch visuell
belegt) — kleiner Demo-Daten-Zusatz; (b) als **offenen Punkt für 08c** vermerken. Für 08b reicht
Code-Verifikation.
