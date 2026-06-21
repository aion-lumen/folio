# Field-Note — Bauteil 2.7: UI-Bug-Sammlung (2026-06-08)

**Quelle:** `direktive-bauteil-2-7-ui-bugs-2026-06-08.md`.
**Anlass:** Drei isolierte UI-Bugs aus dem 30er-Test der UI-Pipeline-
Ansicht + toter `/kampagne`-Link aus deren CampaignTrack-TODO. Alle
klein, alle UX-kritisch, alle strukturell unabhängig von der
Pipeline-Substanz.
**Status:** Implementierung fertig, svelte-check 0 Errors. B1+B2+B3
+B3-fix+B3-ui-fix live verifiziert, B4–B8 noch Live-Test ausstehend.

---

## Branch + Commits

`folio/feature/bauteil-2-7-ui-bugs-2026-06-08`:

| Commit | Aufgabe | Inhalt |
|---|---|---|
| `4747205` | B1 | Übernommen-Button {#if currentDomain === 'immo'}-Guard |
| `e8c65da` | B2 | Toast „→ Übernommen" 2s nach erfolgreichem POST |
| `9049eea` | B3 | Reader latest-wins über Override + Correction |
| `f956c3c` | B3-fix | Timestamp-Format-Normalisierung (parseTs) |
| `ba7ae81` | B3-ui-fix | Display-Schicht latest-wins (3 Stellen) |
| `cd085cf` | B4 | init.ts hauskauf_workflow Schema-Drift |
| `2e781d3` | B5 | POST /api/kampagne + insertHauskaufWorkflow |
| `55dfde2` | B6 | /kampagne Route Loader + 3-Spalten-Skelett |
| `59f69fe` | B7 | KampagneCard mit Inline-Form |
| `7811087` | B8 | CampaignTrack-Link reaktiviert |

---

## Aufgabe 2 — Übernommen-Button (B1+B2)

**Bug:** Salt-System-Mail im 30er-Test wurde fälschlich auf „übernommen"
gesetzt — Button war bedingungslos sichtbar. Klick-Feedback war stilles
`invalidateAll()`, User wusste nicht ob es wirkte.

**Fix:**
- B1 `VerdictStage.svelte:196-205`: `{#if currentDomain === 'immo'}`
  um Button. Domain via `currentDomain`-Derived bereits verfügbar.
- B2 `pickUebernommen()`: `toastStore.show('→ Übernommen', 2000)`
  nach erfolgreichem POST.

**Architekt-Entscheidung übernommen:** Bei Disagreement (4 Stimmen
uneinig) bleibt der Button sichtbar — manueller Override-Sinn.

---

## Aufgabe 3 — Reader-Bug (B3 + 2 Folge-Fixes)

**Symptom:** Mail per „→ Übernommen" → Übernommen-Tab. Danach „A" für
Archiv-stumm → bleibt fälschlich im Übernommen-Tab sichtbar.

### B3 — Reader-Merge umgestellt

**Bug-Mechanik:** `+page.server.ts:75-77` hatte fixe Priorität
`override ?? correction ?? time-decay`. Override-Eintrag konnte nie
von neuerer Correction überschrieben werden.

**Fix:** Timestamp-Vergleich. Bei Equal-Tie wins Override (explizite
Aktion vor Korrektur). Correction ohne `corrected_actionability`
(z.B. nur Domain) fällt durch zur Override-Wahl.

### B3-fix — Timestamp-Format-Mismatch

**Bug nach erstem User-Test:** „Übernommen → Archive funktioniert,
Archive → Übernommen NICHT". Wurzel: Format-Mismatch zwischen den
zwei Tabellen.

- `mail_actionability_override.recorded_at` = SQLite-Standard
  `'2026-06-08 04:49:36'` (Space-Separator)
- `corrections.corrected_at` = ISO `'2026-06-08T04:48:15.701Z'`
  (mit T und Z)

String-Vergleich: `'T'`(84) > `' '`(32) → Correction wurde IMMER als
„neuer" gewertet, egal welche tatsächliche Uhrzeit. Verifiziert mit
Live-Werten Mail 638: Override 04:49:36, Correction 04:48:15 →
String-Vergleich liefert false, parseTs liefert true.

**Fix:** `parseTs(s)` normalisiert beide Formate auf Date-Millis.
SQLite-Format wird zu `T...Z` umgeschrieben (beide sind UTC, daher
identisch parsbar).

### B3-ui-fix — Display-Schicht

**Bug nach zweitem User-Test:** Reader-latest-wins arbeitet
korrekt (Mail 638 erscheint im Übernommen-Tab), aber Detail-Panel
markiert sie weiter als „Archive". Drei UI-Stellen lasen
`correction.corrected_actionability` mit fixer Priorität vor
`effective_actionability`:

- `MailList.svelte:151` (Icon-Pill in der Liste)
- `VerdictStage.svelte:48` (Button-Highlight + Stumm-Grund-Chips)
- `DetailPanel.svelte:204` (A-Tastatur-Toggle-Resolver)

**Fix:** Alle drei umgestellt auf `effective_actionability first`
(Reader-Wahrheit), `correction.corrected_actionability` nur noch
Fallback. `corrected_domain` bleibt unverändert (anderer Pfad).

### Architektur-Lektion

Reader-Schicht und Display-Schicht müssen die gleiche Priorisierungs-
Logik haben. Sonst zeigt der Tab-Filter A und das Detail-Panel B —
visuelle Verwirrung. Bei künftigen latest-wins-Refactors auch immer
die UI-Anzeige-Stellen mit-suchen.

---

## Aufgabe 1 — /kampagne-Route (B4–B8)

### B4 — Schema-Drift in init.ts

Bauteil 2 (commit `7b0182a`) hat die Live-DB auf Append-only migriert
(`recorded_at`, `notes`, kein UNIQUE), aber `init.ts:115-134` blieb
beim alten UPDATE-in-place-Schema. `CREATE TABLE IF NOT EXISTS`
triggert nicht neu — Drift war unsichtbar bis eine frische DB
angelegt wurde (dann hätte der Reader „no such column: recorded_at"
geworfen).

Plus Dead-Code-Befund: `writer.ts:239` `updateHauskaufWorkflowStatus`
macht `SET updated_at = ...` — würde crashen bei Aufruf. Kein Caller.
Deprecation-Kommentar dran, eigene Folge-Direktive zum Aufräumen.

**Verifikation:** `.schema`-Diff byte-identisch (bis auf
`CREATE TABLE` vs `CREATE TABLE IF NOT EXISTS` und Index-Klausel).

### B5 — POST /api/kampagne

Neuer Endpoint analog `/api/mail/override`. Body:
`{ council_object_id, status, termin?, verhandlungspreis?, notes? }`.
Validiert Status-Enum + Nebenfeld-Voraussetzungen
(`terminiert→termin`, `besichtigt→verhandlungspreis`) explizit, statt
nur SQLITE_CONSTRAINT durchzureichen. Auth via `locals.user`
(Owner-Gate aus Hooks).

Writer-Funktion `insertHauskaufWorkflow` als Append-only-Insert
(analog `insertMailActionabilityOverride`).

### B6 — Route + Loader

`src/routes/(mail)/kampagne/` erbt Owner-Gate aus
`(mail)/+layout.server.ts`. Loader: `listAllHauskaufWorkflow` →
pro Workflow das Council-Object → Mail-Brücken-Links via
`from_feedback_ids` aus `council.objects` → Batch-Lookup via
`getFeedbackBriefsByIds`. Page: 3-Spalten-Kanban
(Offen/Terminiert/Besichtigt) mit `KampagneCard` pro Workflow.

Neue Reader-Funktion `getFeedbackBriefsByIds` in
`feedback/reader.ts` — minimal-invasiv (eigener Typ `FeedbackBrief`
mit subject + sender + account + mail_date).

### B7 — KampagneCard

Karten-Inhalt: Adresse/Title + Portal-Chip + Preis-Chip + qm + Termin
+ Verhandlungspreis + Notes + Mail-Brücken-Links.

**Inline-Form für Status-Übergang** (kein Modal, kein Drawer):
- `offen` → Button „Termin eintragen" → `<input type="date">` für
  Termin (Default: heute) + optional Notes
- `terminiert` → Button „Besichtigt" → `<input type="number">` für
  Verhandlungspreis (Default: Listenpreis aus Council-Object) +
  optional Notes
- `besichtigt` = Endzustand, kein Button mehr

Speichern POSTet einen neuen `hauskauf_workflow`-Eintrag (Append-only).

### B8 — CampaignTrack-Link reaktiviert

TODO-Kommentar aus A12 (UI-Pipeline-Ansicht) raus, `<a
href="/kampagne">` wieder anlegt. CSS `.open-link` war noch im
Stil-Block (nie entfernt).

---

## Engineer-Entscheidungen

1. **Reader-Bug Approach (B3):** Option B (Reader-Merge latest-wins
   über beide Tabellen). Option A (Schreibweg in Override umleiten)
   wäre invasiver gewesen, weil `applyCorrection` parallel
   `corrected_domain` und `correction_marker` schreibt — Split wäre
   komplexer als der Reader-Fix.

2. **Status-Werte (B5+B7):** Schema `'offen'/'terminiert'/'besichtigt'`
   gewinnt gegen Direktive-Sprache („offen/in_arbeit/erledigt" Zeile 10).

3. **Layout-Form (B7):** Inline-Form auf Karte. Klein, schnell, kein
   Modal-Overhead.

4. **Route-Pfad (B6):** `(mail)/kampagne` (nicht Top-Level) — erbt
   Owner-Gate automatisch.

5. **Endpoint-Pfad (B5):** `/api/kampagne` (User-facing Sprache,
   nicht `/api/hauskauf`).

---

## Verifikation

**Build:** `svelte-check` 0 Errors / 40 Warnings (Vorzustand).

**Browser-Smoke (User-Aufgabe):**

1. **B1:** Mail mit `domain=system` → Übernommen-Button weg.
   Immo-Mail → Button da. ✓ live verifiziert.
2. **B2:** Klick → Toast „→ Übernommen" für 2s. ✓ live verifiziert.
3. **B3+Fixes:** Übernommen ↔ Archive in beide Richtungen mehrfach
   toggelbar, Detail-Panel zeigt korrekten Button-Highlight. ✓ live
   verifiziert.
4. **B4–B8 (ausstehend):**
   - `/kampagne` öffnen → 3-Spalten-Kanban. Falls kein Workflow:
     leerer Zustand `—` pro Spalte.
   - Test-Workflow via:
     ```sql
     INSERT INTO hauskauf_workflow
       (council_object_id, status, created_by_user_id)
     VALUES ('<existing-council-obj-id>', 'offen', 1);
     ```
   - Karte in „Offen" → „Termin eintragen" → Inline-Form → Speichern
     → Karte wandert nach „Terminiert", neuer Eintrag in DB.
   - Pipeline-Page → CampaignTrack-Gate-Zeile: „Kampagne öffnen ↗"
     navigiert zu `/kampagne`.

**SQL-Verifikation (B3+Fixes-Substanz):**
```sql
SELECT 'override' AS src, overridden_actionability AS val, recorded_at AS ts
  FROM mail_actionability_override WHERE feedback_id=638
  ORDER BY recorded_at DESC LIMIT 1
UNION ALL
SELECT 'correction', corrected_actionability, corrected_at
  FROM corrections WHERE feedback_id=638
    AND corrected_actionability IS NOT NULL
  ORDER BY corrected_at DESC LIMIT 1;
```

**Append-only-Verifikation (B7):**
```sql
SELECT id, status, termin, verhandlungspreis, recorded_at
  FROM hauskauf_workflow
  WHERE council_object_id = '<obj-id>'
  ORDER BY recorded_at DESC;
-- Erwartung: pro Übergang eine neue Zeile, ältere bleiben erhalten.
```

---

## Out of Scope (aus Direktive)

- A3-Klassifikation (Bauteil 4).
- Cascade-Default-on (Bauteil 2.5).
- Pipeline-UI-Refactor.
- Kampagnen-Backend-Schema-Änderungen (außer init.ts-Drift-Fix der
  das Live-Schema codifiziert).
- Mobile-Variante `/kampagne`.
- Aufräumen Dead-Code `updateHauskaufWorkflowStatus` (Folge-
  Direktive).

---

## Stand

Bereit für FF-Merge auf Anweisung. Live-Browser-Test von B4–B8 plus
Screenshots `/kampagne` sind User-Aufgabe.
