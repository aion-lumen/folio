# Field note — Leuchtfeuer (server-log metrics), 2026-07-10

Building site/repo metrics into Folio without breaking the "0 external calls" brand promise. Four
transferable lessons.

## 1. A brand promise constrains the architecture, not just the copy
"No external calls / no client-side tracking" is a *marketing* claim on the sites. That makes it a hard
architectural constraint: no JS snippet, no cookies, no Umami/Plausible/Matomo (not even self-hosted).
The only honest source is the server's own access logs. Everything downstream (Python collector, daily
aggregate, folio card) follows from refusing to add a single client-side byte. When a promise is on the
tin, treat it as a spec, not a preference.

## 2. Anonymise at the earliest layer — and keep aggregates out of the webroot
Two separate traps:
- **IP anonymisation belongs in Caddy** (`filter` + `ip_mask`, last octet / IPv6 /48), so the raw
  address is never written to disk — not "we'll strip it when parsing". Defense in depth: the collector
  also only ever hashes `(masked-ip + UA)` for the uniques estimate, never stores an address.
- **Visitor aggregates must not live under the web root.** The reflex is to drop `metrics/` next to the
  site (and the directive even said "add it to the deploy rsync whitelist"). But `/srv/aion-lumen/metrics`
  would be **publicly fetchable**. Chosen instead: a private `/var/lib/leuchtfeuer/metrics/` pulled over
  SSH — so the deploy whitelist is deliberately *not* involved. Flagged the divergence rather than
  following the instruction into a leak.

## 3. The credentials boundary is a hard line the engineer does not cross
CC creates no tokens and places none. The PAT was created by Afschin, stored in his password manager,
and placed on the VPS by his hand; the code references only the env-var **names**
(`LEUCHTFEUER_GH_PAT_AION`, `LEUCHTFEUER_GH_PAT_NOBLECAUSE`). Placement guidance mattered too:
`install -m 600 /dev/null` + paste in an editor — never `echo "TOKEN=…" >>`, which leaks into shell
history and is briefly visible in `ps`. GitHub's Traffic API needs `Administration:Read`, which forced
fine-grained tokens per org (two owners → two tokens) — minimal scope beats one broad classic `repo`.

## 4. Degradation is a feature when the source is expected to be absent
The VPS can be offline, a pull can be missed. The card shows the **last available state with its date**,
never a spinner or an error. The reader reports `generatedFrom` + `stale`; the default (no metrics yet)
is a clean "Noch keine Metriken". Build the empty/stale path first — it is the state the card ships in.

## Boundary respected
CC has no VPS access (the SSH host alias is a placeholder) — so everything VPS-side is delivered as
**artifacts** (collectors, Caddy snippet, cron, launchd plist, README) for Afschin to apply, not applied
by CC. The folio card is the only part that lands through code review + the release pilot.
