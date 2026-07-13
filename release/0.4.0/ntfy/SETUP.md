# ntfy self-hosted — Setup (Afschins sudo-Hand)

0.4.0 Teil C. CC hat Config + Code vorbereitet; **die VPS-/Secret-/launchd-Schritte
führst du aus** (CC legt keine Credentials/Tokens an, appliziert nichts auf dem VPS).
VPS: Infomaniak `185.143.100.222`, Caddy nativ + Auto-TLS, systemd.

Reihenfolge strikt einhalten (DNS → Dienst → Caddy → Tokens → launchd → Test).

## 1. DNS (beim Registrar)
A-Record `ntfy.aion-lumen.ch` → `185.143.100.222`. Vor Schritt 3 propagiert
(`dig +short ntfy.aion-lumen.ch` zeigt die IP).

## 2. ntfy installieren (VPS, sudo)
```bash
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://archive.ntfy.sh/apt/keyring.gpg | sudo gpg --dearmor -o /etc/apt/keyrings/ntfy.gpg
echo "deb [signed-by=/etc/apt/keyrings/ntfy.gpg] https://archive.ntfy.sh/apt stable main" \
  | sudo tee /etc/apt/sources.list.d/ntfy.list
sudo apt update && sudo apt install -y ntfy
sudo mkdir -p /var/lib/ntfy
```

## 3. Config + Dienst (VPS, sudo)
`server.yml` (aus diesem Ordner) nach `/etc/ntfy/server.yml` kopieren, dann:
```bash
sudo systemctl enable ntfy && sudo systemctl restart ntfy
curl -s http://127.0.0.1:2586/v1/health          # → {"healthy":true}
```

## 4. Caddy-Reverse-Proxy (VPS, sudo)
Block aus `Caddyfile.ntfy-snippet` an `/etc/caddy/Caddyfile` anhängen, dann:
```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
curl -I https://ntfy.aion-lumen.ch                # → 200/401 (Dienst erreichbar, TLS ok)
```

## 5. User, ACL, Tokens (VPS, sudo) — zwei Publisher + ein Reader
```bash
# Folio-Publisher: nur folio-ops schreiben
sudo ntfy user add --role=user folio-pub          # Passwort vergeben
sudo ntfy access folio-pub folio-ops write
sudo ntfy token add folio-pub                      # → tk_FOLIO... (notieren)

# Wacht-Publisher: nur hermes-wacht schreiben
sudo ntfy user add --role=user wacht-pub
sudo ntfy access wacht-pub hermes-wacht write
sudo ntfy token add wacht-pub                      # → tk_WACHT... (notieren)

# Reader für deine Geräte: beide Topics lesen
sudo ntfy user add --role=user afschin-reader
sudo ntfy access afschin-reader hermes-wacht read
sudo ntfy access afschin-reader folio-ops read
```

## 6. Tokens in 0600-Dateien (auf dem Mac) — kein Token ins Repo
```bash
umask 077
printf '%s' 'tk_FOLIO...' > ~/.config/life/ntfy-folio-token
printf '%s' 'tk_WACHT...' > ~/.config/life/ntfy-wacht-token
chmod 600 ~/.config/life/ntfy-*-token
```
(Passt in die bestehende Secret-Konvention neben `bw-session`, `yahoo-imap-pass`.)

## 7. Marker-Dir + launchd-Watcher (Mac)
```bash
mkdir -p ~/.local/state/life/wacht-markers
cp release/0.4.0/ntfy/com.aionlumen.wacht-ntfy-watcher.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.aionlumen.wacht-ntfy-watcher.plist
```

## 8. Geräte abonnieren
ntfy-App (iOS/Android/Desktop) → Server `https://ntfy.aion-lumen.ch` hinzufügen, als
`afschin-reader` einloggen, Topics `hermes-wacht` + `folio-ops` abonnieren.
(iOS-Push nur mit `upstream-base-url` in server.yml — siehe Kommentar dort.)

## 9. End-to-End-Test
```bash
# a) Folio-Publisher direkt
~/Projects/life-mail/scripts/ntfy_publish.py --topic folio-ops \
  --title "ntfy live" --message "Test von der Hand" --priority default

# b) Wacht-Marker → Watcher → hermes-wacht
printf '%s' '{"event":"test","priority":"urgent","title":"Wacht-Test","message":"Marker to ntfy ok","click":"https://github.com/NousResearch/hermes-agent/pull/62765"}' \
  > ~/.local/state/life/wacht-markers/$(date -u +%Y%m%dT%H%M%SZ)-test.json
/usr/bin/python3 ~/Projects/life-mail/scripts/wacht_marker_watcher.py   # oder ≤5min warten
```
Beide sollen auf Handy/Mac erscheinen. Marker landet nach Erfolg in `wacht-markers/done/`.

## Degradation
Ist der VPS/ntfy down: Publisher/Watcher loggen den Fehler und fahren fort — kein Folio-
oder Wacht-Ablauf blockiert. Nicht zugestellte Marker bleiben liegen und werden beim
nächsten Watcher-Lauf erneut versucht.
