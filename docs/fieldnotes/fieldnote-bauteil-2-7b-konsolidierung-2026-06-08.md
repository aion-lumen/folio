# Field-Note — Bauteil 2.7b: Kampagne-Konsolidierung (2026-06-08)

**Quelle:** `direktive-bauteil-2-7b-kampagne-konsolidierung-2026-06-08.md`.
**Anlass:** 2.7 hatte `/kampagne` als Standalone-Route gebaut, ohne
dass die existierende LIFE-Kampagne (Vault > Akte > Kapitel) bekannt
war. Drei parallele Kampagne-Konstrukte. Architekt-Entscheidung:
Hauskauf-Workflow-Karten leben als Sub-Sicht im existierenden
04-hauskauf-Kapitel.
**Status:** Implementierung fertig, svelte-check 0 Errors. Live-Test
durch User OK. **Folge-Direktive 2.7c** korrigiert die Sub-Sicht-
Architektur (zwei Kanbans → ein Kanban, LIFE-Grammatik).

---

## Branch + Commits

`folio/feature/bauteil-2-7b-kampagne-konsolidierung-2026-06-08`:

| Commit | Aufgabe | Inhalt |
|---|---|---|
| `8aa37ea` | C2 | MailLink + HauskaufCard in geteilte `types.ts` |
| `9fdd4a0` | C3 | `loadHauskaufWorkflowCards` wiederverwendbarer Helper |
| `1ccf7df` | C5 | HauskaufWorkflowSection (3-Spalten-Kanban) |
| `3baa5ae` | C1 | Standalone `/kampagne` entfernt |
| `816438f` | C4 | Vault `+page.server.ts` mit `hauskaufCards` |
| `5a2dd5f` | C6 | Section conditional unter KanbanBoard (Kap. 4, Akt 2) |
| `cba05b3` | C7 | CampaignTrack-Link + URL-Param-Routing |

Reihenfolge wurde gegenüber dem Plan getauscht (C2/C3/C5 vor C1) —
sonst wäre Build temporär gebrochen weil KampagneCard MailLink aus dem
zu löschenden +page.server.ts importierte.

---

## Phase-1-Befund (Architektur-Diagnose)

LIFE-Kampagne-Architektur:
- Vault `/vault` rendert `(vault)/vault/+page.svelte`,
  `layoutStore.selectedAct/selectedChapter` (in-memory).
- Akte + Kapitel als Markdown unter
  `~/Projects/life/_campaign/{acts,chapters}/`. Parser:
  `$lib/server/vault/reader.ts`.
- Objective-Status: `not_started|todo|in_progress|done|blocked|archived`
  — strukturell **anderes Vokabular** als Hauskauf
  (`offen/terminiert/besichtigt`). Daher Sub-Sicht statt Mapping.
- Hauskauf-Kapitel `04-hauskauf.md` existiert (Akt II Aufbau, Status
  `upcoming`, Tags `[kapitel, hauskauf, immobilien, schweiz, eigentum]`).
- **Schweiz-Kapitel existiert nicht.** Direktive bezog sich auf
  abstrakten Architekt-Mental-Model — Engineer hat das real-codified.

---

## Architekt-Entscheidung (post-Phase-1)

Hauskauf-Karten als zweite Sektion unterhalb der Objectives im
04-hauskauf-Kapitel, mit eigener Sektions-Überschrift „Aktiver
Workflow". Separation von statischen LIFE-Objectives.

---

## Engineer-Entscheidungen

1. **Conditional auf Kapitel:** `chapter_number === 4 && parent_act === 2`
   (zahl-basiert, da Chapter-Type keine `tags`-Spalte hat).
2. **Sektions-Überschrift:** „Aktiver Workflow".
3. **Reuse 2.7-Substanz:** KampagneCard, POST `/api/kampagne`, Loader-
   Logik komplett wiederverwendet. Nur Type-Pfad migriert
   (MailLink-Export aus +page.server.ts → src/lib/kampagne/types.ts).
4. **URL-Params `?act=N&chapter=M`** plus `$effect`-Reader in
   `+page.svelte` — direkter Sprung von Pipeline-CampaignTrack-Link.
5. **Status-Auto-Trigger out-of-scope** (Markdown-Mutation, eigene
   Folge-Direktive).
6. **Reihenfolge-Tausch C2-C3-C5 vor C1:** Build-Health — sonst
   temp-Bruch durch fehlende Imports während des C1-Delete.

---

## Reuse-Map

| Asset (Quelle) | Ort | Wiederverwendung in 2.7b |
|---|---|---|
| `KampagneCard.svelte` | 2.7 | unverändert wiederverwendet |
| Loader-Logik | 2.7 (in `(mail)/kampagne/+page.server.ts`) | nach `src/lib/server/kampagne/loader.ts` extrahiert (C3) |
| `MailLink`-Type | 2.7 (im selben +page.server.ts) | nach `src/lib/kampagne/types.ts` (C2) |
| `POST /api/kampagne` | 2.7 | unverändert |
| `getFeedbackBriefsByIds` | 2.7 | unverändert |
| `getCouncilObjectById` | pre-existing | unverändert |
| Owner-Gate via `(mail)/+layout.server.ts` | pre-existing | erbt automatisch — neue Sicht ist unter `(vault)/`, Owner-Gate kommt aus `(vault)/+layout.server.ts` |

---

## Veränderungen

| File | Was |
|---|---|
| `src/lib/kampagne/types.ts` (neu) | MailLink + HauskaufCard interfaces |
| `src/lib/server/kampagne/loader.ts` (neu) | `loadHauskaufWorkflowCards()` |
| `src/lib/kampagne/HauskaufWorkflowSection.svelte` (neu) | 3-Spalten-Kanban mit Sektions-Überschrift |
| `src/routes/(vault)/vault/+page.server.ts` (neu) | Loader mit `hauskaufCards` |
| `src/routes/(vault)/vault/+page.svelte` | Conditional Einbindung + URL-Param-Handler |
| `src/lib/pipeline/CampaignTrack.svelte:51` | href `/kampagne` → `/vault?act=2&chapter=4` |
| `src/lib/kampagne/KampagneCard.svelte:12` | Import-Pfad MailLink umgestellt |
| `src/routes/(mail)/kampagne/+page.server.ts` (gelöscht) | C1 |
| `src/routes/(mail)/kampagne/+page.svelte` (gelöscht) | C1 |

---

## Verifikation

**Build:** `svelte-check` 0 Errors / 40 Warnings (Vorzustand).

**Browser-Smoke (live durch User OK):**
1. `/kampagne` direkt → 404.
2. `/vault` → Akt II Aufbau → Kapitel 4 Hauskauf → unter KanbanBoard
   erscheint Sektion „Aktiver Workflow" mit 3 leeren Spalten.
3. Andere Kapitel → Sektion verschwindet.
4. Pipeline-CampaignTrack-Link → navigiert zu
   `/vault?act=2&chapter=4` → Hauskauf-Kapitel automatisch ausgewählt.

---

## Out of Scope (aus Direktive)

- LIFE-Kampagne-Architektur ändern.
- `hauskauf_workflow`-Schema antasten.
- POST `/api/kampagne` ändern.
- Status-Auto-Trigger auf 04-hauskauf-Markdown-Status.
- Mobile-Variante.

---

## Folge-Direktive (2.7c)

Architekt hat post-Live-Test entschieden: **die Sub-Sicht-Architektur
ist visuell redundant** (zwei Kanbans untereinander) und die Hauskauf-
Sicht soll **ein Kanban mit LIFE-Grammatik** sein. 2.7c führt die
Konsolidierung weiter:

- Status-Vokabular Umbenennung (`terminiert→in_arbeit`,
  `besichtigt→erledigt`, plus neuer `blockiert`).
- HauskaufWorkflowSection wird durch HauskaufKapitelSicht + neues
  Kanban-Brett ersetzt.
- Scaffolding-Objectives obj-04-01..04 raus.
- Auto-Eintritt bei Council-Konsens.

2.7b-Substanz, die in 2.7c weiterlebt: Vault-Loader-Integration,
URL-Param-Routing, Types-Datei, Loader-Helper. 2.7b-Substanz, die in
2.7c ersetzt wird: HauskaufWorkflowSection, KampagneCard.

---

## Stand

Bereit für FF-Merge. Substanz ist live-getestet. 2.7c folgt direkt.
