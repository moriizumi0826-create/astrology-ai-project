import argparse
import csv
from datetime import date, datetime, timedelta
from pathlib import Path

try:
    import swisseph as swe
except ModuleNotFoundError as exc:
    raise RuntimeError("pyswisseph is required to generate yearly forecast masters.") from exc


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATABASE_DIR = PROJECT_ROOT / "database"
YEAR = 2026

SIGNS = [
    "ARIES",
    "TAURUS",
    "GEMINI",
    "CANCER",
    "LEO",
    "VIRGO",
    "LIBRA",
    "SCORPIO",
    "SAGITTARIUS",
    "CAPRICORN",
    "AQUARIUS",
    "PISCES",
]

PLANET_IDS = {
    "SUN": swe.SUN,
    "MERCURY": swe.MERCURY,
    "VENUS": swe.VENUS,
    "MARS": swe.MARS,
    "JUPITER": swe.JUPITER,
    "SATURN": swe.SATURN,
    "URANUS": swe.URANUS,
    "NEPTUNE": swe.NEPTUNE,
    "PLUTO": swe.PLUTO,
}

OUTER_PLANETS = ("JUPITER", "SATURN", "URANUS", "NEPTUNE", "PLUTO")
LONG_PLANETS = {"JUPITER", "SATURN", "URANUS", "NEPTUNE", "PLUTO"}
MID_PLANETS = {"MARS"}
SHORT_PLANETS = {"SUN", "MERCURY", "VENUS", "MOON"}

BASE_LOGIC_BY_HOUSE = {
    1: ("General", 14, "Identity reset", "Put your own direction first."),
    2: ("Money", 12, "Resource building", "Review income, assets, and spending habits."),
    3: ("General", 8, "Learning and communication", "Share ideas and refine your daily routes."),
    4: ("General", 10, "Home foundation", "Stabilize family, home, and emotional ground."),
    5: ("Love", 14, "Creative opening", "Make space for joy, romance, and self-expression."),
    6: ("Work", 10, "Routine refinement", "Improve work rhythms and health maintenance."),
    7: ("Love", 16, "Partnership focus", "Choose conversations and alliances carefully."),
    8: ("Money", 8, "Deep restructuring", "Handle shared resources and emotional commitments."),
    9: ("General", 12, "Expansion and study", "Plan travel, study, publishing, or long-range growth."),
    10: ("Work", 20, "Career visibility", "Move public goals and responsibilities forward."),
    11: ("General", 12, "Community gains", "Use networks, teams, and future plans wisely."),
    12: ("General", -4, "Closure and preparation", "Rest, clear old patterns, and prepare the next cycle."),
}

PLANET_SCORE_MODIFIERS = {
    "JUPITER": 8,
    "SATURN": -6,
    "URANUS": 2,
    "NEPTUNE": -2,
    "PLUTO": 0,
}


def sign_id(longitude: float) -> str:
    return SIGNS[int(longitude // 30) % 12]


def degree_in_sign(longitude: float) -> float:
    return longitude % 30


def julian_day(day: date) -> float:
    sample = datetime.combine(day, datetime.min.time()).replace(hour=12)
    return swe.julday(sample.year, sample.month, sample.day, 12.0)


def transit_state(day: date, planet: str) -> dict[str, object]:
    result = swe.calc_ut(julian_day(day), PLANET_IDS[planet], swe.FLG_SPEED)
    longitude = float(result[0][0]) % 360
    speed = float(result[0][3])
    return {
        "longitude": longitude,
        "sign": sign_id(longitude),
        "degree": degree_in_sign(longitude),
        "speed": speed,
        "retrograde": 1 if speed < 0 else 0,
    }


def iter_days(year: int):
    current = date(year, 1, 1)
    end = date(year, 12, 31)
    while current <= end:
        yield current
        current += timedelta(days=1)


def generate_transit_calendar(year: int) -> Path:
    output_path = DATABASE_DIR / f"M_Transit_Calendar_{year}.csv"
    rows = []
    previous_by_planet: dict[str, dict[str, object]] = {}
    for day in iter_days(year):
        for planet in PLANET_IDS:
            state = transit_state(day, planet)
            previous = previous_by_planet.get(planet)
            sign_ingress = 1 if previous and previous["sign"] != state["sign"] else 0
            retrograde_start = 1 if previous and previous["retrograde"] == 0 and state["retrograde"] == 1 else 0
            retrograde_end = 1 if previous and previous["retrograde"] == 1 and state["retrograde"] == 0 else 0
            rows.append({
                "Date": day.isoformat(),
                "Planet": planet,
                "Ecliptic_Longitude": round(float(state["longitude"]), 6),
                "Sign_ID": state["sign"],
                "Degree_In_Sign": round(float(state["degree"]), 6),
                "Retrograde_Flag": state["retrograde"],
                "Sign_Ingress_Flag": sign_ingress,
                "Retrograde_Start_Flag": retrograde_start,
                "Retrograde_End_Flag": retrograde_end,
                "Station_Flag": 1 if retrograde_start or retrograde_end else 0,
                "Speed": round(float(state["speed"]), 8),
            })
            previous_by_planet[planet] = state

    with output_path.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    return output_path


def generate_yearly_base_logic() -> Path:
    output_path = DATABASE_DIR / "M_Yearly_Base_Logic.csv"
    rows = []
    for solar_sign in SIGNS:
        for planet in OUTER_PLANETS:
            for house in range(1, 13):
                category, base_score, theme, task = BASE_LOGIC_BY_HOUSE[house]
                score = base_score + PLANET_SCORE_MODIFIERS[planet]
                priority = 10 if planet == "JUPITER" and house == 10 else 8 if house in {1, 7, 10} else 6
                rows.append({
                    "Target_Solar_Sign": solar_sign,
                    "T_Planet": planet,
                    "Transit_House": house,
                    "Text_Theme": f"{planet} house {house}: {theme}",
                    "Base_Score": score,
                    "Category": category,
                    "Priority": priority,
                    "Milestone_Label": theme,
                    "Duration_Type": "LONG",
                    "Advised_Task": task,
                })

    with output_path.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    return output_path


def normalize_planet(value: str) -> str:
    value = str(value or "").strip().upper()
    for prefix in ("TRANSIT_", "NATAL_"):
        if value.startswith(prefix):
            value = value.removeprefix(prefix)
    return value


def duration_type(t_planet: str, _n_planet: str = "") -> str:
    """Classify duration from the moving planet, never the static natal point."""
    transit_planet = normalize_planet(t_planet)
    if transit_planet in LONG_PLANETS:
        return "LONG"
    if transit_planet in MID_PLANETS:
        return "MID"
    return "SHORT"


def yearly_weight(kind: str) -> float:
    return {"LONG": 1.0, "MID": 0.7, "SHORT": 0.35}.get(kind, 0.35)


def generate_aspect_yearly() -> Path:
    output_path = DATABASE_DIR / "M_Aspect_Interpretation_Yearly.csv"
    source_files = sorted(DATABASE_DIR.glob("M_Aspect_Interpretation*.csv"))
    seen_ids: set[str] = set()
    rows = []
    for source_path in source_files:
        if source_path.name == output_path.name:
            continue
        with source_path.open("r", encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                aspect_id = row.get("Aspect_Logic_ID")
                if not aspect_id or aspect_id in seen_ids:
                    continue
                seen_ids.add(aspect_id)
                kind = duration_type(row.get("T_Planet", ""), row.get("N_Planet", ""))
                priority = row.get("Priority") or 1
                graph_visibility = 0 if kind == "SHORT" and normalize_planet(row.get("T_Planet", "")) == "MOON" else 1
                rows.append({
                    "Aspect_Logic_ID": aspect_id,
                    "Priority": priority,
                    "Duration_Type": kind,
                    "Yearly_Weight": yearly_weight(kind),
                    "Graph_Visibility": graph_visibility,
                    "Milestone_Eligible": 1 if kind in {"LONG", "MID"} else 0,
                })

    with output_path.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "Aspect_Logic_ID",
                "Priority",
                "Duration_Type",
                "Yearly_Weight",
                "Graph_Visibility",
                "Milestone_Eligible",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)
    return output_path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, default=YEAR)
    args = parser.parse_args()
    DATABASE_DIR.mkdir(parents=True, exist_ok=True)
    outputs = [
        generate_transit_calendar(args.year),
        generate_yearly_base_logic(),
        generate_aspect_yearly(),
    ]
    for output in outputs:
        print(output)


if __name__ == "__main__":
    main()
