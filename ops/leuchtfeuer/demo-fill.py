#!/usr/bin/env python3
"""
demo-fill.py — DEMO-Daten für die Leuchtfeuer-Karte (nur Sicht-Test).

Schreibt 7 Tage plausible BEISPIEL-Metriken nach ~/.folio/metrics/, damit die
Heute-Hub-Karte "Leuchtfeuer" rendert (Sparklines, Tür-Verhältnis, Stars/Views),
BEVOR die echte VPS-Pipeline steht.

⚠️  KEINE echten Daten. Nur zum Prüfen, dass der Render-Pfad funktioniert.
    Vor dem echten Pipeline-Betrieb wieder löschen:  rm -rf ~/.folio/metrics/*
    (Der echte Collector schreibt dieselben Pfade mit echten Zahlen.)

Aufruf:  python3 demo-fill.py         # füllt 7 Tage bis gestern
         python3 demo-fill.py --clear # löscht nur die Demo-Dateien wieder
"""
from __future__ import annotations
import json, os, sys, random
from datetime import date, timedelta
from pathlib import Path

SITES = ["aion-lumen.ch", "frag-shifu.ch", "noblecause.ai", "mirhamed.ch"]
REPOS = ["folio", "multi-agent-lab", "NobleCause.ai"]
ROOT = Path.home() / ".folio" / "metrics"
DAYS = 7

def clear():
    import shutil
    for sub in SITES + ["github"]:
        d = ROOT / sub
        if d.exists():
            shutil.rmtree(d)
    print(f"Demo-Metriken entfernt aus {ROOT}")

def site_day(site: str, day: str, seed: int) -> dict:
    r = random.Random(f"{site}{day}{seed}")
    visits = r.randint(20, 140)
    story = r.randint(2, 20); folio = r.randint(2, 18)
    return {
        "site": site, "date": day, "visits": visits,
        "uniques_est": int(visits * r.uniform(0.35, 0.6)),
        "top_paths": [{"path": p, "hits": r.randint(3, visits)}
                      for p in ["/", "/story", "/folio", "/impressum"]][:4],
        "door": {"story": story, "folio": folio},
        "top_referrers": [{"referrer": ref, "hits": r.randint(1, 20)}
                          for ref in ["github.com", "", "duckduckgo.com"]],
        "bots_filtered": r.randint(5, 40),
    }

def gh_day(day: str, i: int) -> dict:
    r = random.Random(f"gh{day}")
    # leicht steigende Stars über die Woche, damit die Sparkline etwas zeigt
    return {"date": day, "repos": {
        name: {"stars": base + i, "views": r.randint(4, 30),
               "views_unique": r.randint(2, 10), "clones": r.randint(0, 4),
               "clones_unique": r.randint(0, 3)}
        for name, base in zip(REPOS, (10, 3, 1))
    }}

def main():
    if "--clear" in sys.argv:
        clear(); return
    today = date.today()
    for i in range(DAYS, 0, -1):
        day = (today - timedelta(days=i)).isoformat()
        for site in SITES:
            d = ROOT / site; d.mkdir(parents=True, exist_ok=True)
            (d / f"{day}.json").write_text(json.dumps(site_day(site, day, i), ensure_ascii=False, indent=2))
        g = ROOT / "github"; g.mkdir(parents=True, exist_ok=True)
        (g / f"{day}.json").write_text(json.dumps(gh_day(day, DAYS - i), ensure_ascii=False, indent=2))
    print(f"7 Tage Demo-Metriken geschrieben nach {ROOT}")
    print("→ Heute-Hub öffnen: die Leuchtfeuer-Karte sollte jetzt leuchten.")
    print("→ Danach wieder entfernen:  python3 demo-fill.py --clear")

if __name__ == "__main__":
    main()
