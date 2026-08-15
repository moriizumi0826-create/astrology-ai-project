from __future__ import annotations

import argparse
import csv
import re
from collections import Counter
from pathlib import Path

from generate_monthly_overview_event_template_scaffold import FIELDNAMES, build_rows


FILE_PATTERN = re.compile(
    r"^M_Monthly_Overview_Event_Paragraphs_(?P<year>\d{4})_(?P<month>\d{2})\.csv$"
)
ALLOWED_TOKENS = {"event_date"}
FIXED_DATE_PATTERN = re.compile(
    r"(?:20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}月\d{1,2}日)"
)
TOKEN_PATTERN = re.compile(r"\{([^{}]+)\}")
IMMUTABLE_COLUMNS = tuple(
    column for column in FIELDNAMES if column not in {"Paragraph_Template", "Active_Flag"}
)


def normalize_text(value: str) -> str:
    return re.sub(r"[\s、。,.・:：;；!?！？]", "", value)


def validate(path: Path, database_dir: Path | None = None) -> tuple[list[str], Counter[str], int]:
    errors: list[str] = []
    match = FILE_PATTERN.match(path.name)
    if match is None:
        return [f"unexpected filename: {path.name}"], Counter(), 0
    year = int(match.group("year"))
    month = int(match.group("month"))

    raw = path.read_bytes()
    if not raw.startswith(b"\xef\xbb\xbf"):
        errors.append("CSV must use UTF-8 BOM for spreadsheet compatibility")
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
        headers = tuple(reader.fieldnames or ())

    if headers != tuple(FIELDNAMES):
        errors.append("CSV columns or column order do not match the event schema")
        return errors, Counter(), 0
    if len(raw.decode("utf-8-sig").splitlines()) != len(rows) + 1:
        errors.append("CSV contains embedded line breaks")

    expected_rows = build_rows(year, month, database_dir or path.parent)
    expected_by_id = {
        str(row["Template_ID"]): row
        for row in expected_rows
    }
    actual_by_id = {row["Template_ID"]: row for row in rows}
    ids = [row["Template_ID"] for row in rows]
    duplicate_ids = [key for key, count in Counter(ids).items() if count > 1]
    if duplicate_ids or "" in ids:
        errors.append(
            f"Template_ID values must be unique and nonblank: {duplicate_ids[:5]}"
        )
    if set(actual_by_id) != set(expected_by_id):
        missing = sorted(set(expected_by_id) - set(actual_by_id))
        unexpected = sorted(set(actual_by_id) - set(expected_by_id))
        errors.append(
            f"Template_ID coverage mismatch; missing={missing[:5]} unexpected={unexpected[:5]}"
        )
    if len(rows) != len(expected_rows):
        errors.append(f"expected {len(expected_rows)} rows, found {len(rows)}")

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

    written_texts: dict[str, list[int]] = {}
    active_count = 0
    for line_number, row in enumerate(rows, start=2):
        joined = "".join(row.values())
        if "\ufffd" in joined:
            errors.append(f"line {line_number}: replacement character found")
        if row["Active_Flag"] not in {"0", "1"}:
            errors.append(f"line {line_number}: invalid Active_Flag")
            continue
        if row["Active_Flag"] != "1":
            continue

        active_count += 1
        paragraph = row["Paragraph_Template"].strip()
        if not paragraph:
            errors.append(f"line {line_number}: active row has no paragraph")
            continue
        if not 90 <= len(paragraph) <= 240:
            errors.append(
                f"line {line_number}: Paragraph_Template length is outside 90-240"
            )
        tokens = set(TOKEN_PATTERN.findall(paragraph))
        if "event_date" not in tokens:
            errors.append(f"line {line_number}: event_date token is missing")
        unknown_tokens = tokens - ALLOWED_TOKENS
        if unknown_tokens:
            errors.append(
                f"line {line_number}: undefined tokens: {sorted(unknown_tokens)}"
            )
        if FIXED_DATE_PATTERN.search(paragraph):
            errors.append(f"line {line_number}: paragraph contains a fixed date")
        written_texts.setdefault(normalize_text(paragraph), []).append(line_number)

    duplicate_texts = [lines for lines in written_texts.values() if len(lines) > 1]
    if duplicate_texts:
        errors.append(f"duplicate paragraphs at lines: {duplicate_texts[:5]}")

    counts = Counter(row["Event_Type"] for row in rows)
    expected_counts = Counter(row["Event_Type"] for row in expected_rows)
    if counts != expected_counts:
        errors.append(
            f"event type coverage mismatch: expected={dict(expected_counts)} actual={dict(counts)}"
        )
    return errors, counts, active_count


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("csv_path", type=Path)
    parser.add_argument("--database-dir", type=Path)
    args = parser.parse_args()
    path = args.csv_path.resolve()
    errors, counts, active_count = validate(path, args.database_dir)
    print(
        f"rows={sum(counts.values())} sign_ingress={counts['sign_ingress']} "
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
