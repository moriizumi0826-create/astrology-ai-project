"""Validate a month-specific personal long-term background CSV."""

from __future__ import annotations

import argparse
import csv
import re
import sys
from collections import Counter
from pathlib import Path

from generate_monthly_long_term_background import HEADERS, build_rows


FILENAME_PATTERN = re.compile(r"^M_Personal_Long_Term_Background_(\d{4})_(\d{2})\.csv$")
TONES = {"activation", "caution", "mixed"}
IMMUTABLE_COLUMNS = (
    "Record_ID", "Month_ID", "Record_Type", "Primary_Planet", "Secondary_Planet",
    "Primary_Sign", "Secondary_Sign", "Match_Type", "Target_Natal_House",
    "Valid_From", "Valid_To", "State_Changes", "Priority",
)


def normalized(value: str) -> str:
    return re.sub(r"\s+", "", value)


def load_rows(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open("r", encoding="utf-8-sig", newline="") as csv_file:
        reader = csv.DictReader(csv_file)
        return list(reader.fieldnames or []), list(reader)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("csv_path", type=Path)
    args = parser.parse_args()
    path = args.csv_path.resolve()
    match = FILENAME_PATTERN.match(path.name)
    if not match:
        print("Validation failed: filename must end with YYYY_MM.csv.")
        return 1

    year, month = map(int, match.groups())
    errors: list[str] = []
    raw = path.read_bytes()
    if not raw.startswith(b"\xef\xbb\xbf"):
        errors.append("CSV must use UTF-8 BOM for spreadsheet compatibility.")

    headers, rows = load_rows(path)
    if tuple(headers) != HEADERS:
        errors.append("CSV columns or column order do not match the monthly schema.")

    expected = build_rows(year, month)
    expected_by_id = {str(row["Record_ID"]): row for row in expected}
    actual_by_id = {row.get("Record_ID", ""): row for row in rows}
    if len(rows) != len(expected):
        errors.append(f"Expected {len(expected)} rows, found {len(rows)}.")
    if len(actual_by_id) != len(rows) or "" in actual_by_id:
        errors.append("Record_ID values must be unique and nonblank.")
    if set(actual_by_id) != set(expected_by_id):
        errors.append("Record_ID coverage differs from the generated monthly skeleton.")

    for record_id, expected_row in expected_by_id.items():
        row = actual_by_id.get(record_id)
        if row is None:
            continue
        for column in IMMUTABLE_COLUMNS:
            if row.get(column, "") != str(expected_row[column]):
                errors.append(f"{record_id}: immutable column changed: {column}.")
                break

    active_rows: list[dict[str, str]] = []
    for row in rows:
        record_id = row.get("Record_ID", "<blank>")
        if row.get("Tone") not in TONES:
            errors.append(f"{record_id}: invalid Tone.")
        if row.get("Active_Flag") not in {"0", "1"}:
            errors.append(f"{record_id}: Active_Flag must be 0 or 1.")
        if "�" in "".join(row.values()):
            errors.append(f"{record_id}: replacement character found.")
        if row.get("Active_Flag") == "1":
            title = row.get("Title", "")
            interpretation = row.get("Interpretation", "")
            if not 12 <= len(title) <= 28:
                errors.append(f"{record_id}: Title must be 12-28 characters.")
            if not 220 <= len(interpretation) <= 420:
                errors.append(f"{record_id}: Interpretation must be 220-420 characters.")
            active_rows.append(row)

    active_titles = [normalized(row["Title"]) for row in active_rows]
    active_interpretations = [normalized(row["Interpretation"]) for row in active_rows]
    if len(active_titles) != len(set(active_titles)):
        errors.append("Duplicate active Title values found.")
    if len(active_interpretations) != len(set(active_interpretations)):
        errors.append("Duplicate active Interpretation values found.")

    physical_lines = raw.decode("utf-8-sig").splitlines()
    if len(physical_lines) != len(rows) + 1:
        errors.append("CSV contains embedded line breaks; one record must use one physical line.")

    if errors:
        print("Validation failed:")
        print("\n".join(f"- {error}" for error in errors))
        return 1

    counts = Counter(row["Record_Type"] for row in rows)
    same_sign = sum(row["Match_Type"] == "same_sign" for row in rows)
    print(
        f"Validation passed: {path.name}, {len(rows)} rows, "
        f"background={counts['background']}, resonance={counts['resonance']}, same_sign={same_sign}."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
