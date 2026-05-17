import csv
import unittest
from datetime import date
from pathlib import Path

from backend.app.services.chart_calculator import BirthInput
from backend.app.services.yearly_forecast_service import (
    _calendar_trigger_events,
    _category_highlights,
    _clamp_score,
    _milestone_from_day,
    _solar_house,
    generate_yearly_forecast,
)


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

    def test_yearly_score_clamps_to_full_chart_range(self):
        self.assertEqual(_clamp_score(120), 100)
        self.assertEqual(_clamp_score(-120), -100)

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
        self.assertTrue({"general", "work", "love", "money"}.issubset(first_day["category_highlights"]))
        self.assertTrue(forecast["milestones"])
        self.assertEqual(forecast["cache"]["table"], "yearly_forecast_cache")

    def test_category_highlights_pick_strongest_aspect_per_category(self):
        highlights = _category_highlights([
            {"category": "Work", "aspect_angle": 120, "priority": 3, "weighted_score": 20},
            {"category": "Work", "aspect_angle": 90, "priority": 4, "weighted_score": 5},
            {"category": "Love", "aspect_angle": 60, "priority": 2, "weighted_score": -50},
            {"category": "General", "aspect_angle": 0, "priority": 1, "weighted_score": 100},
            {"category": "Money", "aspect_angle": None, "priority": 10, "weighted_score": 100},
        ])

        self.assertEqual(highlights["general"]["aspect_angle"], 0)
        self.assertEqual(highlights["work"]["aspect_angle"], 90)
        self.assertEqual(highlights["love"]["aspect_angle"], 60)
        self.assertIsNone(highlights["money"])

    def test_category_highlights_prefer_short_aspects_and_exclude_transit_moon(self):
        highlights = _category_highlights([
            {
                "category": "Work",
                "aspect_angle": 120,
                "priority": 10,
                "weighted_score": 90,
                "duration_type": "LONG",
                "t_planet": "JUPITER",
            },
            {
                "category": "Work",
                "aspect_angle": 60,
                "priority": 1,
                "weighted_score": 5,
                "duration_type": "SHORT",
                "t_planet": "MERCURY",
            },
            {
                "category": "Love",
                "aspect_angle": 0,
                "priority": 10,
                "weighted_score": 100,
                "duration_type": "SHORT",
                "t_planet": "MOON",
            },
            {
                "category": "Love",
                "aspect_angle": 90,
                "priority": 3,
                "weighted_score": -30,
                "duration_type": "LONG",
                "t_planet": "SATURN",
            },
        ])

        self.assertEqual(highlights["work"]["t_planet"], "MERCURY")
        self.assertEqual(highlights["love"]["t_planet"], "SATURN")

    def test_calendar_trigger_text_falls_back_to_placeholder(self):
        events = _calendar_trigger_events(
            day=date(2026, 1, 1),
            planet="MERCURY",
            calendar_row={
                "Date": "2026-01-01",
                "Sign_ID": "ARIES",
                "Ecliptic_Longitude": "0",
                "Sign_Ingress_Flag": "1",
                "Retrograde_Start_Flag": "1",
                "Retrograde_End_Flag": "0",
            },
            solar_house=1,
        )

        self.assertTrue(events)
        self.assertTrue(all(event["description"] == "----" for event in events))
        self.assertTrue(all(event["advised_task"] == "----" for event in events))

    def test_empty_milestone_text_falls_back_to_placeholder(self):
        milestone = _milestone_from_day(
            {
                "date": "2026-01-01",
                "scores": {"total": 0},
                "events": [{"id": "EMPTY_TEXT", "description": "", "advised_task": ""}],
            },
            "Test",
        )

        self.assertEqual(milestone["description"], "----")
        self.assertEqual(milestone["advised_task"], "----")


if __name__ == "__main__":
    unittest.main()
