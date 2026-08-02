# Check-Direktive ChatGPT — Konsistenz-Review Release 0.4.0

**Reviewer:** ChatGPT (Pro, Web-Browsing aktiviert) · **Von:** cowork-release-pilot, Lauf #4
**Ergebnis:** EIN Markdown-Report → wird als `release/0.4.0/chatgpt-report.md` abgelegt. Nur Befunde, keine Umsetzung.
**Prozess-Tiefe:** enger Check — verengt auf zwei Aussenflächen plus Regressionsprüfung des gestrigen Go-Live.

---

## Auftrag — nur Konsistenz und Fakten, KEINE Bewertung

Reiner Konsistenz- und Faktencheck, kein Design- oder Marketing-Review.

**NICHT tun:** keine ästhetischen Urteile (Hintergrundbild, Typografie, „wirkt professionell",
Farbstimmung, Layout-Geschmack) · keine Zielgruppen-Simulation · keine Ton- oder Stilvorschläge ·
keine Empfehlung ohne konkreten Widerspruch oder Fehler.

**NUR:** überprüfbare Fakten. Stimmt X mit Y überein? Ist X erreichbar (HTTP)? Existiert eine
Pflichtangabe? Widersprechen sich Zahlen, Versionen oder Claims zwischen Site und Repo?

## Regel gegen Halluzination (kritisch)

Für **jede** geprüfte URL: exakt aufgerufene URL plus HTTP-Status (200 / 404 / Timeout /
Redirect-Ziel) protokollieren.

- Seite nicht ladbar → **„konnte nicht prüfen (Grund)"**, niemals „fehlt" oder „existiert nicht"
  daraus ableiten.
- „Fehlt" nur, wenn die Seite nachweislich mit 200 lud und die Angabe dort nicht vorhanden war.

---

## Prüfobjekte

**Sites:** https://aion-lumen.ch · https://mirhamed.ch · https://noblecause.ai

**Öffentliche Repos:**
- https://github.com/aion-lumen/folio
- https://github.com/aion-lumen/multi-agent-lab
- https://github.com/aion-lumen/aion-lumen.com
- https://github.com/noblecause-ai/NobleCause.ai

**Nicht prüfbar, kein Befund:** Das Repo hinter mirhamed.ch (`carta`) ist **privat**. Prüfe
mirhamed.ch ausschliesslich über die Live-Site. Ein „Repo nicht erreichbar" ist hier erwartet und
gehört nicht in die Befundliste.

---

## Statushinweise — erwartete Zustände, die KEIN Befund sind

1. **`multi-agent-lab` trägt noch keinen Tag `v0.4.0`.** Er ist in diesem Release vorgeschlagen und
   wird erst nach der Freigabe gesetzt. Aktuell ist `v0.3.0` der jüngste Tag. Das ist erwartet.
2. **Die unten eingefügten Entwurfstexte sind noch nicht live.** Sie sollen geprüft werden, nicht
   gesucht. Wenn die Live-Site sie nicht enthält, ist das der Ist-Zustand, kein Fehler.
3. **Es gibt keinen Branch `release/0.4.0`.** Der Meilenstein ist projektübergreifend, nicht ein
   folio-Branch. Falls du danach suchst und ihn nicht findest: Statushinweis, kein Fehler.
4. **noblecause.ai wurde am 2. August 2026 neu ausgeliefert.** Ein Cache kann dir kurzzeitig die
   Vorgängerfassung zeigen; HTML wird mit `max-age=300, must-revalidate` ausgeliefert. Bei
   Abweichungen bitte einmal mit Cache-Umgehung gegenprüfen und beides protokollieren.

---

## Fokus 1 — aion-lumen.ch, Versions- und Feature-Konsistenz

Auf https://aion-lumen.ch/folio/ wird die Folio-Version an mehreren Stellen angezeigt.

**Zu prüfen:**

- **Welche Folio-Version zeigt die Seite?** Bitte **alle** Fundstellen mit Kontext auflisten
  (Eyebrow, Badge, Bildunterschrift, Statusspalte, Fusszeile der CTA).
- **Welche Version trägt das öffentliche Repo `aion-lumen/folio`?** Jüngster Tag, CHANGELOG-Kopf,
  `package.json`. Stimmen Tag, CHANGELOG und `package.json` untereinander überein?
- **Widerspruch benennen**, falls Site und Repo auseinanderliegen — mit beiden Werten und Belegen.
- **Die Spalte „Was als nächstes kommt"** listet Einträge mit Versionsmarken. Prüfe, ob dort
  Versionen als künftig ausgewiesen sind, die laut Repo bereits vergangen sind. Nur die faktische
  Aussage, keine Empfehlung zur Roadmap.
- **Leuchtfeuer:** Kommt der Begriff irgendwo auf aion-lumen.ch vor? Falls ja, wo und in welcher
  Aussage? Falls nein, bitte als Faktum festhalten (nicht als Mangel bewerten).

**Entwurfstext, der ergänzt werden soll — bitte auf faktische Richtigkeit prüfen, nicht auf Stil:**

> EN: Leuchtfeuer — reach from anonymised server logs only; no cookies, no client-side tracking, no external analytics
>
> DE: Leuchtfeuer — Reichweite allein aus anonymisierten Server-Logs; keine Cookies, kein Client-Tracking, keine externe Analytik

**Konkrete Frage dazu:** Widerspricht diese Aussage irgendetwas, das auf aion-lumen.ch oder im Repo
`aion-lumen/folio` steht — insbesondere im Datenschutz-/Privacy-Text oder in `ops/leuchtfeuer/`?
Lädt aion-lumen.ch nachweislich keine externen Ressourcen (Fonts, CDN, Analytics)? Bitte die
geladenen Fremd-Domains auflisten, falls welche vorkommen.

---

## Fokus 2 — mirhamed.ch, Projektkarten

Auf https://mirhamed.ch stehen unter „Eigenentwicklungen" vier Karten: Multi-Agent-Lab, Folio by
Aion Lumen, frag-shifu.ch, NobleCause.ai.

**Zu prüfen — Ist-Zustand mit Beleg:**

- Welchen **Status/Versionstext** trägt jede der vier Karten aktuell?
- Widersprechen diese den öffentlichen Repos (`aion-lumen/folio`, `aion-lumen/multi-agent-lab`)?
- Trägt jede Karte einen funktionierenden Link? HTTP-Status je Ziel.
- Die Multi-Agent-Lab-Karte nennt eine Accuracy-Zahl über eine Fixture-Zahl. Bitte beide Werte
  zitieren und gegen die Belegquelle im Repo prüfen (Eval-Harness / `results-*.json`). **Stimmt die
  Zahl noch?** Falls die Belegquelle nicht auffindbar ist: „konnte nicht prüfen", nicht „falsch".

**Geplante Statusänderungen — bitte gegen die Repos prüfen, ob sie zutreffen würden:**

```
Multi-Agent-Lab   "Aion Lumen · v0.1"      →  "Aion Lumen · v0.4.0"
Folio             "v0.1.0 veröffentlicht"  →  "v0.4.0 veröffentlicht"
Folio (EN)        "v0.1.0 released"        →  "v0.4.0 released"
```

**Entwurfstext für die NobleCause-Karte — vollständig, bitte auf faktische Richtigkeit prüfen:**

> **DE:** Ständiges Gremium aus AI-Modellen dreier Familien, das öffentlich deliberiert, wohin
> Ressourcen wirksam fließen. Jede Sitzung vollständig veröffentlicht: Prompts, Einzelvoten,
> Dissens, Kosten. Deterministische Auszählung ohne Modell in der Steuerung, Schema-Tore vor jeder
> Publikation, und Fehler werden als öffentlicher Korrekturhinweis dokumentiert statt still behoben.
> Vor dem Go-Live unabhängig durch zwei fremde Modellfamilien geprüft. Gesamtbetrieb unter 20 € im
> Monat.

> **EN:** Standing council of AI models from three families that publicly deliberates where resources
> can flow to real effect. Every session published in full: prompts, individual votes, dissent,
> costs. Deterministic tallying with no model in the control path, schema gates before every
> publication, and errors documented as public correction notices rather than fixed silently.
> Independently reviewed by two foreign model families before go-live. Total operating cost under
> €20/month.

**Fünf Aussagen daraus, die belegbar sein müssen — bitte je einzeln gegen noblecause.ai und
`noblecause-ai/NobleCause.ai` prüfen und mit Fundstelle belegen oder widerlegen:**

1. Modelle aus **drei verschiedenen Familien** — welche?
2. Jede Sitzung **vollständig veröffentlicht**, einschliesslich Prompts, Einzelvoten, Dissens und
   **Kosten** — sind die Kosten je Modell tatsächlich öffentlich?
3. **Deterministische Auszählung ohne Modell in der Steuerung** — findet sich das im Code
   (`gremium/`)?
4. **Schema-Tore vor jeder Publikation** — existieren Schema-Validierungsschritte in den Workflows?
5. **Öffentliche Korrekturhinweise statt stiller Behebung** — existieren publizierte
   Korrekturhinweise? Wie viele, wo?

**Bewusst ohne Zahl:** Der Satz zum Review nennt absichtlich keine Befundzahl. Falls du im Repo
zwei verschiedene Zahlen findest, ist genau das ein erwünschter Befund — bitte beide mit Fundstelle
nennen.

---

## Fokus 3 — Regressionsprüfung des Go-Live vom 2. August

noblecause.ai wurde gestern von einer alten auf eine neue Fassung umgestellt. Bitte mit
HTTP-Status prüfen:

| # | Prüfung | erwartet |
|---|---|---|
| 1 | `https://noblecause.ai/sessions/2026-07c/` | **301** auf `/sitzungen/2026-07c/` |
| 2 | `https://noblecause.ai/sitzungen/2026-07c/` | 200, Protokoll der Sitzung 3 |
| 3 | `https://noblecause.ai/journal/2026-07-20/` | 200, **kein** Redirect |
| 4 | `https://noblecause.ai/en/` | 200, kein Redirect |
| 5 | Startseite: Terminzeile | Nennt sie ein Datum **in der Vergangenheit** als künftiges Ereignis? |
| 6 | `https://noblecause.ai/gibt-es-nicht/` | 404, nicht die Startseite |
| 7 | Antwort-Header der Startseite | Trägt sie `content-security-policy`? Welchen Wert? |

Punkt 5 ist der wichtigste: Auf der Vorgängerfassung stand wochenlang ein Wart-Termin, der zwölf
Tage in der Vergangenheit lag, und ein falsches Sitzungsdatum. Bitte ausdrücklich prüfen, ob das
behoben ist.

---

## Zusätzlich — Sicherheit und Pflichtangaben (Fakten)

- **Impressum** auf aion-lumen.ch, mirhamed.ch, noblecause.ai: Status und ob Name, Adresse und
  Kontakt vorhanden sind.
- **Footer-Links** je Site: 404er?
- **Secrets oder Schlüssel** in den öffentlichen Repos, in Workflow-Dateien oder in sichtbaren
  Actions-Logs?
- **Echte personenbezogene Daten** (fremde Namen, Mail-Adressen, Anschriften) in Code, Fixtures,
  Screenshots oder in der Git-Historie der öffentlichen Repos?

---

## Auffang-Frage (am Ende beantworten)

Ist dir ausserhalb des obigen Fokus etwas **faktisch Widersprüchliches** aufgefallen? Nur konkrete
Fakten mit Beleg, keine Vorschläge und keine Meinungen.

---

## Ausgabeformat (verbindlich)

Pro Befund eine Zeile:

`[Blocker|Wichtig|Kür] Fläche — Fakt/Widerspruch — Beleg (URL + HTTP-Status / Datei:Zeile)`

Dazu eine Tabelle **„URL-Zugriffsprotokoll"**: URL | HTTP-Status | Ergebnis.

Nicht ladbare Seiten laufen als „konnte nicht prüfen" in der Protokolltabelle, **nicht** als Befund.
