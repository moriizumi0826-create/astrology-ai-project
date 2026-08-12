from __future__ import annotations

import re
import unittest
from datetime import date, timedelta

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


class MonthlyOverviewIntegrationTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.forecasts = [
            yearly_forecast_service.generate_yearly_forecast(payload, 2026)
            for payload in BIRTH_CASES
        ]
        cls.transit_calendar = monthly_overview_service.load_transit_calendar(2026)

    def test_three_birth_records_preserve_scores_and_select_distinct_editorials(self):
        house_pairs = set()
        for forecast in self.forecasts:
            self.assertEqual(len(forecast["yearly_data"]), 365)
            self.assertTrue(any(day["all_aspects"] for day in forecast["yearly_data"]))
            self.assertTrue(
                all(SCORE_KEYS.issubset(day["scores"]) for day in forecast["yearly_data"])
            )

            august = forecast["monthly_overviews"]["2026-08"]
            self.assertEqual(len(august), 31)
            self.assertEqual(
                [overview["as_of"] for overview in august],
                [(date(2026, 8, 1) + timedelta(days=offset)).isoformat() for offset in range(31)],
            )
            editorial = august[0]["editorial"]
            self.assertEqual(editorial["Edition_ID"], "2026_LEO")
            solar_house = int(editorial["Solar_House"])
            natal_house = int(editorial["Natal_House"])
            self.assertIn(solar_house, range(1, 13))
            self.assertIn(natal_house, range(1, 13))
            house_pairs.add((solar_house, natal_house))

        self.assertEqual(len(house_pairs), len(BIRTH_CASES))

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
