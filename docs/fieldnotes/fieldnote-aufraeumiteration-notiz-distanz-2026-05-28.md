# Field-Note — Aufräum-Iteration: Notiz-Reset + Distanz-Sichtbarkeit (2026-05-28)

**Direktive:** Architekt-Direktive nach erstem Real-LLM-Test des Council-Bauteils — drei Befunde, davon zwei im folio Mail-Triage-UI
**Branch:** `feature/aufraeumiteration-notiz-distanz-2026-05-28`
**Commits:** `368cc46` Bug 2 (Notiz-Reset) · `68b8bf2` Bug 1 (Distanz-Mess)

## Befunde

| # | Symptom | Severity |
|---|---|---|
| 2 | Notiz-Textfeld leakt across mail-Wechsel: noteInput=$state('') ist Component-Local, kein Reset bei Props-Wechsel. A's Text war in B's VerdictStage sichtbar; Save landete als B's Notiz. Bereits gespeicherte Notiz beim Re-Open einer Mail nicht sichtbar. | **Daten-Risiko** |
| 1 | Distanz aus Detail-Panel verschwunden: "Aktive Regeln"-Block zeigte nur `distance_threshold_km` (≤ 40 km), nicht die tatsächlich gemessene Luftlinie. User musste raten ob ein Inserat in-Reichweite ist. | Anzeige |

## Bug 2 — Notiz-Reset (Commit `368cc46`)

### Root-Cause
`VerdictStage.svelte:58` hatte `let noteInput = $state('')` — Svelte 5 reaktiviert das nicht bei Props-Wechsel (Component-Instance bleibt am Leben, nur `row` wird neu zugewiesen). Folge: `pickDomain`/`pickAction`/`toggleMarker` (Zeilen 79/85/92) lesen stale noteInput.

### Fix (drei Bausteine)
1. **$effect resync auf row.uid-Wechsel:** `lastUid: string | null = $state(null)`, $effect feuert initial + bei jedem row-Wechsel → `noteInput = row.correction?.note ?? ''`. Das löst auch das Re-Open-Problem (saved-note wird beim Mount initial geladen).
2. **Expliziter "Speichern"-Button** neben dem Textfeld. `disabled` wenn `noteInput.trim() === row.correction?.note ?? ''` (No-Op-Schutz).
3. **saveNoteBlur als Safety-Net** (existiert): browser-event-order garantiert `blur` vor `click` auf neue Mail → Save fired bevor `$effect` resetet. **Edge-Fix:** vorher `if (!trimmed) return` verhinderte das Löschen einer gespeicherten Notiz durch Leerung. Neu: `if (trimmed === saved) return` + `onApply(..., trimmed || null, ...)` → leer == leer no-op, leer-nach-gespeichert sendet null und löscht in DB.

### Subtilität "kein retroaktiver Flush im $effect"
Der $effect-Handler hat keinen Zugriff auf die alte `row.correction` mehr (Prop wurde überschrieben). Korrekte Lösung war Save VOR Row-Wechsel (Save-Button + Auto-blur), nicht ein "vor-reset-flush" im Effect. Ein Versuch mit `untrack` + alter-Referenz wäre fragiler und unnötig — die zwei vorhandenen Save-Paths decken alle realen Flows ab.

### Test-Sequenz (User)
1. Mail A öffnen → "Test A" tippen → Speichern → Mail B (leer)
2. Mail A re-öffnen → "Test A" sichtbar
3. Mail A: ändern → andere Mail klicken OHNE Speichern → A re-öffnen → geänderter Text gespeichert (auto-blur)
4. Mail A: leeren → Speichern → DB-Notiz null

## Bug 1 — Distanz-Sichtbarkeit (Commit `68b8bf2`)

### Lösung
ActiveRules-Type um `distance_actual_km` + `distance_actual_city` erweitert. `computeActiveRules` bekommt jetzt zusätzlich `heuristicMarkers` + `homeCoords` und nutzt das existierende `extractPlzInfo` + `haversineKm` aus `$lib/util/distance.ts` (Reuse — keine neue Math).

Loader-Seite: `getHomePlz()` aus `$lib/server/env.ts` liefert `{plz, lat, lng, city}` (existiert seit 2026-05-25 Block 3). Einmalig pro Request resolved, dann pro Row durchgereicht. `unified.heuristic_markers` ist bereits geparst zu `string[]` in `unifyFeedbackRow` — direkt nutzbar.

### Display
EvidenceRules-Card-Zeile:
> 📏 Distanz-Schwelle: ≤ 40 km · gemessen: ~47 km (Loulé)

Bei Mail ohne plz_coords oder bei User ohne HOME_PLZ-Eintrag in HOME_COORDS-Map → nur Schwelle, kein Crash.

### Test-Sequenz (User)
- 3 Mails durchklicken: in-Reichweite (~15 km Basel), knapp-drüber (~47 km Loulé), weit-weg (~800 km Hamburg).
- Mail ohne PLZ-Match → "≤ 40 km" alleine.

## Out of scope dieser Iteration

- **Threshold-Match-Indikator** (rote/grüne Markierung wenn actual > threshold): würde Tier-Logik anschneiden — separater Commit wenn überhaupt.
- **PLZ-Resolver für unbekannte home-PLZ:** aktuell hardcoded Map in `env.ts` mit fallback auf env-vars. Sauberer Resolver (z.B. via OpenStreetMap) ist Tech-Debt für später.
- **`'abgelaufen'`-Filter in Folio-Reader** (Council-Härtung-Field-Note: 3-LOC-Update — separater Commit, nicht hier mit drin).
- **Wunsch 3 (PLZ-Country-Filter):** in `multi-agent` separater Branch `feature/plz-land-filter-2026-05-28`, eigene Field-Note dort.

## Verifikation

```bash
cd ~/Projects/folio && npm run check
# 0 ERRORS, 24 WARNINGS (pre-existing accessibility-warnings, nichts neues)
```

Browser-Test pending → User.
