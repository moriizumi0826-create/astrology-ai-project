from __future__ import annotations

import re
import unittest
from datetime import date, timedelta
from itertools import combinations

from backend.app.services import monthly_overview_service, yearly_forecast_service
from backend.app.services.chart_calculator import BirthInput, get_house


BIRTH_CASES = (
    BirthInput(
        full_name="August Integration Tokyo",
        birth_date="1984-08-26",
        birth_time="19:20",
        birth_time_unknown=False,
        birthplace="Tokyo",
        latitude=35.6812,
        longitude=139.7671,
        timezone_offset=9,
    ),
    BirthInput(
        full_name="August Integration Osaka",
        birth_date="1992-02-14",
        birth_time="06:30",
        birth_time_unknown=False,
        birthplace="Osaka",
        latitude=34.6937,
        longitude=135.5023,
        timezone_offset=9,
    ),
    BirthInput(
        full_name="August Integration Sapporo",
        birth_date="1977-11-03",
        birth_time="12:15",
        birth_time_unknown=False,
        birthplace="Sapporo",
        latitude=43.0618,
        longitude=141.3545,
        timezone_offset=9,
    ),
)

SCORE_KEYS = {"total", "work", "love", "money", "general"}
TOKEN_PATTERN = re.compile(r"\{[^{}]+\}")
EXACT_DATE_PATTERN = re.compile(r"\d{1,2}月\d{1,2}日")
MOJIBAKE_MARKERS = ("\ufffd", "縺", "譁", "螟", "逕", "陦", "蜿")


def _normalized_narrative(value: object) -> str:
    return re.sub(r"[\s,.!?:;]+", "", str(value))


def _narratives(overview: dict[str, object]) -> list[str]:
    editorial = overview["editorial"]
    texts = [
        editorial["Summary"],
        editorial["Interpretation"],
        editorial["Action"],
    ]
    texts.extend(row["Paragraph_Template"] for row in overview["event_paragraphs"])
    texts.extend(row["Paragraph_Template"] for row in overview["aspect_clusters"])
    texts.extend(row["Interpretation"] for row in overview["long_term_backgrounds"])
    if overview["resonance"] is not None:
        texts.append(overview["resonance"]["Interpretation"])
    return texts


def _labeled_narratives(overview: dict[str, object]) -> list[tuple[str, str]]:
    editorial = overview["editorial"]
    rows = [
        ("editorial.summary", editorial["Summary"]),
        ("editorial.interpretation", editorial["Interpretation"]),
        ("editorial.action", editorial["Action"]),
    ]
    rows.extend(
        (f"event:{row['Template_ID']}", row["Paragraph_Template"])
        for row in overview["event_paragraphs"]
    )
    rows.extend(
        (f"cluster:{row['Template_ID']}", row["Paragraph_Template"])
        for row in overview["aspect_clusters"]
    )
    rows.extend(
        (f"background:{row['Record_ID']}", row["Interpretation"])
        for row in overview["long_term_backgrounds"]
    )
    if overview["resonance"] is not None:
        resonance = overview["resonance"]
        rows.append(
            (f"resonance:{resonance['Record_ID']}", resonance["Interpretation"])
        )
    return rows


def _bigram_jaccard(left: object, right: object) -> float:
    def bigrams(value: object) -> set[str]:
        normalized = re.sub(r"[\s、。,.・:：;；!?！？]+", "", str(value))
        return {
            normalized[index : index + 2]
            for index in range(max(0, len(normalized) - 1))
        }

    left_bigrams = bigrams(left)
    right_bigrams = bigrams(right)
    union = left_bigrams | right_bigrams
    return len(left_bigrams & right_bigrams) / len(union) if union else 1.0


class MonthlyOverviewIntegrationTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.forecasts = [
            yearly_forecast_service.generate_yearly_forecast(payload, 2026)
            for payload in BIRTH_CASES
        ]
        cls.transit_calendar = monthly_overview_service.load_transit_calendar(2026)

    def test_three_birth_records_preserve_scores_and_select_distinct_editorials(self):
        house_pairs = {"2026-08": set(), "2026-09": set()}
        for forecast in self.forecasts:
            self.assertEqual(len(forecast["yearly_data"]), 365)
            self.assertTrue(any(day["all_aspects"] for day in forecast["yearly_data"]))
            self.assertTrue(
                all(SCORE_KEYS.issubset(day["scores"]) for day in forecast["yearly_data"])
            )
            self.assertEqual(
                set(forecast["monthly_overviews"]),
                {"2026-08", "2026-09"},
            )

            for month_id, month, day_count, edition_id in (
                ("2026-08", 8, 31, "2026_LEO"),
                ("2026-09", 9, 30, "2026_VIRGO"),
            ):
                overviews = forecast["monthly_overviews"][month_id]
                self.assertEqual(len(overviews), day_count)
                self.assertEqual(
                    [overview["as_of"] for overview in overviews],
                    [
                        (date(2026, month, 1) + timedelta(days=offset)).isoformat()
                        for offset in range(day_count)
                    ],
                )
                self.assertTrue(
                    all(overview["month_id"] == month_id for overview in overviews)
                )
                self.assertTrue(
                    all(
                        overview["editorial"]["Edition_ID"] == edition_id
                        for overview in overviews
                    )
                )
                editorial = overviews[0]["editorial"]
                solar_house = int(editorial["Solar_House"])
                natal_house = int(editorial["Natal_House"])
                self.assertIn(solar_house, range(1, 13))
                self.assertIn(natal_house, range(1, 13))
                house_pairs[month_id].add((solar_house, natal_house))

        self.assertEqual(len(house_pairs["2026-08"]), len(BIRTH_CASES))
        self.assertEqual(len(house_pairs["2026-09"]), len(BIRTH_CASES))

    def test_sign_ingress_dates_match_calendar_and_daily_transit_boundaries(self):
        expected_ingresses = {
            (row["Planet"], row["Sign_ID"]): row["Date"]
            for row in self.transit_calendar
            if row["Date"].startswith("2026-08-")
            and row["Sign_Ingress_Flag"] == "1"
            and row["Planet"] in {"SUN", "MERCURY", "VENUS", "MARS"}
        }
        self.assertEqual(len(expected_ingresses), 5)

        for forecast in self.forecasts:
            overview = forecast["monthly_overviews"]["2026-08"][0]
            sign_ingresses = [
                row for row in overview["event_paragraphs"]
                if row["Event_Type"] == "sign_ingress"
            ]
            self.assertEqual(
                {
                    (row["Planet"], row["Transit_Sign_To"]): row["Event_Date"]
                    for row in sign_ingresses
                },
                expected_ingresses,
            )

            august_days = forecast["yearly_data"][212:243]
            daily_signs = {
                day["date"]: {
                    row["planet"]: yearly_forecast_service._sign_id_from_longitude(
                        row["longitude"]
                    )
                    for row in day["transit_chart"]["transits"]
                }
                for day in august_days
            }
            boundary_expectations = (
                ("VENUS", "2026-08-06", "VIRGO", "2026-08-07", "LIBRA"),
                ("MERCURY", "2026-08-09", "CANCER", "2026-08-10", "LEO"),
                ("MARS", "2026-08-10", "GEMINI", "2026-08-11", "CANCER"),
                ("SUN", "2026-08-22", "LEO", "2026-08-23", "VIRGO"),
                ("MERCURY", "2026-08-24", "LEO", "2026-08-25", "VIRGO"),
            )
            for planet, before_day, before_sign, after_day, after_sign in boundary_expectations:
                self.assertEqual(daily_signs[before_day][planet], before_sign)
                self.assertEqual(daily_signs[after_day][planet], after_sign)

    def test_september_event_conditions_match_calendar_and_personal_boundaries(self):
        expected_ingresses = {
            (row["Planet"], row["Sign_ID"]): row["Date"]
            for row in self.transit_calendar
            if row["Date"].startswith("2026-09-")
            and row["Sign_Ingress_Flag"] == "1"
            and row["Planet"] in {"SUN", "MERCURY", "VENUS", "MARS"}
        }
        self.assertEqual(
            expected_ingresses,
            {
                ("VENUS", "SCORPIO"): "2026-09-10",
                ("MERCURY", "LIBRA"): "2026-09-11",
                ("SUN", "LIBRA"): "2026-09-23",
                ("MARS", "LEO"): "2026-09-28",
                ("MERCURY", "SCORPIO"): "2026-09-30",
            },
        )
        boundary_expectations = (
            ("VENUS", "2026-09-09", "LIBRA", "2026-09-10", "SCORPIO"),
            ("MERCURY", "2026-09-10", "VIRGO", "2026-09-11", "LIBRA"),
            ("SUN", "2026-09-22", "VIRGO", "2026-09-23", "LIBRA"),
            ("MARS", "2026-09-27", "CANCER", "2026-09-28", "LEO"),
            ("MERCURY", "2026-09-29", "LIBRA", "2026-09-30", "SCORPIO"),
        )

        for forecast in self.forecasts:
            september = forecast["monthly_overviews"]["2026-09"]
            event_rows = september[0]["event_paragraphs"]
            sign_ingresses = [
                row for row in event_rows if row["Event_Type"] == "sign_ingress"
            ]
            self.assertEqual(
                {
                    (row["Planet"], row["Transit_Sign_To"]): row["Event_Date"]
                    for row in sign_ingresses
                },
                expected_ingresses,
            )
            self.assertEqual(
                [row["Event_Date"] for row in event_rows],
                sorted(row["Event_Date"] for row in event_rows),
            )

            natal_sun = next(
                row for row in forecast["natal_points"] if row["planet"] == "SUN"
            )
            natal_sun_sign = yearly_forecast_service._sign_id_from_longitude(
                natal_sun["longitude"]
            )
            september_days = {
                day["date"]: day
                for day in forecast["yearly_data"]
                if day["date"].startswith("2026-09-")
            }
            daily_transits = {
                day: {
                    row["planet"]: row["longitude"]
                    for row in payload["transit_chart"]["transits"]
                }
                for day, payload in september_days.items()
            }
            for row in sign_ingresses:
                self.assertEqual(
                    int(row["Solar_House_From"]),
                    yearly_forecast_service._solar_house(
                        row["Transit_Sign_From"], natal_sun_sign
                    ),
                )
                self.assertEqual(
                    int(row["Solar_House_To"]),
                    yearly_forecast_service._solar_house(
                        row["Transit_Sign_To"], natal_sun_sign
                    ),
                )
                self.assertEqual(
                    int(row["Natal_House_At_Event"]),
                    get_house(
                        daily_transits[row["Event_Date"]][row["Planet"]],
                        forecast["natal_house_cusps"],
                    ),
                )

            natal_ingresses = [
                row
                for row in event_rows
                if row["Event_Type"] == "natal_house_ingress"
            ]
            self.assertTrue(natal_ingresses)
            for row in natal_ingresses:
                event_day = date.fromisoformat(row["Event_Date"])
                previous_day = (event_day - timedelta(days=1)).isoformat()
                self.assertEqual(
                    get_house(
                        daily_transits[previous_day][row["Planet"]],
                        forecast["natal_house_cusps"],
                    ),
                    int(row["Natal_House_From"]),
                )
                self.assertEqual(
                    get_house(
                        daily_transits[row["Event_Date"]][row["Planet"]],
                        forecast["natal_house_cusps"],
                    ),
                    int(row["Natal_House_To"]),
                )

            daily_signs = {
                day: {
                    planet: yearly_forecast_service._sign_id_from_longitude(longitude)
                    for planet, longitude in transits.items()
                }
                for day, transits in daily_transits.items()
            }
            for planet, before_day, before_sign, after_day, after_sign in boundary_expectations:
                self.assertEqual(daily_signs[before_day][planet], before_sign)
                self.assertEqual(daily_signs[after_day][planet], after_sign)

    def test_retrograde_station_boundaries_bracketing_august_are_consistent(self):
        states = {
            (row["Planet"], row["Date"]): row
            for row in self.transit_calendar
        }
        boundaries = (
            ("MERCURY", "2026-07-23", "1", "2026-07-24", "0", "Retrograde_End_Flag"),
            ("SATURN", "2026-07-26", "0", "2026-07-27", "1", "Retrograde_Start_Flag"),
            ("URANUS", "2026-09-10", "0", "2026-09-11", "1", "Retrograde_Start_Flag"),
        )
        for planet, before_day, before_state, after_day, after_state, flag in boundaries:
            self.assertEqual(states[(planet, before_day)]["Retrograde_Flag"], before_state)
            self.assertEqual(states[(planet, after_day)]["Retrograde_Flag"], after_state)
            self.assertEqual(states[(planet, after_day)][flag], "1")

        august_outer_states = {
            planet: {
                row["Retrograde_Flag"]
                for row in self.transit_calendar
                if row["Date"].startswith("2026-08-") and row["Planet"] == planet
            }
            for planet in ("JUPITER", "SATURN", "URANUS", "NEPTUNE", "PLUTO")
        }
        self.assertEqual(august_outer_states["JUPITER"], {"0"})
        self.assertEqual(august_outer_states["SATURN"], {"1"})
        self.assertEqual(august_outer_states["URANUS"], {"0"})
        self.assertEqual(august_outer_states["NEPTUNE"], {"1"})
        self.assertEqual(august_outer_states["PLUTO"], {"1"})

    def test_september_uranus_station_is_carried_by_ranked_long_term_background(self):
        states = {
            (row["Planet"], row["Date"]): row
            for row in self.transit_calendar
        }
        self.assertEqual(states[("URANUS", "2026-09-10")]["Retrograde_Flag"], "0")
        self.assertEqual(states[("URANUS", "2026-09-11")]["Retrograde_Flag"], "1")
        self.assertEqual(
            states[("URANUS", "2026-09-11")]["Retrograde_Start_Flag"],
            "1",
        )

        for forecast in self.forecasts:
            september = forecast["monthly_overviews"]["2026-09"]
            self.assertFalse(
                any(
                    row["Planet"] == "URANUS"
                    for row in september[0]["event_paragraphs"]
                )
            )
            selected_uranus = []
            for day_number in (10, 11):
                overview = september[day_number - 1]
                priorities = [
                    int(row["Priority"])
                    for row in overview["long_term_backgrounds"]
                ]
                self.assertEqual(priorities, sorted(priorities, reverse=True))
                self.assertEqual(
                    [
                        row["Primary_Planet"]
                        for row in overview["long_term_backgrounds"]
                    ],
                    ["SATURN", "URANUS"],
                )
                uranus = next(
                    row
                    for row in overview["long_term_backgrounds"]
                    if row["Primary_Planet"] == "URANUS"
                )
                self.assertEqual(
                    uranus["State_Changes"],
                    "URANUS:2026-09-11:retrograde_start",
                )
                self.assertIn("9月11日", uranus["Interpretation"])
                self.assertRegex(
                    uranus["Interpretation"],
                    r"(開始までは|始める前|転じるまでは)",
                )
                self.assertRegex(
                    uranus["Interpretation"],
                    r"(逆行後|その後|逆行した後|転じた後)",
                )
                selected_uranus.append(uranus["Record_ID"])
            self.assertEqual(selected_uranus[0], selected_uranus[1])

    def test_cluster_periods_groups_and_anchor_houses_switch_correctly(self):
        for forecast in self.forecasts:
            august = forecast["monthly_overviews"]["2026-08"]
            expected_clusters = {
                1: {"2026_08_SUN_JUPITER_CARRYOVER"},
                6: set(),
                10: {"2026_08_LEO_STELLIUM", "2026_08_FIVE_PLANET_NETWORK"},
                15: {"2026_08_LEO_STELLIUM"},
                16: {"2026_08_MERCURY_JUPITER_CONJUNCTION"},
                19: set(),
                28: {"2026_08_FULL_MOON_URANUS_TSQUARE", "2026_08_JUPITER_SATURN_TRINE"},
                30: {"2026_08_JUPITER_SATURN_TRINE"},
            }
            natal_sun = next(
                row for row in forecast["natal_points"] if row["planet"] == "SUN"
            )
            natal_sun_sign = yearly_forecast_service._sign_id_from_longitude(
                natal_sun["longitude"]
            )
            day_by_date = {day["date"]: day for day in forecast["yearly_data"]}

            for day_number, expected in expected_clusters.items():
                overview = august[day_number - 1]
                self.assertEqual(
                    {row["Cluster_ID"] for row in overview["aspect_clusters"]},
                    expected,
                )
                groups = [row["Selection_Group"] for row in overview["aspect_clusters"]]
                self.assertEqual(len(groups), len(set(groups)))

                transit_rows = {
                    row["planet"]: row
                    for row in day_by_date[overview["as_of"]]["transit_chart"]["transits"]
                }
                for cluster in overview["aspect_clusters"]:
                    anchor = cluster["Anchor_Planet"]
                    longitude = transit_rows[anchor]["longitude"]
                    sign = yearly_forecast_service._sign_id_from_longitude(longitude)
                    self.assertEqual(
                        int(cluster["Anchor_Solar_House"]),
                        yearly_forecast_service._solar_house(sign, natal_sun_sign),
                    )
                    self.assertEqual(
                        int(cluster["Anchor_Natal_House"]),
                        get_house(longitude, forecast["natal_house_cusps"]),
                    )

    def test_september_cluster_boundaries_groups_priorities_and_anchors(self):
        expected_clusters = {
            1: {"2026_09_OPENING_FOUR_PLANET_NETWORK"},
            3: {"2026_09_OPENING_FOUR_PLANET_NETWORK"},
            4: set(),
            11: set(),
            12: {"2026_09_MERCURY_OUTER_NETWORK"},
            14: {
                "2026_09_MERCURY_OUTER_NETWORK",
                "2026_09_VENUS_PLUTO_SQUARE",
            },
            15: {
                "2026_09_MERCURY_OUTER_NETWORK",
                "2026_09_VENUS_PLUTO_SQUARE",
            },
            16: {"2026_09_VENUS_PLUTO_SQUARE"},
            18: {"2026_09_VENUS_PLUTO_SQUARE"},
            19: set(),
            25: set(),
            26: {"2026_09_FULL_MOON_OUTER_NETWORK"},
            29: {"2026_09_FULL_MOON_OUTER_NETWORK"},
            30: {"2026_09_MONTH_END_TSQUARE_BUILDING"},
        }
        expected_metadata = {
            "2026_09_OPENING_FOUR_PLANET_NETWORK": (
                "SEP_OPENING_STRUCTURE",
                100,
            ),
            "2026_09_MERCURY_OUTER_NETWORK": (
                "SEP_MERCURY_OUTER_NETWORK",
                100,
            ),
            "2026_09_VENUS_PLUTO_SQUARE": ("SEP_VALUES_POWER", 90),
            "2026_09_FULL_MOON_OUTER_NETWORK": (
                "SEP_FULL_MOON_OUTER_NETWORK",
                100,
            ),
            "2026_09_MONTH_END_TSQUARE_BUILDING": (
                "SEP_MONTH_END_PRESSURE",
                100,
            ),
        }

        for forecast in self.forecasts:
            september = forecast["monthly_overviews"]["2026-09"]
            natal_sun = next(
                row for row in forecast["natal_points"] if row["planet"] == "SUN"
            )
            natal_sun_sign = yearly_forecast_service._sign_id_from_longitude(
                natal_sun["longitude"]
            )
            day_by_date = {day["date"]: day for day in forecast["yearly_data"]}

            for day_number, expected in expected_clusters.items():
                overview = september[day_number - 1]
                clusters = overview["aspect_clusters"]
                self.assertEqual(
                    {row["Cluster_ID"] for row in clusters},
                    expected,
                )
                groups = [row["Selection_Group"] for row in clusters]
                self.assertEqual(len(groups), len(set(groups)))
                self.assertEqual(
                    [row["Peak_At"] for row in clusters],
                    sorted(row["Peak_At"] for row in clusters),
                )

                transit_rows = {
                    row["planet"]: row
                    for row in day_by_date[overview["as_of"]]["transit_chart"]["transits"]
                }
                for cluster in clusters:
                    expected_group, expected_priority = expected_metadata[
                        cluster["Cluster_ID"]
                    ]
                    self.assertEqual(cluster["Selection_Group"], expected_group)
                    self.assertEqual(int(cluster["Priority"]), expected_priority)
                    anchor = cluster["Anchor_Planet"]
                    longitude = transit_rows[anchor]["longitude"]
                    sign = yearly_forecast_service._sign_id_from_longitude(longitude)
                    self.assertEqual(
                        int(cluster["Anchor_Solar_House"]),
                        yearly_forecast_service._solar_house(sign, natal_sun_sign),
                    )
                    self.assertEqual(
                        int(cluster["Anchor_Natal_House"]),
                        get_house(longitude, forecast["natal_house_cusps"]),
                    )

    def test_september_composed_narratives_limits_dates_and_order(self):
        allowed_long_term_dates = {"9月11日", "9月23日", "9月28日"}

        for forecast in self.forecasts:
            september = forecast["monthly_overviews"]["2026-09"]
            self.assertEqual(len(september), 30)

            for overview in september:
                editorial = overview["editorial"]
                self.assertEqual(editorial["Edition_ID"], "2026_VIRGO")
                self.assertIn(len(editorial["Title"]), range(14, 29))
                self.assertIn(len(editorial["Summary"]), range(90, 151))
                self.assertIn(len(editorial["Interpretation"]), range(500, 901))
                self.assertIn(len(editorial["Action"]), range(120, 221))
                self.assertFalse(EXACT_DATE_PATTERN.search(editorial["Summary"]))
                self.assertFalse(EXACT_DATE_PATTERN.search(editorial["Interpretation"]))
                self.assertFalse(EXACT_DATE_PATTERN.search(editorial["Action"]))

                event_rows = overview["event_paragraphs"]
                self.assertEqual(
                    event_rows,
                    sorted(
                        event_rows,
                        key=lambda row: (
                            date.fromisoformat(row["Event_Date"]),
                            int(row["Section_Order"]),
                            -int(row["Priority"]),
                            row["Template_ID"],
                        ),
                    ),
                )
                for row in event_rows:
                    self.assertIn(len(row["Paragraph_Template"]), range(90, 241))
                    event_date = date.fromisoformat(row["Event_Date"])
                    event_label = monthly_overview_service._format_event_date(
                        event_date,
                        row["Date_Precision"],
                    )
                    self.assertIn(event_label, row["Paragraph_Template"])

                cluster_rows = overview["aspect_clusters"]
                self.assertEqual(
                    cluster_rows,
                    sorted(
                        cluster_rows,
                        key=lambda row: (
                            date.fromisoformat(row["Peak_At"][:10]),
                            int(row["Section_Order"]),
                            -int(row["Priority"]),
                            row["Cluster_ID"],
                        ),
                    ),
                )
                self.assertEqual(
                    len({row["Selection_Group"] for row in cluster_rows}),
                    len(cluster_rows),
                )
                for row in cluster_rows:
                    self.assertIn(len(row["Title"]), range(14, 31))
                    self.assertIn(len(row["Paragraph_Template"]), range(120, 261))
                    primary_label, _secondary_label = (
                        monthly_overview_service._cluster_date_labels(
                            row,
                            "2026_09",
                        )
                    )
                    self.assertIn(primary_label, row["Paragraph_Template"])

                backgrounds = overview["long_term_backgrounds"]
                self.assertLessEqual(len(backgrounds), 2)
                self.assertLessEqual(int(overview["resonance"] is not None), 1)
                priorities = [int(row["Priority"]) for row in backgrounds]
                self.assertEqual(priorities, sorted(priorities, reverse=True))
                for row in backgrounds:
                    self.assertIn(len(row["Title"]), range(12, 29))
                    self.assertIn(len(row["Interpretation"]), range(220, 421))
                    self.assertTrue(
                        set(EXACT_DATE_PATTERN.findall(row["Interpretation"]))
                        <= allowed_long_term_dates
                    )
                if overview["resonance"] is not None:
                    resonance = overview["resonance"]
                    self.assertIn(len(resonance["Title"]), range(12, 29))
                    self.assertIn(len(resonance["Interpretation"]), range(220, 421))
                    self.assertTrue(
                        set(EXACT_DATE_PATTERN.findall(resonance["Interpretation"]))
                        <= allowed_long_term_dates
                    )

                narratives = _labeled_narratives(overview)
                normalized = [_normalized_narrative(text) for _label, text in narratives]
                self.assertEqual(len(normalized), len(set(normalized)))
                for label, text in narratives:
                    self.assertFalse(TOKEN_PATTERN.search(text), label)
                    self.assertFalse(any(marker in text for marker in MOJIBAKE_MARKERS), label)
                    self.assertNotIn("頃頃", text, label)

                for (left_label, left_text), (right_label, right_text) in combinations(
                    narratives,
                    2,
                ):
                    self.assertLess(
                        _bigram_jaccard(left_text, right_text),
                        0.5,
                        f"{overview['as_of']}: {left_label} / {right_label}",
                    )

    def test_long_term_limits_resonance_boundary_and_narrative_quality(self):
        for forecast in self.forecasts:
            august = forecast["monthly_overviews"]["2026-08"]
            for overview in august:
                editorial = overview["editorial"]
                self.assertIn(len(editorial["Title"]), range(14, 29))
                self.assertIn(len(editorial["Summary"]), range(90, 151))
                self.assertIn(len(editorial["Interpretation"]), range(500, 901))
                self.assertIn(len(editorial["Action"]), range(120, 221))
                self.assertLessEqual(len(overview["long_term_backgrounds"]), 2)
                self.assertLessEqual(int(overview["resonance"] is not None), 1)

                priorities = [
                    int(row["Priority"]) for row in overview["long_term_backgrounds"]
                ]
                self.assertEqual(priorities, sorted(priorities, reverse=True))
                for row in overview["long_term_backgrounds"]:
                    self.assertIn(len(row["Title"]), range(12, 29))
                    self.assertIn(len(row["Interpretation"]), range(220, 421))
                if overview["resonance"] is not None:
                    self.assertIn(len(overview["resonance"]["Title"]), range(12, 29))
                    self.assertIn(
                        len(overview["resonance"]["Interpretation"]), range(220, 421)
                    )

                texts = _narratives(overview)
                normalized = [_normalized_narrative(text) for text in texts]
                self.assertEqual(len(normalized), len(set(normalized)))
                self.assertFalse(any(TOKEN_PATTERN.search(text) for text in texts))
                self.assertFalse(any("\ufffd" in text for text in texts))
                self.assertFalse(any("頃頃" in text for text in texts))

            august_10 = august[9]["resonance"]
            self.assertIsNotNone(august_10)
            self.assertEqual(
                (
                    august_10["Primary_Planet"],
                    august_10["Secondary_Planet"],
                    august_10["Match_Type"],
                    august_10["Priority"],
                ),
                ("URANUS", "MARS", "same_sign", "165"),
            )
            august_11 = august[10]["resonance"]
            if august_11 is not None:
                self.assertNotEqual(august_11["Match_Type"], "same_sign")


if __name__ == "__main__":
    unittest.main()
