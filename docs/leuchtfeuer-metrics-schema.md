# Leuchtfeuer — metrics schema

Site & repo metrics for the Heute-hub "Leuchtfeuer" card. **No client-side tracking** — all site
data is derived from Caddy server access logs on the VPS (0-external-calls promise stays literally
true). Aggregates only; no visitor storage. IPs anonymised at parse time, raw logs retained 7 days.

Since the hardened schema, a site visit is exactly one request that satisfies all four rules:
**GET**, **HTTP 200**, **path is a deployed page route**, and **UA is not recognised as a bot**.
Visits, uniques, top paths, referrers and the Story/System comparison all use this same eligible set.

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
  "eligibility_rule": "get-200-deployed-route-v1",
  "deployed_routes": 8,
  "requests_seen": 314,
  "visits": 123,               // requests satisfying the complete rule above
  "uniques_est": 45,           // distinct anonymised-IP + UA, best effort
  "top_paths": [{ "path": "/", "hits": 40 }],        // top 10, descending
  "door": { "story": 12, "folio": 8 },               // /story vs /folio hits (the parked door measurement)
  "top_referrers": [{ "referrer": "github.com", "hits": 15 }],  // top, descending; "" = direct
  "excluded": {
    "total": 191,
    "non_get": 2,
    "non_200": 14,
    "missing_route": 145,
    "ua_bot": 30
  },
  "bots_filtered": 30          // compatibility alias for excluded.ua_bot
}
```

Exclusion reasons are disjoint and evaluated in the displayed order. Attribution is deliberately
**first-fault**: if one request violates multiple rules, only the first matching reason is counted
(`non_get` before `non_200`, `missing_route`, then `ua_bot`). The buckets are therefore exclusive,
not independent diagnostic counters. Static sites derive routes from the HTML files in their live
site tree. Server-rendered sites use a small reviewed route
manifest under `ops/leuchtfeuer/routes/`, including optional `/*` prefix patterns for dynamic pages.

Daily files without `eligibility_rule: get-200-deployed-route-v1` are legacy aggregates. Folio keeps
them on disk but deliberately excludes them from displayed reach totals and from Story/System. This
prevents old probe-heavy values from silently mixing with the new series.

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
