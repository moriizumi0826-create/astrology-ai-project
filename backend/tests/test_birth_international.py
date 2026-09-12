import unittest
from datetime import timezone
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient
from backend.app.main import app, _yearly_birth_input
from backend.app.schemas import ReadingRequest
from backend.app.services import geocoding_service, reading_service
from backend.app.services.birth_timezone import resolve_birth_timezone, request_birth_offset


class InternationalBirthTests(unittest.TestCase):
    def request(self, **changes):
        return ReadingRequest(**{
            "full_name": "Timezone Test", "birth_date": "1990-07-15",
            "birth_time": "12:00", "birthplace": "New York",
            "latitude": 40.7128, "longitude": -74.006,
            "timezone_name": "America/New_York", "timezone_offset": -5,
            **changes,
        })

    def test_named_zone_wins_over_stale_seasonal_offset_in_all_birth_paths(self):
        payload = self.request()
        self.assertEqual(request_birth_offset(payload), -4)
        self.assertEqual(_yearly_birth_input(payload).timezone_offset, -4)
        self.assertEqual(reading_service._birth_input_from_request(payload).timezone_offset, -4)
        self.assertEqual(request_birth_offset(self.request(birth_date="1990-01-15")), -5)

    def test_japan_utc_and_fractional_offsets(self):
        for zone, day, offset in [
            ("Asia/Tokyo", "1990-07-15", 9),
            ("UTC", "1990-07-15", 0),
            ("Asia/Kathmandu", "2026-07-15", 5.75),
            ("Asia/Kolkata", "1990-07-15", 5.5),
            ("Australia/Sydney", "1990-01-15", 11),
            ("Australia/Sydney", "1990-07-15", 10),
        ]:
            with self.subTest(zone=zone, day=day):
                self.assertEqual(resolve_birth_timezone(zone, day, "12:00")[0], offset)
        # Japan itself had daylight saving time in the past.
        self.assertEqual(resolve_birth_timezone("Asia/Tokyo", "1949-07-15", "12:00")[0], 10)
        self.assertEqual(request_birth_offset(self.request(timezone_name=None, timezone_offset=0)), 0)

    def test_gap_rejected_and_overlap_requires_explicit_occurrence(self):
        with self.assertRaisesRegex(ValueError, "存在しません"):
            resolve_birth_timezone("America/New_York", "2026-03-08", "02:30")
        with self.assertRaisesRegex(ValueError, "2回存在"):
            resolve_birth_timezone("America/New_York", "2026-11-01", "01:30")
        first = resolve_birth_timezone("America/New_York", "2026-11-01", "01:30", fold=0)
        second = resolve_birth_timezone("America/New_York", "2026-11-01", "01:30", fold=1)
        self.assertEqual(first[0], -4)
        self.assertEqual(second[0], -5)
        self.assertEqual((second[1].astimezone(timezone.utc) - first[1].astimezone(timezone.utc)).total_seconds(), 3600)

    def test_invalid_zone_and_unknown_time(self):
        with self.assertRaisesRegex(ValueError, "タイムゾーン名"):
            resolve_birth_timezone("Not/AZone", "1990-07-15", "12:00")
        offset, resolved = resolve_birth_timezone("America/New_York", "1990-07-15", "01:00", unknown=True)
        self.assertEqual((offset, resolved.hour), (-4, 12))

    def test_natal_planets_angles_and_houses_match_equivalent_utc(self):
        local = reading_service._birth_input_from_request(self.request())
        utc = reading_service._birth_input_from_request(self.request(
            birth_time="16:00", timezone_name="UTC", timezone_offset=0))
        self.assertEqual(reading_service.build_chart_rows(local), reading_service.build_chart_rows(utc))

    def test_international_search_does_not_filter_to_japan(self):
        result = {"name": "New York", "admin1": "New York", "country": "United States",
                  "country_code": "US", "latitude": 40.7128, "longitude": -74.006,
                  "timezone": "America/New_York"}
        with patch.object(geocoding_service, "_fetch_json", return_value={"results": [result]}) as fetch:
            matches = geocoding_service.search_locations("New York", country_code="WORLD",
                prefecture="Tokyo", birth_date="1990-07-15", birth_time="12:00")
        self.assertEqual(matches[0].timezone_offset, -4)
        self.assertNotIn("countryCode", parse_qs(urlparse(fetch.call_args.args[0]).query))

    def test_global_search_never_guesses_tokyo_or_uses_japan_fallback(self):
        result = {"name": "Missing Zone", "country_code": "US", "latitude": 1, "longitude": 2}
        with patch.object(geocoding_service, "_fetch_json", return_value={"results": [result]}), \
             patch.object(geocoding_service, "_search_nominatim") as fallback:
            self.assertEqual(geocoding_service.search_locations("Missing", country_code="WORLD"), [])
            fallback.assert_not_called()
        with patch.object(geocoding_service, "_fetch_json", side_effect=OSError("offline")), \
             patch.object(geocoding_service, "_search_nominatim") as fallback:
            with self.assertRaises(ValueError):
                geocoding_service.search_locations("Paris", country_code="WORLD")
            fallback.assert_not_called()

    def test_default_search_still_filters_japan(self):
        result = {"name": "Tokyo", "country_code": "JP", "latitude": 35, "longitude": 139}
        with patch.object(geocoding_service, "_fetch_json", return_value={"results": [result]}) as fetch:
            self.assertEqual(geocoding_service.search_locations("Tokyo")[0].timezone_name, "Asia/Tokyo")
        self.assertEqual(parse_qs(urlparse(fetch.call_args.args[0]).query)["countryCode"], ["JP"])

    def test_search_keeps_ambiguous_birthplace_selectable(self):
        result = {"name": "New York", "country_code": "US", "latitude": 40, "longitude": -74,
                  "timezone": "America/New_York"}
        with patch.object(geocoding_service, "_fetch_json", return_value={"results": [result]}):
            match = geocoding_service.search_locations("New York", country_code="WORLD",
                birth_date="2026-11-01", birth_time="01:30")[0]
        self.assertEqual(match.timezone_name, "America/New_York")
        self.assertIsNone(match.timezone_offset)

    def test_http_error_is_actionable_and_fold_is_preserved(self):
        client = TestClient(app)
        request = self.request(birth_date="2026-11-01", birth_time="01:30").model_dump(mode="json")
        response = client.post("/api/readings?defer_widgets=true", json=request)
        self.assertEqual(response.status_code, 400)
        self.assertIn("2回存在", response.json()["detail"])
        self.assertEqual(request_birth_offset(self.request(
            birth_date="2026-11-01", birth_time="01:30", birth_time_fold=1)), -5)
        response = client.post("/api/readings", json={**request, "birth_time_fold": 2})
        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
