from __future__ import annotations

import argparse
import csv
import re
from collections import Counter
from pathlib import Path


TEXT_COLUMNS = ("Title", "Summary", "Interpretation", "Action")
LENGTH_LIMITS = {
    "Title": (14, 28),
    "Summary": (90, 150),
    "Interpretation": (500, 900),
    "Action": (120, 220),
}
REQUIRED_COLUMNS = ("Edition_ID", "Solar_House", "Natal_House", *TEXT_COLUMNS)
FIXED_DATE_RE = re.compile(r"\d{1,2}月\d{1,2}日")
TOKEN_RE = re.compile(r"\{[^{}]+\}")
MOJIBAKE_MARKERS = ("�", "縺", "繧", "譁", "蟄")


def normalized(value: str) -> str:
    return re.sub(r"[\s、。・「」『』（）()]+", "", value)


def validate(path: Path, edition_id: str) -> list[str]:
    errors: list[str] = []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        missing_columns = [column for column in REQUIRED_COLUMNS if column not in (reader.fieldnames or [])]
        if missing_columns:
            return [f"missing columns: {', '.join(missing_columns)}"]
        rows = list(reader)

    edition_rows = [row for row in rows if row["Edition_ID"] == edition_id]
    if len(edition_rows) != 144:
        errors.append(f"{edition_id}: expected 144 rows, found {len(edition_rows)}")

    keys: list[tuple[int, int]] = []
    for index, row in enumerate(edition_rows, start=1):
        try:
            solar = int(row["Solar_House"])
            natal = int(row["Natal_House"])
        except ValueError:
            errors.append(f"row {index}: invalid house value")
            continue
        keys.append((solar, natal))
        if not 1 <= solar <= 12 or not 1 <= natal <= 12:
            errors.append(f"row {index}: house outside 1-12")

        values = [row[column].strip() for column in TEXT_COLUMNS]
        if any(values) and not all(values):
            errors.append(f"S{solar}N{natal}: partially completed text columns")
            continue
        if not all(values):
            continue

        for column in TEXT_COLUMNS:
            value = row[column].strip()
            minimum, maximum = LENGTH_LIMITS[column]
            if not minimum <= len(value) <= maximum:
                errors.append(
                    f"S{solar}N{natal}: {column} length {len(value)} outside {minimum}-{maximum}"
                )

        combined = "".join(values)
        if FIXED_DATE_RE.search(combined):
            errors.append(f"S{solar}N{natal}: fixed date found")
        if TOKEN_RE.search(combined):
            errors.append(f"S{solar}N{natal}: unresolved token found")
        if any(marker in combined for marker in MOJIBAKE_MARKERS):
            errors.append(f"S{solar}N{natal}: mojibake marker found")

    expected_keys = {(solar, natal) for solar in range(1, 13) for natal in range(1, 13)}
    actual_keys = set(keys)
    duplicate_keys = [key for key, count in Counter(keys).items() if count > 1]
    if duplicate_keys:
        errors.append(f"duplicate house combinations: {duplicate_keys}")
    missing_keys = sorted(expected_keys - actual_keys)
    if missing_keys:
        errors.append(f"missing house combinations: {missing_keys}")

    completed = [row for row in edition_rows if all(row[column].strip() for column in TEXT_COLUMNS)]
    for column in TEXT_COLUMNS:
        values = [normalized(row[column]) for row in completed]
        duplicates = [value for value, count in Counter(values).items() if value and count > 1]
        if duplicates:
            errors.append(f"duplicate completed {column}: {len(duplicates)}")

    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("path", type=Path)
    parser.add_argument("edition_id")
    args = parser.parse_args()

    errors = validate(args.path, args.edition_id)
    if errors:
        print("Validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    with args.path.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = [row for row in csv.DictReader(handle) if row["Edition_ID"] == args.edition_id]
    completed = sum(all(row[column].strip() for column in TEXT_COLUMNS) for row in rows)
    print(f"Validation passed: {args.edition_id}, rows={len(rows)}, completed={completed}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
