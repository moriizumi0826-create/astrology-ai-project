from __future__ import annotations

import csv
from collections import Counter
from datetime import date, datetime, time as dt_time, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any

import pandas as pd

from backend.app.services import monthly_overview_service, monthly_peak_service, reading_service
from backend.app.services.chart_calculator import BirthInput, get_angle_diff, get_aspect, get_house

try:
    import swisseph as swe
except ModuleNotFoundError:
    swe = None


FORECAST_YEAR = 2026
ASPECT_GENRE_DESCRIPTION_SCHEMA_VERSION = 2
ASPECT_GENRE_APPLICABILITY_SCHEMA_VERSION = 3
ASPECT_GENRE_SCORE_SCHEMA_VERSION = 4
ANNUAL_TRANSIT_HOUSE_TRANSITION_SCHEMA_VERSION = 1
MONTHLY_OVERVIEW_SCHEMA_VERSION = 1
ASPECT_GENRE_KEYS = ("love", "work", "money")
PROJECT_ROOT = Path(__file__).resolve().parents[3]
DATABASE_DIR = PROJECT_ROOT / "database"
MAIN_TREND_PLANETS = ("JUPITER", "SATURN", "URANUS", "NEPTUNE", "PLUTO")
LOCAL_VIBE_PLANETS = ("SUN", "MERCURY", "VENUS", "MARS")
FORECAST_PLANETS = (*MAIN_TREND_PLANETS, *LOCAL_VIBE_PLANETS)
ANNUAL_TRANSITION_PLANETS = (
    "SUN",
    "MERCURY",
    "VENUS",
    "MARS",
    "JUPITER",
    "SATURN",
    "URANUS",
    "NEPTUNE",
    "PLUTO",
)
ANNUAL_TRANSITION_TYPE_ORDER = (
    "SIGN_INGRESS",
    "SOLAR_HOUSE_INGRESS",
    "NATAL_HOUSE_INGRESS",
)
SIGNS = (
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
)
YEARLY_TEXT_PLACEHOLDER = "----"

PEAK_TARGET_ROLES = {
    "SUN": ("core_theme", "core_self", "vitality"),
    "MOON": ("emotion_moon", "emotional_body", "recovery", "mood_body", "daily_mood", "feeling"),
    "MERCURY": ("communication", "mental_nerves", "commerce", "documents", "task_process"),
    "VENUS": ("love_style", "value_style", "assets", "flirtation", "romance"),
    "MARS": ("action_drive", "desire", "passion", "task_load"),
    "JUPITER": ("growth_support", "network_gain", "career_income"),
    "SATURN": ("responsibility", "task_discipline", "daily_order"),
    "URANUS": ("core_theme",),
    "NEPTUNE": ("core_theme", "sensitivity"),
    "PLUTO": ("core_theme",),
    "ASC": ("self_body", "core_self", "vitality"),
    "MC": ("career_axis", "public_role", "public_message"),
    "DESC": ("relationship_axis", "partner", "dialogue"),
}


def _yearly_text(value: Any, column: str | None = None, default: str = "") -> str:
    if column is not None:
        text = reading_service._safe_text(value, column, default)
    elif value is None or pd.isna(value):
        text = default
    else:
        text = str(value)
    return text.strip() or YEARLY_TEXT_PLACEHOLDER


def _forecast_planet_ids() -> dict[str, int]:
    if swe is None:
        raise RuntimeError("swisseph is not installed")
    return {
        "SUN": swe.SUN,
        "MOON": swe.MOON,
        "MERCURY": swe.MERCURY,
        "VENUS": swe.VENUS,
        "MARS": swe.MARS,
        "JUPITER": swe.JUPITER,
        "SATURN": swe.SATURN,
        "URANUS": swe.URANUS,
        "NEPTUNE": swe.NEPTUNE,
        "PLUTO": swe.PLUTO,
    }


def _read_csv_dicts(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        raise FileNotFoundError(f"Required yearly forecast master is missing: {path}")
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def _yearly_csv_paths() -> list[Path]:
    paths = [
        DATABASE_DIR / "M_Long_Term_House_Interpretation.csv",
        DATABASE_DIR / "M_Short_Term_House_Interpretation.csv",
        DATABASE_DIR / "M_Yearly_Summary_Interpretation.csv",
        DATABASE_DIR / "M_Aspect_Interpretation_Yearly.csv",
        DATABASE_DIR / "M_Annual_Transit_House_Transitions.csv",
        DATABASE_DIR / "M_Annual_House_Activation_Rules.csv",
    ]
    paths.extend(
        DATABASE_DIR / filename
        for filename in (
            monthly_peak_service.RULES_FILENAME,
            monthly_peak_service.SCORING_FILENAME,
            monthly_peak_service.PERIOD_FILENAME,
            monthly_peak_service.NARRATIVE_TEMPLATES_FILENAME,
        )
    )
    paths.extend(sorted(DATABASE_DIR.glob("M_Transit_Calendar_*.csv")))
    paths.append(DATABASE_DIR / monthly_overview_service.EDITORIAL_FILENAME)
    paths.extend(sorted(DATABASE_DIR.glob("M_Monthly_Overview_Event_Paragraphs_*.csv")))
    paths.extend(sorted(DATABASE_DIR.glob("M_Monthly_Overview_Aspect_Clusters_*.csv")))
    paths.extend(sorted(DATABASE_DIR.glob("M_Personal_Long_Term_Background_*.csv")))
    return paths


def yearly_csv_paths_for_version() -> list[Path]:
    return _yearly_csv_paths()


def _csv_file_signature(paths: list[Path]) -> tuple[tuple[str, int | None, int | None], ...]:
    signature = []
    for path in paths:
        if path.exists():
            stat = path.stat()
            signature.append((str(path), stat.st_mtime_ns, stat.st_size))
        else:
            signature.append((str(path), None, None))
    return tuple(signature)


_YEARLY_CSV_SIGNATURE = _csv_file_signature(_yearly_csv_paths())


def _clear_yearly_master_caches() -> None:
    _transit_calendar.cache_clear()
    _long_term_house_rows.cache_clear()
    _short_term_house_rows.cache_clear()
    _yearly_summary_rows.cache_clear()
    _aspect_yearly_rows.cache_clear()
    _annual_transition_rows.cache_clear()
    _annual_activation_rules.cache_clear()
    _cached_aspect_interpretation.cache_clear()
    _aspect_master_index.cache_clear()
    _cached_yearly_forecast.cache_clear()
    monthly_overview_service.clear_monthly_overview_caches()
    monthly_peak_service.clear_monthly_peak_caches()


def reload_yearly_master_caches_if_changed(force: bool = False) -> bool:
    global _YEARLY_CSV_SIGNATURE
    current_signature = _csv_file_signature(_yearly_csv_paths())
    if not force and current_signature == _YEARLY_CSV_SIGNATURE:
        return False
    _YEARLY_CSV_SIGNATURE = current_signature
    _clear_yearly_master_caches()
    return True


@lru_cache(maxsize=4)
def _transit_calendar(year: int = FORECAST_YEAR) -> dict[tuple[str, str], dict[str, Any]]:
    path = DATABASE_DIR / f"M_Transit_Calendar_{year}.csv"
    return {(row["Date"], row["Planet"]): row for row in _read_csv_dicts(path)}


@lru_cache(maxsize=1)
def _long_term_house_rows() -> dict[tuple[str, int, int], dict[str, Any]]:
    path = DATABASE_DIR / "M_Long_Term_House_Interpretation.csv"
    rows: dict[tuple[str, int, int], dict[str, Any]] = {}
    if not path.exists():
        return rows
    for row in _read_csv_dicts(path):
        planet = reading_service._normalize_planet(row.get("トランジット天体"))
        natal_house = reading_service._normalize_int(row.get("ネイタルハウス"))
        solar_house = reading_service._normalize_int(row.get("ソーラーハウス"))
        if planet and natal_house and solar_house:
            rows[(planet, natal_house, solar_house)] = row
    return rows


@lru_cache(maxsize=1)
def _short_term_house_rows() -> dict[tuple[str, int, int], dict[str, Any]]:
    path = DATABASE_DIR / "M_Short_Term_House_Interpretation.csv"
    rows: dict[tuple[str, int, int], dict[str, Any]] = {}
    if not path.exists():
        return rows
    for row in _read_csv_dicts(path):
        planet = reading_service._normalize_planet(row.get("トランジット天体"))
        natal_house = reading_service._normalize_int(row.get("ネイタルハウス"))
        solar_house = reading_service._normalize_int(row.get("ソーラーハウス"))
        if planet and natal_house and solar_house:
            rows[(planet, natal_house, solar_house)] = row
    return rows


@lru_cache(maxsize=1)
def _yearly_summary_rows() -> dict[tuple[str, str, str, str], dict[str, Any]]:
    path = DATABASE_DIR / "M_Yearly_Summary_Interpretation.csv"
    rows: dict[tuple[str, str, str, str], dict[str, Any]] = {}
    if not path.exists():
        return rows
    for row in _read_csv_dicts(path):
        planet_a = reading_service._normalize_planet(row.get("Planet_A"))
        planet_b = reading_service._normalize_planet(row.get("Planet_B"))
        house_a = str(row.get("Planet_A_House") or "").strip()
        house_b = str(row.get("Planet_B_House") or "").strip()
        if planet_a and planet_b and house_a and house_b:
            rows[(planet_a, planet_b, house_a, house_b)] = row
    return rows


@lru_cache(maxsize=1)
def _aspect_yearly_rows() -> dict[str, dict[str, Any]]:
    path = DATABASE_DIR / "M_Aspect_Interpretation_Yearly.csv"
    return {
        str(row.get("Aspect_Logic_ID") or "").strip(): row
        for row in _read_csv_dicts(path)
        if row.get("Aspect_Logic_ID")
    }


def _transition_value(value: Any) -> str:
    text = str(value or "").strip()
    return text.upper()


def _transition_text(row: dict[str, Any], column: str) -> str:
    value = row.get(column)
    if value is None or pd.isna(value):
        return "-"
    text = str(value).strip()
    return text if text and text != "-" else "-"


@lru_cache(maxsize=1)
def _annual_transition_rows() -> dict[tuple[str, str, str], dict[str, Any]]:
    path = DATABASE_DIR / "M_Annual_Transit_House_Transitions.csv"
    if not path.exists():
        return {}
    rows: dict[tuple[str, str, str], dict[str, Any]] = {}
    for source_row, row in enumerate(_read_csv_dicts(path), start=2):
        row = {**row, "_csv_row": source_row}
        planet = reading_service._normalize_planet(row.get("Planet"))
        transition_type = _transition_value(row.get("Transition_Type"))
        value = _transition_value(row.get("Transition_Value"))
        if planet in ANNUAL_TRANSITION_PLANETS and transition_type and value:
            rows[(planet, transition_type, value)] = row
    return rows


@lru_cache(maxsize=1)
def _annual_activation_rules() -> tuple[dict[str, Any], ...]:
    path = DATABASE_DIR / "M_Annual_House_Activation_Rules.csv"
    if not path.exists():
        return ()
    rules: list[dict[str, Any]] = []
    for source_row, row in enumerate(_read_csv_dicts(path), start=2):
        if not reading_service._normalize_bool_flag(row.get("Enabled")):
            continue
        rules.append({
            **row,
            "_csv_row": source_row,
            "Scope": _transition_value(row.get("Scope")),
            "Transit_Planet_A": _transition_value(row.get("Transit_Planet_A")),
            "Transit_Planet_B": _transition_value(row.get("Transit_Planet_B")),
            "Natal_Target": _transition_value(row.get("Natal_Target")),
            "Aspect_Angle": _transition_value(row.get("Aspect_Angle")),
            "House_Type": _transition_value(row.get("House_Type")),
        })
    return tuple(rules)


def _calendar_row(day: date, planet: str) -> dict[str, Any]:
    return _transit_calendar(day.year)[(day.isoformat(), planet)]


def _calendar_transit_state(day: date, planet: str) -> tuple[float, bool, dict[str, Any]]:
    row = _calendar_row(day, planet)
    return (
        float(row["Ecliptic_Longitude"]),
        bool(reading_service._normalize_int(row.get("Retrograde_Flag"))),
        row,
    )


@lru_cache(maxsize=20000)
def _cached_aspect_interpretation(
    t_planet: str,
    n_planet: str,
    angle: int,
    house: int,
    is_retrograde: bool,
    orb_status: str,
) -> tuple[tuple[str, Any], ...]:
    row = _indexed_aspect_interpretation(t_planet, n_planet, angle, house, is_retrograde, orb_status)
    return tuple(row.items())


@lru_cache(maxsize=1)
def _aspect_master_index() -> dict[tuple[str, str, int], list[dict[str, Any]]]:
    aspect_df = reading_service.MASTER_DATAFRAMES.get("aspect", pd.DataFrame())
    index: dict[tuple[str, str, int], list[dict[str, Any]]] = {}
    if aspect_df.empty:
        return index
    for row in aspect_df.to_dict("records"):
        angle = reading_service._normalize_int(row.get("Aspect_Angle"))
        if angle is None:
            continue
        key = (
            reading_service._normalize_planet(row.get("T_Planet")),
            reading_service._normalize_planet(row.get("N_Planet")),
            angle,
        )
        index.setdefault(key, []).append(row)
    return index


def _indexed_aspect_interpretation(
    t_planet: str,
    n_planet: str,
    angle: int,
    house: int,
    is_retrograde: bool,
    orb_status: str,
) -> dict[str, Any]:
    key = (
        reading_service._normalize_planet(t_planet),
        reading_service._normalize_planet(n_planet),
        reading_service._normalize_int(angle) or 0,
    )
    base_candidates = _aspect_master_index().get(key, [])
    if not base_candidates:
        return {}

    text_orb_status = "Applying"
    fallback_filter_sets = [
        ("N_House", "T_Retrograde_Flag", "Orb_Status"),
        ("N_House", "T_Retrograde_Flag"),
        ("T_Retrograde_Flag", "Orb_Status"),
        ("T_Retrograde_Flag",),
        ("N_House", "Orb_Status"),
        ("N_House",),
        ("Orb_Status",),
        (),
    ]

    for filter_names in fallback_filter_sets:
        candidates = base_candidates
        if "N_House" in filter_names:
            candidates = [row for row in candidates if reading_service._normalize_int(row.get("N_House")) == house]
        if "T_Retrograde_Flag" in filter_names:
            candidates = [
                row
                for row in candidates
                if reading_service._normalize_bool_flag(row.get("T_Retrograde_Flag")) == int(is_retrograde)
            ]
        if "Orb_Status" in filter_names:
            candidates = [
                row
                for row in candidates
                if reading_service._normalize_orb_status(row.get("Orb_Status")) == reading_service._normalize_orb_status(text_orb_status)
            ]
        selected = reading_service._pick_highest_priority(pd.DataFrame(candidates))
        if selected is not None:
            return reading_service._hydrate_aspect_interpretation_row(selected)
    return {}


def _sample_local_datetime(day: date) -> datetime:
    return datetime.combine(day, dt_time(hour=12))


def _julian_day(local_dt: datetime, timezone_offset: float) -> float:
    utc_dt = local_dt - timedelta(hours=timezone_offset)
    hour_decimal = utc_dt.hour + (utc_dt.minute / 60) + (utc_dt.second / 3600)
    return swe.julday(utc_dt.year, utc_dt.month, utc_dt.day, hour_decimal)


def _calc_transit_state(planet: str, local_dt: datetime, timezone_offset: float) -> tuple[float, bool]:
    planet_id = _forecast_planet_ids()[planet]
    result = swe.calc_ut(_julian_day(local_dt, timezone_offset), planet_id, swe.FLG_SPEED)
    return float(result[0][0]), float(result[0][3]) < 0


def build_transit_chart(
    birth_input: BirthInput,
    target_date: date,
    target_time: dt_time,
) -> dict[str, Any]:
    if swe is None:
        raise RuntimeError("swisseph is not installed")

    local_dt = datetime.combine(target_date, target_time)
    jd = _julian_day(local_dt, birth_input.timezone_offset)
    planet_ids = _forecast_planet_ids()
    planet_order = ("SUN", "MOON", "MERCURY", "VENUS", "MARS", "JUPITER", "SATURN", "URANUS", "NEPTUNE", "PLUTO")
    transits = []
    for planet in planet_order:
        result = swe.calc_ut(jd, planet_ids[planet], swe.FLG_SPEED)
        transits.append({
            "planet": planet,
            "longitude": round(float(result[0][0]) % 360, 4),
            "retrograde": float(result[0][3]) < 0,
        })

    house_cusps, ascmc = swe.houses(jd, birth_input.latitude, birth_input.longitude, b"P")
    node_result = swe.calc_ut(jd, swe.TRUE_NODE, swe.FLG_SPEED)
    north_node_longitude = float(node_result[0][0]) % 360
    node_retrograde = float(node_result[0][3]) < 0
    transits.extend([
        {
            "planet": "NORTH_NODE",
            "longitude": round(north_node_longitude, 4),
            "retrograde": node_retrograde,
        },
        {
            "planet": "SOUTH_NODE",
            "longitude": round((north_node_longitude + 180) % 360, 4),
            "retrograde": node_retrograde,
        },
        {
            "planet": "ASC",
            "longitude": round(float(ascmc[0]) % 360, 4),
            "retrograde": False,
        },
        {
            "planet": "MC",
            "longitude": round(float(ascmc[1]) % 360, 4),
            "retrograde": False,
        },
    ])

    return {
        "date": target_date.isoformat(),
        "time": target_time.strftime("%H:%M"),
        "timezone_offset": birth_input.timezone_offset,
        "transits": transits,
        "house_cusps": [round(float(cusp) % 360, 4) for cusp in house_cusps],
        "house_system": "Placidus",
    }


def _build_daily_transit_chart(
    day: date,
    birth_input: BirthInput,
    transit_states: dict[str, tuple[float, bool]],
) -> dict[str, Any]:
    local_dt = _sample_local_datetime(day)
    moon_longitude, moon_retrograde = _calc_transit_state("MOON", local_dt, birth_input.timezone_offset)
    complete_states = {**transit_states, "MOON": (moon_longitude, moon_retrograde)}
    planet_order = ("SUN", "MOON", "MERCURY", "VENUS", "MARS", "JUPITER", "SATURN", "URANUS", "NEPTUNE", "PLUTO")
    jd = _julian_day(local_dt, birth_input.timezone_offset)
    house_cusps, _ascmc = swe.houses(jd, birth_input.latitude, birth_input.longitude, b"P")
    return {
        "date": day.isoformat(),
        "time": "12:00",
        "timezone_offset": birth_input.timezone_offset,
        "transits": [
            {
                "planet": planet,
                "longitude": round(float(complete_states[planet][0]) % 360, 4),
                "retrograde": bool(complete_states[planet][1]),
            }
            for planet in planet_order
        ],
        "house_cusps": [round(float(cusp) % 360, 4) for cusp in house_cusps],
        "house_system": "Placidus",
    }


def _solar_house(transit_sign: str, natal_sun_sign: str) -> int:
    transit_index = SIGNS.index(reading_service._normalize_sign(transit_sign))
    sun_index = SIGNS.index(reading_service._normalize_sign(natal_sun_sign))
    return ((transit_index - sun_index) % 12) + 1


def _sign_id_from_longitude(longitude: float) -> str:
    return SIGNS[int(longitude // 30) % 12]


def _build_natal_points(birth_input: BirthInput) -> tuple[list[dict[str, Any]], list[float], str]:
    chart_rows = reading_service.build_chart_rows(birth_input)
    points: list[dict[str, Any]] = []
    natal_sun_sign = "ARIES"
    for row in chart_rows["planets"]:
        if len(row) < 6:
            continue
        longitude = reading_service._normalize_float(row[1])
        if longitude is None:
            continue
        planet = reading_service._normalize_planet(row[0])
        if planet == "SUN":
            natal_sun_sign = _sign_id_from_longitude(longitude)
        points.append({
            "planet": planet,
            "longitude": longitude,
            "house": reading_service._normalize_int(row[5]) or 1,
        })

    if not birth_input.birth_time_unknown:
        angle_house = {"ASC": 1, "MC": 10}
        for row in chart_rows["angles"]:
            if len(row) < 2:
                continue
            point = reading_service._normalize_planet(row[0])
            longitude = reading_service._normalize_float(row[1])
            if point in angle_house and longitude is not None:
                points.append({"planet": point, "longitude": longitude, "house": angle_house[point]})

    house_cusps = [
        reading_service._normalize_float(row[1])
        for row in chart_rows["houses"]
        if len(row) > 1 and reading_service._normalize_float(row[1]) is not None
    ]
    return points, house_cusps, natal_sun_sign


def _orb_status_for_day(
    transit_planet: str,
    day: date,
    timezone_offset: float,
    natal_longitude: float,
    exact_angle: int,
) -> str:
    current_longitude, _, _ = _calendar_transit_state(day, transit_planet)
    next_day = day + timedelta(days=1)
    if next_day.year == day.year:
        future_longitude, _, _ = _calendar_transit_state(next_day, transit_planet)
    else:
        future_longitude, _ = _calc_transit_state(transit_planet, _sample_local_datetime(next_day), timezone_offset)
    current_deviation = abs(get_angle_diff(current_longitude, natal_longitude) - exact_angle)
    future_deviation = abs(get_angle_diff(future_longitude, natal_longitude) - exact_angle)
    return "Applying" if future_deviation < current_deviation else "Separating"


def _event_layer(transit_planet: str) -> str:
    return "Main_Trend" if transit_planet in MAIN_TREND_PLANETS else "Local_Vibe"


def _peak_target_roles(target: str) -> tuple[str, ...]:
    return PEAK_TARGET_ROLES.get(target, ("core_theme",))


def _peak_aspect_class(exact_angle: int) -> str:
    if exact_angle == 0:
        return "conjunction"
    if exact_angle in {60, 120}:
        return "soft"
    if exact_angle == 90:
        return "hard"
    if exact_angle == 150:
        return "adjustment"
    if exact_angle == 180:
        return "opposition"
    return "none"


def _peak_event(
    event_id: str,
    *,
    factor_type: str,
    transit_planet: str,
    natal_target: str = "ANY",
    target_role: tuple[str, ...] = ("core_theme",),
    house_system: str = "none",
    target_house: int | str = "ANY",
    aspect_angle: int | str = "ANY",
    aspect_class: str = "none",
    transit_state: str = "direct",
    orb: float | None = None,
    score_impact: float | None = None,
    yearly_weight: float | None = None,
    genre_score_impacts: dict[str, float | None] | None = None,
) -> dict[str, Any]:
    event = {
        "id": event_id,
        "factor_type": factor_type,
        "transit_planet": transit_planet,
        "natal_target": natal_target,
        "target_role": target_role,
        "house_system": house_system,
        "target_house": target_house,
        "aspect_angle": aspect_angle,
        "aspect_class": aspect_class,
        "transit_state": transit_state,
        "orb": orb,
    }
    if score_impact is not None:
        event["score_impact"] = score_impact
        event["yearly_weight"] = yearly_weight if yearly_weight is not None else 1.0
    if genre_score_impacts is not None:
        event["genre_score_impacts"] = genre_score_impacts
    return event


def _house_peak_event(
    day: date,
    transit_planet: str,
    *,
    house_system: str,
    target_house: int | str,
    previous_house: int | str,
) -> dict[str, Any]:
    """Build one daily house event, distinguishing ingress from continued stay."""
    factor_type = f"{house_system}_house"
    event_label = f"{house_system.upper()}_HOUSE"
    transit_state = "ingress" if target_house != previous_house else "stay"
    return _peak_event(
        f"PEAK_{event_label}_{transit_planet}_{day.isoformat()}",
        factor_type=factor_type,
        transit_planet=transit_planet,
        house_system=house_system,
        target_house=target_house,
        transit_state=transit_state,
    )


def _category_genres(category: Any) -> tuple[str, ...]:
    values = {
        str(value).strip().lower()
        for value in str(category or "").split(",")
    }
    return tuple(genre for genre in ASPECT_GENRE_KEYS if genre in values)


def _aspect_genre_importance_scores(
    genre_scores: dict[str, dict[str, float | None]],
) -> dict[str, float | None]:
    """Expose the stronger independent component without extra ranking weights."""
    return {
        genre: (
            max(float(value) for value in components.values() if value is not None)
            if any(value is not None for value in components.values())
            else None
        )
        for genre, components in genre_scores.items()
    }


def _aspect_genre_applicability(
    source_category: str,
    genre_score_components: dict[str, dict[str, float | None]],
) -> dict[str, Any]:
    """Resolve annual genre membership from authored dual-score cells."""
    category_genres = set(_category_genres(source_category))
    score_genres = {
        genre
        for genre in ASPECT_GENRE_KEYS
        if any(
            value is not None
            for value in (genre_score_components.get(genre) or {}).values()
        )
    }
    return {
        "genres": [genre for genre in ASPECT_GENRE_KEYS if genre in score_genres],
        "score_genres": [genre for genre in ASPECT_GENRE_KEYS if genre in score_genres],
        "category_genres": [
            genre for genre in ASPECT_GENRE_KEYS if genre in category_genres
        ],
        "planet_rule_genres": [],
    }


def _event_from_interpretation(
    interpretation: dict[str, Any],
    transit_planet: str,
    natal_point: dict[str, Any],
    exact_angle: int,
    orb: float,
    orb_status: str,
    is_retrograde: bool,
    transit_longitude: float,
    angle_diff: float,
) -> dict[str, Any]:
    yearly_row = _aspect_yearly_rows().get(str(interpretation.get("Aspect_Logic_ID") or "").strip(), {})
    if reading_service._safe_number(yearly_row, "Graph_Visibility", 1) == 0:
        return {}

    priority = reading_service._safe_number(yearly_row, "Priority") or reading_service._safe_number(interpretation, "Priority", 1)
    source_category = reading_service._safe_text(interpretation, "Category", "General")
    genre_descriptions = reading_service.get_aspect_genre_descriptions(
        transit_planet,
        natal_point["planet"],
        exact_angle,
        natal_point["house"],
    )
    genre_score_impacts = reading_service.get_aspect_genre_score_impacts(
        transit_planet,
        natal_point["planet"],
        exact_angle,
        natal_point["house"],
    )
    genre_score_components = reading_service.get_aspect_genre_score_components(
        transit_planet,
        natal_point["planet"],
        exact_angle,
        natal_point["house"],
    )
    genre_applicability = _aspect_genre_applicability(
        source_category,
        genre_score_components,
    )
    yearly_weight = reading_service._normalize_float(yearly_row.get("Yearly_Weight"))
    if yearly_weight is None:
        yearly_weight = 1.0
    genre_importance_scores = _aspect_genre_importance_scores(
        genre_score_components,
    )

    return {
        "id": reading_service._safe_text(interpretation, "Aspect_Logic_ID")
        or f"{transit_planet}_{natal_point['planet']}_{exact_angle}",
        "title": reading_service._safe_text(interpretation, "Category", "Transit Aspect"),
        "description": _yearly_text(interpretation, "Text_Description"),
        "genre_descriptions": genre_descriptions,
        "genre_score_impacts": genre_score_impacts,
        "genre_score_components": genre_score_components,
        "genre_importance_scores": genre_importance_scores,
        "genre_applicability": genre_applicability,
        "advised_task": _yearly_text(interpretation, "Advised_Task"),
        "priority": priority,
        "category": source_category,
        "layer": _event_layer(transit_planet),
        "duration_type": reading_service._safe_text(yearly_row, "Duration_Type", "LONG"),
        "yearly_weight": yearly_weight,
        "t_planet": transit_planet,
        "n_planet": natal_point["planet"],
        "natal_house": natal_point["house"],
        "aspect_angle": exact_angle,
        "orb": orb,
        "orb_status": orb_status,
        "is_retrograde": bool(is_retrograde),
        "transit_longitude": round(transit_longitude, 2),
        "natal_longitude": round(natal_point["longitude"], 2),
        "angle_diff": round(angle_diff, 2),
        "source": {
            "csv": reading_service._safe_text(interpretation, "_csv_file"),
            "row": reading_service._safe_number(interpretation, "_csv_row"),
        },
    }


def _build_day_forecast(
    day: date,
    birth_input: BirthInput,
    natal_points: list[dict[str, Any]],
    house_cusps: list[float],
    natal_sun_sign: str,
) -> dict[str, Any]:
    events: list[dict[str, Any]] = []
    peak_events: list[dict[str, Any]] = []
    transit_states: dict[str, tuple[float, bool]] = {}
    saturn_aspects: list[dict[str, Any]] = []
    sun_aspects: list[dict[str, Any]] = []
    mars_aspects: list[dict[str, Any]] = []

    for transit_planet in FORECAST_PLANETS:
        transit_longitude, is_retrograde, calendar_row = _calendar_transit_state(day, transit_planet)
        solar_house = _solar_house(calendar_row["Sign_ID"], natal_sun_sign)
        natal_house = get_house(transit_longitude, house_cusps) if len(house_cusps) == 12 else "ANY"
        transit_states[transit_planet] = (transit_longitude, is_retrograde)

        try:
            previous_longitude, _, previous_calendar_row = _calendar_transit_state(
                day - timedelta(days=1),
                transit_planet,
            )
            previous_solar_house = _solar_house(previous_calendar_row["Sign_ID"], natal_sun_sign)
            previous_natal_house = (
                get_house(previous_longitude, house_cusps)
                if len(house_cusps) == 12
                else "ANY"
            )
        except (FileNotFoundError, KeyError):
            # The earliest supported calendar date has no prior-day master row.
            previous_solar_house = solar_house
            previous_natal_house = natal_house

        if natal_house != "ANY":
            peak_events.append(_house_peak_event(
                day,
                transit_planet,
                house_system="natal",
                target_house=natal_house,
                previous_house=previous_natal_house,
            ))
        peak_events.append(_house_peak_event(
            day,
            transit_planet,
            house_system="solar",
            target_house=solar_house,
            previous_house=previous_solar_house,
        ))
        if is_retrograde:
            peak_events.append(_peak_event(
                f"PEAK_RETROGRADE_{transit_planet}_{day.isoformat()}",
                factor_type="retrograde",
                transit_planet=transit_planet,
                natal_target=transit_planet,
                target_role=_peak_target_roles(transit_planet),
                transit_state="retrograde",
            ))
        if reading_service._safe_number(calendar_row, "Retrograde_Start_Flag"):
            peak_events.append(_peak_event(
                f"PEAK_STATION_{transit_planet}_{day.isoformat()}",
                factor_type="station",
                transit_planet=transit_planet,
                natal_target=transit_planet,
                target_role=_peak_target_roles(transit_planet),
                transit_state="station",
            ))
        if reading_service._safe_number(calendar_row, "Retrograde_End_Flag"):
            peak_events.append(_peak_event(
                f"PEAK_DIRECT_{transit_planet}_{day.isoformat()}",
                factor_type="direct",
                transit_planet=transit_planet,
                natal_target=transit_planet,
                target_role=_peak_target_roles(transit_planet),
                transit_state="direct",
            ))
        for natal_point in natal_points:
            angle_diff = get_angle_diff(transit_longitude, natal_point["longitude"])
            _, exact_angle, orb = get_aspect(angle_diff)
            if exact_angle is None:
                continue
            orb_status = _orb_status_for_day(
                transit_planet,
                day,
                birth_input.timezone_offset,
                natal_point["longitude"],
                exact_angle,
            )
            saturn_export_item = None
            local_export_item = None
            if transit_planet == "SATURN":
                saturn_export_item = {
                    "date": day.isoformat(),
                    "t_planet": transit_planet,
                    "n_planet": natal_point["planet"],
                    "aspect_angle": exact_angle,
                    "orb_status": orb_status,
                    "title": "",
                    "description": "",
                    "advised_task": "",
                    "source": {},
                }
            if transit_planet in {"SUN", "MARS"}:
                local_export_item = {
                    "date": day.isoformat(),
                    "t_planet": transit_planet,
                    "n_planet": natal_point["planet"],
                    "aspect_angle": exact_angle,
                    "orb_status": orb_status,
                    "title": "",
                    "description": "",
                    "advised_task": "",
                    "source": {},
                }
            interpretation = dict(
                _cached_aspect_interpretation(
                    transit_planet,
                    natal_point["planet"],
                    exact_angle,
                    natal_point["house"],
                    is_retrograde,
                    orb_status,
                )
            )
            if not interpretation:
                continue
            event = _event_from_interpretation(
                interpretation,
                transit_planet,
                natal_point,
                exact_angle,
                orb,
                orb_status,
                is_retrograde,
                transit_longitude,
                angle_diff,
            )
            if event:
                yearly_row = _aspect_yearly_rows().get(
                    str(interpretation.get("Aspect_Logic_ID") or "").strip(),
                    {},
                )
                yearly_weight = reading_service._normalize_float(yearly_row.get("Yearly_Weight"))
                peak_events.append(_peak_event(
                    f"PEAK_T2N_{transit_planet}_{natal_point['planet']}_{exact_angle}_{day.isoformat()}",
                    factor_type="transit_to_natal",
                    transit_planet=transit_planet,
                    natal_target=natal_point["planet"],
                    target_role=_peak_target_roles(natal_point["planet"]),
                    house_system="natal",
                    target_house=natal_point["house"],
                    aspect_angle=exact_angle,
                    aspect_class=_peak_aspect_class(exact_angle),
                    transit_state="retrograde" if is_retrograde else "direct",
                    orb=orb,
                    score_impact=reading_service._safe_number(interpretation, "Score_Impact"),
                    yearly_weight=yearly_weight if yearly_weight is not None else 1.0,
                    genre_score_impacts=event.get("genre_score_impacts", {}),
                ))
                events.append(event)
                if saturn_export_item is not None:
                    saturn_export_item.update({
                        "title": event.get("title"),
                        "description": event.get("description"),
                        "advised_task": event.get("advised_task"),
                        "source": event.get("source"),
                    })
                if local_export_item is not None:
                    local_export_item.update({
                        "title": event.get("title"),
                        "description": event.get("description"),
                        "advised_task": event.get("advised_task"),
                        "source": event.get("source"),
                    })
            if saturn_export_item is not None:
                saturn_aspects.append(saturn_export_item)
            if local_export_item is not None:
                if transit_planet == "SUN":
                    sun_aspects.append(local_export_item)
                elif transit_planet == "MARS":
                    mars_aspects.append(local_export_item)

    for transit_planet, (transit_longitude, is_retrograde) in transit_states.items():
        for target_planet, (target_longitude, _) in transit_states.items():
            if transit_planet == target_planet:
                continue
            angle_diff = get_angle_diff(transit_longitude, target_longitude)
            _, exact_angle, orb = get_aspect(angle_diff)
            if exact_angle is None:
                continue
            peak_events.append(_peak_event(
                f"PEAK_T2T_{transit_planet}_{target_planet}_{exact_angle}_{day.isoformat()}",
                factor_type="transit_to_transit",
                transit_planet=transit_planet,
                natal_target=target_planet,
                target_role=_peak_target_roles(target_planet),
                aspect_angle=exact_angle,
                aspect_class=_peak_aspect_class(exact_angle),
                transit_state="retrograde" if is_retrograde else "direct",
                orb=orb,
            ))

    monthly_peak = monthly_peak_service.aggregate_daily_peak_categories(peak_events)
    scores = monthly_peak_service.calculate_daily_graph_scores(monthly_peak)

    def transit_aspects_for(planet: str) -> list[dict[str, Any]]:
        return [
            {
                "date": day.isoformat(),
                "t_planet": event.get("t_planet"),
                "n_planet": event.get("n_planet"),
                "aspect_angle": event.get("aspect_angle"),
                "orb_status": event.get("orb_status"),
                "title": event.get("title"),
                "category": event.get("category"),
                "description": event.get("description"),
                "genre_descriptions": event.get("genre_descriptions", {}),
                "genre_score_impacts": event.get("genre_score_impacts", {}),
                "genre_score_components": event.get("genre_score_components", {}),
                "genre_importance_scores": event.get("genre_importance_scores", {}),
                "genre_applicability": event.get("genre_applicability", {}),
                "priority": event.get("priority"),
                "duration_type": event.get("duration_type"),
                "yearly_weight": event.get("yearly_weight"),
                "orb": event.get("orb"),
                "natal_house": event.get("natal_house"),
                "advised_task": event.get("advised_task"),
                "source": event.get("source"),
            }
            for event in events
            if event.get("t_planet") == planet and event.get("aspect_angle") is not None
        ]

    all_aspects = [
        {
            "date": day.isoformat(),
            "t_planet": event.get("t_planet"),
            "n_planet": event.get("n_planet"),
            "aspect_angle": event.get("aspect_angle"),
            "orb": event.get("orb"),
            "orb_status": event.get("orb_status"),
            "transit_longitude": event.get("transit_longitude"),
            "title": event.get("title"),
            "category": event.get("category"),
            "description": event.get("description"),
            "genre_descriptions": event.get("genre_descriptions", {}),
            "genre_score_impacts": event.get("genre_score_impacts", {}),
            "genre_score_components": event.get("genre_score_components", {}),
            "genre_importance_scores": event.get("genre_importance_scores", {}),
            "genre_applicability": event.get("genre_applicability", {}),
            "priority": event.get("priority"),
            "duration_type": event.get("duration_type"),
            "yearly_weight": event.get("yearly_weight"),
            "natal_house": event.get("natal_house"),
            "advised_task": event.get("advised_task"),
            "source": event.get("source"),
        }
        for event in events
        if event.get("aspect_angle") is not None
    ]

    jupiter_aspects = transit_aspects_for("JUPITER")
    return {
        "date": day.isoformat(),
        "scores": scores,
        "monthly_peak": monthly_peak,
        "transit_chart": _build_daily_transit_chart(day, birth_input, transit_states),
        "all_aspects": all_aspects,
        "jupiter_aspects": jupiter_aspects,
        "saturn_aspects": saturn_aspects,
        "sun_aspects": sun_aspects,
        "mars_aspects": mars_aspects,
    }


def build_yearly_summary(yearly_data: list[dict[str, Any]]) -> str:
    if not yearly_data:
        return YEARLY_TEXT_PLACEHOLDER

    halves = {
        "first": yearly_data[: len(yearly_data) // 2],
        "second": yearly_data[len(yearly_data) // 2 :],
    }
    averages: dict[str, dict[str, float]] = {}
    for label, days in halves.items():
        averages[label] = {
            key: sum(day["scores"][key] for day in days) / len(days)
            for key in ("total", "work", "love", "money")
        }

    trend_key = max(("work", "love", "money", "total"), key=lambda key: averages["second"][key] - averages["first"][key])
    trend_labels = {"work": "仕事運", "love": "恋愛運", "money": "金運", "total": "総合運"}
    direction = "上昇します" if averages["second"][trend_key] >= averages["first"][trend_key] else "調整期に入ります"
    return f"2026年は後半に向けて{trend_labels[trend_key]}が{direction}"


def build_annual_transit_house_transitions(
    *,
    year: int,
    birth_input: BirthInput,
    house_cusps: list[float],
    natal_sun_sign: str,
) -> list[dict[str, Any]]:
    """Build chronological sign/solar-house/natal-house transition events."""
    if not house_cusps:
        return []

    master_rows = _annual_transition_rows()
    previous: dict[str, tuple[str, int, int]] = {}
    transitions: list[dict[str, Any]] = []
    current = date(year, 1, 1)
    end = date(year, 12, 31)

    while current <= end:
        states: dict[str, tuple[str, int, int]] = {}
        for planet in ANNUAL_TRANSITION_PLANETS:
            longitude, _is_retrograde, calendar_row = _calendar_transit_state(current, planet)
            sign = _transition_value(calendar_row.get("Sign_ID")) or _sign_id_from_longitude(longitude)
            natal_house = get_house(longitude, house_cusps)
            solar_house = _solar_house(sign, natal_sun_sign)
            state = (sign, solar_house, natal_house)
            states[planet] = state
            prior = previous.get(planet)
            if prior is None:
                continue

            changes: list[dict[str, Any]] = []
            if sign != prior[0]:
                changes.append({"type": "SIGN_INGRESS", "value": sign, "previous_value": prior[0]})
            if solar_house != prior[1]:
                changes.append({"type": "SOLAR_HOUSE_INGRESS", "value": str(solar_house), "previous_value": str(prior[1])})
            if natal_house != prior[2]:
                changes.append({"type": "NATAL_HOUSE_INGRESS", "value": str(natal_house), "previous_value": str(prior[2])})
            if not changes:
                continue

            titles: list[str] = []
            descriptions: list[str] = []
            sources: list[dict[str, Any]] = []
            for change in changes:
                master_row = master_rows.get((planet, change["type"], change["value"]), {})
                title = _transition_text(master_row, "Title")
                description = _transition_text(master_row, "Text_Description")
                if title != "-":
                    titles.append(title)
                if description != "-":
                    descriptions.append(description)
                if master_row:
                    sources.append({
                        "csv": "M_Annual_Transit_House_Transitions.csv",
                        "row": master_row.get("_csv_row"),
                    })

            transition_types = [change["type"] for change in changes]
            transitions.append({
                "date": current.isoformat(),
                "planet": planet,
                "planet_label": reading_service.PLANET_LABELS.get(planet, planet),
                "transition_type": "+".join(transition_types),
                "transition_types": transition_types,
                "changes": changes,
                "sign": sign,
                "solar_house": solar_house,
                "natal_house": natal_house,
                "title": " / ".join(titles) if titles else "-",
                "description": "\n".join(descriptions) if descriptions else "-",
                "source": sources,
            })
        previous = states
        current += timedelta(days=1)

    return transitions


OUTER_TRANSIT_PLANETS = {"JUPITER", "SATURN", "URANUS", "NEPTUNE", "PLUTO"}
PERSONAL_TRANSIT_PLANETS = {"SUN", "MERCURY", "VENUS", "MARS"}
NATAL_ACTIVATION_TARGETS = {
    *ANNUAL_TRANSITION_PLANETS,
    "ASC",
    "MC",
}


def _activation_token_matches(token: str, actual: str, *, angle_target: bool = False) -> bool:
    token = _transition_value(token)
    actual = _transition_value(actual)
    if token in {"", "ANY"}:
        return True
    if token == "OUTER":
        return actual in OUTER_TRANSIT_PLANETS
    if token == "PERSONAL":
        return actual in PERSONAL_TRANSIT_PLANETS
    if token == "ANGLE":
        return angle_target and actual in {"ASC", "MC"}
    return token == actual


def _activation_angle_matches(token: str, angle: int) -> bool:
    token = _transition_value(token)
    return token in {"", "ANY"} or token == str(angle)


def _activation_rule_matches(
    scope: str,
    *,
    planet_a: str,
    planet_b: str = "",
    natal_target: str = "",
    angle: int | None = None,
    house_type: str = "",
) -> list[dict[str, Any]]:
    matches: list[dict[str, Any]] = []
    for rule in _annual_activation_rules():
        if rule.get("Scope") != scope:
            continue
        if house_type and rule.get("House_Type") not in {"", "ANY", house_type}:
            continue
        if angle is not None and not _activation_angle_matches(rule.get("Aspect_Angle", ""), angle):
            continue
        if scope == "TRANSIT_TO_TRANSIT":
            direct = (
                _activation_token_matches(rule.get("Transit_Planet_A", ""), planet_a)
                and _activation_token_matches(rule.get("Transit_Planet_B", ""), planet_b)
            )
            reverse = (
                _activation_token_matches(rule.get("Transit_Planet_A", ""), planet_b)
                and _activation_token_matches(rule.get("Transit_Planet_B", ""), planet_a)
            )
            if not (direct or reverse):
                continue
        elif scope == "TRANSIT_TO_NATAL":
            if not _activation_token_matches(rule.get("Transit_Planet_A", ""), planet_a):
                continue
            if not _activation_token_matches(
                rule.get("Natal_Target", ""),
                natal_target,
                angle_target=natal_target in {"ASC", "MC"},
            ):
                continue
        matches.append(rule)
    return sorted(matches, key=lambda rule: int(float(rule.get("Priority") or 99)))


def _activation_event_from_rule(
    rule: dict[str, Any],
    *,
    day: date,
    planets: list[str],
    natal_target: str = "",
    aspect_angle: int | None = None,
    orb: float | None = None,
    house_type: str,
    house: int,
    state: dict[str, Any] | None = None,
) -> dict[str, Any]:
    title = _transition_text(rule, "Title")
    description = _transition_text(rule, "Text_Description")
    return {
        "date": day.isoformat(),
        "activation_type": rule.get("Scope", ""),
        "activation_mode": _transition_value(rule.get("Activation_Mode")),
        "text_key": _transition_value(rule.get("Text_Key")),
        "planets": planets,
        "natal_target": natal_target or None,
        "aspect_angle": aspect_angle,
        "orb": round(float(orb), 2) if orb is not None else None,
        "house_type": house_type.lower(),
        "house": house,
        "priority": int(float(rule.get("Priority") or 99)),
        "title": title,
        "description": description,
        "state": state or {},
        "source": {
            "csv": "M_Annual_House_Activation_Rules.csv",
            "row": rule.get("_csv_row"),
        },
    }


def build_annual_house_activation_events(
    *,
    year: int,
    birth_input: BirthInput,
    natal_points: list[dict[str, Any]],
    house_cusps: list[float],
    natal_sun_sign: str,
) -> list[dict[str, Any]]:
    """Build non-duplicated house emphasis events from the extension rules."""
    if not house_cusps:
        return []

    events: list[dict[str, Any]] = []
    previous_active: set[tuple[Any, ...]] = set()
    current = date(year, 1, 1)
    end = date(year, 12, 31)

    while current <= end:
        states: dict[str, dict[str, Any]] = {}
        for planet in ANNUAL_TRANSITION_PLANETS:
            longitude, retrograde, calendar_row = _calendar_transit_state(current, planet)
            sign = _transition_value(calendar_row.get("Sign_ID")) or _sign_id_from_longitude(longitude)
            states[planet] = {
                "longitude": longitude,
                "retrograde": retrograde,
                "sign": sign,
                "solar_house": _solar_house(sign, natal_sun_sign),
                "natal_house": get_house(longitude, house_cusps),
            }

        active: set[tuple[Any, ...]] = set()
        for index, planet_a in enumerate(ANNUAL_TRANSITION_PLANETS):
            for planet_b in ANNUAL_TRANSITION_PLANETS[index + 1:]:
                state_a = states[planet_a]
                state_b = states[planet_b]
                angle_diff = get_angle_diff(state_a["longitude"], state_b["longitude"])
                _, exact_angle, orb = get_aspect(angle_diff)
                if exact_angle is None:
                    continue
                for house_type, house_key in (("NATAL", "natal_house"), ("SOLAR", "solar_house")):
                    if state_a[house_key] != state_b[house_key]:
                        continue
                    rules = _activation_rule_matches(
                        "TRANSIT_TO_TRANSIT",
                        planet_a=planet_a,
                        planet_b=planet_b,
                        angle=exact_angle,
                        house_type=house_type,
                    )
                    if not rules:
                        continue
                    rule = rules[0]
                    key = ("PAIR", planet_a, planet_b, exact_angle, house_type, state_a[house_key])
                    active.add(key)
                    if key not in previous_active:
                        events.append(_activation_event_from_rule(
                            rule,
                            day=current,
                            planets=[planet_a, planet_b],
                            aspect_angle=exact_angle,
                            orb=orb,
                            house_type=house_type,
                            house=state_a[house_key],
                            state={"signs": [state_a["sign"], state_b["sign"]]},
                        ))

        for house_type, house_key in (("NATAL", "natal_house"), ("SOLAR", "solar_house")):
            grouped: dict[int, list[str]] = {}
            for planet, state in states.items():
                grouped.setdefault(state[house_key], []).append(planet)
            for house, planets in grouped.items():
                if len(planets) < 3:
                    continue
                rules = _activation_rule_matches(
                    "HOUSE_CLUSTER",
                    planet_a="ANY",
                    house_type=house_type,
                )
                if not rules:
                    continue
                rule = rules[0]
                planets = sorted(planets, key=ANNUAL_TRANSITION_PLANETS.index)
                key = ("CLUSTER", tuple(planets), house_type, house)
                active.add(key)
                if key not in previous_active:
                    events.append(_activation_event_from_rule(
                        rule,
                        day=current,
                        planets=planets,
                        house_type=house_type,
                        house=house,
                        state={"signs": [states[planet]["sign"] for planet in planets]},
                    ))

        for planet, state in states.items():
            for natal_point in natal_points:
                target = str(natal_point.get("planet") or "").upper()
                if target not in NATAL_ACTIVATION_TARGETS:
                    continue
                angle_diff = get_angle_diff(state["longitude"], natal_point["longitude"])
                _, exact_angle, orb = get_aspect(angle_diff)
                if exact_angle is None:
                    continue
                rules = _activation_rule_matches(
                    "TRANSIT_TO_NATAL",
                    planet_a=planet,
                    natal_target=target,
                    angle=exact_angle,
                    house_type="NATAL",
                )
                if not rules:
                    continue
                rule = rules[0]
                house = int(natal_point.get("house") or 0)
                if not house:
                    continue
                key = ("NATAL", planet, target, exact_angle, house)
                active.add(key)
                if key not in previous_active:
                    events.append(_activation_event_from_rule(
                        rule,
                        day=current,
                        planets=[planet],
                        natal_target=target,
                        aspect_angle=exact_angle,
                        orb=orb,
                        house_type="NATAL",
                        house=house,
                        state={"sign": state["sign"]},
                    ))
        previous_active = active
        current += timedelta(days=1)

    return sorted(
        events,
        key=lambda event: (
            event["date"],
            event["priority"],
            event["activation_type"],
            tuple(event["planets"]),
        ),
    )
def build_annual_themes(
    *,
    year: int,
    birth_input: BirthInput,
    house_cusps: list[float],
    natal_sun_sign: str,
    planet: str = "JUPITER",
) -> list[dict[str, Any]]:
    if not house_cusps:
        return []

    rows = _long_term_house_rows()
    themes: list[dict[str, Any]] = []
    current_theme: dict[str, Any] | None = None
    current = date(year, 1, 1)
    end = date(year, 12, 31)

    while current <= end:
        transit_longitude, _is_retrograde, calendar_row = _calendar_transit_state(current, planet)
        natal_house = get_house(transit_longitude, house_cusps)
        solar_house = _solar_house(calendar_row["Sign_ID"], natal_sun_sign)
        key = (planet, natal_house, solar_house)
        master_row = rows.get(key, {})
        summary = _yearly_text(master_row, "annual概要", "作成中")
        interpretation = _yearly_text(master_row, "annual解釈文", "作成中")

        if current_theme and current_theme["key"] == key:
            current_theme["end_date"] = current.isoformat()
        else:
            if current_theme:
                themes.append(current_theme)
            current_theme = {
                "key": key,
                "planet": planet,
                "planet_label": reading_service.PLANET_LABELS.get(planet, planet),
                "start_date": current.isoformat(),
                "end_date": current.isoformat(),
                "natal_house": natal_house,
                "solar_house": solar_house,
                "annual_summary": summary,
                "annual_interpretation": interpretation,
                "monthly_summary": _yearly_text(master_row, "monthly概要", "作成中"),
                "monthly_interpretation": _yearly_text(master_row, "monthly解釈文", "作成中"),
            }
        current += timedelta(days=1)

    if current_theme:
        themes.append(current_theme)
    for index, theme in enumerate(themes, start=1):
        theme["id"] = f"{planet}_THEME_{index:02d}"
        theme["label"] = f"THEME {index:02d}"
    return themes


def build_monthly_themes(
    *,
    year: int,
    birth_input: BirthInput,
    house_cusps: list[float],
    natal_sun_sign: str,
    planet: str,
) -> list[dict[str, Any]]:
    if not house_cusps:
        return []

    rows = _short_term_house_rows()
    themes: list[dict[str, Any]] = []
    current_theme: dict[str, Any] | None = None
    current = date(year, 1, 1)
    end = date(year, 12, 31)

    while current <= end:
        transit_longitude, _is_retrograde, calendar_row = _calendar_transit_state(current, planet)
        natal_house = get_house(transit_longitude, house_cusps)
        solar_house = _solar_house(calendar_row["Sign_ID"], natal_sun_sign)
        key = (planet, natal_house, solar_house)
        master_row = rows.get(key, {})
        summary = _yearly_text(master_row, "monthly概要", "作成中")
        interpretation = _yearly_text(master_row, "monthly解釈文", "作成中")

        if current_theme and current_theme["key"] == key:
            current_theme["end_date"] = current.isoformat()
        else:
            if current_theme:
                themes.append(current_theme)
            current_theme = {
                "key": key,
                "planet": planet,
                "planet_label": reading_service.PLANET_LABELS.get(planet, planet),
                "start_date": current.isoformat(),
                "end_date": current.isoformat(),
                "natal_house": natal_house,
                "solar_house": solar_house,
                "monthly_summary": summary,
                "monthly_interpretation": interpretation,
            }
        current += timedelta(days=1)

    if current_theme:
        themes.append(current_theme)
    for index, theme in enumerate(themes, start=1):
        theme["id"] = f"{planet}_MONTHLY_THEME_{index:02d}"
        theme["label"] = f"MONTHLY THEME {index:02d}"
    return themes


def _natal_house_for_planet(natal_points: list[dict[str, Any]], planet: str) -> int:
    normalized = reading_service._normalize_planet(planet)
    for point in natal_points:
        if reading_service._normalize_planet(point.get("planet")) == normalized:
            return reading_service._normalize_int(point.get("house")) or 1
    return 1


def _summary_master_text(row: dict[str, Any], column: str) -> str:
    return reading_service._safe_text(row, column, "作成中") or "作成中"


def build_annual_summary_columns(
    *,
    year: int,
    birth_input: BirthInput,
    house_cusps: list[float],
    natal_sun_sign: str,
) -> dict[str, list[dict[str, Any]]]:
    if not house_cusps:
        return {"environment": [], "mental": []}

    rows = _yearly_summary_rows()
    environment: list[dict[str, Any]] = []
    mental: list[dict[str, Any]] = []
    current_environment: dict[str, Any] | None = None
    current_mental: dict[str, Any] | None = None
    current = date(year, 1, 1)
    end = date(year, 12, 31)

    while current <= end:
        jupiter_longitude, _jupiter_retrograde, jupiter_calendar_row = _calendar_transit_state(current, "JUPITER")
        saturn_longitude, _saturn_retrograde, saturn_calendar_row = _calendar_transit_state(current, "SATURN")
        jupiter_solar_house = _solar_house(jupiter_calendar_row["Sign_ID"], natal_sun_sign)
        saturn_solar_house = _solar_house(saturn_calendar_row["Sign_ID"], natal_sun_sign)
        jupiter_transit_natal_house = get_house(jupiter_longitude, house_cusps)
        saturn_transit_natal_house = get_house(saturn_longitude, house_cusps)

        environment_key = (jupiter_solar_house, saturn_solar_house)
        environment_lookup_key = ("JUPITER", "SATURN", f"Solar_{jupiter_solar_house}", f"Solar_{saturn_solar_house}")
        environment_row = rows.get(environment_lookup_key, {})
        environment_title = _summary_master_text(environment_row, "Summary_Title")
        environment_text = _summary_master_text(environment_row, "Summary_Text")
        if (
            current_environment
            and current_environment["title"] == environment_title
            and current_environment["text"] == environment_text
        ):
            current_environment["end_date"] = current.isoformat()
        else:
            if current_environment:
                environment.append(current_environment)
            current_environment = {
                "key": environment_key,
                "start_date": current.isoformat(),
                "end_date": current.isoformat(),
                "jupiter_solar_house": jupiter_solar_house,
                "saturn_solar_house": saturn_solar_house,
                "title": environment_title,
                "text": environment_text,
            }

        mental_key = (jupiter_transit_natal_house, saturn_transit_natal_house)
        mental_lookup_key = ("JUPITER", "SATURN", f"Natal_{jupiter_transit_natal_house}", f"Natal_{saturn_transit_natal_house}")
        mental_row = rows.get(mental_lookup_key, {})
        mental_title = _summary_master_text(mental_row, "Summary_Title")
        mental_text = _summary_master_text(mental_row, "Summary_Text")
        if current_mental and current_mental["title"] == mental_title and current_mental["text"] == mental_text:
            current_mental["end_date"] = current.isoformat()
        else:
            if current_mental:
                mental.append(current_mental)
            current_mental = {
                "key": mental_key,
                "start_date": current.isoformat(),
                "end_date": current.isoformat(),
                "jupiter_transit_natal_house": jupiter_transit_natal_house,
                "saturn_transit_natal_house": saturn_transit_natal_house,
                "title": mental_title,
                "text": mental_text,
            }

        current += timedelta(days=1)

    if current_environment:
        environment.append(current_environment)
    if current_mental:
        mental.append(current_mental)
    for index, item in enumerate(environment, start=1):
        item["id"] = f"ENVIRONMENT_{index:02d}"
        item["label"] = f"ENVIRONMENT {index:02d}"
    for index, item in enumerate(mental, start=1):
        item["id"] = f"MENTAL_{index:02d}"
        item["label"] = f"MENTAL {index:02d}"
    return {"environment": environment, "mental": mental}


def build_annual_summaries(
    *,
    year: int,
    birth_input: BirthInput,
    house_cusps: list[float],
    natal_sun_sign: str,
    natal_points: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not house_cusps:
        return []

    rows = _yearly_summary_rows()
    summaries: list[dict[str, Any]] = []
    current_summary: dict[str, Any] | None = None
    jupiter_natal_house = _natal_house_for_planet(natal_points, "JUPITER")
    saturn_natal_house = _natal_house_for_planet(natal_points, "SATURN")
    current = date(year, 1, 1)
    end = date(year, 12, 31)

    while current <= end:
        jupiter_longitude, _jupiter_retrograde, jupiter_calendar_row = _calendar_transit_state(current, "JUPITER")
        saturn_longitude, _saturn_retrograde, saturn_calendar_row = _calendar_transit_state(current, "SATURN")
        jupiter_solar_house = _solar_house(jupiter_calendar_row["Sign_ID"], natal_sun_sign)
        saturn_solar_house = _solar_house(saturn_calendar_row["Sign_ID"], natal_sun_sign)
        jupiter_transit_natal_house = get_house(jupiter_longitude, house_cusps)
        saturn_transit_natal_house = get_house(saturn_longitude, house_cusps)
        reality_key = ("JUPITER", "SATURN", f"Solar_{jupiter_solar_house}", f"Solar_{saturn_solar_house}")
        mental_key = ("JUPITER", "SATURN", f"Natal_{jupiter_transit_natal_house}", f"Natal_{saturn_transit_natal_house}")
        period_key = (
            jupiter_solar_house,
            saturn_solar_house,
            jupiter_transit_natal_house,
            saturn_transit_natal_house,
        )
        reality_row = rows.get(reality_key, {})
        mental_row = rows.get(mental_key, {})
        reality_title = _summary_master_text(reality_row, "Summary_Title")
        mental_title = _summary_master_text(mental_row, "Summary_Title")
        reality_text = _summary_master_text(reality_row, "Summary_Text")
        mental_text = _summary_master_text(mental_row, "Summary_Text")

        if current_summary and current_summary["key"] == period_key:
            current_summary["end_date"] = current.isoformat()
        else:
            if current_summary:
                summaries.append(current_summary)
            current_summary = {
                "key": period_key,
                "start_date": current.isoformat(),
                "end_date": current.isoformat(),
                "jupiter_solar_house": jupiter_solar_house,
                "saturn_solar_house": saturn_solar_house,
                "jupiter_natal_house": jupiter_natal_house,
                "saturn_natal_house": saturn_natal_house,
                "jupiter_transit_natal_house": jupiter_transit_natal_house,
                "saturn_transit_natal_house": saturn_transit_natal_house,
                "reality_key": reality_key,
                "mental_key": mental_key,
                "environment_change": {
                    "title": reality_title,
                    "text": reality_text,
                },
                "mental_change": {
                    "title": mental_title,
                    "text": mental_text,
                },
                "annual_summary": f"{reality_title}と{mental_title}",
                "annual_interpretation": f"{reality_text}\n{mental_text}",
            }
        current += timedelta(days=1)

    if current_summary:
        summaries.append(current_summary)
    for index, summary in enumerate(summaries, start=1):
        summary["id"] = f"SUMMARY_{index:02d}"
        summary["label"] = f"SUMMARY {index:02d}"
    return summaries


def _available_monthly_overview_ids(year: int) -> tuple[str, ...]:
    prefix = "M_Monthly_Overview_Event_Paragraphs_"
    month_ids: list[str] = []
    for event_path in sorted(DATABASE_DIR.glob(f"{prefix}{year}_*.csv")):
        month_id = event_path.stem.removeprefix(prefix)
        aspect_path = DATABASE_DIR / monthly_overview_service.ASPECT_CLUSTERS_FILENAME.format(
            month_id=month_id
        )
        long_term_path = DATABASE_DIR / monthly_overview_service.LONG_TERM_BACKGROUND_FILENAME.format(
            month_id=month_id
        )
        if aspect_path.exists() and long_term_path.exists():
            month_ids.append(month_id)
    return tuple(month_ids)


def _monthly_overview_events(
    month_id: str,
    transitions: list[dict[str, Any]],
    natal_sun_sign: str,
) -> tuple[list[dict[str, Any]], dict[str, str]]:
    month_prefix = month_id.replace("_", "-")
    events: list[dict[str, Any]] = []
    calculated_dates: dict[str, str] = {}
    for transition in transitions:
        transition_date = str(transition.get("date") or "")
        planet = reading_service._normalize_planet(transition.get("planet"))
        if not transition_date.startswith(month_prefix) or planet not in {
            "SUN", "MERCURY", "VENUS", "MARS", "JUPITER"
        }:
            continue
        sign = _transition_value(transition.get("sign"))
        for change in transition.get("changes") or []:
            change_type = _transition_value(change.get("type"))
            previous_value = _transition_value(change.get("previous_value"))
            value = _transition_value(change.get("value"))
            if change_type == "SIGN_INGRESS":
                events.append({
                    "Planet": planet,
                    "Event_Type": "sign_ingress",
                    "Transit_Sign_From": previous_value,
                    "Transit_Sign_To": value,
                    "Solar_House_From": _solar_house(previous_value, natal_sun_sign),
                    "Solar_House_To": _solar_house(value, natal_sun_sign),
                    "Natal_House_At_Event": transition.get("natal_house"),
                })
            elif change_type == "NATAL_HOUSE_INGRESS":
                events.append({
                    "Planet": planet,
                    "Event_Type": "natal_house_ingress",
                    "Transit_Sign_From": sign,
                    "Transit_Sign_To": sign,
                    "Natal_House_From": previous_value,
                    "Natal_House_To": value,
                })
                date_key = f"{planet}:natal_house_ingress:{value}"
                existing = calculated_dates.get(date_key)
                if existing is not None and existing != transition_date:
                    raise LookupError(
                        f"Multiple monthly overview dates for {date_key}: "
                        f"{existing}, {transition_date}"
                    )
                calculated_dates[date_key] = transition_date
    return events, calculated_dates


def _monthly_overview_placements(
    day: date,
    house_cusps: list[float],
    natal_sun_sign: str,
) -> tuple[dict[str, tuple[str, int]], dict[str, tuple[int, int]]]:
    placements: dict[str, tuple[str, int]] = {}
    anchor_houses: dict[str, tuple[int, int]] = {}
    for planet in ANNUAL_TRANSITION_PLANETS:
        longitude, _is_retrograde, calendar_row = _calendar_transit_state(day, planet)
        sign = _transition_value(calendar_row.get("Sign_ID")) or _sign_id_from_longitude(longitude)
        natal_house = get_house(longitude, house_cusps)
        placements[planet] = (sign, natal_house)
        anchor_houses[planet] = (_solar_house(sign, natal_sun_sign), natal_house)
    return placements, anchor_houses


def build_monthly_overviews(
    *,
    year: int,
    house_cusps: list[float],
    natal_sun_sign: str,
    transitions: list[dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    if not house_cusps:
        return {}

    overviews: dict[str, list[dict[str, Any]]] = {}
    for month_id in _available_monthly_overview_ids(year):
        data_month_id = month_id.replace("_", "-")
        month_number = int(month_id[-2:])
        month_start = date(year, month_number, 1)
        next_month = date(year + (month_number == 12), (month_number % 12) + 1, 1)
        month_days = [
            month_start + timedelta(days=offset)
            for offset in range((next_month - month_start).days)
        ]
        edition_sign = _transition_value(_calendar_row(month_start, "SUN").get("Sign_ID"))
        edition_sun_houses = []
        for day in month_days:
            longitude, _is_retrograde, calendar_row = _calendar_transit_state(day, "SUN")
            if _transition_value(calendar_row.get("Sign_ID")) == edition_sign:
                edition_sun_houses.append(get_house(longitude, house_cusps))
        if not edition_sun_houses:
            raise LookupError(f"No SUN house samples for monthly overview {month_id}")
        house_counts = Counter(edition_sun_houses)
        editorial_natal_house = max(
            house_counts,
            key=lambda house: (house_counts[house], -edition_sun_houses.index(house)),
        )
        editorial_solar_house = _solar_house(edition_sign, natal_sun_sign)
        events, calculated_dates = _monthly_overview_events(
            month_id,
            transitions,
            natal_sun_sign,
        )
        cluster_ids = {
            row["Cluster_ID"]
            for row in monthly_overview_service.load_monthly_overview_aspect_clusters(
                month_id,
                DATABASE_DIR,
            )
            if str(row.get("Active_Flag") or "").strip() == "1"
        }

        daily_overviews: list[dict[str, Any]] = []
        for day in month_days:
            placements, anchor_houses = _monthly_overview_placements(
                day,
                house_cusps,
                natal_sun_sign,
            )
            daily_overviews.append(monthly_overview_service.compose_monthly_overview(
                month_id,
                day,
                editorial_solar_house,
                editorial_natal_house,
                events=events,
                calculated_event_dates=calculated_dates,
                matched_cluster_ids=cluster_ids,
                anchor_houses=anchor_houses,
                transit_placements=placements,
                database_dir=DATABASE_DIR,
            ))
        overviews[data_month_id] = daily_overviews
    return overviews


def _generate_yearly_forecast_uncached(
    birth_input: BirthInput,
    year: int = FORECAST_YEAR,
) -> dict[str, Any]:
    start = date(year, 1, 1)
    end = date(year, 12, 31)
    natal_points, house_cusps, natal_sun_sign = _build_natal_points(birth_input)
    yearly_data: list[dict[str, Any]] = []
    annual_jupiter_aspects: list[dict[str, Any]] = []
    annual_saturn_aspects: list[dict[str, Any]] = []
    annual_sun_aspects: list[dict[str, Any]] = []
    annual_mars_aspects: list[dict[str, Any]] = []
    current = start
    while current <= end:
        day_forecast = _build_day_forecast(current, birth_input, natal_points, house_cusps, natal_sun_sign)
        annual_jupiter_aspects.extend(day_forecast.get("jupiter_aspects", []))
        annual_saturn_aspects.extend(day_forecast.get("saturn_aspects", []))
        annual_sun_aspects.extend(day_forecast.get("sun_aspects", []))
        annual_mars_aspects.extend(day_forecast.get("mars_aspects", []))
        yearly_data.append(day_forecast)
        current += timedelta(days=1)
    monthly_peak_periods = monthly_peak_service.build_monthly_peak_periods(yearly_data)
    annual_themes = build_annual_themes(
        year=year,
        birth_input=birth_input,
        house_cusps=house_cusps,
        natal_sun_sign=natal_sun_sign,
        planet="JUPITER",
    )
    annual_lessons = build_annual_themes(
        year=year,
        birth_input=birth_input,
        house_cusps=house_cusps,
        natal_sun_sign=natal_sun_sign,
        planet="SATURN",
    )
    annual_summary_columns = build_annual_summary_columns(
        year=year,
        birth_input=birth_input,
        house_cusps=house_cusps,
        natal_sun_sign=natal_sun_sign,
    )
    annual_transit_house_transitions = build_annual_transit_house_transitions(
        year=year,
        birth_input=birth_input,
        house_cusps=house_cusps,
        natal_sun_sign=natal_sun_sign,
    )
    annual_house_activation_events = build_annual_house_activation_events(
        year=year,
        birth_input=birth_input,
        natal_points=natal_points,
        house_cusps=house_cusps,
        natal_sun_sign=natal_sun_sign,
    )
    annual_summaries = build_annual_summaries(
        year=year,
        birth_input=birth_input,
        house_cusps=house_cusps,
        natal_sun_sign=natal_sun_sign,
        natal_points=natal_points,
    )
    monthly_sun_themes = build_monthly_themes(
        year=year,
        birth_input=birth_input,
        house_cusps=house_cusps,
        natal_sun_sign=natal_sun_sign,
        planet="SUN",
    )
    monthly_mars_themes = build_monthly_themes(
        year=year,
        birth_input=birth_input,
        house_cusps=house_cusps,
        natal_sun_sign=natal_sun_sign,
        planet="MARS",
    )
    monthly_overviews = build_monthly_overviews(
        year=year,
        house_cusps=house_cusps,
        natal_sun_sign=natal_sun_sign,
        transitions=annual_transit_house_transitions,
    )

    yearly_summary = build_yearly_summary(yearly_data)
    # These fields are required while assembling scores and period summaries,
    # but the frontend uses their compact top-level replacements.  Keeping
    # them on all 365 days makes the response tens of megabytes larger.
    internal_daily_keys = {
        "monthly_peak",
        "jupiter_aspects",
        "saturn_aspects",
        "sun_aspects",
        "mars_aspects",
    }
    for day_forecast in yearly_data:
        for key in internal_daily_keys:
            day_forecast.pop(key, None)

    return {
        "summary": yearly_summary,
        "aspect_genre_description_schema": ASPECT_GENRE_DESCRIPTION_SCHEMA_VERSION,
        "aspect_genre_applicability_schema": ASPECT_GENRE_APPLICABILITY_SCHEMA_VERSION,
        "aspect_genre_score_schema": ASPECT_GENRE_SCORE_SCHEMA_VERSION,
        "annual_transit_house_transition_schema": ANNUAL_TRANSIT_HOUSE_TRANSITION_SCHEMA_VERSION,
        "monthly_overview_schema": MONTHLY_OVERVIEW_SCHEMA_VERSION,
        "yearly_data": yearly_data,
        "monthly_peak_periods": monthly_peak_periods,
        "natal_points": natal_points,
        "natal_house_cusps": house_cusps,
        "annual_themes": annual_themes,
        "annual_lessons": annual_lessons,
        "annual_summary_columns": annual_summary_columns,
        "annual_transit_house_transitions": annual_transit_house_transitions,
        "annual_house_activation_events": annual_house_activation_events,
        "annual_summaries": annual_summaries,
        "annual_jupiter_aspects": annual_jupiter_aspects,
        "annual_saturn_aspects": annual_saturn_aspects,
        "annual_sun_aspects": annual_sun_aspects,
        "annual_mars_aspects": annual_mars_aspects,
        "monthly_sun_themes": monthly_sun_themes,
        "monthly_mars_themes": monthly_mars_themes,
        "monthly_overviews": monthly_overviews,
        "cache": build_yearly_forecast_cache_payload(birth_input, year),
    }


@lru_cache(maxsize=1)
def _cached_yearly_forecast(
    full_name: str,
    birth_date: str,
    birth_time: str,
    birth_time_unknown: bool,
    birthplace: str,
    latitude: float,
    longitude: float,
    timezone_offset: float,
    year: int,
    _reading_master_signature: tuple[tuple[str, int | None, int | None], ...],
    _yearly_master_signature: tuple[tuple[str, int | None, int | None], ...],
) -> dict[str, Any]:
    return _generate_yearly_forecast_uncached(
        BirthInput(
            full_name=full_name,
            birth_date=birth_date,
            birth_time=birth_time,
            birth_time_unknown=birth_time_unknown,
            birthplace=birthplace,
            latitude=latitude,
            longitude=longitude,
            timezone_offset=timezone_offset,
        ),
        year,
    )


def generate_yearly_forecast(
    birth_input: BirthInput,
    year: int = FORECAST_YEAR,
) -> dict[str, Any]:
    reading_reloaded = reading_service.reload_master_dataframes_if_changed()
    yearly_reloaded = reload_yearly_master_caches_if_changed()
    if reading_reloaded and not yearly_reloaded:
        _cached_yearly_forecast.cache_clear()
    if swe is None:
        raise RuntimeError("swisseph is not installed")

    return _cached_yearly_forecast(
        birth_input.full_name,
        birth_input.birth_date,
        birth_input.birth_time,
        birth_input.birth_time_unknown,
        birth_input.birthplace,
        float(birth_input.latitude),
        float(birth_input.longitude),
        float(birth_input.timezone_offset),
        year,
        reading_service._MASTER_CSV_SIGNATURE,
        _YEARLY_CSV_SIGNATURE,
    )


YEARLY_FORECAST_SUMMARY_KEYS = (
    "summary",
    "monthly_overview_schema",
    "aspect_genre_description_schema",
    "aspect_genre_applicability_schema",
    "aspect_genre_score_schema",
    "annual_transit_house_transition_schema",
    "natal_points",
    "natal_house_cusps",
    "cache",
)


def build_yearly_forecast_summary(forecast: dict[str, Any]) -> dict[str, Any]:
    """Return only the fields needed to draw the initial annual score charts."""
    payload = {key: forecast[key] for key in YEARLY_FORECAST_SUMMARY_KEYS if key in forecast}
    payload["yearly_data"] = [
        {
            "date": day.get("date"),
            "scores": day.get("scores", {}),
        }
        for day in forecast.get("yearly_data", [])
    ]
    payload["detail_loaded"] = {
        "annual": False,
        "months": [],
        "days": [],
    }
    return payload


def _date_range_overlaps_month(start_value: Any, end_value: Any, year: int, month: int) -> bool:
    try:
        start_date = date.fromisoformat(str(start_value)[:10])
        end_date = date.fromisoformat(str(end_value or start_value)[:10])
    except (TypeError, ValueError):
        return False
    month_start = date(year, month, 1)
    month_end = date(year + (month == 12), 1 if month == 12 else month + 1, 1) - timedelta(days=1)
    return start_date <= month_end and end_date >= month_start


def _compact_annual_aspect_periods(yearly_data: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_aspect_and_date: dict[tuple[Any, ...], dict[str, dict[str, Any]]] = {}
    for day in yearly_data:
        day_date = str(day.get("date") or "")[:10]
        if not day_date:
            continue
        for aspect in day.get("all_aspects", []):
            key = (
                aspect.get("t_planet"),
                aspect.get("n_planet"),
                aspect.get("aspect_angle"),
                aspect.get("natal_house"),
            )
            existing = by_aspect_and_date.setdefault(key, {}).get(day_date)
            if existing is None or (not existing.get("description") and aspect.get("description")):
                by_aspect_and_date[key][day_date] = aspect

    periods: list[dict[str, Any]] = []
    copied_keys = (
        "t_planet",
        "n_planet",
        "aspect_angle",
        "natal_house",
        "title",
        "category",
        "description",
        "genre_descriptions",
        "genre_score_impacts",
        "genre_score_components",
        "genre_importance_scores",
        "genre_applicability",
        "advised_task",
    )
    for key, items_by_date in by_aspect_and_date.items():
        current_period: dict[str, Any] | None = None
        previous_date: date | None = None
        for day_date in sorted(items_by_date):
            parsed_date = date.fromisoformat(day_date)
            aspect = items_by_date[day_date]
            if current_period is not None and previous_date is not None and parsed_date == previous_date + timedelta(days=1):
                current_period["end_date"] = day_date
            else:
                current_period = {name: aspect.get(name) for name in copied_keys}
                current_period["key"] = "-".join(str(value) for value in key)
                current_period["start_date"] = day_date
                current_period["end_date"] = day_date
                periods.append(current_period)
            previous_date = parsed_date
    return sorted(periods, key=lambda item: (item["start_date"], item["key"]))


def build_yearly_forecast_detail(
    forecast: dict[str, Any],
    *,
    scope: str,
    year: int,
    day_date: str | None = None,
    month: int | None = None,
) -> dict[str, Any]:
    if scope == "day":
        if not day_date:
            raise ValueError("date is required for day detail")
        day = next(
            (item for item in forecast.get("yearly_data", []) if str(item.get("date"))[:10] == day_date),
            None,
        )
        if day is None:
            raise ValueError(f"yearly forecast date is unavailable: {day_date}")
        return {
            "detail_scope": "day",
            "detail_date": day_date,
            "yearly_data": [day],
        }

    if scope == "month":
        if month is None or not 1 <= month <= 12:
            raise ValueError("month must be between 1 and 12 for month detail")
        month_key = f"{year}-{month:02d}"
        monthly_peak_periods = {
            genre: [
                item
                for item in items
                if _date_range_overlaps_month(item.get("start_date"), item.get("end_date"), year, month)
            ]
            for genre, items in forecast.get("monthly_peak_periods", {}).items()
        }
        return {
            "detail_scope": "month",
            "detail_month": month,
            "monthly_overviews": {
                month_key: forecast.get("monthly_overviews", {}).get(month_key, [])
            },
            "monthly_peak_periods": monthly_peak_periods,
            "monthly_sun_themes": [
                item
                for item in forecast.get("monthly_sun_themes", [])
                if _date_range_overlaps_month(item.get("start_date"), item.get("end_date"), year, month)
            ],
            "monthly_mars_themes": [
                item
                for item in forecast.get("monthly_mars_themes", [])
                if _date_range_overlaps_month(item.get("start_date"), item.get("end_date"), year, month)
            ],
            "annual_sun_aspects": [
                item for item in forecast.get("annual_sun_aspects", [])
                if str(item.get("date") or "")[:7] == f"{year}-{month:02d}"
            ],
            "annual_mars_aspects": [
                item for item in forecast.get("annual_mars_aspects", [])
                if str(item.get("date") or "")[:7] == f"{year}-{month:02d}"
            ],
        }

    if scope == "annual":
        annual_keys = (
            "annual_themes",
            "annual_lessons",
            "annual_summary_columns",
            "annual_transit_house_transitions",
            "annual_house_activation_events",
        )
        payload = {key: forecast.get(key) for key in annual_keys}
        payload.update({
            "detail_scope": "annual",
            "annual_category_aspects": _compact_annual_aspect_periods(forecast.get("yearly_data", [])),
        })
        return payload

    raise ValueError(f"unsupported yearly forecast detail scope: {scope}")


def build_yearly_forecast_cache_payload(birth_input: BirthInput, year: int = FORECAST_YEAR) -> dict[str, Any]:
    return {
        "cache_key": f"{birth_input.full_name}:{birth_input.birth_date}:{birth_input.birth_time}:{birth_input.latitude}:{birth_input.longitude}:{year}",
        "table": "yearly_forecast_cache",
        "refresh_policy": "login_or_weekly",
        "year": year,
    }
