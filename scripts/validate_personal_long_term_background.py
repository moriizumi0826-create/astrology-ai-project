"""Validate the personal long-term background CSV contract."""

from __future__ import annotations

import csv
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path


CSV_PATH = Path(__file__).resolve().parents[1] / "database" / "M_Personal_Long_Term_Background.csv"
SIGNS = {
    "ARIES", "TAURUS", "GEMINI", "CANCER", "LEO", "VIRGO", "LIBRA", "SCORPIO",
    "SAGITTARIUS", "CAPRICORN", "AQUARIUS", "PISCES",
}
BACKGROUND_PLANETS = {"JUPITER", "SATURN", "URANUS", "NEPTUNE", "PLUTO"}
RESONANCE_PAIRS = {
    ("URANUS", "SUN"), ("URANUS", "MARS"), ("URANUS", "JUPITER"),
    ("NEPTUNE", "SUN"), ("NEPTUNE", "MARS"), ("NEPTUNE", "JUPITER"),
    ("PLUTO", "SUN"), ("PLUTO", "MARS"), ("PLUTO", "JUPITER"),
    ("URANUS", "NEPTUNE"), ("URANUS", "PLUTO"), ("NEPTUNE", "PLUTO"),
}
REQUIRED_COLUMNS = {
    "Record_ID", "Record_Type", "Primary_Planet", "Secondary_Planet", "Match_Type",
    "Target_Sign", "Target_Natal_House", "Tone", "Title", "Interpretation", "Priority",
    "Active_Flag",
}
TONES = {"activation", "caution", "mixed"}


def normalized(value: str) -> str:
    return re.sub(r"\s+", "", value)


def is_house(value: str) -> bool:
    return value.isdigit() and 1 <= int(value) <= 12


def main() -> int:
    errors: list[str] = []
    raw = CSV_PATH.read_bytes()
    if not raw.startswith(b"\xef\xbb\xbf"):
        errors.append("CSV must use UTF-8 BOM for spreadsheet compatibility.")

    with CSV_PATH.open("r", encoding="utf-8-sig", newline="") as csv_file:
        reader = csv.DictReader(csv_file)
        rows = list(reader)
        headers = set(reader.fieldnames or [])

    missing_columns = REQUIRED_COLUMNS - headers
    if missing_columns:
        errors.append(f"Missing columns: {sorted(missing_columns)}")
    if len(rows) != 1008:
        errors.append(f"Expected 1008 rows, found {len(rows)}.")

    id_counts = Counter(row.get("Record_ID", "") for row in rows)
    duplicate_ids = sorted(record_id for record_id, count in id_counts.items() if not record_id or count != 1)
    if duplicate_ids:
        errors.append(f"Duplicate or blank Record_ID values: {duplicate_ids[:5]}")

    type_counts = Counter(row.get("Record_Type") for row in rows)
    if type_counts != Counter({"background": 720, "resonance": 288}):
        errors.append(f"Unexpected Record_Type counts: {dict(type_counts)}")

    active_groups: dict[tuple[str, ...], list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        record_type = row.get("Record_Type", "")
        primary = row.get("Primary_Planet", "")
        secondary = row.get("Secondary_Planet", "")
        match_type = row.get("Match_Type", "")
        sign = row.get("Target_Sign", "")
        natal_house = row.get("Target_Natal_House", "")

        if row.get("Active_Flag") not in {"0", "1"}:
            errors.append(f"{row['Record_ID']}: Active_Flag must be 0 or 1.")
        if row.get("Tone") not in TONES:
            errors.append(f"{row['Record_ID']}: invalid Tone.")

        if record_type == "background":
            if primary not in BACKGROUND_PLANETS or secondary != "ANY" or match_type != "planet_natal_house":
                errors.append(f"{row['Record_ID']}: invalid background condition.")
            if sign not in SIGNS or not is_house(natal_house):
                errors.append(f"{row['Record_ID']}: invalid background target.")
            group_key = (record_type, primary, sign)
        elif record_type == "resonance":
            if (primary, secondary) not in RESONANCE_PAIRS:
                errors.append(f"{row['Record_ID']}: invalid resonance pair.")
            if match_type == "same_sign":
                if sign not in SIGNS or natal_house != "ANY":
                    errors.append(f"{row['Record_ID']}: invalid same_sign target.")
            elif match_type == "same_natal_house":
                if sign != "ANY" or not is_house(natal_house):
                    errors.append(f"{row['Record_ID']}: invalid same_natal_house target.")
            else:
                errors.append(f"{row['Record_ID']}: invalid resonance Match_Type.")
            group_key = (record_type, primary, secondary, match_type)
        else:
            errors.append(f"{row['Record_ID']}: invalid Record_Type.")
            group_key = ("invalid", row["Record_ID"])

        if row.get("Active_Flag") == "1":
            title = row.get("Title", "")
            interpretation = row.get("Interpretation", "")
            if not title or not interpretation:
                errors.append(f"{row['Record_ID']}: active row has blank text.")
            if not 10 <= len(title) <= 24:
                errors.append(f"{row['Record_ID']}: Title must be 10-24 characters.")
            if not 100 <= len(interpretation) <= 180:
                errors.append(f"{row['Record_ID']}: Interpretation must be 100-180 characters.")
            active_groups[group_key].append(row)

    for group_key, group_rows in active_groups.items():
        titles = [normalized(row["Title"]) for row in group_rows]
        interpretations = [normalized(row["Interpretation"]) for row in group_rows]
        if len(titles) != len(set(titles)):
            errors.append(f"{group_key}: duplicate active Title values.")
        if len(interpretations) != len(set(interpretations)):
            errors.append(f"{group_key}: duplicate active Interpretation values.")

    if errors:
        print("Validation failed:")
        print("\n".join(f"- {error}" for error in errors))
        return 1

    print("Validation passed: 1008 rows, 720 background, 288 resonance.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
