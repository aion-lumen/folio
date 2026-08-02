# Check-Direktive Kimi — Gesamt-Review Release v0.2.0

**Erzeugt:** 2026-07-09 · **Durchgeführt von:** Kimi K2 (Moonshot AI) · **Ergebnis:** Markdown-Report
**Geprüfte Repos:** github.com/aion-lumen/folio (main) · github.com/aion-lumen/multi-agent-lab (main)
**Geprüfte Außenflächen:** aion-lumen.ch/folio/import-spec.md · aion-lumen.ch/multi-agent

---

## Blocker

**[Blocker] F1 — CHANGELOG.md endet bei 0.1.0, kein Eintrag für 0.2.0** — Der Release soll v0.2.0 sein (Trust-Policy + Lead-Adapter), aber CHANGELOG.md listet nur 0.1.0 (2026-04-26). Die Änderungen Source-Trust-Policy, Lead-Adapter, Eval-Harness sind nicht dokumentiert. Externe können nicht nachvollziehen, was neu ist. — CHANGELOG.md um 0.2.0-Eintrag ergänzen mit Trust-Policy, Lead-Adapter, Eval-Harness. — `folio/CHANGELOG.md`

**[Blocker] F1 — `lead`-Typ fehlt komplett aus FOLIO-IMPORT.md und öffentlicher Spec** — FOLIO-IMPORT.md (Repo) und aion-lumen.ch/folio/import-spec.md (Mirror) zeigen beide Typ-Enum: `directive | field-note | objective-update | note`. Der `lead`-Typ, den die Direktive als Teil dieses Release beschreibt, ist in keinem der beiden Dokumente vorhanden. Die Spec-Mirror-URL zeigt identischen Inhalt zum Repo. — `lead` als neuer Typ in FOLIO-IMPORT.md und Spec-Mirror ergänzen, oder Dokumentation an tatsächlichen Stand anpassen. — `folio/FOLIO-IMPORT.md` Zeile 94 · `https://aion-lumen.ch/folio/import-spec.md`

**[Blocker] F4 — Nur 12 Fixtures im Eval-Manifest, nicht 14; keine 3-Modell-Voll-Eval-Ergebnisse** — evals/triage/manifest.yaml listet genau 12 Fixtures (clear-task-mandat, clear-task-deadline, clear-task-finanz, ambiguous-chapter, vague-threshold, field-note-observation, status-update-only, retrospective-note, directive-no-new-goal, mixed-intent, clear-task-sprache, meeting-notes). Die Direktive spezifiziert 14 Fixtures als neuen Stand. Keine Ergebnisdatei (z.B. results.yaml, summary.json) mit einer durchgeführten 3-Modell-Voll-Eval ist im Repo vorhanden. Die Behauptung "92 % accuracy" auf aion-lumen.ch/multi-agent (Beleg-07) ist daher nicht durch öffentliche Eval-Daten belegt. — Manifest auf 14 Fixtures erweitern oder Behauptung auf 12 Fixtures korrigieren; Voll-Eval durchführen und Ergebnisse einchecken. — `folio/evals/triage/manifest.yaml`

**[Blocker] F5 — Screenshots 06–10 fehlen komplett, insb. "10-lead-hub-fristnah"** — multi-agent-lab/docs/screenshots enthält nur 3 Screenshots: 02-pipeline-idle, 03-pipeline-validator, 05-verlauf-detail. Die Screenshots 06, 07, 08, 09 und insbesondere 10-lead-hub-fristnah (die die Mail-Audit-Karte mit Account-Label zeigen soll) sind nicht im Repo. Die Direktive erwähnte Screenshot 10 explizit als Blocker-Kandidat wegen möglichen Account-Labels. — Alle Release-Screenshots (05–10) einchecken oder Liste aktualisieren. — `multi-agent-lab/docs/screenshots/`

---

## Wichtig

**[Wichtig] F2 — PILOT.md existiert nicht im multi-agent-lab** — Die Direktive verlangt eine PILOT.md mit plausiblem Quickstart und Kategorien-Config/Praxis-Preset. Im multi-agent-lab Repo gibt es keine PILOT.md. Stattdessen existiert docs/quickstart.md, aber keine dedizierte PILOT.md für Einzelpraxen. — PILOT.md erstellen oder docs/quickstart.md als Ersatz dokumentieren. — `multi-agent-lab/PILOT.md` (404)

**[Wichtig] F2 — Keine dokumentierte Merge-Trennung Kategorie-System vs. Lead-Adapter** — Die Commit-Historie zeigt keine klare Trennung zwischen dem Kategorie-System-Merge (`95e9064`) und dem Lead-Adapter-Merge (`3d01231`). Commit `8cf3be2` trägt Message "docs: restore README screenshots in-repo, asset-safety guardrail" — das deckt nicht die geforderte inhaltliche Trennung ab. Ein externer Beobachter kann nicht nachvollziehen, welcher Code zu welchem Feature gehört. — Merge-Commits mit beschreibenden Messages versehen oder Dokumentation ergänzen. — `multi-agent-lab` Commit-Historie

**[Wichtig] F4 — "92 % accuracy" auf aion-lumen.ch/multi-agent (Beleg-07) nicht durch öffentlichen Eval belegt** — Die externe Seite aion-lumen.ch/multi-agent trägt in Beleg-07: "v1-strict — 92 % accuracy, 0 false auto-commits". Das Eval-Verzeichnis im Repo (evals/triage/) hat nur 12 Fixtures und keine Ergebnisdatei einer durchgeführten Eval. Die 92% können daher von externen Besuchern nicht nachvollzogen werden. — Eval-Ergebnisse einchecken oder Behauptung als "interne Eval" kennzeichnen. — `https://aion-lumen.ch/multi-agent/` · `folio/evals/triage/`

**[Wichtig] F3 — config/trusted_sources.yaml nicht im öffentlichen Repo** — Die Source-Trust-Policy in FOLIO-IMPORT.md verweist auf `config/trusted_sources.yaml` als Datei für vertraute Quellen. Diese Datei existiert nicht im öffentlichen Repo (verständlich, da sie maschinenspezifisch ist), aber es gibt kein Beispiel/Template. Die Policy selbst ist korrekt dokumentiert (fail-closed: "If the config is missing, no source is trusted"). — Template/Beispiel für trusted_sources.yaml ins Repo aufnehmen. — `folio/config/trusted_sources.yaml` (nicht vorhanden)

**[Wichtig] F1 — Spec-Mirror-URL zeigt identischen Stand zum Repo, beide ohne `lead`** — Die Spec unter aion-lumen.ch/folio/import-spec.md ist identisch zu FOLIO-IMPORT.md im Repo. Beide zeigen v1 frozen, beide ohne `lead`-Typ. Wenn `lead` Teil des Release sein soll, müsste die Spec aktualisiert werden — was gegen "v1 frozen" verstösst (Breaking Change). — `lead` entweder als v2 spezifizieren oder v1-Regeln als unangetastet bestätigen. — `https://aion-lumen.ch/folio/import-spec.md`

**[Wichtig] F5 — Screenshot 05 (verlauf-detail) zeigt fiktive Immobilien-Mails mit Preisen und Orten** — Screenshot 05 zeigt: "Novo: Apartamento T3 em Faro, 92 m², 380 000 EUR", "Casa renovada T2 Olhão centro, 65 m², 280 000 EUR", "SaaS-Validation-Interview Anfrage — 30 min next week", "Sua encomenda foi enviada". Die verwendeten Domains sind .example (noreply@idealista.example, expose@homegate.example, messaging@linkedin.example, tracking@ctt.example) — korrekt anonymisiert. Allerdings zeigen die Betreffzeilen spezifische Immobilien mit echten Preisen und Orten (Faro, Olhão), was als Demo-Daten zwar fiktiv, aber für Außenstehende verwirrend sein kann. Kein PII, aber potenziell irreführend. — Screenshot bleibt akzeptabel; bei Bedarf Betreffzeilen generischer gestalten. — `multi-agent-lab/docs/screenshots/05-verlauf-detail-20260611.png`

---

## Kür

**[Kür] F3 — Prompt-Injection-Fläche: Trust-Policy ist korrekt, aber Audit-Log-Pfad nicht prominent dokumentiert** — Die Trust-Policy in FOLIO-IMPORT.md ist vollständig und korrekt: `derived_from_external: true` → immer manuelle Review, unvertraute `source` → nie Auto-Commit. Der Audit-Log-Pfad `~/.folio/triage-log.jsonl` ist erwähnt, aber nicht prominent. — Audit-Log-Pfad in README erwähnen. — `folio/FOLIO-IMPORT.md`

**[Kür] F1 — README.md erwähnt Trust-Policy nicht in der Kurzübersicht** — Die README.md beschreibt das Vault-System und den Chat, aber die Source-Trust-Policy als Sicherheitskern ist nicht in der 2-Minuten-Übersicht sichtbar. — Trust-Policy als Sicherheitsfeature in README-Kurzbeschreibung integrieren. — `folio/README.md`

---

## Standard-Sicherheit

**[Sicherheit — OK] Keine Secrets/Keys in Code, Configs oder .env.example** — .env.example enthält ausschliesslich Platzhalter-Werte (`your-hermes-api-key`, `http://localhost:8642`). Keine API-Keys, Tokens oder Passwörter in sichtbaren Dateien.

**[Sicherheit — OK] Keine PII in Screenshots oder Fixtures** — Alle 3 Screenshots (02, 03, 05) verwenden ausschliesslich .example-Domains (idealista.example, homegate.example, linkedin.example, linkedin.example, ctt.example). Keine echten Namen, Mailadressen, Betreffzeilen mit persönlichen Daten oder Adressen. Screenshot 02 zeigt "Yahoo" als generischen Mail-Provider-Account — kein PII.

**[Sicherheit — OK] v1 unangetastet** — FOLIO-IMPORT.md und Spec-Mirror zeigen beide v1 frozen. Keine Breaking Changes an v1. Der `lead`-Typ ist gar nicht vorhanden (siehe Blocker F1), also kann er v1 auch nicht verändert haben.

---

## F4 — Vollständige Liste ALLER Accuracy-/Fixture-Zahl-Fundstellen

| # | Fundstelle | Stand | Bemerkung |
|---|-----------|-------|-----------|
| 1 | `aion-lumen.ch/multi-agent` Beleg-07 | "92 % accuracy, 0 false auto-commits" | Öffentlich, nicht durch Repo-Eval belegt |
| 2 | `folio/evals/triage/manifest.yaml` | 12 Fixtures | Aktueller Repo-Stand (nicht 14) |
| 3 | `mirhamed.ch` CV-Karte (Multi-Agent-Lab) | "92 % Accuracy, 0 falsche Auto-Commits" | Ausserhalb dieses Release-Scope; Fund aus erstem Review |

**Keine weiteren Fundstellen** von Accuracy- oder Fixture-Zahlen in READMEs, FOLIO-IMPORT.md, CHANGELOG.md oder weiteren Repo-Dateien.

---

*Report erstellt am 2026-07-09. Alle Angaben ohne Gewähr. Prüfung erfolgte aus der Perspektive eines ausgeloggten Besuchers ohne spezielle Zugriffsrechte.*
