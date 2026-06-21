# Fieldnote: Folio Pending-ACK Integration (2026-05-31)

**Repo:** `~/Projects/folio/`
**Branch:** `feature/folio-pending-ack-integration-2026-05-31` · 3 Commits, kein Push.
**Pendant:** `~/Projects/aion-lumen/council/docs/fieldnotes/fieldnote-council-worker-pending-ingest-2026-05-31.md`.

## Anlass

Council-Repo bekommt einen pending_ingest-Worker (separate Direktive). Worker schreibt nach jedem Ingest-Versuch eine ACK-Row in `council.ingest_acks`. Folio liest cross-DB read-only und setzt `pending_ingest.processed_at` im eigenen Scope — **kein Cross-DB-Write** (C-Klausel aus Cross-Session-Bewertung 31.5.).

## Was geändert

### Commit 1 — `feat(council-db): getRecentIngestAcks + writer-ts-erweiterung`

`src/lib/server/council-db/reader.ts`:
- Neuer Reader `getRecentIngestAcks(): IngestAckRow[]` liest `council.ingest_acks` read-only. Tolerant gegen fehlende Tabelle (try/catch → return `[]`) — hält Folio funktionsfähig, auch wenn der Council-Worker-Branch noch nicht deployed ist.
- Neuer Type `IngestAckRow` exportiert.

`src/lib/server/folio-db/writer.ts:314`:
- `markPendingIngestProcessed(id, ts?)`: optionaler Timestamp-Parameter. Default bleibt `new Date().toISOString()`. Erlaubt der ACK-Reconciliation, den Worker-Zeitstempel zu propagieren statt „now()" beim Folio-Update zu setzen.

### Commit 2 — `feat(pipeline): ACK-reconciliation im pending-loader`

`src/routes/(council)/council/mobile/pipeline/+page.server.ts`:
- Vor dem `listPendingIngestUnprocessed()`-Aufruf: ACKs lesen, Set der noch pending-Ids bilden, für jede ACK in diesem Set `markPendingIngestProcessed(id, ack.processed_at)`. Danach Re-Read der Pending-Liste.
- Append-only-ACK + idempotenter Folio-UPDATE = race-frei.

## Architektur

Cross-DB-Pattern:

```
council-worker (python)              folio pipeline-loader (ts)
        │                                       │
        │ INSERT INTO council.ingest_acks      │
        │ (pending_ingest_id, status, ...)      │
        │                                       │ SELECT * FROM council.ingest_acks
        │                                       │      (cross-DB read-only)
        │                                       │
        │                                       │ UPDATE folio.pending_ingest
        │                                       │ SET processed_at = ack.processed_at
        │                                       │ WHERE id = ack.pending_ingest_id
        │                                       │      (own-scope write)
```

Worker schreibt nur in seine eigene DB, Folio schreibt nur in seine eigene DB. Ownership-Regel hält.

## Test-Strategy (End-to-End, offen)

1. Council-Worker-Branch lokal lauffähig machen (oder manuelles INSERT in `council.ingest_acks` für Test).
2. Eine `pending_ingest`-Row im UI einreichen (Mobile-Pipeline-Tab).
3. Worker-Trigger (manuell oder warten auf launchd).
4. Mobile-Pipeline neuladen / 30 s-Polling-Tick abwarten.
5. Pending-Card sollte verschwinden, weil `processed_at` jetzt gesetzt ist.

## Klauseln

- **C-Klausel** (Cross-DB-Write verboten): eingehalten — Folio schreibt nur in folio.db, Council nur in council.db.
- **D-Klausel** (7-Tage-Heuristik): Worker steht, Folio-Seite steht. Frist nicht relevant.
