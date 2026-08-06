# Release v0.2.0 — Live-Check-Liste & Verbesserungsvorschläge

**Datum:** 2026-07-09 · für des Stewards eigene Live-Verifikation + Planung nächste Runde

---

## Teil 1 — Was wurde geändert und wo (zum Selbst-Checken)

### A) Öffentliche Sites (ausgeloggt prüfen — das sehen Recruiter/Kunden)

| # | Wo | Was prüfen | Erwartung |
|---|---|---|---|
| 1 | **mirhamed.ch** → CV / Multi-Agent-Lab-Karte | Accuracy-Zahl DE **und** EN (Sprache umschalten) | „**93 % Accuracy über 14 Fixtures**, 0 falsche Auto-Commits" (vorher 92 %/12) |
| 2 | **mirhamed.ch** → dieselbe Karte | Beleg-Link | zeigt auf `github.com/aion-lumen/folio/tree/main/evals/triage` und ist erreichbar |
| 3 | **aion-lumen.ch/multi-agent** → Beleg 07 (Screenshot-Caption) | Zahl DE **und** EN | „v1-strict — **93 % accuracy**, 0 false auto-commits" |
| 4 | **aion-lumen.ch/folio/import-spec.md** | Typ-Enum + Lead-Abschnitt | enthält jetzt **`lead`** (additiv), v1 weiter als „frozen" gekennzeichnet |
| 5 | beide Sites | Zahl-Konsistenz | 93 % steht **überall gleich** — kein 92 % mehr auffindbar |
| 6 | mirhamed.ch CV | mobil (390 px) + Hell/Dunkel | Karte bricht nicht, Zahl lesbar |

### B) GitHub-Repos (öffentlich, ausgeloggt)

| # | Wo | Was prüfen | Erwartung |
|---|---|---|---|
| 7 | **github.com/aion-lumen/folio** | Tag/Release | Tag **v0.2.0** (`1cfb9b3`), CI grün |
| 8 | folio → `CHANGELOG.md` | oberster Eintrag | **[0.2.0] – 2026-07-09** mit Trust-Policy + Lead |
| 9 | folio → `README.md` | Screenshot-Abschnitt | **kein** Mail-Queue-Bild `01-…` mehr (war privat); README rendert ohne totes Bild |
| 10 | folio → `docs/screenshots/release/` | 01 weg, 08/10 maskiert | `01-mail-queue` nicht mehr im Repo; in 08-heute & 10 stehen **„konto-a/b"** statt yahoo/mirhamed |
| 11 | folio → `FOLIO-IMPORT.md` | Lead-Typ | `lead` + Felder (`rolle`, `quelle`, `deadline`, `dedup_key`, `duplicate_of`, sentinel `current`) additiv |
| 12 | **github.com/aion-lumen/multi-agent-lab** | Tag/Release | Tag **v0.2.0** (`976a5a7`), CI grün |
| 13 | multi-agent-lab → `PILOT.md` | vorhanden | Standalone-Install / Dogfooding-Leitfaden |

### C) Was bewusst NICHT geändert wurde (nicht suchen — ist Absicht)

- **CV-PDF** (`cv-de.pdf`/`cv-en.pdf`): unverändert. Die 93 %/14-Zahl lebt nur in der Web-Karte, nicht im PDF-Layout — PDF-Regen wurde verworfen (Begründung in Teil 2). Also: **PDF zeigt weiterhin die alte Darstellung** — das ist erwartet, kein Fehler.
- results-Artefakt, `trusted_sources.example.yaml`, folio-mail-Bug → Backlog.

### Schnell-Kommandos (falls du lieber im Terminal prüfst)
```
# Tags live?
git -C folio ls-remote --tags origin | grep v0.2.0
git -C aion-lumen/multi-agent ls-remote --tags origin | grep v0.2.0
# 93% überall, 92% nirgends (lokal):
grep -rn "93" carta/src/lib/data/cv.json aion-lumen.com/multi-agent/index.html
grep -rn "92 %" carta aion-lumen.com | grep -v node_modules   # sollte leer sein
```

---

## Teil 2 — Verbesserungsvorschläge für die nächste Runde

Jeder Punkt adressiert einen konkreten Reibungspunkt aus diesem Lauf (Field Note).

### V1 — Kimi gegen den gemergten Stand laufen lassen (größter Hebel)
**Reibung:** Kimi prüfte `main`, die Features lagen auf Branches → alle 4 „Blocker" waren Phantome; die Triangulation kostete Zeit.
**Vorschlag:**
- Check-Direktive-Template um eine **Pflichtzeile** ergänzen: „Prüfe exakt Branch/Tag `<x>`, nicht main." Cowork füllt den konkreten Branch automatisch ein.
- **Alternativ/besser:** Kimi-Schleife erst **nach** einem Merge in einen `release/x.y.z`-Branch (nicht main) starten — dann sieht Kimi den vollständigen Stand, ohne dass schon deployt ist.
- Ergebnis: keine Phantom-Blocker mehr, Triangulation entfällt fast ganz.

### V2 — folio-Inbox-Pfad explizit an Cowork übergeben
**Reibung:** `~/.folio/inbox/` existiert nur auf deiner Maschine, nicht in der Cowork-Session → Export A/B landeten im Staging statt im Inbox.
**Vorschlag:**
- Zu Lauf-Beginn `FOLIO_INBOX_PATH` als Parameter setzen (auf den echten, für Cowork erreichbaren Pfad), oder
- Staging-Ordner als **Normalfall** akzeptieren + einen 1-Zeilen-`cp`-Befehl ins G2-Skript aufnehmen (`cp release/<v>/folio-inbox-staging/*.md ~/.folio/inbox/`). Dann ist der Transfer ein bewusster, dokumentierter Schritt statt einer offenen Lücke.

### V3 — Screenshot-PII-Check fest in Phase 2 verankern
**Reibung:** Reale Konten (gmail/yahoo/mirhamed.ch) in Alt-Screenshots; Kimi sah sie nicht (main-Prüfung), Cowork fand sie erst spät.
**Vorschlag:**
- Phase-2-Checkliste um **„jeden Release-Screenshot visuell auf Konten/Mails/Adressen prüfen"** erweitern — unabhängig von Kimi.
- Besser noch: einen **Demo-Modus-Guard** in folio, der Account-Labels bei `?demo`/`*-demo.local` automatisch auf `konto-a/b` maskiert. Dann sind Screenshots strukturell PII-frei, kein manuelles Maskieren mehr.

### V4 — CV-PDF-Pipeline reparieren (eigene kleine Aufgabe)
**Reibung:** `scripts/generate-pdf.js` ist stale (einsprachig `cv.pdf`, Live nutzt `cv-de/en.pdf`); `/print` hat keinen Projekte-Abschnitt und kein Datum → DoD „PDF = 93 %/14 + Datumsstempel" war gar nicht erfüllbar.
**Vorschlag (Scope für eigenen Zyklus):**
1. `generate-pdf.js` auf **zweisprachige Ausgabe** umstellen (`?lang=de|en` → `cv-de.pdf`/`cv-en.pdf`).
2. `/print`-Layout um einen **Projekte-Abschnitt** + **Datumsstempel** erweitern, sodass die Eval-Zahl auch im PDF erscheint.
3. Danach ist die CV-PDF-DoD in künftigen Releases automatisch erfüllbar.

### V5 — Deploy-Grenze im Skill als Normalfall dokumentieren
**Reibung (positiv):** Git in der Cowork-Session gesperrt; Live-Deploys durch Classifier-Schranke → lief korrekt über dich/CC. Hat gegriffen, war aber ad hoc.
**Vorschlag:**
- Im Skill festschreiben: **Cowork erzeugt nur Dateien + den kopierbaren CC/Deploy-Prompt; alle `git`-Operationen und Live-Pushes laufen beim Menschen.** Das ist ohnehin gelebte Realität — es explizit zu machen spart die Überraschung mit `index.lock`.

### V6 — Eval-Ergebnis als eingechecktes Artefakt (Belegbarkeit)
**Reibung:** Kimi-Wichtig-Befund F4 — „93 %" ist reproduzierbar, aber kein Ergebnis-Artefakt im Repo.
**Vorschlag:** Voll-Eval schreibt künftig `evals/triage/results-<datum>.json` (Accuracy, Fixtures, FP/FN, Modell-Combo), das eingecheckt wird. Der Beleg-Link zeigt dann auf harte Zahlen, nicht nur auf den Harness. (Import-Datei liegt schon im Staging.)

### V7 — Sicherheits-Hygiene: SSH-Key aus dem Projektordner
**Nebenbefund:** privater SSH-Key im Klartext in `Projects/aionlumen_deploy`.
**Vorschlag:** Key nach `~/.ssh/` verschieben, `chmod 600`, per `~/.ssh/config` referenzieren; sicherstellen, dass er in **keinem** Repo-Verzeichnis liegt und gitignored ist.

---

### Priorisierung (Vorschlag)
- **Sofort/klein:** V7 (Sicherheit), V1 (nur Template-Zeile) — geringer Aufwand, hoher Nutzen.
- **Nächster Zyklus:** V4 (PDF-Pipeline), V6 (Eval-Artefakt), V3 (Demo-Guard).
- **Doku-Update am Skill:** V2, V5 — beim nächsten Skill-Feinschliff mitnehmen.
