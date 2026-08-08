#!/usr/bin/env python3
"""Leuchtfeuer — Caddy access-log collector (runs on the VPS, daily, per site).

Reads Caddy's JSON access log, aggregates ONE day into metrics/<site>/YYYY-MM-DD.json.
No client-side tracking: the source is server logs only. IPs are expected to be masked
already by Caddy's `filter`+`ip_mask` encoder (see caddy-logging.snippet.caddy); this
collector additionally hashes (masked-IP + UA) for the uniques estimate — it never stores
an address. Aggregate-only.

Usage:
    collect_caddy.py --site aion-lumen.ch --log /var/log/caddy/aion-lumen.log \
                     --site-root /srv/aion-lumen \
                     --out /var/lib/leuchtfeuer/metrics [--date YYYY-MM-DD]

Stdlib only (python3) — no dependency to install on the VPS. GoAccess was rejected: it
would need post-processing into this schema plus an install; the custom door measurement
(/story vs /folio) and IP-anon-at-parse are trivial here.
"""
import argparse
import hashlib
import json
import os
import sys
from collections import Counter
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

BOT_MARKERS = (
    "bot", "crawl", "spider", "slurp", "bingpreview", "facebookexternalhit",
    "embedly", "quora link preview", "pingdom", "monitor", "uptime",
    "headlesschrome", "python-requests", "curl/", "wget/", "go-http-client",
)
ELIGIBILITY_RULE = "get-200-deployed-route-v1"


def _first(v):
    """Caddy header values are arrays; take the first, else the value itself."""
    if isinstance(v, list):
        return v[0] if v else ""
    return v or ""


def is_bot(ua: str) -> bool:
    u = ua.lower()
    return any(m in u for m in BOT_MARKERS)


def _client_ip(req: dict) -> str:
    # Caddy uses remote_ip (older) or client_ip (newer). Either is already masked by ip_mask.
    return req.get("client_ip") or req.get("remote_ip") or ""


def normalize_path(uri: str) -> str:
    """Return a request path without query/fragment; never an empty path."""
    path = urlsplit(uri).path or "/"
    return path if path.startswith("/") else f"/{path}"


def routes_from_tree(site_root: str) -> set[str]:
    """Derive public page routes from HTML files in the deployed static tree."""
    root = Path(site_root)
    if not root.is_dir():
        raise ValueError(f"site root is not a directory: {site_root}")
    routes: set[str] = set()
    for html in root.rglob("*.html"):
        rel = html.relative_to(root)
        if rel.name == "index.html":
            parent = rel.parent.as_posix()
            if parent == ".":
                routes.add("/")
            else:
                route = f"/{parent}"
                routes.update((route, f"{route}/"))
        else:
            routes.add(f"/{rel.as_posix()}")
    if not routes:
        raise ValueError(f"no HTML routes found below site root: {site_root}")
    return routes


def routes_from_file(routes_file: str) -> set[str]:
    """Read exact routes or prefix patterns ending in /* for a server-rendered site."""
    try:
        lines = Path(routes_file).read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        raise ValueError(f"cannot read routes file {routes_file}: {exc}") from exc
    routes = {line.strip() for line in lines if line.strip() and not line.lstrip().startswith("#")}
    if not routes or any(not route.startswith("/") for route in routes):
        raise ValueError(f"routes file must contain at least one absolute route: {routes_file}")
    return routes


def route_is_deployed(path: str, routes: set[str]) -> bool:
    if path in routes:
        return True
    return any(route.endswith("/*") and path.startswith(route[:-1]) for route in routes)


def aggregate(records, site: str, day: str, deployed_routes: set[str]) -> dict:
    """Pure aggregation over parsed Caddy log dicts for a single day. Unit-testable."""
    visits = 0
    excluded = Counter({"non_get": 0, "non_200": 0, "missing_route": 0, "ua_bot": 0})
    uniques = set()
    paths = Counter()
    referrers = Counter()
    door = {"story": 0, "folio": 0}

    for rec in records:
        req = rec.get("request", {}) or {}
        headers = req.get("headers", {}) or {}
        method = str(req.get("method", "") or "").upper()
        if method != "GET":
            excluded["non_get"] += 1
            continue
        status = int(rec.get("status", 0) or 0)
        if status != 200:
            excluded["non_200"] += 1
            continue
        path = normalize_path(req.get("uri", "") or "")
        if not route_is_deployed(path, deployed_routes):
            excluded["missing_route"] += 1
            continue
        ua = _first(headers.get("User-Agent"))
        if is_bot(ua):
            excluded["ua_bot"] += 1
            continue
        visits += 1
        paths[path] += 1
        # Door measurement: /story vs /folio entry.
        if path == "/story" or path.startswith("/story/"):
            door["story"] += 1
        elif path == "/folio" or path.startswith("/folio/"):
            door["folio"] += 1
        # Referrer (host only, "" = direct).
        ref = _first(headers.get("Referer"))
        ref_host = ref.split("/")[2] if "://" in ref else ""
        referrers[ref_host] += 1
        # Uniques: hash(masked-ip + ua) — never stores the address.
        uniques.add(hashlib.sha256(f"{_client_ip(req)}|{ua}".encode()).hexdigest())

    return {
        "site": site,
        "date": day,
        "visits": visits,
        "uniques_est": len(uniques),
        "top_paths": [{"path": p, "hits": h} for p, h in paths.most_common(10)],
        "door": door,
        "top_referrers": [{"referrer": r, "hits": h} for r, h in referrers.most_common(10)],
        "eligibility_rule": ELIGIBILITY_RULE,
        "deployed_routes": len(deployed_routes),
        "requests_seen": len(records),
        "excluded": {**excluded, "total": sum(excluded.values())},
        # Compatibility for readers predating the structural hardening.
        "bots_filtered": excluded["ua_bot"],
    }


def _rec_day(rec) -> str:
    """UTC date of a Caddy record (ts is a float epoch)."""
    ts = rec.get("ts")
    if ts is None:
        return ""
    return datetime.fromtimestamp(float(ts), tz=timezone.utc).date().isoformat()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", required=True)
    ap.add_argument("--log", required=True, help="Caddy JSON access log path")
    ap.add_argument("--out", required=True, help="metrics output dir (NOT web-exposed)")
    ap.add_argument("--date", default=date.today().isoformat(), help="YYYY-MM-DD (UTC)")
    routes = ap.add_mutually_exclusive_group(required=True)
    routes.add_argument("--site-root", help="deployed static site tree; HTML files define routes")
    routes.add_argument("--routes-file", help="route manifest for a server-rendered site")
    args = ap.parse_args()

    try:
        deployed_routes = (
            routes_from_tree(args.site_root)
            if args.site_root
            else routes_from_file(args.routes_file)
        )
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    records = []
    try:
        with open(args.log, "r", encoding="utf-8", errors="replace") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if rec.get("logger", "").startswith("http.log.access") or "request" in rec:
                    if _rec_day(rec) == args.date:
                        records.append(rec)
    except FileNotFoundError:
        print(f"log not found: {args.log}", file=sys.stderr)
        return 1

    agg = aggregate(records, args.site, args.date, deployed_routes)
    out_dir = os.path.join(args.out, args.site)
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"{args.date}.json")
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(agg, fh, ensure_ascii=False, indent=2)
    print(f"wrote {out_path}: {agg['visits']} verified visits, {agg['uniques_est']} uniques, "
          f"{agg['excluded']['total']} requests excluded")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
