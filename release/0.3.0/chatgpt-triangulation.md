# ChatGPT-Report — Triangulation · v0.3.0 (Reviewer-Test)

**Datum:** 2026-07-09 · **Durchgeführt von:** cowork-release-pilot

## Reviewer-Test: Ergebnis vorweg
**ChatGPT hat den Kimi-Schwachpunkt behoben.** Wo es Seiten nicht laden konnte (`/impressum`-Direktaufrufe, per Web-Tool blockiert), schrieb es diszipliniert „konnte nicht prüfen" und leitete **kein Fehlen** ab. Die Impressum-Seiten, die es laden konnte (aion-lumen.ch, frag-shifu.ch, noblecause.ai), meldete es korrekt als vorhanden. **Null Halluzinationen, zwei echte Befunde.** Kimi im Vergleich: drei halluzinierte Impressum-Blocker, die echten Konsistenzbefunde verpasst.

## Befunde — verifiziert

| ChatGPT | Verifikation gegen Repo | Klasse |
|---|---|---|
| **W1** README + aion-lumen.ch/folio zeigen „v0.1.0 public preview", während Repos auf 0.2.0 getaggt sind | **ECHT.** `folio/README.md:23` „Status: v0.1.0 public preview"; `aion-lumen.com/folio/index.html` Z.681/697/865/938 mehrfach „v0.1.0 / Public preview". Repos sind v0.2.0. Außenflächen hinken 2 Releases hinterher. | **Wichtig** — echter Konsistenzfehler |
| **W2** Site sagt „v1-strict", results-Datei sagt `variant: "v1"` | **ECHT.** `results-2026-07-09.json` → `variant: "v1"` (nicht v1-strict). `manifest.yaml` kennt beide (`v1`, `v1-strict`). Öffentlicher Claim nennt andere Variante als der Beleg. | **Wichtig** — Claim ↔ Beleg-Diskrepanz |
| **W3/Statushinweis** Release 0.3.0 noch nicht geschnürt | **Korrekt als Statushinweis gekennzeichnet** (nicht als Fehler) — genau wie in der Direktive angewiesen. Reihenfolge-Artefakt (G2-Schritt). | kein Befund |
| **Kür** mirhamed.ch Footer-Link Impressum im Textauszug nicht sichtbar; Direktaufruf blockiert | Afschin hat mirhamed.ch/impressum **live als sauber bestätigt**. Footer-Link existiert im Repo (`Footer.svelte`). ChatGPT leitete korrekt KEIN Fehlen ab. | kein Befund (Footer ggf. im Web-Tool-Textauszug nicht erfasst) |
| **Kür** Spec-Mirror `.md` nicht ladbar (400) | „konnte nicht prüfen" — korrekt. Repo-Spec v1 frozen bestätigt. | kein Befund |

## Bestätigungen (ChatGPT, ohne Befund) — decken sich mit eigener Prüfung
- **Impressum/Datenschutz live:** frag-shifu, aion-lumen, noblecause alle erreichbar + vollständig. **Der Kimi-Fehlalarm ist damit unabhängig widerlegt.**
- **Zahlen-Konsistenz:** 93 %/14 Fixtures deckt sich mit `evals/triage/`. Keine Vermischung mit eval-full.
- **Interchange v1 frozen**, unangetastet.
- **Sicherheit:** keine Secrets/PII in geladenen Seiten/Dateien (Historie/Logs nicht tiefengeprüft — ehrlich als offen gekennzeichnet).

## Netto für 0.3.0

**Null Blocker.** Zwei echte Wichtig-Punkte, beide Außenflächen-Konsistenz:
1. **Versions-Angaben auf v0.2.0 nachziehen** (README + aion-lumen.ch/folio: „v0.1.0" → aktueller Stand). Betrifft mehrere Fundstellen.
2. **v1-strict vs. v1 klären:** entweder Site-Claim auf „v1" korrigieren, oder — falls der belastbare 3-Modell-Lauf tatsächlich `v1-strict` als beste Variante hat — die results-Datei mit diesem Lauf aktualisieren. **Hängt am ausstehenden 3-Modell-Lauf** (Zahlen-Regel).

Beide sind **nicht release-blockierend**, aber sauber vor/mit dem Version-Bump zu erledigen (passt gut, da 0.3.0 ohnehin die Versionsnummer anfasst).

## Prozess-Entscheidung
**ChatGPT als Reviewer bewährt sich.** Empfehlung: Skill dauerhaft von Kimi auf ChatGPT umstellen (mit der Anti-Halluzinations-Regel + Konsistenz-only-Scope). Als Fieldnote-Deliverable festhalten.
