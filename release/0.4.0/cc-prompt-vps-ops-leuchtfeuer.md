# CC-Prompt — Leuchtfeuer VPS-Ops (mit sudo, der Steward überwacht)

Du bist per SSH auf dem VPS `185.143.100.222` (Admin/sudo). Richte die Leuchtfeuer-Server-Seite ein: Caddy-Access-Logging mit IP-Anonymisierung, die Collectors, den Cron, und einen minimalen Read-only-User für den späteren Mac-Pull. **der Steward überwacht jeden Schritt.**

## Eiserne Regeln
- **Keine Credentials anlegen.** Das Token-Env (`/etc/leuchtfeuer/env`, `LEUCHTFEUER_GH_PAT_*`) ist des Stewards Hand — nur VERIFIZIEREN, dass es existiert, nie neu erstellen/anzeigen.
- **Jeden riskanten Schritt absichern:** Caddyfile VOR Änderung sichern, `caddy validate` VOR reload, nach reload alle 4 Sites auf HTTP 200 prüfen.
- **Die IP-Maskierung ist die Kern-Zusage** — sie muss an einer echten Log-Zeile NACHGEWIESEN werden (letztes Oktett `.0`), bevor der Schritt als fertig gilt.
- Nach jedem Block: kurz Ergebnis melden, auf des Stewards „weiter" warten.

## Schritt 0 — Ops-Dateien auf den VPS bringen (falls noch nicht da)
Die Collector-Dateien liegen im folio-Repo auf des Stewards Mac unter `ops/leuchtfeuer/`. Prüfe zuerst, ob sie schon auf dem VPS sind (die frühere Reorg-Session hat evtl. schon etwas abgelegt):
```
ls -la /opt/leuchtfeuer/ 2>/dev/null; ls -la /etc/leuchtfeuer/ 2>/dev/null
```
Falls die `collect_*.py` / `run-collectors.sh` fehlen → **der Steward überträgt sie** (von seinem Mac, ein Befehl):
```
scp -i ~/.ssh/aion_vps_key ~/Projects/folio/ops/leuchtfeuer/{collect_caddy.py,collect_github.py,run-collectors.sh,cron.d-leuchtfeuer,caddy-logging.snippet.caddy} ubuntu@185.143.100.222:/tmp/leuchtfeuer/
```
(Zielordner `/tmp/leuchtfeuer/` vorher anlegen lassen.) Dann arbeitest du aus `/tmp/leuchtfeuer/`.

## Schritt 1 — Caddy-Logging (RISIKO: Caddyfile — sichern + validieren)
1. Caddyfile finden (`/etc/caddy/Caddyfile` üblich): `sudo caddy fmt --overwrite /etc/caddy/Caddyfile` NICHT ausführen; nur lesen.
2. **Backup:** `sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak-$(date +%F-%H%M)`
3. `/var/log/caddy/` sicherstellen: `sudo mkdir -p /var/log/caddy && sudo chown caddy:caddy /var/log/caddy` (User ggf. anpassen, je nach Caddy-Service-User).
4. In **jeden der vier Site-Blöcke** (aion-lumen.ch, frag-shifu.ch, noblecause.ai, mirhamed.ch) diesen `log`-Block einfügen, **Dateiname je Site anpassen**:
```
	log {
		output file /var/log/caddy/SITE.log {
			roll_size 50MiB
			roll_keep 8
			roll_keep_for 168h
		}
		format filter {
			wrap json
			fields {
				request>client_ip ip_mask { ipv4 24  ipv6 48 }
				request>remote_ip ip_mask { ipv4 24  ipv6 48 }
			}
		}
	}
```
5. **Validieren VOR reload:** `sudo caddy validate --config /etc/caddy/Caddyfile`. Nur bei „valid" weiter.
6. Reload: `sudo systemctl reload caddy` (oder `caddy reload`).
7. **Sites prüfen:** alle vier `curl -sI https://<site>/ | head -1` → HTTP 200/2xx. Bei Fehler: Backup zurückspielen, melden, STOP.
8. **IP-Maskierung NACHWEISEN:** eine Seite aufrufen, dann frische Log-Zeile prüfen:
```
curl -s https://aion-lumen.ch/ >/dev/null
sudo tail -n 1 /var/log/caddy/aion-lumen.ch.log | python3 -m json.tool | grep -iE "client_ip|remote_ip"
```
→ Die IP muss auf `.0` enden (z.B. `1.2.3.0`). Wenn NICHT maskiert → STOP, nicht fortfahren (Datenschutz-Zusage verletzt).

## Schritt 2 — Collectors + Output-Dir
```
sudo mkdir -p /opt/leuchtfeuer
sudo cp /tmp/leuchtfeuer/collect_caddy.py /tmp/leuchtfeuer/collect_github.py /tmp/leuchtfeuer/run-collectors.sh /opt/leuchtfeuer/
sudo chmod +x /opt/leuchtfeuer/*.sh
sudo mkdir -p /var/lib/leuchtfeuer/metrics
```

## Schritt 3 — Token-Env NUR verifizieren (nicht anlegen)
```
sudo test -r /etc/leuchtfeuer/env && echo "env vorhanden" || echo "FEHLT — der Steward legt es an (PAT), nicht CC"
sudo stat -c '%U:%G %a' /etc/leuchtfeuer/env   # soll root:root 600
```
Falls es fehlt: **der Steward** legt `/etc/leuchtfeuer/env` mit `LEUCHTFEUER_GH_PAT_AION=…` + `LEUCHTFEUER_GH_PAT_NOBLECAUSE=…` an (chmod 600). Du referenzierst nur den Namen.

## Schritt 4 — Smoke-Run (erster Aggregat, ohne aufs Cron zu warten)
```
sudo /opt/leuchtfeuer/run-collectors.sh
ls -la /var/lib/leuchtfeuer/metrics/*/  2>/dev/null
sudo cat /var/lib/leuchtfeuer/metrics/aion-lumen.ch/$(date -u -d yesterday +%F).json 2>/dev/null | python3 -m json.tool | head -20
```
Prüfen: pro Site + github eine `<datum>.json`; Inhalt enthält NUR Aggregate (visits, door, top_paths, uniques_est) und **keine unmaskierte IP / keine echten Besucherdaten**. (Am ersten Tag können visits niedrig/0 sein — das ist ok, Logs sind frisch.)

## Schritt 5 — Cron installieren
```
sudo cp /tmp/leuchtfeuer/cron.d-leuchtfeuer /etc/cron.d/leuchtfeuer
sudo chmod 644 /etc/cron.d/leuchtfeuer
```
(Läuft täglich 00:20 UTC → schreibt „gestern" komplett.)

## Schritt 6 — Minimaler Read-only-Pull-User (KORRIGIERT — CC hat den nologin/rsync-Konflikt zu Recht gemeldet)

**Fehler in v1:** `nologin` blockiert scp/rsync, und `-M` (kein Home) lässt `authorized_keys` nirgends liegen. Korrektur: **normale Shell + gesperrtes Passwort + Home**, die Sicherheit kommt aus dem **forced-command in authorized_keys** (nicht aus der Shell). Das ist enger als nologin+sftp: der Key kann NUR read-only-rsync auf genau diesen Pfad, keine Shell, kein Forwarding.

**Pull-Verfahren: rsync-over-ssh mit forced command** (`rrsync -ro`).

```
# 1. User mit Home + Shell, aber Passwort gesperrt (nur Key-Login):
sudo useradd -r -m -d /var/lib/leuchtfeuer-pull -s /bin/bash leuchtfeuer-pull
sudo passwd -l leuchtfeuer-pull

# 2. Read-only-Zugriff NUR auf die Metrics (Deploy-User NICHT erweitern):
sudo chgrp -R leuchtfeuer-pull /var/lib/leuchtfeuer/metrics
sudo chmod -R g+rX,o-rwx /var/lib/leuchtfeuer/metrics
sudo chmod o-rwx /var/lib/leuchtfeuer

# 3. .ssh vorbereiten (Key trägt der Steward ein):
sudo -u leuchtfeuer-pull mkdir -p /var/lib/leuchtfeuer-pull/.ssh
sudo -u leuchtfeuer-pull chmod 700 /var/lib/leuchtfeuer-pull/.ssh

# 4. rrsync lokalisieren (restricted-rsync-Wrapper):
which rrsync || ls /usr/bin/rrsync /usr/share/doc/rsync/scripts/rrsync* 2>/dev/null
# falls nur unter docs: sudo cp <pfad>/rrsync /usr/local/bin/ && sudo chmod +x /usr/local/bin/rrsync
```

**SSH-Key-Autorisierung = des Stewards Hand.** der Steward trägt den **Public-Key** des Mac-Pull-Schlüssels in `/var/lib/leuchtfeuer-pull/.ssh/authorized_keys` ein, mit forced command davor (read-only, ein Pfad, kein Shell/Forwarding):
```
command="rrsync -ro /var/lib/leuchtfeuer/metrics",restrict ssh-ed25519 AAAA…<mac-pull-pubkey>
```
Dann: `sudo chown leuchtfeuer-pull:leuchtfeuer-pull /var/lib/leuchtfeuer-pull/.ssh/authorized_keys && sudo chmod 600 …`. CC bereitet nur `.ssh` vor, trägt KEINEN Key ein.

> `restrict` sperrt Port-/X11-/Agent-Forwarding + PTY; `command=` erlaubt ausschließlich den read-only-rrsync auf genau diesen Pfad. Trotz `/bin/bash` bekommt der Key nie eine Shell.

## Danach (des Stewards Mac, nicht diese SSH-Session)
`com.folio.leuchtfeuer-pull.plist`: `METRICS_HOST` = `leuchtfeuer-pull@185.143.100.222`, Pfad `/var/lib/leuchtfeuer/metrics/`, `__HOME__` ersetzen → `launchctl load`. Erster Pull füllt `~/.folio/metrics/` → Karte leuchtet.

## Abschluss-Meldung an der Steward/Cowork
Pro Schritt: erledigt/Abweichung. Besonders: (1) Caddy validate „valid" + 4 Sites 200, (2) **IP nachweislich maskiert** (Beispielzeile), (3) Smoke-Run erzeugte Dateien, (4) Read-User angelegt (oder an infra-reorg verwiesen). Kein `vite dev --host`, keine Credentials angelegt.
