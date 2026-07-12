import csv
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

from backend.app.services.chart_calculator import BirthInput
from backend.app.services import monthly_peak_service, yearly_forecast_service
from backend.app.services.yearly_forecast_service import (
    _calendar_trigger_events,
    _milestone_from_day,
    _yearly_summary_rows,
    _solar_house,
    reload_yearly_master_caches_if_changed,
    generate_yearly_forecast,
)


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATABASE_DIR = PROJECT_ROOT / "database"


class YearlyForecastTestCase(unittest.TestCase):
    def test_yearly_summary_csv_reload_reflects_updated_file(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            summary_path = temp_path / "M_Yearly_Summary_Interpretation.csv"
            summary_path.write_text(
                "Planet_A,Planet_B,Planet_A_House,Planet_B_House,Summary_Title,Summary_Text\n"
                "Jupiter,Saturn,Solar_1,Solar_1,Before,Before text\n",
                encoding="utf-8-sig",
            )

            with patch.object(yearly_forecast_service, "DATABASE_DIR", temp_path):
                reload_yearly_master_caches_if_changed(force=True)
                rows = _yearly_summary_rows()
                self.assertEqual(rows[("JUPITER", "SATURN", "Solar_1", "Solar_1")]["Summary_Title"], "Before")

                summary_path.write_text(
                    "Planet_A,Planet_B,Planet_A_House,Planet_B_House,Summary_Title,Summary_Text\n"
                    "Jupiter,Saturn,Solar_1,Solar_1,After,After text\n",
                    encoding="utf-8-sig",
                )

                reload_yearly_master_caches_if_changed(force=True)
                rows = _yearly_summary_rows()
                self.assertEqual(rows[("JUPITER", "SATURN", "Solar_1", "Solar_1")]["Summary_Title"], "After")
            reload_yearly_master_caches_if_changed(force=True)

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

    def test_yearly_summary_master_has_solar_and_natal_patterns(self):
        summary_path = DATABASE_DIR / "M_Yearly_Summary_Interpretation.csv"
        with summary_path.open("r", encoding="utf-8-sig", newline="") as f:
            rows = list(csv.DictReader(f))

        solar_rows = [
            row for row in rows
            if row["Planet_A_House"].startswith("Solar_") and row["Planet_B_House"].startswith("Solar_")
        ]
        natal_rows = [
            row for row in rows
            if row["Planet_A_House"].startswith("Natal_") and row["Planet_B_House"].startswith("Natal_")
        ]

        self.assertEqual(len(rows), 288)
        self.assertEqual(len(solar_rows), 144)
        self.assertEqual(len(natal_rows), 144)
        self.assertEqual(sum(1 for row in rows if row["Summary_Title"].strip()), 288)
        self.assertEqual(sum(1 for row in rows if row["Summary_Text"].strip()), 288)
        self.assertIn(("JUPITER", "SATURN", "Solar_1", "Solar_12"), _yearly_summary_rows())
        self.assertIn(("JUPITER", "SATURN", "Natal_12", "Natal_1"), _yearly_summary_rows())

    def test_solar_house_is_calculated_from_natal_sun_sign(self):
        self.assertEqual(_solar_house("CANCER", "ARIES"), 4)
        self.assertEqual(_solar_house("CANCER", "CANCER"), 1)
        self.assertEqual(_solar_house("GEMINI", "CANCER"), 12)

    def test_monthly_peak_graph_scores_normalize_and_clamp(self):
        scores = monthly_peak_service.calculate_daily_graph_scores({
            "general_health": {"activation": 250, "caution": 0, "graph_bias": 0, "daily_cap": 100},
            "work": {"activation": 9, "caution": 4, "graph_bias": 2, "daily_cap": 50},
            "love": {"activation": 1, "caution": 2, "graph_bias": 0, "daily_cap": 100},
            "money": {"activation": 0, "caution": 0, "graph_bias": 0, "daily_cap": 100},
        })

        self.assertEqual(scores["general"], 100)
        self.assertEqual(scores["work"], 14)
        self.assertEqual(scores["love"], -1)
        self.assertEqual(scores["money"], 0)
        self.assertTrue(-100 <= scores["total"] <= 100)

    def test_monthly_peak_csvs_load_with_expected_rows(self):
        peak_rules = monthly_peak_service.load_monthly_peak_rules()
        scoring_rules = monthly_peak_service.load_monthly_peak_scoring_rules()
        period_rules = monthly_peak_service.load_monthly_peak_period_rules()

        self.assertEqual(len(peak_rules), 2888)
        self.assertEqual(len(scoring_rules), 32)
        self.assertEqual(len(period_rules), 4)
        self.assertEqual(
            {row["Category"] for row in period_rules},
            {"general_health", "work", "love", "money"},
        )

    def test_monthly_peak_rule_index_preserves_full_rule_matches(self):
        rules = monthly_peak_service.load_monthly_peak_rules()
        rule_index = monthly_peak_service._build_monthly_peak_rule_index(rules)
        seed_rule = next(rule for rule in rules if rule["Active_Flag"] == "1")
        event = {
            event_column: (
                "INDEX_TEST" if seed_rule[rule_column] in {"", "ANY", "ALL"} else seed_rule[rule_column]
            )
            for rule_column, event_column in monthly_peak_service.RULE_MATCH_COLUMNS
        }
        event["orb"] = 0.0

        expected = [
            rule["Rule_ID"]
            for rule in rules
            if monthly_peak_service.monthly_peak_rule_matches(rule, event)
        ]
        actual = [
            rule["Rule_ID"]
            for rule in monthly_peak_service._candidate_monthly_peak_rules(event, rule_index)
            if monthly_peak_service.monthly_peak_rule_matches(rule, event)
        ]
        self.assertIn(seed_rule["Rule_ID"], expected)
        self.assertEqual(actual, expected)

    def test_monthly_peak_aggregation_keeps_activation_and_caution_separate(self):
        rule = {
            "Rule_ID": "TEST_WORK_ASPECT",
            "Category": "work",
            "Factor_Type": "transit_to_natal",
            "Peak_Type": "career",
            "Transit_Planet": "JUPITER",
            "Natal_Target": "MC",
            "Target_Role": "career_axis",
            "House_System": "natal",
            "Target_House": "10",
            "Aspect_Angle": "120",
            "Aspect_Class": "soft",
            "Transit_State": "direct",
            "Orb_Max": "3",
            "Activation_Weight": "6",
            "Caution_Weight": "2",
            "Intensity_Hint": "high",
            "Tone": "mixed",
            "Monthly_Title": "Work test",
            "Monthly_Summary": "Summary",
            "Monthly_Description": "Description",
            "Monthly_Caution": "Caution",
            "Yearly_Summary": "Yearly",
            "Priority": "1",
            "Tags": "career;trine",
            "Active_Flag": "1",
        }
        scoring_rule = {
            "Rule_ID": "TEST_WORK_SCORING",
            "Category": "work",
            "Factor_Type": "transit_to_natal",
            "Tone": "ANY",
            "Intensity_Hint": "ANY",
            "Activation_Multiplier": "1.5",
            "Caution_Multiplier": "2",
            "Graph_Bias": "-7",
            "Daily_Cap": "12",
            "Priority": "1",
            "Active_Flag": "1",
        }
        event = {
            "id": "EVENT_1",
            "factor_type": "transit_to_natal",
            "transit_planet": "JUPITER",
            "natal_target": "MC",
            "target_role": ("career_axis",),
            "house_system": "natal",
            "target_house": 10,
            "aspect_angle": 120,
            "aspect_class": "soft",
            "transit_state": "direct",
            "orb": 1.2,
        }

        result = monthly_peak_service.aggregate_daily_peak_categories(
            [event], rules=[rule], scoring_rules=[scoring_rule]
        )

        self.assertEqual(result["work"]["activation"], 9.0)
        self.assertEqual(result["work"]["caution"], 4.0)
        self.assertEqual(result["work"]["graph_bias"], -7.0)
        self.assertEqual(result["work"]["daily_cap"], 12.0)
        self.assertEqual(len(result["work"]["matched_rules"]), 1)
        self.assertEqual(result["love"]["activation"], 0.0)

    def test_monthly_peak_periods_respect_constraints_and_keep_caution(self):
        period_rules = [{
            "Rule_ID": "WORK_PERIOD",
            "Category": "work",
            "Activation_Threshold": "6",
            "Strong_Activation_Threshold": "10",
            "Max_Period_Days": "2",
            "Moon_Only_Allowed": "0",
            "Outer_Only_Allowed": "0",
            "Background_Only_Allowed": "0",
            "Max_Display_Count": "3",
            "Priority": "1",
            "Active_Flag": "1",
        }]

        def peak_day(day_text, activation, caution, planet="MARS", intensity="high"):
            return {
                "date": day_text,
                "monthly_peak": {
                    "work": {
                        "activation": activation,
                        "caution": caution,
                        "matched_rules": [{
                            "rule_id": f"RULE_{day_text}",
                            "peak_type": "action",
                            "factor_type": "transit_to_natal",
                            "transit_planet": planet,
                            "natal_target": "MC",
                            "target_house": "10",
                            "aspect_angle": "120",
                            "orb": 0.4,
                            "tone": "mixed",
                            "intensity_hint": intensity,
                            "priority": 1,
                            "activation": activation,
                            "caution": caution,
                            "title": "Work peak",
                            "summary": "Summary",
                            "description": "Description",
                            "caution_text": "Caution",
                            "tags": ["career"],
                            "event_id": day_text,
                        }],
                    },
                },
            }

        periods = monthly_peak_service.build_monthly_peak_periods(
            [
                peak_day("2026-07-01", 7, 1),
                peak_day("2026-07-02", 9, 4),
                peak_day("2026-07-03", 8, 2),
                peak_day("2026-07-04", 12, 0, intensity="background_only"),
                peak_day("2026-07-05", 12, 0, planet="URANUS"),
                peak_day("2026-07-06", 12, 0, planet="MOON"),
            ],
            period_rules=period_rules,
        )

        self.assertEqual(len(periods["work"]), 2)
        self.assertEqual(periods["work"][0]["start_date"], "2026-07-01")
        self.assertEqual(periods["work"][0]["end_date"], "2026-07-02")
        self.assertEqual(periods["work"][0]["peak_date"], "2026-07-02")
        self.assertEqual(periods["work"][0]["activation"], 9.0)
        self.assertEqual(periods["work"][0]["caution"], 4.0)
        self.assertEqual(periods["work"][0]["factors"][0]["label"], "MARS MC 120°")

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
        self.assertEqual(
            set(first_day["monthly_peak"]),
            {"general_health", "work", "love", "money"},
        )
        self.assertEqual(
            set(forecast["monthly_peak_periods"]),
            {"general_health", "work", "love", "money"},
        )
        self.assertIn("events", first_day)
        self.assertTrue(forecast["milestones"])
        self.assertTrue(forecast["annual_summaries"])
        self.assertIn("annual_summary_columns", forecast)
        self.assertTrue(forecast["annual_summary_columns"]["environment"])
        self.assertTrue(forecast["annual_summary_columns"]["mental"])
        self.assertTrue(forecast["monthly_sun_themes"])
        self.assertTrue(forecast["monthly_mars_themes"])
        self.assertEqual(forecast["monthly_sun_themes"][0]["planet"], "SUN")
        self.assertEqual(forecast["monthly_mars_themes"][0]["planet"], "MARS")
        self.assertTrue(forecast["monthly_sun_themes"][0]["monthly_summary"])
        self.assertTrue(forecast["monthly_mars_themes"][0]["monthly_interpretation"])
        self.assertIn("annual_summary", forecast["annual_summaries"][0])
        self.assertIn("annual_interpretation", forecast["annual_summaries"][0])
        self.assertIn("environment_change", forecast["annual_summaries"][0])
        self.assertIn("mental_change", forecast["annual_summaries"][0])
        self.assertTrue(forecast["annual_summaries"][0]["environment_change"]["title"])
        self.assertTrue(forecast["annual_summaries"][0]["mental_change"]["title"])
        self.assertEqual(forecast["cache"]["table"], "yearly_forecast_cache")

    def test_annual_summary_columns_merge_environment_and_mental_independently(self):
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
        columns = forecast["annual_summary_columns"]

        for key in ("environment", "mental"):
            self.assertTrue(columns[key])
            for previous, current in zip(columns[key], columns[key][1:]):
                self.assertNotEqual(
                    (previous["title"], previous["text"]),
                    (current["title"], current["text"]),
                )
            self.assertTrue(columns[key][0]["title"])
            self.assertTrue(columns[key][0]["text"])

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
