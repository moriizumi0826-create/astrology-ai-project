import unittest
from datetime import date, datetime, timedelta, timezone
from unittest.mock import patch

from backend.app.schemas import ReadingRequest
from backend.app.services import reading_service as reading
from backend.v3.app import create_app
from backend.v3.horoscope import generate_horoscope
from backend.v3.preview import create_preview_app
from backend.tests.test_v3_access import local_test_client

FORM = dict(full_name="V3 integration", birth_date="1984-08-26", birth_time="19:20", birthplace="Tokyo",
            latitude=35.68, longitude=139.76, timezone_name="Asia/Tokyo", display_timezone_name="Asia/Tokyo")


class V3IntegrationTests(unittest.TestCase):
    def setUp(self):
        self.client = local_test_client(create_app(auth_mode="local_test"))

    def test_free_bootstrap_does_not_calculate_or_return_paid_dashboard(self):
        with patch.object(reading, "build_dashboard_data_from_aspects", side_effect=AssertionError("paid work")):
            response = self.client.post("/api/v3/readings", json=FORM)
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertEqual(set(data["dashboard_data"]), {"natal_points", "natal_house_cusps", "reading_date", "display_timezone_name", "master_version", "masterVersion"})
        self.assertTrue(data["readings"][0]["content"])
        self.assertTrue(data["dashboard_data"]["natal_points"])

    def test_natal_report_is_identical_to_existing_calculation(self):
        payload = ReadingRequest(**FORM)
        expected = reading.generate_readings(payload, include_deferred_widgets=False)
        actual = generate_horoscope(payload)
        self.assertEqual(actual.meta, expected.meta)
        self.assertEqual(actual.readings, expected.readings)
        self.assertEqual(actual.chart_data, expected.chart_data)
        for key in ["natal_points", "natal_house_cusps"]:
            self.assertEqual(actual.dashboard_data[key], expected.dashboard_data[key])

    def test_unknown_birth_time_uses_existing_rules(self):
        result = generate_horoscope(ReadingRequest(**{**FORM, "birth_time_unknown": True, "birth_time": None}))
        self.assertTrue(result.meta.birth_time_unknown)
        self.assertFalse(any(p["planet"] in ["ASC", "MC"] for p in result.dashboard_data["natal_points"]))

    def test_dst_confirmation_and_resolved_birth(self):
        form = {**FORM, "birth_date": "2025-11-02", "birth_time": "01:30", "timezone_name": "America/New_York"}
        rejected = self.client.post("/api/v3/readings", json=form)
        self.assertEqual(rejected.status_code, 400)
        self.assertIn("2回存在", rejected.json()["detail"])
        first = self.client.post("/api/v3/readings", json={**form, "birth_time_fold": 0}).json()
        second = self.client.post("/api/v3/readings", json={**form, "birth_time_fold": 1}).json()
        self.assertEqual(first["meta"]["timezone_offset"], -4)
        self.assertEqual(second["meta"]["timezone_offset"], -5)

    def test_paid_routes_reject_anonymous_and_free_before_calculating(self):
        for client, code in [(self.client, 401), (local_test_client(create_preview_app("free")), 403)]:
            for path in ["/paid-reading", "/readings/deferred", "/yearly-forecast", "/yearly-forecast/detail?scope=day&date=2026-09-14"]:
                with self.subTest(path=path, code=code):
                    self.assertEqual(client.post("/api/v3" + path, json=FORM).status_code, code)

    def test_paid_adapter_calls_same_service(self):
        client = local_test_client(create_preview_app("paid"))
        with patch("backend.app.main.yearly_forecast_service.generate_yearly_forecast", return_value={}), patch("backend.app.main.yearly_forecast_service.build_yearly_forecast_summary", return_value={"year": 2026}):
            result = client.post("/api/v3/yearly-forecast?year=2026", json=FORM)
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()["year"], 2026)

    def test_arbitrary_single_date_and_batch_match(self):
        request = {**FORM, "target_time": "12:00", "target_date": "2026-01-17"}
        single = self.client.post("/api/v3/transit-chart", json=request)
        batch = local_test_client(create_preview_app("paid")).post("/api/v3/transit-charts", json={**request, "target_dates": ["2026-01-17", "2026-09-14"]})
        self.assertEqual(single.status_code, 200, single.text)
        self.assertEqual(batch.status_code, 200, batch.text)
        self.assertEqual(single.json(), batch.json()["charts"][0])


if __name__ == "__main__":
    unittest.main()
