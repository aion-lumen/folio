# Geplante Erweiterung: Mail-Pipeline-Manager Hint/Context-Parameter

**Klausel 2 aus Architektur-Bewertung 2026-05-31.**
**Out-of-Scope** der aktuellen Iteration (`feature/council-desktop-detail-trigger-2026-05-31`).
**Quelle:** Verallgemeinerungs-Ebene aus User-Block — Hermes-Chat als Trigger-Quelle für Mail-Pipeline-Re-Evaluierung.

## Anlass

Hermes-Chat soll künftig nach relevanten Vault-/Kampagnen-Einträgen pro Mail fragen können. Einträge/Updates führt Hermes NICHT selbst durch, sondern **triggert den existierenden Mail-Pipeline-Mechanismus** mit einem Hint („Bewerte Mail X erneut unter Kampagne Y"). Mail-Pipeline ist die Universal-Re-Evaluierungs-Schicht.

## Was steht heute

`src/lib/server/worker-runner/manager.ts` spawnt den Mail-Pipeline-Worker (`multi-agent/scripts/...`) mit `--account` + `--mode` + `--tranche-size`. SSE-Stream für Live-Klassifizierungs-Output. Keine Hint/Context-Parameter.

## Was vorgemerkt ist

Manager-API soll einen optionalen **`hint`/`context`-Parameter** akzeptieren:
- `POST /api/worker/run` Body um optional `{ hint?: string, context?: object }` erweitert.
- `manager.ts` reicht Hint als zusätzliche `--hint`/`--context`-CLI-Args an den Subprocess weiter.
- Worker-Side: Hint wird im Klassifizierungs-Prompt mitgegeben (Pipeline-spezifische Implementierung später).

**Wichtig für jetzt:** `manager.ts` ist so gebaut/dokumentiert, dass die Erweiterung **ohne Architektur-Umbau** möglich ist. Konkret:
- `startRun()`-Input-Type ist offen-erweiterbar (zusätzliches optionales Feld).
- CLI-Args werden als Array gebaut; weitere Args anhängen ist trivial.
- DB-Tabelle `worker_runs` hat keine zusätzlichen Spalten nötig (Hint kann im `mode`-Feld oder einer JSON-Spalte landen — Entscheidung beim Bau).

Keine Refactor-Schulden aus dieser Iteration, die das blockieren würden.

## Was später NICHT in Mail-Pipeline gehört

- **Council/Job/Kampagne-Lens-Trigger:** Eigene Lens-Runner-Framework (`src/lib/server/lens-runner/`, Subprocess + Lockfile + Polling, kein SSE). Saubere Trennung Domain-Aktor vs. Universal-Re-Eval-Schicht.
- **Hermes-Chat-Logik:** lebt im Hermes-Modul, nicht im Mail-Pipeline-Manager. Hermes ruft nur den Manager-Endpoint auf.

## Wann bauen

Wenn die Hermes-Chat-Integration konkret wird. Bis dahin: keine Aktion, diese Note bleibt als Architektur-Marker.

## Verwandte Patterns

- ACK-Pattern (`feedback_ack_statt_cross_db_write` im Memory-Index): Cross-DB-Kommunikation via eigene Tabellen im Owner-Repo.
- Lockfile-Konvention (`~/Projects/aion-lumen/LOCKFILES.md`): Singleton-Mechanismus für Worker.
- Lens-Runner-Framework: `src/lib/server/lens-runner/` als generisches Pattern für Background-Worker (Subprocess + Lockfile + Log + Polling).
