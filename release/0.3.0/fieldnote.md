# Field Note — Release v0.3.0 (Lauf #2: Vault-Scoping + Council-Trennung + Eval-Infra)

**Datum:** 2026-07-09 · **Autor:** cowork-release-pilot · **Kern-Deliverable:** Vergleich Dauer/Reibung gegen Lauf #1.

## Was raus geht (nach G2)
- folio v0.3.0, multi-agent-lab v0.3.0 (Tag + CHANGELOG + Version-Bump; kein Merge — 08b schon auf main).
- Vault-Scoping (Demo-Isolation, konto-a/b, Demo-IMAP-Guard), Council-Trennung (`/council`→404), Eval-Infra (`make eval-full`, Injektor).
- Außenflächen-Nachzug: README + aion-lumen.ch/folio v0.1.0 → v0.3.0.
- Doku-Objectives im Inbox (Council-Trennung, Demo-IMAP-Guard).

## Dauer/Reibung — Vergleich Lauf #1 vs Lauf #2

| Aspekt | Lauf #1 (0.2.0) | Lauf #2 (0.3.0) |
|---|---|---|
| Gesamtdauer | > 1 Tag (Erstlauf: Skill bauen, alles zum 1. Mal) | deutlich kürzer — Skill + Vorlagen standen, Muster bekannt |
| Merge | 2 Branches zu mergen (Split-Frage) | **kein Merge** (08b auf main) — entfällt |
| Eval-Strang | manuell: Afschin fährt 3-Modell-Eval, Cowork editiert Zahl von Hand | **Infra gebaut:** Injektor + results-Datei statt Handedit (Slim-Verify da; 3-Modell-Lauf bleibt manuell, aber Mechanik automatisiert) |
| Kimi-Schleife | gegen main → 4 Phantom-Blocker, teure Triangulation | Reviewer-Wechsel Kimi→ChatGPT: **0 Fehlalarme**, 2 echte Befunde |
| Screenshots | PII-Fund spät, viel manuelles Maskieren | Demo-Vault jetzt gescoped (08b) → strukturell sauberer |

**Netto:** Lauf #2 war spürbar performanter bei gleicher/höherer Qualität — genau das Ziel (Verfahren verschlankt sich mit jedem Lauf). Der manuelle Eval-Strang (stdout-Ablesen + Handedit) ist durch Injektor + Report-Datei ersetzt.

## Reibungspunkte (Deliverable erster Klasse)

1. **Kimi halluziniert Negativbefunde — Reviewer gewechselt.** Kimi meldete 3 Impressum-„Blocker" (frag-shifu, aion-lumen, mirhamed), ALLE von Afschin live widerlegt. Muster: kann Kimi einen Link nicht öffnen, behauptet er „fehlt/Timeout" mit voller Bestimmtheit statt „konnte nicht prüfen". **Konsequenz:** Reviewer dauerhaft auf **ChatGPT** umgestellt (Pro, Web-Browsing), mit expliziter Anti-Halluzinations-Regel (HTTP-Status protokollieren; „konnte nicht prüfen" statt „fehlt") + Konsistenz-only-Scope (keine Ästhetik-/Zielgruppen-Bewertung). ChatGPT im selben Lauf: 0 Fehlalarme, fand 2 echte Konsistenzfehler, die Kimi verpasste.

2. **Scope-Präzisierung Review:** Auf Afschins Wunsch nur **Konsistenz-Check**, keine Design-/Geschmacksbewertung. In die ChatGPT-Direktive fest eingebaut.

3. **Kimi-prüft-main (aus Lauf #1 bekannt):** release/0.3.0 war zum Prüfzeitpunkt nicht geschnürt → B1-Reihenfolge-Artefakt. ChatGPT kennzeichnete es korrekt als „Statushinweis, kein Fehler" (Direktive wies es an). Lehre bleibt: Reviewer erst nach release-Branch/Tag.

4. **Direktiv-Lücke „live deployt?":** Afschin merkte an — die Direktive sollte explizit fragen „ist es live erreichbar?" nicht nur „existiert im Repo". In ChatGPT-Direktive umgesetzt (HTTP-Status-Pflicht). Für Skill übernehmen.

5. **Git in Cowork-Session weiterhin gesperrt** (`.git/index.lock`, Berechtigung) — alle Git-Ops + Deploys über CC/Afschin (G2). Konsistent mit Leitplanke.

## Echte Befunde dieses Laufs (ChatGPT)
- **Versions-Angabe veraltet:** README + aion-lumen.ch/folio zeigten „v0.1.0 public preview" trotz Repo-Tag 0.2.0. → Nachzug auf 0.3.0 (Afschins Entscheid: nachziehen). Teil des Release.
- **v1-strict vs. v1 — GESCHLOSSEN, mit Wendung:** ChatGPT meldete Site-Claim „v1-strict/93 %" ≠ results-Datei „v1". Der hermetische 3-Modell-Voll-Lauf (3 byte-identische Läufe, korrigierte Golden Labels) zeigt: **`v1` ist die bessere Variante, nicht `v1-strict` — die Website lag falsch.** Wurzel: nicht-hermetische Eval (`getVaultPath()` las active-vault vor `VAULT_PATH`; `v1-strict` ist über seine „chapter fit"-Regel kontextempfindlich und kippte) + ein falsches Golden Label (`meeting-notes`). Beide gefixt (`FOLIO_VAULT_OVERRIDE`, `DEFAULT_PROMPT_VARIANT=v1` + Regressionstest). **Belastbare Zahl: 92,86 % (13/14), FP 0 %, modellunabhängig 3× reproduziert.** Der Code lief ohnehin immer auf `v1` — `v1-strict` existierte nur als Website-Claim, war nie ein Produktionsproblem.

## A2 — Zahlen-Kaskade strukturell gefixt (2026-07-09)
Der Kern war nicht die falsche Ziffer, sondern **handgepflegte Zahlen** an zwei Außenflächen, die der Injektor nicht bediente → konnten jederzeit von der Beleg-Datei abdriften. Behoben:
- `aion-lumen.com/multi-agent/index.html:173` (DE+EN): Literal + falsches `v1-strict`-Label → Platzhalter. **Variante C:** „Committet nie fälschlich automatisch — {{EVAL_FALSE_AUTOCOMMITS}} Fehlalarme über {{EVAL_FIXTURES}} Fixtures, {{EVAL_ACCURACY}} Accuracy."
- `carta/src/lib/data/cv.json` (DE+EN): dieselbe Konstruktion → Platzhalter. **Variante D:** „null falsche Auto-Commits über {{EVAL_FIXTURES}} Fixtures ({{EVAL_ACCURACY}} Accuracy)."
- Varianten-Label (`v1`/`v1-strict`) überall gestrichen — internes Tuning, für Außenstehende bedeutungslos. „0 Fehlalarme" als Hauptaussage, Accuracy als Nebenaussage. „über {{EVAL_FIXTURES}} Fixtures" bleibt in beiden Sprachen (belegte Messung, keine Absolutbehauptung).
- Beleg-Datei: `evals/triage/results-2026-07-09.json` = hermetischer Voll-Lauf (3 Modelle, 6 combos, best=v1, 0.9286, FP 0, 14 Fixtures). Injektor setzt daraus 93 %/0.929/14/0.
- **Injektor läuft bei Afschin/CC** (tsx/esbuild ist macOS-nativ, nicht in der Linux-Sandbox lauffähig). Cowork hat die Ersetzung Python-seitig verifiziert (Vorschau korrekt, keine Reste). `npx tsx evals/triage/inject-eval-numbers.ts --file <site-datei> --write` je Datei.
- **Field-Note-Kernsatz:** Der Beleg-Link hat den Fehler gefunden. Genau das ist sein Zweck — Zahlen belegen statt behaupten. Und: „93 %" ist gerundet aus 92,86 %; die harte, exakte Aussage ist FP = 0 %.

## Ins Backlog (kein Scope-Zuwachs)
- ~~v1/v1-strict-Klärung~~ **GESCHLOSSEN (2026-07-09):** Kein Harness-Bug (JSON-`best` `run.ts:111` und stdout-Recommendation `run.ts:169` lesen dieselbe sortierte Variable — CC-verifiziert). Der Befund entstand nur, weil `results-2026-07-09.json` der Slim-Verify war (1 Modell, nur `v1` → „best=v1" tautologisch; `v1-strict` fehlte). **Website-Claim `v1-strict / 93 %` ist korrekt** — Voll-Lauf: v1-strict 93 %/0.929 vs. v1 86 %/0.857, Recommendation v1-strict. Kein Etikett-Fix; es braucht nur eine frische `results-<datum>.json` aus dem Voll-Lauf, damit Website-Zahl und Beleg aus demselben Durchgang stammen. → offener Rest: neue results-Datei einchecken (Injektor bleibt bereit, öffentliche Zahl unverändert 93 %/14).
- eval-full Output-Ordner: README-Stub statt nacktem `.gitkeep`.
- 08c: API-Guard `isCouncilRegistered()`, 4(c)-Pillen-Beleg, Council-Modul-Extraktion.
- Portfolio-Screenshots in den Gesamtlauf integrieren (Skill-Update).

## Prozessverbesserungen für den Skill (aus diesem Lauf)
1. **Reviewer = ChatGPT** (Anti-Halluzinations-Regel + Konsistenz-only-Scope) statt Kimi.
2. **Reviewer-Negativbefunde immer gegenprüfen** (Cowork/Afschin), bevor sie in die Empfehlung wandern.
3. Kimi-/Reviewer-Direktive: „live deployt?"-Teil + HTTP-Status-Protokoll.
4. Kimi/Reviewer erst nach `release/x.y.z`-Branch.
5. Inbox-Transfer als expliziter `cp`-Schritt in G2 (umgesetzt).
6. Portfolio-Screenshots als Matrix-Zeile (Phase 1) + G2-Schritt.

## G2-Deploy — Ergebnis (verifiziert)
- **folio** `c83a704` + Tag v0.3.0, CI grün (pkg 0.3.0, CHANGELOG [0.3.0], README „v0.3.0 public preview").
- **multi-agent-lab** `c794d80` + Tag v0.3.0, CI grün (pyproject 0.3.0).
- **aion-lumen.com** `fb93070` gepusht (Afschin, Classifier-Grenze). **Live-Check ausgeloggt (cowork via Browser):** `aion-lumen.ch/folio/` DOM → v0.1.0 = **0**, v0.3.0 = **7**, „Public preview"-Label intakt. ✅
- **Inbox-Drop:** council-imap-doku + g2-deploy-freigabe → `~/.folio/inbox/`; gegenstandslose Impressum-Datei korrekt ausgelassen.

**Reifegrad-Entscheid:** „Public preview" bleibt bewusst stehen (Reifegrad-Signal, unabhängig von der Versionsnummer; wird erst mit v1.0.0 gestrichen). Nur die Nummer gebumpt.

**CC-Abweichungen — beide ok:** (1) 7 statt 6 v0.1.0-Stellen (Z.711 trug EN+DE) — alle korrekt geändert. (2) 3 weitere v0.1.0 in `index-a.html`/`index-b-print.html` — **nicht live** (nicht in der rsync-Deploy-Liste; Live-Root `index.html` ist sauber). Bewusst nicht nachgezogen, kein echter Backlog-Punkt.

## E-Mail-in-History — GEKLÄRT (Fehlalarm), für Zukunft notiert
CC meldete Gmail in der Commit-History der Site-Repos als offenen Punkt. **Fehlalarm:** Afschin hatte „Keep my email addresses private" auf GitHub bereits aktiv. Die in der Alt-History sichtbare Gmail ist damit durch GitHubs Privacy-Layer ohnehin abgedeckt; kein History-Rewrite nötig, kein Handlungsbedarf.
**Für künftige Läufe notiert:** „E-Mail in Commit-History" NICHT reflexhaft als Befund melden — zuerst prüfen, ob GitHub-Email-Privacy des Nutzers aktiv ist (ist es). Repo-Configs sind ohnehin auf noreply. Dieser Punkt ist damit dauerhaft erledigt und sollte in Lauf #3+ nicht wieder auftauchen.

## A2/Eval-Kaskade — endgültig geschlossen (live verifiziert)
Deploy live (CC + Afschins Push): aion-lumen.ch/multi-agent Beleg 07 (EN+DE) und mirhamed.ch CV-Karte tragen „0 Fehlalarme · 14 Fixtures · 93 % Accuracy", kein v1-strict, keine {{EVAL_}}-Reste, kein 92 %. Zahl kommt strukturell aus `results-2026-07-09.json` (hermetischer Voll-Lauf). Der Auslöser des gesamten Eval-Strangs (Website-Zahl ≠ Beleg-Datei) ist damit behoben.

## Pilot-Kunde
Kein Pilot-Kunde live → kein Kundeninfo-Versand.
