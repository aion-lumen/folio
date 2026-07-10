#!/usr/bin/env python3
"""Unit tests for the GitHub collector's pure helper. Run: python3 -m unittest -v"""
import unittest

from collect_github import latest_complete_day


class TestLatestCompleteDay(unittest.TestCase):
    def test_picks_most_recent_day_before_today(self):
        per_day = [
            {"timestamp": "2026-07-08T00:00:00Z", "count": 10, "uniques": 4},
            {"timestamp": "2026-07-09T00:00:00Z", "count": 15, "uniques": 6},
            {"timestamp": "2026-07-10T00:00:00Z", "count": 3, "uniques": 1},  # today → incomplete, skip
        ]
        self.assertEqual(latest_complete_day(per_day, "2026-07-10"), {"count": 15, "uniques": 6})

    def test_empty_or_none(self):
        self.assertEqual(latest_complete_day([], "2026-07-10"), {"count": 0, "uniques": 0})
        self.assertEqual(latest_complete_day(None, "2026-07-10"), {"count": 0, "uniques": 0})


if __name__ == "__main__":
    unittest.main()
