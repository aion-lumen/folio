#!/usr/bin/env python3
"""
demo-fill.py — DEMO-Daten für die Leuchtfeuer-Karte (nur Sicht-Test).

Schreibt 7 Tage plausible BEISPIEL-Metriken in einen isolierten Temp-Ordner,
damit die Heute-Hub-Karte "Leuchtfeuer" für einen Sichttest rendern kann.

⚠️  KEINE echten Daten. Der Default berührt ~/.folio/metrics ausdrücklich nicht.

Aufruf:  python3 demo-fill.py                          # isolierte UI-Vorschau im Temp-Ordner
         python3 demo-fill.py --root /tmp/lf/metrics  # isolierte UI-Vorschau
         python3 demo-fill.py --clear                 # löscht nur die Demo-Dateien wieder
"""
from __future__ import annotations
import argparse, json, random, tempfile
from datetime import date, timedelta
from pathlib import Path

SITES = ["aion-lumen.ch", "frag-shifu.ch", "noblecause.ai", "mirhamed.ch"]
REPOS = ["folio", "multi-agent-lab", "NobleCause.ai"]
DAYS = 7

def clear(root: Path):
    import shutil
    for sub in SITES + ["github"]:
        d = root / sub
        if d.exists():
            shutil.rmtree(d)
    print(f"Demo-Metriken entfernt aus {root}")

def site_day(site: str, day: str, seed: int) -> dict:
    r = random.Random(f"{site}{day}{seed}")
    visits = r.randint(20, 140)
    site_paths = {
        "aion-lumen.ch": ["/", "/story", "/folio", "/multi-agent"],
        "frag-shifu.ch": ["/", "/login", "/wiki", "/dojo"],
        "noblecause.ai": ["/", "/ratssaal", "/journal", "/en"],
        "mirhamed.ch": ["/", "/impressum", "/print"],
    }
    story = r.randint(2, 20) if site == "aion-lumen.ch" else 0
    folio = r.randint(2, 18) if site == "aion-lumen.ch" else 0
    return {
        "site": site, "date": day, "visits": visits,
        "eligibility_rule": "get-200-deployed-route-v1",
        "deployed_routes": r.randint(8, 24),
        "requests_seen": visits + 80,
        "uniques_est": int(visits * r.uniform(0.35, 0.6)),
        "top_paths": [{"path": p, "hits": r.randint(3, visits)} for p in site_paths[site]],
        "door": {"story": story, "folio": folio},
        "top_referrers": [{"referrer": ref, "hits": r.randint(1, 20)}
                          for ref in ["github.com", "", "duckduckgo.com"]],
        "excluded": {
            "total": 80, "non_get": 4, "non_200": 11,
            "missing_route": 43, "ua_bot": 22,
        },
        "bots_filtered": 22,
    }

def gh_day(day: str, _i: int) -> dict:
    r = random.Random(f"gh{day}")
    return {"date": day, "repos": {
        name: {"stars": stars, "views": r.randint(4, 30),
               "views_unique": r.randint(2, 10), "clones": r.randint(0, 4),
               "clones_unique": r.randint(0, 3)}
        for name, stars in zip(REPOS, (1, 0, 0))
    }}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--root",
        type=Path,
        default=Path(tempfile.gettempdir()) / "folio-leuchtfeuer-demo" / "metrics",
        help="isolated metrics directory (never defaults to ~/.folio/metrics)",
    )
    ap.add_argument("--clear", action="store_true")
    args = ap.parse_args()
    root = args.root.expanduser().resolve()
    if args.clear:
        clear(root); return
    today = date.today()
    for i in range(DAYS, 0, -1):
        day = (today - timedelta(days=i)).isoformat()
        for site in SITES:
            d = root / site; d.mkdir(parents=True, exist_ok=True)
            (d / f"{day}.json").write_text(json.dumps(site_day(site, day, i), ensure_ascii=False, indent=2))
        g = root / "github"; g.mkdir(parents=True, exist_ok=True)
        (g / f"{day}.json").write_text(json.dumps(gh_day(day, DAYS - i), ensure_ascii=False, indent=2))
    print(f"7 Tage Demo-Metriken geschrieben nach {root}")
    print(f"→ Vorschau starten: FOLIO_LEUCHTFEUER_METRICS_PATH={root} npm run dev")
    print("→ Danach wieder entfernen: python3 demo-fill.py --clear")

if __name__ == "__main__":
    main()
