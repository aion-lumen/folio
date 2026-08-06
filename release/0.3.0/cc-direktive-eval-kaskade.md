# CC-Direktive — Eval-Zahlen-Kaskade scharfschalten + deployen (Nachtrag v0.3.0)

**An:** CC-Session · **Von:** cowork-release-pilot · **Zeitbox: kurz (~15 Min).**
**Kontext:** Cowork hat die zwei Außenflächen von handgepflegten Zahlen auf `{{EVAL_...}}`-Platzhalter umgestellt (v1-strict-Label entfernt, Variante C/D). Beleg-Datei ist der hermetische Voll-Lauf. Jetzt: Injektor ausführen, verifizieren, deployen.

## Ausgangslage (bereits erledigt durch Cowork — nicht erneut tun)
- `aion-lumen.com/multi-agent/index.html:173` (DE+EN): Literal + `v1-strict` → Platzhalter. Variante C: „Committet nie fälschlich automatisch — {{EVAL_FALSE_AUTOCOMMITS}} Fehlalarme über {{EVAL_FIXTURES}} Fixtures, {{EVAL_ACCURACY}} Accuracy." (EN analog: „Never auto-commits by mistake — …").
- `carta/src/lib/data/cv.json` (DE+EN): dieselbe Konstruktion → Platzhalter. Variante D: „null falsche Auto-Commits über {{EVAL_FIXTURES}} Fixtures ({{EVAL_ACCURACY}} Accuracy)." (EN: „zero false auto-commits across …").
- Verifiziert: keine „93"/„v1-strict"-Reste; nur noch Platzhalter (aion-lumen: ACCURACY/FIXTURES/FALSE_AUTOCOMMITS je 2×; carta: ACCURACY/FIXTURES je 2×).
- Beleg-Datei: `folio/evals/triage/results-2026-07-09.json` = hermetischer Voll-Lauf (3 Modelle, 6 combos, best=v1, accuracy 0.9286, FP 0, 14 Fixtures).

## Aufgabe 1 — Injektor ausführen (macOS, da tsx/esbuild nativ)
```
cd folio
npx tsx evals/triage/inject-eval-numbers.ts --file ../aion-lumen.com/multi-agent/index.html --write
npx tsx evals/triage/inject-eval-numbers.ts --file ../carta/src/lib/data/cv.json --write
```
Erwartete Ersetzung (aus results-2026-07-09.json): `{{EVAL_ACCURACY}}`→„93 %", `{{EVAL_FIXTURES}}`→„14", `{{EVAL_FALSE_AUTOCOMMITS}}`→„0", `{{EVAL_SCORE}}`→„0.929". Der Injektor meldet je Datei die Trefferzahl — prüfen, dass alle Platzhalter ersetzt wurden (keine `{{…}}`-Reste).

## Aufgabe 2 — Gegenprüfen (kein Rest, richtige Zahl)
```
grep -rnE "\{\{EVAL_|v1-strict|92 ?%" ../aion-lumen.com/multi-agent/index.html ../carta/src/lib/data/cv.json
```
Muss leer sein. Zusätzlich sichtprüfen: beide Sätze DE+EN tragen „93 %" + „14 Fixtures" + „0 Fehlalarme/null false auto-commits", kein Varianten-Label.

## Aufgabe 3 — Deploy (des Stewards Knopfdruck, Live-Site-Push)
- `carta` → mirhamed.ch pushen; CV-PDF nur regenerieren, falls die PDF-Pipeline die Zahl trägt (aktuell nicht — separater Zyklus, siehe direktive-carta-cv-pdf-pipeline). Sonst nur Web-Karte.
- `aion-lumen.com` → aion-lumen.ch pushen.
- **Live-Check ausgeloggt:** aion-lumen.ch/multi-agent Beleg 07 + mirhamed.ch CV-Karte zeigen „93 % / 14 Fixtures / 0 Fehlalarme", kein `v1-strict`. Cowork kann den Live-Check per Browser übernehmen.

## Ehrlichkeits-Leitplanke (nicht verhandelbar)
- „über {{EVAL_FIXTURES}} Fixtures" bleibt in JEDER Sprache stehen — sonst wird aus einer belegten Messung eine Absolutbehauptung.
- „93 %" ist gerundet aus 92,86 % (13/14); die exakte, harte Aussage ist **FP = 0 %**. Nicht als „100 % sicher" o. ä. überhöhen.

## Definition of Done
1. Beide Site-Dateien tragen die injizierten Zahlen (93 %/14/0), keine Platzhalter-Reste, kein `v1-strict`.
2. Live: aion-lumen.ch + mirhamed.ch zeigen die neue Formulierung, Zahl = Beleg-Datei.
3. Ab jetzt: Zahl kommt strukturell aus `results-*.json` — keine handgepflegte Zahl mehr auf Außenflächen.

## Danach
Leuchtfeuer (Release-Lauf #3) beginnt — erster produktiver Lauf mit Release-Pilot v2 (ChatGPT-Reviewer, Matrix-Prozess-Tiefe).
