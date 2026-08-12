from __future__ import annotations

import csv
import re
import sys
from collections import Counter
from pathlib import Path


REQUIRED_COLUMNS = {
    "Template_ID",
    "Month_ID",
    "Section_Order",
    "Planet",
    "Event_Type",
    "Transit_Sign_From",
    "Transit_Sign_To",
    "Solar_House_From",
    "Solar_House_To",
    "Natal_House_From",
    "Natal_House_To",
    "Natal_House_At_Event",
    "Date_Source",
    "Date_Key",
    "Date_Precision",
    "Paragraph_Template",
    "Priority",
    "Active_Flag",
}

ALLOWED_TOKENS = {"event_date"}
FIXED_DATE_PATTERN = re.compile(r"(?:20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}月\d{1,2}日)")
TOKEN_PATTERN = re.compile(r"\{([a-z_]+)\}")


def normalize_text(value: str) -> str:
    return re.sub(r"[\s、。,.・:：;；!?！？]", "", value)


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: validate_monthly_overview_event_templates.py <csv>")
        return 2

    path = Path(sys.argv[1])
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
        columns = set(reader.fieldnames or [])

    errors: list[str] = []
    missing_columns = REQUIRED_COLUMNS - columns
    if missing_columns:
        errors.append(f"missing columns: {sorted(missing_columns)}")

    ids = [row["Template_ID"] for row in rows]
    duplicate_ids = [key for key, count in Counter(ids).items() if count > 1]
    if duplicate_ids:
        errors.append(f"duplicate Template_ID: {duplicate_ids[:5]}")

    written_texts: dict[str, list[int]] = {}
    for index, row in enumerate(rows, start=2):
        if row["Active_Flag"] not in {"0", "1"}:
            errors.append(f"line {index}: invalid Active_Flag")
        if row["Active_Flag"] == "1":
            paragraph = row["Paragraph_Template"].strip()
            if not paragraph:
                errors.append(f"line {index}: active row has no paragraph")
            elif "{event_date}" not in paragraph:
                errors.append(f"line {index}: active row has no event_date token")
            if FIXED_DATE_PATTERN.search(paragraph):
                errors.append(f"line {index}: paragraph contains a fixed date")
            unknown_tokens = set(TOKEN_PATTERN.findall(paragraph)) - ALLOWED_TOKENS
            if unknown_tokens:
                errors.append(
                    f"line {index}: undefined tokens: {sorted(unknown_tokens)}"
                )
            if paragraph:
                written_texts.setdefault(normalize_text(paragraph), []).append(index)

    duplicate_texts = [lines for lines in written_texts.values() if len(lines) > 1]
    if duplicate_texts:
        errors.append(f"duplicate paragraphs at lines: {duplicate_texts[:5]}")

    if path.name == "M_Monthly_Overview_Event_Paragraphs_2026_08.csv":
        if len(rows) != 840:
            errors.append(f"expected 840 rows, found {len(rows)}")
        expected_counts = {"sign_ingress": 720, "natal_house_ingress": 120}
        actual_counts = Counter(row["Event_Type"] for row in rows)
        for event_type, expected in expected_counts.items():
            if actual_counts[event_type] != expected:
                errors.append(
                    f"expected {expected} {event_type} rows, "
                    f"found {actual_counts[event_type]}"
                )

    counts = Counter(row["Event_Type"] for row in rows)
    active_count = sum(row["Active_Flag"] == "1" for row in rows)
    print(
        f"rows={len(rows)} sign_ingress={counts['sign_ingress']} "
        f"natal_house_ingress={counts['natal_house_ingress']} active={active_count}"
    )
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print("validation=PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
