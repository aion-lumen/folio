# Field-Note — ntfy-Kanal (0.4.0 Teil C, 2026-07-13)

## Anlass: ein Bericht, der niemanden erreichte

Am 2026-07-12 meldete die Hermes-Wacht korrekt (Omars grünes Licht auf #34076-Umfeld),
aber der Bericht löste **keinen Trigger** aus → ging unter, der Steward fand ihn erst
nachträglich. Bei 24-h-Reaktionsfenstern (Clean-Sweep-Regime des Upstream-Repos) ist ein
Bericht, der niemanden erreicht, wirkungslos. Das ist der konkrete Auslöser für den Kanal.

## Entscheidung: self-hosted, NICHT ntfy.sh

- **ntfy.sh scheidet aus:** Der Topic-Name ist dort faktisch das Passwort (kein Signup —
  wer den Namen kennt, liest/publiziert mit), und ntfy.sh relayed über Google Firebase
  (FCM). Wacht-Berichte nennen PR-Status und ggf. Repo-Interna — das gehört nicht über
  einen Dritt-Dienst. Bruch mit dem local-first-Kern der Marke.
- **Self-hosted ntfy auf dem Infomaniak-VPS:** `auth-default-access: deny-all` +
  Token-Auth (eng-scoped pro Publisher), hinter der bestehenden Caddy-Instanz (Auto-TLS),
  Subdomain `ntfy.aion-lumen.ch`. Optionaler Privacy-Mode (`upstream-base-url`) für iOS-
  Push: der Upstream sieht nur eine Message-ID zum Trigger eines lokalen Fetch, nicht den
  Inhalt.

## local-first-Einordnung (Marken-Konsistenz)

Der ntfy-Kanal ist **Infrastruktur-/Ops-Benachrichtigung**, kein Nutzerdaten-Transfer und
kein Teil der Folio-App-Laufzeit. Er berührt das „0 external calls"-Versprechen der
**Sites** nicht (die bleiben tracking-frei). Dokumentiert, damit die Ausnahme transparent
ist, nicht versteckt.

## Wie es gebaut ist (die tragenden Design-Punkte)

- **Wacht läuft als lokaler Claude-Code-Scheduled-Task** (SKILL.md, ~07:00 UTC), LLM-
  getrieben — kein deterministischer Code-Hook. Deshalb **Marker + Watcher**: die Wacht
  schreibt bei Eskalation nur eine Marker-JSON nach `~/.local/state/life/wacht-markers/`
  (kein Token, kein Netz im Wacht-Lauf); ein launchd-Watcher hält das Token und publiziert
  deterministisch. Das hält das Token strikt aus dem Wacht-/SKILL-Kontext.
- **Folio publiziert direkt:** `pipeline.py` am Run-Ende (folio-ops), `+server.ts` beim
  `code!==0` — der „siehe Logs"-Fehler, der bisher nur im SSE-Panel stand, wird als
  ntfy-Trigger sichtbar.
- **Token-Hygiene konsistent mit der Mail-Härtung:** Tokens in 0600-Dateien unter
  `~/.config/life/` (wie `yahoo-imap-pass`), nie im Repo. Marker-State unter
  `~/.local/state/life/` (bestehende Konvention), **nicht** in `~/.hermes` (Hermes-Home,
  CC-schreibgeblockt).
- **Best-effort (C4):** Publisher/Watcher fangen jeden Fehler (VPS down, Token fehlt,
  Timeout) → loggen, werfen nie. Kein Folio-/Wacht-Ablauf blockiert an einer Notification.

## Lehre

Eine Wacht ohne Zustellkanal ist nur ein Logbuch. Der teuerste Teil war nicht der Kanal,
sondern **herauszufinden, wo der Bericht entsteht** (Cowork/lokaler Scheduled-Task, kein
Code-Hook) — genau der Punkt, an dem die Direktive „nicht raten, erst melden" verlangte.
