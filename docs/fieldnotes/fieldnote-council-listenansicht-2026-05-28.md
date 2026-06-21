# Field-Note — Council Iteration 2 Bauteil 3: Listen-Ansicht (2026-05-28)

**Direktive:** Skizze v2 §Reihenfolge §3 + User-Direktive 2026-05-28
**Branch:** `feature/council-iteration-2-listenansicht-2026-05-28` (folio only)
**Status:** Liste lädt aus council.db, Browser-verifiziert (User-Bestätigung), 0 type-errors

## Scope

Echte Top-10-Listen-Ansicht unter `/council` (Placeholder ersetzt). Voraussetzung für **Frau-Test** (v2-Schritt 4) — ein reales Objekt muss end-to-end sichtbar sein, auch wenn die Bewertung noch Mock/erste-Real-Läufe ist.

## Cross-DB-Pattern

Folio liest `~/.council/council.db` **read-only** via separate Connection:

```ts
// src/lib/server/council-db/reader.ts
const _conn = new Database(COUNCIL_DB_PATH, { readonly: true, fileMustExist: true });
```

Konsistent mit existierendem `feedbackConn()`-Pattern in `/api/mail/correction/+server.ts:19-27` (read-only auf multi-agent/state/feedback.db). Lazy-init, kein eager DB-Open beim Modul-Load.

Schreibseite bleibt vollständig im council-Repo (Python-Worker: ingest_from_mail.py, council_lens_run.py, council_borda.py). Folio nimmt KEINE Write-Rolle auf council.db — keine UPDATE/INSERT-Pfade hier.

## Server-Compute pro Page-Load

`+page.server.ts` macht die schwere Arbeit:

1. **Latest computed_at** aus consolidated_top10 (per `MAX(computed_at)`)
2. Alle 10 rows dieses Run-Snapshots (sortiert nach rank ASC)
3. Status-Filter angewandt (default: nicht-archiv und nicht-verworfen; oder exakte status-Wahl)
4. Pro Object: latest rankings über alle 3 Lenses (latest-wins per (lens_id, object_id) via DESC recorded_at)
5. Confidence-Lookup aus latest lens_comparisons pro (lens_id, object_id)
6. Personas-YAML aus `~/Projects/aion-lumen/council/config/personas.yaml` für Lens-Labels (5min-Cache)
7. CouncilVoice-Array pro Object (3 Slots, missing-Slot wenn Lens für dies Object kein Ranking hat)
8. Konsens-State pro Object: still wenn alle 3 Lenses gleicher score_bucket, ne bei 1 Abweicher, ne-strong bei 3 verschiedenen Buckets oder ≤1 voter

Counts pro status_tag (für Filter-Chip-Badges) in zweiter Query.

## Voices-Datenmodell für Council

Parallel zum Mail-Voice-Type (`$lib/server/lenses/voices.ts`), aber datenseitig **unterschiedlich**: Council-Voice hat Rang + Score-Bucket statt Domain.

```ts
type CouncilVoice =
  | { kind: 'present'; lens_id, label, rank, score_bucket: 'top'|'mid'|'low', confidence: 'low'|'medium'|'high'|null }
  | { kind: 'missing'; lens_id, label };
```

Score-Bucket-Mapping: rank 1-3 = top, 4-7 = mid, 8-10 = low. Visual-Encoding in der Kachel:
- top → grün
- mid → amber
- low → neutral-grau
- low-confidence → 55% opacity
- missing → dashed-transparent

## Komponenten

| File | Zweck |
|---|---|
| `src/lib/server/council-db/types.ts` | CouncilObjectRow, CouncilVoice, CouncilTopObject, CouncilConsensusState, CouncilPersonaMeta |
| `src/lib/server/council-db/reader.ts` | `getCouncilDb()` (lazy), `loadPersonas()` (yaml + 5min-cache), `readCouncilTop(status)`, `countObjectsByStatus()` |
| `src/lib/council/CouncilStimmenStreifen.svelte` | 3-Slot-Streifen, Score-Bucket-Color, Bühnen-State still/ne/ne-strong |
| `src/lib/council/CouncilObjectCard.svelte` | Listen-Item mit Foto+Rang+Score+Status-Pill+Streifen+Stammdaten |
| `src/routes/(council)/council/+page.server.ts` | Loader: status-Filter aus URL, Top + Counts |
| `src/routes/(council)/council/+page.svelte` | Header (Titel+UserBadge) + Filter-Chips + Liste / Empty-State |

## Status-Filter-Semantik

- **Default** (`?status=default` oder kein Param): nicht-archiv + nicht-verworfen
- **Alle** (`?status=all`): inkl. archiv + verworfen
- **Kaufen** / **Beobachten** / **Verworfen** / **Archiv** / **Neu**: exakte status_tag-Wahl

URL-State: `?status=…` (deletable wenn default). Counts pro Chip immer aktuell.

## Stimmen-Streifen Wiederverwendung — Pragmatisch

Direktive: "Stimmen-Streifen-Komponente aus Mail wiederverwenden (council-tauglich parametrisiert beim Stimmen-Streifen-Bau)."

**Pragmatische Auflösung:** eigene `CouncilStimmenStreifen.svelte` mit denselben CSS-Tokens und visuellem Vokabular wie Mail's StimmenStreifen, aber eigene Datenachse. Beide haben:
- gleiches Kachel-Layout
- gleiche Bühnen-States (still/ne/ne-strong) mit Ember-Box-Shadow bei ne-strong
- gleiches missing-Treatment (dashed-Kachel)

Aber:
- Mail-Voice: kategorial (Domain → fixe Farbe pro Kategorie)
- Council-Voice: ordinal (Rang → bucketized Farbe)

Bei späterer Iteration kann das in eine generische Basis-Komponente mit Slot/Snippet refaktoriert werden. Für Iteration 1 sind 2 parallele Komponenten sauberer als ein Adapter — verhindert Coupling zwischen Mail- und Council-Datenmodellen.

## Cross-DB-Auth-Display — Iter-1.5-Limitation gelöst

`rankings.participant_id` ist String (z.B. `lens-baumeister`, `user-1`). Für die Lens-Slots im Streifen wird der display-name aus `personas.yaml` resolved (`loadPersonas()`-Cache, 5min-TTL). Für künftige User-rankings (heute noch nicht im Schema-Pfad genutzt) müsste folio's `getUserById()` analog aufgerufen werden.

**Heute:** nur Lens-Voices im Streifen → personas.yaml-Lookup reicht. **Limitation** für später: wenn User-Rankings im UI auftauchen (z.B. „dein Rang vs Lenses"), muss eine `participant_id → display_name`-Resolution für `user-<folio_id>` ergänzt werden.

## Single-User-Modus (Iter 1)

Keine Multi-User-Pokerkarten (User-Top-3 sichtbar bei anderen). Keine Per-User-View-Filter. Der `user-badge` zeigt nur, wer eingeloggt ist (afshin · owner für localhost-Direktzugriff). Pokerkarten kommen mit Iteration 2 (Skizze v2 §Konsens-und-User-Mechanik).

## Verifikation

- folio `npm run check`: **0 errors**, 24 pre-existing warnings unchanged
- Browser-verify (User-Bestätigung): Liste mit 9 Items lädt korrekt aus dem letzten `--no-llm`-Smoke. Filter-Chips funktional.
- Cross-DB-Read: `~/.council/council.db` wird read-only geöffnet, keine Schreib-Pfade aus folio.

## Bekannte Limitations (für später)

1. **Object-Detail-Route fehlt** (`/council/object/[id]`). Heute click auf Title öffnet externe Inserate-URL. Bauteil 3.5 oder 4.
2. **Sitzungs-Ansicht fehlt** (`/council/session/[id]`). Bauteil 4 mit Doppellauf-Mechanik.
3. **User-Aktionen aus UI** (kaufen/beobachten/verwerfen Toggle): nicht implementiert — würde Write-Pfad auf council.db von Folio aus voraussetzen. Heute können User-Aktionen nur über direkten DB-Edit (oder ein späteres council-side API) erfolgen.
4. **Drag-Drop-Top-10-Pflege:** Iteration 2.
5. **Personas-Resolution-Cache:** 5min TTL. Bei personas.yaml-Edit muss man kurz warten oder dev-server neu starten.
6. **User-Resolution für participant_id startswith `user-`:** noch nicht implementiert (heute nur Lens-Voices). Wenn User-Rankings im UI auftauchen, muss `getUserById()` ergänzt werden.

## Mobile-Layout

Iteration 1 = Desktop-only (Skizze v2 §Web-Layer). iPhone via Tailscale-Zoom. Mobile-eigene Variante kommt nach Frau-Test wenn Mobile-Use real ist.

## Reihenfolge danach (Skizze v2)

- **Schritt 4 (Frau-Test):** Liste mit echtem Lens-Lauf (kein --no-llm) durchspielen. Voraussetzung: LM-Studio läuft, council-Worker hat min. einen vollen Lauf gemacht.
- **Schritt 5:** Object-Detail-Ansicht
- **Schritt 6:** Sitzungs-Ansicht + Vorsitz-Bar
- **Schritt 7:** User-Top-10-Pflege (Drag-Drop + Status-Toggle via Write-API)
- **Schritt 8:** In-Context-Learning für Lens-Memory
