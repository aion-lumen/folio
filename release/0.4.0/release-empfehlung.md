# Release-Empfehlung 0.4.0 — Phase 4

**Von:** Leitstand (Release-Pilot, Lauf #4) · **Datum:** 2026-08-02
**Grundlage:** `check-direktive-chatgpt.md` · `chatgpt-report.md` (ChatGPT Pro, 15:53–17:00 CEST)
**Triangulation:** jeder Negativbefund einzeln gegen den echten Stand geprüft, Ergebnis unten je Befund.

---

## 1 · Qualität des Reviews

Acht Befunde, davon **vier Bestätigungen** dessen, was ich selbst gemessen hatte, und **vier neue**.
Kein einziger Halluzinationsbefund: Wo ChatGPT nicht messen konnte (Live-CSP-Header, Rohstatus der
404-URL, Git-Historie), steht „konnte nicht prüfen" mit Grund — genau wie beauftragt. Das
URL-Zugriffsprotokoll umfasst 43 Adressen mit Status.

Die vier vorweggenommenen Statushinweise haben gewirkt: der fehlende `v0.4.0`-Tag, der nicht
existierende `release/0.4.0`-Branch, die noch nicht live geschalteten Entwürfe und das private
`carta`-Repo kommen ausdrücklich **nicht** als Befunde zurück.

---

## 2 · Blocker — zwei, beide in meinem eigenen Entwurfstext

### B-1 · „durch zwei fremde Modellfamilien geprüft" ist unbelegt

**Befund:** Die dokumentierten Reviewer waren **Kimi 3** und **Codex**. Codex gehört zur
OpenAI-Familie — und OpenAI ist bereits eine der drei Gremiums-Familien. „Fremd" trifft damit auf
einen der beiden nicht zu.

**Triangulation:** bestätigt. Der Report belegt es aus `docs/review-prompt-2026-08-01.md` und
`gremium/README.md`. Die Aussage stammt aus **meinem** Phase-2-Entwurf. Genau dafür ist der Review da.

**Korrigierter Wortlaut:** siehe Abschnitt 5.

### B-2 · „Gesamtbetrieb unter 20 € im Monat" ist öffentlich nicht prüfbar

**Befund:** Öffentlich belegt sind Kosten je Sitzung (0,32 € / 2,21 € / 2,60 €), ein Journal-Lauf
(2,43 €) und ein Budgetdeckel je Sitzung. Ein Monatsabschluss über alle Läufe samt Hosting existiert
nicht öffentlich.

**Triangulation:** bestätigt. Der Satz steht **bereits heute** auf der Karte, seit dem 9. Juli — ich
hatte ihn unbesehen übernommen. Das ist der Fehler: eine Zahl weiterzuschleppen, weil sie schon da
stand.

**Ersatz:** die belegbare und stärkere Aussage. Kosten **je Modell und Lauf auf den Cent
veröffentlicht** ist nachprüfbar (ChatGPT hat sie zitiert) und sagt mehr über die Methode als eine
Monatssumme.

---

## 3 · Wichtig — fünf, alle bereits im Entwurf oder klein

| # | Befund | Triangulation | Ort |
|---|---|---|---|
| W-1 | aion-lumen.ch nennt Folio an fünf Stellen `v0.3.0`, Repo ist `v0.4.0` | bestätigt, deckt sich mit eigener Messung | Phase 2, A1 |
| W-2 | mirhamed.ch Folio-Karte `v0.1.0`, Repo `v0.4.0` | bestätigt | Phase 2, B1 |
| W-3 | mirhamed.ch Multi-Agent-Karte `v0.1`, Repo `v0.3.0` | bestätigt | Phase 2, B2 |
| W-4 | `ops/leuchtfeuer/README.md` beschreibt den VPS-Teil als ausstehend und den SSH-Host als Platzhalter, während Live-Impressum und Betrieb ihn als laufend führen | **neu, verifiziert:** Zeile 43 und 70 tragen wörtlich „placeholder". `origin/main..HEAD` ist leer, ChatGPT hat also den aktuellen Stand gelesen | neu → CC |
| W-5 | Roadmap-Spalte listet `v0.2` und `v0.3` als künftig, beide sind veröffentlichte Tags | bestätigt, deckt sich mit A3 | aion-lumen-Session |

Zu **W-4**: Die Richtung ist wichtig. Nicht das Impressum ist falsch, sondern das README ist
veraltet — es beschreibt eine Einrichtung als ausstehend, die seit Juli produktiv läuft. Der Commit
`a94e861` hat die plist korrigiert und die Platzhalter-Sprache stehen lassen.

Die Multi-Agent-Zahlen sind gegengeprüft und **stimmen**: `results-2026-07-09.json` weist 14
Fixtures, Accuracy `0.9286` und FPR/FNR `0` aus. 93 % bleibt.

---

## 4 · Eskalation an die NobleCause-Session — nicht Teil dieses Release-Laufs

### E-1 · Sitzung 3 trägt einen ungeklärten Familien-Zuordnungsfehler

**Das ist der schwerste Fund dieses Reviews, und er kam von aussen.**

Im Protokoll der Sitzung 3 erklärt das unter „Claude Opus" gelistete Runde-1-Votum sich selbst als
Modell der GPT-/OpenAI-Familie. Der Wart hat die Diskrepanz benannt. Das Modell schreibt in Runde 2
wörtlich:

> „Sollte ein Listungsfehler vorliegen, ist er vor Protokollierung zu bereinigen — die
> Befangenheitsregel steht und fällt mit korrekter Zuordnung."

**Es wurde trotzdem protokolliert.** Verifiziert im Rekord, `sessions/2026-07c`, Schlussvotum
Runde 2, Abschnitt „Vorbemerkung zur Formalie".

**Warum das schwer wiegt:** Die Befangenheitsregel trägt in derselben Sitzung die Enthaltung in
Säule C — das GPT-Modell enthält sich bei AI-nahen Organisationen, weil sein Hersteller ein
AI-Labor ist. Eine Regel, die an der Familienzuordnung hängt, in einer Sitzung, deren
Familienzuordnung im eigenen Protokoll bestritten wird.

**Frist:** vor **Sitzung 4 am 6. August, 12:00 UTC**. Besteht der Listungsfehler im Mechanismus
fort, erbt Sitzung 4 ihn — und der Rekord ist unveränderlich.

**Nicht mein Zuständigkeitsbereich, deshalb Eskalation und kein Auftrag.**

### E-2 · Dieselbe Überdehnung steht im NobleCause-Release-Bericht

`noblecause-release-0.4.0-fuer-leitstand.md` §4 formuliert „zwei unabhängigen Modellen fremder
Familien". Dort ist „fremd" als „fremd gegenüber dem Architekten" gemeint, liest sich aber wie
„fremd gegenüber dem Gremium". Gehört präzisiert, bevor es jemand zitiert — ich hätte es beinahe in
einen Lebenslauf geschrieben.

---

## 5 · Korrigierter Entwurfstext — NobleCause-Karte

**DE:**

> Ständiges Gremium aus AI-Modellen dreier Familien, das öffentlich deliberiert, wohin Ressourcen
> wirksam fließen. Jede Sitzung vollständig veröffentlicht: Prompts, Einzelvoten, Dissens und die
> Kosten je Modell auf den Cent. Deterministische Auszählung ohne Modell in der Steuerung,
> Schema-Tore vor jeder Publikation, und Fehler werden als öffentlicher Korrekturhinweis
> dokumentiert statt still behoben. Vor dem Go-Live von zwei unabhängigen Modellen geprüft, in
> getrennten Arbeitskopien mit identischem Auftrag.

**EN:**

> Standing council of AI models from three families that publicly deliberates where resources can
> flow to real effect. Every session published in full: prompts, individual votes, dissent, and
> per-model costs to the cent. Deterministic tallying with no model in the control path, schema
> gates before every publication, and errors documented as public correction notices rather than
> fixed silently. Reviewed before go-live by two independent models working from separate copies
> under an identical brief.

**Was sich geändert hat:** „fremde Modellfamilien" ist raus, „getrennte Arbeitskopien mit
identischem Auftrag" ist drin — das ist der methodisch tragende Teil und belegbar. Die Monatssumme
ist durch die Kostentransparenz je Modell ersetzt, die nachprüfbar ist. Alle übrigen fünf Aussagen
hat ChatGPT einzeln belegt.

---

## 6 · Was unverändert bleibt

- **Alle Zahlen.** Triage unberührt, 93 % über 14 Fixtures gegengeprüft und bestätigt.
- **Der Leuchtfeuer-Entwurfstext** für aion-lumen.ch. ChatGPT: methodisch faktisch richtig, kein
  Widerspruch zu Datenschutztext, CHANGELOG oder Architektur.
- **NobleCause bleibt als Produktreferenz von aion-lumen.ch fern.**
- **Semver:** kein neuer folio-Tag, `multi-agent` auf `v0.4.0`.

---

## 7 · Empfehlung

**Freigabe der Umsetzung mit den zwei Korrekturen aus Abschnitt 5.** Kein Blocker, der den Release
aufhält — beide Blocker betreffen einen Entwurfstext, der noch nicht veröffentlicht ist, und beide
sind durch eine Umformulierung erledigt.

W-4 (Leuchtfeuer-README) kommt als vierter Commit zu C1 hinzu. W-5 (Roadmap) geht als Befund an die
aion-lumen-Session, ohne Umsetzung in diesem Lauf — kein Scope-Zuwachs.

E-1 und E-2 gehen sofort an die NobleCause-Session, unabhängig vom Gate.
