"""Append daily house-stay scoring rules to M_Monthly_Peak_Rules.csv."""

from __future__ import annotations

import csv
from pathlib import Path


DATABASE_PATH = Path(__file__).resolve().parents[1] / "database" / "M_Monthly_Peak_Rules.csv"
HOUSE_FACTOR_TYPES = {"natal_house", "solar_house"}
STAY_WEIGHT_SCALE = 0.025


def _is_active(row: dict[str, str]) -> bool:
    return str(row.get("Active_Flag") or "").strip().upper() not in {"", "0", "FALSE", "NO"}


def _key(row: dict[str, str]) -> tuple[str, str, str, str]:
    return (
        row["Factor_Type"],
        row["Transit_Planet"],
        row["Target_House"],
        row["Category"],
    )


def _scaled(value: str) -> str:
    scaled = float(value or 0) * STAY_WEIGHT_SCALE
    return f"{scaled:.3f}".rstrip("0").rstrip(".") or "0"


def build_stay_rows(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    selected: dict[tuple[str, str, str, str], dict[str, str]] = {}
    for row in rows:
        if (
            not _is_active(row)
            or row.get("Factor_Type") not in HOUSE_FACTOR_TYPES
            or str(row.get("Transit_State") or "").strip().lower() != "ingress"
        ):
            continue
        key = _key(row)
        current = selected.get(key)
        is_authored = not str(row.get("Rule_ID") or "").startswith("AUTO_")
        current_is_auto = current is not None and str(current.get("Rule_ID") or "").startswith("AUTO_")
        if current is None or (is_authored and current_is_auto):
            selected[key] = row

    stay_rows: list[dict[str, str]] = []
    for row in selected.values():
        stay = dict(row)
        stay["Rule_ID"] = f"STAY_{row['Rule_ID']}"
        stay["Transit_State"] = "stay"
        stay["Duration_Days_Before"] = "0"
        stay["Duration_Days_After"] = "0"
        stay["Activation_Weight"] = _scaled(row.get("Activation_Weight", "0"))
        stay["Caution_Weight"] = _scaled(row.get("Caution_Weight", "0"))
        stay["Intensity_Hint"] = "low"
        stay["Priority"] = str(int(float(row.get("Priority") or 0)) + 10000)
        tags = [tag for tag in str(row.get("Tags") or "").split(";") if tag]
        stay["Tags"] = ";".join(dict.fromkeys([*tags, "house_stay"]))
        stay["Narrative_Priority"] = "0"
        stay_rows.append(stay)
    return stay_rows


def main() -> None:
    with DATABASE_PATH.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        fieldnames = list(reader.fieldnames or [])
        rows = list(reader)

    original_rows = [row for row in rows if not str(row.get("Rule_ID") or "").startswith("STAY_")]
    stay_rows = build_stay_rows(original_rows)
    if len(stay_rows) != 372:
        raise RuntimeError(f"Expected 372 stay rules, generated {len(stay_rows)}")

    with DATABASE_PATH.open("w", encoding="utf-8-sig", newline="") as target:
        writer = csv.DictWriter(target, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows([*original_rows, *stay_rows])

    print(f"Wrote {len(original_rows)} existing rows and {len(stay_rows)} house-stay rows")


if __name__ == "__main__":
    main()
