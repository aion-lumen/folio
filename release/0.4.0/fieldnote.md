# Field Note — Release v0.4.0 (Lauf #3: Leuchtfeuer)

**Datum:** 2026-07-10 · **Autor:** cowork-release-pilot · **v2-Skill, erster produktiver Lauf** · **Kern-Deliverable:** Vergleich Dauer/Reibung vs. Lauf #2.

## Was raus geht (nach G2)
- folio v0.4.0: Leuchtfeuer Heute-Hub-Karte + `/leuchtfeuer` (Server-Log-Metriken, kein Client-Tracking, degradiert bei fehlenden Daten) + `ops/leuchtfeuer/` Collectors/Cron/launchd/Tests.
- **Privacy-Reconciliation auf 4 Sites** (Datenschutz an anonymisierte Server-Log-Reichweitenmessung angepasst).

## Dauer/Reibung — Vergleich Lauf #2 vs Lauf #3
| Aspekt | Lauf #2 (0.3.0) | Lauf #3 (0.4.0) |
|---|---|---|
| Review-Reviewer | Wechsel Kimi→ChatGPT (Test) | ChatGPT etabliert; 0 Fehlalarme |
| Review-Befunde | 2 echte (ChatGPT fand sie) | 0 NEUE — ChatGPT bestätigte nur, was Cowork in Phase 2 schon fand |
| Substanz | Zahlen-Kaskade (Eval) | Privacy-Reconciliation (Legal-Text, 4 Sites) |
| Cowork-Vorarbeit | — | Vorabcheck F1+F2 clean vor Review → Review als Bestätigung |

**Netto:** Lauf #3 lief glatt. Der Review-Wert lag diesmal in der **unabhängigen Bestätigung** einer vollständigen Cowork-Analyse (kein Loch aufgedeckt) — genau das Reifezeichen, das man will. Der v2-Skill (Matrix-Prozess-Tiefe, ChatGPT-Reviewer, Vorabcheck) hat zum ersten Mal produktiv getragen.

## Architekten-Entscheid: metrics-Fluss (Option A bestätigt)
**Entscheidung:** Privates VPS-Verzeichnis `/var/lib/leuchtfeuer/metrics/` + **SSH-Pull VPS→Mac** (CCs Umsetzung), NICHT über die Deploy-rsync-Whitelist.

**Begründung (Architekt, festgehalten):**
- **Die Direktiv-Formulierung war der Fehler, nicht CCs Umsetzung.** Die Direktive verwechselte Deploy-Richtung (Mac→VPS, Webroot) mit Metrik-Richtung (VPS→Mac). Hätte CC die Whitelist-Anweisung befolgt, lägen die Besucher-Aggregate **öffentlich** unter `aion-lumen.ch/metrics/…` — auf der Site, deren Versprechen genau das ausschließt. **CC hat die Direktive korrekt NICHT ausgeführt und begründet.**
- **A statt B (auth-Endpoint):** Ein auth-geschützter Endpoint ist nicht privat, sondern öffentlich erreichbar mit Türsteher — Token-Leck, Auth-Bug, Fehlkonfiguration legen die Aggregate offen; SSH-Pull hat diese Klassen nicht. **Fehlerasymmetrie:** schlimmster Fall bei A = „Karte zeigt letzten Stand mit Datum" (sichtbar, by design abgefangen); bei B = „Besucherdaten offen" (unsichtbar, dauerhaft, markenschädigend).
- **C ist kein Alternativpfad, sondern Teil von A:** der SSH-Lesezugriff wird mit infra-reorg eingerichtet.

**Auflage zum Lesezugriff (infra-reorg):** minimal halten — eigener unprivilegierter User/Gruppe, nur Lesen, nur auf `/var/lib/leuchtfeuer/metrics/`. Deploy-User NICHT erweitern, kein sudo, `/var/lib` nicht pauschal öffnen. Pull bleibt Mac-lokal getriggert (launchd) — kein Push-Weg vom VPS in Afschins Maschine.

## Reibungspunkte / Prozess-Lehren (Deliverable erster Klasse)
1. **HARTE REGEL jetzt im Skill verankert:** Draft-Text, den der Reviewer prüfen soll, **direkt in die Direktive inlinen** — nie auf ungepushte `release/<v>/`-Dateien verweisen. In Lauf #3 verwies die Direktive auf `phase2-update-entwuerfe.md` → ChatGPT bekam 404, prüfte nur CCs Roh-Draft. Kein Schaden (Cowork hatte alles schon), aber es widerspricht dem Workflow (Reviewer sieht nur den Branch). → SKILL.md Phase 3, Pflichtbestandteil + ChatGPT-Vorlage angepasst.
2. **Auffang-Frage** in die Reviewer-Direktive aufgenommen (fängt Out-of-Frame-Funde, ohne Geschmacksurteile zu öffnen).
3. **Eindeutige Report-Dateinamen** vorschlagen (`chatgpt-report-v<version>.md`) — der Report landete als `chatgpt-report(1).md` in 0.3.0 (Browser-Kollision).
4. **Reviewer-Rotation**: diesmal ChatGPT. „Rotation" als Policy im Skill noch zu schärfen (jedes Mal wechseln vs. bewusst wählen) — offen.

## Ins Backlog / offen
- metrics-Fluss SSH-Lesezugriff einrichten (infra-reorg, minimal-User).
- VPS-Apply + Mac-launchd-Pull = Afschins Ops-Schritte.
- 08c: Karte als 2. Modul-Konsument (im Code vermerkt).
- Skill auf v2.1 neu paketieren (die zwei harten Regeln oben).

## G2-Deploy — Ergebnis (live verifiziert durch Cowork/Browser)
- **folio** main `8a278f7` + Tag v0.4.0, CI grün. Merge --no-ff feat/leuchtfeuer (21b3e1b+a13e377) + privacy-drafts-Fix im Release-Commit. Karte live, degradiert („Noch keine Metriken") bis erster Pull.
- **Privacy-Kaskade, 4 Sites live geprüft (ausgeloggt, DOM beide Sprachen):**
  - aion-lumen.ch/impressum: DE+EN Reichweitenmessung + 7 Tage ✓, alter Widerspruch weg ✓
  - mirhamed.ch/impressum: DE Reichweitenmessung + 7 Tage ✓, „keine Analyse-Werkzeuge" weg ✓
  - noblecause.ai/impressum: DE+EN Reichweitenmessung + 7 Tage ✓, „nur Betriebssicherheit" weg ✓
  - **frag-shifu.ch/datenschutz: „Keine Tracking-Cookies" ✓ (NICHT „keine Cookies"), Session-Cookie weiter korrekt erklärt, kein „keine Cookies" im Reichweiten-Block ✓**
- **Triage-Bestätigung:** Die G2-Freigabe-directive wurde von folios Triage als „not-a-task (95%)" erkannt (operative Direktive, kein Kampagnen-Objective) → bleibt korrekt im Review, legt kein Objective an. Sauberes Verhalten der Trust-Policy/Triage.

## CC-Abweichungen (beide korrekt gehandhabt) + Nachtrag
1. **NobleCause.ai pusht auf `master`, nicht `main`** — CC korrigiert. → für künftige Deploy-Prompts vermerkt (auch im infra-Kontext-Doc nachziehen).
2. **NobleCause + frag-shifu:** Repo-Default-Git-Config war noch Gmail; CC committete mit **per-commit noreply-Override** (kein permanenter Config-Change). Re-Leak-Check: alle 5 Repos Author==Committer==noreply, kein Gmail. **Latenter Punkt:** die lokale Git-Config dieser zwei Repos auf noreply setzen (wie die anderen), damit künftige Commits nicht auf den Override angewiesen sind. GitHub-Email-Privacy ist als Sicherheitsnetz aktiv → nicht dringend.
3. Erster Push-Versuch lief in den Auto-Mode-Classifier (Datei-Freigabe ≠ direkte User-Freigabe); nach explizitem „freigegeben" liefen alle Schritte durch.

## Live-Setzung Ops (nach G2, Cowork begleitet)
VPS-Seite durch CC (mit Afschins sudo, überwacht): Caddy-Logging mit IP-Maskierung nachgewiesen, Collectors, Cron, Read-only-Pull-User `leuchtfeuer-pull` (forced-command `rrsync -ro`, setgid-Dirs, kein sudo, sshd unangetastet). Mac-Seite: dedizierter Pull-Key + launchd. Karte ist **live** (zeigt Daten statt Degradation) — Besuchszahlen anfangs 0, weil erst vollständige Tage aggregiert werden (s.u.).

## Zwei zusätzliche Prozess-Lehren aus der Live-Setzung
1. **Cowork-Ops-Prompt hatte einen nologin/rsync-Widerspruch — CC hat ihn gefangen.** Mein VPS-Prompt Schritt 6 nutzte `useradd -s /usr/sbin/nologin -M`: nologin blockiert scp/rsync, `-M` (kein Home) lässt `authorized_keys` nirgends liegen. Korrektur: normale Shell + gesperrtes Passwort + Home, Sicherheit über forced-command in authorized_keys (`rrsync -ro`, `restrict`) — enger als nologin+sftp. **Lehre:** Bei Ops-Prompts mit System-User + SSH die Transport-Kompatibilität (Shell/Home/rsync) prüfen. Gute Bestätigung: die Mensch+CC-Überwachung fängt solche Fehler ab.
2. **Korrekturen während der Live-Setzung müssen zurück ins Repo (kein latenter Drift).** Die on-the-fly-Fixes an der Pull-plist (rrsync-Pfad `:/` statt absolut; fehlender `-e ssh -i key`-Parameter) lebten zuerst nur im Einmal-Befehl; das Repo-Template trug weiter den Bug. → plist + README im Repo nachgezogen (Hygiene-Fix-Commit). **Dieselbe Disziplin wie bei eval-Kaskade + privacy-drafts:** was während des Laufs korrigiert wird, wird im versionierten Artefakt korrigiert, nicht nur im Moment.

## Pilot-Kunde
Kein Pilot-Kunde live → kein Kundeninfo-Versand.
