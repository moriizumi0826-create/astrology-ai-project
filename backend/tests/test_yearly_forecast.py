import csv
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

from backend.app.services.chart_calculator import BirthInput
from backend.app.services import monthly_overview_service, monthly_peak_service, yearly_forecast_service
from backend.app.services.yearly_forecast_service import (
    _yearly_summary_rows,
    _solar_house,
    build_yearly_forecast_detail,
    build_yearly_forecast_summary,
    reload_yearly_master_caches_if_changed,
    generate_yearly_forecast,
)
from backend.tests.monthly_peak_narrative_quality_fixture import NARRATIVE_QUALITY_BIRTH_INPUT
from scripts.generate_yearly_forecast_masters import duration_type, yearly_weight
from scripts.apply_aspect_genre_scores_full import _score as full_genre_score
from scripts.apply_aspect_genre_dual_scores import dual_genre_score


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATABASE_DIR = PROJECT_ROOT / "database"


class YearlyForecastTestCase(unittest.TestCase):
    def test_summary_projection_keeps_scores_and_removes_daily_detail(self):
        forecast = {
            "summary": "summary",
            "monthly_overview_schema": 1,
            "monthly_overviews": {"2026-08": [{"as_of": "2026-08-01"}]},
            "yearly_data": [
                {
                    "date": "2026-07-21",
                    "scores": {"total": 12, "work": 5},
                    "transit_chart": {"transits": [1]},
                    "all_aspects": [{"id": 1}],
                }
            ],
            "natal_points": [{"planet": "SUN"}],
            "annual_themes": [{"description": "heavy"}],
        }

        summary = build_yearly_forecast_summary(forecast)

        self.assertEqual(
            summary["yearly_data"],
            [{"date": "2026-07-21", "scores": {"total": 12, "work": 5}}],
        )
        self.assertNotIn("annual_themes", summary)
        self.assertEqual(summary["monthly_overview_schema"], 1)
        self.assertNotIn("monthly_overviews", summary)
        self.assertFalse(summary["detail_loaded"]["annual"])

    def test_month_detail_includes_only_requested_monthly_overview(self):
        august = [{"as_of": "2026-08-01", "title": "August"}]
        forecast = {
            "monthly_overviews": {
                "2026-08": august,
                "2026-09": [{"as_of": "2026-09-01", "title": "September"}],
            },
        }

        detail = build_yearly_forecast_detail(forecast, scope="month", year=2026, month=8)

        self.assertEqual(detail["monthly_overviews"], {"2026-08": august})
        self.assertNotIn("2026-09", detail["monthly_overviews"])

    def test_annual_detail_compacts_consecutive_daily_aspects(self):
        aspect = {
            "t_planet": "JUPITER",
            "n_planet": "VENUS",
            "aspect_angle": 60,
            "natal_house": 6,
            "description": "description",
            "genre_descriptions": {"love": "love"},
            "genre_score_components": {"love": {"positive": 35, "negative": 0}},
            "genre_importance_scores": {"love": 35},
            "genre_applicability": {"genres": ["love"]},
        }
        forecast = {
            "yearly_data": [
                {"date": "2026-07-21", "all_aspects": [aspect]},
                {"date": "2026-07-22", "all_aspects": [aspect]},
                {"date": "2026-07-24", "all_aspects": [aspect]},
            ],
        }

        detail = build_yearly_forecast_detail(forecast, scope="annual", year=2026)

        self.assertEqual(len(detail["annual_category_aspects"]), 2)
        self.assertEqual(detail["annual_category_aspects"][0]["start_date"], "2026-07-21")
        self.assertEqual(detail["annual_category_aspects"][0]["end_date"], "2026-07-22")

    def test_full_genre_score_keeps_transit_direction_and_house_context(self):
        self.assertEqual(full_genre_score("MARS", "VENUS", 0, 2, "money"), -65)
        self.assertEqual(full_genre_score("VENUS", "MARS", 0, 2, "money"), 55)
        self.assertEqual(full_genre_score("SATURN", "MC", 90, 10, "work"), -90)

    def test_dual_genre_score_separates_positive_and_negative_components(self):
        self.assertEqual(
            dual_genre_score("VENUS", "MARS", 60, 7, "love"),
            {"positive": 70, "negative": 0},
        )
        self.assertEqual(
            dual_genre_score("MARS", "VENUS", 90, 2, "money"),
            {"positive": 0, "negative": 65},
        )
        self.assertEqual(
            dual_genre_score("SUN", "NEPTUNE", 150, 2, "work"),
            {"positive": 0, "negative": 50},
        )

    def test_genre_importance_uses_stronger_dual_component(self):
        scores = yearly_forecast_service._aspect_genre_importance_scores(
            {
                "love": {"positive": 80.0, "negative": 15.0},
                "work": {"positive": 10.0, "negative": 50.0},
                "money": {"positive": None, "negative": None},
            },
        )

        self.assertEqual(scores, {"love": 80.0, "work": 50.0, "money": None})

    def test_genre_score_pilot_is_loaded_by_four_part_key(self):
        get_scores = yearly_forecast_service.reading_service.get_aspect_genre_score_components

        self.assertEqual(
            get_scores("SUN", "NEPTUNE", 150, 2),
            {
                "general_health": {"positive": 0.0, "negative": 20.0},
                "love": {"positive": None, "negative": None},
                "work": {"positive": 0.0, "negative": 50.0},
                "money": {"positive": 0.0, "negative": 55.0},
            },
        )
        self.assertEqual(
            get_scores("VENUS", "MARS", 120, 7),
            {
                "general_health": {"positive": 35.0, "negative": 0.0},
                "love": {"positive": 80.0, "negative": 0.0},
                "work": {"positive": 40.0, "negative": 0.0},
                "money": {"positive": 45.0, "negative": 0.0},
            },
        )
        self.assertEqual(
            get_scores("MARS", "VENUS", 0, 2),
            {
                "general_health": {"positive": 35.0, "negative": 0.0},
                "love": {"positive": 50.0, "negative": 0.0},
                "work": {"positive": 45.0, "negative": 0.0},
                "money": {"positive": 0.0, "negative": 40.0},
            },
        )

    def test_genre_graph_score_uses_positive_minus_negative_components(self):
        get_impacts = yearly_forecast_service.reading_service.get_aspect_genre_score_impacts
        components = {
            "love": {"positive": 80.0, "negative": 15.0},
            "work": {"positive": 10.0, "negative": 50.0},
            "money": {"positive": None, "negative": None},
        }

        with patch.object(
            yearly_forecast_service.reading_service,
            "get_aspect_genre_score_components",
            return_value=components,
        ) as get_components:
            impacts = get_impacts("VENUS", "MARS", 120, 7)

        self.assertEqual(
            impacts,
            {"general_health": None, "love": 65.0, "work": -40.0, "money": None},
        )
        get_components.assert_called_once_with("VENUS", "MARS", 120, 7)

    def test_yearly_weight_is_transit_duration_only(self):
        expected = {
            "SUN": ("SHORT", 0.35),
            "MERCURY": ("SHORT", 0.35),
            "VENUS": ("SHORT", 0.35),
            "MOON": ("SHORT", 0.35),
            "MARS": ("MID", 0.7),
            "JUPITER": ("LONG", 1.0),
            "SATURN": ("LONG", 1.0),
            "URANUS": ("LONG", 1.0),
            "NEPTUNE": ("LONG", 1.0),
            "PLUTO": ("LONG", 1.0),
        }
        for transit_planet, (kind, weight) in expected.items():
            with self.subTest(transit_planet=transit_planet):
                self.assertEqual(duration_type(transit_planet, "NATAL_PLUTO"), kind)
                self.assertEqual(yearly_weight(kind), weight)

    def test_yearly_aspect_event_includes_house_level_genre_descriptions(self):
        genre_descriptions = {
            "love": "Love description",
            "work": "Work description",
            "money": "Money description",
        }
        genre_scores = {"love": 45.0, "work": -20.0, "money": None}
        genre_components = {
            "love": {"positive": 45.0, "negative": 10.0},
            "work": {"positive": 5.0, "negative": 20.0},
            "money": {"positive": None, "negative": None},
        }
        with patch.object(
            yearly_forecast_service,
            "_aspect_yearly_rows",
            return_value={},
        ), patch.object(
            yearly_forecast_service.reading_service,
            "get_aspect_genre_descriptions",
            return_value=genre_descriptions,
        ) as get_genre_descriptions:
            with patch.object(
                yearly_forecast_service.reading_service,
                "get_aspect_genre_score_impacts",
                return_value=genre_scores,
            ) as get_genre_scores:
                with patch.object(
                    yearly_forecast_service.reading_service,
                    "get_aspect_genre_score_components",
                    return_value=genre_components,
                ) as get_genre_components:
                    event = yearly_forecast_service._event_from_interpretation(
                    {
                        "Aspect_Logic_ID": "TRANSIT_VENUS_NATAL_MARS_120_7",
                        "Category": "Love,Money,Work",
                        "Text_Description": "Generic description",
                        "Advised_Task": "Generic task",
                        "Priority": 8,
                    },
                    "VENUS",
                    {"planet": "MARS", "house": 7, "longitude": 244.0},
                    120,
                    0.5,
                    "Applying",
                    False,
                    4.0,
                    120.5,
                )

        get_genre_descriptions.assert_called_once_with("VENUS", "MARS", 120, 7)
        get_genre_scores.assert_called_once_with("VENUS", "MARS", 120, 7)
        get_genre_components.assert_called_once_with("VENUS", "MARS", 120, 7)
        self.assertEqual(event["genre_descriptions"], genre_descriptions)
        self.assertEqual(event["genre_score_impacts"], genre_scores)
        self.assertEqual(event["genre_score_components"], genre_components)
        self.assertEqual(
            event["genre_importance_scores"],
            {"love": 45.0, "work": 20.0, "money": None},
        )
        self.assertEqual(event["yearly_weight"], 1.0)
        self.assertEqual(
            event["genre_applicability"]["genres"],
            ["love", "work"],
        )
        self.assertEqual(event["natal_house"], 7)
        self.assertEqual(event["description"], "Generic description")

    def test_aspect_genre_applicability_uses_authored_score_columns(self):
        applicability = yearly_forecast_service._aspect_genre_applicability(
            "Love",
            {
                "love": {"positive": None, "negative": None},
                "work": {"positive": 0.0, "negative": 45.0},
                "money": {"positive": None, "negative": None},
            },
        )

        self.assertEqual(applicability["category_genres"], ["love"])
        self.assertEqual(applicability["score_genres"], ["work"])
        self.assertEqual(applicability["genres"], ["work"])
        self.assertEqual(applicability["planet_rule_genres"], [])

    def test_yearly_forecast_reuses_same_input_and_year_result(self):
        payload = BirthInput(
            full_name="Cache Test",
            birth_date="1984-08-26",
            birth_time="19:20",
            birth_time_unknown=False,
            birthplace="Tokyo",
            latitude=35.6812,
            longitude=139.7671,
            timezone_offset=9,
        )
        yearly_forecast_service._cached_yearly_forecast.cache_clear()
        with patch.object(
            yearly_forecast_service,
            "_generate_yearly_forecast_uncached",
            side_effect=[{"year": 2026}, {"year": "refreshed"}, {"year": 2027}],
        ) as generate_uncached:
            first = generate_yearly_forecast(payload, 2026)
            second = generate_yearly_forecast(payload, 2026)
            reload_yearly_master_caches_if_changed(force=True)
            refreshed = generate_yearly_forecast(payload, 2026)
            other_year = generate_yearly_forecast(payload, 2027)

        self.assertIs(first, second)
        self.assertEqual(refreshed, {"year": "refreshed"})
        self.assertEqual(other_year, {"year": 2027})
        self.assertEqual(generate_uncached.call_count, 3)
        yearly_forecast_service._cached_yearly_forecast.cache_clear()

    def test_yearly_master_version_paths_include_monthly_peak_rules(self):
        filenames = {
            path.name for path in yearly_forecast_service.yearly_csv_paths_for_version()
        }
        self.assertTrue({
            monthly_peak_service.RULES_FILENAME,
            monthly_peak_service.SCORING_FILENAME,
            monthly_peak_service.PERIOD_FILENAME,
            monthly_peak_service.NARRATIVE_TEMPLATES_FILENAME,
        }.issubset(filenames))
        self.assertTrue({
            monthly_overview_service.EDITORIAL_FILENAME,
            "M_Monthly_Overview_Event_Paragraphs_2026_08.csv",
            "M_Monthly_Overview_Aspect_Clusters_2026_08.csv",
            "M_Personal_Long_Term_Background_2026_08.csv",
            "M_Monthly_Overview_Event_Paragraphs_2026_09.csv",
            "M_Monthly_Overview_Aspect_Clusters_2026_09.csv",
            "M_Personal_Long_Term_Background_2026_09.csv",
        }.issubset(filenames))

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

    def test_aspect_yearly_master_exists_and_obsolete_base_logic_is_not_versioned(self):
        yearly_path = DATABASE_DIR / "M_Aspect_Interpretation_Yearly.csv"
        with yearly_path.open("r", encoding="utf-8-sig", newline="") as f:
            yearly_rows = list(csv.DictReader(f))

        self.assertGreater(len(yearly_rows), 30000)
        self.assertTrue({"Duration_Type", "Yearly_Weight", "Graph_Visibility"}.issubset(yearly_rows[0]))
        self.assertNotIn(
            "M_Yearly_Base_Logic.csv",
            {path.name for path in yearly_forecast_service.yearly_csv_paths_for_version()},
        )

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

    def test_house_peak_event_distinguishes_ingress_from_stay(self):
        ingress = yearly_forecast_service._house_peak_event(
            date(2026, 7, 10),
            "VENUS",
            house_system="natal",
            target_house=6,
            previous_house=5,
        )
        stay = yearly_forecast_service._house_peak_event(
            date(2026, 7, 11),
            "VENUS",
            house_system="solar",
            target_house=1,
            previous_house=1,
        )

        self.assertEqual(ingress["transit_state"], "ingress")
        self.assertEqual(ingress["factor_type"], "natal_house")
        self.assertEqual(stay["transit_state"], "stay")
        self.assertEqual(stay["factor_type"], "solar_house")

    def test_monthly_peak_graph_scores_normalize_and_clamp(self):
        scores = monthly_peak_service.calculate_daily_graph_scores({
            "general_health": {"activation": 250, "caution": 0, "daily_cap": 100},
            "work": {"activation": 9, "caution": 4, "daily_cap": 50},
            "love": {"activation": 1, "caution": 2, "daily_cap": 100},
            "money": {"activation": 0, "caution": 0, "daily_cap": 100},
        })

        self.assertEqual(scores["general"], 100)
        self.assertEqual(scores["work"], 10)
        self.assertEqual(scores["love"], -1)
        self.assertEqual(scores["money"], 0)
        self.assertTrue(-100 <= scores["total"] <= 100)

    def test_monthly_peak_csvs_load_with_expected_rows(self):
        peak_rules = monthly_peak_service.load_monthly_peak_rules()
        scoring_rules = monthly_peak_service.load_monthly_peak_scoring_rules()
        period_rules = monthly_peak_service.load_monthly_peak_period_rules()
        narrative_templates = monthly_peak_service.load_monthly_peak_narrative_templates()

        self.assertEqual(len(peak_rules), 3260)
        self.assertEqual(len(scoring_rules), 32)
        self.assertEqual(len(period_rules), 4)
        self.assertEqual(len(narrative_templates), 108)
        self.assertEqual(
            {row["Category"] for row in period_rules},
            {"general_health", "work", "love", "money"},
        )
        self.assertTrue(all(row["Narrative_Label"] for row in narrative_templates))

        stay_rules = [
            row for row in peak_rules
            if row["Factor_Type"] in {"natal_house", "solar_house"}
            and row["Transit_State"] == "stay"
            and row["Active_Flag"] == "1"
        ]
        stay_keys = {
            (row["Factor_Type"], row["Transit_Planet"], row["Target_House"], row["Category"])
            for row in stay_rules
        }
        self.assertEqual(len(stay_rules), 372)
        self.assertEqual(len(stay_keys), 372)
        self.assertTrue(all(row["Intensity_Hint"] == "low" for row in stay_rules))
        self.assertTrue(all(row["Narrative_Priority"] == "0" for row in stay_rules))

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

    def test_monthly_peak_numeric_zero_matches_conjunction_rules(self):
        rule = next(
            row
            for row in monthly_peak_service.load_monthly_peak_rules()
            if row["Rule_ID"] == "AUTO_LOVE_T2N_SUN_SUN_A0"
        )
        event = {
            "factor_type": "transit_to_natal",
            "transit_planet": "SUN",
            "natal_target": "SUN",
            "target_role": ("core_theme", "core_self", "vitality"),
            "house_system": "natal",
            "target_house": 6,
            "aspect_angle": 0,
            "aspect_class": "conjunction",
            "transit_state": "direct",
            "orb": 0.0,
        }

        self.assertTrue(monthly_peak_service.monthly_peak_rule_matches(rule, event))
        self.assertTrue(monthly_peak_service.monthly_peak_rule_matches(
            rule, {**event, "aspect_angle": 0.0}
        ))
        self.assertEqual(
            monthly_peak_service.matching_monthly_peak_categories(event),
            ("love", "work"),
        )

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

        self.assertEqual(result["work"]["activation"], 5.4)
        self.assertEqual(result["work"]["caution"], 2.4)
        self.assertEqual(result["work"]["daily_cap"], 12.0)
        self.assertEqual(len(result["work"]["matched_rules"]), 1)
        self.assertEqual(result["work"]["matched_rules"][0]["exactness"], 0.6)
        self.assertEqual(result["love"]["activation"], 0.0)

    def test_monthly_peak_aspect_uses_score_impact_yearly_weight_and_orb(self):
        rule = {
            "Rule_ID": "TEST_WORK_ASPECT_SCORE",
            "Category": "work",
            "Factor_Type": "transit_to_natal",
            "Peak_Type": "career",
            "Transit_Planet": "SATURN",
            "Natal_Target": "MC",
            "Target_Role": "career_axis",
            "House_System": "natal",
            "Target_House": "10",
            "Aspect_Angle": "90",
            "Aspect_Class": "hard",
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
            "Tags": "career;square",
            "Active_Flag": "1",
        }
        scoring_rule = {
            "Rule_ID": "TEST_WORK_ASPECT_SCORE_SCORING",
            "Category": "work",
            "Factor_Type": "transit_to_natal",
            "Tone": "ANY",
            "Intensity_Hint": "ANY",
            "Activation_Multiplier": "1.5",
            "Caution_Multiplier": "2",
            "Daily_Cap": "12",
            "Priority": "1",
            "Active_Flag": "1",
        }
        base_event = {
            "id": "EVENT_SCORE",
            "factor_type": "transit_to_natal",
            "transit_planet": "SATURN",
            "natal_target": "MC",
            "target_role": ("career_axis",),
            "house_system": "natal",
            "target_house": 10,
            "aspect_angle": 90,
            "aspect_class": "hard",
            "transit_state": "direct",
            "orb": 1.2,
            "yearly_weight": 0.7,
        }

        negative = monthly_peak_service.aggregate_daily_peak_categories(
            [{**base_event, "score_impact": -50}],
            rules=[rule],
            scoring_rules=[scoring_rule],
        )["work"]
        positive = monthly_peak_service.aggregate_daily_peak_categories(
            [{**base_event, "id": "EVENT_SCORE_POSITIVE", "score_impact": 50}],
            rules=[rule],
            scoring_rules=[scoring_rule],
        )["work"]
        genre_specific = monthly_peak_service.aggregate_daily_peak_categories(
            [{
                **base_event,
                "id": "EVENT_GENRE_SCORE",
                "score_impact": -50,
                "genre_score_impacts": {"love": None, "work": 80, "money": None},
            }],
            rules=[rule],
            scoring_rules=[scoring_rule],
        )["work"]
        non_applicable_genre = monthly_peak_service.aggregate_daily_peak_categories(
            [{
                **base_event,
                "id": "EVENT_NON_APPLICABLE_GENRE",
                "score_impact": -50,
                "genre_score_impacts": {"love": None, "work": None, "money": None},
            }],
            rules=[rule],
            scoring_rules=[scoring_rule],
        )["work"]
        general_rule = {
            **rule,
            "Rule_ID": "TEST_GENERAL_ASPECT_SCORE",
            "Category": "general_health",
        }
        general_scoring_rule = {
            **scoring_rule,
            "Rule_ID": "TEST_GENERAL_ASPECT_SCORE_SCORING",
            "Category": "general_health",
        }
        general = monthly_peak_service.aggregate_daily_peak_categories(
            [{
                **base_event,
                "id": "EVENT_GENERAL_RULE_SCORE",
                "genre_score_impacts": {
                    "general_health": -70,
                    "love": None,
                    "work": None,
                    "money": None,
                },
            }],
            rules=[general_rule],
            scoring_rules=[general_scoring_rule],
        )["general_health"]
        general_not_applicable = monthly_peak_service.aggregate_daily_peak_categories(
            [{
                **base_event,
                "id": "EVENT_GENERAL_NOT_APPLICABLE",
                "genre_score_impacts": {
                    "general_health": None,
                    "love": None,
                    "work": None,
                    "money": None,
                },
            }],
            rules=[general_rule],
            scoring_rules=[general_scoring_rule],
        )["general_health"]

        self.assertEqual(negative["activation"], 0.0)
        self.assertEqual(negative["caution"], 2.52)
        self.assertEqual(positive["activation"], 1.89)
        self.assertEqual(positive["caution"], 0.0)
        self.assertEqual(genre_specific["activation"], 3.02)
        self.assertEqual(genre_specific["caution"], 0.0)
        self.assertEqual(
            genre_specific["matched_rules"][0]["score_impact_source"],
            "genre",
        )
        self.assertEqual(non_applicable_genre["activation"], 0.0)
        self.assertEqual(non_applicable_genre["caution"], 0.0)
        self.assertEqual(
            non_applicable_genre["matched_rules"][0]["score_impact_source"],
            "genre_not_applicable",
        )
        self.assertEqual(general["activation"], 0.0)
        self.assertEqual(general["caution"], 3.53)
        self.assertEqual(general["matched_rules"][0]["score_impact"], -70.0)
        self.assertEqual(general["matched_rules"][0]["score_impact_source"], "genre")
        self.assertEqual(general_not_applicable["activation"], 0.0)
        self.assertEqual(general_not_applicable["caution"], 0.0)
        self.assertEqual(
            general_not_applicable["matched_rules"][0]["score_impact_source"],
            "genre_not_applicable",
        )

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

        def peak_day(day_text, activation, caution, graph_score, planet="MARS", intensity="high"):
            return {
                "date": day_text,
                "scores": {"work": graph_score},
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
                            "narrative_key": "role",
                            "narrative_priority": 3,
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
                peak_day("2026-07-01", 7, 1, 30),
                peak_day("2026-07-02", 9, 4, 80),
                peak_day("2026-07-03", 8, 2, 10),
                peak_day("2026-07-04", 12, 0, 100, intensity="background_only"),
                peak_day("2026-07-05", 12, 0, 100, planet="URANUS"),
                peak_day("2026-07-06", 12, 0, 100, planet="MOON"),
            ],
            period_rules=period_rules,
        )

        self.assertEqual(len(periods["work"]), 2)
        self.assertEqual(periods["work"][0]["start_date"], "2026-07-01")
        self.assertEqual(periods["work"][0]["end_date"], "2026-07-02")
        self.assertEqual(periods["work"][0]["peak_date"], "2026-07-02")
        self.assertEqual(periods["work"][0]["graph_score"], 80)
        self.assertEqual(periods["work"][0]["activation"], 9.0)
        self.assertEqual(periods["work"][0]["caution"], 4.0)
        self.assertEqual(periods["work"][0]["tone"], "mixed")
        self.assertEqual(periods["work"][0]["narrative_state"], "mixed")
        self.assertEqual(periods["work"][0]["title"], "役割と担当範囲に変化と調整が重なる時期")
        self.assertNotEqual(periods["work"][0]["description"], "Description")
        self.assertEqual(periods["work"][0]["factors"][0]["label"], "MARS MC 120°")

    def test_monthly_peak_narrative_omits_caution_without_caution_score(self):
        narrative = monthly_peak_service._compose_period_narrative(
            "work",
            {"narrative_key": "role"},
            {"narrative_key": "workflow"},
            "active",
            0,
            monthly_peak_service._default_narrative_template_index(
                monthly_peak_service._file_signature(
                    monthly_peak_service.DATABASE_DIR / monthly_peak_service.NARRATIVE_TEMPLATES_FILENAME
                )
            ),
        )

        self.assertEqual(narrative["caution_text"], "")
        self.assertIn("補助的には", narrative["description"])
        self.assertNotIn("大枠ルール", narrative["description"])

    def test_monthly_peak_narrative_quality_validator_detects_violations(self):
        violations = monthly_peak_service.validate_monthly_peak_narrative_quality({
            "work": [{
                "start_date": "2026-07-01",
                "end_date": "2026-07-02",
                "narrative_key": "invalid",
                "narrative_state": "mixed",
                "tone": "active",
                "caution": 0,
                "title": "7月の大枠ルール",
                "summary": "",
                "description": "どこかが動きやすい",
                "caution_text": "不要な注意文",
            }],
        })

        self.assertGreaterEqual(len(violations), 5)

    def test_generated_monthly_peak_narrative_passes_quality_gate(self):
        fixture = NARRATIVE_QUALITY_BIRTH_INPUT
        forecast = generate_yearly_forecast(BirthInput(
            full_name="Narrative Quality Test",
            birth_date=fixture["birth_date"],
            birth_time=fixture["birth_time"],
            birth_time_unknown=False,
            birthplace=fixture["birthplace"],
            latitude=fixture["latitude"],
            longitude=fixture["longitude"],
            timezone_offset=fixture["timezone_offset"],
        ), fixture["year"])

        self.assertEqual(
            monthly_peak_service.validate_monthly_peak_narrative_quality(
                forecast["monthly_peak_periods"]
            ),
            [],
        )

    def test_monthly_peak_narrative_state_uses_period_totals(self):
        period_rule = {"Activation_Threshold": "6"}
        mixed_factor = {"tone": "mixed", "factor_type": "transit_to_natal"}
        review_factor = {"tone": "review", "factor_type": "station"}

        self.assertEqual(
            monthly_peak_service._period_narrative_state(10, 0, [mixed_factor], period_rule),
            "active",
        )
        self.assertEqual(
            monthly_peak_service._period_narrative_state(10, 3, [mixed_factor], period_rule),
            "mixed",
        )
        self.assertEqual(
            monthly_peak_service._period_narrative_state(8, 2, [review_factor], period_rule),
            "review",
        )
        self.assertEqual(
            monthly_peak_service._period_narrative_state(3, 3, [mixed_factor], period_rule),
            "caution",
        )

    def test_monthly_peak_selects_category_specific_narrative_factor_first(self):
        peak_date = date(2026, 7, 10)
        factors = monthly_peak_service._select_period_factors(
            [{
                "date": peak_date,
                "factors": [
                    {
                        "rule_id": "GENERIC_STRONG",
                        "factor_type": "transit_to_transit",
                        "target_role": "core_theme",
                        "target_house": "ANY",
                        "natal_target": "JUPITER",
                        "narrative_key": "workflow",
                        "narrative_priority": 1,
                        "activation": 8,
                        "caution": 2,
                        "priority": 1,
                    },
                    {
                        "rule_id": "CAREER_FOCUS",
                        "factor_type": "transit_to_natal",
                        "target_role": "career_axis",
                        "target_house": "10",
                        "natal_target": "MC",
                        "narrative_key": "evaluation",
                        "narrative_priority": 3,
                        "activation": 3,
                        "caution": 1,
                        "priority": 9,
                    },
                ],
            }],
            peak_date,
        )

        self.assertEqual([factor["rule_id"] for factor in factors], ["CAREER_FOCUS", "GENERIC_STRONG"])

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
        self.assertEqual(forecast["aspect_genre_description_schema"], 2)
        self.assertEqual(forecast["aspect_genre_applicability_schema"], 3)
        self.assertEqual(forecast["aspect_genre_score_schema"], 4)
        self.assertEqual(forecast["monthly_overview_schema"], 1)
        first_day = forecast["yearly_data"][0]
        self.assertTrue({"total", "work", "love", "money", "general"}.issubset(first_day["scores"]))
        self.assertNotIn("monthly_peak", first_day)
        self.assertNotIn("jupiter_aspects", first_day)
        self.assertNotIn("saturn_aspects", first_day)
        self.assertNotIn("sun_aspects", first_day)
        self.assertNotIn("mars_aspects", first_day)
        self.assertEqual(
            set(forecast["monthly_peak_periods"]),
            {"general_health", "work", "love", "money"},
        )
        self.assertNotIn("events", first_day)
        self.assertNotIn("milestones", forecast)
        transit_chart = first_day["transit_chart"]
        self.assertEqual(transit_chart["date"], first_day["date"])
        self.assertEqual(transit_chart["time"], "12:00")
        self.assertEqual(
            {row["planet"] for row in transit_chart["transits"]},
            {
                "SUN", "MOON", "MERCURY", "VENUS", "MARS",
                "JUPITER", "SATURN", "URANUS", "NEPTUNE", "PLUTO",
            },
        )
        self.assertEqual(len(transit_chart["house_cusps"]), 12)
        self.assertTrue(first_day["all_aspects"])
        first_aspect = first_day["all_aspects"][0]
        self.assertEqual(set(first_aspect["genre_descriptions"]), {"love", "work", "money"})
        self.assertEqual(
            set(first_aspect["genre_score_components"]),
            {"general_health", "love", "work", "money"},
        )
        self.assertEqual(
            set(first_aspect["genre_importance_scores"]),
            {"general_health", "love", "work", "money"},
        )
        self.assertTrue(first_aspect["genre_applicability"]["genres"])
        self.assertIn("natal_house", first_aspect)
        self.assertTrue(forecast["annual_summaries"])
        self.assertIn("annual_summary_columns", forecast)
        self.assertTrue(forecast["annual_summary_columns"]["environment"])
        self.assertTrue(forecast["annual_summary_columns"]["mental"])
        transitions = forecast["annual_transit_house_transitions"]
        self.assertTrue(transitions)
        self.assertNotIn("MOON", {item["planet"] for item in transitions})
        self.assertEqual(
            [item["date"] for item in transitions],
            sorted(item["date"] for item in transitions),
        )
        self.assertTrue(any("SOLAR_HOUSE_INGRESS" in item["transition_types"] for item in transitions))
        self.assertTrue(any("NATAL_HOUSE_INGRESS" in item["transition_types"] for item in transitions))
        activations = forecast["annual_house_activation_events"]
        self.assertTrue(activations)
        self.assertTrue({"TRANSIT_TO_TRANSIT", "TRANSIT_TO_NATAL", "HOUSE_CLUSTER"}.issubset(
            {item["activation_type"] for item in activations}
        ))
        self.assertTrue(all(
            target in {"SUN", "MOON", "MERCURY", "VENUS", "MARS", "JUPITER", "SATURN", "URANUS", "NEPTUNE", "PLUTO", "ASC", "MC"}
            for item in activations
            for target in ([item["natal_target"]] if item["natal_target"] else [])
        ))
        self.assertTrue(forecast["monthly_sun_themes"])
        self.assertTrue(forecast["monthly_mars_themes"])
        self.assertEqual(forecast["monthly_sun_themes"][0]["planet"], "SUN")
        self.assertEqual(forecast["monthly_mars_themes"][0]["planet"], "MARS")
        self.assertTrue(forecast["monthly_sun_themes"][0]["monthly_summary"])
        self.assertTrue(forecast["monthly_mars_themes"][0]["monthly_interpretation"])
        self.assertEqual(
            set(forecast["monthly_overviews"]),
            {"2026-08", "2026-09"},
        )
        august_overviews = forecast["monthly_overviews"]["2026-08"]
        self.assertEqual(len(august_overviews), 31)
        self.assertEqual(august_overviews[0]["as_of"], "2026-08-01")
        self.assertEqual(august_overviews[-1]["as_of"], "2026-08-31")
        self.assertTrue(all(
            overview["editorial"]["Edition_ID"] == "2026_LEO"
            for overview in august_overviews
        ))
        self.assertTrue(all(len(overview["long_term_backgrounds"]) <= 2 for overview in august_overviews))
        august_twelfth = august_overviews[11]
        self.assertTrue(august_twelfth["event_paragraphs"])
        september_overviews = forecast["monthly_overviews"]["2026-09"]
        self.assertEqual(len(september_overviews), 30)
        self.assertEqual(september_overviews[0]["as_of"], "2026-09-01")
        self.assertEqual(september_overviews[-1]["as_of"], "2026-09-30")
        self.assertTrue(all(
            overview["editorial"]["Edition_ID"] == "2026_VIRGO"
            for overview in september_overviews
        ))
        self.assertTrue(all(
            len(overview["long_term_backgrounds"]) <= 2
            for overview in september_overviews
        ))
        self.assertTrue(august_twelfth["aspect_clusters"])
        self.assertTrue(all(
            "{" not in row["Paragraph_Template"]
            for overview in august_overviews
            for row in (*overview["event_paragraphs"], *overview["aspect_clusters"])
        ))
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

if __name__ == "__main__":
    unittest.main()
