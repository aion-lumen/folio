# Field-Note — Pipeline + Filter Diagnose (2026-06-06)

**Anlass:** End-of-Sprint-Test des Hauskauf-Kampagne-Bauteils. 30er Mail-Run
lieferte 2 immo-actionable Mails, 0 davon in `council.objects` nach Lens-Lauf.
**Modus:** Read-only. Vier Sub-Diagnosen.

---

## D1 — UI-Branch-Check

Ein-Satz-Befund: Branch `feature/hauskauf-kampagne-2026-06-05` ist aktiv,
vite dev läuft seit 01:38 (heute), alle Bauteil-2-UI-Commits sind drauf
(b3b1ae4 collapse-Karteikarten, 2b35c51 qm/preis-Pillen, 78d0a30 distance-
Pillen). Diese Fixes sind auch auf `main`. Wenn Browser sie nicht zeigt:
Hard-Reload / Vite-HMR-Glitch — kein Bug.

---

## D2 — Pipeline-Übergang Mail → Council

### Die zwei actionable Mails

| feedback_id | Sender | Subject | mail_date | actionability |
|---|---|---|---|---|
| 598 | myscout@immobilienscout24.de | 1 Angebot: Haus zum Kauf, im Umkreis von 50 km von Loulé (Kreis) … | 2026-06-05 06:22 UTC | actionable |
| 613 | service@info.comparis.ch | 1 neue Immobilie für Haus / Wohnung Basel | 2026-06-03 20:50 UTC | actionable |

Beide created_at am 2026-06-06 11:40 UTC (heute ingested in feedback.db).
Markers:
- **598**: `tier1:portal_domain:immobilienscout24.de`, `tier2:location_whitelist:Loulé`, `immo:domain:immobilienscout24.de`. **Kein `plz:`-Marker.**
- **613**: `plz:4059`, `plz_city:Basel`, `plz_country:CH`, `plz_coords:47.5309,7.5939`, `tier1:portal_domain:info.comparis.ch`, `tier2:location_whitelist:Basel`, `plugin:unklar→force-review`.

### Worker-Status

launchd `com.aionlumen.council-mail-ingest` (stündlich :25, last exit 0,
state=not running). Letzter Log zeigt mehrfach `=== ingest_from_mail —
0 mails (von 0, 0 bereits ack'ed) ===`.

`council.db.mail_ingest_acks`: 0 Rows (nach DB-Cleanup leer).

### Wurzel-Befund

Worker-Query in `council/scripts/ingest_from_mail.py:161-170`:

```sql
SELECT id, sender, subject, body_excerpt, heuristic_markers,
       domain, actionability, effective_actionability
FROM feedback
WHERE (domain='immo' AND (effective_actionability='archive-silent'
                          OR actionability='archive-silent'))
   OR (domain='werbung' AND heuristic_markers LIKE '%tier1:portal_domain:%')
ORDER BY id DESC
LIMIT ?
```

**Beide Test-Mails sind `actionability='actionable'`, nicht `archive-silent`.
Worker ignoriert sie per Design.** Das ist im Header dokumentiert:
„Cross-Repo-Read aus multi-agent/state/feedback.db: alle silent-Immo-Mails
+ werbung-Mails mit portal-Marker." (Iteration 1.5, Direktive 6, 2026-05-28).

### Pipeline-Position pro Mail

- **598**: liegt in `feedback.db`, never gelangt zum Worker (actionable),
  never in `council.objects`. Wird beim nächsten :25-Tick wieder übersprungen.
- **613**: identisch — actionable, vom Worker übersprungen.

Im selben 30er-Run liegen 10 immo-**archive-silent** Mails (614, 595, 593,
592, 591, 590, 589, 588, 586, 585), die der Worker normalerweise abholt.
Der letzte echte Worker-Lauf vor heute hatte „DB: neu eingefügt: 11" —
das waren diese Mails (eventuell auch mehr aus früheren Runs).

**Architekt-Frage:** Soll der Worker auch actionable-Mails ingestieren?
Aktuell ist die Logik „actionable wird vom User manuell reviewt, Council
sieht nur archive-silent als Automatik-Pool". Das End-of-Sprint-Test-
Szenario (Konsens auf actionable Mails) erwartet implizit, dass actionable
Mails auch in council landen. Entweder Worker-Filter erweitern oder
Test-Erwartung anpassen.

---

## D3 — Korridor-Filter auf Inserat-Ebene

### Heutiger Filter-Sitz

Korridor-Filter lebt ausschließlich in `multi-agent/scripts/
domain_actionability.py::_apply_corridor_filter` (Step 9), liest
`regelwerk.filters.hauskauf.korridor_whitelist` (`de_side` flache Liste,
`ch_side` ranges+extras) + `korridor_excludes`.

**Eingabe:** PLZ aus `feedback.heuristic_markers` (z.B. `plz:8000`),
extrahiert in `immo_heuristic.py:700-703` aus Subject/Body der Mail.

**Eingriff:** auf **Mail-Ebene** — eine Mail bekommt eine PLZ, die
PLZ entscheidet über out_of_corridor. Inserate im Mail-Body werden
nicht separat geprüft.

### Inserat-Ebene-Filter im Worker

Im `council/scripts/ingest_from_mail.py` gibt es **keinen Korridor-
Filter** — der Worker filtert nur über Block-Patterns (projektiert,
zwangsversteigerung) aus `filters.hauskauf.block_patterns`. URLs werden
gefetcht, og:image/og:title extrahiert, Object eingefügt — ohne PLZ-
Validation des Inserats.

### Konkretes Beispiel — Mail 598

Mail 598 ist klassifikatorisch actionable (Sender-Whitelist
`immobilienscout24.de`, `location_whitelist:Loulé`). Im Mail-Body
strukturiert:

```
Adresse: Schluchsee, Breisgau-Hochschwarzwald (Kreis)
Kaufpreis: 390.000 €
Wohnfläche: 216 m²
```

Schluchsee PLZ ≈ 8000 (Hochschwarzwald). **Out-of-corridor** —
`de_side`-Liste enthält nur Rheinebene/Algarve/Hochrhein bis 8000
(Bad Säckingen), Loulé-Region. 8000 ist weit jenseits.

**Aber:** `feedback.heuristic_markers` für 598 hat **keinen `plz:`-Marker**
— nur location-whitelist textuell. Der Mail-Ebene-Korridor-Filter konnte
nicht greifen, weil kein numerischer PLZ-Wert extrahiert war. Selbst
wenn der Filter Inserat-Bewusstsein hätte: er müsste die Adresse
„Schluchsee, Breisgau-Hochschwarzwald" parsen oder die Expose-URL
fetchen, um eine PLZ zu kriegen.

### Strukturelle Lücke

Inserat-Ebene-Filter fehlt im council-Worker. Selbst wenn die Mail mit
einer „guten" PLZ klassifiziert wird (Sender-Whitelist trickst Korridor),
kann das eigentliche Inserat woanders liegen. Heute wird das Object
trotzdem eingefügt.

**Architekt-Frage:** Soll Korridor-Validation in den Worker (nach Fetch,
vor upsert_object — PLZ aus Expose-Page extrahieren)? Oder bleibt
Mail-Ebene-Filter dünn und der Workflow toleriert out-of-corridor-
Objects?

---

## D4 — Freshness-Filter

### Was existiert

1. **Mail-Time-Decay** — `multi-agent/scripts/domain_actionability.py:397-418`,
   Step 5. Liest `user_context.yaml.time_decay.{domain}.{actionable_within_days,
   archive_within_days}`. Vergleicht `mail_date` mit `now`. Bei `age_days >
   actionable_within_days` → `archive`-Marker `decay:>{N}d→archive`. Bei
   `> archive_within_days` → `archive-silent` `decay:>{N}d→silent`.

2. **Inserat-Expired-Detection (HTTP)** — `council/src/ingest_lib.py:146-163` +
   `council/scripts/ingest_from_mail.py:229-249`. Fetch returnt `status='expired'`
   bei HTTP 410/404 → Object kriegt `status_tag='abgelaufen'` (wenn bereits in
   DB) oder wird übersprungen (wenn neu). Greift nur wenn URL zur Zeit des
   Fetchs tot ist.

### Was fehlt

**Es gibt keinen „Inserat-Veröffentlichungs-Datum"-basierten Filter.**
Niemand extrahiert ein `published_at`/`listing_date` aus dem Expose oder
aus Mail-Body-Datums-Zeilen. Die heutigen zwei „freshness"-Mechanismen
sind:
- Mail-Datum (`mail_date`) — sagt nur „Mail wurde gestern empfangen".
- HTTP-Status — sagt nur „URL ist tot/lebt".

Wenn ein Portal alte Inserate immer wieder neu mailt (Comparis-Pattern:
Preissenkung-Mail von Mai über ein Inserat von Februar), passieren beide
Mechanismen vorbei.

### Konkretes Beispiel

Mail 595 (`Preissenkung entdeckt: Für eine Immobilie passend zu deiner
Suche in Olhão`, archive-silent) ist genau dieser Pattern.
mail_date 2026-06-05 ist frisch, URL voraussichtlich live (Preis runter
heißt Inserat existiert noch). Time-Decay greift nicht (Mail frisch),
HTTP-expired greift nicht (URL lebt). Inserat selbst kann Wochen/Monate
alt sein.

User-Direktive nennt „eine ein abgelaufenes Inserat" als Test-Symptom —
ohne konkrete feedback_id ist die Identifizierung Spekulation. Plausibel
ist 595 oder eine vergleichbare Re-Mail eines bestandsalten Inserats.

### Status: existiert oder verloren?

Datums-basierter Inserat-Freshness-Filter existiert **nicht** und ist
nicht „verloren gegangen" — wurde nie als solcher gebaut. Was im
Memory-Stand mit „freshness check on ingest" gemeint war, ist
vermutlich die HTTP-expired-Detection (existiert) bzw. das times_seen-
Bump (existiert, aber semantisch nicht filter-relevant).

---

## Empfehlung Fix-Bundling

Engineer-Sicht — die vier Befunde gehören **nicht alle zusammen**:

### Bundle A — Worker-Pool erweitern (D2)

Architektur-Entscheidung first: Soll der Worker auch actionable-Mails
ingestieren? Wenn ja, ein einzeiliger Filter-Erweiterung in
`ingest_from_mail.py:161-170`. Folge-Frage: ACK-Status-Mapping wenn
Worker eine actionable Mail processiert (heute alle ACK-Status sind
silent-spezifisch?). Risiko: bestehende silent-Mails-Logik nicht brechen.

→ Eigener kleiner Bauteil, abhängig von Architekt-Entscheidung.

### Bundle B — Inserat-Ebene-Korridor (D3)

Wenn Architekt sagt „ja, Worker soll out-of-corridor-Inserate
rauswerfen", dann: PLZ-Extraktion aus Expose-Page (BeautifulSoup auf
strukturierte Daten / Adresse-Block), Match gegen `korridor_whitelist`
direkt im Worker, neue ACK-Status `filtered_out_of_corridor`. Hängt
strukturell mit Bundle A zusammen — gleiche Datei (`ingest_from_mail.py`),
gleiche ACK-Tabelle.

→ Mit Bundle A bundlen, eigener Commit pro Sub-Aufgabe.

### Bundle C — Freshness-Filter (D4)

Neuer Mechanismus, nicht trivial. Vorfrage Architekt: ist Inserat-
Veröffentlichungs-Datum überhaupt verlässlich aus Portalen extrahierbar?
ImmoScout/Comparis/Homegate haben unterschiedliche Strukturen. Wenn ja:
neuer Filter im Worker analog Korridor, neue regelwerk-Schwelle
`filters.hauskauf.max_listing_age_days`. Wenn nein: alternativer
Mechanismus (`times_seen > N` als Indikator für „dieses Inserat hängt
schon").

→ Eigener Bauteil, separater Branch. Kann mit Bundle A/B parallel
oder seriell.

### Bundle D — UI (D1)

Kein Fix nötig — Code ist auf main. Wenn Browser stale: Hard-Reload.

### Gesamt-Empfehlung

1. **Architekt-Entscheidung zuerst** für D2 (Worker-Pool) — bevor Code-
   Änderung Sinn macht.
2. Falls D2 → ja: Bundle A + B in einem Branch, atomare Commits.
3. D3 (Freshness) als eigenständiger Folge-Bauteil, sobald D2/D3
   merge'd sind.
4. D1 nichts zu tun.

---

## Constraints-Compliance

- ✓ Read-only — keine Code/Schema-/Filter-Änderungen.
- ✓ SQL-Queries + Log-Auszüge in dieser Field-Note.
- ✓ Konkrete Mail-IDs identifiziert (598, 613, 595), keine vollen Bodies.
- Sub-Diagnosen jeweils < 30 Min Engineer-Wall-Clock.
