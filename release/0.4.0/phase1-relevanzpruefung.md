# Phase 1 — Relevanzprüfung · Release v0.4.0 (Lauf #3 — Leuchtfeuer)

**Datum:** 2026-07-10 · **Trigger:** Leuchtfeuer gebaut (CC), Branch `feat/leuchtfeuer` gepusht · **Durchgeführt von:** cowork-release-pilot (v2-Skill, erster produktiver Lauf)

## Verifizierter Stand

| Repo | Branch | HEAD | über main | Tests | Working Tree |
|---|---|---|---|---|---|
| folio | `feat/leuchtfeuer` | `a13e377` (= origin) | 2 Commits (`21b3e1b` Karte+Detail, `a13e377` Collector+privacy-drafts+Fieldnote) | ops/leuchtfeuer 7/7 grün (CC) | sauber bis auf Alt-Reste (Fotos/, release/, docs/screenshots/release/05–09) |

Version: main = v0.3.0 → **0.4.0** (minor, neues Feature).

## Was Leuchtfeuer ist
Site-/Repo-Metriken für die Folio-Heute-Hub-Karte, **ausschließlich aus Server-Logs** (kein Client-Tracking, keine Cookies, kein externer Dienst — das 0-externe-Calls-Markenversprechen bleibt wörtlich wahr). Datenfluss: Caddy-JSON-Logs (IP maskiert in-Caddy) + GitHub-API → VPS-Cron → `/var/lib/leuchtfeuer/metrics/` → lokaler launchd-rsync-Pull → `~/.folio/metrics/` → folio liest read-only → Heute-Karte + `/leuchtfeuer`.

## Matrix-Einordnung
**Feature + neue Heute-Hub-Karte, KEIN Interchange-Touch** (vom Architekten vorgegeben, verifiziert).

| Zeile | trifft zu? | Konsequenz |
|---|---|---|
| Neues Feature/Verhalten | **ja** | folio README/CHANGELOG; Heute-Karte (intern); **Privacy-Sätze auf 4 Sites** |
| Agent/Triage berührt | **nein** | keine eval-Zahl, kein Injektor |
| Interchange berührt | **nein** | Format unangetastet |
| Install-/Betriebsrelevant | **ja** | VPS-Collector, Cron, launchd-Pull, Caddy-Log-Config — aber das sind **des Stewards manuelle Ops-Schritte** (README „Blocked on der Steward"), nicht Teil des folio-Release-Pushes |
| Nur intern | nein | Privacy-Kaskade ist Außenfläche |

## Prozess-Tiefe
**Enger Review**, verengt auf zwei Dinge:
1. **Privacy-Text-Konsistenz** über die 4 Sites (stimmt der Text mit dem realen Setup überein? frag-shifu wirklich separat/DE-only?).
2. **0-externe-Calls-Markenversprechen** weiterhin wörtlich wahr (kein Client-Tracking in der Karte reingerutscht).
Keine Interchange-Prüfung, keine Zahlen-Prüfung. (Reviewer-Rotation: siehe Phase 3.)

## Betroffene Flächen
1. **folio-Repo** — README (Leuchtfeuer-Absatz), CHANGELOG [0.4.0], package.json 0.3.0→0.4.0. Karte + Detail-View sind im Branch.
2. **Privacy-Kaskade (4 Sites, Cowork-Content-Kaskade):**
   - `aion-lumen.com/impressum/index.html` — DE+EN
   - `carta/src/routes/impressum/+page.svelte` — DE+EN
   - `NobleCause.ai/site/src/routes/impressum/+page.svelte` — DE+EN
   - `frag-shifu/src/routes/datenschutz/+page.svelte` — **DE-only, separater Wortlaut** (nicht kopieren!)
   Quelltexte: `folio/ops/leuchtfeuer/privacy-drafts.md`.
3. **Screenshot** — Leuchtfeuer-Karte im Heute-Hub. Degradation ist gebaut („Noch keine Metriken" / „Stand: … · letzter verfügbarer Stand"). Screenshot zeigt entweder Demo-Daten oder den Degradations-Zustand → PII-Check.

## Offener Design-Punkt (an G1)
**metrics-Fluss weicht bewusst von der Direktive ab:** Die Direktive sagte „`metrics/` in die rsync-Whitelist". CC hat das **absichtlich NICHT** getan — Begründung (README Z.33–41): Die Whitelist steuert den Deploy-rsync (Mac→VPS, Webroot = **öffentlich**); Besucher-Aggregate dort wären öffentlich fetchbar. Metrics läuft daher in Gegenrichtung (VPS→Mac, SSH-Pull) aus einem **privaten** Verzeichnis `/var/lib/leuchtfeuer/`. **Braucht des Stewards Bestätigung** (Alternative: authentifizierter Metrics-Endpoint = anderer Entwurf). → Cowork-Bewertung: CCs Entscheidung ist sicherheitstechnisch korrekt; die Direktiv-Formulierung war die Falle, nicht CCs Umsetzung.

## Bewusst NICHT (nicht einsammeln)
- VPS-Apply + Mac-launchd-Pull = des Stewards sudo-Schritte (README).
- 08c / Modul-API-Migration (Karte ist bewusst „normal", zweiter Konsument später).
- Kein `vite dev --host`.

## Offene Entscheidungen (G1)
1. Version 0.4.0 (minor) bestätigen.
2. Privacy-Kaskade: in 0.4.0 miterledigen (empfohlen) oder separat?
3. **Design-Punkt metrics-Fluss:** Private-Dir + SSH-Pull bestätigen?
4. Reviewer für Phase 3 (Rotation — siehe dort).
