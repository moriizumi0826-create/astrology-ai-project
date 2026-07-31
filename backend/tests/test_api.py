import shutil
import unittest
from datetime import date, datetime, time
from pathlib import Path
from unittest.mock import patch

import pandas as pd
from fastapi.encoders import jsonable_encoder
from fastapi import HTTPException
from pydantic import ValidationError
from starlette.middleware.gzip import GZipMiddleware

from backend.app.main import (
    app,
    create_deferred_reading_widgets,
    create_reading,
    create_yearly_forecast,
    create_yearly_forecast_detail,
    health_check,
    location_search,
    master_version,
    root,
)
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
    build_yearly_forecast_cache_payload,
)
from backend.app.schemas import ReadingMeta, ReadingRequest, ReadingResponse, ReadingSection
from backend.app.settings import Settings
from scripts.natal_loader import build_natal_chart_data
from scripts.transit_loader import load_transit_support_data


class ApiTestCase(unittest.TestCase):
    def test_cors_settings_keep_configured_and_public_origins(self):
        with patch.dict(
            "os.environ",
            {
                "API_CORS_ORIGINS": "http://localhost:5173,https://example.com",
                "API_PUBLIC_CORS_ORIGINS": "https://moriizumi0826-create.github.io,https://example.com",
            },
        ):
            configured = Settings()

        self.assertEqual(
            configured.api_cors_origins,
            [
                "http://localhost:5173",
                "https://example.com",
                "https://moriizumi0826-create.github.io",
            ],
        )

    def test_root(self):
        self.assertEqual(
            root(),
            {"message": "Celestial Atelier API", "health": "/api/health", "docs": "/docs"},
        )

    def test_health_check(self):
        self.assertEqual(health_check(), {"status": "ok"})

    def test_large_responses_enable_gzip_middleware(self):
        gzip_middleware = [
            middleware
            for middleware in app.user_middleware
            if middleware.cls is GZipMiddleware
        ]

        self.assertEqual(len(gzip_middleware), 1)
        self.assertEqual(gzip_middleware[0].kwargs["minimum_size"], 1000)

    def test_master_version_returns_version_payload(self):
        response = master_version()

        self.assertTrue(response["masterVersion"])
        self.assertEqual(response["masterVersion"], response["master_version"])
        self.assertGreater(response["fileCount"], 0)

    def test_aspect_master_indexes_share_single_records_conversion(self):
        class CountingDataFrame(pd.DataFrame):
            conversion_count = 0

            def to_dict(self, *args, **kwargs):
                self.conversion_count += 1
                return super().to_dict(*args, **kwargs)

        aspect_df = CountingDataFrame([
            {
                "T_Planet": "TRANSIT_SUN",
                "N_Planet": "NATAL_MOON",
                "Aspect_Angle": 90,
                "timeline_advise": "take a break",
                "Pressure_Score": -40,
            },
            {
                "T_Planet": "TRANSIT_SUN",
                "N_Planet": "NATAL_MOON",
                "Aspect_Angle": 90,
                "timeline_advise": "",
                "Pressure_Score": -30,
            },
        ])

        with patch.object(reading_service, "MASTER_DATAFRAMES", {"aspect": aspect_df}), patch.object(
            reading_service, "_ASPECT_CANDIDATES_BY_KEY", None
        ), patch.object(
            reading_service, "_MASTER_TIMELINE_ADVISE_LOOKUP", None
        ), patch.object(
            reading_service, "_MASTER_PRESSURE_SCORE_LOOKUP", None
        ):
            reading_service._ensure_aspect_master_indexes()
            timeline_lookup = reading_service._build_master_timeline_advise_lookup()
            pressure_lookup = reading_service._build_master_pressure_score_lookup()
            reading_service._ensure_aspect_master_indexes()

            candidates = reading_service._ASPECT_CANDIDATES_BY_KEY[("SUN", "MOON", 90)]
            self.assertEqual(len(candidates), 2)
            self.assertEqual(timeline_lookup[("SUN", "MOON", 90)], "take a break")
            self.assertEqual(pressure_lookup[("SUN", "MOON", 90)], -30)
            self.assertEqual(aspect_df.conversion_count, 1)

    def test_master_reload_invalidates_all_aspect_indexes(self):
        replacement_frames = {"aspect": pd.DataFrame()}

        with patch.object(reading_service, "MASTER_DATAFRAMES", reading_service.MASTER_DATAFRAMES), patch.object(
            reading_service, "_MASTER_CSV_SIGNATURE", reading_service._MASTER_CSV_SIGNATURE
        ), patch.object(
            reading_service, "load_master_dataframes", return_value=replacement_frames
        ), patch.object(
            reading_service, "_csv_file_signature", return_value=(("replacement", 1, 1),)
        ), patch.object(
            reading_service, "_ASPECT_CANDIDATES_BY_KEY", {("SUN", "MOON", 90): [{}]}
        ), patch.object(
            reading_service,
            "_ASPECT_GENRE_DESCRIPTION_LOOKUP",
            {("SUN", "MOON", 90, 1): {"love": "old", "work": "old", "money": "old"}},
        ), patch.object(
            reading_service,
            "_ASPECT_GENRE_SCORE_IMPACT_LOOKUP",
            {("SUN", "MOON", 90, 1): {"love": 1, "work": 2, "money": 3}},
        ), patch.object(
            reading_service, "_MASTER_TIMELINE_ADVISE_LOOKUP", {("SUN", "MOON", 90): "old"}
        ), patch.object(
            reading_service, "_MASTER_PRESSURE_SCORE_LOOKUP", {("SUN", "MOON", 90): -40}
        ), patch.object(
            reading_service, "_COUNTDOWN_MASTER_LOOKUP", {"LUCKY": {"Trigger_ID": "LUCKY"}}
        ), patch.object(
            reading_service, "_TRANSIT_RETROGRADE_START_DATES_BY_PLANET", {"MERCURY": (date(2026, 1, 1),)}
        ), patch.object(
            reading_service, "_RETROGRADE_CALENDAR_INDEX", {("", ""): ()}
        ), patch.object(
            reading_service, "_ASPECT_INTERPRETATION_CACHE", {("SUN", "MOON", 90, 1, False, "Applying"): {}}
        ):
            reloaded = reading_service.reload_master_dataframes_if_changed(force=True)

            self.assertTrue(reloaded)
            self.assertIs(reading_service.MASTER_DATAFRAMES, replacement_frames)
            self.assertIsNone(reading_service._ASPECT_CANDIDATES_BY_KEY)
            self.assertIsNone(reading_service._ASPECT_GENRE_DESCRIPTION_LOOKUP)
            self.assertIsNone(reading_service._ASPECT_GENRE_SCORE_IMPACT_LOOKUP)
            self.assertIsNone(reading_service._MASTER_TIMELINE_ADVISE_LOOKUP)
            self.assertIsNone(reading_service._MASTER_PRESSURE_SCORE_LOOKUP)
            self.assertIsNone(reading_service._COUNTDOWN_MASTER_LOOKUP)
            self.assertIsNone(reading_service._TRANSIT_RETROGRADE_START_DATES_BY_PLANET)
            self.assertIsNone(reading_service._RETROGRADE_CALENDAR_INDEX)
            self.assertEqual(reading_service._ASPECT_INTERPRETATION_CACHE, {})

    def test_countdown_master_lookup_is_built_once_and_keeps_highest_priority(self):
        class CountingDataFrame(pd.DataFrame):
            conversion_count = 0

            def to_dict(self, *args, **kwargs):
                self.conversion_count += 1
                return super().to_dict(*args, **kwargs)

        countdown_df = CountingDataFrame([
            {"Trigger_ID": "LUCKY", "Priority": 2, "Next_Action_Hint": "low"},
            {"Trigger_ID": "LUCKY", "Priority": 8, "Next_Action_Hint": "high"},
            {"Trigger_ID": "RELIEF", "Priority": 4, "Next_Action_Hint": "rest"},
        ])

        with patch.object(reading_service, "MASTER_DATAFRAMES", {"countdown": countdown_df}), patch.object(
            reading_service, "_COUNTDOWN_MASTER_LOOKUP", None
        ):
            first = reading_service.get_countdown_master_row("LUCKY")
            second = reading_service.get_countdown_master_row("LUCKY")
            relief = reading_service.get_countdown_master_row("RELIEF")

            self.assertEqual(first["Next_Action_Hint"], "high")
            self.assertIs(first, second)
            self.assertEqual(relief["Next_Action_Hint"], "rest")
            self.assertEqual(countdown_df.conversion_count, 1)

    def test_calendar_indexes_convert_each_master_once_and_preserve_filters(self):
        class CountingDataFrame(pd.DataFrame):
            conversion_count = 0

            def to_dict(self, *args, **kwargs):
                self.conversion_count += 1
                return super().to_dict(*args, **kwargs)

        transit_df = CountingDataFrame([
            {"Date": "2026-07-20", "Planet": "MERCURY", "Retrograde_Start_Flag": 1},
            {"Date": "2026-07-22", "Planet": "VENUS", "Retrograde_Start_Flag": 1},
            {"Date": "2026-07-25", "Planet": "MERCURY", "Retrograde_Start_Flag": 0},
        ])
        retrograde_df = CountingDataFrame([
            {
                "Planet": "MERCURY",
                "Event_Type": "DIRECT_START",
                "Event_Date": "2026-07-24",
                "Event_DateTime_JST": "2026-07-24 07:00:00",
            },
            {
                "Planet": "NEPTUNE",
                "Event_Type": "RETROGRADE_START",
                "Event_Date": "2026-07-21",
                "Event_DateTime_JST": "2026-07-21 19:00:00",
            },
            {
                "Planet": "MERCURY",
                "Event_Type": "RETROGRADE_START",
                "Event_Date": "2026-07-19",
                "Event_DateTime_JST": "2026-07-19 02:00:00",
            },
        ])

        with patch.object(
            reading_service,
            "MASTER_DATAFRAMES",
            {"transit_calendar": transit_df, "retrograde_calendar": retrograde_df},
        ), patch.object(
            reading_service, "_TRANSIT_RETROGRADE_START_DATES_BY_PLANET", None
        ), patch.object(
            reading_service, "_RETROGRADE_CALENDAR_INDEX", None
        ):
            start_day = reading_service._retrograde_calendar_start_day(
                "TRANSIT_MERCURY", datetime(2026, 7, 19, 12), 3
            )
            future_rows = reading_service._retrograde_calendar_rows(date(2026, 7, 20))
            mercury_direct = reading_service._retrograde_calendar_rows(
                date(2026, 7, 20), planet="MERCURY", event_type="DIRECT_START"
            )
            reading_service._retrograde_calendar_rows(date(2026, 7, 20))

            self.assertEqual(start_day, 1)
            self.assertEqual([row["Planet"] for row in future_rows], ["NEPTUNE", "MERCURY"])
            self.assertEqual(len(mercury_direct), 1)
            self.assertEqual(mercury_direct[0]["Event_Date"], "2026-07-24")
            self.assertEqual(transit_df.conversion_count, 1)
            self.assertEqual(retrograde_df.conversion_count, 1)

    def test_aspect_genre_descriptions_use_house_level_representative_row(self):
        base = {
            "T_Planet": "TRANSIT_VENUS",
            "N_Planet": "NATAL_MARS",
            "Aspect_Angle": 120,
            "N_House": 7,
        }
        rows = [
            {
                **base,
                "N_Sign_Element": "Earth",
                "T_Retrograde_Flag": 0,
                "Orb_Status": "Applying",
                "Love_Text_Description": "Earth love",
                "Work_Text_Description": "Earth work",
                "Money_Text_Description": "Earth money",
                "_csv_row": 2,
            },
            {
                **base,
                "N_Sign_Element": "Fire",
                "T_Retrograde_Flag": 1,
                "Orb_Status": "Applying",
                "Love_Text_Description": "Retrograde love",
                "Work_Text_Description": "Retrograde work",
                "Money_Text_Description": "Retrograde money",
                "_csv_row": 3,
            },
            {
                **base,
                "N_Sign_Element": "Fire",
                "T_Retrograde_Flag": 0,
                "Orb_Status": "Separating",
                "Love_Text_Description": "Separating love",
                "Work_Text_Description": "Separating work",
                "Money_Text_Description": "Separating money",
                "_csv_row": 4,
            },
            {
                **base,
                "N_Sign_Element": "Fire",
                "T_Retrograde_Flag": 0,
                "Orb_Status": "Applying",
                "Love_Text_Description": "Representative love",
                "Work_Text_Description": "Representative work",
                "Money_Text_Description": "Representative money",
                "_csv_row": 5,
            },
            {
                **base,
                "N_House": 8,
                "N_Sign_Element": "Fire",
                "T_Retrograde_Flag": 0,
                "Orb_Status": "Applying",
                "Love_Text_Description": "-",
                "Work_Text_Description": "",
                "Money_Text_Description": None,
                "_csv_row": 6,
            },
        ]

        lookup = reading_service._build_aspect_genre_description_lookup(rows)

        self.assertEqual(
            lookup[("VENUS", "MARS", 120, 7)],
            {
                "love": "Representative love",
                "work": "Representative work",
                "money": "Representative money",
            },
        )
        self.assertEqual(
            lookup[("VENUS", "MARS", 120, 8)],
            {"love": "", "work": "", "money": ""},
        )

    def test_aspect_genre_scores_use_house_level_representative_row(self):
        base = {
            "T_Planet": "TRANSIT_VENUS",
            "N_Planet": "NATAL_MARS",
            "Aspect_Angle": 120,
            "N_House": 7,
        }
        rows = [
            {
                **base,
                "N_Sign_Element": "Earth",
                "T_Retrograde_Flag": 0,
                "Orb_Status": "Applying",
                "Love_Score_Impact": "99",
                "Work_Score_Impact": "99",
                "Money_Score_Impact": "99",
                "_csv_row": 2,
            },
            {
                **base,
                "N_Sign_Element": "Fire",
                "T_Retrograde_Flag": 0,
                "Orb_Status": "Applying",
                "Love_Score_Impact": "42",
                "Work_Score_Impact": "-31",
                "Money_Score_Impact": "-",
                "_csv_row": 3,
            },
        ]

        lookup = reading_service._build_aspect_genre_score_impact_lookup(rows)

        self.assertEqual(
            lookup[("VENUS", "MARS", 120, 7)],
            {"love": 42.0, "work": -31.0, "money": None},
        )

    def test_aspect_genre_dual_scores_use_house_level_representative_row(self):
        base = {
            "T_Planet": "TRANSIT_VENUS",
            "N_Planet": "NATAL_MARS",
            "Aspect_Angle": 90,
            "N_House": 7,
        }
        rows = [
            {
                **base,
                "N_Sign_Element": "Earth",
                "T_Retrograde_Flag": 0,
                "Orb_Status": "Applying",
                "Love_Positive_Impact": "99",
                "Love_Negative_Impact": "99",
                "Work_Positive_Impact": "99",
                "Work_Negative_Impact": "99",
                "Money_Positive_Impact": "99",
                "Money_Negative_Impact": "99",
                "_csv_row": 2,
            },
            {
                **base,
                "N_Sign_Element": "Fire",
                "T_Retrograde_Flag": 0,
                "Orb_Status": "Applying",
                "Love_Positive_Impact": "15",
                "Love_Negative_Impact": "65",
                "Work_Positive_Impact": "0",
                "Work_Negative_Impact": "50",
                "Money_Positive_Impact": "",
                "Money_Negative_Impact": "",
                "_csv_row": 3,
            },
        ]

        lookup = reading_service._build_aspect_genre_dual_score_lookup(rows)

        self.assertEqual(
            lookup[("VENUS", "MARS", 90, 7)],
            {
                "love": {"positive": 15.0, "negative": 65.0},
                "work": {"positive": 0.0, "negative": 50.0},
                "money": {"positive": None, "negative": None},
            },
        )

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
        self.assertEqual(row["Score_Impact"], 70)

    def test_aspect_dashboard_data_maps_csv_columns(self):
        dashboard_data = get_aspect_dashboard_data(
            t_planet="SUN",
            n_planet="SUN",
            angle=0,
            house=1,
            is_retrograde=False,
            orb_status="Applying",
        )

        self.assertTrue(dashboard_data["dailyStarVibe"])
        self.assertIn("positive", dashboard_data["aspectHighlights"])
        self.assertIn("countdown", dashboard_data)
        self.assertIn("dailyPerformance", dashboard_data)
        self.assertNotIn("timeline", dashboard_data)
        self.assertNotIn("hero", dashboard_data)
        self.assertNotIn("topics", dashboard_data)
        self.assertNotIn("diagnostic", dashboard_data)
        self.assertNotIn("developerMeta", dashboard_data)

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
        self.assertTrue(dashboard_data["dailyStarVibe"])
        self.assertIn("positive", dashboard_data["aspectHighlights"])
        self.assertNotIn("title", dashboard_data["countdown"])
        self.assertNotIn("fallback_label", dashboard_data["countdown"])
        self.assertTrue(dashboard_data["countdown"]["trigger_id"])
        self.assertNotIn("hero", dashboard_data)
        self.assertNotIn("topics", dashboard_data)
        self.assertNotIn("diagnostic", dashboard_data)
        self.assertNotIn("developerMeta", dashboard_data)

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
        positive_descriptions = [item["description"] for item in dashboard_data["aspectHighlights"]["positive"]]

        self.assertEqual(positive_descriptions, ["venus text"])

        peak_rows = [dict(row) for row in base_rows]
        peak_rows[0]["_input"] = {"orb": 0.0}
        dashboard_data = build_dashboard_data_from_interpretations(peak_rows, {"modifier": 0, "items": []})
        positive_descriptions = [item["description"] for item in dashboard_data["aspectHighlights"]["positive"]]

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
            positive_descriptions = [item["description"] for item in dashboard_data["aspectHighlights"]["positive"]]
            self.assertEqual(positive_descriptions, ["mars peak day text", "venus text"])

            dashboard_data = build_dashboard_data_from_interpretations(
                rows,
                {"modifier": 0, "items": []},
                current_dt=date(2026, 5, 19),
            )
            positive_descriptions = [item["description"] for item in dashboard_data["aspectHighlights"]["positive"]]
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
        self.assertIn("dailyStarVibe", encoded)
        self.assertIn("aspectHighlights", encoded)
        self.assertNotIn("hero", encoded)

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

    def test_daily_performance_positive_fast_aspect_buffers_friction(self):
        negative_row = {
            "T_Planet": "TRANSIT_MOON",
            "N_Planet": "NATAL_MOON",
            "Aspect_Angle": 90,
            "Score_Impact": -40,
            "_input": {"orb": 1.0},
        }
        positive_row = {
            "T_Planet": "TRANSIT_MERCURY",
            "N_Planet": "NATAL_SUN",
            "Aspect_Angle": 60,
            "Score_Impact": 40,
            "_input": {"orb": 1.0},
        }
        empty_environment = {
            "totals": {key: 0.0 for key in ("drive", "flow", "inspiration", "friction", "mars")},
            "breakdown": {key: [] for key in ("drive", "flow", "inspiration", "friction", "mars")},
        }

        with patch.object(reading_service, "_build_natal_planet_rows", return_value=[]), patch.object(
            reading_service,
            "_build_slot_interpretations",
            return_value=[negative_row, positive_row],
        ), patch.object(
            reading_service,
            "_daily_performance_environment_layer",
            return_value=empty_environment,
        ):
            point = reading_service._build_daily_performance(
                object(),
                date(2026, 10, 1),
                {"modifier": 0, "items": []},
            )[0]

        friction_items = point["breakdown"]["friction"]
        pressure = next(item for item in friction_items if item["note"] == "Fast planet friction")
        support = next(item for item in friction_items if item["note"] == "Fast planet support")
        self.assertEqual(point["friction"], 30)
        self.assertEqual(pressure["contribution"], 11.34)
        self.assertEqual(support["contribution"], -1.51)

    def test_daily_performance_pressure_floor_uses_score_priority_and_angle_orb(self):
        floor = reading_service._daily_performance_pressure_floor({
            "T_Planet": "TRANSIT_MOON",
            "N_Planet": "NATAL_PLUTO",
            "Aspect_Angle": 0,
            "Score_Impact": -54,
            "Priority": 7,
            "_input": {"orb": 0.76},
        })

        self.assertAlmostEqual(floor, 42.04, places=2)

    def test_daily_performance_pressure_floor_ignores_mild_or_out_of_orb_rows(self):
        self.assertIsNone(reading_service._daily_performance_pressure_floor({
            "T_Planet": "TRANSIT_MOON",
            "Aspect_Angle": 0,
            "Score_Impact": -24,
            "Priority": 10,
            "_input": {"orb": 0},
        }))
        self.assertIsNone(reading_service._daily_performance_pressure_floor({
            "T_Planet": "TRANSIT_MOON",
            "Aspect_Angle": 90,
            "Score_Impact": -60,
            "Priority": 10,
            "_input": {"orb": 6},
        }))

    def test_daily_performance_pressure_floor_ignores_long_term_transits(self):
        for planet in ("JUPITER", "SATURN", "URANUS", "NEPTUNE", "PLUTO"):
            with self.subTest(planet=planet):
                self.assertIsNone(reading_service._daily_performance_pressure_floor({
                    "T_Planet": f"TRANSIT_{planet}",
                    "N_Planet": "NATAL_MARS",
                    "Aspect_Angle": 180,
                    "Score_Impact": -60,
                    "Priority": 10,
                    "_input": {"orb": 0},
                }))

    def test_daily_performance_uses_venus_and_selected_jupiter_venus_support(self):
        negative_row = {
            "T_Planet": "TRANSIT_MOON",
            "N_Planet": "NATAL_MOON",
            "Aspect_Angle": 90,
            "Score_Impact": -40,
            "_input": {"orb": 1.0},
        }
        venus_row = {
            "T_Planet": "TRANSIT_VENUS",
            "N_Planet": "NATAL_SUN",
            "Aspect_Angle": 60,
            "Score_Impact": 40,
            "_input": {"orb": 1.0},
        }
        jupiter_venus_row = {
            "T_Planet": "TRANSIT_JUPITER",
            "N_Planet": "NATAL_VENUS",
            "Aspect_Angle": 0,
            "Score_Impact": 40,
            "_input": {"orb": 1.0},
        }
        empty_environment = {
            "totals": {key: 0.0 for key in ("drive", "flow", "inspiration", "friction", "mars")},
            "breakdown": {key: [] for key in ("drive", "flow", "inspiration", "friction", "mars")},
        }

        with patch.object(reading_service, "_build_natal_planet_rows", return_value=[]), patch.object(
            reading_service,
            "_build_slot_interpretations",
            return_value=[negative_row, venus_row, jupiter_venus_row],
        ), patch.object(
            reading_service,
            "_daily_performance_environment_layer",
            return_value=empty_environment,
        ):
            point = reading_service._build_daily_performance(
                object(),
                date(2026, 10, 1),
                {"modifier": 0, "items": []},
            )[0]

        supports = [
            item for item in point["breakdown"]["friction"] if item["note"] == "Fast planet support"
        ]
        self.assertEqual(
            {(item["t_planet"], item["n_planet"]) for item in supports},
            {("VENUS", "SUN"), ("JUPITER", "VENUS")},
        )

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
        self.assertNotIn("fallback_label", countdown)
        self.assertEqual(countdown["percent"], 50)
        self.assertEqual(countdown["days_remaining"], 3)
        self.assertEqual(countdown["total_days"], 14)
        self.assertNotIn("title", countdown)
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

    def test_countdown_ignores_legacy_label_within_half_degree(self):
        countdown = build_countdown_data(
            {
                "T_Planet": "TRANSIT_VENUS",
                "Countdown_ID": "LUCKY_LOVE_VENUS",
                "Countdown_Label": "譛鬮倥・諱区・驕九∪縺ｧ",
                "_input": {"orb": 0.4},
            }
        )

        self.assertNotIn("title", countdown)
        self.assertNotIn("fallback_label", countdown)

    def test_countdown_ignores_legacy_label_and_keeps_master_action_hint(self):
        countdown = build_countdown_data(
            {
                "T_Planet": "TRANSIT_VENUS",
                "Countdown_ID": "LUCKY_LOVE_VENUS",
                "Countdown_Label": "個別ラベルを表示",
                "Advised_Task": "個別タスクを使う",
                "_input": {"orb": 2.0},
            }
        )

        self.assertNotIn("title", countdown)
        self.assertNotIn("fallback_label", countdown)
        self.assertNotEqual(countdown["note"], "個別タスクを使う")
        self.assertTrue(countdown["note"])

    def test_countdown_does_not_fall_back_to_master_title_when_aspect_label_is_missing(self):
        countdown = build_countdown_data(
            {
                "T_Planet": "TRANSIT_VENUS",
                "Countdown_ID": "LUCKY_LOVE_VENUS",
                "_input": {"orb": 2.0},
            }
        )

        self.assertNotIn("title", countdown)
        self.assertNotIn("fallback_label", countdown)

    def test_countdown_ignores_legacy_label_when_master_is_missing(self):
        countdown = build_countdown_data(
            {
                "T_Planet": "TRANSIT_VENUS",
                "Countdown_ID": "UNKNOWN_TRIGGER",
                "Countdown_Label": "譌･譛ｬ隱槭ヵ繧ｩ繝ｼ繝ｫ繝舌ャ繧ｯ",
                "_input": {"orb": 2.0},
            }
        )

        self.assertNotIn("title", countdown)
        self.assertNotIn("fallback_label", countdown)
        self.assertEqual(countdown["note"], "")
        self.assertEqual(countdown["trigger_id"], "UNKNOWN_TRIGGER")

    def test_countdown_ignores_legacy_label_without_countdown_id(self):
        countdown = build_countdown_data(
            {
                "T_Planet": "TRANSIT_VENUS",
                "Countdown_Label": "LUCKY_LOVE_VENUS",
                "_input": {"orb": 2.0},
            }
        )

        self.assertNotIn("title", countdown)
        self.assertNotIn("fallback_label", countdown)
        self.assertEqual(countdown["trigger_id"], "")

    def test_countdown_without_id_or_legacy_label_does_not_add_title(self):
        countdown = build_countdown_data(
            {
                "T_Planet": "TRANSIT_VENUS",
                "N_Planet": "NATAL_MERCURY",
                "Aspect_Angle": 0,
                "timeline_advise": "会話を楽しめます。",
                "_input": {"orb": 3.38},
            }
        )

        self.assertNotIn("title", countdown)
        self.assertNotIn("fallback_label", countdown)
        self.assertEqual(countdown["timeline_advise"], "会話を楽しめます。")

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

    def test_lunar_countdown_arrival_scans_in_two_hour_steps(self):
        row = {
            "T_Planet": "TRANSIT_MOON",
            "N_Planet": "NATAL_MERCURY",
            "Aspect_Angle": 60,
            "_input": {"natal_longitude": 100.0, "timezone_offset": 9},
        }
        scan_start = datetime(2026, 7, 17, 12)

        def orb_at(_planet, sample_dt, _timezone_offset, _natal_longitude, _exact_angle):
            hours = int((sample_dt - scan_start).total_seconds() / 3600)
            if hours < 4 or hours >= 10:
                return (8.0 if hours == 0 else 6.0), False
            return 4.0, False

        with patch("backend.app.services.reading_service._aspect_orb_at", side_effect=orb_at):
            scan = reading_service._scan_lunar_countdown_arrival(
                row,
                scan_start,
                total_days=14,
                threshold_orb=5,
            )

        self.assertIsNotNone(scan)
        self.assertEqual(scan["hours_remaining"], 4)
        self.assertEqual(scan["days_remaining"], 1)
        self.assertEqual(scan["scan_status"], "upcoming")
        self.assertEqual(scan["impact_start_datetime"], "2026-07-17T16:00:00")
        self.assertEqual(scan["impact_end_datetime"], "2026-07-17T22:00:00")

    def test_non_lunar_countdown_arrival_refines_zero_days_to_hours(self):
        row = {
            "T_Planet": "TRANSIT_MERCURY",
            "N_Planet": "NATAL_SUN",
            "Aspect_Angle": 120,
            "_input": {"natal_longitude": 100.0, "timezone_offset": 9},
        }
        scan_start = datetime(2026, 7, 20, 12)

        def orb_at(_planet, sample_dt, _timezone_offset, _natal_longitude, _exact_angle):
            hours = (sample_dt - scan_start).total_seconds() / 3600
            if hours < 0:
                return 6.0, False
            if hours <= 5:
                return 2.0 - (hours * 0.32), False
            return 0.4 + ((hours - 5) * 0.3), False

        with patch.object(reading_service, "swe", object()), patch(
            "backend.app.services.reading_service._aspect_orb_at",
            side_effect=orb_at,
        ), patch(
            "backend.app.services.reading_service._retrograde_calendar_start_day",
            return_value=None,
        ):
            scan = reading_service._scan_countdown_ephemeris(
                row,
                scan_start,
                total_days=14,
                threshold_orb=5,
            )

        self.assertEqual(scan["days_remaining"], 0)
        self.assertEqual(scan["hours_remaining"], 5)

    def test_non_lunar_countdown_departure_refines_one_day_to_hours(self):
        row = {
            "T_Planet": "TRANSIT_MERCURY",
            "N_Planet": "NATAL_SUN",
            "Aspect_Angle": 90,
            "_input": {"natal_longitude": 100.0, "timezone_offset": 9},
        }
        scan_start = datetime(2026, 7, 20, 12)

        def orb_at(_planet, sample_dt, _timezone_offset, _natal_longitude, _exact_angle):
            hours = (sample_dt - scan_start).total_seconds() / 3600
            return (4.0 if 0 <= hours < 7 else 6.0), False

        with patch.object(reading_service, "swe", object()), patch(
            "backend.app.services.reading_service._aspect_orb_at",
            side_effect=orb_at,
        ):
            scan = reading_service._scan_countdown_departure(
                row,
                scan_start,
                total_days=14,
                threshold_orb=5,
            )

        self.assertEqual(scan["days_remaining"], 1)
        self.assertEqual(scan["hours_remaining"], 7)
        self.assertEqual(scan["impact_end_datetime"], "2026-07-20T19:00:00")

    def test_non_lunar_year_bound_departure_refines_one_day_to_hours(self):
        row = {
            "T_Planet": "TRANSIT_SATURN",
            "N_Planet": "NATAL_SUN",
            "Aspect_Angle": 90,
            "_input": {"natal_longitude": 100.0, "timezone_offset": 9},
        }
        scan_start = datetime(2026, 1, 2, 12)

        def orb_at(_planet, sample_dt, _timezone_offset, _natal_longitude, _exact_angle):
            hours = (sample_dt - scan_start).total_seconds() / 3600
            return (4.0 if 0 <= hours < 7 else 6.0), False

        with patch.object(reading_service, "swe", object()), patch(
            "backend.app.services.reading_service._aspect_orb_at",
            side_effect=orb_at,
        ):
            scan = reading_service._scan_countdown_departure_year_bound(
                row,
                scan_start,
                threshold_orb=5,
            )

        self.assertEqual(scan["days_remaining"], 1)
        self.assertEqual(scan["hours_remaining"], 7)
        self.assertEqual(scan["impact_end_datetime"], "2026-01-02T19:00:00")

    def test_lunar_countdown_departure_scans_in_two_hour_steps(self):
        row = {
            "T_Planet": "TRANSIT_MOON",
            "N_Planet": "NATAL_MERCURY",
            "Aspect_Angle": 90,
            "_input": {"natal_longitude": 100.0, "timezone_offset": 9},
        }
        scan_start = datetime(2026, 7, 17, 12)

        def orb_at(_planet, sample_dt, _timezone_offset, _natal_longitude, _exact_angle):
            hours = int((sample_dt - scan_start).total_seconds() / 3600)
            if hours <= -4 or hours >= 6:
                return 6.0, False
            return 2.0, False

        with patch("backend.app.services.reading_service._aspect_orb_at", side_effect=orb_at):
            scan = reading_service._scan_lunar_countdown_departure(
                row,
                scan_start,
                total_days=14,
                threshold_orb=5,
            )

        self.assertIsNotNone(scan)
        self.assertEqual(scan["hours_remaining"], 6)
        self.assertEqual(scan["departure_hour"], 6)
        self.assertEqual(scan["scan_status"], "departing")

    def test_countdown_targets_allow_non_solar_lunar_aspects(self):
        row = {
            "T_Planet": "TRANSIT_MOON",
            "N_Planet": "NATAL_MERCURY",
            "Aspect_Angle": 60,
            "Score_Impact": 30,
            "Priority": 7,
            "_orb_status": "Applying",
            "_input": {"orb": 2.0},
        }
        self.assertEqual(reading_service._select_countdown_targets([row]), [row])

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

        self.assertEqual(len(dashboard["weekly_aspects"]), 2)
        mercury_item = next(
            item for item in dashboard["weekly_aspects"] if item["target"]["T_Planet"] == "TRANSIT_MERCURY"
        )
        lunar_item = next(
            item for item in dashboard["weekly_aspects"] if item["target"]["T_Planet"] == "TRANSIT_MOON"
        )
        self.assertEqual(mercury_item["date"], "2026-05-02")
        self.assertEqual(mercury_item["days_until"], 0)
        self.assertEqual(mercury_item["start_date"], "2026-05-02")
        self.assertEqual(mercury_item["end_date"], "2026-05-07")
        self.assertEqual(mercury_item["start_days_until"], 0)
        self.assertEqual(mercury_item["end_days_until"], 5)
        self.assertEqual(len(mercury_item["active_dates"]), 6)
        self.assertEqual(mercury_item["scoreImpact"], -24)
        self.assertEqual(lunar_item["target"]["N_Planet"], "NATAL_MERCURY")
        self.assertEqual(lunar_item["scoreImpact"], -30)
        self.assertFalse(any(item["priority"] < 5 for item in dashboard["weekly_aspects"]))
        self.assertTrue(
            all("Countdown_Label" not in item["target"] for item in dashboard["weekly_aspects"])
        )

    def test_json_compatible_replaces_non_finite_numbers(self):
        payload = reading_service._to_json_compatible({
            "python_nan": float("nan"),
            "pandas_nan": pd.NA,
            "nested": [float("inf"), float("-inf")],
        })

        self.assertIsNone(payload["python_nan"])
        self.assertIsNone(payload["pandas_nan"])
        self.assertEqual(payload["nested"], [None, None])

    def test_display_countdown_items_prefer_future_days_over_past_peak(self):
        items = [
            {"title": "past peak", "days_remaining": 0, "scan_status": "turning_away"},
            {"title": "future peak", "days_remaining": 2, "scan_status": "closest"},
            {"title": "today exact", "days_remaining": 0, "scan_status": "exact"},
        ]

        selected = reading_service._select_display_countdown_items(items, limit=3)

        self.assertEqual([item["title"] for item in selected], ["future peak", "today exact", "past peak"])

    def test_display_countdown_items_can_return_all_items_without_limit(self):
        items = [
            {"title": f"future {day}", "days_remaining": day, "scan_status": "closest"}
            for day in range(5, 0, -1)
        ]

        selected = reading_service._select_display_countdown_items(items, limit=None)

        self.assertEqual(
            [item["title"] for item in selected],
            ["future 1", "future 2", "future 3", "future 4", "future 5"],
        )

    def test_next_stellar_event_calendar_is_separate_from_personal_countdowns(self):
        calendar = [{
            "event_id": "new_moon|2026-05-10T12:00:00",
            "event_type": "new_moon",
            "event_datetime": "2026-05-10T12:00:00",
            "event_date": "2026-05-10",
            "title": "新月",
            "priority": 98,
        }]
        rows = [{
            "T_Planet": "TRANSIT_SUN",
            "N_Planet": "NATAL_SUN",
            "Aspect_Angle": 0,
            "Countdown_ID": "WORK_SUCCESS_JUPITER",
            "Score_Impact": 60,
            "Priority": 8,
            "_orb_status": "Applying",
            "_input": {"orb": 2.0},
        }]

        with patch.object(reading_service, "_build_celestial_event_calendar", return_value=calendar):
            dashboard = build_dashboard_data_from_interpretations(rows, {"modifier": 0, "items": []})

        self.assertEqual(dashboard["celestial_event_calendar"], calendar)
        self.assertNotIn("title", dashboard["countdown"])
        self.assertNotIn("fallback_label", dashboard["countdown"])

    def test_celestial_event_genres_support_multiple_categories(self):
        self.assertEqual(reading_service._celestial_event_genres("Money,Work"), ["money", "work"])
        self.assertEqual(reading_service._celestial_event_genres("Love,Money"), ["love", "money"])
        self.assertEqual(reading_service._celestial_event_genres("General"), ["general"])

    def test_celestial_aspect_categories_apply_planet_pair_policy(self):
        self.assertEqual(reading_service._celestial_aspect_category("General", "SUN", "VENUS"), "Love")
        self.assertEqual(reading_service._celestial_aspect_category("Work", "VENUS", "SATURN"), "Love,Work")
        self.assertEqual(reading_service._celestial_aspect_category("General", "JUPITER", "VENUS"), "Love,Money")
        self.assertEqual(reading_service._celestial_aspect_category("Work", "VENUS", "JUPITER"), "Love,Money,Work")
        self.assertEqual(reading_service._celestial_aspect_category("General", "MARS", "SATURN"), "General")

    def test_celestial_house_categories_follow_personal_genre_policy(self):
        self.assertEqual(reading_service._celestial_house_category(2), "Money,Work")
        self.assertEqual(reading_service._celestial_house_category(8), "Love,Money")
        self.assertEqual(reading_service._celestial_house_category(11), "Love")
        self.assertEqual(reading_service._celestial_house_category(12), "General")

    @unittest.skipIf(reading_service.swe is None, "swisseph is not installed")
    def test_celestial_event_calendar_excludes_transit_moon_squares(self):
        birth_input = BirthInput(
            full_name="Calendar Test",
            birth_date="1984-08-26",
            birth_time="12:00",
            birth_time_unknown=False,
            birthplace="Tokyo",
            latitude=35.6762,
            longitude=139.6503,
            timezone_offset=9,
        )

        events = reading_service._build_celestial_event_calendar(
            birth_input,
            current_dt=datetime(2026, 7, 18, 12, 0),
        )

        self.assertFalse(any(
            event.get("event_type") == "transit_natal_aspect"
            and event.get("transit_planet") == "MOON"
            and event.get("aspect_angle") == 90
            for event in events
        ))
        self.assertTrue(any(
            event.get("event_type") == "transit_natal_aspect"
            and event.get("aspect_angle") == 90
            and event.get("transit_planet") != "MOON"
            for event in events
        ))
        self.assertTrue(all(
            isinstance(event.get("genres"), list)
            and event["genres"]
            and set(event["genres"]) <= {"love", "general", "money", "work"}
            for event in events
            if event.get("event_type") == "transit_natal_aspect"
        ))
        self.assertTrue(all(
            event.get("genres") == reading_service._celestial_event_genres(event.get("category"))
            for event in events
            if event.get("event_type") == "natal_house_ingress"
        ))

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
            ] + [(1.1, True)] * 25
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

    def test_countdown_arrival_includes_influence_period(self):
        scan_start = datetime(2026, 5, 2)

        def orb_at(_planet, sample_dt, _timezone_offset, _natal_longitude, _exact_angle):
            day = (sample_dt.date() - scan_start.date()).days
            return {0: 8.0, 1: 6.0, 2: 4.0, 3: 0.4, 4: 3.0}.get(day, 6.0), False

        with patch("backend.app.services.reading_service._aspect_orb_at", side_effect=orb_at):
            scan = reading_service._scan_countdown_ephemeris(
                {
                    "T_Planet": "TRANSIT_MERCURY",
                    "N_Planet": "NATAL_SUN",
                    "Aspect_Angle": 120,
                    "_input": {"natal_longitude": 15.0, "timezone_offset": 9},
                },
                current_dt=scan_start,
                total_days=7,
                threshold_orb=5,
            )

        self.assertEqual(scan["days_remaining"], 3)
        self.assertEqual(scan["impact_start_date"], "2026-05-04")
        self.assertEqual(scan["impact_end_date"], "2026-05-07")

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
            ] + [(1.1, True)] * 25
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
            ] + [(1.1, True)] * 25
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

        with patch("backend.app.services.reading_service._scan_countdown_departure") as departure_scan_mock, patch(
            "backend.app.services.reading_service._scan_countdown_departure_year_bound"
        ) as pressure_scan_mock:
            departure_scan_mock.return_value = {
                "days_remaining": 3,
                "total_days": 10,
                "percent": 70,
                "scan_status": "departing",
                "departure_day": 3,
                "departure_orb": 5.1,
                "departure_retrograde": False,
            }
            pressure_scan_mock.return_value = departure_scan_mock.return_value
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
        self.assertEqual(len(dashboard["pressure_countdown_items"]), 6)
        self.assertEqual(dashboard["pressure_countdown_items"], dashboard["countdown_groups"]["pressure"])
        self.assertNotIn("loadScore", dashboard["pressure_load_summary"])
        self.assertTrue(
            all(item["countdown_mode"] == "departure" for item in dashboard["pressure_countdown_items"])
        )
        self.assertCountEqual(
            [
                (
                    item["target"]["T_Planet"],
                    item["target"]["N_Planet"],
                    item["target"]["Aspect_Angle"],
                )
                for item in dashboard["pressure_countdown_items"]
            ],
            [
                ("TRANSIT_MOON", "NATAL_SUN", 180),
                ("TRANSIT_MERCURY", "NATAL_MOON", 90),
                ("TRANSIT_MOON", "NATAL_MOON", 90),
                ("TRANSIT_VENUS", "NATAL_MOON", 90),
                ("TRANSIT_SATURN", "NATAL_MOON", 90),
                ("TRANSIT_URANUS", "NATAL_MOON", 90),
            ],
        )
        self.assertEqual(dashboard["relief_countdown_items"], dashboard["countdown_groups"]["relief"])
        self.assertEqual(len(dashboard["relief_countdown_items"]), 7)
        self.assertTrue(
            all(item["countdown_mode"] == "departure" for item in dashboard["relief_countdown_items"])
        )
        self.assertTrue(
            all(item["target"]["Score_Impact"] >= 25 for item in dashboard["relief_countdown_items"])
        )
        self.assertEqual(len(dashboard["countdown_groups"]["long_by_priority"]["high"]), 2)
        self.assertEqual(len(dashboard["countdown_groups"]["long_by_priority"]["middle"]), 2)
        self.assertEqual(len(dashboard["countdown_groups"]["long_by_priority"]["low"]), 2)
        self.assertTrue(
            all(item["priority_band"] == "high" for item in dashboard["countdown_groups"]["long_by_priority"]["high"])
        )

    def test_pressure_countdown_excludes_jupiter_and_neptune_above_planet_threshold(self):
        rows = [
            {
                "T_Planet": "TRANSIT_JUPITER",
                "N_Planet": "NATAL_MOON",
                "Aspect_Angle": 90,
                "Countdown_ID": "FATED_TURNING_POINT",
                "Countdown_Label": "jupiter negative",
                "Score_Impact": -60,
                "Priority": 9,
                "_orb_status": "Applying",
                "_input": {"orb": 1.0},
            },
            {
                "T_Planet": "TRANSIT_NEPTUNE",
                "N_Planet": "NATAL_MOON",
                "Aspect_Angle": 120,
                "Countdown_ID": "FATED_TURNING_POINT",
                "Countdown_Label": "neptune trine pressure",
                "Score_Impact": 20,
                "Priority": 9,
                "_orb_status": "Applying",
                "_input": {"orb": 1.0},
            },
        ]

        with patch("backend.app.services.reading_service._scan_countdown_departure") as departure_scan_mock, patch(
            "backend.app.services.reading_service._scan_countdown_departure_year_bound"
        ) as pressure_scan_mock:
            departure_scan_mock.return_value = {
                "days_remaining": 3,
                "total_days": 10,
                "percent": 70,
                "scan_status": "departing",
                "departure_day": 3,
                "departure_orb": 5.1,
                "departure_retrograde": False,
            }
            pressure_scan_mock.return_value = departure_scan_mock.return_value
            dashboard = build_dashboard_data_from_interpretations(rows, {"modifier": 0, "items": []})

        self.assertEqual(
            [item["target"]["Countdown_Label"] for item in dashboard["pressure_countdown_items"]],
            [],
        )

    def test_pressure_load_summary_uses_separate_short_and_long_thresholds(self):
        cases = [
            ("short", "TRANSIT_MOON", 59, "low"),
            ("short", "TRANSIT_MOON", 60, "moderate"),
            ("short", "TRANSIT_MOON", 159, "moderate"),
            ("short", "TRANSIT_MOON", 160, "high"),
            ("long", "TRANSIT_SATURN", 159, "low"),
            ("long", "TRANSIT_SATURN", 160, "moderate"),
            ("long", "TRANSIT_SATURN", 399, "moderate"),
            ("long", "TRANSIT_SATURN", 400, "high"),
        ]

        for group, planet, score, expected_level in cases:
            with self.subTest(group=group, score=score):
                summary = reading_service._pressure_load_group_summary([
                    {"target": {"T_Planet": planet}, "pressure_score": -score},
                ])
                self.assertEqual(summary["groups"][group]["loadScore"], score)
                self.assertEqual(summary["groups"][group]["level"], expected_level)
                self.assertNotIn("loadScore", summary)

        summary = reading_service._pressure_load_group_summary([
            {"target": {"T_Planet": "TRANSIT_MOON"}, "pressure_score": -160},
            {"target": {"T_Planet": "TRANSIT_SATURN"}, "pressure_score": -159},
        ])
        self.assertIn("短期側に集中", summary["overallComment"])

    def test_pressure_countdown_uses_stricter_neptune_threshold(self):
        self.assertFalse(reading_service._is_pressure_countdown_target({
            "T_Planet": "TRANSIT_MERCURY",
            "N_Planet": "NATAL_MOON",
            "Aspect_Angle": 90,
            "Pressure_Score": -21,
        }))
        self.assertTrue(reading_service._is_pressure_countdown_target({
            "T_Planet": "TRANSIT_MERCURY",
            "N_Planet": "NATAL_MOON",
            "Aspect_Angle": 90,
            "Pressure_Score": -22,
        }))
        self.assertFalse(reading_service._is_pressure_countdown_target({
            "T_Planet": "TRANSIT_NEPTUNE",
            "N_Planet": "NATAL_MOON",
            "Aspect_Angle": 120,
            "Pressure_Score": -27,
        }))
        self.assertTrue(reading_service._is_pressure_countdown_target({
            "T_Planet": "TRANSIT_NEPTUNE",
            "N_Planet": "NATAL_MOON",
            "Aspect_Angle": 90,
            "Pressure_Score": -28,
        }))
        self.assertTrue(reading_service._is_pressure_countdown_target({
            "T_Planet": "TRANSIT_SATURN",
            "N_Planet": "NATAL_MOON",
            "Aspect_Angle": 90,
            "Pressure_Score": -25,
        }))

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

    def test_transit_motion_request_cache_reuses_identical_calculations(self):
        class FakeSwissEphemeris:
            FLG_SPEED = 1

            def __init__(self):
                self.calc_calls = 0

            @staticmethod
            def julday(year, month, day, hour):
                return float(year + month + day + hour)

            def calc_ut(self, julian_day, planet_id, flags):
                self.calc_calls += 1
                return ([123.45, 0.0, 0.0, -0.25], 0)

        fake_swe = FakeSwissEphemeris()
        sample_dt = datetime(2026, 5, 8, 12, 0)

        with patch.object(reading_service, "swe", fake_swe), patch.object(
            reading_service,
            "_transit_planet_ids",
            return_value={"SUN": 0},
        ):
            with reading_service._transit_motion_request_cache() as request_cache:
                first = reading_service._calc_transit_planet_motion("SUN", sample_dt, 9)
                second = reading_service._calc_transit_planet_motion("TRANSIT_SUN", sample_dt, 9.0)
                reading_service._calc_transit_planet_motion("SUN", datetime(2026, 5, 9, 12, 0), 9)
                reading_service._calc_transit_planet_motion("SUN", sample_dt, 8)

            self.assertEqual(first, second)
            self.assertEqual(fake_swe.calc_calls, 3)
            self.assertEqual(len(request_cache), 3)

            with reading_service._transit_motion_request_cache():
                reading_service._calc_transit_planet_motion("SUN", sample_dt, 9)

        self.assertEqual(fake_swe.calc_calls, 4)

    def test_generate_readings_limits_transit_motion_cache_to_request(self):
        observed_caches = []
        observed_countdown_orb_caches = []
        observed_natal_caches = []

        def fake_generate(_payload):
            observed_caches.append(reading_service._TRANSIT_MOTION_REQUEST_CACHE.get())
            observed_countdown_orb_caches.append(reading_service._COUNTDOWN_ORB_REQUEST_CACHE.get())
            observed_natal_caches.append(reading_service._NATAL_DATA_REQUEST_CACHE.get())
            return "reading"

        with patch.object(reading_service, "_generate_readings", side_effect=fake_generate):
            result = reading_service.generate_readings(object())

        self.assertEqual(result, "reading")
        self.assertEqual(observed_caches, [{}])
        self.assertEqual(observed_countdown_orb_caches, [{}])
        self.assertEqual(observed_natal_caches, [{}])
        self.assertIsNone(reading_service._TRANSIT_MOTION_REQUEST_CACHE.get())
        self.assertIsNone(reading_service._COUNTDOWN_ORB_REQUEST_CACHE.get())
        self.assertIsNone(reading_service._NATAL_DATA_REQUEST_CACHE.get())

    def test_countdown_orb_request_cache_reuses_identical_trajectory_points(self):
        sample_dt = datetime(2026, 5, 8, 12, 0)

        with patch.object(
            reading_service,
            "_calc_transit_planet_state",
            return_value=(123.0, False),
        ) as state_mock:
            with reading_service._countdown_orb_request_cache() as request_cache:
                first = reading_service._aspect_orb_at("SUN", sample_dt, 9, 33.0, 90)
                second = reading_service._aspect_orb_at("TRANSIT_SUN", sample_dt, 9.0, 33, 90)
                reading_service._aspect_orb_at("SUN", sample_dt, 8, 33.0, 90)

            self.assertEqual(first, second)
            self.assertEqual(state_mock.call_count, 2)
            self.assertEqual(len(request_cache), 2)

            with reading_service._countdown_orb_request_cache():
                reading_service._aspect_orb_at("SUN", sample_dt, 9, 33.0, 90)

        self.assertEqual(state_mock.call_count, 3)

    def test_natal_data_request_cache_reuses_chart_rows_and_derived_points(self):
        birth_input = BirthInput(
            full_name="Test User",
            birth_date="1984-08-26",
            birth_time="19:20",
            birth_time_unknown=False,
            birthplace="Tokyo",
            latitude=35.6812,
            longitude=139.7671,
            timezone_offset=9,
        )
        chart_rows = {
            "planets": [["Sun", 150.0, "Virgo", 0, "D", 6]],
            "angles": [["ASC", 330.0], ["MC", 240.0]],
            "houses": [[1, 330.0]],
            "aspects": [],
        }
        other_timezone_input = BirthInput(
            full_name="Test User",
            birth_date="1984-08-26",
            birth_time="19:20",
            birth_time_unknown=False,
            birthplace="Tokyo",
            latitude=35.6812,
            longitude=139.7671,
            timezone_offset=8,
        )

        with patch.object(reading_service, "build_chart_rows", return_value=chart_rows) as build_mock:
            with reading_service._natal_data_request_cache() as request_cache:
                first_chart = reading_service._chart_rows_for_request(birth_input)
                second_chart = reading_service._chart_rows_for_request(birth_input)
                planet_rows = reading_service._build_natal_planet_rows(birth_input)
                repeated_planet_rows = reading_service._build_natal_planet_rows(birth_input)
                aspect_points = reading_service._build_natal_aspect_points(birth_input)
                repeated_aspect_points = reading_service._build_natal_aspect_points(birth_input)
                reading_service._chart_rows_for_request(other_timezone_input)

            self.assertIs(first_chart, second_chart)
            self.assertIs(planet_rows, repeated_planet_rows)
            self.assertIs(aspect_points, repeated_aspect_points)
            self.assertEqual(build_mock.call_count, 2)
            self.assertEqual(len(request_cache), 4)
            self.assertEqual([point["planet"] for point in aspect_points], ["SUN", "ASC", "MC"])

            with reading_service._natal_data_request_cache():
                reading_service._chart_rows_for_request(birth_input)

        self.assertEqual(build_mock.call_count, 3)

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

        self.assertTrue(dashboard_data["dailyStarVibe"])
        self.assertEqual(dashboard_data["aspectHighlights"], {"positive": [], "negative": []})
        self.assertEqual(dashboard_data["aspect_interpretations"], [])
        self.assertNotIn("timeline", dashboard_data)
        self.assertIn("dailyPerformance", dashboard_data)
        self.assertNotIn("hero", dashboard_data)
        self.assertNotIn("diagnostic", dashboard_data)
        self.assertNotIn("topics", dashboard_data)

    def test_dashboard_core_mode_skips_deferred_widget_builders(self):
        with patch.object(reading_service, "_build_daily_performance") as performance_mock, patch.object(
            reading_service, "_build_weekly_aspect_items"
        ) as weekly_mock, patch.object(
            reading_service, "_build_celestial_event_calendar"
        ) as celestial_mock:
            dashboard_data = build_dashboard_data_from_aspects(
                aspects=[],
                include_deferred_widgets=False,
            )

        self.assertTrue(dashboard_data["deferred_widgets_pending"])
        self.assertEqual(dashboard_data["dailyPerformance"], [])
        self.assertEqual(dashboard_data["weekly_aspects"], [])
        self.assertEqual(dashboard_data["celestial_event_calendar"], [])
        performance_mock.assert_not_called()
        weekly_mock.assert_not_called()
        celestial_mock.assert_not_called()

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

    def test_create_reading_can_defer_heavy_widgets(self):
        response = ReadingResponse(
            meta=ReadingMeta(
                full_name="Test User",
                birthplace="Tokyo",
                birth_date="1984-08-26",
                birth_time="19:20",
                birth_time_unknown=False,
                timezone_offset=9,
            ),
            chart_data={},
            readings=[],
            transit_ready=True,
            dashboard_data={"deferred_widgets_pending": True},
        )
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

        with patch.object(reading_service, "generate_readings", return_value=response) as generate_mock:
            result = create_reading(payload, defer_widgets=True)

        self.assertTrue(result.dashboard_data["deferred_widgets_pending"])
        generate_mock.assert_called_once_with(payload, include_deferred_widgets=False)

    def test_create_deferred_reading_widgets_wraps_dashboard_payload(self):
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
        widgets = {
            "dailyPerformance": [{"time": "08:00"}],
            "weekly_aspects": [],
            "celestial_event_calendar": [],
            "deferred_widgets_pending": False,
        }

        with patch.object(
            reading_service,
            "generate_deferred_dashboard_widgets",
            return_value=widgets,
        ):
            result = create_deferred_reading_widgets(payload)

        self.assertEqual(result["dashboard_data"], widgets)
        self.assertTrue(result["masterVersion"])

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
            "yearly_data": [{"date": "2026-01-01", "scores": {"total": 10}, "all_aspects": [{}]}],
        }

        with patch(
            "backend.app.services.yearly_forecast_service.generate_yearly_forecast",
            return_value=fake_forecast,
        ), patch("backend.app.main._master_version_payload", return_value={"masterVersion": "test-v1"}):
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

        self.assertEqual(response["yearly_data"], [{"date": "2026-01-01", "scores": {"total": 10}}])
        self.assertEqual(response["masterVersion"], "test-v1")
        self.assertNotIn("all_aspects", response["yearly_data"][0])

    def test_create_yearly_forecast_detail_returns_requested_day(self):
        fake_forecast = {
            "yearly_data": [{"date": "2026-07-21", "scores": {"total": 10}, "all_aspects": [{"id": 1}]}],
        }
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

        with patch(
            "backend.app.services.yearly_forecast_service.generate_yearly_forecast",
            return_value=fake_forecast,
        ):
            response = create_yearly_forecast_detail(
                payload,
                year=2026,
                scope="day",
                day_date=date(2026, 7, 21),
                month=None,
            )

        self.assertEqual(response["detail_date"], "2026-07-21")
        self.assertEqual(response["yearly_data"][0]["all_aspects"], [{"id": 1}])

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

