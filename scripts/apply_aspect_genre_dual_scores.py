"""Add and populate independent positive/negative genre-impact columns.

The six new columns are the annual genre display source.  Legacy signed genre
scores remain available to existing monthly-peak code, except for the 388
pilot cells that are explicitly cleared during this migration.
"""

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
from scripts.apply_aspect_genre_scores_full import (
    CONJUNCTION_VALENCE,
    NATAL_RELEVANCE,
    TRANSIT_STRENGTHS,
)


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATABASE_DIR = PROJECT_ROOT / "database"
YEARLY_FILENAME = "M_Aspect_Interpretation_Yearly.csv"
GENRES = ("love", "work", "money")
ANNUAL_DISPLAY_THRESHOLD = 55
LEGACY_SCORE_COLUMNS = {
    "love": "Love_Score_Impact",
    "work": "Work_Score_Impact",
    "money": "Money_Score_Impact",
}
DUAL_SCORE_COLUMNS = {
    "love": {
        "positive": "Love_Positive_Impact",
        "negative": "Love_Negative_Impact",
    },
    "work": {
        "positive": "Work_Positive_Impact",
        "negative": "Work_Negative_Impact",
    },
    "money": {
        "positive": "Money_Positive_Impact",
        "negative": "Money_Negative_Impact",
    },
}

# Opportunity and friction are independent.  Soft aspects do not receive an
# invented caution score.  Hard aspects can retain a smaller constructive
# activation when the planet pair itself has positive domain valence.
SOFT_POSITIVE_FACTORS = {60: 0.80, 120: 0.95}
HARD_COMPONENT_FACTORS = {
    90: {"positive": 0.35, "negative": 0.90},
    150: {"positive": 0.20, "negative": 0.50},
    180: {"positive": 0.30, "negative": 0.85},
}


def _planet(value: Any) -> str:
    return str(value or "").strip().upper().removeprefix("TRANSIT_").removeprefix("NATAL_")


def _round_component(value: float) -> int:
    return abs(_round_five(max(0.0, value)))


def _base_magnitude(transit: str, natal: str, house: int, genre: str) -> float:
    return (
        TRANSIT_STRENGTHS[transit][genre]
        * NATAL_RELEVANCE[natal][genre]
        * HOUSE_MULTIPLIERS[house][genre]
    )


def dual_genre_score(
    transit: str,
    natal: str,
    angle: int,
    house: int,
    genre: str,
) -> dict[str, int]:
    """Return independent 0..90 positive and negative domain magnitudes."""
    transit = _planet(transit)
    natal = _planet(natal)
    base = _base_magnitude(transit, natal, house, genre)
    raw_valence = (
        2.5 * CONJUNCTION_VALENCE[transit][genre]
        + CONJUNCTION_VALENCE[natal][genre]
    )
    normalized_valence = max(-1.0, min(1.0, raw_valence / 3.5))

    pilot_base = PILOT_BASE_SCORES.get((transit, natal, angle))
    if pilot_base is not None:
        primary = _round_five(pilot_base[genre] * HOUSE_MULTIPLIERS[house][genre])
        positive = float(max(primary, 0))
        negative = float(max(-primary, 0))
        if primary < 0 and angle in HARD_COMPONENT_FACTORS:
            positive = base * HARD_COMPONENT_FACTORS[angle]["positive"] * max(
                normalized_valence, 0.0
            )
        return {
            "positive": _round_component(positive),
            "negative": _round_component(negative),
        }

    if angle == 0:
        factor = 0.75 + (0.10 * min(abs(raw_valence), 1.0))
        if raw_valence > 0:
            positive, negative = base * factor, 0.0
        elif raw_valence < 0:
            positive, negative = 0.0, base * factor
        else:
            positive = negative = base * 0.35
    elif angle in SOFT_POSITIVE_FACTORS:
        factor = SOFT_POSITIVE_FACTORS[angle]
        positive = base * factor * (0.90 + 0.10 * max(normalized_valence, 0.0))
        negative = 0.0
    elif angle in HARD_COMPONENT_FACTORS:
        profile = HARD_COMPONENT_FACTORS[angle]
        positive = base * profile["positive"] * max(normalized_valence, 0.0)
        negative = base * profile["negative"] * (
            0.85 + 0.15 * max(-normalized_valence, 0.0)
        )
    else:
        raise ValueError(f"Unsupported aspect angle: {angle}")

    return {
        "positive": _round_component(positive),
        "negative": _round_component(negative),
    }


def _aspect_paths() -> list[Path]:
    return sorted(
        path
        for path in DATABASE_DIR.glob("M_Aspect_Interpretation*.csv")
        if path.name != YEARLY_FILENAME
    )


def _insert_dual_columns(fieldnames: list[str]) -> list[str]:
    dual_columns = [
        column
        for genre in GENRES
        for column in DUAL_SCORE_COLUMNS[genre].values()
    ]
    output = [column for column in fieldnames if column not in dual_columns]
    insert_at = max(
        (output.index(column) for column in LEGACY_SCORE_COLUMNS.values() if column in output),
        default=len(output) - 1,
    ) + 1
    return output[:insert_at] + dual_columns + output[insert_at:]


def apply_dual_scores(*, write: bool) -> dict[str, Any]:
    representative_keys: set[tuple[str, str, int, int]] = set()
    legacy_pilot_cells_cleared = 0
    numeric_cells = Counter()
    positive_nonzero = Counter()
    negative_nonzero = Counter()
    mixed_nonzero = Counter()
    display_cells = Counter()
    files_changed = 0

    for path in _aspect_paths():
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            original_fieldnames = list(reader.fieldnames or [])
            rows = [dict(row) for row in reader]
        if not set(LEGACY_SCORE_COLUMNS.values()).issubset(original_fieldnames):
            raise ValueError(f"Legacy genre score columns are missing: {path}")
        has_dual_columns = all(
            column in original_fieldnames
            for genre in GENRES
            for column in DUAL_SCORE_COLUMNS[genre].values()
        )
        fieldnames = _insert_dual_columns(original_fieldnames)
        file_changed = fieldnames != original_fieldnames

        for source_row, row in enumerate(rows, start=2):
            legacy_values = tuple(
                str(row.get(column) or "").strip()
                for column in LEGACY_SCORE_COLUMNS.values()
            )
            dual_values = tuple(
                str(row.get(column) or "").strip()
                for genre in GENRES
                for column in DUAL_SCORE_COLUMNS[genre].values()
            )
            is_representative = legacy_values != ("-", "-", "-") or (
                has_dual_columns and dual_values != ("-",) * 6
            )
            if not is_representative:
                for genre in GENRES:
                    for column in DUAL_SCORE_COLUMNS[genre].values():
                        if str(row.get(column) or "").strip() != "-":
                            row[column] = "-"
                            file_changed = True
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

            if (transit, natal, angle) in PILOT_BASE_SCORES:
                for column in LEGACY_SCORE_COLUMNS.values():
                    current = str(row.get(column) or "").strip()
                    if current not in ("", "-"):
                        row[column] = ""
                        legacy_pilot_cells_cleared += 1
                        file_changed = True

            for genre in GENRES:
                columns = DUAL_SCORE_COLUMNS[genre]
                if genre not in applicable:
                    targets = {"positive": "", "negative": ""}
                else:
                    targets = {
                        component: str(value)
                        for component, value in dual_genre_score(
                            transit, natal, angle, house, genre
                        ).items()
                    }
                    numeric_cells[genre] += 2
                    positive = int(targets["positive"])
                    negative = int(targets["negative"])
                    positive_nonzero[genre] += int(positive > 0)
                    negative_nonzero[genre] += int(negative > 0)
                    mixed_nonzero[genre] += int(positive > 0 and negative > 0)
                    display_cells[genre] += int(
                        max(positive, negative) >= ANNUAL_DISPLAY_THRESHOLD
                    )
                for component, column in columns.items():
                    target = targets[component]
                    if str(row.get(column) or "").strip() != target:
                        row[column] = target
                        file_changed = True

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
        "legacy_pilot_cells_cleared": legacy_pilot_cells_cleared,
        "numeric_cells": dict(numeric_cells),
        "positive_nonzero": dict(positive_nonzero),
        "negative_nonzero": dict(negative_nonzero),
        "mixed_nonzero": dict(mixed_nonzero),
        "display_cells": dict(display_cells),
        "files_changed": files_changed,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    print(apply_dual_scores(write=args.write))


if __name__ == "__main__":
    main()
