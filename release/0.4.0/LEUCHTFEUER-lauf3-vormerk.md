# Vormerk — Release-Lauf #3 (Leuchtfeuer)

**Status:** erledigt. Lauf #3 ist gelaufen, Leuchtfeuer ist seit v0.4.0 ausgeliefert und live. Dokument bleibt als Vorplanung im Rekord.
Quelle: `direktive-default-fix-leuchtfeuer-2026-07-10.md` (Architekt-Session).

## Matrix-Einordnung (vorab bekannt)
**Feature + neue Heute-Hub-Karte, KEIN Interchange-Touch.** → Prozess-Tiefe: Feature-Release, aber überschaubare Außenfläche (eine neue Karte, Datenschutz-Sätze auf 4 Sites). Kimi/ChatGPT-Review sinnvoll, aber verengt auf: neue Karte, Datenschutz-Text-Konsistenz (4 Sites, frag-shifu separat!), keine Interchange-Prüfung nötig.

## Zwei Dinge, die für Lauf #3 vorgemerkt sind
1. **Reviewer-Rotation anwenden** (Direktive Z.159). Weicht von v2-Skill ab (dort ChatGPT fest). Absicht mit der Steward klären, wenn Lauf #3 startet — vermutlich: Reviewer bewusst wechseln, um Reviewer-spezifische blinde Flecken aufzudecken (Kimi-Lehre), nicht auf einen verlassen.
2. **Matrix-Einordnung** steht schon fest (s.o.) — Prozess-Tiefe folgt daraus.

## Besonderheiten, die im Lauf #3 zu beachten sind (aus der Direktive)
- **Datenschutz-Sätze auf 4 Sites** (Server-Logs, anonymisiert, 7 Tage, keine Cookies) — **frag-shifu SEPARAT formulieren** (eigene DE-only Datenschutz-Seite, nicht kopieren).
- **Zahlen-/Site-Änderungen = Coworks Kaskade + des Stewards Freigabe**, nicht CCs Hand (gilt weiter).
- **Keine Credentials:** GitHub-PAT legt der Steward selbst an, CC referenziert nur den Secret-Namen. Cowork fasst Tokens ebenfalls nie an.
- **rsync-Whitelist-Falle:** `metrics/` muss explizit in die aion-lumen-Deploy-Whitelist — sonst kommt beim Pull nichts an. In Phase-2-Entwürfen / G2-Check aufnehmen.
- **Degradation testen:** Metrik-Dateien entfernen → Karte zeigt letzten Stand mit Datum, kein Spinner. Als Verifikationspunkt.
- **0-externe-Calls-Markenversprechen** bleibt wörtlich wahr (kein Client-Tracking) — relevant für die Datenschutz-Konsistenzprüfung im Review.
- **Migrations-Nachzug 08c:** Leuchtfeuer als normale Karte, später zweiter Konsument der Modul-API — Code-Kommentar-Vermerk erwarten.
- **Re-Leak-Check:** Author == Committer, keine persönliche Mail. (E-Mail-Privacy ist bei der Steward aktiv — nicht reflexhaft als Befund melden, s. 0.3.0-Fieldnote.)

## E-Mail-in-History-Lehre (aus 0.3.0)
NICHT wieder als Befund melden — GitHub-Email-Privacy des Nutzers ist aktiv, Repo-Configs auf noreply. Erledigt.
