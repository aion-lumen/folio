#!/usr/bin/env python3
"""Unit tests for the Caddy collector's pure aggregation. Run: python3 -m unittest -v"""
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from collect_caddy import aggregate, is_bot, route_is_deployed, routes_from_tree


def rec(uri, ua="Mozilla/5.0", status=200, ip="1.2.3.0", ref="", method="GET"):
    return {
        "request": {
            "uri": uri,
            "method": method,
            "client_ip": ip,
            "headers": {"User-Agent": [ua], "Referer": [ref] if ref else []},
        },
        "status": status,
    }


class TestAggregate(unittest.TestCase):
    routes = {"/", "/story", "/story/", "/folio", "/folio/", "/x", "/wiki/*"}

    def test_bot_filter(self):
        self.assertTrue(is_bot("Googlebot/2.1"))
        self.assertTrue(is_bot("python-requests/2.31"))
        self.assertFalse(is_bot("Mozilla/5.0 (Macintosh)"))

    def test_only_get_200_deployed_routes_count(self):
        recs = [
            rec("/"),
            rec("/app.css"),                 # no deployed page route
            rec("/", ua="Googlebot/2.1"),   # known route, bot
            rec("/folio", status=404),       # known route, wrong status
            rec("/folio", method="POST"),   # known route, wrong method
            rec("/folio", method="POST", ua="Googlebot/2.1"),  # first-fault: non_get
        ]
        a = aggregate(recs, "aion-lumen.ch", "2026-07-10", self.routes)
        self.assertEqual(a["visits"], 1)
        self.assertEqual(a["bots_filtered"], 1)
        self.assertEqual(a["excluded"], {
            "non_get": 2, "non_200": 1, "missing_route": 1, "ua_bot": 1, "total": 5,
        })
        self.assertEqual(a["eligibility_rule"], "get-200-deployed-route-v1")

    def test_door_measurement(self):
        recs = [rec("/story"), rec("/story/"), rec("/folio"), rec("/")]
        a = aggregate(recs, "aion-lumen.ch", "2026-07-10", self.routes)
        self.assertEqual(a["door"], {"story": 2, "folio": 1})

    def test_top_paths_and_referrers(self):
        recs = [rec("/"), rec("/"), rec("/folio", ref="https://github.com/x")]
        a = aggregate(recs, "aion-lumen.ch", "2026-07-10", self.routes)
        self.assertEqual(a["top_paths"][0], {"path": "/", "hits": 2})
        refs = {r["referrer"]: r["hits"] for r in a["top_referrers"]}
        self.assertEqual(refs.get("github.com"), 1)
        self.assertEqual(refs.get(""), 2)  # direct

    def test_uniques_hashed_not_stored(self):
        # same ip+ua → 1 unique; different ua → 2
        recs = [rec("/", ip="1.2.3.0"), rec("/x", ip="1.2.3.0"),
                rec("/", ip="1.2.3.0", ua="Mozilla/5.0 (Windows)")]
        a = aggregate(recs, "aion-lumen.ch", "2026-07-10", self.routes)
        self.assertEqual(a["uniques_est"], 2)
        # no raw address anywhere in the output
        self.assertNotIn("1.2.3.0", str(a))

    def test_routes_come_from_deployed_html_tree(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "index.html").write_text("", encoding="utf-8")
            (root / "story").mkdir()
            (root / "story" / "index.html").write_text("", encoding="utf-8")
            (root / "legacy.html").write_text("", encoding="utf-8")
            routes = routes_from_tree(tmp)
        self.assertEqual(routes, {"/", "/story", "/story/", "/legacy.html"})

    def test_dynamic_route_prefix_manifest(self):
        self.assertTrue(route_is_deployed("/wiki/42", self.routes))
        self.assertFalse(route_is_deployed("/api/health", self.routes))


if __name__ == "__main__":
    unittest.main()
