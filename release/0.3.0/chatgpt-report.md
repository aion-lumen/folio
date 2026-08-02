# Check-Direktive ChatGPT — Konsistenz-Review Release v0.3.0

**Reviewer:** ChatGPT · **Laufdatum:** 2026-07-09 · **Modus:** Web-Review, nur Konsistenz & Fakten

## Prüfhinweis

`HTTP 200` bedeutet in diesem Report: Die URL wurde über das Web-Tool mit Inhalt geladen. Direkte Header-Abfragen aus der Ausführungsumgebung waren nicht möglich; bei fehlgeschlagenen Abrufen wird deshalb ausdrücklich `konnte nicht prüfen` protokolliert und daraus kein Fehlen abgeleitet.

## Befunde

### Blocker

Keine Blocker gefunden.

### Wichtig

[Wichtig] Folio-Versionen — Repo/Site sind nicht durchgehend konsistent: `package.json` steht auf `0.2.0`, CHANGELOG enthält `[0.2.0] - 2026-07-09`, GitHub-Tags enthalten `v0.2.0`, aber README und Aion-Lumen/Folio-Site zeigen weiterhin `v0.1.0 public preview` bzw. `v0.1.0 What works today`. — Beleg: `https://github.com/aion-lumen/folio/blob/main/package.json` HTTP 200 / Datei: package.json Zeile 9; `https://github.com/aion-lumen/folio/blob/main/CHANGELOG.md` HTTP 200 / Datei: CHANGELOG.md Zeile 7; `https://github.com/aion-lumen/folio/tags` HTTP 200 / Tag-Liste `v0.2.0`; `https://github.com/aion-lumen/folio` HTTP 200 / README Status; `https://aion-lumen.ch/folio/` HTTP 200 / Site-Abschnitt `v0.1.0 What works today`.

[Wichtig] Aion-Lumen Multi-Agent-Eval-Claim — Der Zahlenclaim ist gerundet konsistent, aber die Prompt-Variant-Bezeichnung widerspricht der Belegdatei: Site sagt `v1-strict — 93 % accuracy, 0 false auto-commits`; Repo-Ergebnis `results-2026-07-09.json` zeigt `fixtures: 14`, `accuracy: 0.9286`, `false_positive_rate: 0`, aber `prompt_variants: ["v1"]` und `best.variant: "v1"`, nicht `v1-strict`. — Beleg: `https://aion-lumen.ch/multi-agent/` HTTP 200 / sichtbarer Claim; `https://raw.githubusercontent.com/aion-lumen/folio/main/evals/triage/results-2026-07-09.json` HTTP 200 / Datei: results-2026-07-09.json Zeile 1; `https://raw.githubusercontent.com/aion-lumen/folio/main/evals/triage/manifest.yaml` HTTP 200 / Datei: manifest.yaml Zeile 1.

[Wichtig] Release 0.3.0 — Release-Stand `0.3.0` ist öffentlich noch nicht geschnürt: Folio-Tags zeigen nur `v0.2.0` und `v0.1.0`; `package.json` steht auf `0.2.0`; CHANGELOG endet sichtbar bei `0.2.0`. Gemäß Prüfanweisung als Statushinweis, nicht als Fehler. — Beleg: `https://github.com/aion-lumen/folio/tags` HTTP 200 / Tags `v0.2.0`, `v0.1.0`; `https://github.com/aion-lumen/folio/blob/main/package.json` HTTP 200 / Datei: package.json Zeile 9; `https://github.com/aion-lumen/folio/blob/main/CHANGELOG.md` HTTP 200 / Datei: CHANGELOG.md Zeile 7.

### Kür

[Kür] mirhamed.ch Pflichtangaben/Footer — Startseite lädt und zeigt Name, Adresse, Telefon und E-Mail; im vom Web-Tool geladenen Textauszug ist jedoch kein Footer-Link auf Impressum oder Datenschutz sichtbar. Die Direktaufrufe `/impressum` und `/datenschutz` konnten wegen Web-Tool-Sicherheitsblockade nicht geprüft werden; daraus wird kein Fehlen der Seiten abgeleitet. — Beleg: `https://mirhamed.ch/` HTTP 200 / sichtbare Kontaktangaben; `https://mirhamed.ch/impressum` konnte nicht prüfen; `https://mirhamed.ch/datenschutz` konnte nicht prüfen.

[Kür] Spec-Mirror — Die HTML-Hülle `https://aion-lumen.ch/folio/import-spec/` lädt und verweist auf Raw Markdown `/folio/import-spec.md`. Der Raw-Mirror selbst konnte über das Web-Tool nicht geladen werden (`Failed to fetch ... (400) OK`), daher konnte Identität Repo ↔ Mirror nicht verifiziert werden. Im Repo ist `v1` als frozen gekennzeichnet. — Beleg: `https://aion-lumen.ch/folio/import-spec/` HTTP 200 / Raw-Link sichtbar; `https://aion-lumen.ch/folio/import-spec.md` konnte nicht prüfen; `https://raw.githubusercontent.com/aion-lumen/folio/main/FOLIO-IMPORT.md` HTTP 200 / Datei: FOLIO-IMPORT.md Zeilen 1, 16.

## Bestätigungen ohne Befund

- `frag-shifu.ch`: Startseite, Login, Impressum, Datenschutz und AGB wurden geladen. Impressum enthält Name, Adresse und Kontakt. Datenschutz ist vorhanden. — Beleg: `https://frag-shifu.ch/` HTTP 200; `https://frag-shifu.ch/login` HTTP 200; `https://frag-shifu.ch/impressum` HTTP 200; `https://frag-shifu.ch/datenschutz` HTTP 200; `https://frag-shifu.ch/agb` HTTP 200.
- `aion-lumen.ch`: Startseite und Impressum wurden geladen. Impressum enthält Name, Adresse, Kontakt und Datenschutztext. Separater `/datenschutz`-Direktaufruf konnte nicht geprüft werden; Footer-Link zeigt auf Impressum, nicht auf eine eigene Datenschutzseite. — Beleg: `https://aion-lumen.ch/` HTTP 200; `https://aion-lumen.ch/impressum/` HTTP 200.
- `noblecause.ai`: Startseite, Manifest, Sitzungsübersicht, Journal, aktuelle Sitzung und Impressum wurden geladen. Impressum enthält Name, Adresse, Kontakt und Datenschutztext. README und Site stimmen beim Grundclaim überein: keine Spendenannahme, statische Site, Protokolle öffentlich, Code MIT/Inhalte CC BY 4.0. — Beleg: `https://noblecause.ai/` HTTP 200; `https://noblecause.ai/impressum/` HTTP 200; `https://github.com/noblecause-ai/NobleCause.ai` HTTP 200.
- NobleCause-Sitzungen: Startseite nennt Sitzung 3 vom 2026-07-07 als jüngste Sitzung; Sitzungsübersicht listet Sitzung 3, 2 und 1 alle am 2026-07-07 mit Kosten 2.60 €, 2.21 €, 0.32 €. Kein Widerspruch gefunden. — Beleg: `https://noblecause.ai/` HTTP 200; `https://noblecause.ai/sessions/` HTTP 200.
- Frag-Shifu Datenschutz-Claim zu Anthropic API-Training: Site sagt, Anthropic verwende API-Daten gemäß Nutzungsbedingungen nicht zum Training. Die offizielle Anthropic Privacy-Center-Seite sagt für kommerzielle Produkte inkl. Anthropic API: Inputs/Outputs werden standardmäßig nicht zum Training verwendet. Kein Widerspruch gefunden. — Beleg: `https://frag-shifu.ch/datenschutz` HTTP 200; `https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training` HTTP 200.
- Folio Import v1: Repo-Spec enthält `folio_import: v1`, Pflichtfelder, Trust-Policy und Versioning mit `v1 — initial release (2026-07-07). Frozen.` Kein Hinweis auf Veränderung von v1 im geprüften Repo-Stand. — Beleg: `https://raw.githubusercontent.com/aion-lumen/folio/main/FOLIO-IMPORT.md` HTTP 200 / Datei: FOLIO-IMPORT.md Zeilen 1, 14-16.
- `multi-agent-lab`: README, `pyproject.toml` und Tag `v0.2.0` sind konsistent auf `0.2.0` bzw. Release-Tag `v0.2.0`. — Beleg: `https://github.com/aion-lumen/multi-agent-lab/blob/main/pyproject.toml` HTTP 200 / Datei: pyproject.toml Zeilen 1-5; `https://github.com/aion-lumen/multi-agent-lab/tags` HTTP 200.

## Sicherheitsprüfung

Keine Secrets/Keys oder fremde PII wurden in den geladenen öffentlichen Seiten, README-/Spec-/Package-Dateien und Eval-Dateien gefunden. Die Git-Historie und sichtbare Actions-Logs konnten in diesem Web-Review nicht vollständig tiefengeprüft werden; daher kein abschließender Negativbefund für Historie/Logs.

## URL-Zugriffsprotokoll

| URL | Status | Ergebnis |
|---|---:|---|
| `https://mirhamed.ch/` | 200 | Startseite geladen; Kontaktangaben sichtbar; Projektclaims sichtbar. |
| `https://mirhamed.ch/impressum` | konnte nicht prüfen | Web-Tool: Direktaufruf blockiert (`not safe to open`). Kein Befund abgeleitet. |
| `https://mirhamed.ch/datenschutz` | konnte nicht prüfen | Web-Tool: Direktaufruf blockiert (`not safe to open`). Kein Befund abgeleitet. |
| `https://aion-lumen.ch/` | 200 | Startseite geladen. |
| `https://aion-lumen.ch/folio/` | 200 | Folio-Seite geladen; Versionstext `v0.1.0 What works today` sichtbar. |
| `https://aion-lumen.ch/multi-agent/` | 200 | Multi-Agent-Seite geladen; Claims `550+ real emails` und `v1-strict — 93 % accuracy` sichtbar. |
| `https://aion-lumen.ch/impressum/` | 200 | Impressum geladen; Name, Adresse, Kontakt, Datenschutztext vorhanden. |
| `https://aion-lumen.ch/datenschutz` | konnte nicht prüfen | Web-Tool: Direktaufruf blockiert (`not safe to open`). Datenschutztext ist im Impressum vorhanden. |
| `https://aion-lumen.ch/folio/import-spec/` | 200 | Spec-HTML-Hülle geladen; Raw-Markdown-Link sichtbar. |
| `https://aion-lumen.ch/folio/import-spec.md` | konnte nicht prüfen | Web-Tool: `Failed to fetch ... (400) OK`. Kein Fehlen abgeleitet. |
| `https://frag-shifu.ch/` | 200 | Startseite geladen. |
| `https://frag-shifu.ch/login` | 200 | Login-Seite geladen; Footer-Links sichtbar. |
| `https://frag-shifu.ch/impressum` | 200 | Impressum geladen; Name, Adresse, Kontakt vorhanden. |
| `https://frag-shifu.ch/datenschutz` | 200 | Datenschutzerklärung geladen. |
| `https://frag-shifu.ch/agb` | 200 | AGB geladen. |
| `https://noblecause.ai/` | 200 | Startseite geladen; jüngste Sitzung sichtbar. |
| `https://noblecause.ai/manifest/` | 200 | Manifest geladen. |
| `https://noblecause.ai/idee/` | 200 | Ablaufseite geladen. |
| `https://noblecause.ai/sessions/` | 200 | Sitzungsübersicht geladen. |
| `https://noblecause.ai/journal/` | 200 | Journal geladen. |
| `https://noblecause.ai/sessions/2026-07c/` | 200 | Aktuelle Sitzung geladen. |
| `https://noblecause.ai/impressum/` | 200 | Impressum geladen; Name, Adresse, Kontakt, Datenschutztext vorhanden. |
| `https://noblecause.ai/datenschutz/` | konnte nicht prüfen | Web-Tool: Direktaufruf blockiert (`not safe to open`). Datenschutztext ist im Impressum vorhanden. |
| `https://github.com/aion-lumen/folio` | 200 | Repo geladen; README sichtbar. |
| `https://github.com/aion-lumen/folio/tags` | 200 | Tags geladen; `v0.2.0`, `v0.1.0` sichtbar. |
| `https://github.com/aion-lumen/folio/tree/main/evals/triage` | 200 | Eval-Verzeichnis geladen; `fixtures`, `manifest.yaml`, `results-2026-07-09.json`, `run.ts` sichtbar. |
| `https://raw.githubusercontent.com/aion-lumen/folio/main/evals/triage/results-2026-07-09.json` | 200 | Eval-Ergebnis geladen; `fixtures: 14`, `accuracy: 0.9286`, `false_positive_rate: 0`. |
| `https://raw.githubusercontent.com/aion-lumen/folio/main/evals/triage/manifest.yaml` | 200 | Eval-Manifest geladen; Fixtures und Prompt-Varianten sichtbar. |
| `https://raw.githubusercontent.com/aion-lumen/folio/main/evals/triage/README.md` | 404 | Datei nicht vorhanden. Kein README im Eval-Verzeichnis erwartet. |
| `https://github.com/aion-lumen/folio/blob/main/FOLIO-IMPORT.md` | 200 | Repo-Spec geladen. |
| `https://raw.githubusercontent.com/aion-lumen/folio/main/FOLIO-IMPORT.md` | 200 | Raw-Spec geladen; v1 frozen sichtbar. |
| `https://github.com/aion-lumen/folio/blob/main/package.json` | 200 | `version: 0.2.0` sichtbar. |
| `https://github.com/aion-lumen/folio/blob/main/CHANGELOG.md` | 200 | `[0.2.0] - 2026-07-09` sichtbar. |
| `https://github.com/aion-lumen/multi-agent-lab` | 200 | Repo geladen. |
| `https://github.com/aion-lumen/multi-agent-lab/tags` | 200 | Tag `v0.2.0` sichtbar. |
| `https://github.com/aion-lumen/multi-agent-lab/blob/main/README.md` | 200 | README geladen. |
| `https://github.com/aion-lumen/multi-agent-lab/blob/main/pyproject.toml` | 200 | `version = "0.2.0"` sichtbar. |
| `https://github.com/noblecause-ai/NobleCause.ai` | 200 | Repo geladen; README sichtbar; keine Releases veröffentlicht. |
| `https://raw.githubusercontent.com/noblecause-ai/NobleCause.ai/main/README.md` | 404 | Falscher Branch für Raw-URL; Repo läuft auf `master`. Kein Befund gegen Repo-Inhalt. |
| `https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training` | 200 | Offizielle Anthropic Privacy-Center-Seite geladen. |
