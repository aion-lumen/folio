#!/usr/bin/env python3
"""Unit tests for the Caddy collector's pure aggregation. Run: python3 -m unittest -v"""
import unittest

from collect_caddy import aggregate, is_bot


def rec(uri, ua="Mozilla/5.0", status=200, ip="1.2.3.0", ref=""):
    return {
        "request": {
            "uri": uri,
            "client_ip": ip,
            "headers": {"User-Agent": [ua], "Referer": [ref] if ref else []},
        },
        "status": status,
    }


class TestAggregate(unittest.TestCase):
    def test_bot_filter(self):
        self.assertTrue(is_bot("Googlebot/2.1"))
        self.assertTrue(is_bot("python-requests/2.31"))
        self.assertFalse(is_bot("Mozilla/5.0 (Macintosh)"))

    def test_visits_exclude_assets_and_bots(self):
        recs = [
            rec("/"),
            rec("/app.css"),                 # asset → excluded
            rec("/", ua="Googlebot/2.1"),    # bot → excluded + counted
            rec("/folio", status=404),       # error → excluded
        ]
        a = aggregate(recs, "aion-lumen.ch", "2026-07-10")
        self.assertEqual(a["visits"], 1)
        self.assertEqual(a["bots_filtered"], 1)

    def test_door_measurement(self):
        recs = [rec("/story"), rec("/story/plate-1"), rec("/folio"), rec("/")]
        a = aggregate(recs, "aion-lumen.ch", "2026-07-10")
        self.assertEqual(a["door"], {"story": 2, "folio": 1})

    def test_top_paths_and_referrers(self):
        recs = [rec("/"), rec("/"), rec("/folio", ref="https://github.com/x")]
        a = aggregate(recs, "aion-lumen.ch", "2026-07-10")
        self.assertEqual(a["top_paths"][0], {"path": "/", "hits": 2})
        refs = {r["referrer"]: r["hits"] for r in a["top_referrers"]}
        self.assertEqual(refs.get("github.com"), 1)
        self.assertEqual(refs.get(""), 2)  # direct

    def test_uniques_hashed_not_stored(self):
        # same ip+ua → 1 unique; different ua → 2
        recs = [rec("/", ip="1.2.3.0"), rec("/x", ip="1.2.3.0"),
                rec("/", ip="1.2.3.0", ua="Mozilla/5.0 (Windows)")]
        a = aggregate(recs, "aion-lumen.ch", "2026-07-10")
        self.assertEqual(a["uniques_est"], 2)
        # no raw address anywhere in the output
        self.assertNotIn("1.2.3.0", str(a))


if __name__ == "__main__":
    unittest.main()
