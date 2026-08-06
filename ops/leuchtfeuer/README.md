# Leuchtfeuer — ops & deployment

Site + repo metrics for the Folio Heute-hub, from **server logs only** — no client-side tracking, no
cookies, no external analytics. The 0-external-calls promise of the sites stays literally true.

**Status: produktiv seit Juli 2026.** Der Pull läuft über den read-only-VPS-User `leuchtfeuer-pull`
mit `authorized_keys`-forced-command (`rrsync -ro /var/lib/leuchtfeuer/metrics`, `restrict`) — kein
interaktiver Zugang, kein Schreibrecht. Die „Deployment"-Abschnitte unten sind die **ausgeführte
Einrichtungsanleitung / Referenz**, keine offene To-do-Liste.

Data flow:
```
Caddy JSON logs (IP masked in-Caddy)  ─┐
                                       ├─ VPS cron ─► /var/lib/leuchtfeuer/metrics/<site|github>/YYYY-MM-DD.json
GitHub API (stars + traffic)          ─┘                         │
                                                                 └─ (local launchd rsync PULL) ─► ~/.folio/metrics/
                                                                                                     │
                                                            folio reads it read-only ─► Heute card + /leuchtfeuer
```

## Files here
| File | Runs on | Purpose |
|---|---|---|
| `collect_caddy.py` (+test) | VPS | parse a day of Caddy logs → per-site aggregate (visits, uniques, top paths, door /story\:/folio, referrers, bots filtered) |
| `collect_github.py` (+test) | VPS | daily stars + traffic (views/clones, unique) snapshot for folio, multi-agent-lab, NobleCause.ai |
| `run-collectors.sh` | VPS | cron wrapper: sources token env, runs all collectors for yesterday |
| `cron.d-leuchtfeuer` | VPS | the root system-cron entry (00:20 UTC) |
| `caddy-logging.snippet.caddy` | VPS | per-site `log` block: JSON + `ip_mask` + 7-day retention |
| `com.folio.leuchtfeuer-pull.plist` | **Mac** | launchd: daily rsync pull VPS → `~/.folio/metrics/` |
| `privacy-drafts.md` | — | one-sentence privacy text per site (frag-shifu separate, DE-only) |

Local tests: `cd ops/leuchtfeuer && python3 -m unittest -v` (7 tests, stdlib only).

## Architecture decisions (with reasons)
- **Python, not GoAccess** — custom schema incl. the door measurement + IP-anon-at-parse + bot filter;
  Caddy already logs JSON so parsing is trivial; **zero extra VPS dependency**; unit-testable. GoAccess
  would need post-processing into this schema plus an install.
- **Metrics live at `/var/lib/leuchtfeuer/metrics/`, NOT under `/srv/aion-lumen/`.** They are visitor
  aggregates — putting them in the Caddy webroot would make them **publicly fetchable**. So they stay in
  a private dir and the Mac pulls them **directly over SSH**.
  - ⚠️ **Divergence from the directive to flag:** the directive says "`metrics/` muss in die rsync-
    Whitelist". That whitelist governs the **deploy** rsync (Mac → VPS, site content). Our metrics flow
    is the **opposite** direction (VPS → Mac, pull) and deliberately outside the webroot, so the deploy
    whitelist is **not involved** — and must not be, or the aggregates would ship publicly. If you'd
    rather expose an authenticated metrics endpoint instead of an SSH pull, that's a different design;
    confirm the private-dir + SSH-pull choice.

## Deployment (VPS side — ausgeführte Einrichtung, Referenz; CC hat keinen VPS-Zugang)
1. **Caddy logging:** merge `caddy-logging.snippet.caddy` into each of the four site blocks, reload Caddy.
   Verify a fresh log line shows a masked IP (e.g. `1.2.3.0`).
2. **Collectors:** `sudo mkdir -p /opt/leuchtfeuer && sudo cp collect_caddy.py collect_github.py run-collectors.sh /opt/leuchtfeuer/ && sudo chmod +x /opt/leuchtfeuer/*.sh`
3. **Output dir:** `sudo mkdir -p /var/lib/leuchtfeuer/metrics`
4. **Token env:** already in place — `/etc/leuchtfeuer/env` (root:root 0600) with
   `LEUCHTFEUER_GH_PAT_AION` + `LEUCHTFEUER_GH_PAT_NOBLECAUSE`. ✅
5. **Cron:** `sudo cp cron.d-leuchtfeuer /etc/cron.d/leuchtfeuer`
6. **Smoke:** `sudo /opt/leuchtfeuer/run-collectors.sh` then check
   `/var/lib/leuchtfeuer/metrics/*/$(date -u -d yesterday +%F).json` and the github file exist.

## Deployment (Mac side — local pull)
Prereq: the VPS read-only pull user `leuchtfeuer-pull` exists with an authorized_keys **forced command**
`command="/usr/bin/rrsync -ro /var/lib/leuchtfeuer/metrics",restrict` (see "VPS side" above). Because of
rrsync the client addresses the **restricted root as `:/`**, not the absolute path.
1. Dedicated pull key: `ssh-keygen -t ed25519 -f ~/.ssh/leuchtfeuer_pull -N ""`. Add its **public** key
   (with the forced command above) to `/var/lib/leuchtfeuer-pull/.ssh/authorized_keys` on the VPS.
2. In `com.folio.leuchtfeuer-pull.plist` replace `__VPS_HOST__`, `__HOME__`, and `__RSYNC__`
   (`command -v rsync`; use rsync 3.x — macOS `/usr/bin/rsync`/openrsync is incompatible with the
   VPS `rrsync` wrapper). Then:
   `mkdir -p ~/.folio/cache && cp com.folio.leuchtfeuer-pull.plist ~/Library/LaunchAgents/ && launchctl load ~/Library/LaunchAgents/com.folio.leuchtfeuer-pull.plist`
3. Verify the immediate pull: `cat ~/.folio/cache/leuchtfeuer-pull.log` (no errors), `ls -R ~/.folio/metrics/`.
   Manual test form: `rsync -az -e "ssh -i ~/.ssh/leuchtfeuer_pull -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=15" leuchtfeuer-pull@<vps>:/ ~/.folio/metrics/`.
4. First pull populates `~/.folio/metrics/`; the Heute "Leuchtfeuer" card fills in. Until then it shows
   "Noch keine Metriken" (degradation, by design).

## Betriebsstand (VPS-seitig ausgeführt; künftige Änderungen = des Stewards sudo-Hand)
- **PAT creation + placement** — done (env file in place). ✅
- **VPS apply** (steps above) — ausgeführt, produktiv. ✅ Künftige Änderungen brauchen sudo auf dem konfigurierten VPS (CC hat keinen VPS-Zugang).
- **SSH host for the pull** — konfiguriert: Pull vom VPS über den `leuchtfeuer-pull`-User mit `rrsync`-forced-command. ✅ (kein offener Platzhalter mehr)

## Handoff to Cowork (Release-Lauf #3)
The folio card lands via the release pilot (branch `feat/leuchtfeuer`). Cowork also applies the privacy
sentences to the four Impressum/Datenschutz pages (drafts in `privacy-drafts.md`; **frag-shifu separate,
DE-only**) as part of its content cascade. Reviewer rotation (ChatGPT) per the pilot.

## 08c migration note
Built as a **normal** Heute card, no module-registry dependency. When 08c ships the registration API,
Leuchtfeuer becomes its **second** consumer (a test, not a blocker) — move `~/.folio/metrics/` access
behind the registered-module boundary then. Marked in `reader.ts` and `CardLeuchtfeuer.svelte`.
