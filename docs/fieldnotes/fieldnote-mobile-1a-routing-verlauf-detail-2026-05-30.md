# Field-Note — Sub-Bauteil 1a: Mobile Routing + Tab-Shell + Verlauf + Detail (Lesepfade)

**Datum**: 2026-05-30
**Branch**: `feature/council-mobile-1a-routing-verlauf-detail-2026-05-30`
**Direktive**: Council-Mobile-UI v2

## Was gebaut

Erstes Sub-Bauteil des Mobile-UI-Stacks. Vier Vollbild-Tabs, ein funktionaler (Verlauf), drei Placeholders. Detail-Ansicht read-only mit View-Side-Effect. Eigene Route `/council/mobile/*` parallel zur unveränderten Desktop-Liste unter `/council`.

## Route-Strategie

`/council` (Desktop-Liste aus Bauteil 3) bleibt unverändert. Neue Route `/council/mobile` lebt unter dem selben SvelteKit-Routegroup `(council)/`, erbt also den bestehenden Auth-Guard (`role IN (owner, council_member)`) ohne zusätzlichen Code.

## AppShell-Escape

`AppShell.svelte` rendert Sidebar/Header/ActivityBar/ChatPanel global. Mobile braucht das alles nicht — sie hat ihre eigene Bottom-Tab-Bar. Implementiert als **`isMobileRoute`-Conditional** (analog zum bestehenden `isVaultRoute`-Pattern):

```svelte
const isMobileRoute = $derived(page.url.pathname.startsWith('/council/mobile'));

{#if isMobileRoute}
  {@render children()}
{:else}
  <div class="shell">… AppShell-Chrome …</div>
{/if}
```

Begründung gegen `+layout@.svelte` (Layout-Reset): das Pattern ist im Repo nicht etabliert; ein Conditional ist konsistent mit dem `isVaultRoute`-Beispiel. Pflegbar an *einer* Stelle.

## Verlauf — Cross-DB-Aggregat aus 6 Quellen

`getRecentEvents(userId, since): VerlaufEvent[]` in **council-db/reader.ts** (weil cross-DB, gleiche Logik wie `lastLensEvaluationMap`). Sechs Event-Typen aggregiert:

| Quelle | DB | Event-Kind |
|---|---|---|
| `rankings` (zwei jüngste pro Lens+Object, vergleichen) | council.db | `lens-moved` |
| `object_status_override` WHERE user_id != self | folio.db | `partner-status` |
| `user_rankings` WHERE user_id != self | folio.db | `partner-top10` |
| `object_triggers` WHERE user_id != self | folio.db | `partner-trigger` |
| `hauskauf_workflow` WHERE updated_at >= since | folio.db | `workflow` |
| `consolidated_top10` GROUP BY computed_at | council.db | `new-batch` |

Sortiert DESC nach `ts`, UI-seitig in Buckets gruppiert (Heute morgen / Heute / Gestern abend / Gestern / Vorgestern / Älter).

Default `since`: `MAX(object_views.last_viewed_at) FOR userId`, Fallback `now - 48h` (neuer Helper `getLatestViewedAtForUser` in folio-db/reader).

## ObjectCard als wiederverwendbare Karte

`ObjectCard.svelte` ist die foto-led Karte aus dem Design (§ II, § III, § IV). Props: `{object, voices?, state?, href?, photoSize?, emberLeft?, extraLine?}`. Wird in 1a für Verlauf-Inline-Cards genutzt; ab 1b in Pipeline (Neu/Workflow), Meine-10, Suche.

**Empty-Slot**: bei `photo_url == null` (abgelaufenes Inserat, nicht aufgelöste Tracker-URL) zeigt die Karte einen sichtbar leeren ⌂-Slot statt das Foto wegzulassen. Halte die Karten-Höhe konstant — Design-Prinzip 1.

## CouncilStimmenStreifenMini

Eigene kleine Variante (`src/lib/council/`), kein Refactor des Originals. Grund: das Original hat keine Size-Prop und ist mit fester 12×14px-Zelle für Desktop-Listen optimiert. Mobile braucht 10×10. Zwei separate Komponenten ist klarer als eine mit Size-Prop, deren Default unklar bleibt.

## View-Side-Effect server-side

Detail-Loader (`+page.server.ts`) ruft `upsertObjectView(objectId, locals.user.id)` direkt — kein client-side `fetch('/api/.../view')`-Roundtrip. Vorteil: instant, sicher (Server-Login authoritativ), keine Race-Conditions zwischen mehreren Detail-Opens.

Der bestehende `POST /api/council/[id]/view`-Endpoint (aus Bauteil 0) bleibt für künftige Client-side-Trigger (z.B. wenn jemand ohne Page-Reload via Swipe ein Objekt als gesehen markieren will).

## CSS-Tokens

Mobile-spezifische Tokens (`--wf-*`, `--ember-*`, `--verdict-*`, `--st-*`) aus dem Design-HTML in **scoped** Token-File `src/lib/council/mobile/mobile-tokens.css`, gescoped auf `:where(.council-mobile-root)`. Wird nur vom Mobile-Layout importiert — die globale Folio-Palette (`--color-lumen` etc) bleibt unberührt, andere Routen sehen die Mobile-Tokens nie.

## Verifikation (alle ✓)

1. `npm run check` — 0 neue Errors, 25 Warnings (alle pre-existing + 1 schon-gefixt-ObjectCard-Tag-derivation).
2. `curl /council/mobile` (200), HTML zeigt `council-mobile-root` + `nav.tab-bar`, **keine** ActivityBar/AppShell-Sidebar.
3. `curl /` (200), HTML zeigt `class="shell svelte-..."` mit ActivityBar/Header — Desktop unverändert.
4. `curl /council` (200), Desktop-Liste aus Bauteil 3 bleibt erhalten.
5. `curl /council/mobile/<echte-object-id>` (200), Detail-Layout, object_views-Row entsteht.
6. Alle 4 Tab-Routes (`/`, `/pipeline`, `/meine-10`, `/suche`) liefern 200, Placeholders sichtbar.
7. Tab-Bar zeigt Active-State korrekt (`aria-current="page"`).
8. Avatar im AppHead zeigt die ersten zwei Buchstaben des `display_name` ("AF" für Afshin).
9. Test-Daten cleanup: `DELETE FROM object_views WHERE last_viewed_at = '<test-ts>'`.

## Limitations / Out of Scope (folgen in 1b–1e)

- **1b Pipeline-Tab**: Puls-Block, Link-Eingabe (Stub-UI), Neue-Objekte-Liste, Workflow-Sektion, Konsens-Trigger-Karte mit CTA-Button.
- **1c Link-Ingest**: `POST /api/council/ingest` → `insertPendingIngest`. Pipeline-Link-Box wird funktional.
- **1d Schreib-Aktionen im Detail**: Status-Tag-Buttons, Notiz-Textfeld, In-Top-10-Picker. Plus Drag-Drop in Meine-10. Die Einordnung-Stub-Zeile im Detail-Layout wird ersetzt.
- **1e Suche**: Volltext über council.objects + Status-Filter.
- **Konsens-Trigger-Button im Detail** (1b) — die ember-Karte rendert bereits, aber der CTA ist ein Stub („Antriggern · Button kommt mit 1b") weil er Schreibpfad ist.
- **Foto-Loading**: Bilder werden direkt vom Portal geladen (no proxy). Bei Tailscale-Nutzung kann das langsam sein wenn der Mac selbst kein schnelles Internet hat — separate Optimierung.
- **Konsens-Bedingung „beide in Top-3"** funktioniert erst wenn `user_rankings` Daten hat → sichtbar ab 1d.
- **`getRecentEvents`** scannt rankings komplett (zwei Pässe für Diff-Berechnung). Bei großen `rankings`-Volumes (tausende Rows) ist das nicht optimal; aktuell ist die Tabelle klein genug. Bei Bedarf später indexed-Filter oder Cache.

## Critical Files

### Routes
- `src/routes/(council)/council/mobile/+layout.svelte` (neu)
- `src/routes/(council)/council/mobile/+page.{server.ts,svelte}` (Verlauf, neu)
- `src/routes/(council)/council/mobile/[pipeline,meine-10,suche]/+page.svelte` (Placeholders, neu)
- `src/routes/(council)/council/mobile/[id]/+page.{server.ts,svelte}` (Detail, neu)

### Komponenten
- `src/lib/council/mobile/{MobileTabBar,MobileAppHead,ObjectCard,EventEntry}.svelte` (neu)
- `src/lib/council/mobile/mobile-tokens.css` (neu, scoped)
- `src/lib/council/CouncilStimmenStreifenMini.svelte` (neu)

### Server-Layer
- `src/lib/components/layout/AppShell.svelte` — `isMobileRoute` (+8 Z)
- `src/lib/server/council-db/reader.ts` — `getCouncilObjectById`, `getRecentEvents`, `VerlaufEvent` (+ ~140 Z)
- `src/lib/server/folio-db/reader.ts` — `getLatestViewedAtForUser` (+10 Z)

## Damit ist 1a komplett

Frau kann nach Merge auf Mobile gehen, Verlauf öffnen (leer beim ersten Mal), ein Objekt antippen und Stammdaten + Stimmen + Borda-Position sehen. Tab-Switching funktioniert, Placeholder-Pages erklären was wo kommt. Pipeline und Schreib-Aktionen folgen in 1b/1c/1d.
