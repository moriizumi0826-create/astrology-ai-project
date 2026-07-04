import shutil
import unittest
from datetime import date, datetime, time
from pathlib import Path
from unittest.mock import patch

from fastapi.encoders import jsonable_encoder
from fastapi import HTTPException
from pydantic import ValidationError

from backend.app.main import create_reading, create_yearly_forecast, health_check, location_search, master_version, root
from backend.app.services.chart_calculator import BirthInput, build_chart_rows, write_chart_csvs
from backend.app.services.geocoding_service import LocationMatch
from backend.app.services import reading_service
from backend.app.services.reading_service import (
    build_basic_interpretations_from_chart_rows,
    build_countdown_data,
    build_dashboard_data_from_interpretations,
    build_dashboard_data_from_aspects,
    build_transit_aspect_inputs,
    get_aspect_dashboard_data,
    get_aspect_interpretation,
    get_basic_interpretation,
    get_daily_vibe_modifiers,
)
from backend.app.services.yearly_forecast_service import (
    _display_countdown_label,
    _orb_decay,
    _priority_weight,
    build_yearly_forecast_cache_payload,
    extract_milestones,
)
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

    def test_master_version_returns_version_payload(self):
        response = master_version()

        self.assertTrue(response["masterVersion"])
        self.assertEqual(response["masterVersion"], response["master_version"])
        self.assertGreater(response["fileCount"], 0)

    def test_aspect_interpretation_loads_sun_conjunction_from_master_csv(self):
        row = get_aspect_interpretation(
            t_planet="螟ｪ髯ｽ",
            n_planet="螟ｪ髯ｽ",
            angle=0,
            house=1,
            is_retrograde=False,
            orb_status="Applying",
        )

        self.assertEqual(row["T_Planet"], "TRANSIT_SUN")
        self.assertEqual(row["N_Planet"], "NATAL_SUN")
        self.assertEqual(row["Aspect_Angle"], 0)
        self.assertEqual(row["Score_Impact"], 85)

    def test_aspect_dashboard_data_maps_csv_columns(self):
        dashboard_data = get_aspect_dashboard_data(
            t_planet="SUN",
            n_planet="SUN",
            angle=0,
            house=1,
            is_retrograde=False,
            orb_status="Applying",
        )

        self.assertEqual(dashboard_data["hero"]["score"], 100)
        self.assertEqual(dashboard_data["hero"]["rank"], "S")
        self.assertTrue(dashboard_data["hero"]["summary"])
        self.assertIn("countdown", dashboard_data)
        self.assertIn("dailyPerformance", dashboard_data)
        self.assertNotIn("timeline", dashboard_data)
        self.assertTrue(dashboard_data["topics"][0]["description"])
        self.assertIn("developerMeta", dashboard_data)
        self.assertIn("personalReading", dashboard_data["developerMeta"])

    def test_quincunx_uses_master_text_instead_of_generic_fallback(self):
        row = get_aspect_interpretation(
            t_planet="MARS",
            n_planet="SUN",
            angle=150,
            house=1,
            is_retrograde=False,
            orb_status="Separating",
        )

        self.assertTrue(row["Text_Description"])
        self.assertEqual(row["Aspect_Angle"], 150)

    def test_missing_aspect_text_uses_placeholder_instead_of_generated_fallback(self):
        self.assertEqual(
            reading_service._fallback_aspect_text("VENUS", "MOON", 180, "Love", "Separating", True),
            "----",
        )
        self.assertEqual(reading_service._fallback_aspect_task("Love", "Separating", True), "----")

    def test_basic_interpretation_loads_sun_sign_house_from_master_csv(self):
        row = get_basic_interpretation(planet="SUN", sign="ARIES", house=1)

        self.assertEqual(row["Planet_ID"], "SUN")
        self.assertEqual(row["Sign_ID"], "ARIES")
        self.assertEqual(int(row["House_ID"]), 1)
        self.assertTrue(row["Text_General"])

    def test_basic_interpretations_are_extracted_from_chart_rows(self):
        basic_rows = build_basic_interpretations_from_chart_rows(
            planet_rows=[
                ["SUN", 0.0, "ARIES", 0.0, "Direct", 1],
                ["MOON", 31.0, "TAURUS", 1.0, "Direct", 2],
            ],
            angle_rows=[["ASC", 0.0, "ARIES", 0.0]],
        )

        self.assertEqual([row["Planet_ID"] for row in basic_rows[:2]], ["SUN", "MOON"])
        self.assertLessEqual(len(basic_rows), 3)

    def test_basic_interpretations_are_extracted_from_japanese_live_chart_rows(self):
        basic_rows = build_basic_interpretations_from_chart_rows(
            planet_rows=[
                ["\u592a\u967d", 11.13, "\u7261\u7f8a\u5ea7", 11.13, "\u9806\u884c", 9],
                ["\u6708", 84.24, "\u53cc\u5b50\u5ea7", 24.24, "\u9806\u884c", 11],
            ],
            angle_rows=[["ASC", 117.51, "\u87f9\u5ea7", 27.51]],
        )

        self.assertEqual([row["Planet_ID"] for row in basic_rows], ["SUN", "MOON", "ASC"])
        self.assertEqual([row["Sign_ID"] for row in basic_rows], ["ARIES", "GEMINI", "CANCER"])
        self.assertTrue(all(row["Text_General"] for row in basic_rows))

    def test_dashboard_hero_combines_basic_and_aspect_context(self):
        basic = get_basic_interpretation(planet="SUN", sign="ARIES", house=1)
        dashboard_data = build_dashboard_data_from_aspects(
            aspects=[
                {
                    "t_planet": "SUN",
                    "n_planet": "SUN",
                    "angle": 0,
                    "house": 1,
                    "is_retrograde": False,
                    "orb_status": "Applying",
                }
            ],
            basic_interpretations=[basic],
        )

        hero = dashboard_data["hero"]
        self.assertEqual(hero["title"], "\u8ffd\u3044\u98a8\u3092\u6700\u5927\u9650\u306b\u6d3b\u304b\u3059\u65e5")
        self.assertTrue(hero["description"])
        self.assertTrue(hero["guideline"])
        self.assertEqual(hero["basic"]["planet"], "SUN")
        self.assertTrue(hero["basicTexts"]["general"])
        self.assertTrue(hero["basicTexts"]["love"])
        self.assertTrue(hero["basicTexts"]["work"])
        self.assertTrue(hero["basicTexts"]["human"])
        self.assertTrue(hero["basicTexts"]["health"])
        self.assertNotIn("本来は", hero["summary"])
        self.assertEqual(hero["summary"], dashboard_data["aspect_interpretations"][0]["Text_Description"])

    def test_hero_title_changes_by_rank(self):
        expected = {
            "S": "\u8ffd\u3044\u98a8\u3092\u6700\u5927\u9650\u306b\u6d3b\u304b\u3059\u65e5",
            "A": "\u8ffd\u3044\u98a8\u3092\u3064\u304b\u3080\u65e5",
            "B+": "\u6d41\u308c\u3092\u6574\u3048\u3066\u524d\u9032\u3059\u308b\u65e5",
            "B": "\u6d41\u308c\u3092\u4fdd\u3061\u306a\u304c\u3089\u9032\u3080\u65e5",
            "C": "\u8db3\u5143\u3092\u6574\u3048\u308b\u65e5",
            "D": "\u614e\u91cd\u306b\u4f59\u767d\u3092\u5b88\u308b\u65e5",
            "E": "\u7121\u7406\u3092\u305b\u305a\u56de\u5fa9\u3092\u512a\u5148\u3059\u308b\u65e5",
        }

        for rank, title in expected.items():
            with self.subTest(rank=rank):
                self.assertEqual(reading_service._rank_to_catchcopy(rank), title)

    def test_dashboard_data_integrates_multiple_aspects_and_daily_vibe_modifier(self):
        dashboard_data = build_dashboard_data_from_aspects(
            aspects=[
                {
                    "t_planet": "SUN",
                    "n_planet": "SUN",
                    "angle": 0,
                    "house": 1,
                    "is_retrograde": False,
                    "orb_status": "Applying",
                },
                {
                    "t_planet": "MERCURY",
                    "n_planet": "SATURN",
                    "angle": 0,
                    "house": 6,
                    "is_retrograde": True,
                    "orb_status": "Applying",
                },
                {
                    "t_planet": "VENUS",
                    "n_planet": "MOON",
                    "angle": 120,
                    "house": 4,
                    "is_retrograde": False,
                    "orb_status": "Applying",
                },
            ],
            retrograde_planets=["MERCURY"],
        )

        self.assertEqual(len(dashboard_data["aspect_interpretations"]), 3)
        self.assertEqual(dashboard_data["daily_vibe"]["modifier"], -20)
        self.assertEqual(dashboard_data["hero"]["score"], 100)
        self.assertIn("diagnostic", dashboard_data)
        self.assertEqual(dashboard_data["diagnostic"]["score"], 64)
        self.assertEqual(
            [item["value"] for item in dashboard_data["diagnostic"]["items"]],
            [45, 63, 50],
        )
        self.assertEqual(len(dashboard_data["diagnostic"]["items"]), 3)
        self.assertNotEqual(dashboard_data["countdown"]["title"], dashboard_data["countdown"]["note"])
        self.assertTrue(dashboard_data["countdown"]["trigger_id"])
        self.assertTrue(any(topic["title"] == "Work" for topic in dashboard_data["topics"]))
        self.assertTrue(dashboard_data["developerMeta"]["diagnostic"]["sources"])
        self.assertTrue(dashboard_data["developerMeta"]["countdown"]["sources"])

    def test_important_points_only_include_mars_at_exact_peak(self):
        base_rows = [
            {
                "T_Planet": "TRANSIT_MARS",
                "N_Planet": "NATAL_SUN",
                "Aspect_Angle": 120,
                "Category": "Work",
                "Text_Description": "mars text",
                "Advised_Task": "mars task",
                "Score_Impact": 99,
                "Priority": 10,
                "_input": {"orb": 0.01},
            },
            {
                "T_Planet": "TRANSIT_VENUS",
                "N_Planet": "NATAL_MOON",
                "Aspect_Angle": 120,
                "Category": "Love",
                "Text_Description": "venus text",
                "Advised_Task": "venus task",
                "Score_Impact": 50,
                "Priority": 5,
                "_input": {"orb": 3.0},
            },
        ]

        dashboard_data = build_dashboard_data_from_interpretations(base_rows, {"modifier": 0, "items": []})
        positive_descriptions = [item["description"] for item in dashboard_data["hero"]["aspectHighlights"]["positive"]]

        self.assertEqual(positive_descriptions, ["venus text"])

        peak_rows = [dict(row) for row in base_rows]
        peak_rows[0]["_input"] = {"orb": 0.0}
        dashboard_data = build_dashboard_data_from_interpretations(peak_rows, {"modifier": 0, "items": []})
        positive_descriptions = [item["description"] for item in dashboard_data["hero"]["aspectHighlights"]["positive"]]

        self.assertEqual(positive_descriptions, ["mars text", "venus text"])

    def test_important_points_include_mars_on_peak_day(self):
        peak_dt = datetime(2026, 5, 20, 15, 0)

        def fake_orb_at(_transit_planet, sample_dt, _timezone_offset, _natal_longitude, _exact_angle):
            days_from_peak = abs((sample_dt - peak_dt).total_seconds()) / 86400
            return days_from_peak * 0.5, False

        rows = [
            {
                "T_Planet": "TRANSIT_MARS",
                "N_Planet": "NATAL_SUN",
                "Aspect_Angle": 120,
                "Category": "Work",
                "Text_Description": "mars peak day text",
                "Advised_Task": "mars task",
                "Score_Impact": 99,
                "Priority": 10,
                "_input": {"orb": 0.2, "natal_longitude": 10.0, "timezone_offset": 9.0},
            },
            {
                "T_Planet": "TRANSIT_VENUS",
                "N_Planet": "NATAL_MOON",
                "Aspect_Angle": 120,
                "Category": "Love",
                "Text_Description": "venus text",
                "Advised_Task": "venus task",
                "Score_Impact": 50,
                "Priority": 5,
                "_input": {"orb": 3.0},
            },
        ]

        with patch.object(reading_service, "swe", object()), patch.object(reading_service, "_aspect_orb_at", side_effect=fake_orb_at):
            dashboard_data = build_dashboard_data_from_interpretations(
                rows,
                {"modifier": 0, "items": []},
                current_dt=date(2026, 5, 20),
            )
            positive_descriptions = [item["description"] for item in dashboard_data["hero"]["aspectHighlights"]["positive"]]
            self.assertEqual(positive_descriptions, ["mars peak day text", "venus text"])

            dashboard_data = build_dashboard_data_from_interpretations(
                rows,
                {"modifier": 0, "items": []},
                current_dt=date(2026, 5, 19),
            )
            positive_descriptions = [item["description"] for item in dashboard_data["hero"]["aspectHighlights"]["positive"]]
            self.assertEqual(positive_descriptions, ["venus text"])

    def test_dashboard_data_is_json_serializable(self):
        dashboard_data = build_dashboard_data_from_aspects(
            aspects=[
                {
                    "t_planet": "SUN",
                    "n_planet": "SUN",
                    "angle": 0,
                    "house": 1,
                    "is_retrograde": False,
                    "orb_status": "Applying",
                }
            ],
            basic_interpretations=[get_basic_interpretation(planet="SUN", sign="ARIES", house=1)],
        )

        encoded = jsonable_encoder(dashboard_data)

        self.assertIsInstance(encoded, dict)
        self.assertIn("hero", encoded)

    def test_daily_performance_exposes_action_advice(self):
        dashboard_data = build_dashboard_data_from_aspects(
            aspects=[
                {
                    "t_planet": "SUN",
                    "n_planet": "SUN",
                    "angle": 0,
                    "house": 1,
                    "is_retrograde": False,
                    "orb_status": "Applying",
                },
                {
                    "t_planet": "MOON",
                    "n_planet": "SUN",
                    "angle": 0,
                    "house": 1,
                    "is_retrograde": False,
                    "orb_status": "Applying",
                },
                {
                    "t_planet": "MERCURY",
                    "n_planet": "SATURN",
                    "angle": 0,
                    "house": 6,
                    "is_retrograde": True,
                    "orb_status": "Applying",
                },
                {
                    "t_planet": "VENUS",
                    "n_planet": "MOON",
                    "angle": 120,
                    "house": 4,
                    "is_retrograde": False,
                    "orb_status": "Applying",
                },
                {
                    "t_planet": "MARS",
                    "n_planet": "SUN",
                    "angle": 150,
                    "house": 1,
                    "is_retrograde": False,
                    "orb_status": "Separating",
                },
            ]
        )

        daily_performance = dashboard_data["dailyPerformance"]
        self.assertGreaterEqual(len(daily_performance), 24)
        self.assertTrue(all(point.get("actionAdvice") for point in daily_performance))
        self.assertTrue(all(point["actionAdvice"].get("recommendedAction") for point in daily_performance))
        self.assertTrue(all(point["actionAdvice"].get("thinkingStyle") for point in daily_performance))
        self.assertTrue(all(point["actionAdvice"].get("restGuidance") for point in daily_performance))

    def test_daily_performance_action_advice_keeps_mars_separate(self):
        advice = reading_service._daily_performance_action_advice(
            {
                "marsActivity": 0,
                "drive": 62,
                "flow": 48,
                "inspiration": 72,
                "friction": 31,
            },
            hour=9,
        )

        self.assertNotEqual(advice["highMetric"], "MARS_ACTIVITY")
        self.assertNotEqual(advice["lowMetric"], "MARS_ACTIVITY")
        self.assertEqual(advice["highMetric"], "INSPIRATION")
        self.assertEqual(advice["lowMetric"], "FLOW")
        self.assertEqual(advice["frictionScore"], 31)
        self.assertEqual(advice["frictionState"], "LOW")
        self.assertEqual(advice["marsScore"], 0)
        self.assertEqual(advice["marsState"], "LOW")

    def test_daily_performance_action_advice_detects_dual_high(self):
        advice = reading_service._daily_performance_action_advice(
            {
                "marsActivity": 45,
                "drive": 76,
                "flow": 42,
                "inspiration": 74,
                "friction": 28,
            },
            hour=12,
        )

        self.assertEqual(advice["patternType"], "DUAL_HIGH")
        self.assertEqual(advice["primaryHighMetric"], "DRIVE")
        self.assertEqual(advice["secondaryHighMetric"], "INSPIRATION")
        self.assertTrue(advice["adviceId"].startswith("DPA_DUAL_HIGH_"))

    def test_daily_performance_action_advice_detects_balanced(self):
        advice = reading_service._daily_performance_action_advice(
            {
                "marsActivity": 45,
                "drive": 52,
                "flow": 55,
                "inspiration": 49,
                "friction": 30,
            },
            hour=15,
        )

        self.assertEqual(advice["patternType"], "BALANCED")
        self.assertEqual(advice["overallLevel"], "NEUTRAL")
        self.assertTrue(advice["adviceId"].startswith("DPA_BALANCED_"))

    def test_daily_performance_action_advice_keeps_friction_separate(self):
        advice = reading_service._daily_performance_action_advice(
            {
                "marsActivity": 48,
                "drive": 67,
                "flow": 44,
                "inspiration": 62,
                "friction": 83,
            },
            hour=18,
        )

        self.assertEqual(advice["patternType"], "FRICTION_SPIKE")
        self.assertNotEqual(advice["highMetric"], "FRICTION")
        self.assertNotEqual(advice["lowMetric"], "FRICTION")
        self.assertEqual(advice["frictionState"], "SPIKE")
        self.assertTrue(advice["adviceId"].startswith("DPA_FRICTION_SPIKE_"))

    def test_daily_performance_action_advice_detects_all_low(self):
        advice = reading_service._daily_performance_action_advice(
            {
                "marsActivity": 20,
                "drive": 30,
                "flow": 32,
                "inspiration": 28,
                "friction": 42,
            },
            hour=21,
        )

        self.assertEqual(advice["patternType"], "ALL_LOW")
        self.assertEqual(advice["overallLevel"], "LOW")
        self.assertTrue(advice["adviceId"].startswith("DPA_ALL_LOW_"))

    def test_countdown_data_loads_master_and_calculates_progress(self):
        countdown = build_countdown_data(
            {
                "T_Planet": "TRANSIT_VENUS",
                "Countdown_ID": " lucky_love_venus ",
                "Countdown_Label": "譛鬮倥・諱区・驕九∪縺ｧ",
                "Score_Impact": 75,
                "Priority": 8,
                "_orb_status": "Applying",
                "_input": {"orb": 2.5},
            }
        )

        self.assertIsNotNone(countdown)
        self.assertEqual(countdown["trigger_id"], "LUCKY_LOVE_VENUS")
        self.assertEqual(countdown["countdown_id"].strip(), "lucky_love_venus")
        self.assertEqual(countdown["fallback_label"], "譛鬮倥・諱区・驕九∪縺ｧ")
        self.assertEqual(countdown["percent"], 50)
        self.assertEqual(countdown["days_remaining"], 3)
        self.assertEqual(countdown["total_days"], 14)
        self.assertTrue(countdown["title"])
        self.assertTrue(countdown["note"])

    def test_countdown_days_remaining_decreases_as_orb_approaches(self):
        far_countdown = build_countdown_data(
            {
                "T_Planet": "TRANSIT_VENUS",
                "Countdown_ID": "LUCKY_LOVE_VENUS",
                "Countdown_Label": "譛鬮倥・諱区・驕九∪縺ｧ",
                "_input": {"orb": 4.0},
            }
        )
        near_countdown = build_countdown_data(
            {
                "T_Planet": "TRANSIT_VENUS",
                "Countdown_ID": "LUCKY_LOVE_VENUS",
                "Countdown_Label": "譛鬮倥・諱区・驕九∪縺ｧ",
                "_input": {"orb": 1.0},
            }
        )

        self.assertGreater(far_countdown["days_remaining"], near_countdown["days_remaining"])
        self.assertLess(far_countdown["percent"], near_countdown["percent"])

    def test_countdown_uses_arrival_text_within_half_degree(self):
        countdown = build_countdown_data(
            {
                "T_Planet": "TRANSIT_VENUS",
                "Countdown_ID": "LUCKY_LOVE_VENUS",
                "Countdown_Label": "譛鬮倥・諱区・驕九∪縺ｧ",
                "_input": {"orb": 0.4},
            }
        )

        self.assertEqual(countdown["title"], countdown["arrival_text"])

    def test_countdown_prefers_master_title_and_action_hint(self):
        countdown = build_countdown_data(
            {
                "T_Planet": "TRANSIT_VENUS",
                "Countdown_ID": "LUCKY_LOVE_VENUS",
                "Countdown_Label": "個別ラベルを表示",
                "Advised_Task": "個別タスクを使う",
                "_input": {"orb": 2.0},
            }
        )

        self.assertEqual(countdown["title"], countdown["display_title"])
        self.assertNotEqual(countdown["note"], "個別タスクを使う")
        self.assertTrue(countdown["note"])

    def test_countdown_falls_back_to_master_title_when_label_is_missing(self):
        countdown = build_countdown_data(
            {
                "T_Planet": "TRANSIT_VENUS",
                "Countdown_ID": "LUCKY_LOVE_VENUS",
                "_input": {"orb": 2.0},
            }
        )

        self.assertEqual(countdown["title"], countdown["display_title"])

    def test_countdown_label_is_only_fallback_when_master_is_missing(self):
        countdown = build_countdown_data(
            {
                "T_Planet": "TRANSIT_VENUS",
                "Countdown_ID": "UNKNOWN_TRIGGER",
                "Countdown_Label": "譌･譛ｬ隱槭ヵ繧ｩ繝ｼ繝ｫ繝舌ャ繧ｯ",
                "_input": {"orb": 2.0},
            }
        )

        self.assertEqual(countdown["title"], "譌･譛ｬ隱槭ヵ繧ｩ繝ｼ繝ｫ繝舌ャ繧ｯ")
        self.assertEqual(countdown["note"], "譌･譛ｬ隱槭ヵ繧ｩ繝ｼ繝ｫ繝舌ャ繧ｯ")
        self.assertEqual(countdown["trigger_id"], "UNKNOWN_TRIGGER")

    def test_countdown_label_does_not_match_master_without_countdown_id(self):
        countdown = build_countdown_data(
            {
                "T_Planet": "TRANSIT_VENUS",
                "Countdown_Label": "LUCKY_LOVE_VENUS",
                "_input": {"orb": 2.0},
            }
        )

        self.assertEqual(countdown["title"], "LUCKY_LOVE_VENUS")
        self.assertEqual(countdown["trigger_id"], "")

    def test_countdown_turning_away_after_peak_keeps_zero_days(self):
        with patch("backend.app.services.reading_service._scan_countdown_ephemeris") as scan_mock:
            scan_mock.return_value = {
                "days_remaining": 0,
                "total_days": 30,
                "percent": 100,
                "scan_status": "turning_away",
                "peak_day": 0,
                "peak_orb": 0.7,
                "peak_retrograde": False,
            }
            countdown = build_countdown_data(
                {
                    "T_Planet": "TRANSIT_MERCURY",
                    "N_Planet": "NATAL_MOON",
                    "Aspect_Angle": 120,
                    "Countdown_ID": "lucky_love_venus",
                    "Countdown_Label": "sample",
                    "Score_Impact": 50,
                    "Priority": 8,
                    "_input": {
                        "orb": 3.2,
                        "natal_longitude": 15.0,
                    },
                },
                current_dt=datetime(2026, 5, 2),
            )

        self.assertIsNotNone(countdown)
        self.assertEqual(countdown["scan_status"], "turning_away")
        self.assertEqual(countdown["days_remaining"], 0)
        self.assertEqual(countdown["percent"], 100)
        self.assertEqual(countdown["orb_percent"], 36)
        self.assertEqual(countdown["exit_days_remaining"], 2)

    def test_negative_countdown_counts_until_leaving_influence(self):
        with patch("backend.app.services.reading_service._scan_countdown_departure") as scan_mock:
            scan_mock.return_value = {
                "days_remaining": 9,
                "total_days": 14,
                "percent": 35,
                "scan_status": "departing",
                "current_orb": 1.0,
                "departure_day": 9,
                "departure_orb": 5.2,
                "departure_retrograde": False,
            }
            countdown = build_countdown_data(
                {
                    "T_Planet": "TRANSIT_MERCURY",
                    "N_Planet": "NATAL_MOON",
                    "Aspect_Angle": 90,
                    "Countdown_ID": "MIND_BODY_BALANCE",
                    "Countdown_Label": "negative sample",
                    "Score_Impact": -50,
                    "Priority": 8,
                    "_orb_status": "Applying",
                    "_input": {
                        "orb": 1.0,
                        "natal_longitude": 15.0,
                    },
                },
                current_dt=datetime(2026, 5, 2),
                countdown_mode="departure",
            )

        self.assertEqual(countdown["countdown_mode"], "departure")
        self.assertEqual(countdown["scan_status"], "departing")
        self.assertEqual(countdown["days_remaining"], 9)
        self.assertEqual(countdown["daysLeft"], 9)
        self.assertEqual(countdown["departure_days_remaining"], 9)
        self.assertEqual(countdown["scan"]["departure_day"], 9)

    def test_dashboard_data_includes_weekly_aspects_for_countdown_one(self):
        def fake_aspect_inputs(_birth_input, current_dt=None):
            target_date = current_dt.date() if isinstance(current_dt, datetime) else current_dt
            return [{"target_date": target_date.isoformat()}]

        def fake_interpretations(aspects):
            return [
                {
                    "T_Planet": "TRANSIT_MERCURY",
                    "N_Planet": "NATAL_MOON",
                    "Aspect_Angle": 90,
                    "Category": "Work",
                    "Countdown_Label": f"aspect {aspects[0]['target_date']}",
                    "Score_Impact": -24,
                    "Priority": 7,
                    "_orb_status": "Applying",
                    "_input": {"orb": 1.25},
                    "Text_Description": "weekly aspect",
                    "Advised_Task": "adjust",
                },
                {
                    "T_Planet": "TRANSIT_MOON",
                    "N_Planet": "NATAL_MERCURY",
                    "Aspect_Angle": 90,
                    "Category": "Work",
                    "Countdown_Label": f"transit moon aspect {aspects[0]['target_date']}",
                    "Score_Impact": -30,
                    "Priority": 8,
                    "_orb_status": "Applying",
                    "_input": {"orb": 1.2},
                    "Text_Description": "transit moon non lunation",
                    "Advised_Task": "ignore",
                },
                {
                    "T_Planet": "TRANSIT_MERCURY",
                    "N_Planet": "NATAL_SUN",
                    "Aspect_Angle": 60,
                    "Category": "Work",
                    "Countdown_Label": f"low aspect {aspects[0]['target_date']}",
                    "Score_Impact": 10,
                    "Priority": 4,
                    "_orb_status": "Applying",
                    "_input": {"orb": 1.1},
                    "Text_Description": "low impact",
                    "Advised_Task": "ignore",
                }
            ]

        rows = [
            {
                "T_Planet": "TRANSIT_SUN",
                "N_Planet": "NATAL_SUN",
                "Aspect_Angle": 0,
                "Category": "Work",
                "Countdown_ID": "WORK_SUCCESS_JUPITER",
                "Countdown_Label": "sample",
                "Score_Impact": 60,
                "Priority": 8,
                "_orb_status": "Applying",
                "_input": {"orb": 2.0},
                "Text_Description": "sample",
                "Advised_Task": "sample",
            }
        ]

        with patch.object(reading_service, "swe", object()), patch(
            "backend.app.services.reading_service.build_transit_aspect_inputs",
            side_effect=fake_aspect_inputs,
        ), patch(
            "backend.app.services.reading_service.get_all_aspect_interpretations",
            side_effect=fake_interpretations,
        ), patch(
            "backend.app.services.reading_service._build_daily_performance",
            return_value=[],
        ), patch(
            "backend.app.services.reading_service._dashboard_planet_motion",
            return_value=[],
        ):
            dashboard = build_dashboard_data_from_interpretations(
                rows,
                {"modifier": 0, "items": []},
                birth_input=object(),
                current_dt=date(2026, 5, 2),
            )

        self.assertEqual(len(dashboard["weekly_aspects"]), 1)
        self.assertEqual(dashboard["weekly_aspects"][0]["date"], "2026-05-02")
        self.assertEqual(dashboard["weekly_aspects"][0]["days_until"], 0)
        self.assertEqual(dashboard["weekly_aspects"][0]["start_date"], "2026-05-02")
        self.assertEqual(dashboard["weekly_aspects"][0]["end_date"], "2026-05-07")
        self.assertEqual(dashboard["weekly_aspects"][0]["start_days_until"], 0)
        self.assertEqual(dashboard["weekly_aspects"][0]["end_days_until"], 5)
        self.assertEqual(len(dashboard["weekly_aspects"][0]["active_dates"]), 6)
        self.assertEqual(dashboard["weekly_aspects"][0]["scoreImpact"], -24)
        self.assertFalse(any(item["priority"] < 5 for item in dashboard["weekly_aspects"]))
        self.assertTrue(all(item["target"]["N_Planet"] == "NATAL_MOON" for item in dashboard["weekly_aspects"]))

    def test_display_countdown_items_prefer_future_days_over_past_peak(self):
        items = [
            {"title": "past peak", "days_remaining": 0, "scan_status": "turning_away"},
            {"title": "future peak", "days_remaining": 2, "scan_status": "closest"},
            {"title": "today exact", "days_remaining": 0, "scan_status": "exact"},
        ]

        selected = reading_service._select_display_countdown_items(items, limit=3)

        self.assertEqual([item["title"] for item in selected], ["future peak", "today exact", "past peak"])

    def test_countdown_scan_distinguishes_retrograde_turning_away(self):
        with patch("backend.app.services.reading_service._aspect_orb_at") as orb_mock, patch(
            "backend.app.services.reading_service._retrograde_calendar_start_day",
            return_value=1,
        ) as calendar_start_mock:
            orb_mock.side_effect = [
                (2.0, False),
                (1.0, True),
                (1.2, True),
                (1.1, True),
            ]
            scan = reading_service._scan_countdown_ephemeris(
                {
                    "T_Planet": "TRANSIT_MERCURY",
                    "N_Planet": "NATAL_SUN",
                    "Aspect_Angle": 120,
                    "_input": {"natal_longitude": 15.0, "timezone_offset": 9},
                },
                current_dt=datetime(2026, 5, 2),
                total_days=7,
                threshold_orb=5,
            )

        self.assertEqual(scan["scan_status"], "retrograde_turning_away")
        self.assertTrue(scan["peak_retrograde"])
        self.assertEqual(scan["retrograde_started_day"], 1)
        self.assertEqual(scan["calendar_retrograde_start_day"], 1)
        self.assertEqual(scan["retrograde_timing"], "at_peak")
        self.assertEqual(scan["reapproach_day"], 3)
        calendar_start_mock.assert_called_once()

    def test_countdown_scan_treats_after_peak_retrograde_start_as_regular_turning_away(self):
        with patch("backend.app.services.reading_service._aspect_orb_at") as orb_mock, patch(
            "backend.app.services.reading_service._retrograde_calendar_start_day",
            return_value=2,
        ):
            orb_mock.side_effect = [
                (2.0, False),
                (1.0, False),
                (1.2, True),
                (1.1, True),
            ]
            scan = reading_service._scan_countdown_ephemeris(
                {
                    "T_Planet": "TRANSIT_MERCURY",
                    "N_Planet": "NATAL_SUN",
                    "Aspect_Angle": 120,
                    "_input": {"natal_longitude": 15.0, "timezone_offset": 9},
                },
                current_dt=datetime(2026, 5, 2),
                total_days=7,
                threshold_orb=5,
            )

        self.assertEqual(scan["scan_status"], "turning_away")
        self.assertEqual(scan["retrograde_timing"], "after_peak")

    def test_countdown_scan_keeps_ephemeris_retrograde_without_calendar_start_as_turning_away(self):
        with patch("backend.app.services.reading_service._aspect_orb_at") as orb_mock, patch(
            "backend.app.services.reading_service._retrograde_calendar_start_day",
            return_value=None,
        ):
            orb_mock.side_effect = [
                (2.0, False),
                (1.0, True),
                (1.2, True),
                (1.1, True),
            ]
            scan = reading_service._scan_countdown_ephemeris(
                {
                    "T_Planet": "TRANSIT_MERCURY",
                    "N_Planet": "NATAL_SUN",
                    "Aspect_Angle": 120,
                    "_input": {"natal_longitude": 15.0, "timezone_offset": 9},
                },
                current_dt=datetime(2026, 5, 2),
                total_days=7,
                threshold_orb=5,
            )

        self.assertEqual(scan["scan_status"], "turning_away")
        self.assertIsNone(scan["calendar_retrograde_start_day"])

    def test_retrograde_calendar_start_day_uses_transit_calendar_master(self):
        self.assertEqual(
            reading_service._retrograde_calendar_start_day(
                "TRANSIT_MERCURY",
                datetime(2026, 2, 25, 12),
                2,
            ),
            1,
        )

    def test_dashboard_countdown_groups_include_negative_departure_items_without_separating_rows(self):
        rows = []
        short_planets = ["TRANSIT_MOON", "TRANSIT_MERCURY", "TRANSIT_VENUS"]
        long_planets = ["TRANSIT_JUPITER", "TRANSIT_SATURN", "TRANSIT_URANUS"]
        for index, planet in enumerate(short_planets):
            rows.append(
                {
                    "T_Planet": planet,
                    "N_Planet": "NATAL_SUN",
                    "Aspect_Angle": 120,
                    "Countdown_ID": "STUDY_EFFICIENCY_MAX",
                    "Countdown_Label": f"short positive {index}",
                    "Score_Impact": 40 + index,
                    "Priority": 8,
                    "_orb_status": "Separating" if index == 1 else "Applying",
                    "_input": {"orb": 1.0},
                }
            )
            rows.append(
                {
                    "T_Planet": planet,
                    "N_Planet": "NATAL_MOON",
                    "Aspect_Angle": 90,
                    "Countdown_ID": "MIND_BODY_BALANCE",
                    "Countdown_Label": f"short negative {index}",
                    "Score_Impact": -40 - index,
                    "Priority": 8,
                    "_orb_status": "Applying",
                    "_input": {"orb": 1.0},
                }
            )
        rows.extend(
            [
                {
                    "T_Planet": "TRANSIT_MOON",
                    "N_Planet": "NATAL_SUN",
                    "Aspect_Angle": 0,
                    "Countdown_ID": "STUDY_EFFICIENCY_MAX",
                    "Countdown_Label": "new moon positive",
                    "Score_Impact": 45,
                    "Priority": 8,
                    "_orb_status": "Applying",
                    "_input": {"orb": 1.0},
                },
                {
                    "T_Planet": "TRANSIT_MOON",
                    "N_Planet": "NATAL_SUN",
                    "Aspect_Angle": 180,
                    "Countdown_ID": "MIND_BODY_BALANCE",
                    "Countdown_Label": "full moon negative",
                    "Score_Impact": -45,
                    "Priority": 8,
                    "_orb_status": "Applying",
                    "_input": {"orb": 1.0},
                },
            ]
        )
        long_priorities = [9, 6, 3]
        for index, planet in enumerate(long_planets):
            rows.append(
                {
                    "T_Planet": planet,
                    "N_Planet": "NATAL_SUN",
                    "Aspect_Angle": 120,
                    "Countdown_ID": "WORK_SUCCESS_JUPITER",
                    "Countdown_Label": f"long positive {index}",
                    "Score_Impact": 60 + index,
                    "Priority": long_priorities[index],
                    "_orb_status": "Separating" if index == 1 else "Applying",
                    "_input": {"orb": 1.0},
                }
            )
            rows.append(
                {
                    "T_Planet": planet,
                    "N_Planet": "NATAL_MOON",
                    "Aspect_Angle": 90,
                    "Countdown_ID": "FATED_TURNING_POINT",
                    "Countdown_Label": f"long negative {index}",
                    "Score_Impact": -60 - index,
                    "Priority": long_priorities[index],
                    "_orb_status": "Applying",
                    "_input": {"orb": 1.0},
                }
            )

        with patch("backend.app.services.reading_service._scan_countdown_departure") as departure_scan_mock:
            departure_scan_mock.return_value = {
                "days_remaining": 3,
                "total_days": 10,
                "percent": 70,
                "scan_status": "departing",
                "departure_day": 3,
                "departure_orb": 5.1,
                "departure_retrograde": False,
            }
            dashboard = build_dashboard_data_from_interpretations(rows, {"modifier": 0, "items": []})

        self.assertEqual(len(dashboard["countdown_groups"]["short"]), 6)
        self.assertEqual(len(dashboard["countdown_groups"]["long"]), 6)
        self.assertEqual(
            [item["target"]["Countdown_Label"] for item in dashboard["countdown_groups"]["short"][:3]],
            ["new moon positive", "short positive 2", "short positive 1"],
        )
        self.assertTrue(
            all(item["target"]["Score_Impact"] > 0 for item in dashboard["countdown_groups"]["short"][:3])
        )
        self.assertEqual(
            [item["countdown_mode"] for item in dashboard["countdown_groups"]["short"][3:]],
            ["departure", "departure", "departure"],
        )
        self.assertEqual(
            [item["scan_status"] for item in dashboard["countdown_groups"]["short"][3:]],
            ["departing", "departing", "departing"],
        )
        self.assertEqual(
            [item["target"]["Countdown_Label"] for item in dashboard["countdown_groups"]["short"][3:]],
            ["full moon negative", "short negative 2", "short negative 1"],
        )
        self.assertTrue(
            all(item["target"]["Score_Impact"] < 0 for item in dashboard["countdown_groups"]["short"][3:])
        )
        self.assertEqual(
            [item["target"]["_orb_status"] for item in dashboard["countdown_groups"]["long"][:3]],
            ["Applying", "Separating", "Applying"],
        )
        self.assertTrue(
            all(item["target"]["Score_Impact"] > 0 for item in dashboard["countdown_groups"]["long"][:3])
        )
        self.assertEqual(
            [item["countdown_mode"] for item in dashboard["countdown_groups"]["long"][3:]],
            ["departure", "departure", "departure"],
        )
        self.assertEqual(
            [item["scan_status"] for item in dashboard["countdown_groups"]["long"][3:]],
            ["departing", "departing", "departing"],
        )
        self.assertEqual(
            [item["target"]["_orb_status"] for item in dashboard["countdown_groups"]["long"][3:]],
            ["Applying", "Applying", "Applying"],
        )
        self.assertTrue(
            all(item["target"]["Score_Impact"] < 0 for item in dashboard["countdown_groups"]["long"][3:])
        )
        self.assertEqual(len(dashboard["countdown_groups"]["legacy_short"]), 3)
        self.assertEqual(len(dashboard["countdown_groups"]["legacy_long"]), 3)
        self.assertEqual(len(dashboard["countdown_groups"]["long_by_priority"]["high"]), 2)
        self.assertEqual(len(dashboard["countdown_groups"]["long_by_priority"]["middle"]), 2)
        self.assertEqual(len(dashboard["countdown_groups"]["long_by_priority"]["low"]), 2)
        self.assertTrue(
            all(item["priority_band"] == "high" for item in dashboard["countdown_groups"]["long_by_priority"]["high"])
        )

    def test_yearly_forecast_weight_and_orb_decay_helpers(self):
        self.assertEqual(_priority_weight(10), 3.0)
        self.assertEqual(_priority_weight(8), 2.0)
        self.assertEqual(_priority_weight(3), 1.0)
        self.assertEqual(_orb_decay(0, 180), 1.0)
        self.assertEqual(_orb_decay(8, 180), 0.2)

    def test_yearly_forecast_countdown_label_trims_display_suffix(self):
        self.assertEqual(_display_countdown_label("恋愛運ピーク日"), "恋愛運ピーク")
        self.assertEqual(_display_countdown_label("大きな転機まで"), "大きな転機")
        self.assertEqual(_display_countdown_label("収穫日まで"), "収穫")
        self.assertEqual(_display_countdown_label("そのまま表示"), "そのまま表示")

    def test_yearly_forecast_extracts_extreme_and_sudden_change_milestones(self):
        yearly_data = [
            {"date": "2026-01-01", "scores": {"total": 10}, "events": []},
            {
                "date": "2026-01-02",
                "scores": {"total": 50},
                "events": [
                    {
                        "id": "LUCKY_GOLDEN_PERIOD",
                        "title": "Career peak",
                        "description": "A strong shift.",
                        "advised_task": "Focus on work.",
                        "priority": 10,
                        "t_planet": "JUPITER",
                        "n_planet": "MC",
                        "aspect_angle": 120,
                        "orb_status": "Separating",
                    }
                ],
            },
            {"date": "2026-01-03", "scores": {"total": 20}, "events": []},
        ]

        milestones = extract_milestones(yearly_data)

        self.assertEqual(milestones[0]["date"], "2026-01-02")
        self.assertEqual(milestones[0]["id"], "LUCKY_GOLDEN_PERIOD")
        self.assertIn(milestones[0]["label"], {"運命の頂点", "運命の分岐点"})

    def test_yearly_forecast_cache_payload_targets_cache_table(self):
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

        cache_payload = build_yearly_forecast_cache_payload(payload, 2026)

        self.assertEqual(cache_payload["table"], "yearly_forecast_cache")
        self.assertEqual(cache_payload["refresh_policy"], "login_or_weekly")
        self.assertIn("1984-08-26", cache_payload["cache_key"])

    def test_daily_vibe_modifier_is_clamped(self):
        daily_vibe = get_daily_vibe_modifiers(
            event_types=["VOID_TIME", "STATIONARY", "ECLIPSE", "CRITICAL_DEGREE"]
        )

        self.assertLess(daily_vibe["raw_modifier"], -60)
        self.assertEqual(daily_vibe["modifier"], -60)

    def test_hero_score_adds_baseline_to_average_aspect_score(self):
        dashboard_data = build_dashboard_data_from_interpretations(
            [
                {"Score_Impact": -20, "Priority": 1, "Text_Description": "a"},
                {"Score_Impact": 10, "Priority": 1, "Text_Description": "b"},
            ],
            {"modifier": 0, "raw_modifier": 0, "items": []},
        )

        self.assertEqual(dashboard_data["hero"]["score"], 40)
        self.assertEqual(dashboard_data["hero"]["rank"], "D")

    def test_current_retrograde_planets_uses_transit_state(self):
        def fake_transit_state(planet, sample_local_dt, timezone_offset):
            return 0.0, planet in {"MERCURY", "SATURN"}

        with patch.object(reading_service, "swe", object()):
            with patch.object(reading_service, "_calc_transit_planet_state", side_effect=fake_transit_state):
                retrograde_planets = reading_service.build_current_retrograde_planets(
                    datetime(2026, 5, 8, 12, 0),
                    timezone_offset=9,
                )

        self.assertEqual(retrograde_planets, ["MERCURY", "SATURN"])

    def test_planet_motion_indicators_exclude_sun_and_moon(self):
        current_speeds = {
            "MERCURY": 0.4,
            "VENUS": 0.01,
            "MARS": -0.1,
            "JUPITER": 0.2,
            "SATURN": 0.1,
            "URANUS": 0.0,
            "NEPTUNE": 0.0,
            "PLUTO": -0.0001,
        }
        future_speeds = {
            **current_speeds,
            "VENUS": -0.01,
            "URANUS": -0.001,
            "NEPTUNE": -0.001,
        }

        def fake_motion(planet, sample_local_dt, timezone_offset):
            speeds = future_speeds if sample_local_dt.day == 11 else current_speeds
            return 100.0, speeds[planet]

        with patch.object(reading_service, "swe", object()):
            with patch.object(reading_service, "_calc_transit_planet_motion", side_effect=fake_motion):
                indicators = reading_service.build_current_planet_motion_indicators(
                    datetime(2026, 5, 8, 12, 0),
                    timezone_offset=9,
                )

        self.assertEqual([item["planet"] for item in indicators], [
            "MERCURY",
            "VENUS",
            "MARS",
            "JUPITER",
            "SATURN",
            "URANUS",
            "NEPTUNE",
            "PLUTO",
        ])
        self.assertEqual(indicators[0]["status"], "direct")
        self.assertEqual(indicators[1]["status"], "stationary")
        self.assertEqual(indicators[2]["status"], "retrograde")
        self.assertEqual(indicators[5]["status"], "direct")
        self.assertEqual(indicators[6]["status"], "direct")
        self.assertEqual(indicators[7]["status"], "retrograde")

    def test_stationary_indicator_only_before_direction_change(self):
        scenarios = [
            ("MERCURY", 0.01, -0.01, "stationary"),
            ("MERCURY", -0.01, 0.01, "stationary"),
            ("MERCURY", -0.01, -0.02, "retrograde"),
            ("MERCURY", 0.01, 0.02, "direct"),
            ("MERCURY", 0.2, -0.2, "direct"),
            ("URANUS", 0.0, -0.001, "direct"),
        ]

        for planet, current_speed, future_speed, expected in scenarios:
            with self.subTest(planet=planet, current_speed=current_speed, future_speed=future_speed):
                self.assertEqual(
                    reading_service._motion_status_from_speed(planet, current_speed, future_speed),
                    expected,
                )

    def test_dashboard_data_falls_back_to_calm_day_without_aspects(self):
        dashboard_data = build_dashboard_data_from_aspects(aspects=[])

        self.assertEqual(dashboard_data["hero"]["score"], 50)
        self.assertEqual(dashboard_data["aspect_interpretations"], [])
        self.assertNotIn("timeline", dashboard_data)
        self.assertIn("dailyPerformance", dashboard_data)
        self.assertEqual(dashboard_data["diagnostic"]["score"], 50)
        self.assertTrue(dashboard_data["topics"])

    def test_location_search_success(self):
        fake_match = LocationMatch(
            query="Tokyo",
            display_name="Tokyo, Tokyo, Japan",
            latitude=35.6762,
            longitude=139.6503,
            timezone_name="Asia/Tokyo",
            timezone_offset=None,
            resolved_at=None,
        )

        with patch("backend.app.services.geocoding_service.search_locations", return_value=[fake_match]):
            response = location_search(
                q="Tokyo",
                birth_date=None,
                birth_time=None,
                birth_time_unknown=False,
                limit=5,
            )

        self.assertEqual(len(response.results), 1)
        self.assertEqual(response.results[0].timezone_name, "Asia/Tokyo")
        self.assertIsNone(response.results[0].timezone_offset)

    def test_create_reading_uses_timezone_name_when_offset_is_missing(self):
        def fake_generate_readings(payload):
            return ReadingResponse(
                meta=ReadingMeta(
                    full_name=payload.full_name,
                    birthplace=payload.birthplace,
                    birth_date=payload.birth_date.isoformat(),
                    birth_time=payload.birth_time.strftime("%H:%M"),
                    birth_time_unknown=payload.birth_time_unknown,
                    timezone_offset=9.0,
                    timezone_name=payload.timezone_name,
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
                birthplace="Tokyo, Tokyo, Japan",
                latitude=35.6812,
                longitude=139.7671,
                timezone_offset=None,
                timezone_name="Asia/Tokyo",
            )
            response = create_reading(payload)

        self.assertEqual(response.meta.timezone_name, "Asia/Tokyo")

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

    def test_create_yearly_forecast_success(self):
        fake_forecast = {
            "summary": "2026年は後半に向けて仕事運が上昇します",
            "yearly_data": [],
            "milestones": [],
        }

        with patch(
            "backend.app.services.yearly_forecast_service.generate_yearly_forecast",
            return_value=fake_forecast,
        ):
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
            response = create_yearly_forecast(payload)

        self.assertEqual(response, fake_forecast)

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
        self.assertTrue(all("MOON" not in (row[0], row[1]) for row in chart_rows["aspects"]))

    def test_transit_aspect_inputs_use_current_transits_not_natal_aspects(self):
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
                return 456.0 if year == 2026 else 123.0

            def houses(self, jd, latitude, longitude, house_system):
                return ([0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330], [15, 105])

            def calc_ut(self, jd, planet_id, flag):
                natal_positions = {
                    self.SUN: 0.0,
                    self.MOON: 60.0,
                    self.MERCURY: 20.0,
                    self.VENUS: 40.0,
                    self.MARS: 80.0,
                    self.JUPITER: 100.0,
                    self.SATURN: 140.0,
                    self.URANUS: 160.0,
                    self.NEPTUNE: 200.0,
                    self.PLUTO: 220.0,
                    self.TRUE_NODE: 240.0,
                }
                transit_positions = {
                    self.SUN: 180.0,
                    self.MOON: 10.0,
                    self.MERCURY: 25.0,
                    self.VENUS: 45.0,
                    self.MARS: 85.0,
                    self.JUPITER: 105.0,
                    self.SATURN: 145.0,
                    self.URANUS: 165.0,
                    self.NEPTUNE: 205.0,
                    self.PLUTO: 225.0,
                }
                positions = transit_positions if jd == 456.0 else natal_positions
                return ([positions[planet_id], 0, 0, 1.0], None)

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

        with patch("backend.app.services.chart_calculator.swe", new=FakeSwe()), patch(
            "backend.app.services.reading_service.swe", new=FakeSwe()
        ):
            inputs = build_transit_aspect_inputs(payload, datetime(2026, 5, 1, 12, 0))

        self.assertIn(
            {
                "t_planet": "SUN",
                "n_planet": "SUN",
                "angle": 180,
                "orb_status": "Separating",
                "house": 1,
                "is_retrograde": False,
                "orb": 0.0,
                "transit_longitude": 180.0,
                "natal_longitude": 0.0,
                "angle_diff": 180.0,
                "timezone_offset": 9,
            },
            inputs,
        )
        self.assertNotIn(
            ("SUN", "MOON", 60),
            {(row["t_planet"], row["n_planet"], row["angle"]) for row in inputs},
        )

    def test_unknown_birth_time_chart_data_uses_dash_for_angle_and_house_fields(self):
        chart_rows = {
            "planets": [
                ["太陽", 156.0, "乙女座", 6.0, "Direct", "-"],
                ["月", 110.0, "蟹座", 20.0, "Direct", "-"],
                ["水星", 170.0, "乙女座", 20.0, "Direct", "-"],
                ["金星", 210.0, "天秤座", 0.0, "Direct", "-"],
                ["火星", 45.0, "牡牛座", 15.0, "Direct", "-"],
                ["木星", 280.0, "山羊座", 10.0, "Direct", "-"],
                ["土星", 240.0, "射手座", 0.0, "Direct", "-"],
                ["天王星", 250.0, "射手座", 10.0, "Direct", "-"],
                ["海王星", 260.0, "射手座", 20.0, "Direct", "-"],
                ["冥王星", 200.0, "天秤座", 20.0, "Direct", "-"],
                ["ドラゴンヘッド", 70.0, "双子座", 10.0, "Direct", "-"],
                ["ドラゴンテイル", 250.0, "射手座", 10.0, "Direct", "-"],
            ],
            "angles": [["-", "-", "-", "-"], ["-", "-", "-", "-"]],
            "houses": [["-", "-", "-", "-"] for _ in range(12)],
            "aspects": [
                ["SUN", "MOON", 156.0, 110.0, 46.0, "SEXTILE", 60, 14.0],
            ],
        }

        tmp = Path("backend/tests/_tmp_chart_data")

        tmp = Path("backend/tests/_tmp_chart_data")
        shutil.rmtree(tmp, ignore_errors=True)
        tmp.mkdir(parents=True, exist_ok=True)
        try:
            files = write_chart_csvs(chart_rows, tmp)
            chart_data = build_natal_chart_data(files["planets"], files["angles"], files["houses"])
            transit_data = load_transit_support_data(files["aspects"], files["houses"])
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

        self.assertEqual(chart_data["sun"], "Virgo")
        self.assertEqual(chart_data["asc"], "-")
        self.assertEqual(chart_data["mc"], "-")
        self.assertEqual(chart_data["house7"], "-")
        self.assertEqual(chart_data["house10"], "-")
        self.assertFalse(bool(transit_data["house_map"]))


if __name__ == "__main__":
    unittest.main()

