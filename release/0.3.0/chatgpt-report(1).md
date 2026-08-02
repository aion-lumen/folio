# ChatGPT Konsistenz-Report — Folio Release v0.4.0 „Leuchtfeuer"

**Datum:** 2026-07-10  
**Reviewer:** ChatGPT mit Websuche  
**Prüfbasis:** `folio` Branch `feat/leuchtfeuer`, Live-Sites, öffentliche GitHub-Dateiansichten  
**Scope:** Nur Fakten/Konsistenz/Sicherheit gemäss F1–F4. Keine Bewertung, keine Umsetzung.

## Kurzstatus

- **Blocker:** 1
- **Wichtig:** 4
- **Kür:** 0
- **F1:** Kein externer Client-Side-Request in der Leuchtfeuer-Karte/Detail-View gefunden.
- **F2:** Keine Tokenwerte/Secrets in den geprüften Collector-Dateien gefunden; nur Env-Var-Namen. IP-Anonymisierung ist im Caddy-Snippet und Parser dokumentiert/implementiert.
- **Einschränkung:** Git-Historie und Actions-Logs konnten über die Webprüfung nicht vollständig durchsucht werden. Befund gilt für die live abrufbaren Branch-Dateien.

---

## Befunde

### [Blocker] F4 — frag-shifu-Neufassung behauptet „Keine Cookies" trotz funktionalem Session-Cookie — Beleg

Die geplante frag-shifu-Datenschutz-Neufassung in `ops/leuchtfeuer/privacy-drafts.md` behauptet: „Keine Cookies, keine Tracker, keine externen Dienste, keine Profilbildung." Die Live-Datenschutzseite von frag-shifu erklärt dagegen ausdrücklich ein funktionales Cookie: „ein einziges funktionales Cookie (Session-ID) zur Authentifizierung" und grenzt nur Tracking-Cookies aus.

**Widerspruch:** Laut F4 darf die frag-shifu-Neufassung nicht „keine Cookies" behaupten, sondern muss „keine Tracking-Cookies" sagen.

**Beleg:**  
- `https://github.com/aion-lumen/folio/blob/feat/leuchtfeuer/ops/leuchtfeuer/privacy-drafts.md` — HTTP 200 — Datei: `ops/leuchtfeuer/privacy-drafts.md`, Zeile 257  
- `https://frag-shifu.ch/datenschutz` — HTTP 200 — Abschnitt 8, Zeilen 27–31

---

### [Wichtig] F3 — aion-lumen.ch Live-Datenschutz widerspricht neuem Server-Log-Setup — Beleg

Die Live-Seite sagt: „setzt keine Cookies, nutzt kein Tracking und keine Analyse-Werkzeuge" und zusätzlich: „Es werden serverseitig keine personenbezogenen Daten erhoben oder verarbeitet." Das geplante Leuchtfeuer-Setup sieht jedoch Reichweitenmessung aus Caddy-Serverlogs vor; das Caddy-Snippet beschreibt Logfiles für die vier Sites, IP-Maskierung bei Write-Time und 7-Tage-Retention.

**Widerspruch:** Die neue Realität enthält serverseitige Logauswertung zur Reichweitenmessung. Der aktuelle Text behauptet keine Analyse-Werkzeuge und keine serverseitige Verarbeitung personenbezogener Daten.

**Beleg:**  
- `https://aion-lumen.ch/impressum/` — HTTP 200 — Zeilen 15–18  
- `https://github.com/aion-lumen/folio/blob/feat/leuchtfeuer/ops/leuchtfeuer/privacy-drafts.md` — HTTP 200 — Zeilen 244–252  
- `https://github.com/aion-lumen/folio/blob/feat/leuchtfeuer/ops/leuchtfeuer/caddy-logging.snippet.caddy` — HTTP 200 — Zeilen 321–328, 337–343, 347–369

---

### [Wichtig] F3 — mirhamed.ch Live-Datenschutz widerspricht geplanter Reichweitenmessung — Beleg

Die Live-Seite sagt: „Es werden keine Tracking-Cookies gesetzt und keine Analyse-Werkzeuge eingesetzt." Das geplante Setup wertet Server-Zugriffsprotokolle zur einfachen Reichweitenmessung aus.

**Widerspruch:** „keine Analyse-Werkzeuge" ist mit geplanter Reichweitenmessung aus Server-Logs nicht konsistent, auch wenn keine externen Analytics-Dienste oder Tracking-Cookies eingesetzt werden.

**Beleg:**  
- `https://mirhamed.ch/impressum` — HTTP 200 — Zeilen 11–18  
- `https://github.com/aion-lumen/folio/blob/feat/leuchtfeuer/ops/leuchtfeuer/privacy-drafts.md` — HTTP 200 — Zeilen 244–252  
- `https://github.com/aion-lumen/folio/blob/feat/leuchtfeuer/ops/leuchtfeuer/caddy-logging.snippet.caddy` — HTTP 200 — Zeilen 321–328

---

### [Wichtig] F3 — noblecause.ai Live-Datenschutz nennt Server-Logs nur für Betriebssicherheit, nicht Reichweitenmessung — Beleg

Die Live-Seite sagt, technische Server-Logs könnten kurzfristig „zur Betriebssicherheit" gespeichert werden und es gebe „keine Analyse-Dienste". Das geplante Leuchtfeuer-Setup verwendet Server-Logs zusätzlich zur einfachen Reichweitenmessung.

**Widerspruch:** Der aktuelle Zweck „Betriebssicherheit" deckt die geplante Reichweitenmessung nicht ab. „Keine Analyse-Dienste" bleibt nur dann konsistent, wenn der Text klar zwischen externen Analytics-Diensten und interner Server-Log-Auswertung unterscheidet.

**Beleg:**  
- `https://noblecause.ai/impressum/` — HTTP 200 — Zeilen 20–23 und 41–43  
- `https://github.com/aion-lumen/folio/blob/feat/leuchtfeuer/ops/leuchtfeuer/privacy-drafts.md` — HTTP 200 — Zeilen 244–252  
- `https://github.com/aion-lumen/folio/blob/feat/leuchtfeuer/ops/leuchtfeuer/caddy-logging.snippet.caddy` — HTTP 200 — Zeilen 321–328

---

### [Wichtig] F3 — Erwartete Entwurfsdatei `release/0.4.0/phase2-update-entwuerfe.md` nicht auffindbar — Beleg

Die Check-Direktive verweist für die geplanten Neufassungen auf `release/0.4.0/phase2-update-entwuerfe.md`, Abschnitt 2.4. Diese Datei bzw. der Release-Ordner war auf dem geprüften Branch nicht abrufbar. Stattdessen war `ops/leuchtfeuer/privacy-drafts.md` verfügbar und wurde für die Draft-Prüfung herangezogen.

**Status:** Nicht als inhaltlicher Fehler der Datenschutztexte gewertet, aber als Ablage-/Referenzinkonsistenz im Review-Material.

**Beleg:**  
- `https://raw.githubusercontent.com/aion-lumen/folio/feat/leuchtfeuer/release/0.4.0/phase2-update-entwuerfe.md` — HTTP 404  
- `https://github.com/aion-lumen/folio/tree/feat/leuchtfeuer/release/0.4.0` — HTTP 404  
- `https://github.com/aion-lumen/folio/tree/feat/leuchtfeuer/release` — HTTP 404  
- `https://github.com/aion-lumen/folio/blob/feat/leuchtfeuer/ops/leuchtfeuer/privacy-drafts.md` — HTTP 200

---

## Geprüft ohne Befund

### F1 — Client-Side-Requests / Tracking

Kein Befund. Die Leuchtfeuer-Karte beschreibt Metriken aus `~/.folio/metrics/`, Caddy-Serverlogs und GitHub-API-Snapshots ausdrücklich ohne clientseitiges Tracking. In `CardLeuchtfeuer.svelte` wurden keine `fetch(`-, `analytics`- oder `cookie`-Treffer gefunden. Die Detailseite lädt per `+page.server.ts` serverseitig `readLeuchtfeuer()`, ebenfalls aus `~/.folio/metrics/`.

**Beleg:**  
- `https://github.com/aion-lumen/folio/blob/feat/leuchtfeuer/src/lib/heute/CardLeuchtfeuer.svelte` — HTTP 200 — Zeilen 611–630; `find fetch(`: kein Treffer; `find analytics`: kein Treffer; `find cookie`: kein Treffer  
- `https://github.com/aion-lumen/folio/blob/feat/leuchtfeuer/src/routes/leuchtfeuer/%2Bpage.server.ts` — HTTP 200 — Zeilen 255–262; `find fetch(`: kein Treffer  
- `https://github.com/aion-lumen/folio/tree/feat/leuchtfeuer` — HTTP 200 — Branch `feat/leuchtfeuer` sichtbar, `ops/leuchtfeuer` vorhanden

### F2 — Secrets/PII in Collectors

Kein Befund in den geprüften Dateien. `collect_github.py` nennt nur Env-Var-Namen (`LEUCHTFEUER_GH_PAT_AION`, `LEUCHTFEUER_GH_PAT_NOBLECAUSE`), baut den Authorization-Header aus dem Laufzeit-Token und gibt laut Code bei fehlendem Token nur den Env-Var-Namen aus. `run-collectors.sh` sourced `/etc/leuchtfeuer/env` und echo't keine Token. Cron ruft nur den Runner auf. `collect_caddy.py` geht von bereits maskierten IPs aus und speichert für Unique-Schätzung nur Hash(masked-IP + UA); Ausgabe enthält nur Pfad, Visits, Unique-Schätzung und Bots.

**Beleg:**  
- `https://github.com/aion-lumen/folio/blob/feat/leuchtfeuer/ops/leuchtfeuer/collect_github.py` — HTTP 200 — Zeilen 481–492, 512–524, 526–547  
- `https://github.com/aion-lumen/folio/blob/feat/leuchtfeuer/ops/leuchtfeuer/run-collectors.sh` — HTTP 200 — Zeilen 295–327  
- `https://github.com/aion-lumen/folio/blob/feat/leuchtfeuer/ops/leuchtfeuer/cron.d-leuchtfeuer` — HTTP 200 — Zeilen 257–268  
- `https://github.com/aion-lumen/folio/blob/feat/leuchtfeuer/ops/leuchtfeuer/collect_caddy.py` — HTTP 200 — Zeilen 555–565, 618–622, 699–701, 780–794  
- `https://github.com/aion-lumen/folio/blob/feat/leuchtfeuer/ops/leuchtfeuer/caddy-logging.snippet.caddy` — HTTP 200 — Zeilen 321–328, 347–369, 381–389

### F4 — frag-shifu Live-Status

Kein Befund beim aktuellen Live-Text. Die Live-Datenschutzseite ist DE-only im geprüften Pfad und nennt korrekt „Keine Tracking-Cookies" statt „keine Cookies". Die Blocker-Inkonsistenz betrifft nur die geplante Neufassung in `privacy-drafts.md`.

**Beleg:**  
- `https://frag-shifu.ch/datenschutz` — HTTP 200 — Zeilen 27–31  
- `https://frag-shifu.ch/` — HTTP 200 — Footer zeigt `Datenschutz`-Link, Zeilen 119–123

---

## URL-Zugriffsprotokoll

| URL | Status | Ergebnis |
|---|---:|---|
| `https://aion-lumen.ch/` | 200 | Startseite lädt; Footer-Link `Impressum` sichtbar. |
| `https://aion-lumen.ch/impressum/` | 200 | Impressum + Datenschutz geladen; Name, Adresse, Kontakt vorhanden. Datenschutztext widerspricht neuem Server-Log-Setup. |
| `https://aion-lumen.ch/datenschutz` | konnte nicht prüfen | Web-Tool-Safe-URL-Restriktion; kein Befund daraus abgeleitet. Datenschutz war auf `/impressum/` prüfbar. |
| `https://mirhamed.ch/` | 200 | Startseite lädt; Footer-Link `Impressum` sichtbar. |
| `https://mirhamed.ch/impressum` | 200 | Impressum + Datenschutz geladen; Name, Adresse, Kontakt vorhanden. Datenschutztext widerspricht geplanter Reichweitenmessung. |
| `https://mirhamed.ch/datenschutz` | konnte nicht prüfen | Web-Tool-Safe-URL-Restriktion; kein Befund daraus abgeleitet. Datenschutz war auf `/impressum` prüfbar. |
| `https://noblecause.ai/` | 200 | Startseite lädt; Footer-Link `Impressum` sichtbar. |
| `https://noblecause.ai/impressum/` | 200 | Impressum + Datenschutz geladen; Name, Adresse, Kontakt vorhanden. Datenschutztext nennt Server-Logs nur für Betriebssicherheit. |
| `https://noblecause.ai/datenschutz` | konnte nicht prüfen | Web-Tool-Safe-URL-Restriktion; kein Befund daraus abgeleitet. Datenschutz war auf `/impressum/` prüfbar. |
| `https://frag-shifu.ch/` | 200 | Startseite lädt; Footer-Links `Impressum`, `Datenschutz`, `AGB` sichtbar. |
| `https://frag-shifu.ch/impressum` | 200 | Impressum geladen; Name, Adresse, Kontakt vorhanden. |
| `https://frag-shifu.ch/datenschutz` | 200 | Datenschutz geladen; funktionales Session-Cookie korrekt genannt. |
| `https://frag-shifu.ch/en/datenschutz` | konnte nicht prüfen | Web-Tool-Safe-URL-Restriktion / Suche ohne Treffer; kein Befund daraus abgeleitet. |
| `https://github.com/aion-lumen/folio/tree/feat/leuchtfeuer` | 200 | Branch `feat/leuchtfeuer` geladen; `ops/leuchtfeuer` sichtbar. |
| `https://github.com/aion-lumen/folio/blob/feat/leuchtfeuer/src/lib/heute/CardLeuchtfeuer.svelte` | 200 | Leuchtfeuer-Karte geladen; kein `fetch(`, `analytics`, `cookie` Treffer. |
| `https://github.com/aion-lumen/folio/blob/feat/leuchtfeuer/src/routes/leuchtfeuer/%2Bpage.server.ts` | 200 | Detail-Route serverseitig geladen; liest `readLeuchtfeuer()`. |
| `https://github.com/aion-lumen/folio/blob/feat/leuchtfeuer/src/routes/leuchtfeuer/%2Bpage.svelte` | 200 | Detail-View geladen; kein externer Client-Call festgestellt. |
| `https://github.com/aion-lumen/folio/blob/feat/leuchtfeuer/src/lib/server/leuchtfeuer/reader.ts` | 200 | Server-Reader geladen; liest lokale `~/.folio/metrics/`. |
| `https://github.com/aion-lumen/folio/blob/feat/leuchtfeuer/ops/leuchtfeuer/collect_caddy.py` | 200 | Collector geladen; IP-Hashing/Aggregate-only geprüft. |
| `https://github.com/aion-lumen/folio/blob/feat/leuchtfeuer/ops/leuchtfeuer/collect_github.py` | 200 | Collector geladen; nur Env-Var-Namen, kein Tokenwert. |
| `https://github.com/aion-lumen/folio/blob/feat/leuchtfeuer/ops/leuchtfeuer/run-collectors.sh` | 200 | Runner geladen; sourced Env-Datei, kein Token-Output im Script. |
| `https://github.com/aion-lumen/folio/blob/feat/leuchtfeuer/ops/leuchtfeuer/cron.d-leuchtfeuer` | 200 | Cron geladen; ruft Runner auf und loggt stdout/stderr. |
| `https://github.com/aion-lumen/folio/blob/feat/leuchtfeuer/ops/leuchtfeuer/caddy-logging.snippet.caddy` | 200 | Caddy-Snippet geladen; IP-Maskierung + 7-Tage-Retention. |
| `https://github.com/aion-lumen/folio/blob/feat/leuchtfeuer/ops/leuchtfeuer/privacy-drafts.md` | 200 | Geplante Datenschutztexte geladen; F4-Blocker gefunden. |
| `https://raw.githubusercontent.com/aion-lumen/folio/feat/leuchtfeuer/release/0.4.0/phase2-update-entwuerfe.md` | 404 | Erwartete Entwurfsdatei nicht abrufbar. |
| `https://github.com/aion-lumen/folio/tree/feat/leuchtfeuer/release/0.4.0` | 404 | Erwarteter Release-Ordner nicht abrufbar. |
| `https://github.com/aion-lumen/folio/tree/feat/leuchtfeuer/release` | 404 | Erwarteter Release-Ordner nicht abrufbar. |

---

## Abschluss

Der v0.4.0-Check ergibt **einen Blocker**: frag-shifu-Draft behauptet „Keine Cookies" trotz funktionalem Session-Cookie. F1 und F2 sind in den geprüften Dateien ohne Befund. F3 zeigt drei Live-Text-Inkonsistenzen und eine Ablage-/Referenzinkonsistenz zur erwarteten Entwurfsdatei.
