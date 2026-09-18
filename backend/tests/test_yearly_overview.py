from __future__ import annotations

import re
import unittest

from backend.app.services import yearly_forecast_service, yearly_overview_service


class YearlyOverviewServiceTests(unittest.TestCase):
    def test_editorial_selection_covers_twelve_signs_and_twelve_natal_houses(self):
        for sign in yearly_overview_service.SIGNS:
            solar_house = yearly_overview_service._solar_house("ARIES", sign)
            for natal_house in range(1, 13):
                with self.subTest(sign=sign, natal_house=natal_house):
                    row = yearly_overview_service.select_editorial_row(
                        2026,
                        sign,
                        solar_house,
                        natal_house,
                    )
                    self.assertEqual(row.get("Edition_ID"), f"2026_{sign}")
                    self.assertEqual(int(row.get("Solar_House", 0)), solar_house)
                    self.assertEqual(int(row.get("Natal_House", 0)), natal_house)

    def test_build_yearly_overview_returns_five_complete_sections(self):
        overview = yearly_overview_service.build_yearly_overview(
            year=2026,
            natal_points=[{"planet": "SUN", "longitude": 165.0, "house": 6}],
            house_cusps=[float(index * 30) for index in range(12)],
            natal_sun_sign="VIRGO",
        )

        self.assertIsNotNone(overview)
        assert overview is not None
        self.assertEqual(overview["edition_id"], "2026_VIRGO")
        self.assertEqual(overview["solar_house"], 8)
        self.assertEqual(overview["natal_house"], 6)
        self.assertEqual(
            [section["key"] for section in overview["sections"]],
            ["global_theme", "core_evolution", "house_transition", "annual_flow", "action"],
        )
        self.assertTrue(all(section["text"].strip() for section in overview["sections"]))
        self.assertIsNone(re.search(r"\{[a-zA-Z0-9_]+\}", overview["full_text"]))
        self.assertEqual(
            [(item["planet"], item["event_date"]) for item in overview["events"]],
            [
                ("NEPTUNE", "2026-01-27"),
                ("URANUS", "2026-04-26"),
                ("JUPITER", "2026-06-30"),
                ("VENUS", "2026-10-03"),
            ],
        )
        self.assertEqual(overview["planet_transitions"]["SATURN"]["transition_date"], "2026-02-14")

    def test_unsupported_year_has_no_overview(self):
        overview = yearly_overview_service.build_yearly_overview(
            year=2027,
            natal_points=[{"planet": "SUN", "longitude": 15.0, "house": 1}],
            house_cusps=[float(index * 30) for index in range(12)],
            natal_sun_sign="ARIES",
        )
        self.assertIsNone(overview)

    def test_forecast_projections_keep_yearly_overview(self):
        overview = {"year": 2026, "title": "Yearly overview"}
        forecast = {
            "summary": "summary",
            "yearly_overview_schema": 1,
            "yearly_overview": overview,
            "yearly_data": [],
        }

        summary = yearly_forecast_service.build_yearly_forecast_summary(forecast)
        annual = yearly_forecast_service.build_yearly_forecast_detail(
            forecast,
            scope="annual",
            year=2026,
        )

        self.assertEqual(summary["yearly_overview"], overview)
        self.assertEqual(summary["yearly_overview_schema"], 1)
        self.assertEqual(annual["yearly_overview"], overview)


if __name__ == "__main__":
    unittest.main()
