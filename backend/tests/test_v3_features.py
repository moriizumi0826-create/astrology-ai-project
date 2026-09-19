import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from zoneinfo import ZoneInfo

from backend.tests.test_v3_access import local_test_client
from backend.tests.test_v3_integration import FORM
from backend.v3.access import AccessContext, get_access_context
from backend.v3.app import create_app


class FeatureBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(auth_mode="local_test")
        self.client = local_test_client(self.app)
        self.now = datetime(2026, 9, 14, 0, 30, tzinfo=timezone.utc)
        self.clock = patch("backend.v3.access.datetime")
        clock = self.clock.start()
        clock.now.return_value = self.now
        self.addCleanup(self.clock.stop)

    def context(self, context):
        self.app.dependency_overrides[get_access_context] = lambda: context

    def batch(self, dates, zone="Asia/Tokyo", **extra):
        return self.client.post("/api/v3/transit-charts", json={**FORM, "target_time": "12:00", "display_timezone_name": zone, "target_dates": dates, **extra})

    def test_free_inclusive_bounds_follow_server_now_in_display_region(self):
        for context in [AccessContext(), AccessContext("member"), AccessContext("member", "active", self.now - timedelta(seconds=1))]:
            self.context(context)
            for zone in ["Asia/Tokyo", "America/Los_Angeles", "Pacific/Kiritimati"]:
                today = self.now.astimezone(ZoneInfo(zone)).date()
                dates = [(today + timedelta(days=i)).isoformat() for i in range(-15, 16)]
                with patch("backend.v3.routes.legacy.create_transit_charts", return_value={"charts": []}) as calculate:
                    self.assertEqual(self.batch(dates, zone).status_code, 200)
                    calculate.assert_called_once()
                for distance in [-16, 16]:
                    with patch("backend.v3.routes.legacy.create_transit_charts") as calculate:
                        response = self.batch([dates[0], (today + timedelta(days=distance)).isoformat()], zone,
                                              target_date="2000-01-01", today="2000-01-01", plan="paid")
                        self.assertEqual(response.status_code, 403, response.text)
                        calculate.assert_not_called()

    def test_dst_window_counts_calendar_dates_not_hours(self):
        self.now = datetime(2026, 11, 1, 6, 30, tzinfo=timezone.utc)
        with patch("backend.v3.access.datetime") as clock, patch("backend.v3.routes.legacy.create_transit_charts", return_value={}):
            clock.now.return_value = self.now
            self.assertEqual(self.batch(["2026-10-17", "2026-11-16"], "America/New_York").status_code, 200)
            self.assertEqual(self.batch(["2026-11-17"], "America/New_York").status_code, 403)

    def test_paid_range_and_single_date_are_preserved(self):
        self.context(AccessContext("member", "active", self.now + timedelta(days=1)))
        with patch("backend.v3.routes.legacy.create_transit_charts", return_value={"charts": []}):
            self.assertEqual(self.batch(["2000-01-01", "2027-09-14"]).status_code, 200)
        self.context(AccessContext())
        response = self.client.post("/api/v3/transit-chart", json={**FORM, "target_date": "2026-01-17", "target_time": "12:00"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["date"], "2026-01-17")

    def test_invalid_zone_is_rejected_before_calculation(self):
        with patch("backend.v3.routes.legacy.create_transit_charts") as calculate:
            self.assertEqual(self.batch(["2026-09-14"], "Invalid/Zone").status_code, 422)
            calculate.assert_not_called()

    def test_unverified_entitlement_never_unlocks_paid_endpoints(self):
        for state in ["checking", "unavailable"]:
            self.context(AccessContext("member", state))
            self.assertEqual(self.batch(["2000-01-01"]).status_code, 403)
            for route in ["paid-reading", "readings/deferred", "yearly-forecast", "yearly-forecast/detail"]:
                self.assertEqual(self.client.post("/api/v3/" + route, json=FORM).status_code, 503)

    def test_free_interpretation_catalog_is_unchanged(self):
        response = self.client.get("/api/v3/aspect-interpretations")
        self.assertEqual(response.status_code, 200)
        for key, count in [("natalNatal", 396), ("transitTransit", 270), ("transitNatal", 720)]:
            self.assertEqual(len(response.json()[key]), count)


if __name__ == "__main__":
    unittest.main()
