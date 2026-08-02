# Check-Direktive Kimi — Gesamt-Review Release v0.3.0 (Lauf #2)

**Erzeugt:** 2026-07-10 · **Reviewer:** Kimi K2 (Web-Zugriff)
**Ergebnis:** EIN Markdown-Report — Nur Befunde, keine Umsetzung

---

## Exekutiv-Summary

**Release v0.3.0 existiert nicht.** Weder Branch noch Tag noch CHANGELOG-Eintrag sind vorhanden. Der letzte released Stand ist **v0.2.0** (2026-07-09) in beiden Repos (folio + multi-agent-lab). Alle im Fokus genannten Features (Vault-Scoping, Council-Trennung, eval-full) befinden sich im `main`-Branch in aktiver Entwicklung, sind aber nicht als Release geschnürt.

Die wichtigste Empfehlung: Release-Branch/Tag `release/0.3.0` erstellen, CHANGELOG-Eintrag schreiben, dann diesen Review erneut durchführen.

| Kategorie | Anzahl |
|---|---|
| **Blocker** | 2 |
| **Wichtig** | 5 |
| **Kür** | 2 |

---

## BLOCKER

### B1. Release v0.3.0 existiert nicht — Review-Grundlage fehlt

**Kein Branch** `release/0.3.0` im Repository aion-lumen/folio. Branches: `main` (default), `feat/readme-campaign-shot-icon-fix`, `fix/folio-streaming`.

**Kein Tag** `v0.3.0`. Tags in folio: 2 (vermutlich `v0.1.0`, `v0.2.0`).

**CHANGELOG.md** endet bei `[0.2.0] - 2026-07-09` — trust-policy + lead-adapter. Kein Eintrag für v0.3.0.

**multi-agent-lab** ebenfalls nur v0.2.0 (Tag, gestern). Kein v0.3.0.

Die gesamte Review-Direktive fordert Prüfung von Vault-Scoping, Council-Trennung und eval-full als "Fokus dieses Release" — diese Features sind zwar teilweise im `main`-Branch sichtbar (Council-Commits, evals/triage/), aber nicht als Release konsolidiert.

→ **Vorschlag:** Release-Branch `release/0.3.0` erstellen, CHANGELOG-Eintrag mit den drei Fokus-Themen schreiben, Tag setzen, dann Review wiederholen.

**Beleg:** `github.com/aion-lumen/folio/branches` (kein release/0.3.0), `CHANGELOG.md` Zeile 12 (nur [0.2.0])

---

### B2. aion-lumen.ch: Kein Impressum, keine Datenschutzerklärung

Die aion-lumen.ch Website — primäre Anlaufstelle für Pilot-Kunden (Einzelpraxen) — hat **weder ein Impressum noch eine Datenschutzerklärung**.

Footer-Inhalt: `© MMXXVI · One person · Quiet maker · Hosted on its own VPS — not a SaaS portfolio.`

Kein Impressum-Link. Kein Datenschutz-Link. Die Seite enthält keine rechtlich erforderlichen Angaben für eine Schweizer Website, die Dienstleistungen anbietet (Folio-App, Multi-Agent-Lab-Dokumentation).

→ **Vorschlag:** Impressum-Seite unter `/impressum` erstellen und im Footer verlinken (Konsistenz zu noblecause.ai/mirhamed.ch).

**Beleg:** `https://aion-lumen.ch` — Footer nach Scroll durch gesamte Seite (Screenshot verfügbar)

---

## WICHTIG

### W1. frag-shifu.ch: Datenschutz ✅, aber kein separates Impressum

**Regression-Check (aus Lauf #1):** Der frühere Review meldete "Kein Impressum, keine Datenschutzerklärung" als Rechts-Blocker.

**Status heute:**
- `/datenschutz` ✅ **vollständig erreichbar** — 9-Punkte-Datenschutzerklärung mit Verantwortlicher Stelle (Afschin Mirhamed, Zürcherstrasse 160, 4052 Basel), KI-Verarbeitung (Claude API), Datenspeicherung (Infomaniak Schweiz), Backups, Löschung, Cookies, Minderjährige.
- `/impressum` ❌ **leitet zur Startseite um** — Kein separates Impressum vorhanden. Die Datenschutzerklärung enthält zwar die Verantwortliche Stelle (Adresse + Kontakt), aber das ist rechtlich nicht gleichwertig mit einem Impressum nach Schweizer Recht.

→ **Vorschlag:** Separates Impressum unter `/impressum` erstellen (mindestens: Name, Adresse, Kontakt) oder bestehende Datenschutz-Seite um Impressum-Abschnitt erweitern und Route beibehalten.

**Beleg:** `https://frag-shifu.ch/datenschutz` ✅, `https://frag-shifu.ch/impressum` → Redirect zur Startseite

---

### W2. multi-agent-lab/evals/full ist leer — Commit versprach Inhalt

Der Ordner `evals/full/` im multi-agent-lab Repo enthält **nur eine `.gitkeep`-Datei**.

Der letzte Commit dafür (8h ago, `64ce2b6`) trägt die Message: `feat(eval): eval-full — automated 3-model E2E eval + report file`.

Es gibt aber keine Fixtures, keine Report-Datei, keine `run.py` — nichts außer `.gitkeep`.

Dies widerspricht der Anforderung, dass die 40-Mail-E2E-Zahl (`eval-full`) als **interne Kennzahl** separat von der Triage-Accuracy (14 Fixtures) geführt wird. Der leere Ordern suggeriert, dass eval-full zwar als Konzept existiert, aber noch keine ausführbare Evaluation enthält.

→ **Vorschlag:** eval-full Fixtures (40 Mails), Run-Skript und Report-Datei committen, oder Commit-Message korrigieren wenn der Inhalt noch nicht bereit ist.

**Beleg:** `github.com/aion-lumen/multi-agent-lab/tree/main/evals/full` — nur `.gitkeep`

---

### W3. Council-Trennung unvollständig dokumentiert

Im Code ist Council sichtbar:
- Commit `fix(council): gate "→ Übernommen" on Council registration` (49 Minuten ago)
- Ordner `docs/` enthält Council-Dokumentation

Auf der **Site** (`aion-lumen.ch`) ist Council **nicht erwähnt** — weder als Feature noch als private Erweiterung. Die Council-Trennung ("Council als private Erweiterung des Betreibers") ist für externe Betrachter nicht nachvollziehbar.

Es fehlt eine öffentliche Erklärung:
- Was ist Council?
- Warum ist es privat?
- Was passiert im Demo-Modus (404?)?

→ **Vorschlag:** README-Abschnitt "Council (private Erweiterung)" hinzufügen, der die Trennung erklärt; oder auf der Folio-Story-Seite einen Hinweis einfügen.

**Beleg:** `github.com/aion-lumen/folio/commits/main` (Council-Commit), `https://aion-lumen.ch` (keine Council-Erwähnung)

---

### W4. mirhamed.ch Impressum nicht verifizierbar

Der Footer von mirhamed.ch enthält den Link `[8]<a https://mirhamed.ch/impressum >Impressum/>`. Der Link existiert also.

Beim Versuch, `https://mirhamed.ch/impressum` direkt aufzurufen, trat jedoch ein **Timeout** auf. Die Seite ist unter der direkten URL nicht erreichbar.

Mögliche Ursachen:
- Route existiert im Repo, ist aber nicht deployt
- Server-Timeout
- Pfad nicht korrekt konfiguriert

→ **Vorschlag:** Deployment der Impressum-Route verifizieren; ggf. statische HTML-Seite als Fallback.

**Beleg:** `https://mirhamed.ch` Footer (Link vorhanden), `https://mirhamed.ch/impressum` (Timeout)

---

### W5. Vault-Scoping / Demo-Isolation: Screenshots verwenden fiktive Daten ✅, aber Consistency-Check offen

**Positiv:**
- README: Screenshots sind "Captured against the bundled demo state (fictional Alex + Maya household in Algarve, **no real data**)" ✅
- Demo-Vault: `templates/demo-vault/` mit Alex-Persona ✅
- Demo-DBs: Isolierte `*-demo.db` Dateien, Port 5174 ✅
- Interchange v1: Unangetastet, frozen ✅ (`aion-lumen.ch/folio/import-spec.md` bestätigt)

**Offen:** Ob der Demo-Modus einen echten IMAP-Account **hart verhindert** (Capability-Entzug), konnte nicht vollständig verifiziert werden. Die `.env.example` zeigt IMAP-Variablen nicht — das ist ein gutes Zeichen, aber ein expliziter Demo-Mode-Guard wäre sicherer.

→ **Vorschlag:** Expliziter Capability-Check im Code verifizieren (z.B. `if (isDemo) throw` bei IMAP-Connect), oder README mit "Demo-Modus hat keinen IMAP-Zugang" dokumentieren.

**Beleg:** `github.com/aion-lumen/folio/blob/main/README.md` (Screenshots-Abschnitt), `templates/demo-vault/`

---

## KÜR

### K1. Eval-Zahlen-Konsistenz: README vs. Site vs. Repo

**Triage-Accuracy (14 Fixtures):**
- mirhamed.ch zeigt: "93 % Accuracy über 14 Fixtures" — korrekt, belegt durch `evals/triage/`
- Folio README: `npm run eval:triage` verweist auf fixtures
- Repo: `evals/triage/results-2026-07-09.json` + `inject-eval-numbers.ts` + `manifest.yaml` — vollständig ✅

**eval-full (40-Mail E2E):**
- Ordner existiert (multi-agent-lab/evals/full/) aber ist leer (nur .gitkeep)
- Auf keiner Site wird eval-full öffentlich beworben ✅ (korrekt, da interne Kennzahl)

Keine Vermischung der Zahlen feststellbar. Die Trennung ist korrekt umgesetzt.

**Beleg:** `github.com/aion-lumen/folio/tree/main/evals/triage`, `github.com/aion-lumen/multi-agent-lab/tree/main/evals/full`

---

### K2. aion-lumen.ch Footer: "Hosted on its own VPS" vs. Impressum-Pflicht

Der Footer-Satz "Hosted on its own VPS — not a SaaS portfolio" ist stilistisch passend zur "one person"-Ästhetik, aber rechtlich unzureichend. Ein minimalistisches Impressum würde dies nicht stilistisch brechen — siehe noblecause.ai, wo Impressum + Datenschutz elegant in der Footer-Zeile integriert sind.

**Beleg:** `https://aion-lumen.ch` Footer

---

## Regression-Checks

### frag-shifu.ch Impressum/Datenschutz (Fix-Verifikation aus Lauf #1)

| Prüfpunkt | Status | Bemerkung |
|---|---|---|
| Datenschutzerklärung erreichbar | ✅ **behoben** | `/datenschutz` lädt, 9 Punkte, vollständig |
| Impressum erreichbar | ⚠️ **teilweise** | `/impressum` leitet um; Datenschutz enthält Verantwortliche Stelle als Fallback |
| Footer-Link Datenschutz | ❌ **nicht sichtbar** | Kein Footer auf der Single-Page-App; Links müssen über direkte URLs aufgerufen werden |

**Fazit:** Der Datenschutz-Blocker aus Lauf #1 ist **behoben**. Das separate Impressum fehlt noch, wird aber durch die ausführliche Datenschutzerklärung (mit vollständiger Verantwortlicher-Stelle-Angabe) teilweise kompensiert. Für Schweizer Recht sollte ein dediziertes Impressum nachgereicht werden.

### Konsistenzcheck alle Sites

| Site | Impressum | Datenschutz | Konsistenz |
|---|---|---|---|
| mirhamed.ch | Link vorhanden, Seite timeout ⚠️ | Nicht separat geprüft | Unvollständig |
| aion-lumen.ch | ❌ Fehlt | ❌ Fehlt | **Blocker** |
| frag-shifu.ch | Umleitung ⚠️ | ✅ Vollständig | Teilweise |
| noblecause.ai | ✅ Vollständig | ✅ Vollständig | **Referenz** |

noblecause.ai ist die Referenz-Implementierung (Impressum + Datenschutz in einer Seite, elegant verlinkt).

---

## Standard-Sicherheitsteil

### Secrets/Keys in Code

| Prüfobjekt | Befund |
|---|---|
| `.env.example` (folio) | Nur Platzhalter: `VAULT_PATH=`, `HERMES_API_URL=`, `HERMES_API_KEY=your-key-here` ✅ |
| Git-Historie (39 Commits) | Keine Keys in Commit-Messages sichtbar ✅ |
| Actions-Workflows | Nicht im Detail prüfbar ohne Sign-in; `.github/workflows/` Ordner existiert |
| multi-agent-lab | `config/user_context.example.yaml` als Template ✅ |

Kein Blocker feststellbar. Empfohlene Nachprüfung: `git log --all --source --remotes --grep='password\|key\|secret'` vor Release.

### PII/echte Daten

| Prüfobjekt | Befund |
|---|---|
| Screenshots (README) | "fictional Alex + Maya household in Algarve, **no real data**" ✅ |
| Demo-Vault | Alex-Persona, `templates/demo-vault/` ✅ |
| Commit `chore(pii): redact real third-party address` | Aktive PII-Entfernung bestätigt ✅ |
| `schemas/` (multi-agent-lab) | Redaktion durchgeführt ✅ |

Keine echten Konten/Mails/Adressen in öffentlich sichtbaren Artefakten.

### Interchange v1

| Prüfobjekt | Befund |
|---|---|
| Spec-Mirror | `aion-lumen.ch/folio/import-spec.md` erreichbar ✅ |
| Repo-Mirror | `FOLIO-IMPORT.md` im Root ✅ |
| v1-Status | "**v1 frozen** — Breaking changes require `folio_import: v2`" ✅ |

Interchange v1 ist unangetastet. Bestätigt.

---

## Anhang: Release-Stand-Übersicht

| Repo | Branch | Letzter Release | Tag | Stand |
|---|---|---|---|---|
| aion-lumen/folio | main | v0.2.0 (2026-07-09) | 2 Tags | 39 Commits |
| aion-lumen/multi-agent-lab | main | v0.2.0 (gestern) | 1 Tag | 14 Commits |
| noblecause-ai/NobleCause.ai | master | Kein Release | 0 Tags | 29 Commits |

**Empfohlener nächster Schritt:** Release v0.3.0 erstellen (Branch + Tag + CHANGELOG), dann Review wiederholen.

---

*Report erstellt: 2026-07-10*
*Reviewer: Kimi K2*
*Methode: Web-Zugriff auf Sites + Repos, keine lokale Code-Ausführung*
