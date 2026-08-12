"""Validate the authored monthly overview aspect-cluster CSV."""

from __future__ import annotations

import argparse
import csv
import re
from collections import Counter
from pathlib import Path


EXPECTED_CLUSTERS = {
    "2026_08_SUN_JUPITER_CARRYOVER",
    "2026_08_LEO_STELLIUM",
    "2026_08_FIVE_PLANET_NETWORK",
    "2026_08_MERCURY_JUPITER_CONJUNCTION",
    "2026_08_FULL_MOON_URANUS_TSQUARE",
    "2026_08_JUPITER_SATURN_TRINE",
}
REQUIRED_COLUMNS = (
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
)
CONDITION_COLUMNS = tuple(
    column
    for column in REQUIRED_COLUMNS
    if column
    not in {
        "Template_ID",
        "Anchor_Solar_House",
        "Anchor_Natal_House",
        "Title",
        "Paragraph_Template",
        "Tags",
        "Active_Flag",
    }
)
ALLOWED_TOKENS = {"event_date", "secondary_event_date"}
TOKEN_PATTERN = re.compile(r"\{([^{}]+)\}")
FIXED_DATE_PATTERN = re.compile(
    r"(?:20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}\u6708\d{1,2}\u65e5)"
)


def _normalized(value: str) -> str:
    return re.sub(r"\s+", "", value)


def validate(path: Path) -> list[str]:
    errors: list[str] = []
    raw = path.read_bytes()
    if not raw.startswith(b"\xef\xbb\xbf"):
        errors.append("CSV must use UTF-8 BOM for spreadsheet compatibility")

    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
        headers = tuple(reader.fieldnames or ())

    if headers != REQUIRED_COLUMNS:
        errors.append("CSV columns or column order do not match the aspect-cluster schema")
        return errors
    if len(rows) != 864:
        errors.append(f"expected 864 rows, found {len(rows)}")
    if len(raw.decode("utf-8-sig").splitlines()) != len(rows) + 1:
        errors.append("CSV contains embedded line breaks")

    ids = [row["Template_ID"] for row in rows]
    if len(ids) != len(set(ids)) or "" in ids:
        errors.append("Template_ID values must be unique and nonblank")

    clusters = Counter(row["Cluster_ID"] for row in rows)
    if set(clusters) != EXPECTED_CLUSTERS:
        errors.append(f"unexpected Cluster_ID coverage: {sorted(clusters)}")
    for cluster_id in sorted(EXPECTED_CLUSTERS):
        cluster_rows = [row for row in rows if row["Cluster_ID"] == cluster_id]
        if len(cluster_rows) != 144:
            errors.append(f"{cluster_id}: expected 144 rows, found {len(cluster_rows)}")
            continue

        pairs = [
            (row["Anchor_Solar_House"], row["Anchor_Natal_House"])
            for row in cluster_rows
        ]
        expected_pairs = {
            (str(solar), str(natal))
            for solar in range(1, 13)
            for natal in range(1, 13)
        }
        if set(pairs) != expected_pairs or len(pairs) != len(set(pairs)):
            errors.append(f"{cluster_id}: anchor-house coverage is incomplete or duplicated")

        signatures = {
            tuple(row[column] for column in CONDITION_COLUMNS)
            for row in cluster_rows
        }
        if len(signatures) != 1:
            errors.append(f"{cluster_id}: condition columns vary within the cluster")

        for solar_house in range(1, 13):
            titles = {
                row["Title"]
                for row in cluster_rows
                if row["Anchor_Solar_House"] == str(solar_house)
            }
            if len(titles) < 2:
                errors.append(
                    f"{cluster_id} Solar_House={solar_house}: titles do not vary by natal house"
                )

    paragraphs: list[str] = []
    for line_number, row in enumerate(rows, start=2):
        if row["Month_ID"] != "2026-08":
            errors.append(f"line {line_number}: unexpected Month_ID")
        if row["Active_Flag"] != "1":
            errors.append(f"line {line_number}: row is not active")
        if not 14 <= len(row["Title"]) <= 30:
            errors.append(f"line {line_number}: Title length is outside 14-30")
        if not 120 <= len(row["Paragraph_Template"]) <= 260:
            errors.append(f"line {line_number}: Paragraph_Template length is outside 120-260")

        tokens = set(TOKEN_PATTERN.findall(row["Paragraph_Template"]))
        if "event_date" not in tokens:
            errors.append(f"line {line_number}: event_date token is missing")
        unknown = tokens - ALLOWED_TOKENS
        if unknown:
            errors.append(f"line {line_number}: undefined tokens: {sorted(unknown)}")
        if FIXED_DATE_PATTERN.search(row["Paragraph_Template"]):
            errors.append(f"line {line_number}: fixed date found")
        if "\ufffd" in "".join(row.values()):
            errors.append(f"line {line_number}: replacement character found")
        paragraphs.append(_normalized(row["Paragraph_Template"]))

    if len(paragraphs) != len(set(paragraphs)):
        errors.append("duplicate Paragraph_Template values found")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("csv_path", type=Path)
    args = parser.parse_args()
    errors = validate(args.csv_path.resolve())
    if errors:
        print("Validation failed:")
        print("\n".join(f"- {error}" for error in errors))
        return 1
    print("Validation passed: 864 rows, 6 clusters, Active=864.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
