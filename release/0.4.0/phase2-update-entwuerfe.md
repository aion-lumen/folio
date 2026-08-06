# Release 0.4.0 — Phase 2, Update-Entwürfe

**Von:** Leitstand (Release-Pilot, Lauf #4) · **Datum:** 2026-08-02
**Prozess-Tiefe:** enger Check (der Steward bestätigt) · **Zahlen-Regel:** greift nicht, Triage unberührt
**Gliederung:** A geht an die aion-lumen-Session, B an die Karriere-Session, C an CC.

---

## 0 · Semver-Vorschlag

| Repo | jetzt | Vorschlag | Begründung |
|---|---|---|---|
| `folio` | Tag `v0.4.0`, zwei Commits darüber, Arbeitsbaum offen | **kein neuer Tag** | Der Meilenstein ist durch das getaggte und ausgelieferte Leuchtfeuer abgedeckt. Die zwei Commits darüber (plist-Fix, ntfy) und die offene Arbeit sind der Anfang des nächsten Zuwachses. Sie jetzt zu taggen erzeugte einen Release ohne Aussenflächen-Geschichte und kollidierte mit dem für 0.4.1 vorgesehenen UX-Backlog. Stattdessen: **CHANGELOG-Abschnitt `[Unreleased]`**. |
| `aion-lumen/multi-agent` | Tag `v0.3.0`, vier Commits darüber | **`v0.4.0`** | Die vier Commits sind der Yahoo-Move, also echte 0.4.0-Arbeit. Der Tag benennt den Meilenstein wahrheitsgemäss. |
| `aion-lumen.com`, `carta` | ungetaggt | unverändert | Sites tragen keine eigenen Tags. |

---

## A · aion-lumen.ch — für die aion-lumen-Session

Datei: `aion-lumen.com/folio/index.html`. Fünf Versionsstellen und eine fehlende Zeile.

### A1 · Version v0.3.0 → v0.4.0, fünf Stellen

| Zeile | vorher | nachher |
|---|---|---|
| 681 | `Plate I · Public preview · v0.3.0` | `Plate I · Public preview · v0.4.0` |
| 682 | `Tafel I · Öffentliche Vorschau · v0.3.0` | `Tafel I · Öffentliche Vorschau · v0.4.0` |
| 697 | `<span class="f-badge live">v0.3.0</span>` | `<span class="f-badge live">v0.4.0</span>` |
| 711 | `Pl. I · Folio dashboard · v0.3.0` / `Tafel I · Folio-Dashboard · v0.3.0` | beide auf `v0.4.0` |
| 865 | `<h3><span class="num">v0.3.0</span>…` | `…<span class="num">v0.4.0</span>…` |
| 938 | `AGPL-3.0 · v0.3.0 · MMXXVI` | `AGPL-3.0 · v0.4.0 · MMXXVI` |

### A2 · Leuchtfeuer fehlt auf der Aussenfläche

Das Kopf-Feature des Meilensteins wird auf aion-lumen.ch nirgends erwähnt. Als Punkt 07 in
„Was heute funktioniert" (nach Zeile 872), im Stil der bestehenden Zeilen:

```html
<li><span class="ix">07</span><span><span class="en">Leuchtfeuer — reach from anonymised server logs only; no cookies, no client-side tracking, no external analytics</span><span class="de">Leuchtfeuer — Reichweite allein aus anonymisierten Server-Logs; keine Cookies, kein Client-Tracking, keine externe Analytik</span></span></li>
```

Bewusst so formuliert, dass die Zeile das Markenversprechen wiederholt statt nur ein Feature zu
nennen. Sie ist die einzige Stelle, an der die Null-externe-Calls-Haltung an einem konkreten
Beispiel sichtbar wird.

### A3 · Befund, nicht Teil dieses Laufs

Die Spalte „Was als nächstes kommt" listet `v0.2`, `v0.3` und `v1.0`. Während v0.4.0 ausgeliefert
ist, stehen dort zwei Versionen als künftig, die längst vergangen sind. Das ist dieselbe
Fehlerklasse wie die Terminzeile auf noblecause.ai: eine Aussage über die Zukunft, die die
Gegenwart überholt hat.

**Kein Scope-Zuwachs in diesem Lauf** — die Roadmap neu zu schneiden ist eine inhaltliche
Entscheidung, keine Konsistenzkorrektur. Geht als eigener Punkt an die aion-lumen-Session.

---

## B · mirhamed.ch — für die Karriere-Session

Datei: `carta/src/lib/data/cv.json`. Drei Karten, alle bilingual.

### B1 · Folio-Status, drei Minorversionen veraltet

```
projects[1].status.de : "v0.1.0 veröffentlicht"  →  "v0.4.0 veröffentlicht"
projects[1].status.en : "v0.1.0 released"        →  "v0.4.0 released"
```

### B2 · Multi-Agent-Lab-Status

Nach dem Tag aus Abschnitt C2:

```
projects[0].status.de : "Aion Lumen · v0.1"  →  "Aion Lumen · v0.4.0"
projects[0].status.en : "Aion Lumen · v0.1"  →  "Aion Lumen · v0.4.0"
timeline[0].details.de[1] : "… lokalen LLM-Klassifikatoren (v0.1)"  →  "(v0.4.0)"
timeline[0].details.en[1] : "… local LLM classifiers (v0.1)"        →  "(v0.4.0)"
```

Die Beschreibung mit „93 % Accuracy über 14 Fixtures" bleibt **unverändert** — die Triage wurde in
0.4.0 nicht berührt, die Zahl gilt weiter.

### B3 · NobleCause-Beschreibung, Stand 9. Juli

Der Text beschreibt das Projekt vor dem, was seither seine Substanz geworden ist: die unabhängige
Prüfung durch zwei fremde Modellfamilien, die publizierten Korrekturhinweise und die Schema-Tore.

**DE, neu:**

> Ständiges Gremium aus AI-Modellen dreier Familien, das öffentlich deliberiert, wohin Ressourcen
> wirksam fließen. Jede Sitzung vollständig veröffentlicht: Prompts, Einzelvoten, Dissens, Kosten.
> Deterministische Auszählung ohne Modell in der Steuerung, Schema-Tore vor jeder Publikation, und
> Fehler werden als öffentlicher Korrekturhinweis dokumentiert statt still behoben. Vor dem Go-Live
> unabhängig durch zwei fremde Modellfamilien geprüft. Gesamtbetrieb unter 20 € im Monat.

**EN, neu:**

> Standing council of AI models from three families that publicly deliberates where resources can
> flow to real effect. Every session published in full: prompts, individual votes, dissent, costs.
> Deterministic tallying with no model in the control path, schema gates before every publication,
> and errors documented as public correction notices rather than fixed silently. Independently
> reviewed by two foreign model families before go-live. Total operating cost under €20/month.

**Bewusst ohne Zahl beim Review.** Der Release-Bericht vom 1. August nennt **29** Befunde, die
Befundliste vom 2. August **30**. Solange das nicht aufgelöst ist, geht keine Zahl auf eine
Aussenfläche. Die Auflösung gehört in die NobleCause-Akte, nicht in den CV.

### B4 · `evidence`-Link ergänzen

Multi-Agent-Lab trägt einen Beleg-Link („Eval-Harness ansehen"), NobleCause nicht. Der Rekord ist
das Belegstärkste, was das Projekt hat:

```json
"evidence": {
  "url": "https://noblecause.ai/sitzungen/2026-07c/",
  "label": { "de": "Protokoll ansehen", "en": "View a protocol" }
}
```

**Korrektur meiner eigenen früheren Aussage:** Ich hatte behauptet, die Karte habe keinen Link. Sie
hat einen (`url`); was fehlt, ist der Beleg-Link. Der Unterschied ist der zwischen „hier ist die
Seite" und „hier ist der Beweis".

---

## C · Repo-Hygiene — für CC

### C1 · folio, offene Arbeit committen

Drei getrennte Commits, ein Anliegen je Commit:

1. `feat(scoping): Council opt-in per active-vault.json, default off`
   — `src/lib/server/env.ts`, `src/lib/server/env.scoping.test.ts`. Das ist die
   **P0.2-Entkopplung**, seit dem 12. Juli unversioniert im Baum. Eine Verhaltensänderung, die drei
   Wochen nur einmal existiert hat.
2. `fix(ntfy): wacht watcher plist — separate archive dir`
   — `release/0.4.0/ntfy/com.aionlumen.wacht-ntfy-watcher.plist`.
3. `docs(release): pilot artefacts 0.2.0–0.4.0`
   — die untracked `release/`-Ordner. 308 KB Release-Historie, die bislang genau einmal existiert.

Die untracked Screenshots unter `docs/screenshots/release/` und `Fotos/` **erst nach Sichtung** —
PII-Regel, vor jedem Commit visuell gegen echte Konten und Adressen prüfen.

### C2 · CHANGELOG

`folio`: neuer Abschnitt **`## [Unreleased]`** über `[0.4.0]`, mit den drei Punkten aus C1 plus dem
ntfy-Kanal (`928d022`) und dem Leuchtfeuer-plist-Fix (`a94e861`).

`multi-agent`: Abschnitt `## [0.4.0]` mit den vier Yahoo-Move-Commits, dann Tag `v0.4.0`.

### C3 · Screenshots

Nach Matrix betroffen sind Bilder, die eine Versionsnummer oder die Heute-Ansicht zeigen. Vor der
Neuerzeugung prüfen, welche das tatsächlich sind — kein pauschales Neurendern. Portfolio-Set unter
`assets/portfolio/` mitprüfen, damit kein Portal-Screenshot still veraltet.

---

## D · Was bewusst unangetastet bleibt

- **Alle Zahlen.** Triage in 0.4.0 nicht berührt, also keine neue Eval und keine neue Zahl. 93 % über
  14 Fixtures bleibt, mit unverändertem Beleg-Link.
- **NobleCause auf aion-lumen.ch.** Bleibt draussen als Produktreferenz, steht nur im Long Table.
  Begründung: die Marke ist local-first, NobleCause ist per Konstruktion drei Cloud-APIs. Derselbe
  Schnitt wie bei frag-shifu am 8. Juli.
- **Der CV-Text selbst.** Nur die Karten und die Versionsangaben. Ob NobleCause im Profiltext
  auftaucht, entscheidet die Karriere-Session.
- **Die Roadmap-Spalte** auf aion-lumen.ch. Befund notiert, Umsetzung eigener Schnitt.
