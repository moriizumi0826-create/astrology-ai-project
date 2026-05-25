from __future__ import annotations

import csv
from datetime import date, datetime, time as dt_time, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any

import pandas as pd

from backend.app.services import reading_service
from backend.app.services.chart_calculator import ASPECT_DEFS, BirthInput, get_angle_diff, get_aspect, get_house

try:
    import swisseph as swe
except ModuleNotFoundError:
    swe = None


FORECAST_YEAR = 2026
PROJECT_ROOT = Path(__file__).resolve().parents[3]
DATABASE_DIR = PROJECT_ROOT / "database"
MAIN_TREND_PLANETS = ("JUPITER", "SATURN", "URANUS", "NEPTUNE", "PLUTO")
LOCAL_VIBE_PLANETS = ("SUN", "MERCURY", "VENUS", "MARS")
FORECAST_PLANETS = (*MAIN_TREND_PLANETS, *LOCAL_VIBE_PLANETS)
CATEGORY_KEYS = ("work", "love", "money", "general")
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
MILESTONE_LIMIT = 12
YEARLY_TEXT_PLACEHOLDER = "----"


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


@lru_cache(maxsize=4)
def _transit_calendar(year: int = FORECAST_YEAR) -> dict[tuple[str, str], dict[str, Any]]:
    path = DATABASE_DIR / f"M_Transit_Calendar_{year}.csv"
    return {(row["Date"], row["Planet"]): row for row in _read_csv_dicts(path)}


@lru_cache(maxsize=1)
def _base_logic_rows() -> dict[tuple[str, str, int], dict[str, Any]]:
    path = DATABASE_DIR / "M_Yearly_Base_Logic.csv"
    rows = {}
    for row in _read_csv_dicts(path):
        key = (
            reading_service._normalize_sign(row.get("Target_Solar_Sign")),
            reading_service._normalize_planet(row.get("T_Planet")),
            reading_service._normalize_int(row.get("Transit_House")) or 0,
        )
        rows[key] = row
    return rows


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
def _aspect_yearly_rows() -> dict[str, dict[str, Any]]:
    path = DATABASE_DIR / "M_Aspect_Interpretation_Yearly.csv"
    return {
        str(row.get("Aspect_Logic_ID") or "").strip(): row
        for row in _read_csv_dicts(path)
        if row.get("Aspect_Logic_ID")
    }


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
                if reading_service._normalize_orb_status(row.get("Orb_Status")) == reading_service._normalize_orb_status(orb_status)
            ]
        selected = reading_service._pick_highest_priority(pd.DataFrame(candidates))
        if selected is not None:
            return reading_service._hydrate_aspect_interpretation_row(selected)
    return {}


def _priority_weight(priority: Any) -> float:
    normalized = reading_service._normalize_int(priority) or 0
    if normalized >= 10:
        return 3.0
    if normalized >= 7:
        return 2.0
    return 1.0


def _aspect_orb_limit(angle: int) -> float:
    for aspect in ASPECT_DEFS:
        if aspect["angle"] == angle:
            return float(aspect["orb"])
    return 8.0


def _orb_decay(orb: float | None, exact_angle: int) -> float:
    if orb is None:
        return 0.2
    max_orb = _aspect_orb_limit(exact_angle)
    if max_orb <= 0:
        return 1.0
    closeness = max(0.0, min(1.0, 1.0 - (abs(float(orb)) / max_orb)))
    return round(0.2 + (closeness * 0.8), 4)


def _damp(value: float, factor: float = 120.0) -> float:
    """極端な合計値を抑制する減衰関数。"""
    if value == 0:
        return 0
    sign = 1 if value > 0 else -1
    abs_val = abs(value)
    return sign * (abs_val * factor) / (abs_val + factor)


def _clamp_score(value: float) -> int:
    return int(max(-100, min(100, round(value))))


def _category_key(value: Any) -> str:
    normalized = str(value or "General").strip().lower()
    if normalized in {"work", "career", "job"}:
        return "work"
    if normalized in {"love", "relationship", "romance"}:
        return "love"
    if normalized in {"money", "finance", "asset"}:
        return "money"
    return "general"


def _score_category_totals(events: list[dict[str, Any]]) -> dict[str, int]:
    raw = {key: 0.0 for key in CATEGORY_KEYS}
    for event in events:
        raw[_category_key(event.get("category"))] += float(event.get("weighted_score", 0))
    
    # カテゴリごとに減衰を適用して合算
    return {
        "total": _clamp_score(_damp(sum(raw.values()), 150)),
        "work": _clamp_score(_damp(raw["work"], 120)),
        "love": _clamp_score(_damp(raw["love"], 120)),
        "money": _clamp_score(_damp(raw["money"], 120)),
        "general": _clamp_score(_damp(raw["general"], 120)),
    }


def _display_aspect_bucket(event: dict[str, Any]) -> int:
    if reading_service._normalize_planet(event.get("t_planet")) == "MOON":
        return 99
    duration_type = str(event.get("duration_type") or "").strip().upper()
    if duration_type == "SHORT":
        return 0
    if duration_type == "LONG":
        return 1
    if duration_type == "MID":
        return 2
    return 3


def _strongest_yearly_aspect(events: list[dict[str, Any]], category: str = "total") -> dict[str, Any] | None:
    category_normalized = str(category or "total").strip().lower()
    aspect_events = [
        event
        for event in events
        if event.get("aspect_angle") is not None
        and (category_normalized == "total" or _category_key(event.get("category")) == category_normalized)
        and reading_service._normalize_planet(event.get("t_planet")) != "MOON"
    ]
    if not aspect_events:
        return None
    best_bucket = min(_display_aspect_bucket(event) for event in aspect_events)
    aspect_events = [event for event in aspect_events if _display_aspect_bucket(event) == best_bucket]
    return sorted(
        aspect_events,
        key=lambda event: (
            reading_service._safe_number(event, "priority"),
            abs(reading_service._safe_number(event, "weighted_score")),
        ),
        reverse=True,
    )[0]


def _category_highlights(events: list[dict[str, Any]]) -> dict[str, dict[str, Any] | None]:
    return {
        "general": _strongest_yearly_aspect(events, "general"),
        "work": _strongest_yearly_aspect(events, "work"),
        "love": _strongest_yearly_aspect(events, "love"),
        "money": _strongest_yearly_aspect(events, "money"),
    }


def _strongest_yearly_aspect_for_duration(
    events: list[dict[str, Any]],
    category: str,
    duration_types: str | tuple[str, ...],
) -> dict[str, Any] | None:
    category_normalized = str(category or "total").strip().lower()
    duration_normalized = (
        {str(duration_types or "").strip().upper()}
        if isinstance(duration_types, str)
        else {str(duration_type or "").strip().upper() for duration_type in duration_types}
    )
    aspect_events = [
        event
        for event in events
        if event.get("aspect_angle") is not None
        and (category_normalized == "total" or _category_key(event.get("category")) == category_normalized)
        and reading_service._normalize_planet(event.get("t_planet")) != "MOON"
        and str(event.get("duration_type") or "").strip().upper() in duration_normalized
    ]
    if not aspect_events:
        return None
    return sorted(
        aspect_events,
        key=lambda event: (
            reading_service._safe_number(event, "priority"),
            abs(reading_service._safe_number(event, "weighted_score")),
        ),
        reverse=True,
    )[0]


def _category_highlights_for_duration(events: list[dict[str, Any]], duration_types: str | tuple[str, ...]) -> dict[str, dict[str, Any] | None]:
    return {
        "general": _strongest_yearly_aspect_for_duration(events, "general", duration_types),
        "work": _strongest_yearly_aspect_for_duration(events, "work", duration_types),
        "love": _strongest_yearly_aspect_for_duration(events, "love", duration_types),
        "money": _strongest_yearly_aspect_for_duration(events, "money", duration_types),
    }


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


def _display_countdown_label(value: Any) -> str:
    label = str(value or "").strip()
    for suffix in ("日まで", "まで", "日"):
        if label.endswith(suffix):
            return label[: -len(suffix)].rstrip()
    return label


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

    score_impact = reading_service._safe_number(interpretation, "Score_Impact")
    priority = reading_service._safe_number(yearly_row, "Priority") or reading_service._safe_number(interpretation, "Priority", 1)
    priority_weight = _priority_weight(priority)
    orb_decay = _orb_decay(orb, exact_angle)
    yearly_weight = reading_service._normalize_float(yearly_row.get("Yearly_Weight")) if yearly_row else None
    yearly_weight = yearly_weight if yearly_weight is not None else 1.0
    weighted_score = score_impact * priority_weight * orb_decay * yearly_weight

    return {
        "id": reading_service._safe_text(interpretation, "Aspect_Logic_ID")
        or f"{transit_planet}_{natal_point['planet']}_{exact_angle}",
        "title": _display_countdown_label(reading_service._safe_text(interpretation, "Countdown_Label"))
        or reading_service._safe_text(interpretation, "Category", "Transit Aspect"),
        "description": _yearly_text(interpretation, "Text_Description"),
        "advised_task": _yearly_text(interpretation, "Advised_Task"),
        "priority": priority,
        "category": reading_service._safe_text(interpretation, "Category", "General"),
        "layer": _event_layer(transit_planet),
        "duration_type": reading_service._safe_text(yearly_row, "Duration_Type", "LONG"),
        "milestone_eligible": bool(reading_service._safe_number(yearly_row, "Milestone_Eligible", 1)),
        "t_planet": transit_planet,
        "n_planet": natal_point["planet"],
        "aspect_angle": exact_angle,
        "orb": orb,
        "orb_status": orb_status,
        "is_retrograde": bool(is_retrograde),
        "score_impact": score_impact,
        "priority_weight": priority_weight,
        "orb_decay": orb_decay,
        "yearly_weight": yearly_weight,
        "weighted_score": round(weighted_score, 2),
        "transit_longitude": round(transit_longitude, 2),
        "natal_longitude": round(natal_point["longitude"], 2),
        "angle_diff": round(angle_diff, 2),
        "source": {
            "csv": reading_service._safe_text(interpretation, "_csv_file"),
            "row": reading_service._safe_number(interpretation, "_csv_row"),
        },
    }


def _base_event_from_logic(base_row: dict[str, Any], planet: str, house: int, calendar_row: dict[str, Any]) -> dict[str, Any]:
    score = reading_service._safe_number(base_row, "Base_Score")
    priority = reading_service._safe_number(base_row, "Priority", 1)
    priority_weight = _priority_weight(priority)
    return {
        "id": f"BASE_{planet}_HOUSE_{house}_{calendar_row.get('Date')}",
        "title": reading_service._safe_text(base_row, "Milestone_Label") or reading_service._safe_text(base_row, "Text_Theme"),
        "description": _yearly_text(base_row, "Text_Theme"),
        "advised_task": _yearly_text(base_row, "Advised_Task"),
        "priority": priority,
        "category": reading_service._safe_text(base_row, "Category", "General"),
        "layer": "Main_Trend",
        "duration_type": reading_service._safe_text(base_row, "Duration_Type", "LONG"),
        "milestone_eligible": True,
        "t_planet": planet,
        "n_planet": f"SOLAR_HOUSE_{house}",
        "aspect_angle": None,
        "orb": None,
        "orb_status": "Baseline",
        "score_impact": score,
        "priority_weight": priority_weight,
        "orb_decay": 1.0,
        "yearly_weight": 1.0,
        "weighted_score": round(score * priority_weight, 2),
        "transit_longitude": reading_service._normalize_float(calendar_row.get("Ecliptic_Longitude")),
        "solar_house": house,
    }


def _calendar_trigger_events(day: date, planet: str, calendar_row: dict[str, Any], solar_house: int) -> list[dict[str, Any]]:
    triggers = []
    if reading_service._safe_number(calendar_row, "Sign_Ingress_Flag"):
        triggers.append(("SIGN_INGRESS", "Sign ingress", 7))
    if reading_service._safe_number(calendar_row, "Retrograde_Start_Flag"):
        triggers.append(("RETROGRADE_START", "Retrograde starts", 8))
    if reading_service._safe_number(calendar_row, "Retrograde_End_Flag"):
        triggers.append(("RETROGRADE_END", "Retrograde ends", 8))

    events = []
    for trigger_id, title, priority in triggers:
        events.append({
            "id": f"{trigger_id}_{planet}_{day.isoformat()}",
            "title": f"{planet} {title}",
            "description": YEARLY_TEXT_PLACEHOLDER,
            "advised_task": YEARLY_TEXT_PLACEHOLDER,
            "priority": priority,
            "category": "General",
            "layer": _event_layer(planet),
            "duration_type": "LONG" if planet in MAIN_TREND_PLANETS else "MID",
            "milestone_eligible": True,
            "t_planet": planet,
            "n_planet": f"SOLAR_HOUSE_{solar_house}",
            "aspect_angle": None,
            "orb": None,
            "orb_status": trigger_id,
            "score_impact": 0,
            "priority_weight": 1.0,
            "orb_decay": 1.0,
            "yearly_weight": 1.0,
            "weighted_score": 0,
            "transit_longitude": reading_service._normalize_float(calendar_row.get("Ecliptic_Longitude")),
            "solar_house": solar_house,
        })
    return events


def _build_day_forecast(
    day: date,
    birth_input: BirthInput,
    natal_points: list[dict[str, Any]],
    house_cusps: list[float],
    natal_sun_sign: str,
) -> dict[str, Any]:
    events: list[dict[str, Any]] = []

    for transit_planet in FORECAST_PLANETS:
        transit_longitude, is_retrograde, calendar_row = _calendar_transit_state(day, transit_planet)
        solar_house = _solar_house(calendar_row["Sign_ID"], natal_sun_sign)
        base_row = _base_logic_rows().get((natal_sun_sign, transit_planet, solar_house))
        if base_row:
            events.append(_base_event_from_logic(base_row, transit_planet, solar_house, calendar_row))
        events.extend(_calendar_trigger_events(day, transit_planet, calendar_row, solar_house))

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
                events.append(event)

    scores = _score_category_totals(events)
    top_events = sorted(events, key=lambda event: (event["priority"], abs(event["weighted_score"])), reverse=True)[:5]
    return {
        "date": day.isoformat(),
        "scores": scores,
        "events": top_events,
        "category_highlights": _category_highlights(events),
        "category_theme_highlights": {
            "short": _category_highlights_for_duration(events, ("SHORT", "MID")),
            "long": _category_highlights_for_duration(events, "LONG"),
        },
    }


def _is_local_extreme(values: list[int], index: int) -> bool:
    previous_value = values[index - 1]
    current_value = values[index]
    next_value = values[index + 1]
    return (current_value >= previous_value and current_value > next_value) or (
        current_value <= previous_value and current_value < next_value
    )


def _has_peak_transition(day: dict[str, Any], previous_day: dict[str, Any] | None) -> bool:
    if not previous_day:
        return False
    previous_status = {
        (event.get("t_planet"), event.get("n_planet"), event.get("aspect_angle")): event.get("orb_status")
        for event in previous_day.get("events", [])
    }
    for event in day.get("events", []):
        key = (event.get("t_planet"), event.get("n_planet"), event.get("aspect_angle"))
        if previous_status.get(key) == "Applying" and event.get("orb_status") == "Separating":
            return True
    return False


def _has_calendar_trigger(day: dict[str, Any]) -> bool:
    return any(
        event.get("orb_status") in {"SIGN_INGRESS", "RETROGRADE_START", "RETROGRADE_END"}
        for event in day.get("events", [])
    )


def _milestone_from_day(day: dict[str, Any], label: str) -> dict[str, Any]:
    event = day.get("events", [{}])[0] if day.get("events") else {}
    return {
        "date": day["date"],
        "label": label,
        "id": event.get("id") or f"MILESTONE_{day['date']}",
        "title": event.get("title", label),
        "description": _yearly_text(event.get("description")),
        "advised_task": _yearly_text(event.get("advised_task")),
        "priority": event.get("priority", 1),
        "score": day["scores"]["total"],
    }


def extract_milestones(yearly_data: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if len(yearly_data) < 3:
        return []

    total_scores = [day["scores"]["total"] for day in yearly_data]
    candidates: dict[str, dict[str, Any]] = {}
    max_index = max(range(len(yearly_data)), key=lambda index: total_scores[index])
    min_index = min(range(len(yearly_data)), key=lambda index: total_scores[index])
    candidates[yearly_data[max_index]["date"]] = _milestone_from_day(yearly_data[max_index], "年間最高点")
    candidates[yearly_data[min_index]["date"]] = _milestone_from_day(yearly_data[min_index], "年間最低点")

    for index in range(1, len(yearly_data) - 1):
        day = yearly_data[index]
        if _is_local_extreme(total_scores, index):
            label = "運命の頂点" if total_scores[index] >= total_scores[index - 1] else "見直しの谷"
            candidates[day["date"]] = _milestone_from_day(day, label)
        if abs(total_scores[index] - total_scores[index - 1]) >= 25:
            candidates[day["date"]] = _milestone_from_day(day, "運命の分岐点")
        if _has_peak_transition(day, yearly_data[index - 1]):
            candidates[day["date"]] = _milestone_from_day(day, "ピーク通過")
        if _has_calendar_trigger(day):
            candidates[day["date"]] = _milestone_from_day(day, "空気が変わる日")

    ranked = sorted(
        candidates.values(),
        key=lambda item: (item.get("priority", 0), abs(item.get("score", 0))),
        reverse=True,
    )
    return ranked[:MILESTONE_LIMIT]


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


def generate_yearly_forecast(
    birth_input: BirthInput,
    year: int = FORECAST_YEAR,
) -> dict[str, Any]:
    if swe is None:
        raise RuntimeError("swisseph is not installed")

    start = date(year, 1, 1)
    end = date(year, 12, 31)
    natal_points, house_cusps, natal_sun_sign = _build_natal_points(birth_input)
    yearly_data: list[dict[str, Any]] = []
    current = start
    while current <= end:
        yearly_data.append(_build_day_forecast(current, birth_input, natal_points, house_cusps, natal_sun_sign))
        current += timedelta(days=1)
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

    return {
        "summary": build_yearly_summary(yearly_data),
        "yearly_data": yearly_data,
        "milestones": extract_milestones(yearly_data),
        "annual_themes": annual_themes,
        "annual_lessons": annual_lessons,
        "cache": build_yearly_forecast_cache_payload(birth_input, year),
    }


def build_yearly_forecast_cache_payload(birth_input: BirthInput, year: int = FORECAST_YEAR) -> dict[str, Any]:
    return {
        "cache_key": f"{birth_input.full_name}:{birth_input.birth_date}:{birth_input.birth_time}:{birth_input.latitude}:{birth_input.longitude}:{year}",
        "table": "yearly_forecast_cache",
        "refresh_policy": "login_or_weekly",
        "year": year,
    }
