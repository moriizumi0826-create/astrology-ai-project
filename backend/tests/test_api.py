import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from pydantic import ValidationError

from backend.app.main import create_reading, health_check, root
from backend.app.services.chart_calculator import BirthInput, build_chart_rows, write_chart_csvs
from backend.app.schemas import ReadingMeta, ReadingRequest, ReadingResponse, ReadingSection
from scripts.natal_loader import build_natal_chart_data
from scripts.transit_loader import load_transit_support_data


class ApiTestCase(unittest.TestCase):
    def test_root(self):
        self.assertEqual(
            root(),
            {"message": "Celestial Atelier API", "health": "/api/health", "docs": "/docs"},
        )

    def test_health_check(self):
        self.assertEqual(health_check(), {"status": "ok"})

    def test_create_reading_success(self):
        def fake_generate_readings(payload):
            return ReadingResponse(
                meta=ReadingMeta(
                    full_name=payload.full_name,
                    birthplace=payload.birthplace,
                    birth_date=payload.birth_date.isoformat(),
                    birth_time=(
                        payload.birth_time.strftime("%H:%M")
                        if payload.birth_time
                        else "Unknown (calculated with 12:00 local time)"
                    ),
                    birth_time_unknown=payload.birth_time_unknown,
                    timezone_offset=payload.timezone_offset,
                ),
                chart_data={"sun": "Virgo 6H"},
                readings=[ReadingSection(type="personality", title="Natal Blueprint", content="stub")],
                transit_ready=True,
            )

        with patch("backend.app.services.reading_service.generate_readings", side_effect=fake_generate_readings):
            payload = ReadingRequest(
                full_name="Test User",
                birth_date="1984-08-26",
                birth_time="19:20",
                birth_time_unknown=False,
                birthplace="Tokyo",
                latitude=35.6812,
                longitude=139.7671,
                timezone_offset=9,
            )
            response = create_reading(payload)

        self.assertEqual(response.meta.full_name, "Test User")
        self.assertEqual(response.readings[0].type, "personality")

    def test_create_reading_success_with_unknown_birth_time(self):
        def fake_generate_readings(payload):
            return ReadingResponse(
                meta=ReadingMeta(
                    full_name=payload.full_name,
                    birthplace=payload.birthplace,
                    birth_date=payload.birth_date.isoformat(),
                    birth_time="Unknown (calculated with 12:00 local time)",
                    birth_time_unknown=payload.birth_time_unknown,
                    timezone_offset=payload.timezone_offset,
                ),
                chart_data={"sun": "Virgo 6H"},
                readings=[ReadingSection(type="personality", title="Natal Blueprint", content="stub")],
                transit_ready=True,
            )

        with patch("backend.app.services.reading_service.generate_readings", side_effect=fake_generate_readings):
            payload = ReadingRequest(
                full_name="Test User",
                birth_date="1984-08-26",
                birth_time=None,
                birth_time_unknown=True,
                birthplace="Tokyo",
                latitude=35.6812,
                longitude=139.7671,
                timezone_offset=9,
            )
            response = create_reading(payload)

        self.assertTrue(response.meta.birth_time_unknown)
        self.assertEqual(response.meta.birth_time, "Unknown (calculated with 12:00 local time)")

    def test_create_reading_validation_error(self):
        with self.assertRaises(ValidationError):
            ReadingRequest(
                full_name="",
                birth_date="1984-08-26",
                birth_time="19:20",
                birth_time_unknown=False,
                birthplace="Tokyo",
                latitude=120,
                longitude=139.7671,
                timezone_offset=9,
            )

    def test_create_reading_requires_birth_time_if_not_unknown(self):
        with self.assertRaises(ValidationError):
            ReadingRequest(
                full_name="Test User",
                birth_date="1984-08-26",
                birth_time=None,
                birth_time_unknown=False,
                birthplace="Tokyo",
                latitude=35.6812,
                longitude=139.7671,
                timezone_offset=9,
            )

    def test_unknown_birth_time_outputs_dash_csv_fields(self):
        class FakeSwe:
            SUN = 0
            MOON = 1
            MERCURY = 2
            VENUS = 3
            MARS = 4
            JUPITER = 5
            SATURN = 6
            URANUS = 7
            NEPTUNE = 8
            PLUTO = 9
            TRUE_NODE = 10
            FLG_SPEED = 256

            def julday(self, year, month, day, hour):
                return 123.0

            def houses(self, jd, latitude, longitude, house_system):
                return ([0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330], [15, 105])

            def calc_ut(self, jd, planet_id, flag):
                return ([planet_id * 20.0, 0, 0, 1.0], None)

        payload = BirthInput(
            full_name="Test User",
            birth_date="1984-08-26",
            birth_time="",
            birth_time_unknown=True,
            birthplace="Tokyo",
            latitude=35.6812,
            longitude=139.7671,
            timezone_offset=9,
        )

        with patch("backend.app.services.chart_calculator.swe", new=FakeSwe()):
            chart_rows = build_chart_rows(payload)

        self.assertTrue(all(row[-1] == "-" for row in chart_rows["planets"]))
        self.assertTrue(all(row == ["-", "-", "-", "-"] for row in chart_rows["angles"]))
        self.assertTrue(all(row == ["-", "-", "-", "-"] for row in chart_rows["houses"]))
        self.assertTrue(all("月" not in (row[0], row[1]) for row in chart_rows["aspects"]))

    def test_unknown_birth_time_chart_data_uses_dash_for_angle_and_house_fields(self):
        chart_rows = {
            "planets": [
                ["太陽", 156.0, "乙女座", 6.0, "順行", "-"],
                ["月", 110.0, "蟹座", 20.0, "順行", "-"],
                ["水星", 170.0, "乙女座", 20.0, "順行", "-"],
                ["金星", 210.0, "天秤座", 0.0, "順行", "-"],
                ["火星", 45.0, "牡牛座", 15.0, "順行", "-"],
                ["木星", 280.0, "山羊座", 10.0, "順行", "-"],
                ["土星", 240.0, "射手座", 0.0, "順行", "-"],
                ["天王星", 250.0, "射手座", 10.0, "順行", "-"],
                ["海王星", 260.0, "射手座", 20.0, "順行", "-"],
                ["冥王星", 200.0, "天秤座", 20.0, "順行", "-"],
                ["ドラゴンヘッド", 70.0, "双子座", 10.0, "順行", "-"],
                ["ドラゴンテール", 250.0, "射手座", 10.0, "順行", "-"],
            ],
            "angles": [["-", "-", "-", "-"], ["-", "-", "-", "-"]],
            "houses": [["-", "-", "-", "-"] for _ in range(12)],
            "aspects": [
                ["太陽", "月", 156.0, 110.0, 46.0, "セクスタイル", 60, 14.0],
            ],
        }

        with TemporaryDirectory() as tmp:
            files = write_chart_csvs(chart_rows, Path(tmp))
            chart_data = build_natal_chart_data(files["planets"], files["angles"], files["houses"])
            transit_data = load_transit_support_data(files["aspects"], files["houses"])

        self.assertEqual(chart_data["sun"], "Virgo")
        self.assertEqual(chart_data["asc"], "-")
        self.assertEqual(chart_data["mc"], "-")
        self.assertEqual(chart_data["house7"], "-")
        self.assertEqual(chart_data["house10"], "-")
        self.assertFalse(bool(transit_data["house_map"]))


if __name__ == "__main__":
    unittest.main()
