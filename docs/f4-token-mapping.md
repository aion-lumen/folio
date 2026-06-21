# F.4 Token-Mapping — Design-Claude-Bundle → Folio's `app.css`

**Engineer:** Claude Code
**Phase:** F.4.A Pre-Skeleton
**Date:** 2026-05-17
**Status:** STOP für Architekt-Sign-off (Build-Spec §6 F.4.A Review-Gate)

---

## §1 — Befund: Design-Claude-CSS ist bereits Port von Folio's `app.css`

`docs/f4-design-handoff/folio-mail/project/colors_and_type.css:54` deklariert explizit:

> *„Ported from src/app.css (Tailwind v4 @theme block → CSS vars). Base tokens (fg/bg/card/primary/…) mirror the shadcn-style palette used in life-dashboard."*

**Konsequenz:** kein Token-Konflikt zu lösen. Base-Palette (background/foreground/card/primary/secondary/muted/accent/destructive/border/input/ring), Lumen-Family, Path-Akzente, Shadows, Fonts (Inter + JetBrains Mono) sind in **beiden Files identisch**.

### Identische Tokens (KEIN Edit nötig in Folio's `app.css`)

| Token-Family | Status |
|---|---|
| `--color-{background,foreground}` | ✓ identisch |
| `--color-{card,popover}` (+ -foreground) | ✓ identisch |
| `--color-{primary,secondary,muted,accent,destructive}` (+ -foreground) | ✓ identisch |
| `--color-{border,input,ring}` | ✓ identisch |
| `--color-lumen{,-bright,-warm,-ember}` | ✓ identisch (Lumen-Family komplett) |
| `--color-path-{a,b,c}` | ✓ identisch (violet/orange/teal) |
| `--shadow-{xs,sm,md,lg,xl}` | ✓ identisch |
| `--font-{sans,mono}` (+ Inter/JetBrains-Mono @font-face) | ✓ identisch |
| `--radius` (= 0.5rem) | ✓ identisch |

### Lumen-Allokation für Disagreement (Architekt-Klärungs-Item)

Design-Claude reserviert `--color-lumen` für **Disagreement-Highlights** im Mail-Queue-View (per `design-notes.md` §Übergreifende-Beobachtungen). Diese semantische Erweiterung steht offen:

> *„Architekt-Frage: ist diese Allokation OK, oder ist Lumen exklusiv für brand/logo?"*

**Engineer-Empfehlung:** Lumen für Disagreement OK — semantisch konsistent („die heisse Stelle, wo Aufmerksamkeit gefragt ist"). Mockup-Screenshot zeigt Disagreement-Row mit Lumen-Akzent (subtile warme Note in der diff-AKTION-Spalte). Architekt-Bestätigung im Sign-off.

---

## §2 — NEUE Tokens für F.4 (Erweiterung von `src/app.css`)

### 2.1 Account-Colors (3 brand-spezifische Akzente)

**Source:** `mq-shared.jsx:32-34` (Design-Claude Final-Choice nach Hue-Iteration in `sample-data-v2.js`).

| Account | dot (chip-fill) | soft (chip-bg) | deep (chip-fg) |
|---|---|---|---|
| **gmail** | `hsl(215 80% 50%)` blau-mid | `hsl(215 80% 96%)` blau-pastell | `hsl(215 80% 30%)` blau-deep |
| **yahoo** | `hsl(280 60% 54%)` violet | `hsl(280 50% 96%)` violet-pastell | `hsl(280 65% 32%)` violet-deep |
| **mirhamed.ch** | `hsl(158 62% 38%)` grün-emerald | `hsl(158 40% 95%)` grün-pastell | `hsl(160 75% 22%)` grün-deep |

**Token-Vorschlag für `app.css` `@theme`-Block (Add nach Z.84 `--color-path-c`):**

```css
/* ── Account-Colors (F.4 Mail-Queue Multi-Account-UI) ── */
--color-account-gmail:           hsl(215 80% 50%);
--color-account-gmail-soft:      hsl(215 80% 96%);
--color-account-gmail-deep:      hsl(215 80% 30%);
--color-account-yahoo:           hsl(280 60% 54%);
--color-account-yahoo-soft:      hsl(280 50% 96%);
--color-account-yahoo-deep:      hsl(280 65% 32%);
--color-account-mirhamed:        hsl(158 62% 38%);
--color-account-mirhamed-soft:   hsl(158 40% 95%);
--color-account-mirhamed-deep:   hsl(160 75% 22%);
```

Naming-Convention: `--color-account-<id>{,-soft,-deep}`. Generisch erweiterbar für späteres Account hinzufügen (z.B. `--color-account-protonmail-*`).

### 2.2 Action-Colors (5 semantische Final-Action-Farben)

**Source:** `mq-shared.jsx:6-23` (actionColor map).

| Action | bg (soft) | fg (label) | border | dot (status-indicator) |
|---|---|---|---|---|
| **keep** | `hsl(210 40% 96%)` slate-50 | `hsl(215 25% 35%)` slate-600 | `hsl(214 32% 86%)` slate-200 | `hsl(215 20% 55%)` slate-500 |
| **move_immo_portal** | `hsl(214 100% 97%)` blue-50 | `hsl(217 91% 30%)` blue-700 | `hsl(213 97% 84%)` blue-200 | `hsl(217 91% 60%)` blue-500 |
| **move_immo_privat** | `hsl(217 91% 95%)` blue-95 | `hsl(217 91% 22%)` blue-800 | `hsl(213 97% 80%)` blue-200 | `hsl(217 91% 38%)` blue-600 |
| **move_paketzustellung** | `hsl(38 100% 96%)` amber-50 | `hsl(22 85% 35%)` orange-700 | `hsl(38 90% 80%)` amber-200 | `hsl(32 100% 52%)` amber-500 |
| **move_zu_pruefen** | `hsl(0 86% 97%)` red-50 | `hsl(0 74% 32%)` red-700 | `hsl(0 96% 88%)` red-200 | `hsl(0 74% 52%)` red-500 |

**Token-Vorschlag (Add nach Account-Colors):**

```css
/* ── Mail-Action-Colors (F.4 — 5 semantische final_action-Farben) ── */
--color-action-keep-bg:                hsl(210 40% 96%);
--color-action-keep-fg:                hsl(215 25% 35%);
--color-action-keep-border:            hsl(214 32% 86%);
--color-action-keep-dot:               hsl(215 20% 55%);

--color-action-immo-portal-bg:         hsl(214 100% 97%);
--color-action-immo-portal-fg:         hsl(217 91% 30%);
--color-action-immo-portal-border:     hsl(213 97% 84%);
--color-action-immo-portal-dot:        hsl(217 91% 60%);

--color-action-immo-privat-bg:         hsl(217 91% 95%);
--color-action-immo-privat-fg:         hsl(217 91% 22%);
--color-action-immo-privat-border:     hsl(213 97% 80%);
--color-action-immo-privat-dot:        hsl(217 91% 38%);

--color-action-paketzustellung-bg:     hsl(38 100% 96%);
--color-action-paketzustellung-fg:     hsl(22 85% 35%);
--color-action-paketzustellung-border: hsl(38 90% 80%);
--color-action-paketzustellung-dot:    hsl(32 100% 52%);

--color-action-zu-pruefen-bg:          hsl(0 86% 97%);
--color-action-zu-pruefen-fg:          hsl(0 74% 32%);
--color-action-zu-pruefen-border:      hsl(0 96% 88%);
--color-action-zu-pruefen-dot:         hsl(0 74% 52%);
```

**Naming-Anmerkung:** `move_`-Prefix der Action-Keys wird im Token-Namen weggelassen für lesbarere CSS (`--color-action-immo-portal` statt `--color-action-move-immo-portal`). UI-Komponenten mappen via Util-Helper.

### 2.3 Tier-Colors (T1/T2/T3-Badges)

**Source:** `mq-shared.jsx:85-87` (TIER map).

| Tier | bg | fg |
|---|---|---|
| **T1** | `hsl(214 32% 94%)` slate-tinted | `hsl(222 47% 18%)` slate-deep |
| **T2** | `hsl(214 32% 94%)` slate-tinted | `hsl(215 16% 47%)` slate-mid |
| **T3** | `hsl(0 86% 97%)` red-soft | `hsl(0 74% 38%)` red-fg |

```css
/* ── Tier-Badges (F.4 MailList Heuristik-Tier-Info) ── */
--color-tier-1-bg: hsl(214 32% 94%);
--color-tier-1-fg: hsl(222 47% 18%);
--color-tier-2-bg: hsl(214 32% 94%);
--color-tier-2-fg: hsl(215 16% 47%);
--color-tier-3-bg: hsl(0 86% 97%);
--color-tier-3-fg: hsl(0 74% 38%);
```

**T0-Anmerkung:** Design-Claude-Tier-Map nur T1/T2/T3. Engineer hat in v12 D5 noch T0 für Paketzustellung definiert (`paketzustellung:`-marker-prefix). T0 ist konzeptuell aber visual-äquivalent zu T1 (deterministische Heuristik). **Engineer-Empfehlung:** T0 und T1 share-tier visuell (gleiche Badge-Color, anders nur das Label). Bei Architekt-Wunsch separate-T0-Farben: zusätzlicher Token-Add.

### 2.4 Confidence-Pip-Colors

**Source:** `mq-shared.jsx:64` (color für confidence-bar).

```css
/* ── Confidence-Pip (F.4 — Heuristik-Confidence-Indicator) ── */
--color-conf-low:    hsl(0 74% 50%);     /* <0.6 = red */
--color-conf-mid:    hsl(32 95% 48%);    /* 0.6-0.8 = amber */
--color-conf-high:   hsl(222 47% 18%);   /* >=0.8 = slate-deep */
```

### 2.5 Worker-Status-Colors (für `<WorkerPanel>`)

**Build-Spec §4 Komponente 7:** Color-Dot grün/rot/gelb für Status. Engineer-Sub-Decision: re-use existing semantic colors statt neue Tokens — verwende `--color-status-{in-progress,blocked,deadline}-dot`. Status-mapping in Worker-Panel-Komponente.

**Falls Architekt explizite Worker-Color-Tokens will:** anlegen analog `--color-worker-{running,idle,error}`. Aktuell nicht eingeführt zur Token-Inflation-Vermeidung.

---

## §3 — Fonts

**Folio's `app.css` Z.4-46:** Inter (Regular/Medium/SemiBold/Bold) + JetBrains Mono (Regular/Medium) sind bereits per `@font-face` mit `src: url('/fonts/<name>.woff2')` eingebunden.

**Bundle hat dieselben Files:** `docs/f4-design-handoff/folio-mail/project/fonts/*.woff2` (Inter Bold/Medium/Regular/SemiBold + JetBrainsMono Medium/Regular).

**Engineer-Action:** Verifizieren dass Folio's `static/fonts/` (oder `src/lib/fonts/`) die woff2-Files bereits hat. Falls **nein**, copy from Bundle. Falls **ja**, kein Edit nötig.

```bash
# Verifikations-Befehl (Engineer-Side post-Sign-off):
ls ~/Projects/folio/static/fonts/ 2>/dev/null | head
```

---

## §4 — Tailwind 4 vs. CSS-Custom-Property Brücke

Folio nutzt **Tailwind 4** (`@theme`-Block in `app.css`). Tailwind 4 generiert automatisch utility-classes aus `@theme`-Tokens:
- `--color-account-gmail` → `bg-account-gmail`, `text-account-gmail`, `border-account-gmail`
- `--color-action-immo-portal-bg` → `bg-action-immo-portal-bg` etc.

**Konsequenz:** Engineer kann Tokens direkt als Tailwind-utility-classes im Markup verwenden. Beispiel MailCard:

```svelte
<span class="bg-account-gmail-soft text-account-gmail-deep border-account-gmail/30">
  gmail
</span>
```

**Falls Tailwind 4-Resolution stockt** (z.B. wegen kebab-case-Conversion oder zu langen Token-Namen): Fallback per `style="background-color: var(--color-action-immo-portal-bg)"`. Engineer-Decision per Component, dokumentiert in F.4.D-Report.

---

## §5 — Vorgeschlagener `app.css`-Edit (1 Block, append)

Konkret zu inserten **nach Z.84** (nach `--color-path-c`) in `~/Projects/folio/src/app.css`:

```css
  /* ────────────────────────────────────────────────────────────────────
   * F.4 Mail-Queue Tokens (Bundle: docs/f4-design-handoff/)
   * ──────────────────────────────────────────────────────────────────── */

  /* ── Account-Colors (Multi-Account-UI gmail/yahoo/mirhamed.ch) ── */
  --color-account-gmail:           hsl(215 80% 50%);
  --color-account-gmail-soft:      hsl(215 80% 96%);
  --color-account-gmail-deep:      hsl(215 80% 30%);
  --color-account-yahoo:           hsl(280 60% 54%);
  --color-account-yahoo-soft:      hsl(280 50% 96%);
  --color-account-yahoo-deep:      hsl(280 65% 32%);
  --color-account-mirhamed:        hsl(158 62% 38%);
  --color-account-mirhamed-soft:   hsl(158 40% 95%);
  --color-account-mirhamed-deep:   hsl(160 75% 22%);

  /* ── Mail-Action-Colors (5 final_action-Semantik-Farben) ── */
  --color-action-keep-bg:                hsl(210 40% 96%);
  --color-action-keep-fg:                hsl(215 25% 35%);
  --color-action-keep-border:            hsl(214 32% 86%);
  --color-action-keep-dot:               hsl(215 20% 55%);

  --color-action-immo-portal-bg:         hsl(214 100% 97%);
  --color-action-immo-portal-fg:         hsl(217 91% 30%);
  --color-action-immo-portal-border:     hsl(213 97% 84%);
  --color-action-immo-portal-dot:        hsl(217 91% 60%);

  --color-action-immo-privat-bg:         hsl(217 91% 95%);
  --color-action-immo-privat-fg:         hsl(217 91% 22%);
  --color-action-immo-privat-border:     hsl(213 97% 80%);
  --color-action-immo-privat-dot:        hsl(217 91% 38%);

  --color-action-paketzustellung-bg:     hsl(38 100% 96%);
  --color-action-paketzustellung-fg:     hsl(22 85% 35%);
  --color-action-paketzustellung-border: hsl(38 90% 80%);
  --color-action-paketzustellung-dot:    hsl(32 100% 52%);

  --color-action-zu-pruefen-bg:          hsl(0 86% 97%);
  --color-action-zu-pruefen-fg:          hsl(0 74% 32%);
  --color-action-zu-pruefen-border:      hsl(0 96% 88%);
  --color-action-zu-pruefen-dot:         hsl(0 74% 52%);

  /* ── Tier-Badges (T1/T2/T3) ── */
  --color-tier-1-bg: hsl(214 32% 94%);
  --color-tier-1-fg: hsl(222 47% 18%);
  --color-tier-2-bg: hsl(214 32% 94%);
  --color-tier-2-fg: hsl(215 16% 47%);
  --color-tier-3-bg: hsl(0 86% 97%);
  --color-tier-3-fg: hsl(0 74% 38%);

  /* ── Confidence-Pip ── */
  --color-conf-low:    hsl(0 74% 50%);
  --color-conf-mid:    hsl(32 95% 48%);
  --color-conf-high:   hsl(222 47% 18%);
```

**Total Net-Add:** ~45 LOC neue tokens, kein Token-Edit, kein Token-Remove.

---

## §6 — Architekt-Sign-off-Items

| # | Item | Engineer-Empfehlung |
|---|---|---|
| T1 | Lumen-Allokation für Disagreement | **OK** (per design-notes §Lumen-Token-Einsatz) |
| T2 | Account-Color-Token-Naming (`--color-account-<id>{,-soft,-deep}`) | **OK** (extensible) |
| T3 | Action-Color-Token-Naming (`--color-action-<key>{-bg,-fg,-border,-dot}`) | **OK** (mit `move_`-Prefix weggelassen für Lesbarkeit) |
| T4 | T0 visual = T1 (share badge-color) | **OK** (Engineer-Empfehlung, T0-Konzept ist konzeptuell aber visual-äquivalent) |
| T5 | Worker-Status reuse `--color-status-*` statt eigene Worker-Tokens | **OK** (Token-Inflation vermeiden) |
| T6 | Fonts: nur copy von Bundle wenn Folio's `static/fonts/` leer | **OK** |
| T7 | Tailwind-4-utility-Generation aus `@theme`-tokens | **OK** (Fallback inline-style falls Resolution stockt) |
| T8 | Block-Insertion-Point: nach Z.84 (`--color-path-c`) | **OK** |

Bei „all approved": Engineer macht `app.css`-Edit + Font-Verify und startet F.4.B Skeleton. Bei Adjustments: Token-Mapping-Revision.

---

## §7 — Was NICHT in F.4.A ist (zu späteren Sub-Phasen)

- Actual `app.css`-Edit (post-Sign-off, F.4.A-Schluss)
- Komponenten-Markup (F.4.B Skeleton)
- Komponenten-Logik + SSE (F.4.C/D/E)
- Performance + Virtual-Scrolling (F.4.F)

---

## §8 — Cross-Reference

- Bundle: `~/Projects/folio/docs/f4-design-handoff/folio-mail/project/`
- Pflicht-Lektüre-Files-gelesen: README.md, Iteration-2.html, design-notes.md, colors_and_type.css, mq-shared.jsx (für Color-Maps)
- Mockup-Screenshot: `state/folio-f4-mockup-multi-account.png` (Architekt-side)
- Plan v13: `~/.claude/plans/resume-stopp-a-ist-scalable-zephyr.md`
