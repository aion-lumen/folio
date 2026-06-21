# Field-Note — Sub-Bauteil 1d: Schreib-Aktionen im Detail + Meine-10-Drag-Drop

**Datum**: 2026-05-30
**Branch**: `feature/council-mobile-1d-schreibaktionen-meine10-2026-05-30`
**Direktive**: Council-Mobile-UI v2 — Tab 3 (Meine 10) + Detail-Schreib-Aktionen

## Was gebaut

Drei Schreib-Endpoints und alle dazugehörigen UI-Pfade aktiviert. Detail-Einordnung-Stub aus 1a durch echte interaktive Komponenten ersetzt. Meine-10-Tab-Placeholder durch Drag-Drop-Liste mit pointer-event-basierter Sortierung ersetzt.

## Tailscale-Latenz-Architektur

Architekt-Klarstellung: 50–300ms RTT via Tailscale-Mesh (DERP-Relay-Fallback bei NAT). Konsequenzen umgesetzt:

| Aktion | Pattern |
|---|---|
| Status-Tag-Klick | **Optimistic**: lokaler State sofort, POST async, revert + Error bei Fehler |
| Notiz-Tippen | **Debounced 1.5s** + expliziter Save-Button. Kein POST pro Tastendruck. |
| Top-10-Pick | **Optimistic**: Picker schliesst sofort, Rang-Label aktualisiert lokal, POST async, revert bei Fehler |
| Drag-Drop Meine-10 | **Optimistic**: Visuelle Reorder sofort beim Drop, POST async, revert bei Fehler |

## Notiz-Editor-Mechanik

`NoteEditor.svelte` (`src/lib/council/mobile/detail/`):
- `text` bind:value, `lastSaved` als Vergleich für `dirty`-State
- Bei jedem `oninput`: vorigen Timer canceln, `setTimeout(persist, 1500)` setzen
- „Speichern"-Button cancelt Timer und persistet sofort
- Bei Fehler: **kein** revert (würde User-Tipparbeit zerstören) → Eingabe bleibt, Error sichtbar, User kann manuell Save retriggern
- Empty-String wird gespeichert (Bauteil 0.6: Reader interpretiert als User-cleared)
- State-Indikator zeigt „—" / „ungespeichert" (pulsierend ember) / „Speichert…" (blau) / „gespeichert"

Auto-Save-on-Blur bewusst weggelassen — Mobile-Keyboard-Show/Hide triggert Blur, wir wollen das nicht als implizites Save interpretieren.

## Top-10-Picker mit Verdrängungs-Logik

`TopTenPicker.svelte` zeigt aktuelle Position oder „nicht drin", öffnet inline 11-Slot-Grid (1–10 + Entfernen).

Client-side Verdrängungs-Berechnung in `buildBatch(newRank)`:
1. Liste der aktuellen Top-10 ohne self (sortiert nach rank)
2. Wenn `newRank=0` (Entfernen): nur self → rank=0
3. Sonst: alle aktuellen Items mit `rank >= newRank` rutschen +1; self landet bei newRank; Item das nach >10 rutscht → rank=0
4. Diff gegen alten Stand → Batch enthält nur tatsächlich-bewegte Objekte

Server (Bauteil 0.5 `insertUserRankingBatch`) schreibt alle in einer Transaktion mit identischem ISO-Timestamp — Reader sieht atomaren Stand.

## SortableList — keine externe Library

`src/lib/council/mobile/meine10/SortableList.svelte`, ~120 LOC, generic über `T extends { id }`. Pointer Events:
- `pointerdown` auf Grip-Handle (nicht ganze Card): `setPointerCapture` + `startY`, `startIndex` merken
- `pointermove`: berechne `Math.round(delta / itemHeight)` → `targetIndex`, bei Änderung splice in internal `order`-Array
- `pointerup`: Diff zu props → wenn changed: `onReorder(snapshot)` callback fires
- Bei callback-throw: `order = [...items]` (revert)
- `touch-action: none` auf Grip-Handle verhindert iOS-Safari-Scroll-Konflikt

Begründung gegen npm-Dep (svelte-dnd-action o.ä.): die Logik passt in ~80 LOC, ist gut testbar, kein zusätzlicher Maintenance-Vektor. Pointer-Events sind unified Mouse + Touch + Pen, iOS Safari ≥ 13 OK.

Items: jeder Item rendert via Snippet-API mit `gripAttrs`-Spread-Objekt — Caller spread auf Grip-Element, übernimmt Cursor-Style + Pointer-Handler.

## Verdrängung beim Drag-Drop in Meine-10

Reorder-Logik in `meine-10/+page.svelte::commitReorder`:
1. Neue Reihenfolge ergibt sich aus Drag → Index 0..N-1
2. Für jedes Item: neuer Rang = Index+1
3. Batch enthält nur Items deren Rang sich änderte
4. Server schreibt batched

Kein 11. Item: Drag-Drop reorganisiert nur was schon drin ist. Das 11. Item wird im Detail-Picker hinzugefügt (dort greift die Verdrängungs-Logik mit rank=0).

## Verifikation (alle ✓)

1. `npm run check` — 0 neue Errors, 29 Warnings (alle pre-existing + 1 selbst-gefixt).
2. **3 Schreib-Endpoints**:
   - `POST /api/council/[id]/status {status_tag:'kaufen'}` → 200 + override-Row
   - `POST /api/council/[id]/note {note_text:'Erste Notiz'}` → 200 + note-Row
   - `POST /api/council/me/rankings {batch:[…]}` → 200 + 2 rankings-Rows mit identischem recorded_at
3. **Validierung**:
   - `status_tag: 'unknown'` → 400 „Ungültiger status_tag"
   - `rank: 11` → 400 „rank muss integer 0..10 sein, war 11"
4. **Detail-Page** rendert alle 3 Komponenten: Kaufen/Beobachten/Verwerfen-Buttons, Notiz-Editor vorgeladen mit „Erste Notiz", Top-10-Picker-Toggle.
5. **Meine-10-Page** rendert 2 sort-rows mit grip-handles.
6. **Cleanup**: alle Test-Daten entfernt (override, notes, rankings, views).

## Limitations / Out of Scope

- **Suche-Tab** (1e): noch Placeholder.
- **Polling-Optimierung mit Page Visibility API**: heutiges 30s-Polling aus 1c läuft auch im Background-Tab. Optimal wäre Stop-Polling wenn `document.hidden`. Klein, aber spätere Iteration — markiert hier als Kandidat.
- **Touch-Drag-Fallback**: Pointer Events deckt iOS Safari ≥ 13 und alle modernen Mobile-Browser ab. Sehr alte Geräte (iOS 12 etc) fallen zurück auf „Drag funktioniert nicht" — kein graceful degradation.
- **Unsaved-Note-Warning** bei Navigation: nicht modal. Save-Button pulsiert wenn dirty, das ist der Hinweis. Wenn User wegnavigiert ohne Save: Eingabe weg.
- **Drag-Drop-Reorder live-collaborative**: wenn beide User gleichzeitig draggen, gewinnt der spätere Schreiber (latest-wins per (user, object) ist user-spezifisch — kein Conflict, jeder hat seine eigene Top-10).
- **Animation der Geschwister-Karten während drag**: aktuell wird die ganze Liste re-rendered, der Grabbed-Item bewegt sich mit translateY, der Rest snappt zwischen Slots. Smoothere Inter-Slot-Animation wäre Polish.

## Critical Files

### Server
- `src/routes/api/council/[id]/status/+server.ts` (neu)
- `src/routes/api/council/[id]/note/+server.ts` (neu)
- `src/routes/api/council/me/rankings/+server.ts` (neu)

### Components
- `src/lib/council/mobile/detail/{StatusTagButtons,NoteEditor,TopTenPicker}.svelte` (neu)
- `src/lib/council/mobile/meine10/SortableList.svelte` (neu, generic)

### Routes
- `src/routes/(council)/council/mobile/[id]/+page.{server.ts,svelte}` — Einordnung-Stub ersetzt + `my_top_ranks`-Map im Loader-Return
- `src/routes/(council)/council/mobile/meine-10/+page.{server.ts,svelte}` — Placeholder ersetzt

## Damit ist 1d komplett

Frau (und Owner) können auf Mobile alles tun, was die Direktive listet: Objekte einordnen (Status-Tag + Notiz), in die Top-10 verschieben, in Meine-10 per Drag umsortieren. Alle Aktionen optimistic, Tailscale-Latenz nicht spürbar.

Verbleibend: 1e Suche. Danach: Frau-Test via Tailscale, dann Council-Repo-Direktive für `pending_ingest`-Worker.
