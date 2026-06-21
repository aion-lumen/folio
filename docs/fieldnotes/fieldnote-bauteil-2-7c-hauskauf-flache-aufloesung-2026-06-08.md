# Field-Note — Bauteil 2.7c: Hauskauf-Konsolidierung (2026-06-08)

**Quelle:** `direktive-bauteil-2-7c-hauskauf-flache-aufloesung-2026-06-08.md`
plus Architekt-Rückpfeifung nach D7.
**Anlass:** 2.7b hat Hauskauf-Workflow als zweites Kanban unter dem
LIFE-Kanban gebaut — visuell redundant. 2.7c löst das in EIN Kanban
mit LIFE-Grammatik auf. Plus Schema-Vokabular-Wechsel
(`terminiert→in_arbeit`, `besichtigt→erledigt`, neu `blockiert`),
Scaffolding-Objectives obj-04-01..04 raus, Auto-Eintritt bei
Council-Konsens, Verdikt-Tag bei erledigten Karten.
**Status:** Implementierung fertig, svelte-check 0 Errors.
D1–D7+R1+R2+R3+R5+D8+D9+D10 live verifiziert (User-Browser-Test,
Verdikt-Klick pass, DB-Append-only-Stand korrekt). D8-Live-Test
(Council-Konsens-Trigger) ausstehend.

---

## Branch + Commits

`folio/feature/bauteil-2-7c-hauskauf-flache-aufloesung-2026-06-08`:

| Commit | Aufgabe | Inhalt |
|---|---|---|
| `7e72753` | D1 | Schema-Migration: status-vokabular umbenannt, verdict-spalte, migrations-hook via sqlite_master.sql-probe |
| `d15a48f` | D2 | 10 files mit hardcoded status-strings synchronisiert (writer, api, council-reader, mobile-loader+page+pill+group, pipeline-CampaignTrack, plus pro forma KampagneCard/HauskaufWorkflowSection vor d10) |
| `2215b23` | D2-fix | Versehentlich gestaged-files revertieren (folio.db + alte diagnose-fieldnotes) |
| `7ae9040` | D4 | HauskaufCard mit anatomie + inline-edit + auto-übergänge + verdikt-toggle |
| `456f742` | D5 | HauskaufKanban 4-spalten-brett mit drag&drop + block-grund-input |
| `49f92cf` | D6 | HauskaufKapitelSicht-wrapper (in R1 wieder gelöscht) |
| `5f86caf` | D7 | HauskaufHeaderPuls (in R3 wieder gelöscht) |
| **— Rückpfeifung —** | | |
| `6986134` | R5 | Layout-onMount liest URL-params (Deep-Link `/vault?act=2&chapter=4` funktional) |
| `f3ec43c` | R1 | HauskaufKapitelSicht weg, HauskaufKanban an stelle des KanbanBoard (entweder/oder) |
| `7c8a100` | R2 | HauskaufKanban-styling auf LIFE-look (flex, col-primary, tailwind-klassen) |
| `29c1090` | R3 | HeaderPuls in ChapterBanner integriert (3. stat 'Termine N diese Woche'), HauskaufHeaderPuls gelöscht |
| **— D8/D9/D10 —** | | |
| `cd69cae` | D9 | verdict-spalte in POST /api/kampagne durchverdrahtet (writer + endpoint) |
| `ae385a2` | D8 | auto-eintritt bei council-konsens (reuse getConsensusReadyObjectIds, idempotent) |
| `f47ebe9` | D10 | KampagneCard + HauskaufWorkflowSection gelöscht (tote komponenten nach r1+d4) |
| `a535802` | Hotfix | getRecentEvents in council-db/reader.ts:721 — updated_at → recorded_at (D2 hatte cross-db-callsite übersehen) |

D3 (Objectives obj-04-01..04 aus `~/Projects/life/_campaign/chapters/04-hauskauf.md`
entfernt) ist Markdown-Edit außerhalb Folio-Repo — kein Commit, nur
im life-Vault.

---

## Architektur-Rückpfeifung (Lehre)

**Direktive 2.7c Konzept A** sagte: „EIN Kanban pro Hauskauf-Kapitel,
LIFE-Grammatik. Status-Werte: offen/in_arbeit/blockiert/erledigt."
Engineer hat das in D4–D7 als **zweites** Kanban darunter
(HauskaufKapitelSicht-Wrapper unter dem leeren LIFE-KanbanBoard)
implementiert — visuell redundant, zwei Brettchen mit identischer
Spalten-Struktur. Architekt-Rückpfeifung nach D7 mit Screenshot-
Beweis.

**Lehre:** „EIN Kanban" wörtlich nehmen. Wenn das LIFE-KanbanBoard
existiert und 4 passende Spalten hat, ist „die Hauskauf-Sicht im
LIFE-Kanban" gemeint, nicht „ein zweites Kanban-Brett". Die
Direktiven-Phrase „Karten leben dort, nicht in einem zweiten Kanban
darunter" wurde beim ersten Build überlesen.

**Auflösung (R1):** Conditional im Vault-Page —
`HauskaufKanban` an Stelle des `KanbanBoard` wenn
`displayChapter.chapter_number === 4 && displayChapter.parent_act === 2`.
Pattern: **„Kapitel-Typ-Switch im Page"** (statt KanbanBoard-Variant
oder Snippet-Slot — beides hätte LIFE-Komponente verkomplizieren
müssen). Architekt-Klärung „entweder/oder pro Kapitel" trägt:
Hauskauf ist dynamisch, andere Kapitel sind statisch.

---

## Schema-Migration (D1)

**Vorher:** `CHECK(status IN ('offen','terminiert','besichtigt'))`
plus Sub-CHECKs (terminiert→termin, besichtigt→verhandlungspreis).

**Nachher:** `CHECK(status IN ('offen','in_arbeit','blockiert','erledigt'))`
plus Sub-CHECKs (in_arbeit→termin, erledigt→verhandlungspreis),
neue optionale Spalte `verdict TEXT NULL CHECK IN
('favorisiert','verworfen')`.

**Migrations-Pattern:**
1. `verdict`-Spalte additiv via `ALTER TABLE ADD COLUMN` (idempotent)
2. CHECK-Constraint-Migration: SQLite kann CHECK nicht direkt ALTERn
   → Pattern „temp-Tabelle, copy mit CASE-Mapping
   (terminiert→in_arbeit, besichtigt→erledigt), drop, rename" in
   einer Transaction
3. Detektion via `sqlite_master.sql LIKE '%terminiert%'` — robuster als
   probe-INSERT (idempotent, FK-unabhängig, no state mutation)

Live-DB war zum Migrations-Zeitpunkt leer (alte Test-Daten verworfen)
— kein Datenverlust, aber Mapping-CASE im SQL als safety net auch
für den Fall dass alte Werte da gewesen wären.

---

## Engineer-Entscheidungen + Begründungen

1. **Status-Vokabular Umbenennung (D1).** User-bestätigt im Plan-
   Mode. DB ist leer, kein Migrationsschmerz. Konsistente Visual-
   Sprache zu LIFE-KanbanBoard.

2. **Conditional-Switch im Vault-Page (R1) statt KanbanBoard-Variant.**
   KanbanBoard hat viel LIFE-spezifischen Code (Leuchtfeuer,
   ObjectiveDetailsPanel, chapterSlugMap, onMove-Callback mit slug).
   Mit Hauskauf-Logik mischen würde unleserlich. Plus Architekt-
   Verbot „LIFE-Karten-Komponente architektonisch ändern" respektiert.

3. **HeaderPuls inline in ChapterBanner (R3) statt eigene Komponente.**
   HauskaufHeaderPuls war overdesign für eine Stat-Zeile.
   ChapterBanner bekommt optional `hauskaufCards`-Prop und rendert
   conditional einen dritten `.stat`-Block — präzise neben
   Fortschritt/Aktive Ziele wie Architekt wollte.

4. **Auto-Eintritt: Reuse `getConsensusReadyObjectIds` (D8).**
   Direktiven-Phrase „top_consensus" interpretiert als „User-Top-3-
   Konsens" (etabliertes Pattern im System, gleiche Definition wie
   `triggerObjectAndMaybeCreateWorkflow`). Lens-Konsens
   (`consensus_state='still'` aus Voice-Aggregation) wäre andere
   Definition — falls gewünscht, Folge-Direktive.

5. **Tolerante VHB-Parser-Heuristik (D4):** `< 100 → Millionen-
   Schreibweise` (1.32 = 1.32 M). Live-Test zeigte: User tippte
   „5000" → wurde als 5000 EUR interpretiert (richtig, weil > 100).
   Falls User „5" tippen würde, würde 5 Millionen EUR draus.
   Heuristik debatable, aber pragmatisch für die zwei
   Eingabe-Pattern „1.32 M" und „1320000". Toleranz-Tradeoff
   dokumentiert.

6. **Werkbank-Bereinigung (Direktive-Aufgabe 8): NICHT durchgeführt.**
   Phase-1-Recherche: Werkbank-Sicht ist bereits voll live-verbunden
   (Voice-Cards aus log-events, Logs aus DB, Progress aus
   n_processed). Einziger Mock-Artefakt: `Math.max(n_processed, 30)`
   UI-Floor in `Workbench.svelte:143` — eine Sicherung für
   Progress-Bar-Mindestbreite bei kleinen Runs, kein Demo-Element.
   Direktive überschätzt den Cleanup-Bedarf. Wenn Architekt einen
   konkreten Mock-Spot meinte, bitte Folge-Direktive mit File:Line.

---

## Karten-Anatomie (D4) + Inline-Edit (D4/D5)

**HauskaufCard.svelte:**
- ID-Zeile (`obj-<8chars>`, mono, muted)
- Verdikt-Tag (✓ favorisiert / ✗ verworfen) oben rechts bei
  `status=erledigt`
- Titel (Adresse oder fallback)
- Tags-Zeile (Portal)
- Chip-Zeile: Listenpreis (immer) + Termin (ember bei gesetzt, dashed
  `+ Termin` bei leer) + VHB (grün bei gesetzt, dashed `+ VHB` bei
  leer)
- Block-Grund-Chip (rot) bei `status=blockiert`, Inhalt aus `notes`

**Inline-Edit:** Klick auf Chip → Input ersetzt Chip in-place.
Enter/Blur → POST /api/kampagne (Append-Eintrag). Escape → cancel.

**Tolerante Parser:**
- Termin: `'3.6.'` / `'3.6 14:00'` / `'03.06.2026'` / ISO → ISO
- VHB: `'1.32 M'` / `'1.32m'` / `'1320000'` / `'850k'` / `'1.32'`
  (Heuristik) → EUR

**Auto-Status-Übergänge (client-side pre-POST):**
- `offen` + `termin` gesetzt → `in_arbeit`
- `in_arbeit` + `verhandlungspreis` + `termin` in Vergangenheit →
  `erledigt`

**Drag&Drop (HauskaufKanban):**
- Drop auf andere Spalte → POST mit neuem Status
- Drop auf `blockiert` → Inline-Input für Block-Grund öffnet sich
  auf der Karte
- Kein Drag-Reorder innerhalb Spalte (Direktive-Verbot)

---

## Auto-Eintritt-Pipeline (D8)

```
Council-Lens-Run → consolidated_top10 + user_rankings
                ↓
loadHauskaufWorkflowCards() (jeder /vault-Page-Load)
                ↓
ensureHauskaufWorkflowsForConsensus()
                ↓
getConsensusReadyObjectIds() — beide User Top-3, kein workflow
                ↓
insertHauskaufWorkflow({ status: 'offen', user_id: 1 })
                ↓
listAllHauskaufWorkflow() liefert neue Karte
                ↓
HauskaufKanban rendert in „Offen"-Spalte
```

**Cross-DB-Constraint** (Memory: ACK statt Cross-DB-Write): folio-
seitig getriggert (Pull-Pattern), Council-Worker schreibt nicht in
folio.db. ✓

**Idempotenz:** `getConsensusReadyObjectIds()` filtert bereits
Objekte mit existing workflow raus — zweiter Page-Load: 0 IDs, 0
Inserts.

---

## Verifikations-Map

| Aufgabe | Verifiziert | Wie |
|---|---|---|
| D1 Schema | ✓ User-Browser | `sqlite3 ~/.folio/folio.db ".schema hauskauf_workflow"` zeigt 4-werte-CHECK + verdict-spalte |
| D2 Strings | ✓ svelte-check | 0 errors, 10 files synchron |
| D3 Objectives | ✓ visuell | KanbanBoard im 04-hauskauf-kapitel leer (vor R1), keine obj-04-X mehr |
| D4 Card | ✓ User-Browser | inline-edit pass, auto-übergang pass |
| D5 Kanban | ✓ User-Browser | drag&drop pass, block-grund-input pass |
| R1 Page-Switch | ✓ User-Browser | EIN kanban statt zwei |
| R2 Styling | ✓ User-Browser | LIFE-look passt |
| R3 Banner-Stat | ✓ User-Browser | „termine N diese woche" rechts neben aktive ziele |
| R5 URL-Params | ✓ User-Browser | nach dev-server-restart deep-link `/vault?act=2&chapter=4` öffnet hauskauf-kapitel |
| D9 Verdikt | ✓ User-Browser | ✓/✗-klick persistiert verdict-spalte |
| D8 Auto-Eintritt | **PENDING** | live-test ausstehend mit user-top-3-ranking-szenario |
| D10 Cleanup | ✓ svelte-check + manuell | KampagneCard + HauskaufWorkflowSection gelöscht, keine broken imports |

---

## Out of Scope (aus Direktive + Engineer)

- LIFE-Karten-Komponente (ObjectiveCard) ändern (Architekt-Verbot
  respektiert via Conditional-Switch).
- KanbanBoard architektonisch ändern.
- POST `/api/kampagne` neu schreiben (D9 nur body-erweitert).
- Boundary 3 (LIFE-Vault privat).
- Drag-Reorder innerhalb Spalten.
- Vorschlags-Liste vor Kanban-Eintritt.
- Status-Auto-Trigger auf 04-hauskauf-Markdown-Status (Markdown-
  Mutation, eigene Folge-Direktive).
- Mobile-Variante.
- Werkbank-Refactor (Direktive überschätzt — kein echter Bedarf,
  Engineer-Befund).
- Lens-Konsens-Trigger (User-Konsens als pragmatische Wahl,
  Folge-Direktive möglich).

---

## Folge-Direktiven-Kandidaten

1. **Frontmatter-Field `kind: 'workflow'|'objective'`** für Kapitel-
   Typ-Marker statt zahl-basiertem `chapter_number===4 && parent_act===2`.
   Bei zweitem dynamischen Kapitel (z.B. Partner's-Weg-Workflow).
2. **Lens-Konsens-Trigger** (`consensus_state='still'` aus
   Voice-Aggregation) als alternative oder zusätzliche Auto-Eintritt-
   Quelle neben User-Top-3.
3. **VHB-Parser-Heuristik-Test** für mehr Eingabe-Pattern.
4. **Mock-Daten für Public-Repo** (aion-lumen.ch-Update) — separate
   Boundary-3-Direktive.
5. **04-hauskauf.md Status-Auto-Trigger** (Markdown-Mutation):
   `upcoming → active` wenn 1+ Workflow existiert.
6. **dead-code `updateHauskaufWorkflowStatus`** in writer.ts war
   bereits in D2 entfernt (war zuvor schon broken). Falls künftig
   ein in-place-Update-Pfad gewünscht: explizit als Folge-Direktive.

7. **`triggerObjectAndMaybeCreateWorkflow` Semantik-Drift**
   (writer.ts:202): `INSERT OR IGNORE` wirkungslos seit Bauteil 2
   das `UNIQUE(council_object_id)` weggenommen hat. Jeder User-
   Trigger inserted nochmal. Plus mit D8 (Auto-Eintritt) parallel:
   doppelte Inserts möglich (Tabellen-Bloat, kein semantischer Fehler
   weil Reader latest-wins). Cleanup-Direktive: Funktion auf
   „check + insert nur wenn kein existing workflow" umstellen, oder
   ganz durch D8-Pattern ersetzen.

8. **Schema-Refactor-Memory-Lehre (zweite Welle):** trotz der
   Memory-Notiz aus 2.7 wurde `getRecentEvents` in council-db/
   reader.ts:721 in 2.7 übersehen — referenzierte weiter
   `hauskauf_workflow.updated_at`. Memory-Update: bei künftigen
   Schema-Refactors grep MUSS über ALLE Verzeichnisse (council-db
   UND folio-db UND mobile-routes), nicht nur die Tabellen-eigene-
   Reader-Datei. Cross-DB-Reader die die Tabelle mit-lesen werden
   sonst übersehen.

---

## Stand

Bereit für FF-Merge auf Anweisung. Substanz ist auf
`feature/bauteil-2-7c-hauskauf-flache-aufloesung-2026-06-08` mit 14
Commits. D8-Live-Test mit User-Top-3-Ranking-Szenario ausstehend.
Screenshots vorher/nachher: `Bild 08.06.26 um 17.26.png` (vorher,
zwei Kanbans) und `~/.folio-tools/screenshots/` (smoke-test-output —
mit Headless-Chrome-Auth-Issue, User-Browser zeigt korrekten Stand).
