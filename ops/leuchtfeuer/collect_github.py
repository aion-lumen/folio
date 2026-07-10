#!/usr/bin/env python3
"""Leuchtfeuer — GitHub API snapshot (runs on the VPS, daily).

Persists stars + traffic (views/clones, unique) for the tracked repos into
metrics/github/YYYY-MM-DD.json. The Traffic API only returns 14 days retroactively, so
daily persistence is the whole point — we store the latest COMPLETE day so history
accumulates without overlap.

Credentials: read ONLY from environment variables by name. No token is stored in this
file, in the repo, or in any command. If a token env var is missing, the repo is skipped
with a warning (report, do not fetch a token). PATs need Administration:Read (traffic) +
Metadata:Read (stars) on the listed repos only.

Env (placed by the operator, e.g. /etc/leuchtfeuer/env, sourced by the cron):
    LEUCHTFEUER_GH_PAT_AION         → aion-lumen/folio, aion-lumen/multi-agent-lab
    LEUCHTFEUER_GH_PAT_NOBLECAUSE   → noblecause-ai/NobleCause.ai

Usage: collect_github.py --out /var/lib/leuchtfeuer/metrics [--date YYYY-MM-DD]
Stdlib only.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timezone

# repo full name → env var NAME holding the PAT for that repo's owner (names only, never values)
REPOS = {
    "aion-lumen/folio": "LEUCHTFEUER_GH_PAT_AION",
    "aion-lumen/multi-agent-lab": "LEUCHTFEUER_GH_PAT_AION",
    "noblecause-ai/NobleCause.ai": "LEUCHTFEUER_GH_PAT_NOBLECAUSE",
}
API = "https://api.github.com"


def _get(url: str, token: str) -> dict:
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "leuchtfeuer-collector",
        },
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))


def latest_complete_day(per_day, today: str) -> dict:
    """Pick the most recent traffic day strictly before `today` (complete). Pure/testable.
    per_day: list of {"timestamp": "...T00:00:00Z", "count": N, "uniques": M}."""
    best = None
    for d in per_day or []:
        day = str(d.get("timestamp", ""))[:10]
        if day and day < today and (best is None or day > best[0]):
            best = (day, int(d.get("count", 0)), int(d.get("uniques", 0)))
    return {"count": best[1], "uniques": best[2]} if best else {"count": 0, "uniques": 0}


def collect_repo(full: str, token: str, today: str) -> dict:
    repo = _get(f"{API}/repos/{full}", token)
    stars = int(repo.get("stargazers_count", 0))
    views = latest_complete_day(_get(f"{API}/repos/{full}/traffic/views", token).get("views"), today)
    clones = latest_complete_day(_get(f"{API}/repos/{full}/traffic/clones", token).get("clones"), today)
    return {
        "stars": stars,
        "views": views["count"],
        "views_unique": views["uniques"],
        "clones": clones["count"],
        "clones_unique": clones["uniques"],
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--date", default=datetime.now(timezone.utc).date().isoformat())
    args = ap.parse_args()

    repos = {}
    for full, env_name in REPOS.items():
        token = os.environ.get(env_name)
        short = full.split("/", 1)[1]
        if not token:
            print(f"skip {full}: env {env_name} not set (report, do not fetch)", file=sys.stderr)
            continue
        try:
            repos[short] = collect_repo(full, token, args.date)
        except urllib.error.HTTPError as e:
            print(f"skip {full}: HTTP {e.code} {e.reason}", file=sys.stderr)
        except Exception as e:  # noqa: BLE001 — best-effort daily job, never crash the cron
            print(f"skip {full}: {e}", file=sys.stderr)

    if not repos:
        print("no repos collected (missing tokens or all failed)", file=sys.stderr)
        return 1

    out_dir = os.path.join(args.out, "github")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"{args.date}.json")
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump({"date": args.date, "repos": repos}, fh, ensure_ascii=False, indent=2)
    print(f"wrote {out_path}: {len(repos)} repos")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
