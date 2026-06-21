# Field-Note — Bauteil 2: Mail-zu-Council-Übergang (2026-06-06)

**Quelle:** Diagnose-Direktiven 2026-06-06 (D2 + D3 + B aus
`fieldnote-pipeline-filter-diagnose-2026-06-06.md` + Mail-Typen-Befund
in `multi-agent/docs/fieldnotes/fieldnote-mail-typen-diagnose-2026-06-06.md`).
**Status:** Implementierung fertig, End-to-End-Test ausstehend, FF-Merge auf
Architekt-Anweisung.

---

## Commits

| Repo | Branch | SHA | Inhalt |
|---|---|---|---|
| multi-agent | `feature/auto-uebernahme-vier-stimmen-2026-06-06` | `948d5be` | Actionability-Literal um `uebernommen` + scripts/auto_uebernahme.py + validator_batch-Hook |
| folio | `feature/mail-uebernommen-status-2026-06-06` | `6b73e56` | Type + Schema mail_actionability_override + Reader/Writer + Endpoint /api/mail/override + 3-Tab-UI + VerdictStage-Button |
| folio | `feature/mail-uebernommen-status-2026-06-06` | `e495d02` | F2: Inserat-Marker-Reader + EvidenceCard-UI-Merge |
| council | `feature/inserat-korridor-redirect-error-2026-06-06` | `34d9344` | Worker-Query auf `uebernommen` + Inserat-Korridor-Filter + Redirect-Error + mail_inserat_markers |

---

## Architektur-Entscheidungen (User-bestätigt 2026-06-06)

### Persistierung `uebernommen`

- **Auto-Promotion**: `production_worker` → validator_batch → neuer
  `scripts/auto_uebernahme.py` schreibt `feedback.actionability='uebernommen'`
  direkt in feedback.db (multi-agent ist owner; kein Cross-DB-Verstoß).
  Voraussetzung: Vier-Stimmen-Vollkonsens (Heuristik + 3 Validatoren alle
  `immo+actionable`) + kein Block-Marker (TIER1_BLOCKER_MARKERS plus
  `out_of_corridor:*`).
- **Manuelle Promotion**: Folio Mail-Detail Button „→ Übernommen" → POST
  `/api/mail/override` → Append-only Insert in
  `folio.db.mail_actionability_override`. Latest-wins per feedback_id.
- **Worker liest beide Quellen** cross-DB (read-only auf folio.db,
  Pattern analog `council/scripts/ingest_pending_worker.py:50-66`).

### `voice_consensus.py` bleibt Stub

Bestätigte Architektur: Stimmen werden im Worker produktiv erzeugt und in
`folio.db.validator_opinions` persistiert. `voice_consensus.decide_routing`
ist Orchestrator-Stub und **nicht** im production_worker eingebunden. Die
Vier-Stimmen-Konsens-Prüfung läuft als SQL-Aggregation gegen
`validator_opinions` in `scripts/auto_uebernahme.py::_is_eligible_for_uebernommen`
— ohne den Orchestrator zu aktivieren. Cascade-Aktivierung ist eigenes
Bauteil für später (Memory).

### UI: 3 Tabs, Backend behält `archive`

- `ACTIONABILITY_KEYS` (4 Werte) bleibt für Type-Validation/Backend-
  Konsumenten.
- Neuer Export `ACTIONABILITY_UI_KEYS` (`actionable`/`uebernommen`/
  `archive-silent`) — Filter-Disclosure iteriert nur diese 3.
- `applyFilters` in `mailQueue.svelte.ts` merged `archive` (time-decay)
  automatisch in den `archive-silent`-Tab (Set-Add: `if (levels.has('archive-silent')) levels.add('archive')`).
- **Time-Decay-archive-Volumen in immo:** 0 von 12 immo-Mails sind heute
  `actionability='archive'` (Sichtung 2026-06-07). Kein Council-relevanter
  Verlust durch UI-Merge.

### Marker-Rückkanal Council → Mail

- Neue Tabelle `council.mail_inserat_markers (id, feedback_id, marker, recorded_at)`.
  Append-only, 1:N pro Mail.
- `write_inserat_marker(feedback_id, marker)` in `db_v2.py`.
- Folio `getInseratMarkersForFeedback(feedbackId)` in `council-db/reader.ts`
  liest cross-DB read-only, robust gegen fehlende Tabelle (Pre-C1-DB).
- Endpoint `/api/council/object-by-feedback/[id]` liefert die Marker mit
  (auch bei `found: false` → leere Mail mit Markern bei All-out-of-corridor).
- UI: `EvidenceMarkers` zeigt eigenen Block „🏠 Inserat-Marker (Council-
  Worker)" mit ember-Pillen.

### PLZ-Extraktion (gestaffelt)

Top-3 Portale nach Volumen-Sichtung in feedback.db
(`SELECT … FROM feedback WHERE marker LIKE 'tier1:portal_domain:%'`):

| Portal | Mails | Council-portal-id | Parser |
|---|---|---|---|
| Immowelt | 7 | `immowelt_grenzregion` | `title_parser.parse_immowelt_grenzregion` (PLZ aus og:title-Regex, deterministisch) |
| Homegate | 2 | `homegate_basel`, `homegate` | `_extract_plz_homegate` (og:postal-code/locality/address + Title-Fallback) |
| ImmoScout24 | 2 (CH+DE) | `immoscout_ch_basel`, `immoscout_de_grenzregion`, `immoscout_ch` | `_extract_plz_immoscout` (meta/data-postal-code/address + Title-Fallback) |
| **Comparis (4.)** | 1 | `comparis_basel` | nicht in dieser Iteration → `corridor_check_skipped:comparis_basel`-Marker, Folge-Direktive |

`KNOWN_PARSER_PORTALS`-Set in `ingest_lib.py:217`. Unbekanntes Portal
(z.B. comparis_basel, newhome_basel) → Marker `corridor_check_skipped:<pid>`
+ Inserat trotzdem ingested (keine pauschale Filterung).

---

## Verifikation

### Smoke-Tests (lokal, ohne Worker-Live-Run)

**M1 Auto-Promotion (dry-run gegen bestehende Stimmen):**
```
$ python scripts/auto_uebernahme.py --ids 595 598 613 --dry-run
[dry-run] would promote feedback_id=598
[dry-run] would promote feedback_id=613
auto_uebernahme: checked=3 eligible=2 promoted=0
```
- 595 (Preissenkung, archive-silent) → korrekt nicht im Scan.
- 598 (Schluchsee, actionable, alle 3 Validatoren immo+actionable, keine
  Block-Marker) → eligible.
- 613 (Maisonette Basel CHF 2'650, actionable, alle einig) → eligible
  (Miete-vs-Kauf-Filter Out-of-Scope, eigenes Bauteil).

**C1 Corridor-Helper:**
```
$ python -c "from regelwerk_reader import is_plz_in_corridor; ..."
8000 (Loule):  True
8000 (Schluchsee): False
4059 (Basel):      True
8000 (Wehr ausgeschlossen): False
5000 (CH ausser range): False
```

**F1/F2 svelte-check:** 0 Errors / 35 Warnings (vorhandene Warnings).

### End-of-Sprint-Test (5 Szenarien — durch User auszuführen)

Voraussetzungen:
1. Folio dev-server (`vite dev`) neu starten → `mail_actionability_override`
   wird beim init.ts-Apply angelegt.
2. Council dev-DB initialisieren — `python -c "from src.db_v2 import
   get_connection; get_connection()"` legt `mail_inserat_markers` an + macht
   V2.4-Migration der ACK-CHECK-Constraint.
3. Validator-Cascade muss vor production_worker-Lauf aktiv sein (LM-Studio
   + qwen/gemma Modelle geladen). Heute Standard, da bereits 90 validator_
   opinions in folio.db existieren.

**Szenario-Tabelle:**

| # | Setup | Erwartetes Ergebnis |
|---|---|---|
| 1 | Immo-Mail mit Vollkonsens (heur+3val=actionable), keine Block-Marker, sauberes Inserat (Korridor) | Nach Validator-Run: `feedback.actionability='uebernommen'`. Beim nächsten council-mail-ingest-Tick: Council-Object angelegt. |
| 2 | Immo-Mail mit Vollkonsens, Inserat im **Schluchsee** (out-of-corridor 8000) | `actionability` bleibt `actionable` (Auto-Promotion blockiert durch `out_of_corridor:8000` Marker). Wenn User manuell „→ Übernommen" klickt: council-Tick ingested die Mail, das Inserat wird im Worker korridor-gefiltert, `out_of_corridor:8000` als Marker in `mail_inserat_markers`. Kein Object. |
| 3 | Immo-Mail mit Stimmen-Disagreement (3 sagen immo+actionable, 1 sagt kontakt) | `actionability='actionable'`. Auto-Promotion greift nicht (`is_consensus` returnt False). |
| 4 | Multi-Objekt-Mail mit 3 Inseraten Basel-Korridor + 2 Inseraten Schluchsee | Wenn übernommen (auto oder manuell): 3 Council-Objects, 2 `out_of_corridor:8000`-Marker. |
| 5 | Mail wie 595 (mit Redirect-Error-Click-URL) | 4 echte Inserate ingested, 1 als expired erkannt (`<title>Redirect Error</title>` → status='expired'), Marker `expired:redirect_error` in mail_inserat_markers. |

**Manueller Test in Folio Mail-Queue:**
- Filter-Disclosure zeigt 3 Tabs (Aktionable / Übernommen / Stumm).
- Detail-Panel auf aktionabler Immo-Mail: 3. Button „→ Übernommen" sichtbar
  (kaufen-grüne Verdict-Farbe). Klick → Mail wechselt in Übernommen-Tab.
- Detail-Panel einer Mail mit out-of-corridor-Inserat: „🏠 Inserat-Marker
  (Council-Worker)" Block sichtbar mit `out_of_corridor:8000`-Pille.

### SQL-Checks nach Live-Run

```sql
-- Auto-Promoted Mails (multi-agent)
SELECT id, sender, subject, actionability
FROM feedback WHERE actionability='uebernommen' ORDER BY id DESC LIMIT 5;

-- Manuelle Overrides (folio)
SELECT * FROM mail_actionability_override ORDER BY recorded_at DESC LIMIT 5;

-- Inserat-Marker (council)
SELECT feedback_id, marker, recorded_at
FROM mail_inserat_markers ORDER BY recorded_at DESC LIMIT 10;

-- ACK-Status-Verteilung
SELECT status, COUNT(*) FROM mail_ingest_acks GROUP BY status;
```

---

## Out of Scope (aus Direktive + Engineer-Identifiziert)

- **Makler-Korrespondenz** (Mail-Typen-Diagnose A3/A4): `kontakt`-Mails
  vom Raumgold-Makler werden nicht in immo-Pool gehoben → Bauteil 4.
- **Freshness-Filter** (D4 Inserat-Veröffentlichungs-Datum): nicht
  implementiert → Bauteil 3.
- **Preissenkung-Übernahme** (upsert COALESCE überschreibt price_value
  nicht bei Preissenkung-Re-Mail): Bauteil 5, klein.
- **Auto-Übergang bei Whitelist-Sender ohne Vollkonsens:** explizit nicht
  (Direktive).
- **Comparis-Parser** (4. Portal): Folge-Direktive nach DB-Sichtung.
- **Miete-vs-Kauf-Filter:** Mail 613 (Maisonette CHF 2'650 = Miete) wäre
  heute promoted; eigenes Bauteil falls Architekt das filtern will.
- **Cascade-Aktivierung** (`voice_consensus.decide_routing` produktiv im
  production_worker): eigenes Bauteil.

---

## Reihenfolge FF-Merge

1. **multi-agent** Branch zuerst (auto_uebernahme nutzt nur eigene Modul-
   Imports, kein Cross-Repo-Read).
2. **folio** Branch zweitens (Schema `mail_actionability_override` muss
   da sein bevor council es liest).
3. **council** Branch zuletzt (cross-DB-Read auf folio.db braucht
   Schritt 2).

Für jeden Branch: `git push origin <feature>` → FF-merge in main via gh
auf Architekt-Bestätigung.
