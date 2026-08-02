# E-Mail-Privacy für GitHub — Anleitung

**Kontext:** Die Alt-History der Site-Repos (aion-lumen.com, carta) trägt `afschin.mirhamed@gmail.com` in den Commit-Metadaten (Repo-Config war früher auf Gmail). **Kein Leck aus dem Release** — normales Git-Verhalten (jeder Commit trägt die Autor-Mail). Keine Inhalte/Keys betroffen, nur Metadaten. Künftige Commits sind bereits gefixt (alle 3 Repos auf noreply). Gewählter Weg: **GitHub Email-Privacy** (kein History-Rewrite).

Deine noreply-Adresse: `105276395+AfshinMirhamed@users.noreply.github.com`

## Schritt 1 — GitHub-Settings (du, im Browser)
1. https://github.com/settings/emails öffnen.
2. **„Keep my email addresses private"** aktivieren → GitHub nutzt dann deine `…@users.noreply.github.com` für Web-Aktionen.
3. **„Block command line pushes that expose my email"** aktivieren → GitHub weist künftige Pushes ab, die deine echte Mail enthalten würden. Das ist der harte Schutz gegen Wiederholung.

## Schritt 2 — Global sicherstellen (Terminal, du)
Damit nicht nur diese Repos, sondern jedes künftige Repo sauber ist:
```
git config --global user.email "105276395+AfshinMirhamed@users.noreply.github.com"
git config --global user.name "Afshin Mirhamed"
```
(Die lokalen Repo-Configs von aion-lumen.com/carta/folio sind bereits auf noreply — das ist der globale Fallback für alle anderen.)

## Schritt 3 — Verifikation (Terminal)
```
# künftige Commits sauber?
git config --global user.email        # -> …noreply.github.com
# je Repo:
for r in ~/Projects/aion-lumen.com ~/Projects/carta ~/Projects/folio; do
  echo "$r:"; git -C "$r" config user.email
done
# letzte Commits prüfen (sollte noreply zeigen):
git -C ~/Projects/aion-lumen.com log --format='%ae' -3
git -C ~/Projects/carta log --format='%ae' -3
```

## Was NICHT gemacht wird (bewusst)
- **Kein History-Rewrite.** Die bestehende Gmail in der Alt-History bleibt stehen. Begründung: Metadaten-Mail ist mild (Spam/Scraping-Risiko, keine Sicherheitslücke); Rewrite wäre disruptiv (force-push, Hash-Änderung, brechende Klone/Forks) und bei geringem Fork-Aufkommen nicht verhältnismäßig. Falls sich das später ändert (viele Forks, konkrete Belästigung), kann `git filter-repo` das jederzeit nachholen.

## Danach
Deine zwei Live-Pushes (Classifier blockt CC) — Commits liegen bereit:
```
cd ~/Projects/aion-lumen.com && git push origin main   # 34b15b3
cd ~/Projects/carta && git push origin main            # 583795a
```
Dann Live-Check: aion-lumen.ch/multi-agent Beleg 07 + mirhamed.ch CV → 93 % / 14 Fixtures / 0 Fehlalarme, kein v1-strict. (Cowork kann den Live-Check per Browser übernehmen.)
