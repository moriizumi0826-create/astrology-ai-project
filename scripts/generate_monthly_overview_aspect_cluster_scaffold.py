from __future__ import annotations

import argparse
import csv
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FIELDNAMES = [
    "Template_ID",
    "Cluster_ID",
    "Month_ID",
    "Event_Type",
    "Valid_From",
    "Peak_At",
    "Valid_To",
    "Carryover_Flag",
    "Participating_Planets",
    "Sign_Signature",
    "Aspect_Signature",
    "Max_Orb",
    "Min_Planet_Count",
    "Moon_Eligibility",
    "Anchor_Planet",
    "Anchor_Solar_House",
    "Anchor_Natal_House",
    "Personalization_Mode",
    "House_Token_Planets",
    "Date_Source",
    "Date_Key",
    "Date_Precision",
    "Selection_Group",
    "Supersedes_Cluster_IDs",
    "Section_Order",
    "Priority",
    "Title",
    "Paragraph_Template",
    "Tags",
    "Active_Flag",
]

CLUSTER_DEFINITIONS: dict[str, list[dict[str, object]]] = {
    "2026-09": [
        {
            "Cluster_ID": "2026_09_OPENING_FOUR_PLANET_NETWORK",
            "Event_Type": "aspect_cluster",
            "Valid_From": "2026-09-01T00:00:00+09:00",
            "Peak_At": "2026-09-01T07:17:00+09:00",
            "Valid_To": "2026-09-03T23:59:59+09:00",
            "Carryover_Flag": 0,
            "Participating_Planets": "MERCURY|MARS|JUPITER|SATURN",
            "Sign_Signature": "MERCURY:VIRGO|MARS:CANCER|JUPITER:LEO|SATURN:ARIES",
            "Aspect_Signature": (
                "JUPITER-SATURN:120|MARS-SATURN:90|MERCURY-MARS:60"
            ),
            "Max_Orb": 2,
            "Min_Planet_Count": 4,
            "Moon_Eligibility": "not_applicable",
            "Anchor_Planet": "SATURN",
            "Personalization_Mode": "anchor_house",
            "House_Token_Planets": "MERCURY|MARS|JUPITER|SATURN",
            "Date_Source": "swiss_ephemeris",
            "Date_Key": "COMPOSITE:OPENING_FOUR_PLANET_NETWORK:2026-09-01",
            "Date_Precision": "exact_day",
            "Selection_Group": "SEP_OPENING_STRUCTURE",
            "Supersedes_Cluster_IDs": "",
            "Section_Order": 20,
            "Priority": 100,
            "Tags": "aspect_cluster;mercury;mars;jupiter;saturn;opening_network",
        },
        {
            "Cluster_ID": "2026_09_MERCURY_OUTER_NETWORK",
            "Event_Type": "aspect_cluster",
            "Valid_From": "2026-09-12T00:00:00+09:00",
            "Peak_At": "2026-09-13T00:58:00+09:00",
            "Valid_To": "2026-09-15T23:59:59+09:00",
            "Carryover_Flag": 0,
            "Participating_Planets": "MERCURY|URANUS|NEPTUNE|PLUTO",
            "Sign_Signature": (
                "MERCURY:LIBRA|URANUS:GEMINI|NEPTUNE:ARIES|PLUTO:AQUARIUS"
            ),
            "Aspect_Signature": (
                "MERCURY-PLUTO:120|MERCURY-NEPTUNE:180|MERCURY-URANUS:120"
            ),
            "Max_Orb": 2,
            "Min_Planet_Count": 4,
            "Moon_Eligibility": "not_applicable",
            "Anchor_Planet": "MERCURY",
            "Personalization_Mode": "anchor_house",
            "House_Token_Planets": "MERCURY|URANUS|NEPTUNE|PLUTO",
            "Date_Source": "swiss_ephemeris",
            "Date_Key": (
                "MERCURY:PLUTO:120:2026-09-13|MERCURY:URANUS:120:2026-09-14"
            ),
            "Date_Precision": "around_day",
            "Selection_Group": "SEP_MERCURY_OUTER_NETWORK",
            "Supersedes_Cluster_IDs": "",
            "Section_Order": 40,
            "Priority": 100,
            "Tags": "aspect_cluster;mercury;uranus;neptune;pluto;retrograde_context",
        },
        {
            "Cluster_ID": "2026_09_VENUS_PLUTO_SQUARE",
            "Event_Type": "aspect_cluster",
            "Valid_From": "2026-09-14T00:00:00+09:00",
            "Peak_At": "2026-09-16T03:34:00+09:00",
            "Valid_To": "2026-09-18T23:59:59+09:00",
            "Carryover_Flag": 0,
            "Participating_Planets": "VENUS|PLUTO",
            "Sign_Signature": "VENUS:SCORPIO|PLUTO:AQUARIUS",
            "Aspect_Signature": "VENUS-PLUTO:90",
            "Max_Orb": 3,
            "Min_Planet_Count": 2,
            "Moon_Eligibility": "not_applicable",
            "Anchor_Planet": "VENUS",
            "Personalization_Mode": "anchor_house",
            "House_Token_Planets": "VENUS|PLUTO",
            "Date_Source": "swiss_ephemeris",
            "Date_Key": "VENUS:PLUTO:90:2026-09-16",
            "Date_Precision": "exact_day",
            "Selection_Group": "SEP_VALUES_POWER",
            "Supersedes_Cluster_IDs": "",
            "Section_Order": 50,
            "Priority": 90,
            "Tags": "square;venus;pluto;values;relationships",
        },
        {
            "Cluster_ID": "2026_09_FULL_MOON_OUTER_NETWORK",
            "Event_Type": "aspect_cluster",
            "Valid_From": "2026-09-26T00:00:00+09:00",
            "Peak_At": "2026-09-27T01:49:00+09:00",
            "Valid_To": "2026-09-29T23:59:59+09:00",
            "Carryover_Flag": 0,
            "Participating_Planets": "SUN|MOON|URANUS|NEPTUNE|PLUTO",
            "Sign_Signature": (
                "SUN:LIBRA|MOON:ARIES|URANUS:GEMINI|NEPTUNE:ARIES|PLUTO:AQUARIUS"
            ),
            "Aspect_Signature": (
                "SUN-NEPTUNE:180|SUN-PLUTO:120|MOON-NEPTUNE:0|"
                "MOON-PLUTO:60|SUN-MOON:180|MOON-URANUS:60|SUN-URANUS:120"
            ),
            "Max_Orb": 3,
            "Min_Planet_Count": 5,
            "Moon_Eligibility": "lunation_plus_planet",
            "Anchor_Planet": "SUN",
            "Personalization_Mode": "anchor_house",
            "House_Token_Planets": "SUN|MOON|URANUS|NEPTUNE|PLUTO",
            "Date_Source": "swiss_ephemeris",
            "Date_Key": "FULL_MOON:2026-09-27|SUN:URANUS:120:2026-09-29",
            "Date_Precision": "exact_day",
            "Selection_Group": "SEP_FULL_MOON_OUTER_NETWORK",
            "Supersedes_Cluster_IDs": "",
            "Section_Order": 80,
            "Priority": 100,
            "Tags": "full_moon;sun;moon;uranus;neptune;pluto;outer_network",
        },
        {
            "Cluster_ID": "2026_09_MONTH_END_TSQUARE_BUILDING",
            "Event_Type": "aspect_cluster",
            "Valid_From": "2026-09-30T00:00:00+09:00",
            "Peak_At": "2026-10-02T18:14:00+09:00",
            "Valid_To": "2026-09-30T23:59:59+09:00",
            "Carryover_Flag": 0,
            "Participating_Planets": "MERCURY|MARS|PLUTO",
            "Sign_Signature": "MERCURY:SCORPIO|MARS:LEO|PLUTO:AQUARIUS",
            "Aspect_Signature": (
                "MERCURY-MARS:90|MERCURY-PLUTO:90|MARS-PLUTO:180"
            ),
            "Max_Orb": 3,
            "Min_Planet_Count": 3,
            "Moon_Eligibility": "not_applicable",
            "Anchor_Planet": "MERCURY",
            "Personalization_Mode": "anchor_house",
            "House_Token_Planets": "MERCURY|MARS|PLUTO",
            "Date_Source": "swiss_ephemeris",
            "Date_Key": (
                "MERCURY:MARS:90:2026-10-02|MARS:PLUTO:180:2026-10-03"
            ),
            "Date_Precision": "month_end",
            "Selection_Group": "SEP_MONTH_END_PRESSURE",
            "Supersedes_Cluster_IDs": "",
            "Section_Order": 95,
            "Priority": 100,
            "Tags": "t_square;mercury;mars;pluto;builds_into_2026-10",
        },
    ]
}


def build_rows(year: int, month: int) -> list[dict[str, object]]:
    month_id = f"{year:04d}-{month:02d}"
    definitions = CLUSTER_DEFINITIONS.get(month_id)
    if definitions is None:
        raise ValueError(f"No approved aspect-cluster definitions for {month_id}")

    rows: list[dict[str, object]] = []
    for definition in definitions:
        cluster_id = str(definition["Cluster_ID"])
        for solar_house in range(1, 13):
            for natal_house in range(1, 13):
                rows.append(
                    {
                        "Template_ID": (
                            f"{cluster_id}_S{solar_house:02d}_N{natal_house:02d}"
                        ),
                        "Cluster_ID": cluster_id,
                        "Month_ID": month_id,
                        **{
                            key: value
                            for key, value in definition.items()
                            if key != "Cluster_ID"
                        },
                        "Anchor_Solar_House": solar_house,
                        "Anchor_Natal_House": natal_house,
                        "Title": "",
                        "Paragraph_Template": "",
                        "Active_Flag": 0,
                    }
                )
    return [{column: row[column] for column in FIELDNAMES} for row in rows]


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate an inactive monthly overview aspect-cluster scaffold."
    )
    parser.add_argument("year", type=int)
    parser.add_argument("month", type=int, choices=range(1, 13))
    parser.add_argument("--database-dir", type=Path, default=ROOT / "database")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    output = args.output or (
        args.database_dir
        / f"M_Monthly_Overview_Aspect_Clusters_{args.year:04d}_{args.month:02d}.csv"
    )
    output = output.resolve()
    if output.exists() and not args.force:
        print(f"Refusing to overwrite existing file without --force: {output}")
        return 1

    rows = build_rows(args.year, args.month)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDNAMES, lineterminator="\r\n")
        writer.writeheader()
        writer.writerows(rows)
    print(f"wrote {len(rows)} inactive rows to {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
