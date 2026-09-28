import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import patch
from zoneinfo import ZoneInfo

from fastapi import HTTPException

from backend.tests.test_v3_access import local_test_client
from backend.tests.test_v3_integration import FORM
from backend.v3.access import AccessContext, get_access_context
from backend.v3.app import create_app
from backend.v3.preview import create_preview_app
from backend.v3.rate_limit import SlidingWindowLimiter, rate_limit_subject


class RateLimitTests(unittest.TestCase):
    def test_sliding_minute_and_hour_windows(self):
        now = [0.0]
        limiter = SlidingWindowLimiter(clock=lambda: now[0])
        for minute in range(6):
            now[0] = minute * 61.0
            for _ in range(4):
                limiter.check("year", "user:member")
        with self.assertRaises(HTTPException) as blocked:
            limiter.check("year", "user:member")
        self.assertEqual(blocked.exception.status_code, 429)
        self.assertEqual(blocked.exception.headers["Retry-After"], "3295")
        now[0] = 3600.0
        limiter.check("year", "user:member")

    def test_render_client_header_is_used_only_in_public_environment(self):
        request = SimpleNamespace(
            app=SimpleNamespace(state=SimpleNamespace(v3_environment="production")),
            headers={"cf-connecting-ip": "203.0.113.12", "x-forwarded-for": "198.51.100.9"},
            client=SimpleNamespace(host="10.0.0.1"),
        )
        self.assertEqual(rate_limit_subject(request), "ip:203.0.113.12")
        self.assertEqual(rate_limit_subject(request, "verified-member"), "user:verified-member")
        request.app.state.v3_environment = "local"
        self.assertEqual(rate_limit_subject(request), "ip:10.0.0.1")
        request.app.state.v3_environment = "production"
        request.headers["cf-connecting-ip"] = "not-an-ip"
        self.assertEqual(rate_limit_subject(request), "ip:10.0.0.1")

    def test_month_and_year_batches_have_separate_limits(self):
        app = create_preview_app("paid")
        client = local_test_client(app)
        first = datetime(2026, 1, 1, tzinfo=timezone.utc).date()
        payload = {**FORM, "target_time": "12:00"}
        with patch("backend.v3.routes.legacy.create_transit_charts", return_value={"charts": []}) as calculate:
            for length, allowance in [(31, 12), (32, 4)]:
                dates = [(first + timedelta(days=offset)).isoformat() for offset in range(length)]
                for _ in range(allowance):
                    result = client.post("/api/v3/transit-charts", json={**payload, "target_dates": dates})
                    self.assertEqual(result.status_code, 200, result.text)
                rejected = client.post("/api/v3/transit-charts", json={**payload, "target_dates": dates})
                self.assertEqual(rejected.status_code, 429, rejected.text)
                self.assertEqual(rejected.headers["retry-after"], "60")
                self.assertIn("少し待って", rejected.json()["detail"])
            self.assertEqual(calculate.call_count, 16)

    def test_anonymous_batch_limit_is_separate_by_client_ip(self):
        app = create_app(auth_mode="local_test")
        today = datetime.now(ZoneInfo("Asia/Tokyo")).date().isoformat()
        payload = {**FORM, "target_dates": [today], "target_time": "12:00"}
        with patch("backend.v3.routes.legacy.create_transit_charts", return_value={"charts": []}):
            first = local_test_client(app, "127.0.0.1")
            second = local_test_client(app, "127.0.0.2")
            for _ in range(12):
                self.assertEqual(first.post("/api/v3/transit-charts", json=payload).status_code, 200)
            self.assertEqual(first.post("/api/v3/transit-charts", json=payload).status_code, 429)
            self.assertEqual(second.post("/api/v3/transit-charts", json=payload).status_code, 200)

    def test_paid_batch_limit_uses_account_across_ips(self):
        app = create_app(auth_mode="local_test")
        member = ["alice"]
        app.dependency_overrides[get_access_context] = lambda: AccessContext(
            member[0], "active", datetime.now(timezone.utc) + timedelta(days=1))
        first = local_test_client(app, "127.0.0.1")
        second = local_test_client(app, "127.0.0.2")
        dates = [(datetime(2026, 1, 1).date() + timedelta(days=offset)).isoformat() for offset in range(32)]
        payload = {**FORM, "target_dates": dates, "target_time": "12:00"}
        with patch("backend.v3.routes.legacy.create_transit_charts", return_value={"charts": []}):
            for _ in range(4):
                self.assertEqual(first.post("/api/v3/transit-charts", json=payload).status_code, 200)
            self.assertEqual(second.post("/api/v3/transit-charts", json=payload).status_code, 429)
            member[0] = "bob"
            self.assertEqual(first.post("/api/v3/transit-charts", json=payload).status_code, 200)

    def test_location_and_single_date_limits_do_not_affect_health(self):
        app = create_app(auth_mode="local_test")
        client = local_test_client(app)
        with patch("backend.v3.routes.search_locations", return_value=[]):
            for _ in range(30):
                self.assertEqual(client.post("/api/v3/location-search", json={"q": "Tokyo"}).status_code, 200)
            self.assertEqual(client.post("/api/v3/location-search", json={"q": "Tokyo"}).status_code, 429)
        with patch("backend.v3.routes.legacy.create_transit_chart", return_value={"date": "2026-09-28"}):
            for _ in range(60):
                self.assertEqual(client.post("/api/v3/transit-chart", json={**FORM, "target_time": "12:00", "target_date": "2026-09-28"}).status_code, 200)
            self.assertEqual(client.post("/api/v3/transit-chart", json={**FORM, "target_time": "12:00", "target_date": "2026-09-28"}).status_code, 429)
        self.assertEqual(client.get("/api/v3/health").status_code, 200)


if __name__ == "__main__":
    unittest.main()
