"""Generate a month-specific long-term background CSV skeleton."""

from __future__ import annotations

import argparse
import calendar
import csv
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATABASE_DIR = ROOT / "database"
BACKGROUND_PLANETS = ("JUPITER", "SATURN", "URANUS", "NEPTUNE", "PLUTO")
RESONANCE_PAIRS = (
    ("URANUS", "SUN"), ("URANUS", "MARS"), ("URANUS", "JUPITER"),
    ("NEPTUNE", "SUN"), ("NEPTUNE", "MARS"), ("NEPTUNE", "JUPITER"),
    ("PLUTO", "SUN"), ("PLUTO", "MARS"), ("PLUTO", "JUPITER"),
    ("URANUS", "NEPTUNE"), ("URANUS", "PLUTO"), ("NEPTUNE", "PLUTO"),
)
HEADERS = (
    "Record_ID", "Month_ID", "Record_Type", "Primary_Planet", "Secondary_Planet",
    "Primary_Sign", "Secondary_Sign", "Match_Type", "Target_Natal_House",
    "Valid_From", "Valid_To", "State_Changes", "Tone", "Title", "Interpretation",
    "Priority", "Active_Flag",
)


@dataclass(frozen=True)
class Segment:
    start: date
    end: date
    primary_sign: str
    secondary_sign: str = "ANY"


def month_days(year: int, month: int) -> list[date]:
    return [date(year, month, day) for day in range(1, calendar.monthrange(year, month)[1] + 1)]


def load_calendar(year: int) -> dict[tuple[date, str], dict[str, str]]:
    path = DATABASE_DIR / f"M_Transit_Calendar_{year}.csv"
    with path.open("r", encoding="utf-8-sig", newline="") as csv_file:
        rows = csv.DictReader(csv_file)
        return {(date.fromisoformat(row["Date"]), row["Planet"]): row for row in rows}


def contiguous_segments(days: list[date], keys: list[tuple[str, str]]) -> list[Segment]:
    segments: list[Segment] = []
    start = days[0]
    current = keys[0]
    for index in range(1, len(days)):
        if keys[index] == current:
            continue
        segments.append(Segment(start, days[index - 1], current[0], current[1]))
        start = days[index]
        current = keys[index]
    segments.append(Segment(start, days[-1], current[0], current[1]))
    return segments


def state_changes(
    transit_rows: dict[tuple[date, str], dict[str, str]],
    planets: tuple[str, ...],
    start: date,
    end: date,
) -> str:
    changes: list[str] = []
    current = start
    while current <= end:
        for planet in planets:
            row = transit_rows[(current, planet)]
            change = ""
            if row.get("Retrograde_Start_Flag") == "1":
                change = "retrograde_start"
            elif row.get("Retrograde_End_Flag") == "1":
                change = "retrograde_end"
            elif row.get("Sign_Ingress_Flag") == "1":
                change = "sign_ingress"
            elif row.get("Station_Flag") == "1":
                change = "station"
            if change:
                changes.append(f"{planet}:{current.isoformat()}:{change}")
        current += timedelta(days=1)
    return ";".join(changes) if changes else "none"


def background_priority(planet: str) -> int:
    return {"JUPITER": 95, "SATURN": 120, "URANUS": 105, "NEPTUNE": 115, "PLUTO": 110}[planet]


def default_tone(planet: str) -> str:
    if planet == "JUPITER":
        return "activation"
    if planet == "SATURN":
        return "caution"
    return "mixed"


def resonance_priority(secondary: str, match_type: str) -> int:
    base = {"SUN": 160, "MARS": 155, "JUPITER": 145}.get(secondary, 130)
    return base + 10 if match_type == "same_sign" else base


def resonance_tone(secondary: str) -> str:
    return "activation" if secondary in {"SUN", "MARS", "JUPITER"} else "mixed"


def record_id_part(value: str) -> str:
    return value.replace("-", "").upper()


def build_rows(year: int, month: int) -> list[dict[str, object]]:
    days = month_days(year, month)
    transit_rows = load_calendar(year)
    month_id = f"{year:04d}-{month:02d}"
    month_key = f"{year:04d}_{month:02d}"
    output: list[dict[str, object]] = []

    for planet in BACKGROUND_PLANETS:
        keys = [(transit_rows[(day, planet)]["Sign_ID"], "ANY") for day in days]
        for segment in contiguous_segments(days, keys):
            changes = state_changes(transit_rows, (planet,), segment.start, segment.end)
            for natal_house in range(1, 13):
                output.append({
                    "Record_ID": (
                        f"{month_key}_BACKGROUND_{planet}_{segment.primary_sign}_"
                        f"{record_id_part(segment.start.isoformat())}_{record_id_part(segment.end.isoformat())}_"
                        f"NATAL_{natal_house:02d}"
                    ),
                    "Month_ID": month_id,
                    "Record_Type": "background",
                    "Primary_Planet": planet,
                    "Secondary_Planet": "ANY",
                    "Primary_Sign": segment.primary_sign,
                    "Secondary_Sign": "ANY",
                    "Match_Type": "planet_natal_house",
                    "Target_Natal_House": natal_house,
                    "Valid_From": segment.start.isoformat(),
                    "Valid_To": segment.end.isoformat(),
                    "State_Changes": changes,
                    "Tone": default_tone(planet),
                    "Title": "",
                    "Interpretation": "",
                    "Priority": background_priority(planet),
                    "Active_Flag": 0,
                })

    for primary, secondary in RESONANCE_PAIRS:
        keys = [
            (transit_rows[(day, primary)]["Sign_ID"], transit_rows[(day, secondary)]["Sign_ID"])
            for day in days
        ]
        for segment in contiguous_segments(days, keys):
            changes = state_changes(transit_rows, (primary, secondary), segment.start, segment.end)
            base_id = (
                f"{month_key}_RESONANCE_{primary}_{secondary}_{segment.primary_sign}_"
                f"{segment.secondary_sign}_{record_id_part(segment.start.isoformat())}_"
                f"{record_id_part(segment.end.isoformat())}"
            )
            for natal_house in range(1, 13):
                output.append({
                    "Record_ID": f"{base_id}_SAME_NATAL_{natal_house:02d}",
                    "Month_ID": month_id,
                    "Record_Type": "resonance",
                    "Primary_Planet": primary,
                    "Secondary_Planet": secondary,
                    "Primary_Sign": segment.primary_sign,
                    "Secondary_Sign": segment.secondary_sign,
                    "Match_Type": "same_natal_house",
                    "Target_Natal_House": natal_house,
                    "Valid_From": segment.start.isoformat(),
                    "Valid_To": segment.end.isoformat(),
                    "State_Changes": changes,
                    "Tone": resonance_tone(secondary),
                    "Title": "",
                    "Interpretation": "",
                    "Priority": resonance_priority(secondary, "same_natal_house"),
                    "Active_Flag": 0,
                })
            if segment.primary_sign == segment.secondary_sign:
                output.append({
                    "Record_ID": f"{base_id}_SAME_SIGN",
                    "Month_ID": month_id,
                    "Record_Type": "resonance",
                    "Primary_Planet": primary,
                    "Secondary_Planet": secondary,
                    "Primary_Sign": segment.primary_sign,
                    "Secondary_Sign": segment.secondary_sign,
                    "Match_Type": "same_sign",
                    "Target_Natal_House": "ANY",
                    "Valid_From": segment.start.isoformat(),
                    "Valid_To": segment.end.isoformat(),
                    "State_Changes": changes,
                    "Tone": resonance_tone(secondary),
                    "Title": "",
                    "Interpretation": "",
                    "Priority": resonance_priority(secondary, "same_sign"),
                    "Active_Flag": 0,
                })

    return output


def write_csv(path: Path, rows: list[dict[str, object]], force: bool) -> None:
    if path.exists() and not force:
        raise SystemExit(f"Refusing to overwrite existing file: {path}. Use --force only before writing text.")
    with path.open("w", encoding="utf-8-sig", newline="") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=HEADERS, lineterminator="\r\n")
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("year", type=int)
    parser.add_argument("month", type=int, choices=range(1, 13))
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    path = DATABASE_DIR / f"M_Personal_Long_Term_Background_{args.year:04d}_{args.month:02d}.csv"
    rows = build_rows(args.year, args.month)
    write_csv(path, rows, args.force)
    print(f"Generated {path.name}: {len(rows)} rows")


if __name__ == "__main__":
    main()
