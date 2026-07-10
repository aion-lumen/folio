#!/usr/bin/env python3
"""Leuchtfeuer — Caddy access-log collector (runs on the VPS, daily, per site).

Reads Caddy's JSON access log, aggregates ONE day into metrics/<site>/YYYY-MM-DD.json.
No client-side tracking: the source is server logs only. IPs are expected to be masked
already by Caddy's `filter`+`ip_mask` encoder (see caddy-logging.snippet.caddy); this
collector additionally hashes (masked-IP + UA) for the uniques estimate — it never stores
an address. Aggregate-only.

Usage:
    collect_caddy.py --site aion-lumen.ch --log /var/log/caddy/aion-lumen.log \
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

BOT_MARKERS = (
    "bot", "crawl", "spider", "slurp", "bingpreview", "facebookexternalhit",
    "embedly", "quora link preview", "pingdom", "monitor", "uptime",
    "headlesschrome", "python-requests", "curl/", "wget/", "go-http-client",
)


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


def _is_page(uri: str, status: int) -> bool:
    """Count human page views: 2xx/3xx, not an asset request."""
    if status >= 400:
        return False
    path = uri.split("?", 1)[0]
    asset = (".css", ".js", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".ico",
             ".woff", ".woff2", ".ttf", ".map", ".xml", ".txt", ".json")
    return not path.endswith(asset)


def aggregate(records, site: str, day: str) -> dict:
    """Pure aggregation over parsed Caddy log dicts for a single day. Unit-testable."""
    visits = 0
    bots_filtered = 0
    uniques = set()
    paths = Counter()
    referrers = Counter()
    door = {"story": 0, "folio": 0}

    for rec in records:
        req = rec.get("request", {}) or {}
        headers = req.get("headers", {}) or {}
        ua = _first(headers.get("User-Agent"))
        if is_bot(ua):
            bots_filtered += 1
            continue
        status = int(rec.get("status", 0) or 0)
        uri = req.get("uri", "") or ""
        if not _is_page(uri, status):
            continue
        path = uri.split("?", 1)[0]
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
        "bots_filtered": bots_filtered,
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
    args = ap.parse_args()

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

    agg = aggregate(records, args.site, args.date)
    out_dir = os.path.join(args.out, args.site)
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"{args.date}.json")
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(agg, fh, ensure_ascii=False, indent=2)
    print(f"wrote {out_path}: {agg['visits']} visits, {agg['uniques_est']} uniques, "
          f"{agg['bots_filtered']} bots filtered")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
