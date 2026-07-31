"""Apply the first audited genre-score pilot to representative aspect rows."""

from __future__ import annotations

import argparse
import csv
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATABASE_DIR = PROJECT_ROOT / "database"
YEARLY_FILENAME = "M_Aspect_Interpretation_Yearly.csv"
SCORE_COLUMNS = {
    "love": "Love_Score_Impact",
    "work": "Work_Score_Impact",
    "money": "Money_Score_Impact",
}
KEY_COLUMNS = ("T_Planet", "N_Planet", "Aspect_Angle", "N_House")
DUAL_SCORE_COLUMNS = {
    "love": ("Love_Positive_Impact", "Love_Negative_Impact"),
    "work": ("Work_Positive_Impact", "Work_Negative_Impact"),
    "money": ("Money_Positive_Impact", "Money_Negative_Impact"),
}

HOUSE_MULTIPLIERS = {
    1: {"love": 0.90, "work": 0.90, "money": 0.80},
    2: {"love": 0.75, "work": 1.00, "money": 1.20},
    3: {"love": 0.75, "work": 0.95, "money": 0.80},
    4: {"love": 1.00, "work": 0.80, "money": 0.80},
    5: {"love": 1.15, "work": 0.75, "money": 0.90},
    6: {"love": 0.70, "work": 1.15, "money": 0.95},
    7: {"love": 1.20, "work": 0.80, "money": 0.85},
    8: {"love": 1.15, "work": 0.80, "money": 1.15},
    9: {"love": 0.75, "work": 0.85, "money": 0.75},
    10: {"love": 0.70, "work": 1.20, "money": 1.05},
    11: {"love": 0.90, "work": 0.95, "money": 0.95},
    12: {"love": 0.85, "work": 0.75, "money": 0.75},
}

PILOT_BASE_SCORES: dict[tuple[str, str, int], dict[str, int]] = {
    ("SUN", "NEPTUNE", 150): {"love": -45, "work": -50, "money": -45},
    ("VENUS", "MARS", 0): {"love": 70, "work": 40, "money": 45},
    ("VENUS", "MARS", 60): {"love": 60, "work": 45, "money": 45},
    ("VENUS", "MARS", 90): {"love": -65, "work": -45, "money": -50},
    ("VENUS", "MARS", 120): {"love": 65, "work": 50, "money": 50},
    ("VENUS", "MARS", 150): {"love": -50, "work": -35, "money": -40},
    ("VENUS", "MARS", 180): {"love": -60, "work": -40, "money": -45},
    ("MARS", "VENUS", 0): {"love": 65, "work": 45, "money": -35},
    ("MARS", "VENUS", 60): {"love": 55, "work": 45, "money": 40},
    ("MARS", "VENUS", 90): {"love": -65, "work": -50, "money": -55},
    ("MARS", "VENUS", 120): {"love": 60, "work": 50, "money": 45},
    ("MARS", "VENUS", 150): {"love": -55, "work": -40, "money": -50},
    ("MARS", "VENUS", 180): {"love": -60, "work": -45, "money": -55},
}


def _planet(value: Any) -> str:
    text = str(value or "").strip().upper()
    return text.removeprefix("TRANSIT_").removeprefix("NATAL_")


def _round_five(value: float) -> int:
    rounded = int(
        (Decimal(str(value)) / Decimal("5")).quantize(
            Decimal("1"), rounding=ROUND_HALF_UP
        ) * Decimal("5")
    )
    return max(-90, min(90, rounded))


def _aspect_paths() -> list[Path]:
    return sorted(
        path
        for path in DATABASE_DIR.glob("M_Aspect_Interpretation*.csv")
        if path.name != YEARLY_FILENAME
    )


def _authored_genres(row: dict[str, Any]) -> set[str]:
    if all(column in row for columns in DUAL_SCORE_COLUMNS.values() for column in columns):
        return {
            genre
            for genre, columns in DUAL_SCORE_COLUMNS.items()
            if any(str(row.get(column) or "").strip() not in ("", "-") for column in columns)
        }
    return {
        genre
        for genre, column in SCORE_COLUMNS.items()
        if str(row.get(column) or "").strip() not in ("", "-")
    }


def apply_pilot(*, write: bool) -> dict[str, Any]:
    expected_keys = {
        (transit, natal, angle, house)
        for transit, natal, angle in PILOT_BASE_SCORES
        for house in range(1, 13)
    }
    found_keys: set[tuple[str, str, int, int]] = set()
    scored_cells = 0
    changed_cells = 0
    files_changed = 0
    samples: list[dict[str, Any]] = []

    for path in _aspect_paths():
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            fieldnames = list(reader.fieldnames or [])
            rows = [dict(row) for row in reader]
        if not set(SCORE_COLUMNS.values()).issubset(fieldnames):
            raise ValueError(f"Genre score columns are missing: {path}")

        file_changed = False
        for source_row, row in enumerate(rows, start=2):
            transit = _planet(row.get("T_Planet"))
            natal = _planet(row.get("N_Planet"))
            try:
                angle = int(float(str(row.get("Aspect_Angle") or "")))
                house = int(float(str(row.get("N_House") or "")))
            except ValueError:
                continue
            base_scores = PILOT_BASE_SCORES.get((transit, natal, angle))
            if base_scores is None:
                continue

            key = (transit, natal, angle, house)
            score_values = tuple(str(row.get(column) or "").strip() for column in SCORE_COLUMNS.values())
            is_representative = score_values != ("-", "-", "-")
            if not is_representative:
                continue
            if key in found_keys:
                raise ValueError(f"Duplicate pilot representative key: {key}")
            found_keys.add(key)

            applicable = _authored_genres(row)
            output_scores: dict[str, int | None] = {}
            for genre, column in SCORE_COLUMNS.items():
                target = (
                    _round_five(base_scores[genre] * HOUSE_MULTIPLIERS[house][genre])
                    if genre in applicable
                    else None
                )
                output_scores[genre] = target
                target_text = "" if target is None else str(target)
                current_text = str(row.get(column) or "").strip()
                if current_text not in ("", target_text):
                    raise ValueError(
                        f"Refusing to overwrite {path.name}:{source_row} {column}="
                        f"{current_text!r} with {target_text!r}"
                    )
                if target is not None:
                    scored_cells += 1
                if current_text != target_text:
                    changed_cells += 1
                    row[column] = target_text
                    file_changed = True
            if len(samples) < 12:
                samples.append({"key": key, "scores": output_scores, "genres": sorted(applicable)})

        if write and file_changed:
            with path.open("w", encoding="utf-8-sig", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\r\n")
                writer.writeheader()
                writer.writerows(rows)
            files_changed += 1

    missing_keys = sorted(expected_keys - found_keys)
    unexpected_keys = sorted(found_keys - expected_keys)
    if missing_keys or unexpected_keys:
        raise ValueError(
            f"Pilot key mismatch: missing={missing_keys[:5]}, unexpected={unexpected_keys[:5]}"
        )
    return {
        "pilot_keys": len(found_keys),
        "scored_cells": scored_cells,
        "changed_cells": changed_cells,
        "files_changed": files_changed,
        "samples": samples,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="Write validated pilot scores")
    args = parser.parse_args()
    print(apply_pilot(write=args.write))


if __name__ == "__main__":
    main()
