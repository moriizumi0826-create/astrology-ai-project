import csv
import unittest
from pathlib import Path

from backend.app.services.chart_calculator import BirthInput
from backend.app.services.yearly_forecast_service import _solar_house, generate_yearly_forecast


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATABASE_DIR = PROJECT_ROOT / "database"


class YearlyForecastTestCase(unittest.TestCase):
    def test_transit_calendar_has_one_row_per_day_and_planet(self):
        path = DATABASE_DIR / "M_Transit_Calendar_2026.csv"
        with path.open("r", encoding="utf-8-sig", newline="") as f:
            rows = list(csv.DictReader(f))

        self.assertEqual(len(rows), 3285)
        self.assertEqual(len({(row["Date"], row["Planet"]) for row in rows}), 3285)
        self.assertTrue({"Ecliptic_Longitude", "Sign_ID", "Retrograde_Flag", "Speed"}.issubset(rows[0]))

    def test_yearly_base_logic_and_aspect_yearly_masters_exist(self):
        base_path = DATABASE_DIR / "M_Yearly_Base_Logic.csv"
        yearly_path = DATABASE_DIR / "M_Aspect_Interpretation_Yearly.csv"
        with base_path.open("r", encoding="utf-8-sig", newline="") as f:
            base_rows = list(csv.DictReader(f))
        with yearly_path.open("r", encoding="utf-8-sig", newline="") as f:
            yearly_rows = list(csv.DictReader(f))

        self.assertEqual(len(base_rows), 720)
        self.assertGreater(len(yearly_rows), 30000)
        self.assertTrue({"Duration_Type", "Yearly_Weight", "Graph_Visibility"}.issubset(yearly_rows[0]))

    def test_solar_house_is_calculated_from_natal_sun_sign(self):
        self.assertEqual(_solar_house("CANCER", "ARIES"), 4)
        self.assertEqual(_solar_house("CANCER", "CANCER"), 1)
        self.assertEqual(_solar_house("GEMINI", "CANCER"), 12)

    def test_generate_yearly_forecast_returns_frontend_shape(self):
        payload = BirthInput(
            full_name="Test User",
            birth_date="1984-08-26",
            birth_time="19:20",
            birth_time_unknown=False,
            birthplace="Tokyo",
            latitude=35.6812,
            longitude=139.7671,
            timezone_offset=9,
        )

        forecast = generate_yearly_forecast(payload, 2026)

        self.assertEqual(len(forecast["yearly_data"]), 365)
        first_day = forecast["yearly_data"][0]
        self.assertTrue({"total", "work", "love", "money", "general"}.issubset(first_day["scores"]))
        self.assertIn("events", first_day)
        self.assertTrue(forecast["milestones"])
        self.assertEqual(forecast["cache"]["table"], "yearly_forecast_cache")


if __name__ == "__main__":
    unittest.main()
