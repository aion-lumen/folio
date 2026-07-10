# Leuchtfeuer — ops & deployment

Site + repo metrics for the Folio Heute-hub, from **server logs only** — no client-side tracking, no
cookies, no external analytics. The 0-external-calls promise of the sites stays literally true.

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

## Deployment (Afschin — VPS side; CC has no VPS access, the SSH host alias is a placeholder)
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
1. Fill the SSH host in `com.folio.leuchtfeuer-pull.plist` (`METRICS_HOST` → a key/user that can read
   `/var/lib/leuchtfeuer/metrics/`) and replace `__HOME__` with your home path.
2. `cp com.folio.leuchtfeuer-pull.plist ~/Library/LaunchAgents/ && launchctl load ~/Library/LaunchAgents/com.folio.leuchtfeuer-pull.plist`
3. First pull populates `~/.folio/metrics/`; the Heute "Leuchtfeuer" card fills in. Until then it shows
   "Noch keine Metriken" (degradation, by design).

## Blocked on Afschin (CC does not do these)
- **PAT creation + placement** — done (env file in place). ✅
- **VPS apply** (steps above) — needs sudo on `185.143.100.222`; CC has no VPS access.
- **SSH host for the pull** — the `aionlumen-deploy` alias is a placeholder; fill a real host.

## Handoff to Cowork (Release-Lauf #3)
The folio card lands via the release pilot (branch `feat/leuchtfeuer`). Cowork also applies the privacy
sentences to the four Impressum/Datenschutz pages (drafts in `privacy-drafts.md`; **frag-shifu separate,
DE-only**) as part of its content cascade. Reviewer rotation (ChatGPT) per the pilot.

## 08c migration note
Built as a **normal** Heute card, no module-registry dependency. When 08c ships the registration API,
Leuchtfeuer becomes its **second** consumer (a test, not a blocker) — move `~/.folio/metrics/` access
behind the registered-module boundary then. Marked in `reader.ts` and `CardLeuchtfeuer.svelte`.
