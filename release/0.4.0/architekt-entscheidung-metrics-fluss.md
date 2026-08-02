# Design-Entscheidung für den aion-lumen-Architekten: Leuchtfeuer-Metrik-Fluss

**Von:** cowork-release-pilot (Release-Lauf #3, folio v0.4.0) · **Datum:** 2026-07-10
**Typ:** folio-Design-Entscheidung · **Dringlichkeit:** blockiert NICHT den folio-Release (Karte + Privacy gehen live und degradieren sauber); blockiert nur den **tatsächlichen Metrik-Datenfluss**.

## Die Entscheidung in einem Satz
Wie kommen die Leuchtfeuer-Metrik-Aggregate vom VPS auf Afschins Mac zu folio — **privates VPS-Verzeichnis + SSH-Pull** (CCs Umsetzung) oder ein **authentifizierter HTTP-Endpoint** (Alternative)?

## Kontext: Was Leuchtfeuer ist (Release-Lauf #3)
Neue Heute-Hub-Karte in folio, die Site-/Repo-Metriken zeigt — **ausschließlich aus Server-Logs**, kein Client-Tracking, keine Cookies, kein externer Dienst. Das 0-externe-Calls-Markenversprechen der Sites bleibt wörtlich wahr. Datenfluss:

```
Caddy-JSON-Logs (IP in-Caddy maskiert) ─┐
                                         ├─ VPS-Cron ─► /var/lib/leuchtfeuer/metrics/<site|github>/YYYY-MM-DD.json
GitHub-API (Stars + Traffic)            ─┘                    │
                                                             └─ (?) ─► Mac ~/.folio/metrics/ ─► folio liest read-only ─► Karte
```

Der Baustein „(?)" ist die offene Entscheidung.

## Der Konflikt
Die ursprüngliche Architekt-Direktive sagte: **„`metrics/` muss in die rsync-Whitelist"**.
CC hat das **bewusst NICHT getan** und begründet (ops/leuchtfeuer/README.md Z.33–41):
- Die rsync-**Whitelist steuert den Deploy** (Mac → VPS, Ziel = **Webroot `/srv/aion-lumen`**, öffentlich per Caddy `file_server`).
- Läge `metrics/` in dieser Whitelist bzw. im Webroot, wären die **Besucher-Aggregate öffentlich im Netz abrufbar** (`aion-lumen.ch/metrics/...`).
- Daher: Metriken in ein **privates** Verzeichnis `/var/lib/leuchtfeuer/` (außerhalb Webroot), und der Mac **zieht** sie per SSH (Gegenrichtung: VPS → Mac).

**Cowork-Bewertung:** CCs Entscheidung ist sicherheitstechnisch korrekt — die Direktiv-Formulierung war die Falle (verwechselt Deploy-Richtung mit Metrik-Richtung), nicht CCs Umsetzung. Aber die Wahl SSH-Pull vs. authentifizierter Endpoint ist eine echte Architektur-Frage für dich.

## Optionen

**A — Privates Verzeichnis + SSH-Pull (CCs Umsetzung, fertig gebaut)**
- `/var/lib/leuchtfeuer/metrics/` (nicht im Webroot). Mac zieht per launchd/rsync über den bestehenden SSH-Weg.
- **Pro:** kein neuer öffentlicher Endpoint, keine zusätzliche Auth-Fläche, nutzt vorhandenen SSH-Zugang, Aggregate nie öffentlich. Code liegt vor (`com.folio.leuchtfeuer-pull.plist`).
- **Contra:** braucht einen SSH-User/Key, der `/var/lib/leuchtfeuer/` lesen darf (⚠️ die Deploy-User `aionlumen`/`noblecause` sind sudo-los und besitzen nur `/srv/…` — Lesezugriff auf `/var/lib/leuchtfeuer` muss eingerichtet werden). Pull ist Mac-lokal getriggert (kein Push vom VPS).

**B — Authentifizierter HTTP-Endpoint**
- Ein geschützter Endpoint (Token/Basic-Auth) liefert die Aggregate; folio/Mac holt sie per HTTP.
- **Pro:** kein SSH-Dateizugriff nötig; entkoppelt von Serverpfaden.
- **Contra:** neuer öffentlicher (wenn auch auth-geschützter) Endpoint = zusätzliche Angriffs-/Wartungsfläche; widerspricht tendenziell der „0-externe-Dienste/-Endpunkte"-Linie; Nacharbeit bei CC (Endpoint + Auth bauen).

**C — Später mit infra-reorg klären**
- Die parallel laufende infra-reorg-Session fasst denselben VPS/Caddy/SSH-Bereich an (Admin-Zugang, User-Struktur). Der SSH-Lesezugriff aus Option A ist genau so ein infra-Thema.

## Empfehlung (Cowork)
**Option A**, weil sie das Markenversprechen am saubersten hält (keine neue öffentliche Fläche) und bereits gebaut ist. Der einzige offene Punkt bei A — ein SSH-User mit Lesezugriff auf `/var/lib/leuchtfeuer/` — ist ohnehin ein infra-reorg-Thema. **Konkret:** A bestätigen, den Lesezugriff mit infra-reorg einrichten.

## Was NICHT betroffen ist
- Der **folio-Release v0.4.0** (Karte + `/leuchtfeuer` + Privacy-Kaskade) geht unabhängig live. Die Karte zeigt bis zum ersten Pull „Noch keine Metriken / letzter Stand mit Datum" (Degradation, by design). Kein Blocker.
- **VPS-Apply** (Caddy-Logging, Collectors, Cron) ist ohnehin Afschins sudo-Schritt.

## Aktueller Release-Stand (Kontext)
- folio `feat/leuchtfeuer` = `a13e377`, gepusht, Tests grün. G1 freigegeben.
- ChatGPT-Review: 0 echte Blocker; F1 (kein Client-Tracking) + F2 (kein Token/PII) bestätigt.
- Privacy-Reconciliation auf 4 Sites steht bereit (Reichweitenmessung aus anonymisierten Logs, 7-Tage-Retention).
- Nächster Schritt Cowork: Phase 5 (Fixes einarbeiten) → G2 (Deploy-Schrittfolge). Läuft parallel zu dieser Entscheidung.
