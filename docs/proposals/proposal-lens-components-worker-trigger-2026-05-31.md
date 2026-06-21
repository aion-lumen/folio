# Proposal: Lens-Begründungen-Komponente + Worker-Trigger-Pattern

**Datum:** 2026-05-31
**Anlass:** Direktive `direktive-council-desktop-detail-trigger-2026-05-31.md`. Architekt hat den unmittelbaren Bau gestoppt mit der Frage nach der richtigen Verallgemeinerungs-Ebene.
**Verallgemeinerungs-Kontext (User-Block):** Council ist EIN Domain-Pattern (Immo-Hauskauf). Folge-Domains:
- **Job-Mails** → ähnlicher Workflow auf gleicher technischer Basis (Lenses, Pipeline, User-Freigabe).
- **Restliche Mails** → Kampagnen-Relevanz-Check → falls relevant: automatische Pipeline-Anlage/Update + 3-Lens-Bewertung + finale User-Freigabe.
- **Hermes-Chat-Trigger** → Chat fragt nach relevanten Vault-/Kampagnen-Einträgen pro Mail; Einträge/Updates werden NICHT direkt vom Chat ausgeführt, sondern triggern den existierenden Mail-Mechanismus mit Hint.

Daraus folgt: Beide neuen Komponenten (Lens-Begründungen-UI + Worker-Trigger) sind potenzielle Mehrfach-Konsumenten-Bausteine. Vor dem Bau lohnt die Verallgemeinerungs-Wahl.

---

## 1. Lens-Begründungen-Komponente

### Reader-Pfad

**Datenquelle:** `lens_comparisons.reason TEXT` in `council.db` (Schema `db_v2.py:73-79`). Pro Paar (`obj_a_id`, `obj_b_id`, `lens_id`) eine Begründung, optional Confidence. **Nicht** pro `(lens × object)` direkt — muss via UNION über `obj_a_id`/`obj_b_id` aggregiert werden, jüngste non-empty Reason pro `(lens, object)` gewinnt.

Existiert noch kein Reader im folio-Repo. Vorbild für UNION-Aggregation: Confidence-Pfad in `readCouncilTop` (reader.ts:183–204, gleiches `(lens, object)`-Pattern).

Vorschlag-Shape:

```typescript
export type LensReason = {
  lens_id: string;
  label: string;            // aus Persona-Config; Fallback lens_id
  reason: string | null;
  confidence: CouncilConfidence | null;
  rank: number | null;
  recorded_at: string;
};

export function getLensReasonsForObject(
  objectId: string,
  personas: PersonaMeta[]
): LensReason[];
```

`personas` als Parameter, damit der Reader domain-agnostisch wird — Mail-Lenses bringen ihre eigene Persona-Config mit.

### Komponenten-Design

UI-Komponente mit drei (oder N) Karten, jede kollabierbar via `<details>`-Element (kein State-Hook nötig). Header: Persona-Label + Rank-Pille + Confidence-Pille. Body: Volltext-Reason. Default `<details>` zu — User klickt zum Expandieren.

Props (Vorschlag):

```typescript
{ reasons: LensReason[] }
```

Eine einzige Prop, alles vorberechnet. Komponente reicht null-Reasons mit Platzhalter „Keine Begründung notiert" durch.

### Reichweite-Check

Mail-Lenses (heute: silent-Klassifizierer, Werbung-Hard-Filter, Korrekturen-Lerner) liefern strukturell ähnliche Begründungen pro Mail × Lens. Wenn Job-Lenses dazu kommen, hätten sie 3 Personas (z.B. Karriere-Berater, Marktbeobachter, Risiko-Lens) mit gleicher Volltext-Begründung-Struktur. Kampagnen-Lenses analog.

**Heißt:** Dieselbe Komponente, mit anderer Persona-Config + anderer Object-Source, würde für Mail/Job/Kampagne funktionieren — solange die Reasons als `LensReason[]` ankommen.

**Platzierung:**
- ❌ `src/lib/council/CouncilLensReasons.svelte` — eng an Council gebunden.
- ✅ `src/lib/lens/LensReasonsPanel.svelte` — domain-agnostic, Council nutzt es, Mail/Job/Kampagne später ebenso.

Reader bleibt im Council-Repo (`council-db/reader.ts`), weil die Datenquelle `lens_comparisons` Council-spezifisch ist. Mail-Lenses haben eigene Tabellen (`feedback`, `validator_opinions`, `corrections`) und brauchen einen eigenen Reader, der dieselbe `LensReason[]`-Shape liefert. **Konvergenz auf Type-Ebene, nicht auf Reader-Ebene.**

### Engineer-Empfehlung

Shared-Komponente unter `src/lib/lens/`. Reader bleibt im Council-Modul mit der `LensReason`-Typ-Definition exportiert, sodass künftige Mail-/Job-Reader denselben Type wiederverwenden. Persona-Loader (`loadPersonas` aus `council-db/reader.ts`) wird per Argument übergeben — kein implizites Council-Coupling.

**Begründung:** Geringer Refactor-Aufwand jetzt (~30 LOC mehr), spart sich später den Doppel-Build, wenn Job/Kampagne kommt. Type-Konvergenz ist eine echte Architektur-Entscheidung — Reader-Konvergenz wäre Premature Generalization, weil die Datenquellen unterschiedlich sind.

---

## 2. Worker-Trigger-Pattern

### Option A — Mail-Pattern wiederverwenden

`src/lib/server/worker-runner/manager.ts` + `worker_runs`-Tabelle in folio-db + SSE-Stream-Endpoint + WorkerRunPanel-Svelte-Komponente.

**Pro:**
- Existiert, getestet, hat Singleton-Enforcement (HTTP 409 wenn busy).
- DB-Tracking persistiert Lauf-Historie (debugbar, audit-fähig).
- SSE-Live-Logs sind Komfort-Feature für interaktives Debugging.
- Wenn der gleiche Manager auch Council/Job/Kampagne-Worker spawnt, hat folio EIN Worker-Pattern.

**Contra:**
- `worker_runs.account` + `worker_runs.mode` sind aktuell mail-spezifisch (`silent|sent|validator`). Erweiterung um Council-Modes brauchen Schema-Drift oder generische Tabellen-Felder.
- SSE-Stream ist Overkill, wenn Architekt explizit „Output in Log-Datei, kein Stream" verlangt.
- Wartungs-Surface: 401 Zeilen `manager.ts` + 150+ Zeilen Svelte-Store + 130+ Zeilen UI-Panel — viel Surface für jeden neuen Worker-Typ.

### Option B — Schlankere Variante

Subprocess detached spawnen, stdout/stderr in Log-Datei umlenken, Lockfile als Singleton-Mechanismus, GET-Endpoint liest Lockfile-Status, UI pollt alle 5 s.

**Pro:**
- Architekt-Wunsch ist direkt umgesetzt („Log-Datei, kein Stream").
- Lockfile-Mechanik ist universell — funktioniert auch wenn Worker via launchd parallel läuft (Manager und launchd-Worker schauen denselben Lockfile-Pfad).
- ~80 LOC Server + ~50 LOC UI, niedrige Wartungs-Surface.
- Keine DB-Tabelle — Run-Historie liegt als Log-Dateien im Worker-Repo.

**Contra:**
- Kein Live-Log-Stream — User sieht nur „läuft seit X min", nicht aktuelle Output-Zeile.
- Run-Historie liegt nicht in DB → kein einfaches „letzte 10 Council-Lens-Läufe" via SQL.
- Polling-Overhead: alle 5 s ein Mini-Request. Vernachlässigbar lokal.

### Reichweite-Check

Kandidat-Worker für die Folge-Domains:

| Domain | Worker | Trigger-Quelle | Interaktivität |
|---|---|---|---|
| Council-Lens | `council_lens_run.py` (4h launchd + UI) | UI-Button, launchd | Niedrig — User wartet, sieht Ergebnis-Liste |
| Council-Pending-Ingest | `ingest_pending_worker.py` (1h launchd) | nur launchd | Keine UI heute |
| Job-Lens (zukünftig) | `job_lens_run.py` | UI-Button, launchd | Niedrig |
| Kampagne-Lens (zukünftig) | `kampagne_lens_run.py` | UI-Button, vielleicht event-getrieben | Niedrig |
| Hermes-getriggerte Re-Run (zukünftig) | re-spawn von Mail-Pipeline-Worker mit Hint-Param | Hermes-Chat | Niedrig — Hermes sieht Ergebnis indirekt |
| Mail-Pipeline | `mail_pipeline.py` | UI-Button (heute) | **Hoch** — User klassifiziert manuell, sieht Live-Output |

**Befund:** Nur Mail-Pipeline hat hohe Interaktivität (Live-Output, manuelle Klassifizierung). Alle anderen Worker sind Background-Jobs mit „läuft / läuft nicht / fertig"-Semantik. Option B fits.

### Lockfile-Mechanik

In **beiden** Optionen identisch — `fcntl.flock` (Python, non-blocking) im Worker selbst. Begründung: Manager-Layer-Lockfile alleine reicht nicht, weil launchd den Worker direkt aufruft (umgeht den Manager). Worker MUSS sich selbst schützen.

Manager-Layer (TS) liest denselben Lockfile-Pfad pro Worker-Typ, gibt HTTP 409 wenn Lock aktiv, vermeidet so unnötigen Subprocess-Spawn der dann eh failed.

**Lockfile-Pfad-Konvention:** `~/.{repo}/{worker}.lock`:
- `~/.council/lens-run.lock`
- `~/.council/pending-ingest.lock`
- `~/.job/lens-run.lock` (zukünftig)
- `~/.kampagne/lens-run.lock` (zukünftig)

**Lockfile-Inhalt:** JSON `{ pid, started_at }`. Manager-Layer prüft PID-Liveness via `process.kill(pid, 0)` — stale Locks werden auto-cleaned.

### Engineer-Empfehlung

**Option B als generisches „Lens-Lauf"-Pattern.** Mail-Pipeline behält Option A wegen ihrer Interaktivitäts-Anforderung. Council-Lens-Trigger (jetzt), Job-Lens (später), Kampagne-Lens (später) nutzen Option B.

Konkrete Module:

```
src/lib/server/lens-runner/
  spawn.ts          # generisches subprocess-spawn + lockfile-check
  status.ts         # generisches Lockfile-Read + PID-Liveness-Check
  types.ts          # LensRunConfig: { worker_path, cwd, lockfile_path, log_dir }

src/lib/lens/
  LensRunPanel.svelte    # generischer Button + Counter, props: { config_url: 'council' }
  LensReasonsPanel.svelte # (aus Punkt 1)
```

API-Endpoints pro Worker (Council jetzt, Job/Kampagne später):
- `POST /api/council/lens-run` → spawn via `lens-runner/spawn.ts(config.council)`
- `GET /api/council/lens-run` → status via `lens-runner/status.ts(config.council.lockfile_path)`

**Begründung:** Bei drei oder mehr Worker-Triggern (Council heute + Job + Kampagne) lohnt der generische Layer. Bei nur Council wäre Premature Generalization; bei der gegebenen Mehrfach-Konsumenten-Aussicht ist es die richtige Ebene. Mail-Pipeline-Manager bleibt unangetastet — sein SSE-Pattern bedient seine eigene Use-Case.

---

## 3. Punkte unsicher / abweichend von Direktive

### LensRunPanel domain-agnostic

Direktive sagt „Council-Lens-Trigger als UI-Button". Ich plädiere für `LensRunPanel`-Komponente mit `domain`-Prop (oder Config-URL-Prop), die Council-, Job-, Kampagne-Trigger gleichbedienen kann. Konkrete Instanziierung im Council-`+page.svelte`: `<LensRunPanel domain="council" />`.

**Abweichung von Direktive:** minimal — Direktive sagt nicht, dass der Button council-only sein muss. Ich interpretiere die Direktive als Spezialfall der Domain-Verallgemeinerung.

### „Wer wo"-Mini-Block

Heute im Detail-Panel: Self-Rank / Partner-Rank / Council-Borda-Rank. Council-spezifisch wegen Borda. Aber: Job-Domain hätte „Wer wo" als „Meine Bewerbung / Partner-Hinweis", Kampagne als „Mein Engagement-Level / Partner-Notiz". Ähnliche Struktur, andere Semantik.

**Empfehlung:** „Wer wo" jetzt Council-spezifisch lassen. Wenn die zweite Domain (Job) konkret wird, wird der Block hochgehoben — analog der B-Klausel-Trigger für Mobile-Tokens („beim ersten Konsumenten außerhalb der ersten Domain"). Heute lohnt der Refactor nicht.

### Stammdaten-Parser

Direktive Punkt A.3: Stammdaten strukturiert anzeigen, statt OG-Title roh. Council-Schema hat `qm, bj, price_value` als Spalten, aber „Typ" (Haus/Wohnung) ist nicht in der DB — müsste aus Title/Description geparst werden.

**Engineer-Empfehlung:** Parser für „Typ" wird **nicht in dieser Iteration** gebaut. Für Job-Domain wäre es Branche/Funktion, für Kampagne Engagement-Typ. Ein generischer Stammdaten-Parser ist ein eigenes Projekt — sollte als eigene Direktive laufen, nicht als Beiwerk hier. Detail-Panel zeigt heute strukturierte Felder, fällt sonst auf `title` zurück. Field-Note dokumentiert die Lücke.

### Hermes-Chat-Trigger als „Re-Pipeline einer Mail"

Aus User-Block: „Hermes würde diese jedoch nicht selbst durchführen, sondern den gleichen mechanismus anstossen für die betreffende mail."

**Interpretation:** Hermes-Chat triggert keine Council/Job/Kampagne-Aktion direkt. Stattdessen triggert er eine Mail-Re-Evaluierung mit Hint („Bewerte Mail X erneut unter Kampagne Y"). Das bedeutet: Mail-Pipeline-Worker bekommt einen `--hint` oder `--context`-Param, der die Re-Evaluierung beeinflusst.

**Konsequenz für diese Architektur:** Mail-Pipeline-Trigger (Option A) muss eines Tages `hint`-Parameter akzeptieren. Das ist OUT-OF-SCOPE dieser Iteration, aber relevant für die Verallgemeinerungs-Frage: **die Mail-Pipeline ist die Universal-Re-Evaluierungs-Schicht.** Council/Job/Kampagne-Lens-Trigger sind Domain-spezifische Aktoren, die VOR der Mail-Pipeline laufen (Inserate, Stellenanzeigen, Kampagnen-Mentions analysieren). Hermes-Chat operiert AUF der Mail-Pipeline (re-evaluiert klassifizierte Mails).

Heißt: Option B (schlanke Lens-Runner) ist für Council/Job/Kampagne. Option A (Mail-Pipeline-Manager) bleibt für Mail-Klassifizierung **und** für Hermes-Chat-Trigger. Sauberer Schnitt.

---

## Zusammenfassung der Empfehlungen

| Aspekt | Empfehlung | Reichweite |
|---|---|---|
| Lens-Begründungen-UI | Shared in `src/lib/lens/LensReasonsPanel.svelte`, Type-Konvergenz, Reader domain-spezifisch | Council jetzt; Mail/Job/Kampagne ohne UI-Doppel-Build |
| Worker-Trigger | Option B als generisches „Lens-Lauf"-Pattern (`src/lib/server/lens-runner/`); Mail-Pipeline behält Option A | Council/Job/Kampagne nutzen denselben Code; Mail bleibt separat (Interaktivitäts-Anforderung) |
| Lockfile | Im Worker (Python, fcntl.flock) UND im Manager-Layer (TS, PID-Liveness) | Domain-agnostic Pattern, `~/.{repo}/{worker}.lock`-Konvention |
| LensRunPanel | Domain-Prop statt Council-Hardcoding | Council heute, Job/Kampagne ohne UI-Doppel-Build |
| Stammdaten-Parser | NICHT in dieser Iteration — eigene Direktive | Domain-übergreifend (Typ/Branche/Engagement) |
| Hermes-Chat-Trigger | Out-of-Scope, aber Architektur respektiert es: Mail-Pipeline bleibt Universal-Re-Eval-Schicht | Mail-Pipeline-Manager nimmt später `hint`-Param |

## Reihenfolge der Builds (nach Bewertung)

1. **Lens-Runner-Framework** (`src/lib/server/lens-runner/` + Lockfile-Pattern in `council_lens_run.py`).
2. **LensReasonsPanel** + Council-Reader `getLensReasonsForObject`.
3. **LensRunPanel** als UI-Konsument des Lens-Runner-Frameworks.
4. Desktop-Detail-Panel-Integration: LensReasonsPanel + LensRunPanel + Inserat-Link-Block + Stammdaten-Strukturierung (ohne Typ-Parser).
5. Field-Notes in beiden Repos.

Branches und Commits werden in der eigentlichen Bau-Direktive geplant.

Kein Bau, kein Commit, kein Push. Dieses Proposal ist Diskussionsbasis für Afshin und parallelen Architekten.
