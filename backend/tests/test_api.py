import shutil
import unittest
from datetime import date, datetime, time
from pathlib import Path
from unittest.mock import patch

from fastapi.encoders import jsonable_encoder
from fastapi import HTTPException
from pydantic import ValidationError

from backend.app.main import create_reading, create_yearly_forecast, health_check, location_search, root
from backend.app.services.chart_calculator import BirthInput, build_chart_rows, write_chart_csvs
from backend.app.services.geocoding_service import LocationMatch
from backend.app.services.reading_service import (
    build_basic_interpretations_from_chart_rows,
    build_countdown_data,
    build_dashboard_data_from_aspects,
    build_transit_aspect_inputs,
    get_aspect_dashboard_data,
    get_aspect_interpretation,
    get_basic_interpretation,
    get_daily_vibe_modifiers,
)
from backend.app.services.yearly_forecast_service import (
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

        self.assertEqual(dashboard_data["hero"]["score"], 85)
        self.assertEqual(dashboard_data["hero"]["rank"], "A")
        self.assertTrue(dashboard_data["hero"]["summary"])
        self.assertIn("countdown", dashboard_data)
        self.assertIn("timeline", dashboard_data)
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
        self.assertEqual(hero["title"], "追い風をつかむ日")
        self.assertTrue(hero["description"])
        self.assertTrue(hero["guideline"])
        self.assertEqual(hero["basic"]["planet"], "SUN")
        self.assertIn("本来は", hero["summary"])

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
        self.assertEqual(dashboard_data["hero"]["score"], 42)
        self.assertIn("diagnostic", dashboard_data)
        self.assertEqual(dashboard_data["diagnostic"]["score"], 100)
        self.assertEqual(
            [item["value"] for item in dashboard_data["diagnostic"]["items"]],
            [50, 100, 100],
        )
        self.assertEqual(len(dashboard_data["diagnostic"]["items"]), 3)
        self.assertNotEqual(dashboard_data["countdown"]["title"], dashboard_data["countdown"]["note"])
        self.assertTrue(dashboard_data["countdown"]["trigger_id"])
        self.assertTrue(any(topic["title"] == "Work" for topic in dashboard_data["topics"]))
        self.assertTrue(dashboard_data["developerMeta"]["diagnostic"]["sources"])
        self.assertTrue(dashboard_data["developerMeta"]["countdown"]["sources"])

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

    def test_dashboard_timeline_uses_four_time_slots_and_unique_actions(self):
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

        timeline = dashboard_data["timeline"]
        self.assertEqual(
            [slot["label"] for slot in timeline],
            [
                "06:00 - 12:00 (Morning)",
                "12:00 - 18:00 (Afternoon)",
                "18:00 - 24:00 (Evening)",
                "00:00 - 06:00 (Night)",
            ],
        )
        self.assertTrue(all(0 <= slot["score"] <= 100 for slot in timeline))
        self.assertTrue(all(slot["recommendedAction"] for slot in timeline))
        self.assertTrue(all(slot["description"] for slot in timeline))
        self.assertTrue(all(slot["targetScore"] in {100, 55, 30, 10} for slot in timeline))
        self.assertTrue(all(slot.get("sourceRow") for slot in timeline))
        self.assertTrue(all(slot.get("timelineAdviceRow") for slot in timeline))
        self.assertGreater(len({slot["recommendedAction"] for slot in timeline}), 1)
        self.assertEqual(
            len(
                {
                    (
                        slot["sourceAspect"]["t_planet"],
                        slot["sourceAspect"]["n_planet"],
                        slot["sourceAspect"]["angle"],
                    )
                    for slot in timeline
                }
            ),
            4,
        )
        self.assertTrue(any(slot["sourceAspect"]["angle"] == 150 for slot in timeline))

    def test_timeline_logs_target_score_and_final_score(self):
        with self.assertLogs("backend.app.services.reading_service", level="INFO") as logs:
            build_dashboard_data_from_aspects(
                aspects=[
                    {
                        "t_planet": "MOON",
                        "n_planet": "SUN",
                        "angle": 0,
                        "house": 1,
                        "is_retrograde": False,
                        "orb_status": "Applying",
                    }
                ]
            )

        joined = "\n".join(logs.output)
        self.assertIn("Timeline score: slot=MORNING", joined)
        self.assertIn("target=100", joined)
        self.assertIn("additive=", joined)
        self.assertIn("final=", joined)

    def test_timeline_score_combines_aspect_daily_vibe_and_condition_multiplier(self):
        dashboard_data = build_dashboard_data_from_aspects(
            aspects=[
                {
                    "t_planet": "MARS",
                    "n_planet": "SUN",
                    "angle": 150,
                    "house": 1,
                    "is_retrograde": False,
                    "orb_status": "Separating",
                }
            ],
            retrograde_planets=["MERCURY"],
        )

        morning = dashboard_data["timeline"][0]
        self.assertEqual(morning["targetScore"], 100)
        self.assertEqual(morning["scoreImpactTotal"], -25)
        self.assertEqual(morning["dailyModifier"], -20)
        self.assertEqual(morning["additiveScore"], 55)
        self.assertEqual(morning["condition"], "UNDER")
        self.assertAlmostEqual(morning["multiplier"], 0.92)
        self.assertEqual(morning["score"], 51)

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

    def test_yearly_forecast_weight_and_orb_decay_helpers(self):
        self.assertEqual(_priority_weight(10), 3.0)
        self.assertEqual(_priority_weight(8), 2.0)
        self.assertEqual(_priority_weight(3), 1.0)
        self.assertEqual(_orb_decay(0, 180), 1.0)
        self.assertEqual(_orb_decay(8, 180), 0.2)

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

    def test_dashboard_data_falls_back_to_calm_day_without_aspects(self):
        dashboard_data = build_dashboard_data_from_aspects(aspects=[])

        self.assertEqual(dashboard_data["hero"]["score"], 50)
        self.assertEqual(dashboard_data["aspect_interpretations"], [])
        self.assertEqual(len(dashboard_data["timeline"]), 4)
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

