import unittest

from backend.app.services import monthly_overview_service


class MonthlyOverviewLoaderTestCase(unittest.TestCase):
    def test_august_monthly_overview_csvs_load_with_expected_rows(self):
        editorial = monthly_overview_service.load_monthly_overview_editorial()
        event_paragraphs = monthly_overview_service.load_monthly_overview_event_paragraphs(
            "2026_08"
        )
        aspect_clusters = monthly_overview_service.load_monthly_overview_aspect_clusters(
            "2026_08"
        )
        long_term_background = monthly_overview_service.load_personal_long_term_background(
            "2026_08"
        )

        self.assertEqual(len(editorial), 288)
        self.assertEqual(
            sum(row["Edition_ID"] == "2026_LEO" for row in editorial),
            144,
        )
        self.assertEqual(len(event_paragraphs), 840)
        self.assertEqual(len(aspect_clusters), 864)
        self.assertEqual(len(long_term_background), 277)
        self.assertTrue(all(row["Active_Flag"] == "1" for row in event_paragraphs))
        self.assertTrue(all(row["Active_Flag"] == "1" for row in aspect_clusters))
        self.assertTrue(all(row["Active_Flag"] == "1" for row in long_term_background))

    def test_month_specific_loaders_reject_invalid_month_ids(self):
        for loader in (
            monthly_overview_service.load_monthly_overview_event_paragraphs,
            monthly_overview_service.load_monthly_overview_aspect_clusters,
            monthly_overview_service.load_personal_long_term_background,
        ):
            with self.subTest(loader=loader.__name__):
                with self.assertRaisesRegex(ValueError, "Invalid monthly overview Month_ID"):
                    loader("../2026_08")

    def test_august_indexes_cover_expected_keys_and_buckets(self):
        indexes = monthly_overview_service.build_monthly_overview_indexes("2026_08")

        editorial = indexes["editorial_by_house"]
        events = indexes["event_by_condition"]
        aspects = indexes["aspect_by_anchor"]
        long_term = indexes["long_term_by_house"]

        self.assertEqual(indexes["month_id"], "2026-08")
        self.assertEqual(len(editorial), 288)
        self.assertEqual(len(events), 840)
        self.assertEqual(len(aspects), 144)
        self.assertEqual(len(long_term), 25)
        self.assertEqual(
            editorial[("2026_LEO", "1", "1")]["Edition_ID"],
            "2026_LEO",
        )

        event_key = (
            "2026-08",
            "VENUS",
            "sign_ingress",
            "VIRGO",
            "LIBRA",
            "12",
            "1",
            "ANY",
            "ANY",
            "1",
        )
        self.assertEqual(
            events[event_key]["Template_ID"],
            "2026_08_SIGN_VENUS_VIRGO_LIBRA_S12_S01_N01",
        )
        self.assertEqual(len(aspects[("2026-08", "1", "1")]), 6)
        self.assertEqual(len(long_term[("2026-08", "background", "1")]), 5)

    def test_august_editorial_selector_resolves_edition_and_exact_houses(self):
        selected = monthly_overview_service.select_monthly_overview_editorial(
            "2026_08",
            solar_house=6,
            natal_house=11,
        )

        self.assertEqual(selected["Edition_ID"], "2026_LEO")
        self.assertEqual(selected["Solar_House"], "6")
        self.assertEqual(selected["Natal_House"], "11")
        self.assertTrue(selected["Title"].strip())
        self.assertTrue(selected["Summary"].strip())
        self.assertTrue(selected["Interpretation"].strip())
        self.assertTrue(selected["Action"].strip())

    def test_editorial_selector_rejects_houses_outside_one_to_twelve(self):
        for field_name, solar_house, natal_house in (
            ("Solar_House", 0, 1),
            ("Solar_House", 13, 1),
            ("Natal_House", 1, "unknown"),
        ):
            with self.subTest(field_name=field_name):
                with self.assertRaisesRegex(ValueError, field_name):
                    monthly_overview_service.select_monthly_overview_editorial(
                        "2026_08",
                        solar_house=solar_house,
                        natal_house=natal_house,
                    )

    def test_sign_ingress_paragraph_resolves_calendar_date_and_token(self):
        selected = monthly_overview_service.select_monthly_overview_event_paragraph(
            "2026_08",
            {
                "Planet": "VENUS",
                "Event_Type": "sign_ingress",
                "Transit_Sign_From": "VIRGO",
                "Transit_Sign_To": "LIBRA",
                "Solar_House_From": 12,
                "Solar_House_To": 1,
                "Natal_House_At_Event": 1,
            },
        )

        self.assertIsNotNone(selected)
        self.assertEqual(
            selected["Template_ID"],
            "2026_08_SIGN_VENUS_VIRGO_LIBRA_S12_S01_N01",
        )
        self.assertEqual(selected["Event_Date"], "2026-08-07")
        self.assertIn("8月7日", selected["Paragraph_Template"])
        self.assertNotIn("{event_date}", selected["Paragraph_Template"])

    def test_natal_house_ingress_uses_calculated_date_key(self):
        event = {
            "Planet": "SUN",
            "Event_Type": "natal_house_ingress",
            "Transit_Sign_From": "LEO",
            "Transit_Sign_To": "LEO",
            "Natal_House_From": 12,
            "Natal_House_To": 1,
        }
        selected = monthly_overview_service.select_monthly_overview_event_paragraph(
            "2026_08",
            event,
            calculated_event_dates={
                "SUN:natal_house_ingress:1": "2026-08-14",
            },
        )

        self.assertIsNotNone(selected)
        self.assertEqual(selected["Template_ID"], "2026_08_NATAL_SUN_LEO_N12_N01")
        self.assertEqual(selected["Event_Date"], "2026-08-14")
        self.assertIn("8月14日頃", selected["Paragraph_Template"])
        self.assertNotIn("頃頃", selected["Paragraph_Template"])
        self.assertNotIn("{event_date}", selected["Paragraph_Template"])

    def test_event_selector_hides_unmatched_or_undated_conditions(self):
        unmatched = monthly_overview_service.select_monthly_overview_event_paragraph(
            "2026_08",
            {
                "Planet": "VENUS",
                "Event_Type": "sign_ingress",
                "Transit_Sign_From": "VIRGO",
                "Transit_Sign_To": "LIBRA",
                "Solar_House_From": 12,
                "Solar_House_To": 1,
                "Natal_House_At_Event": 12,
                "Natal_House_From": 1,
            },
        )
        undated = monthly_overview_service.select_monthly_overview_event_paragraph(
            "2026_08",
            {
                "Planet": "SUN",
                "Event_Type": "natal_house_ingress",
                "Transit_Sign_From": "LEO",
                "Transit_Sign_To": "LEO",
                "Natal_House_From": 12,
                "Natal_House_To": 1,
            },
        )

        self.assertIsNone(unmatched)
        self.assertIsNone(undated)

    def test_aspect_selector_uses_anchor_houses_and_selection_group_priority(self):
        selected = monthly_overview_service.select_monthly_overview_aspect_clusters(
            "2026_08",
            as_of="2026-08-14",
            matched_cluster_ids={
                "2026_08_LEO_STELLIUM",
                "2026_08_MERCURY_JUPITER_CONJUNCTION",
            },
            anchor_houses={
                "JUPITER": (1, 2),
                "MERCURY": (6, 7),
            },
        )

        self.assertEqual(
            [row["Cluster_ID"] for row in selected],
            ["2026_08_LEO_STELLIUM"],
        )
        self.assertEqual(selected[0]["Anchor_Solar_House"], "1")
        self.assertEqual(selected[0]["Anchor_Natal_House"], "2")
        self.assertIn("8月12日前後", selected[0]["Paragraph_Template"])
        self.assertIn("8月15日頃", selected[0]["Paragraph_Template"])
        self.assertNotIn("{", selected[0]["Paragraph_Template"])

    def test_aspect_selector_switches_leo_growth_cluster_after_overlap(self):
        selected = monthly_overview_service.select_monthly_overview_aspect_clusters(
            "2026_08",
            as_of="2026-08-16",
            matched_cluster_ids={
                "2026_08_LEO_STELLIUM",
                "2026_08_MERCURY_JUPITER_CONJUNCTION",
            },
            anchor_houses={
                "JUPITER": (1, 2),
                "MERCURY": (6, 7),
            },
        )

        self.assertEqual(
            [row["Cluster_ID"] for row in selected],
            ["2026_08_MERCURY_JUPITER_CONJUNCTION"],
        )
        self.assertEqual(selected[0]["Anchor_Solar_House"], "6")
        self.assertEqual(selected[0]["Anchor_Natal_House"], "7")

    def test_aspect_selector_keeps_distinct_groups_without_duplicate_tokens(self):
        selected = monthly_overview_service.select_monthly_overview_aspect_clusters(
            "2026_08",
            as_of="2026-08-12",
            matched_cluster_ids={
                "2026_08_LEO_STELLIUM",
                "2026_08_FIVE_PLANET_NETWORK",
            },
            anchor_houses={
                "JUPITER": {"solar_house": 3, "natal_house": 4},
                "MERCURY": {"solar_house": 5, "natal_house": 6},
            },
        )

        self.assertEqual(
            [row["Cluster_ID"] for row in selected],
            ["2026_08_LEO_STELLIUM", "2026_08_FIVE_PLANET_NETWORK"],
        )
        self.assertEqual(
            [(row["Anchor_Solar_House"], row["Anchor_Natal_House"]) for row in selected],
            [("3", "4"), ("5", "6")],
        )
        self.assertTrue(all("{" not in row["Paragraph_Template"] for row in selected))

    def test_aspect_selector_formats_carryover_exact_and_month_end_dates(self):
        cases = (
            (
                "2026-08-01",
                "2026_08_SUN_JUPITER_CARRYOVER",
                {"JUPITER": (1, 1)},
                "7月末から",
            ),
            (
                "2026-08-28",
                "2026_08_FULL_MOON_URANUS_TSQUARE",
                {"SUN": (1, 1)},
                "8月28日の満月",
            ),
            (
                "2026-08-31",
                "2026_08_JUPITER_SATURN_TRINE",
                {"JUPITER": (1, 1)},
                "8月末から9月初めにかけては",
            ),
        )
        for as_of, cluster_id, anchor_houses, expected_text in cases:
            with self.subTest(cluster_id=cluster_id):
                selected = monthly_overview_service.select_monthly_overview_aspect_clusters(
                    "2026_08",
                    as_of=as_of,
                    matched_cluster_ids={cluster_id},
                    anchor_houses=anchor_houses,
                )
                self.assertEqual(len(selected), 1)
                self.assertIn(expected_text, selected[0]["Paragraph_Template"])
                self.assertNotIn("{", selected[0]["Paragraph_Template"])

    def test_long_term_background_selector_matches_placement_and_priority(self):
        selected = monthly_overview_service.select_personal_long_term_backgrounds(
            "2026_08",
            as_of="2026-08-15",
            transit_placements={
                "JUPITER": ("LEO", 1),
                "SATURN": ("ARIES", 2),
                "URANUS": ("GEMINI", 3),
                "NEPTUNE": ("ARIES", 4),
                "PLUTO": ("AQUARIUS", 5),
            },
        )

        self.assertEqual(
            [row["Primary_Planet"] for row in selected],
            ["SATURN", "URANUS"],
        )
        self.assertEqual(
            [row["Target_Natal_House"] for row in selected],
            ["2", "3"],
        )
        self.assertEqual([row["Priority"] for row in selected], ["120", "105"])
        self.assertTrue(all(row["Record_Type"] == "background" for row in selected))

    def test_long_term_background_selector_keeps_structural_and_jupiter_slots(self):
        selected = monthly_overview_service.select_personal_long_term_backgrounds(
            "2026_08",
            as_of="2026-08-31",
            transit_placements={
                "JUPITER": {"sign": "LEO", "natal_house": 7},
                "SATURN": {"sign": "ARIES", "natal_house": 8},
                "NEPTUNE": {"sign": "ARIES", "natal_house": 9},
                "PLUTO": {"sign": "AQUARIUS", "natal_house": 10},
            },
        )

        self.assertEqual(
            [row["Primary_Planet"] for row in selected],
            ["SATURN", "JUPITER"],
        )
        self.assertEqual(
            [row["Target_Natal_House"] for row in selected],
            ["8", "7"],
        )

    def test_long_term_background_selector_hides_wrong_sign_or_period(self):
        wrong_sign = monthly_overview_service.select_personal_long_term_backgrounds(
            "2026_08",
            as_of="2026-08-15",
            transit_placements={"JUPITER": ("CANCER", 1)},
        )
        outside_period = monthly_overview_service.select_personal_long_term_backgrounds(
            "2026_08",
            as_of="2026-09-01",
            transit_placements={"JUPITER": ("LEO", 1)},
        )

        self.assertEqual(wrong_sign, [])
        self.assertEqual(outside_period, [])

    def test_resonance_selector_prefers_same_sign_for_same_pair(self):
        selected = monthly_overview_service.select_personal_long_term_resonance(
            "2026_08",
            as_of="2026-08-05",
            transit_placements={
                "URANUS": ("GEMINI", 3),
                "MARS": ("GEMINI", 3),
                "SUN": ("LEO", 3),
            },
        )

        self.assertIsNotNone(selected)
        self.assertEqual(selected["Primary_Planet"], "URANUS")
        self.assertEqual(selected["Secondary_Planet"], "MARS")
        self.assertEqual(selected["Match_Type"], "same_sign")
        self.assertEqual(selected["Target_Natal_House"], "ANY")
        self.assertEqual(selected["Priority"], "165")

    def test_resonance_selector_switches_at_mars_sign_ingress(self):
        selected = monthly_overview_service.select_personal_long_term_resonance(
            "2026_08",
            as_of="2026-08-11",
            transit_placements={
                "URANUS": ("GEMINI", 6),
                "MARS": ("CANCER", 6),
            },
        )

        self.assertIsNotNone(selected)
        self.assertEqual(selected["Primary_Sign"], "GEMINI")
        self.assertEqual(selected["Secondary_Sign"], "CANCER")
        self.assertEqual(selected["Match_Type"], "same_natal_house")
        self.assertEqual(selected["Target_Natal_House"], "6")
        self.assertEqual(selected["Valid_From"], "2026-08-11")

    def test_resonance_selector_uses_priority_and_hides_nonmatches(self):
        selected = monthly_overview_service.select_personal_long_term_resonance(
            "2026_08",
            as_of="2026-08-20",
            transit_placements={
                "URANUS": ("GEMINI", 4),
                "SUN": ("LEO", 4),
                "JUPITER": ("LEO", 4),
            },
        )
        unmatched = monthly_overview_service.select_personal_long_term_resonance(
            "2026_08",
            as_of="2026-08-20",
            transit_placements={
                "URANUS": ("GEMINI", 4),
                "SUN": ("LEO", 5),
            },
        )

        self.assertIsNotNone(selected)
        self.assertEqual(selected["Secondary_Planet"], "SUN")
        self.assertEqual(selected["Priority"], "160")
        self.assertIsNone(unmatched)

    def test_composer_builds_separate_display_sections_without_duplicates(self):
        venus_ingress = {
            "Planet": "VENUS",
            "Event_Type": "sign_ingress",
            "Transit_Sign_From": "VIRGO",
            "Transit_Sign_To": "LIBRA",
            "Solar_House_From": 12,
            "Solar_House_To": 1,
            "Natal_House_At_Event": 1,
        }
        result = monthly_overview_service.compose_monthly_overview(
            "2026_08",
            as_of="2026-08-14",
            solar_house=6,
            natal_house=11,
            events=(
                venus_ingress,
                venus_ingress,
                {
                    "Planet": "SUN",
                    "Event_Type": "natal_house_ingress",
                    "Transit_Sign_From": "LEO",
                    "Transit_Sign_To": "LEO",
                    "Natal_House_From": 12,
                    "Natal_House_To": 1,
                },
            ),
            calculated_event_dates={
                "SUN:natal_house_ingress:1": "2026-08-14",
            },
            matched_cluster_ids={
                "2026_08_LEO_STELLIUM",
                "2026_08_MERCURY_JUPITER_CONJUNCTION",
            },
            anchor_houses={
                "JUPITER": (1, 2),
                "MERCURY": (6, 7),
            },
            transit_placements={
                "SUN": ("LEO", 3),
                "MARS": ("CANCER", 3),
                "JUPITER": ("LEO", 1),
                "SATURN": ("ARIES", 2),
                "URANUS": ("GEMINI", 3),
                "NEPTUNE": ("ARIES", 4),
                "PLUTO": ("AQUARIUS", 5),
            },
        )

        self.assertEqual(result["month_id"], "2026-08")
        self.assertEqual(result["as_of"], "2026-08-14")
        self.assertEqual(result["editorial"]["Edition_ID"], "2026_LEO")
        self.assertEqual(result["editorial"]["Solar_House"], "6")
        self.assertEqual(result["editorial"]["Natal_House"], "11")
        self.assertEqual(len(result["event_paragraphs"]), 2)
        self.assertEqual(
            [row["Section_Order"] for row in result["event_paragraphs"]],
            ["30", "45"],
        )
        self.assertEqual(
            [row["Cluster_ID"] for row in result["aspect_clusters"]],
            ["2026_08_LEO_STELLIUM"],
        )
        self.assertEqual(
            [row["Primary_Planet"] for row in result["long_term_backgrounds"]],
            ["SATURN", "URANUS"],
        )
        self.assertEqual(result["resonance"]["Primary_Planet"], "URANUS")
        self.assertEqual(result["resonance"]["Secondary_Planet"], "SUN")

        narratives = [result["editorial"]["Interpretation"]]
        narratives.extend(row["Paragraph_Template"] for row in result["event_paragraphs"])
        narratives.extend(row["Paragraph_Template"] for row in result["aspect_clusters"])
        narratives.extend(row["Interpretation"] for row in result["long_term_backgrounds"])
        narratives.append(result["resonance"]["Interpretation"])
        self.assertEqual(len(narratives), len(set(narratives)))
        self.assertTrue(all("{" not in narrative for narrative in narratives))

    def test_composer_rejects_as_of_outside_requested_month(self):
        with self.assertRaisesRegex(ValueError, "outside 2026-08"):
            monthly_overview_service.compose_monthly_overview(
                "2026_08",
                as_of="2026-09-01",
                solar_house=1,
                natal_house=1,
            )


if __name__ == "__main__":
    unittest.main()
