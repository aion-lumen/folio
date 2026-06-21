# Field-Note — Sub-Bauteil 1c: Link-Ingest-Endpoint

**Datum**: 2026-05-30
**Branch**: `feature/council-mobile-1c-link-ingest-2026-05-30`
**Direktive**: Council-Mobile-UI v2 — Tab 2 Block 2 (Link-Eingabe)

## Was gebaut

`POST /api/council/ingest` validiert URL + Portal-Whitelist und schreibt in folio.db.pending_ingest. LinkInputBox aus 1b wurde aktiviert (war disabled-Stub), neue Komponente PendingIngestList zeigt unprozessierte Rows mit ETA, 30s-Polling im Pipeline-Page reagiert auf Worker-Ack.

Out-of-Scope (in eigener Council-Repo-Direktive nach Mobile-UI-Abschluss): Council-Worker liest cross-DB `WHERE processed_at IS NULL`, prozessiert die URL, stempelt `processed_at` zurück. Bauteil 0.5 hat das Schema vorbereitet.

## Portal-Whitelist als Sicherheits-Hygiene

Architekt-Anmerkung übernommen: nicht nur URL-Format prüfen, sondern auch Hostname gegen die in `~/Projects/aion-lumen/council/config/portals.yaml` definierten `enabled: true`-Portale. Source-of-Truth ist die existierende Council-Worker-Config — keine Folio-Duplikation der Domain-Liste.

Neuer Helper `src/lib/server/council-db/portals.ts`:
- liest portals.yaml mit 5-Min-Cache (gleiches Pattern wie `loadPersonas`)
- `isSupportedPortalUrl(url): { ok, reason?, portal? }` prüft Wohlgeformtheit → http(s)-Scheme → Hostname (exact-match oder Subdomain einer Portal-Domain)
- `listSupportedDomains()` exposed für Tests/UI-Helfer

Aktive Whitelist (Stand 2026-05-30):
- homegate.ch
- immoscout24.ch
- comparis.ch
- newhome.ch
- immobilienscout24.de
- immowelt.de

## API-Vertrag

### `POST /api/council/ingest`
- Request: `{"url": "https://..."}`
- Auth: `locals.user` (Tailscale-Header oder localhost-Default)
- Success: `200 {"ok": true, "id": <pk>, "url": <stored>, "submitted_at": <iso>}`
- Errors (alle 400 mit deutschem `message`):
  - „URL fehlt" (leerer/fehlender Body)
  - „URL ist nicht wohlgeformt" (URL-Parse-Fehler)
  - „Nur http(s) erlaubt, nicht ftp:" (Scheme-Filter)
  - „Portal nicht unterstützt (host) — Wende dich an Afshin" (Whitelist-Reject)

## Pending-List + ETA

`PendingIngestList.svelte` zeigt unprozessierte Rows als dunkle Sub-Box unter der LinkInputBox. Jede Row: pulsierender Lumen-Dot · Host · gekürzter Path-Snippet · `~Xh Ymin` bis nächster 4h-Tick.

ETA-Heuristik: nächster Cron-Slot in `{0, 4, 8, 12, 16, 20}` Uhr. launchd-Schedule des Council-Workers ist nicht aus Browser abrufbar — die Heuristik ist ehrlich („~2h" statt „in 1h 47min") und akzeptiert mögliche Abweichungen.

## Polling-Pattern

Pipeline-Page setzt im `onMount` ein `setInterval(invalidateAll, 30_000)`. Bedingt: nur wenn `data.pendingIngest.length > 0`. Sobald der Worker eine URL gestempelt hat, verschwindet sie aus `listPendingIngestUnprocessed`, und die Polling-Reload zeigt das. Sobald die Liste leer ist, schläft das Polling natürlich (Bedingung im Tick).

Cleanup im `onMount`-Return verhindert Leak beim Tab-Switch.

`invalidateAll()` reloadt nur die Server-Loader, kein Full-Page-Refresh — minimal Network, kein Flicker.

## Verifikation (alle ✓)

1. `npm run check` — 0 neue Errors.
2. `POST /api/council/ingest` für 6 Cases:
   - `https://www.homegate.ch/buy/123456` → 200 + Row
   - `https://www.immowelt.de/expose/abc-def` (Subdomain) → 200 + Row
   - `https://evil.example.com/foo` → 400 „Portal nicht unterstützt"
   - `not-a-url` → 400 „URL ist nicht wohlgeformt"
   - `{}` (kein url-Feld) → 400 „URL fehlt"
   - `ftp://homegate.ch/x` → 400 „Nur http(s) erlaubt, nicht ftp:"
3. Pipeline-Page rendert `pending-list` mit 2 Hosts.
4. **Ack-Roundtrip**: `UPDATE pending_ingest SET processed_at='…' WHERE id=3` → Reload zeigt nur noch row 4 in pending-list.
5. Cleanup: alle Test-Rows entfernt.

## Limitations / Out of Scope

- **Council-Worker** existiert noch nicht — `pending_ingest`-Rows bleiben unprozessiert bis die Folge-Direktive im Council-Repo den Worker-Pfad implementiert (`SELECT … WHERE processed_at IS NULL` → fetch + ingest_from_link → `UPDATE pending_ingest SET processed_at = NOW()`).
- **Duplikat-Erkennung**: zwei mal die selbe URL einkippen → zwei pending-Rows. Worker-Direktive sollte canonical-resolve + UPSERT machen; folio-seitig kein Filter.
- **iOS Share-Target**: PWA-Manifest + Share-Sheet-Integration (Direktive nennt das als Iteration 2). Heute Copy/Paste in Textfeld.
- **Worker-Run-Live-Status**: ETA ist Heuristik, kein realer Heartbeat. Bei Bedarf später ein `/api/council/worker/last-run` für genaue ETA.

## Critical Files

- **neu** `src/lib/server/council-db/portals.ts` — Portal-Whitelist-Loader + isSupportedPortalUrl
- **neu** `src/routes/api/council/ingest/+server.ts` — POST-Endpoint
- **neu** `src/lib/council/mobile/PendingIngestList.svelte`
- **edit** `src/lib/council/mobile/LinkInputBox.svelte` — aktiviert (fetch + bind:value + error-display)
- **edit** `src/routes/(council)/council/mobile/pipeline/+page.server.ts` — `listPendingIngestUnprocessed` + return
- **edit** `src/routes/(council)/council/mobile/pipeline/+page.svelte` — `<PendingIngestList>` + 30s-Polling onMount

## Damit ist 1c komplett

User kann auf Mobile-Pipeline einen Inserat-Link einfügen → wird validiert + queued. Pending-Zeile zeigt, dass etwas läuft. Sobald der (noch zu bauende) Council-Worker fertig ist und `processed_at` setzt, verschwindet die Zeile beim nächsten Polling-Tick.

Folgt: 1d (Schreib-Aktionen im Detail + Drag-Drop Meine-10), 1e (Suche).
