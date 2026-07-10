# Leuchtfeuer — metrics schema

Site & repo metrics for the Heute-hub "Leuchtfeuer" card. **No client-side tracking** — all site
data is derived from Caddy server access logs on the VPS (0-external-calls promise stays literally
true). Aggregates only; no visitor storage. IPs anonymised at parse time, raw logs retained 7 days.

## Layout
```
~/.folio/metrics/
  <site>/YYYY-MM-DD.json        # one daily aggregate per site (Caddy-log collector)
  github/YYYY-MM-DD.json        # one daily snapshot for all repos (GitHub API collector)
```
`<site>` ∈ `aion-lumen.ch`, `frag-shifu.ch`, `noblecause.ai`, `mirhamed.ch`.

The Mac pulls these daily from the VPS via rsync over SSH (local launchd/cron; never a push from the
VPS into the Mac). The card reads `~/.folio/metrics/` read-only.

## Site daily aggregate — `<site>/YYYY-MM-DD.json`
```json
{
  "site": "aion-lumen.ch",
  "date": "2026-07-10",
  "visits": 123,               // non-bot requests to HTML pages
  "uniques_est": 45,           // distinct anonymised-IP + UA, best effort
  "top_paths": [{ "path": "/", "hits": 40 }],        // top 10, descending
  "door": { "story": 12, "folio": 8 },               // /story vs /folio hits (the parked door measurement)
  "top_referrers": [{ "referrer": "github.com", "hits": 15 }],  // top, descending; "" = direct
  "bots_filtered": 30          // requests dropped by the UA bot filter (transparency)
}
```

## GitHub daily snapshot — `github/YYYY-MM-DD.json`
Traffic API only returns 14 days retroactively → daily persistence is the whole point.
```json
{
  "date": "2026-07-10",
  "repos": {
    "folio":            { "stars": 12, "views": 30, "views_unique": 8, "clones": 3, "clones_unique": 2 },
    "multi-agent-lab":  { "stars": 4,  "views": 10, "views_unique": 3, "clones": 1, "clones_unique": 1 },
    "NobleCause.ai":    { "stars": 1,  "views": 5,  "views_unique": 2, "clones": 0, "clones_unique": 0 }
  }
}
```

## Degradation
Missing files (VPS offline, pull missed) are not an error: the card shows the **last available state
with its date**, never a spinner. The reader reports `generatedFrom` (latest date present) and `stale`
(latest older than yesterday, or nothing present).
