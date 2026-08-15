"""Validate a monthly overview aspect-cluster CSV."""

from __future__ import annotations

import argparse
import csv
import re
from collections import Counter
from pathlib import Path

from generate_monthly_overview_aspect_cluster_scaffold import (
    CLUSTER_DEFINITIONS,
    FIELDNAMES,
    build_rows,
)


FILE_PATTERN = re.compile(
    r"^M_Monthly_Overview_Aspect_Clusters_(?P<year>\d{4})_(?P<month>\d{2})\.csv$"
)
AUGUST_CLUSTER_IDS = {
    "2026_08_SUN_JUPITER_CARRYOVER",
    "2026_08_LEO_STELLIUM",
    "2026_08_FIVE_PLANET_NETWORK",
    "2026_08_MERCURY_JUPITER_CONJUNCTION",
    "2026_08_FULL_MOON_URANUS_TSQUARE",
    "2026_08_JUPITER_SATURN_TRINE",
}
EXPECTED_CLUSTER_IDS_BY_MONTH = {
    "2026-08": AUGUST_CLUSTER_IDS,
    **{
        month_id: {str(definition["Cluster_ID"]) for definition in definitions}
        for month_id, definitions in CLUSTER_DEFINITIONS.items()
    },
}
CONDITION_COLUMNS = tuple(
    column
    for column in FIELDNAMES
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
IMMUTABLE_COLUMNS = tuple(
    column for column in FIELDNAMES if column not in {"Title", "Paragraph_Template", "Active_Flag"}
)
ALLOWED_TOKENS = {"event_date", "secondary_event_date"}
TOKEN_PATTERN = re.compile(r"\{([^{}]+)\}")
DATE_KEY_PATTERN = re.compile(r"\d{4}-\d{2}-\d{2}")
FIXED_DATE_PATTERN = re.compile(
    r"(?:20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}月\d{1,2}日)"
)


def _normalized(value: str) -> str:
    return re.sub(r"[\s、。,.・:：;；!?！？]", "", value)


def validate(path: Path) -> tuple[list[str], int, int]:
    errors: list[str] = []
    match = FILE_PATTERN.match(path.name)
    if match is None:
        return [f"unexpected filename: {path.name}"], 0, 0
    year = int(match.group("year"))
    month = int(match.group("month"))
    month_id = f"{year:04d}-{month:02d}"
    expected_cluster_ids = EXPECTED_CLUSTER_IDS_BY_MONTH.get(month_id)
    if expected_cluster_ids is None:
        return [f"no approved Cluster_ID definition for {month_id}"], 0, 0

    raw = path.read_bytes()
    if not raw.startswith(b"\xef\xbb\xbf"):
        errors.append("CSV must use UTF-8 BOM for spreadsheet compatibility")
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
        headers = tuple(reader.fieldnames or ())

    if headers != tuple(FIELDNAMES):
        errors.append("CSV columns or column order do not match the aspect-cluster schema")
        return errors, 0, 0
    if len(raw.decode("utf-8-sig").splitlines()) != len(rows) + 1:
        errors.append("CSV contains embedded line breaks")

    expected_count = len(expected_cluster_ids) * 144
    if len(rows) != expected_count:
        errors.append(f"expected {expected_count} rows, found {len(rows)}")

    ids = [row["Template_ID"] for row in rows]
    duplicate_ids = [key for key, count in Counter(ids).items() if count > 1]
    if duplicate_ids or "" in ids:
        errors.append(
            f"Template_ID values must be unique and nonblank: {duplicate_ids[:5]}"
        )

    clusters = Counter(row["Cluster_ID"] for row in rows)
    if set(clusters) != expected_cluster_ids:
        errors.append(f"unexpected Cluster_ID coverage: {sorted(clusters)}")

    expected_rows: list[dict[str, object]] | None = None
    if month_id in CLUSTER_DEFINITIONS:
        expected_rows = build_rows(year, month)
        expected_by_id = {
            str(row["Template_ID"]): row
            for row in expected_rows
        }
        actual_by_id = {row["Template_ID"]: row for row in rows}
        if set(actual_by_id) != set(expected_by_id):
            missing = sorted(set(expected_by_id) - set(actual_by_id))
            unexpected = sorted(set(actual_by_id) - set(expected_by_id))
            errors.append(
                f"Template_ID coverage mismatch; missing={missing[:5]} unexpected={unexpected[:5]}"
            )
        for template_id in sorted(set(actual_by_id) & set(expected_by_id)):
            actual = actual_by_id[template_id]
            expected = expected_by_id[template_id]
            changed = [
                column
                for column in IMMUTABLE_COLUMNS
                if actual[column] != str(expected[column])
            ]
            if changed:
                errors.append(
                    f"{template_id}: protected columns changed: {changed[:5]}"
                )

    expected_pairs = {
        (str(solar), str(natal))
        for solar in range(1, 13)
        for natal in range(1, 13)
    }
    for cluster_id in sorted(expected_cluster_ids):
        cluster_rows = [row for row in rows if row["Cluster_ID"] == cluster_id]
        if len(cluster_rows) != 144:
            errors.append(f"{cluster_id}: expected 144 rows, found {len(cluster_rows)}")
            continue
        pairs = [
            (row["Anchor_Solar_House"], row["Anchor_Natal_House"])
            for row in cluster_rows
        ]
        if set(pairs) != expected_pairs or len(pairs) != len(set(pairs)):
            errors.append(f"{cluster_id}: anchor-house coverage is incomplete or duplicated")
        signatures = {
            tuple(row[column] for column in CONDITION_COLUMNS)
            for row in cluster_rows
        }
        if len(signatures) != 1:
            errors.append(f"{cluster_id}: condition columns vary within the cluster")

        definition = cluster_rows[0]
        key_dates = DATE_KEY_PATTERN.findall(definition["Date_Key"])
        peak_date = definition["Peak_At"][:10]
        if key_dates and key_dates[0] != peak_date:
            errors.append(f"{cluster_id}: Date_Key and Peak_At disagree")

        for solar_house in range(1, 13):
            active_rows = [
                row
                for row in cluster_rows
                if row["Anchor_Solar_House"] == str(solar_house)
                and row["Active_Flag"] == "1"
            ]
            if len(active_rows) == 12 and len({row["Title"] for row in active_rows}) < 2:
                errors.append(
                    f"{cluster_id} Solar_House={solar_house}: titles do not vary by natal house"
                )

    paragraphs: dict[str, list[int]] = {}
    active_count = 0
    for line_number, row in enumerate(rows, start=2):
        if row["Month_ID"] != month_id:
            errors.append(f"line {line_number}: unexpected Month_ID")
        if "\ufffd" in "".join(row.values()):
            errors.append(f"line {line_number}: replacement character found")
        if row["Active_Flag"] not in {"0", "1"}:
            errors.append(f"line {line_number}: invalid Active_Flag")
            continue
        if row["Active_Flag"] != "1":
            continue

        active_count += 1
        title = row["Title"].strip()
        paragraph = row["Paragraph_Template"].strip()
        if not 14 <= len(title) <= 30:
            errors.append(f"line {line_number}: Title length is outside 14-30")
        if not 120 <= len(paragraph) <= 260:
            errors.append(
                f"line {line_number}: Paragraph_Template length is outside 120-260"
            )
        tokens = set(TOKEN_PATTERN.findall(paragraph))
        if "event_date" not in tokens:
            errors.append(f"line {line_number}: event_date token is missing")
        unknown = tokens - ALLOWED_TOKENS
        if unknown:
            errors.append(f"line {line_number}: undefined tokens: {sorted(unknown)}")
        if "secondary_event_date" in tokens and len(DATE_KEY_PATTERN.findall(row["Date_Key"])) < 2:
            errors.append(f"line {line_number}: secondary_event_date has no Date_Key date")
        if FIXED_DATE_PATTERN.search(paragraph):
            errors.append(f"line {line_number}: fixed date found")
        paragraphs.setdefault(_normalized(paragraph), []).append(line_number)

    duplicates = [lines for lines in paragraphs.values() if len(lines) > 1]
    if duplicates:
        errors.append(f"duplicate Paragraph_Template values at lines: {duplicates[:5]}")
    return errors, len(rows), active_count


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("csv_path", type=Path)
    args = parser.parse_args()
    errors, row_count, active_count = validate(args.csv_path.resolve())
    if errors:
        print("Validation failed:")
        print("\n".join(f"- {error}" for error in errors))
        return 1
    cluster_count = row_count // 144 if row_count else 0
    print(
        f"Validation passed: {row_count} rows, {cluster_count} clusters, "
        f"Active={active_count}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
