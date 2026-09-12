import csv
import hashlib
import json
import os
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, time, timedelta
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.services import transit_ephemeris as cache
from backend.app.services import yearly_forecast_service as forecast
from backend.app.services.chart_calculator import BirthInput


PAYLOAD = dict(full_name="Cache test", birth_date="1990-01-01", birth_time="12:00",
               birthplace="Tokyo", latitude=35.6762, longitude=139.6503, timezone_offset=9,
               target_time="12:00")
BIRTH = BirthInput("Cache test", "1990-01-01", "12:00", False, "Tokyo", 35.6762, 139.6503, 9)


@unittest.skipIf(cache.swe is None, "pyswisseph is required")
class EphemerisTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {"TRANSIT_EPHEMERIS_CACHE_ENABLED": "1"})
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_full_year_exact_values_and_continuity(self):
        rows = cache.load_hourly_cache()
        self.assertEqual(len(rows), 8760)
        self.assertEqual(min(rows), datetime(2026, 1, 1))
        self.assertEqual(max(rows), datetime(2026, 12, 31, 23))
        for stamp, values in rows.items():
            for index, planet_id in enumerate(cache.planet_ids()):
                result, _ = cache.swe.calc_ut(cache.julian_day(stamp), planet_id, cache.swe.FLG_SPEED)
                self.assertAlmostEqual(values[index * 2], result[0] % 360, places=10)
                self.assertAlmostEqual(values[index * 2 + 1], result[3], places=10)

    def test_chart_matches_direct_including_houses_nodes_and_angles(self):
        for offset, latitude, longitude in [(9, 35.6762, 139.6503), (-5, 40.7, -74), (5.5, 28.6, 77.2)]:
            birth = BirthInput("Test", "1990-01-01", "12:00", False, "Test", latitude, longitude, offset)
            for day in (date(2025, 12, 31), date(2026, 1, 1), date(2026, 3, 20), date(2026, 7, 1), date(2026, 12, 31), date(2027, 1, 1)):
                for selected_time in (time(0), time(12), time(12, 10), time(12, 30), time(23, 50)):
                    with self.subTest(day=day, time=selected_time, offset=offset):
                        actual = forecast.build_transit_chart(birth, day, selected_time)
                        with patch.dict(os.environ, {"TRANSIT_EPHEMERIS_CACHE_ENABLED": "0"}):
                            expected = forecast.build_transit_chart(birth, day, selected_time)
                        self.assertEqual(actual, expected)

    def test_hour_cache_removes_planet_calls_but_keeps_house_calculation(self):
        cache.load_hourly_cache()
        with patch.object(forecast.swe, "calc_ut", wraps=forecast.swe.calc_ut) as planets, patch.object(forecast.swe, "houses", wraps=forecast.swe.houses) as houses:
            for day in range(1, 31):
                forecast.build_transit_chart(BIRTH, date(2026, 9, day), time(12))
            self.assertEqual(planets.call_count, 0)
            self.assertEqual(houses.call_count, 30)

    def test_fallback_does_not_round_time_or_year(self):
        for day, selected_time in [(date(2025, 9, 17), time(12)), (date(2027, 9, 17), time(12)), (date(2026, 9, 17), time(12, 10)), (date(2026, 1, 1), time(0))]:
            with patch.object(forecast.swe, "calc_ut", wraps=forecast.swe.calc_ut) as planets:
                forecast.build_transit_chart(BIRTH, day, selected_time)
                self.assertEqual(planets.call_count, 11)

    def test_utc_offsets(self):
        self.assertEqual(cache.cached_states(datetime(2026, 1, 1, 9), 9), cache.load_hourly_cache()[datetime(2026, 1, 1)])
        self.assertIsNone(cache.cached_states(datetime(2026, 1, 1), 9))
        self.assertIsNone(cache.cached_states(datetime(2026, 9, 1, 12), 5.5))
        self.assertIsNotNone(cache.cached_states(datetime(2026, 9, 1, 12, 30), 5.5))

    def test_missing_and_corrupt_cache_fall_back(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(cache, "DATA_DIR", Path(directory)):
            path = Path(directory) / "transit_hourly_2026.csv"
            for content in (None, b"bad data"):
                cache.load_hourly_cache.cache_clear()
                if content is not None:
                    path.write_bytes(content)
                    path.with_suffix(".json").write_text(json.dumps({"schema_version": 1, "swisseph_version": cache.swe.version, "sha256": hashlib.sha256(content).hexdigest()}))
                self.assertEqual(cache.load_hourly_cache(), {})
                with patch.object(forecast.swe, "calc_ut", wraps=forecast.swe.calc_ut) as planets:
                    forecast.build_transit_chart(BIRTH, date(2026, 9, 1), time(12))
                    self.assertEqual(planets.call_count, 11)
        cache.load_hourly_cache.cache_clear()

    def test_incompatible_engine_falls_back(self):
        cache.load_hourly_cache.cache_clear()
        result = list(cache.swe.calc_ut(cache.julian_day(datetime(2026, 1, 1)), cache.swe.SUN, cache.swe.FLG_SPEED))
        result[1] = -1
        with patch.object(cache.swe, "calc_ut", return_value=tuple(result)):
            self.assertEqual(cache.load_hourly_cache(), {})
        cache.load_hourly_cache.cache_clear()

    def test_parallel_readers_do_not_mutate_cached_states(self):
        cache.load_hourly_cache()
        def chart(_):
            return forecast.build_transit_chart(BIRTH, date(2026, 9, 17), time(12))
        expected = chart(0)
        with ThreadPoolExecutor(max_workers=8) as pool:
            self.assertTrue(all(result == expected for result in pool.map(chart, range(100))))
        expected["transits"][0]["longitude"] = -1
        self.assertNotEqual(chart(0), expected)


class TransitBatchApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_batch_matches_single_date_api_and_request_order(self):
        dates = ["2026-09-17", "2026-09-01", "2025-09-17", "2026-09-17"]
        response = self.client.post("/api/transit-charts", json={**PAYLOAD, "target_dates": dates})
        self.assertEqual(response.status_code, 200)
        for stamp, chart in zip(dates, response.json()["charts"]):
            single = self.client.post("/api/transit-chart", json={**PAYLOAD, "target_date": stamp})
            self.assertEqual(single.status_code, 200)
            self.assertEqual(chart, single.json())

    def test_batch_rejects_empty_oversize_invalid_dates_and_times(self):
        for changes in ({"target_dates": []}, {"target_dates": ["2026-01-01"] * 367}, {"target_dates": ["invalid"]}, {"target_dates": ["2026-01-01"], "target_time": "12:01"}):
            self.assertEqual(self.client.post("/api/transit-charts", json={**PAYLOAD, **changes}).status_code, 422)

    def test_batch_deduplicates_calculation(self):
        with patch.object(forecast, "build_transit_chart", return_value={"test": True}) as build:
            response = self.client.post("/api/transit-charts", json={**PAYLOAD, "target_dates": ["2026-09-17"] * 3})
            self.assertEqual(response.json(), {"charts": [{"test": True}] * 3})
            self.assertEqual(build.call_count, 1)

    def test_timezone_name_resolves_once_and_unknown_birth_time_works(self):
        from backend.app.services.birth_timezone import resolve_birth_timezone
        with patch("backend.app.services.birth_timezone.resolve_birth_timezone", wraps=resolve_birth_timezone) as resolve:
            payload = {**PAYLOAD, "timezone_offset": None, "timezone_name": "Asia/Tokyo", "birth_time": None, "birth_time_unknown": True, "target_dates": ["2026-01-01", "2026-01-02"]}
            self.assertEqual(self.client.post("/api/transit-charts", json=payload).status_code, 200)
            self.assertEqual(resolve.call_count, 1)

    def test_existing_error_mapping_preserved(self):
        with patch.object(forecast, "build_transit_chart", side_effect=ValueError("invalid chart")):
            self.assertEqual(self.client.post("/api/transit-charts", json={**PAYLOAD, "target_dates": ["2026-09-17"]}).status_code, 400)
            self.assertEqual(self.client.post("/api/transit-chart", json={**PAYLOAD, "target_date": "2026-09-17"}).status_code, 400)


if __name__ == "__main__":
    unittest.main()
