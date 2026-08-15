from __future__ import annotations

import argparse
import csv
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FIELDNAMES = (
    "Edition_ID",
    "Solar_House",
    "Natal_House",
    "Title",
    "Summary",
    "Interpretation",
    "Action",
)
EDITION_PATTERN = re.compile(r"^\d{4}_[A-Z]+$")


def build_rows(edition_id: str) -> list[dict[str, object]]:
    if EDITION_PATTERN.fullmatch(edition_id) is None:
        raise ValueError(f"Invalid Edition_ID: {edition_id}")
    return [
        {
            "Edition_ID": edition_id,
            "Solar_House": solar_house,
            "Natal_House": natal_house,
            "Title": "",
            "Summary": "",
            "Interpretation": "",
            "Action": "",
        }
        for solar_house in range(1, 13)
        for natal_house in range(1, 13)
    ]


def append_scaffold(path: Path, edition_id: str, dry_run: bool = False) -> int:
    raw = path.read_bytes()
    if not raw.endswith((b"\n", b"\r")):
        raise ValueError(f"CSV must end with a line break before appending: {path}")
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
        headers = tuple(reader.fieldnames or ())
    if headers != FIELDNAMES:
        raise ValueError("Editorial CSV columns or column order do not match the schema")
    if any(row["Edition_ID"] == edition_id for row in rows):
        raise ValueError(f"Edition_ID already exists: {edition_id}")

    new_rows = build_rows(edition_id)
    if dry_run:
        return len(new_rows)
    with path.open("a", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDNAMES, lineterminator="\r\n")
        writer.writerows(new_rows)
    return len(new_rows)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Append an inactive 12 x 12 Edition scaffold to the editorial CSV."
    )
    parser.add_argument("edition_id")
    parser.add_argument(
        "--path",
        type=Path,
        default=ROOT / "database" / "M_Monthly_Overview_Editorial.csv",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    try:
        count = append_scaffold(args.path.resolve(), args.edition_id, args.dry_run)
    except ValueError as exc:
        print(exc)
        return 1
    verb = "would append" if args.dry_run else "appended"
    print(f"{verb} {count} rows for {args.edition_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
