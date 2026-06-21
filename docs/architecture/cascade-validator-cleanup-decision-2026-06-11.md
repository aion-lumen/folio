# Decision-Doc — Cascade/Validator Doppel-Ausführung aufräumen

**Stand:** 2026-06-10 (Implementierung)
**Status:** ✅ umgesetzt · **D (modifiziert)** — Manager orchestriert Worker→Validator; Cascade entfernt; `parent_run_uuid`; imap_cleanup ans Validator-Ende
**Verwandt:**
- `docs/architecture/pipeline-cascade-validator-2026-06-11.html` — visuelle Architektur-Doku (HTML §1+§8)
- `docs/fieldnotes/fieldnote-pipeline-findings-2026-06-11.md` — F10-Befund
- aion-lumen commit `cf7b1dd` 2026-06-09 — „G3: Cascade-Default-on + Code-Hook" (der Ursprung)

---

## Befund (kurz)

`validator_batch.py` läuft pro Silent-Worker **zweimal** auf denselben Mails:

1. Als **Cascade-Subprocess** im Worker (`production_worker.py:1086–1152`) — unter demselben run_uuid, mit `--mail-ids` explizit übergeben.
2. Als **Auto-Validator-Run** danach (`worker-runner/manager.ts:212–233`) — separater run_uuid mit mode='validator', `--scope last-tranche`.

UPSERT auf `validator_opinions(feedback_id, validator_model)` macht das Endergebnis idempotent — aber die LLM-Calls laufen doppelt. Pro 5er-Tranche: **~10 min zusätzliche Wall-Clock-Zeit + 13 redundante LLM-Calls**.

**Ursache:** Cascade wurde 2026-06-09 eingebaut, der ältere Auto-Trigger im Manager wurde dabei nicht deaktiviert.

---

## DB-Beweis (folio.db worker_run_logs)

| run_uuid | mode | gemma | qwen | qwen-thinking | mail_ids |
|---|---|---|---|---|---|
| `e9e8b71c…` | silent | 5 | 5 | 3 | 1222–1226 |
| `0772096c…` | validator | 5 | 5 | 3 | 1222–1226 |

Silent endete `05:38:08.097`, validator startete `05:38:08.097` — **gleiche Sekunde**, identische mail_ids, identische voice-counts.

---

## Vier Lösungsvorschläge

| | A · Auto-Trigger raus | **B · Bedingt skippen** ★ | C · Cascade raus | D · Refactor |
|---|---|---|---|---|
| **Idee** | Auto-Validator weg, Cascade allein | Auto-Validator skip wenn `cascade_ok` | Cascade weg, Auto-Validator allein | Worker spawnt Validator-Run direkt |
| **Fallback bei Cascade-Failure** | ✗ keiner | ✓ Auto-Validator springt ein | n/a | n/a |
| **UI „Validator-Kaskade"** | bleibt | bleibt | weg (Dead Code) | weg |
| **UI „Validator läuft" separat** | weg | weg (Normalfall) | bleibt | bleibt |
| **Cross-Repo** | nein | nein | ja (aion-lumen + folio) | ja |
| **Frontend-Aufwand** | ~15 min | **0 min** | ~30 min | ~30 min |
| **Backend-Aufwand** | ~30 min | **~30 min** | ~60 min | ~90 min |
| **Risiko** | mittel | **niedrig** | mittel | hoch |
| **Total (Engineer-Wall-Clock)** | ~45 min | **~40 min** | ~90 min | ~120 min |

★ = Empfehlung (Begründung siehe unten)

---

## Vorschlag A — Auto-Trigger entfernen

**Was.** `worker-runner/manager.ts:208–233` (Auto-Trigger-Block) ersatzlos streichen. Cascade übernimmt die Validierung allein.

**Pro:**
- Radikalste Code-Reduktion.
- Cascade hat bereits alles: Validierung + auto_uebernahme-Hook + Logs.

**Contra:**
- Kein Fallback wenn Cascade scheitert (LM Studio während Worker down → Mails nie validiert).
- Pipeline-End-Merge-Logik in `workerRun.svelte.ts:196–270` muss vereinfacht werden (autoTriggerEligible-Branch wird Dead Code).
- Manuelle Validator-Runs (Picker → mode='validator') bleiben möglich — die Auto-Trigger-Logik betrifft nur die silent→validator-Kette.

**Effort:** Backend ~30 min · Frontend ~15 min (handleRunEnd vereinfachen) · Tests ~10 min.

---

## Vorschlag B — Bedingt skippen ★ Empfehlung

**Was.** Manager prüft vor dem Auto-Trigger, ob die Cascade im gerade beendeten silent-Run erfolgreich war. Wenn ja: skip. Wenn nein (cascade disabled / LM Studio down / cascade_failed): Auto-Validator läuft wie bisher als Fallback.

**Code (zwei Edits in `folio/`):**

1. Neuer Reader in `src/lib/server/folio-db/reader.ts`:

```typescript
export type CascadeStatus = 'ok' | 'failed' | 'unavailable' | 'none';

export function getCascadeStatusForRun(uuid: string): CascadeStatus {
  const row = openDb()
    .prepare(
      `SELECT message FROM worker_run_logs
       WHERE run_uuid = ? AND voice = 'cascade' AND event_type = 'info'
       ORDER BY seq DESC LIMIT 1`
    )
    .get(uuid) as { message: string } | undefined;
  if (!row) return 'none';
  if (row.message.includes('cascade_ok')) return 'ok';
  if (row.message.includes('cascade_failed')) return 'failed';
  if (row.message.includes('cascade_unavailable')) return 'unavailable';
  return 'none';
}
```

2. Conditional vor dem Auto-Trigger in `src/lib/server/worker-runner/manager.ts:212`:

```typescript
if (ctx.mode === 'silent' && status === 'completed' && ctx.mailsProcessed > 0) {
  // F10 fix: skip Auto-Validator if cascade already validated.
  if (getCascadeStatusForRun(uuid) === 'ok') {
    console.info('[worker-runner] cascade succeeded — skipping auto-validator');
    return;
  }
  // fall through to existing auto-validator spawn (Fallback-Pfad)
  ...
}
```

**Pro:**
- Niedrigstes Risiko: bestehende Logik bleibt als Fallback intakt.
- 0 Frontend-Changes: `maybeResubscribeForAutoTrigger`-Timeout-Pfad (`workerRun.svelte.ts:277–297`) handhabt den Normalfall „kein Auto-Run kommt" bereits korrekt → flush-as-solo-worker-Toast.
- Kleinste Code-Änderung (≈ 15 neue Zeilen).
- Behält Cascade als primären Pfad mit der besseren Integration (same run_uuid, „Validator-Kaskade"-Station im UI).

**Contra:**
- ~1020 ms Latenz beim Worker-only-Toast nach silent-Ende (3× setTimeout in maybeResubscribe wartet ergebnislos). Wenn störend: später optimierbar via Signal-Push vom Manager — separater Patch.
- Zwei Code-Pfade (cascade vs Fallback) bleiben — mehr zu testen.

**Effort:** Backend ~30 min · Frontend 0 min · Tests ~10 min · Total **~40 min**.

---

## Vorschlag C — Cascade im Worker deaktivieren

**Was.** `production_worker.py:1091` (`if args.cascade and not args.dry_run`) deaktivieren — Default `--no-cascade` setzen oder Block entfernen. Auto-Validator übernimmt die Validierung allein.

**Pro:**
- Validator-Run bleibt sauber als eigene Phase im UI (mode='validator').
- Logs sind klar getrennt: silent = nur Heuristik, validator = nur Validierung.

**Contra:**
- Cross-Repo: aion-lumen + folio.
- Folio's cascade-aware UI-Logik wird Dead Code: `LiveDetail.cascadePhase` (`:32–44`), `+page.svelte:cascadePhase + panelStack/Active`-Overrides (`:117–151`).
- Verlust der same-run_uuid-Integration: User sieht zwei separate Run-Cards statt einer mit Cascade-Innenphase.

**Effort:** Backend (aion-lumen) ~30 min · Backend (folio Dead-Code) ~30 min · Frontend ~30 min · Total **~90 min**.

---

## Vorschlag D — Refactor (Worker → Validator-Spawn direkt)

**Was.** Größter Eingriff. `production_worker.py` beendet sich nach der Heuristik-Phase ohne Cascade-Subprocess. Auto-Validator (folio worker-runner) übernimmt als eigener Run die Validierung — wie heute, aber als alleiniger Validator-Pfad.

Architektonisch sauberster Schnitt: Worker macht nur Heuristik, Validator nur Validierung, klare Lifecycle-Trennung in UI und DB.

**Pro:**
- Langfristig saubere Architektur.
- Klare mental model: ein Run = eine Phase.

**Contra:**
- Cross-Repo + größer als C.
- Selbe UI-Cleanup-Punkte wie C (cascadePhase weg).
- Refactor in `production_worker.py` muss imap_cleanup-Hook und auto_uebernahme-Hook neu verdrahten — die hängen heute an cascade_ok.

**Effort:** Backend (aion-lumen Refactor) ~60 min · Backend (folio) ~30 min · Frontend ~30 min · Total **~120 min**.

---

## Empfehlung: B

Drei Gründe:

1. **Niedrigstes Risiko.** Bestehende Code-Pfade bleiben als Fallback intakt. Wenn cascade weiterhin zuverlässig läuft, fällt sie nie auf. Wenn LM Studio mal hängt, springt Auto-Validator ein wie früher.
2. **0 Frontend-Touches.** `maybeResubscribeForAutoTrigger`-Timeout (3× 200 ms) wird zum Normalfall, fließt durch flush-as-solo-worker. Toast-Logik unverändert.
3. **15 Zeilen neuer Code.** 12 für den Reader, 3 für den Conditional. Reviewbar in einer Sitzung.

Wenn die ~1020 ms Toast-Latenz im Worker-only-Pfad spürbar nervt, ist Solution A der nächste Schritt — aber das ist eine UX-Folge-Entscheidung, nicht der Hauptbefund.

---

## Architekten-Entscheidung

```
[ ] A · Auto-Trigger ersatzlos entfernen
[ ] B · Bedingt skippen (Empfohlen)
[ ] C · Cascade im Worker deaktivieren
[x] D · Refactor — Worker→Validator-Spawn (modifiziert)
[ ] Anderes: _______________________________________________
```

**Notiz / Begründung:**

```
D modifiziert (2026-06-10): Kein Worker-Subprocess-Spawner — Folio manager.ts
orchestriert die Kette. Verbesserungen: expliziter --mail-ids-Handoff aus
worker_run_logs; parent_run_uuid in worker_runs für Verlauf-Verkettung;
imap_cleanup nach auto_uebernahme in validator_batch.py; failed-Run bei
Spawn-Fehler statt console.warn.
Field-Note: docs/fieldnotes/fieldnote-direktive-d-pipeline-refactor-2026-06-10.md
```

**Sign-off:** Architekt · Datum: 2026-06-10

Implementation abgeschlossen — siehe Field-Note für Grep-Proof und Smoke-Checkliste.
