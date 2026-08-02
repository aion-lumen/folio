# Fixture-Zahl-Klärung (vor Voll-Eval)

**Datum:** 2026-07-08 · **Status:** GEKLÄRT — kein Manifest-Fix nötig

## Befund

| Prüfung | Ergebnis |
|---|---|
| `grep -c "file:" manifest.yaml` | **14** registrierte Fixtures |
| `ls fixtures/*.md \| wc -l` | **14** tatsächliche Dateien |
| Deckungsgleich? | **ja**, Datei-für-Datei identisch (sortiert verglichen) |
| Beide Lead-Fixtures registriert? | **ja** (`lead-freelance-python.md` Z.5, `lead-freelance-devops.md` Z.7), beide `expected: task` |
| Manifest durch „zurück auf 3 Modelle" verändert? | **nein** — nur Modell-Config betroffen, Fixture-Liste unangetastet |

## Auflösung der Diskrepanz

- **Belastbare Zahl: 14 Fixtures.**
- Die „16 inkl. 2 Leads" aus dem CC-Handoff ist eine **Fehlzählung** (die 2 Lead-Fixtures sind bereits Teil der 14, nicht additiv obendrauf).
- Der echte Zuwachs gegenüber dem alten Außenflächen-Stand („12 Fixtures" auf carta) ist **12 → 14** (2 neue Lead-Fixtures).

## Konsequenz für die Zahlen-Kaskade

Beim späteren Nachzug auf carta/aion-lumen gilt: **„… über 14 Fixtures"** (nicht 16, nicht 12). Die Accuracy/Score-Zahl selbst kommt aus Afschins 3-Modell-Voll-Eval (Platzhalter, siehe Phase 2).

**Kein Korrektur-Commit am Manifest erforderlich.**
