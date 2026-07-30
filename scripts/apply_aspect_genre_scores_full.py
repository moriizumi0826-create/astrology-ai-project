"""Fill every applicable representative genre-score cell using the audited model."""

from __future__ import annotations

import argparse
import csv
from collections import Counter
from pathlib import Path
from typing import Any

from backend.app.services import yearly_forecast_service
from scripts.apply_aspect_genre_score_pilot import (
    HOUSE_MULTIPLIERS,
    PILOT_BASE_SCORES,
    _round_five,
)


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATABASE_DIR = PROJECT_ROOT / "database"
YEARLY_FILENAME = "M_Aspect_Interpretation_Yearly.csv"
GENRES = ("love", "work", "money")
SCORE_COLUMNS = {
    "love": "Love_Score_Impact",
    "work": "Work_Score_Impact",
    "money": "Money_Score_Impact",
}

# Strength of the moving planet's action in each life domain. These values do
# not contain aspect polarity, house relevance, duration, orb, or priority.
TRANSIT_STRENGTHS = {
    "SUN": {"love": 55, "work": 65, "money": 45},
    "MOON": {"love": 65, "work": 40, "money": 35},
    "MERCURY": {"love": 45, "work": 65, "money": 60},
    "VENUS": {"love": 70, "work": 45, "money": 65},
    "MARS": {"love": 65, "work": 70, "money": 55},
    "JUPITER": {"love": 65, "work": 80, "money": 80},
    "SATURN": {"love": 55, "work": 80, "money": 70},
    "URANUS": {"love": 60, "work": 70, "money": 60},
    "NEPTUNE": {"love": 70, "work": 55, "money": 45},
    "PLUTO": {"love": 70, "work": 75, "money": 65},
}

# How directly the static natal target expresses each life domain.
NATAL_RELEVANCE = {
    "SUN": {"love": 0.80, "work": 1.00, "money": 0.70},
    "MOON": {"love": 1.00, "work": 0.60, "money": 0.50},
    "MERCURY": {"love": 0.70, "work": 0.90, "money": 0.80},
    "VENUS": {"love": 1.00, "work": 0.60, "money": 1.00},
    "MARS": {"love": 0.90, "work": 1.00, "money": 0.70},
    "JUPITER": {"love": 0.80, "work": 0.90, "money": 1.00},
    "SATURN": {"love": 0.70, "work": 1.00, "money": 0.90},
    "URANUS": {"love": 0.80, "work": 0.80, "money": 0.70},
    "NEPTUNE": {"love": 1.00, "work": 0.60, "money": 0.50},
    "PLUTO": {"love": 0.90, "work": 0.90, "money": 0.80},
    "ASC": {"love": 0.90, "work": 0.70, "money": 0.60},
    "MC": {"love": 0.50, "work": 1.00, "money": 0.90},
}

# Conjunctions have no fixed polarity. The moving planet leads the direction,
# so its domain valence receives 2.5 times the static natal target's weight.
CONJUNCTION_VALENCE = {
    "SUN": {"love": 0.5, "work": 0.5, "money": 0.4},
    "MOON": {"love": 0.5, "work": 0.0, "money": 0.0},
    "MERCURY": {"love": 0.2, "work": 0.5, "money": 0.5},
    "VENUS": {"love": 0.8, "work": 0.4, "money": 0.8},
    "MARS": {"love": 0.3, "work": 0.5, "money": -0.4},
    "JUPITER": {"love": 0.8, "work": 0.8, "money": 0.8},
    "SATURN": {"love": -0.7, "work": 0.2, "money": 0.1},
    "URANUS": {"love": -0.5, "work": -0.4, "money": -0.5},
    "NEPTUNE": {"love": -0.2, "work": -0.7, "money": -0.7},
    "PLUTO": {"love": -0.5, "work": -0.2, "money": -0.3},
    "ASC": {"love": 0.3, "work": 0.2, "money": 0.0},
    "MC": {"love": 0.0, "work": 0.5, "money": 0.3},
}

ASPECT_FACTORS = {
    0: 1.00,
    60: 0.80,
    90: 0.95,
    120: 1.00,
    150: 0.70,
    180: 0.90,
}
POSITIVE_ANGLES = {60, 120}
NEGATIVE_ANGLES = {90, 150, 180}


def _planet(value: Any) -> str:
    text = str(value or "").strip().upper()
    return text.removeprefix("TRANSIT_").removeprefix("NATAL_")


def _score(transit: str, natal: str, angle: int, house: int, genre: str) -> int:
    if angle in POSITIVE_ANGLES:
        sign = 1
    elif angle in NEGATIVE_ANGLES:
        sign = -1
    elif angle == 0:
        valence = (2.5 * CONJUNCTION_VALENCE[transit][genre]) + CONJUNCTION_VALENCE[natal][genre]
        sign = 1 if valence > 0 else -1
    else:
        raise ValueError(f"Unsupported aspect angle: {angle}")
    magnitude = (
        TRANSIT_STRENGTHS[transit][genre]
        * NATAL_RELEVANCE[natal][genre]
        * ASPECT_FACTORS[angle]
        * HOUSE_MULTIPLIERS[house][genre]
    )
    return sign * abs(_round_five(magnitude))


def _aspect_paths() -> list[Path]:
    return sorted(
        path
        for path in DATABASE_DIR.glob("M_Aspect_Interpretation*.csv")
        if path.name != YEARLY_FILENAME
    )


def apply_full_scores(*, write: bool) -> dict[str, Any]:
    representative_keys: set[tuple[str, str, int, int]] = set()
    applicable_cells = Counter()
    preexisting_cells = Counter()
    new_cells = Counter()
    updated_cells = Counter()
    sign_counts = Counter()
    files_changed = 0

    for path in _aspect_paths():
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            fieldnames = list(reader.fieldnames or [])
            rows = [dict(row) for row in reader]
        if not set(SCORE_COLUMNS.values()).issubset(fieldnames):
            raise ValueError(f"Genre score columns are missing: {path}")

        file_changed = False
        for source_row, row in enumerate(rows, start=2):
            values = tuple(str(row.get(column) or "").strip() for column in SCORE_COLUMNS.values())
            if values == ("-", "-", "-"):
                continue
            transit = _planet(row.get("T_Planet"))
            natal = _planet(row.get("N_Planet"))
            angle = int(float(str(row.get("Aspect_Angle") or "")))
            house = int(float(str(row.get("N_House") or "")))
            key = (transit, natal, angle, house)
            if key in representative_keys:
                raise ValueError(f"Duplicate representative key: {key}")
            representative_keys.add(key)

            applicability = yearly_forecast_service._aspect_genre_applicability(
                str(row.get("Category") or ""), transit, natal, angle, house
            )
            applicable = set(applicability["genres"])
            is_pilot_key = (transit, natal, angle) in PILOT_BASE_SCORES
            for genre, column in SCORE_COLUMNS.items():
                current = str(row.get(column) or "").strip()
                if genre not in applicable:
                    if current:
                        raise ValueError(
                            f"Non-applicable score found at {path.name}:{source_row} {column}={current!r}"
                        )
                    continue
                applicable_cells[genre] += 1
                if current and is_pilot_key:
                    numeric = int(float(current))
                    preexisting_cells[genre] += 1
                    sign_counts[(genre, "positive" if numeric > 0 else "negative" if numeric < 0 else "zero")] += 1
                    continue
                numeric = _score(transit, natal, angle, house, genre)
                if current:
                    preexisting_cells[genre] += 1
                    if current != str(numeric):
                        row[column] = str(numeric)
                        updated_cells[genre] += 1
                        file_changed = True
                else:
                    row[column] = str(numeric)
                    new_cells[genre] += 1
                    file_changed = True
                sign_counts[(genre, "positive" if numeric > 0 else "negative" if numeric < 0 else "zero")] += 1

        if write and file_changed:
            with path.open("w", encoding="utf-8-sig", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\r\n")
                writer.writeheader()
                writer.writerows(rows)
            files_changed += 1

    if len(representative_keys) != 8640:
        raise ValueError(f"Expected 8640 representative keys, found {len(representative_keys)}")
    return {
        "representative_keys": len(representative_keys),
        "applicable_cells": dict(applicable_cells),
        "preexisting_cells": dict(preexisting_cells),
        "new_cells": dict(new_cells),
        "updated_cells": dict(updated_cells),
        "sign_counts": {
            genre: {
                sign: sign_counts[(genre, sign)]
                for sign in ("positive", "negative", "zero")
            }
            for genre in GENRES
        },
        "files_changed": files_changed,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="Write validated full scores")
    args = parser.parse_args()
    print(apply_full_scores(write=args.write))


if __name__ == "__main__":
    main()
