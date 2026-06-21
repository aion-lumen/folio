# Fieldnote: Council-Mobile Aufräum-Iteration nach Pixel-Test (2026-05-31)

**Branch:** `feature/council-mobile-aufraeumen-pixel-test-2026-05-31` · 5 Commits, kein Push.

## Anlass

Erster echter Pixel-Test des Mobile-Council-UI (via Tailscale) brachte fünf Themen ans Licht. Architekt-Brief 2026-05-31 sortierte sie in „echte Fehler/Lücken zuerst, UX danach". Cross-Session-Bewertung gibt alle vier Folio-Issues frei (mit Klauseln, siehe unten); Issue 4 wird eigene Direktive im aion-lumen-Repo:

- ✅ Issue 1: Verlauf zeigt eigene Aktionen nicht (Self-Filter)
- ✅ Issue 2: Borda-konsolidierte Top-10 fehlt im Mobile
- ✅ Issue 3: Suche „hängt" — Debounce 400 ms + Skeleton
- ⏸ Issue 4: Pending-Status > 24 h — wird durch Council-Worker-Direktive gelöst (separates Repo, ACK-Pattern)
- ✅ Issue 5: Schrift zu klein für Pixel-Lesbarkeit

## Was geändert

### Commit 1 — `fix(council-mobile): verlauf zeigt jetzt eigene aktionen`

`src/lib/server/council-db/reader.ts`: `getRecentEvents(userId, since)` → `getRecentEvents(since)`. Self-Filter `WHERE user_id != ?` in den drei Folio-Queries (object_status_override, user_rankings, object_triggers) entfernt. Events tragen plain `user_id`; Self-vs-Partner wird Render-Concern, nicht Daten-Concern.

`VerlaufEvent`-Discriminator umbenannt: `'partner-status/top10/trigger'` → `'status/top10/trigger'`.

`src/lib/server/folio-db/reader.ts`: neuer Batch-Helper `getUsersById(ids)`.

`src/routes/(council)/council/mobile/+page.server.ts`: sammelt distinct `user_id` aus Events, hydratisiert via `getUsersById`, gibt Map + `currentUserId` mit.

`EventEntry.svelte`: `kind` erweitert um `'self'` (subtilere graue Glyph-Variante).

`+page.svelte`: `actorLabel(uid)` liefert `'Du'` für Self, `display_name` für Partner. Switch-Cases aktualisiert.

`getPipelinePulse`: Partner-Pick filtert jetzt explizit `user_id !== self`.

### Commit 2 — `feat(council-mobile): borda-toggle in meine-10`

`src/routes/(council)/council/mobile/meine-10/+page.server.ts`: Loader liefert zusätzlich `bordaItems` (top.slice borda_rank 1..10, schon im `readCouncilTop`-Call vorhanden — Loader nutzte ihn bisher nur für Voices-Lookup).

`meine-10/+page.svelte`: `view: 'mine' | 'borda'`-State, Pill-Toggle oben. `mine`-View: bestehende SortableList unverändert. `borda`-View: read-only, ObjectCard mit Rang-Badge links, Borda-Score rechts. Empty-State für Borda mit Hinweis auf 4 h-Worker-Takt.

### Commit 3 — `refactor(council-mobile): typo-tokens, schrift groesser fuer pixel`

`mobile-tokens.css`: neue Tokens `--text-xs (10.5px), --text-sm (12px), --text-base (14px), --text-md (15px), --font-weight-medium/bold`. Scope bleibt `:where(.council-mobile-root)`, Desktop unangetastet.

Vier Components umgestellt: ObjectCard (12.5→14 title, 10→12 spec/extra), EventEntry (9→10.5 when, 12→15 glyph, 12.5→14 body), PulseBlock (8.5→10.5 chip-lbl), PendingIngestList (9.5→10.5 row).

### Commit 4 — `fix(council-mobile): suche entzaehen — debounce 400ms + skeleton`

`src/routes/(council)/council/mobile/suche/+page.svelte`: Debounce 250 → 400 ms (Tailscale-RTT 50–300 ms + Debounce 250 ms wäre 300–550 ms wahrnehmbares Hängen pro Tastendruck). `navigating` aus `$app/state` importiert, `isSearching`-`$derived` triggert Skeleton-Liste (4 Platzhalter mit Pulse-Animation) während `goto()` läuft. Kein `invalidate()`, kein `depends()`, kein Client-Side-Filter — falls weiterhin „hängt": Folge-Iteration.

## Architektonische Entscheidungen mit Reichweite — Klauseln aus Cross-Session-Bewertung

- **A-Klausel (Verlauf, Daten-vs-Render-Trennung):** Bleibt Council-spezifisch in dieser Iteration. **KEIN** Übertragen auf Mail/Vault-Activity-Feeds. Verallgemeinerung erst wenn zweiter Activity-Feed konkret wird.
- **B-Klausel (Mobile-Typo-Tokens):** Tokens leben unter `:where(.council-mobile-root)`. Beim ersten Mobile-Component **außerhalb** Council wandert das Token-Set (`--text-xs/sm/base/md`, `--font-weight-medium/bold`) aus `mobile-tokens.css` raus nach `tokens.css` auf Root-Ebene. Council-spezifische Overrides bleiben sichtbar als Override im Council-Mobile-Scope.
- **C-Klausel (Council-Worker, ACK statt Reverse-Write):** Cross-DB-Write von Council nach Folio bleibt **verboten** — Ownership-Regel hält. ACK-Pattern (Variante 1 Tendenz): Worker schreibt nach erfolgreichem Ingest ein ACK in eine eigene Council-Tabelle (`council.ingest_acks` o.ä.); Folios Pending-Polling-Pfad liest cross-DB read-only und setzt `pending_ingest.processed_at` im eigenen Scope. Variante 2 (Datei-ACK über `data/ack/<id>.json`) ist Backup-Option, falls Konsistenz mit File-Queue-Pattern überwiegt — braucht Folio-Watcher.
- **D-Klausel (Worker-zuerst mit Pragmatik):** Worker-zuerst gilt, mit 7-Tage-Heuristik ab Branch-Beginn. Wenn Worker steht: gut. Wenn nicht: UI-Pflaster nachträglich erlaubt, kein moralisches Pflaster-Verbot.

## Verifikation (offen — auf Pixel via Tailscale)

1. Verlauf-Tab: Self-Aktion → Eintrag mit „Du …" ohne Partner-Stil. Partner-Aktion → mit Display-Name, blauer Glyph.
2. Meine-10-Toggle: „Meine 10" ↔ „Council-Borda" wechselt instant. Drag-Drop nur in `mine`.
3. Suche: Tippen fühlt sich responsiv an, Skeleton während RTT, Resultate erscheinen.
4. Schrift: Adresszeile in Karten klar lesbar.

## Folge-Direktiven (offen)

- **Council-Worker (Issue 4):** eigene Direktive im `~/Projects/aion-lumen/council/`-Repo. ACK-Pattern Variante 1: Worker schreibt ACK in `council.ingest_acks` (neue Tabelle, Schema: `pending_ingest_id INT, council_object_id TEXT, acked_at TIMESTAMP, status TEXT`); Folio liest cross-DB read-only und setzt `pending_ingest.processed_at` im eigenen Scope. Wiederverwendet `normalize_url` + `fetch_with_canonical` aus `ingest_from_mail.py`. Trigger via neuer launchd-Plist (stündlich/30 min). 7-Tage-Heuristik gilt (D-Klausel).
- **Suche-Folge-Iteration (falls notwendig):** Client-Side-Filter mit Vorabladen — Loader liefert beim ersten Hit Gesamtbestand als JSON, UI filtert lokal. Nur wenn Debounce+Skeleton im Pixel-Test weiterhin „hängt" sich anfühlt.
