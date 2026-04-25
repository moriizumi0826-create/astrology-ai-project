import io
import logging
import re
import sys
from datetime import date, datetime, time as dt_time, timedelta
from math import ceil
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

import pandas as pd

from backend.app.schemas import ReadingMeta, ReadingRequest, ReadingResponse, ReadingSection
from backend.app.services.chart_calculator import (
    BirthInput,
    build_chart_rows,
    get_angle_diff,
    get_aspect,
    write_chart_csvs,
)

try:
    import swisseph as swe
except ModuleNotFoundError:
    swe = None


PROJECT_ROOT = Path(__file__).resolve().parents[3]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.generate_report import generate_report_from_csvs  # noqa: E402
from scripts.natal_loader import build_natal_chart_data  # noqa: E402
from scripts.transit_loader import load_transit_support_data  # noqa: E402


REPORT_TYPE = "full_report"
REPORT_TITLE = "Full Reading"
UNKNOWN_BIRTH_TIME_LABEL = "Unknown (calculated with 12:00 local time)"
DEFAULT_DAILY_VIBE_MODIFIER_LIMIT = 60
DEFAULT_COUNTDOWN_THRESHOLD_ORB = 5
DEFAULT_COUNTDOWN_TOTAL_DAYS = 1

LOGGER = logging.getLogger(__name__)
DATABASE_DIR = PROJECT_ROOT / "database"

MASTER_CSV_FILES = {
    "basic": "M_Basic_Interpretation.csv",
    "aspect": "M_Aspect_Interpretation.csv",
    "daily_vibe": "M_Daily_Vibe_Logic.csv",
    "countdown": "M_Countdown_Master.csv",
    "timeline_advice": "M_Timeline_Advice.csv",
}

AVERAGE_PLANET_SPEED_DEGREES_PER_DAY = {
    "SUN": 1.0,
    "MOON": 13.0,
    "MERCURY": 1.2,
    "VENUS": 1.0,
    "MARS": 0.5,
    "JUPITER": 0.08,
    "SATURN": 0.03,
    "URANUS": 0.01,
    "NEPTUNE": 0.006,
    "PLUTO": 0.004,
}

SIGN_ALIASES = {
    "ARIES": "ARIES",
    "牡羊座": "ARIES",
    "おひつじ座": "ARIES",
    "TAURUS": "TAURUS",
    "牡牛座": "TAURUS",
    "おうし座": "TAURUS",
    "GEMINI": "GEMINI",
    "双子座": "GEMINI",
    "ふたご座": "GEMINI",
    "CANCER": "CANCER",
    "蟹座": "CANCER",
    "かに座": "CANCER",
    "LEO": "LEO",
    "獅子座": "LEO",
    "しし座": "LEO",
    "VIRGO": "VIRGO",
    "乙女座": "VIRGO",
    "おとめ座": "VIRGO",
    "LIBRA": "LIBRA",
    "天秤座": "LIBRA",
    "てんびん座": "LIBRA",
    "SCORPIO": "SCORPIO",
    "蠍座": "SCORPIO",
    "さそり座": "SCORPIO",
    "SAGITTARIUS": "SAGITTARIUS",
    "射手座": "SAGITTARIUS",
    "いて座": "SAGITTARIUS",
    "CAPRICORN": "CAPRICORN",
    "山羊座": "CAPRICORN",
    "やぎ座": "CAPRICORN",
    "AQUARIUS": "AQUARIUS",
    "水瓶座": "AQUARIUS",
    "みずがめ座": "AQUARIUS",
    "PISCES": "PISCES",
    "魚座": "PISCES",
    "うお座": "PISCES",
}

PRIORITY_BASIC_PLANETS = ("SUN", "MOON", "ASC")

PLANET_ALIASES = {
    "SUN": "SUN",
    "SOL": "SUN",
    "\u592a\u967d": "SUN",
    "螟ｪ髯ｽ": "SUN",
    "MOON": "MOON",
    "\u6708": "MOON",
    "譛・": "MOON",
    "MERCURY": "MERCURY",
    "\u6c34\u661f": "MERCURY",
    "豌ｴ譏・": "MERCURY",
    "VENUS": "VENUS",
    "\u91d1\u661f": "VENUS",
    "驥第弌": "VENUS",
    "MARS": "MARS",
    "\u706b\u661f": "MARS",
    "轣ｫ譏・": "MARS",
    "JUPITER": "JUPITER",
    "\u6728\u661f": "JUPITER",
    "譛ｨ譏・": "JUPITER",
    "SATURN": "SATURN",
    "\u571f\u661f": "SATURN",
    "蝨滓弌": "SATURN",
    "URANUS": "URANUS",
    "\u5929\u738b\u661f": "URANUS",
    "螟ｩ邇区弌": "URANUS",
    "NEPTUNE": "NEPTUNE",
    "\u6d77\u738b\u661f": "NEPTUNE",
    "豬ｷ邇区弌": "NEPTUNE",
    "PLUTO": "PLUTO",
    "\u51a5\u738b\u661f": "PLUTO",
    "蜀･邇区弌": "PLUTO",
    "NODE": "NODE",
    "TRUE_NODE": "NODE",
    "\u30c9\u30e9\u30b4\u30f3\u30d8\u30c3\u30c9": "NODE",
    "繝峨Λ繧ｴ繝ｳ繝倥ャ繝・": "NODE",
    "MC": "MC",
    "ASC": "ASC",
}


def _read_master_csv(path: Path) -> pd.DataFrame:
    for encoding in ("utf-8-sig", "utf-8", "cp932"):
        try:
            return pd.read_csv(path, encoding=encoding)
        except UnicodeDecodeError:
            continue
        except pd.errors.ParserError:
            repaired = _read_repaired_master_csv(path, encoding)
            if repaired is not None:
                return repaired
    return pd.read_csv(path)


def _read_repaired_master_csv(path: Path, encoding: str) -> pd.DataFrame | None:
    if path.name != "M_Aspect_Interpretation.csv":
        return None

    raw_text = path.read_text(encoding=encoding)
    lines = raw_text.splitlines()
    if not lines:
        return None

    header = lines[0].strip()
    expected_columns = len(header.split(","))
    repaired_rows: list[str] = []
    record_pattern = re.compile(r"(?=TRANSIT_[A-Z_]+,NATAL_[A-Z_]+,)")
    for line in lines[1:]:
        if not line.strip():
            continue
        fragments = [fragment.strip() for fragment in record_pattern.split(line) if fragment.strip()]
        for fragment in fragments:
            parts = fragment.split(",")
            if len(parts) == expected_columns - 1:
                parts.insert(10, "")
            repaired_rows.append(",".join(parts))

    if not repaired_rows:
        return None

    repaired_text = "\n".join([header, *repaired_rows])
    dataframe = pd.read_csv(io.StringIO(repaired_text), engine="python")
    for column in ("Aspect_Angle", "N_House", "T_Retrograde_Flag", "Score_Impact", "Priority"):
        if column in dataframe.columns:
            converted = pd.to_numeric(dataframe[column], errors="coerce")
            if not converted.isna().all():
                dataframe[column] = converted.where(~converted.isna(), dataframe[column])
    return dataframe


def load_master_dataframes() -> dict[str, pd.DataFrame]:
    masters: dict[str, pd.DataFrame] = {}
    for key, filename in MASTER_CSV_FILES.items():
        path = DATABASE_DIR / filename
        try:
            masters[key] = _read_master_csv(path)
        except Exception as exc:
            LOGGER.exception("Failed to load master CSV: %s", path)
            masters[key] = pd.DataFrame()
            masters[key].attrs["load_error"] = str(exc)
    return masters


MASTER_DATAFRAMES = load_master_dataframes()


def _normalize_planet(value: Any) -> str:
    raw = str(value or "").strip()
    if raw in PLANET_ALIASES:
        return PLANET_ALIASES[raw]
    normalized = raw.upper()
    for prefix in ("TRANSIT_", "NATAL_"):
        if normalized.startswith(prefix):
            normalized = normalized.removeprefix(prefix)
    normalized = normalized.replace(" ", "_").replace("-", "_")
    return PLANET_ALIASES.get(normalized, normalized)


def _normalize_sign(value: Any) -> str:
    raw = str(value or "").strip()
    normalized = raw.upper().replace(" ", "_").replace("-", "_")
    return SIGN_ALIASES.get(raw, SIGN_ALIASES.get(normalized, normalized))


def _normalize_orb_status(value: Any) -> str:
    return str(value or "").strip().upper()


def _normalize_trigger_id(value: Any) -> str:
    return str(value or "").strip().replace(" ", "_").replace("-", "_").upper()


def _normalize_int(value: Any) -> int | None:
    try:
        if pd.isna(value):
            return None
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _normalize_bool_flag(value: Any) -> int | None:
    if isinstance(value, bool):
        return int(value)
    normalized = str(value or "").strip().upper()
    if normalized in {"1", "TRUE", "YES", "Y", "R", "RETROGRADE"}:
        return 1
    if normalized in {"0", "FALSE", "NO", "N", "DIRECT"}:
        return 0
    return _normalize_int(value)


def _clamp(value: int | float, minimum: int, maximum: int) -> int:
    return int(max(minimum, min(maximum, round(value))))


def _safe_number(row: dict[str, Any], column: str, default: int = 0) -> int:
    return _normalize_int(row.get(column)) or default


def _safe_text(row: dict[str, Any] | None, column: str, default: str = "") -> str:
    if not row:
        return default
    value = row.get(column, default)
    if value is None or pd.isna(value):
        return default
    return str(value)


def _first_present(row: dict[str, Any], names: tuple[str, ...], default: Any = None) -> Any:
    for name in names:
        value = row.get(name)
        if value is not None and not pd.isna(value):
            return value
    return default


def _normalize_float(value: Any) -> float | None:
    try:
        if pd.isna(value):
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _series_planet_equals(series: pd.Series, planet: str) -> pd.Series:
    return series.map(_normalize_planet) == planet


def _series_sign_equals(series: pd.Series, sign: str) -> pd.Series:
    return series.map(_normalize_sign) == sign


def _series_int_equals(series: pd.Series, value: int) -> pd.Series:
    return series.map(_normalize_int) == value


def _series_bool_equals(series: pd.Series, value: bool) -> pd.Series:
    return series.map(_normalize_bool_flag) == int(value)


def _series_orb_equals(series: pd.Series, value: str) -> pd.Series:
    return series.map(_normalize_orb_status) == _normalize_orb_status(value)


def _pick_highest_priority(candidates: pd.DataFrame) -> dict[str, Any] | None:
    if candidates.empty:
        return None
    ranked = candidates.copy()
    if "Priority" in ranked.columns:
        ranked["_priority_sort"] = pd.to_numeric(ranked["Priority"], errors="coerce").fillna(0)
        ranked = ranked.sort_values("_priority_sort", ascending=False, kind="mergesort")
    return ranked.iloc[0].drop(labels=["_priority_sort"], errors="ignore").to_dict()


def get_basic_interpretation(planet: str, sign: str, house: int) -> dict[str, Any]:
    basic_df = MASTER_DATAFRAMES.get("basic", pd.DataFrame())
    if basic_df.empty:
        LOGGER.error("Basic interpretation master is empty or failed to load.")
        return {}

    required_columns = {"Planet_ID", "Sign_ID", "House_ID"}
    if not required_columns.issubset(basic_df.columns):
        LOGGER.error("Basic interpretation master is missing required columns: %s", required_columns)
        return {}

    normalized_planet = _normalize_planet(planet)
    normalized_sign = _normalize_sign(sign)
    normalized_house = _normalize_int(house)
    if normalized_house is None:
        return {}

    candidates = basic_df[
        _series_planet_equals(basic_df["Planet_ID"], normalized_planet)
        & _series_sign_equals(basic_df["Sign_ID"], normalized_sign)
        & _series_int_equals(basic_df["House_ID"], normalized_house)
    ]
    selected = _pick_highest_priority(candidates)
    return selected or {}


def build_basic_interpretations_from_chart_rows(
    planet_rows: list[list[Any]],
    angle_rows: list[list[Any]] | None = None,
) -> list[dict[str, Any]]:
    basic_rows: list[dict[str, Any]] = []
    planet_lookup: dict[str, list[Any]] = {}
    for row in planet_rows:
        if len(row) < 6:
            continue
        normalized_planet = _normalize_planet(row[0])
        if normalized_planet in PRIORITY_BASIC_PLANETS:
            planet_lookup[normalized_planet] = row

    for planet in ("SUN", "MOON"):
        row = planet_lookup.get(planet)
        if not row:
            continue
        interpretation = get_basic_interpretation(planet=planet, sign=row[2], house=row[5])
        if interpretation:
            interpretation["_source_planet"] = planet
            basic_rows.append(interpretation)

    for row in angle_rows or []:
        if len(row) < 3 or _normalize_planet(row[0]) != "ASC":
            continue
        interpretation = get_basic_interpretation(planet="ASC", sign=row[2], house=1)
        if interpretation:
            interpretation["_source_planet"] = "ASC"
            basic_rows.append(interpretation)

    return basic_rows


def get_aspect_interpretation(
    t_planet: str,
    n_planet: str,
    angle: int,
    house: int,
    is_retrograde: bool,
    orb_status: str,
) -> dict[str, Any]:
    aspect_df = MASTER_DATAFRAMES.get("aspect", pd.DataFrame())
    if aspect_df.empty:
        LOGGER.error("Aspect interpretation master is empty or failed to load.")
        return {}
    required_columns = {"T_Planet", "N_Planet", "Aspect_Angle"}
    if not required_columns.issubset(aspect_df.columns):
        LOGGER.error("Aspect interpretation master is missing required columns: %s", required_columns)
        return {}

    transit_planet = _normalize_planet(t_planet)
    natal_planet = _normalize_planet(n_planet)
    mask = (
        _series_planet_equals(aspect_df["T_Planet"], transit_planet)
        & _series_planet_equals(aspect_df["N_Planet"], natal_planet)
        & _series_int_equals(aspect_df["Aspect_Angle"], angle)
    )
    base_candidates = aspect_df[mask]
    if base_candidates.empty:
        LOGGER.info(
            "No aspect interpretation found for required conditions: %s/%s/%s",
            transit_planet,
            natal_planet,
            angle,
        )
        return {}

    optional_filters = [
        ("N_House", lambda df: _series_int_equals(df["N_House"], house)),
        ("T_Retrograde_Flag", lambda df: _series_bool_equals(df["T_Retrograde_Flag"], is_retrograde)),
        ("Orb_Status", lambda df: _series_orb_equals(df["Orb_Status"], orb_status)),
    ]
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
    available_filters = {name: condition for name, condition in optional_filters if name in base_candidates.columns}

    for filter_names in fallback_filter_sets:
        candidates = base_candidates
        for filter_name in filter_names:
            if filter_name in available_filters:
                candidates = candidates[available_filters[filter_name](candidates)]
        selected = _pick_highest_priority(candidates)
        if selected is not None:
            return selected
    return {}


def _normalize_aspect_input(aspect: dict[str, Any]) -> dict[str, Any]:
    angle = _first_present(aspect, ("angle", "Aspect_Angle", "aspect_angle", "exact_angle", "逅・ｫ冶ｧ貞ｺｦ"))
    return {
        "t_planet": _first_present(aspect, ("t_planet", "T_Planet", "transit_planet", "planet1", "螟ｩ菴・")),
        "n_planet": _first_present(aspect, ("n_planet", "N_Planet", "natal_planet", "planet2", "natal_body")),
        "angle": _normalize_int(angle),
        "house": _normalize_int(_first_present(aspect, ("house", "N_House", "natal_house"), 1)) or 1,
        "is_retrograde": bool(
            _normalize_bool_flag(
                _first_present(aspect, ("is_retrograde", "T_Retrograde_Flag", "retrograde"), False)
            )
        ),
        "orb_status": _first_present(aspect, ("orb_status", "Orb_Status"), "Applying"),
        "source": aspect,
    }


def get_all_aspect_interpretations(aspects: list[dict[str, Any]]) -> list[dict[str, Any]]:
    interpretations: list[dict[str, Any]] = []
    for aspect in aspects:
        normalized = _normalize_aspect_input(aspect)
        if not normalized["t_planet"] or not normalized["n_planet"] or normalized["angle"] is None:
            LOGGER.info("Skipping aspect with missing required fields: %s", aspect)
            continue
        interpretation = get_aspect_interpretation(
            t_planet=normalized["t_planet"],
            n_planet=normalized["n_planet"],
            angle=normalized["angle"],
            house=normalized["house"],
            is_retrograde=normalized["is_retrograde"],
            orb_status=normalized["orb_status"],
        )
        if interpretation:
            interpretation["_input"] = normalized["source"]
            interpretation["_orb_status"] = normalized["orb_status"]
            interpretations.append(interpretation)
    return interpretations


def _daily_vibe_row_matches(row: dict[str, Any], event: dict[str, Any]) -> bool:
    event_type = str(event.get("event_type", "")).strip().upper()
    target_planet = event.get("target_planet")
    condition = event.get("condition")
    if str(row.get("Event_Type", "")).strip().upper() != event_type:
        return False
    if target_planet and _normalize_planet(row.get("Target_Planet")) != _normalize_planet(target_planet):
        return False
    if condition and str(row.get("Condition", "")).strip().upper() != str(condition).strip().upper():
        return False
    return True


def _seasonal_events_for_date(target_date: date) -> list[dict[str, str]]:
    events = {
        (3, 20): {"event_type": "EQUINOX", "target_planet": "SUN", "condition": "SPRING"},
        (6, 21): {"event_type": "SOLSTICE", "target_planet": "SUN", "condition": "SUMMER"},
        (9, 23): {"event_type": "EQUINOX", "target_planet": "SUN", "condition": "AUTUMN"},
        (12, 21): {"event_type": "SOLSTICE", "target_planet": "SUN", "condition": "WINTER"},
    }
    event = events.get((target_date.month, target_date.day))
    return [event] if event else []


def get_daily_vibe_modifiers(
    current_dt: datetime | date | None = None,
    retrograde_planets: list[str] | None = None,
    event_types: list[str | dict[str, Any]] | None = None,
    moon_sign: str | None = None,
    modifier_column: str = "Work_Efficiency_Modifier",
    modifier_limit: int = DEFAULT_DAILY_VIBE_MODIFIER_LIMIT,
) -> dict[str, Any]:
    daily_df = MASTER_DATAFRAMES.get("daily_vibe", pd.DataFrame())
    if daily_df.empty:
        LOGGER.error("Daily vibe master is empty or failed to load.")
        return {"modifier": 0, "raw_modifier": 0, "items": []}

    target_date = current_dt.date() if isinstance(current_dt, datetime) else current_dt
    events: list[dict[str, Any]] = []
    for planet in retrograde_planets or []:
        events.append({"event_type": "RETROGRADE", "target_planet": planet, "condition": "START"})
    for event in event_types or []:
        events.append({"event_type": event} if isinstance(event, str) else dict(event))
    if moon_sign:
        events.append({"event_type": "MOON_SIGN", "target_planet": "MOON", "condition": moon_sign})
    if target_date:
        events.extend(_seasonal_events_for_date(target_date))

    matched_items: list[dict[str, Any]] = []
    seen_keys: set[tuple[Any, Any, Any]] = set()
    for event in events:
        for row in daily_df.to_dict("records"):
            if not _daily_vibe_row_matches(row, event):
                continue
            key = (row.get("Event_Type"), row.get("Target_Planet"), row.get("Condition"))
            if key in seen_keys:
                continue
            seen_keys.add(key)
            matched_items.append(row)

    raw_modifier = sum(_safe_number(row, modifier_column) for row in matched_items)
    return {
        "modifier": _clamp(raw_modifier, -modifier_limit, modifier_limit),
        "raw_modifier": raw_modifier,
        "items": matched_items,
    }


def _score_to_rank(score: Any) -> str:
    score_value = _normalize_int(score)
    if score_value is None:
        return "C"
    if score_value >= 90:
        return "S"
    if score_value >= 80:
        return "A"
    if score_value >= 70:
        return "B+"
    if score_value >= 60:
        return "B"
    if score_value >= 45:
        return "C"
    if score_value >= 30:
        return "D"
    return "E"


def _dashboard_header() -> dict[str, Any]:
    return {
        "brand": {"name": "Celestial Logic", "sublabel": "Transit Operations Dashboard"},
        "actions": ["History", "My Page", "Plan"],
    }


def build_dashboard_data_from_aspect(row: dict[str, Any]) -> dict[str, Any]:
    return build_dashboard_data_from_interpretations([row] if row else [], {"modifier": 0, "raw_modifier": 0, "items": []})


def _rank_to_catchcopy(rank: str) -> str:
    if rank in {"S", "A"}:
        return "追い風をつかむ日"
    if rank in {"B+", "B"}:
        return "流れを整えて前進する日"
    if rank == "C":
        return "足元を整える日"
    return "慎重に余白を守る日"


def _first_sentence(text: str, max_length: int = 140) -> str:
    normalized = str(text or "").strip()
    if not normalized:
        return ""
    for separator in ("。", "．", ".", "\n"):
        if separator in normalized:
            normalized = normalized.split(separator, 1)[0].strip()
            break
    if len(normalized) > max_length:
        return f"{normalized[:max_length].rstrip()}..."
    return normalized


def _primary_basic_row(basic_interpretations: list[dict[str, Any]]) -> dict[str, Any] | None:
    for planet in PRIORITY_BASIC_PLANETS:
        for row in basic_interpretations:
            if _normalize_planet(row.get("_source_planet", row.get("Planet_ID"))) == planet:
                return row
    return basic_interpretations[0] if basic_interpretations else None


def _strongest_topic_category(rows: list[dict[str, Any]]) -> str:
    best_by_category: dict[str, int] = {}
    for row in rows:
        category = _safe_text(row, "Category", "General")
        score = _safe_number(row, "Score_Impact")
        best_by_category[category] = max(best_by_category.get(category, -999), score)

    love_score = best_by_category.get("Love", -999)
    work_score = best_by_category.get("Work", -999)
    return "Love" if love_score > work_score else "Work"


def _apply_basic_to_hero(
    hero: dict[str, Any],
    basic_interpretations: list[dict[str, Any]] | None,
    aspect_row: dict[str, Any] | None,
    aspect_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    basic_row = _primary_basic_row(basic_interpretations or [])
    rank = _safe_text(hero, "rank", "C")
    hero["title"] = _rank_to_catchcopy(rank)
    if not basic_row:
        return hero

    category = _strongest_topic_category(aspect_rows)
    description_column = "Text_Love" if category == "Love" else "Text_Work"
    description = _safe_text(basic_row, description_column) or _safe_text(basic_row, "Text_General")
    basic_general = _first_sentence(_safe_text(basic_row, "Text_General"))
    aspect_description = _first_sentence(_safe_text(aspect_row, "Text_Description"))
    advised_task = _first_sentence(_safe_text(aspect_row, "Advised_Task"))

    hero["description"] = description
    hero["guideline"] = _safe_text(basic_row, "Text_Health")
    hero["basic"] = {
        "planet": _safe_text(basic_row, "Planet_ID"),
        "sign": _safe_text(basic_row, "Sign_ID"),
        "house": _safe_number(basic_row, "House_ID"),
        "source_planet": _safe_text(basic_row, "_source_planet", _safe_text(basic_row, "Planet_ID")),
    }
    if basic_general and aspect_description:
        hero["summary"] = (
            f"本来は{basic_general}なあなたですが、今日は{aspect_description}の影響で、"
            f"特に{advised_task or _safe_text(aspect_row, 'Category', '日々の調整')}に意識を向けると流れを活かせます。"
        )
    return hero


def _top_priority_row(rows: list[dict[str, Any]]) -> dict[str, Any]:
    return max(rows, key=lambda row: (_safe_number(row, "Priority"), _safe_number(row, "Score_Impact")))


def _build_topics_from_interpretations(rows: list[dict[str, Any]], final_score: int) -> list[dict[str, Any]]:
    best_by_category: dict[str, dict[str, Any]] = {}
    for row in rows:
        category = _safe_text(row, "Category", "General")
        current = best_by_category.get(category)
        if current is None or _safe_number(row, "Score_Impact") > _safe_number(current, "Score_Impact"):
            best_by_category[category] = row
    if not best_by_category:
        return [
            {
                "title": "General",
                "value": f"{final_score}%",
                "caption": "Daily Vibe",
                "tone": "navy",
                "description": "穏やかな日です。無理に大きく動かず、整える時間に向いています。",
                "body": "穏やかな日です。無理に大きく動かず、整える時間に向いています。",
            }
        ]
    return [
        {
            "title": category,
            "value": f"{_clamp(_safe_number(row, 'Score_Impact'), 0, 100)}%",
            "caption": "Transit Aspect",
            "tone": "gold" if _safe_number(row, "Score_Impact") >= 60 else "signal",
            "description": _safe_text(row, "Advised_Task"),
            "body": _safe_text(row, "Advised_Task"),
        }
        for category, row in best_by_category.items()
    ]


def _timeline_row_key(row: dict[str, Any]) -> tuple[str, str, int, str]:
    return (
        _safe_text(row, "T_Planet"),
        _safe_text(row, "N_Planet"),
        _safe_number(row, "Aspect_Angle"),
        _safe_text(row, "Category", "General"),
    )


def _pick_timeline_row(
    primary_rows: list[dict[str, Any]],
    fallback_rows: list[dict[str, Any]],
    slot_index: int,
    used_keys: set[tuple[str, str, int, str]],
) -> dict[str, Any] | None:
    for pool in (primary_rows, fallback_rows):
        if not pool:
            continue
        ordered = pool[slot_index:] + pool[:slot_index]
        for row in ordered:
            key = _timeline_row_key(row)
            if key not in used_keys:
                used_keys.add(key)
                return row

    pool = primary_rows or fallback_rows
    return pool[slot_index % len(pool)] if pool else None


def _build_timeline_from_interpretations(rows: list[dict[str, Any]], baseline_score: int = 50) -> list[dict[str, Any]]:
    slots = [
        {"label": "06:00 - 12:00", "title": "Morning Focus", "modifier": 8},
        {"label": "12:00 - 18:00", "title": "Afternoon Flow", "modifier": 2},
        {"label": "18:00 - 24:00", "title": "Evening Reset", "modifier": -3},
        {"label": "00:00 - 06:00", "title": "Night Recovery", "modifier": -7},
    ]
    ranked = sorted(
        rows,
        key=lambda row: (_safe_number(row, "Priority"), abs(_safe_number(row, "Score_Impact"))),
        reverse=True,
    )
    moon_rows = [row for row in ranked if _normalize_planet(row.get("T_Planet")) == "MOON"]
    used_keys: set[tuple[str, str, int, str]] = set()

    timeline: list[dict[str, Any]] = []
    for index, slot in enumerate(slots):
        row = _pick_timeline_row(moon_rows, ranked, index, used_keys)
        if not row:
            score = _clamp(baseline_score + slot["modifier"], 0, 100)
            timeline.append(
                {
                    "label": slot["label"],
                    "title": slot["title"],
                    "score": score,
                    "recommendedAction": "予定を詰め込みすぎず、整える時間を優先してください。",
                    "description": "強いアスペクトが少ないため、無理に動くよりも日常のリズムを安定させる時間帯です。",
                    "recommendation": "穏やかな調整",
                    "detail": "強いアスペクトが少ないため、無理に動くよりも日常のリズムを安定させる時間帯です。",
                }
            )
            continue

        raw_score = _safe_number(row, "Score_Impact", baseline_score)
        score = raw_score if _normalize_planet(row.get("T_Planet")) == "MOON" else raw_score + slot["modifier"]
        recommended_action = _safe_text(row, "Advised_Task")
        description = _safe_text(row, "Text_Description")
        timeline.append(
            {
                "label": slot["label"],
                "title": slot["title"],
                "score": _clamp(score, 0, 100),
                "recommendedAction": recommended_action,
                "description": description,
                "recommendation": recommended_action,
                "detail": description,
                "sourceAspect": {
                    "t_planet": _safe_text(row, "T_Planet"),
                    "n_planet": _safe_text(row, "N_Planet"),
                    "angle": _safe_number(row, "Aspect_Angle"),
                    "category": _safe_text(row, "Category", "General"),
                },
            }
        )
    return timeline


def _select_countdown_target(rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    candidates = [
        row
        for row in rows
        if _normalize_orb_status(row.get("_orb_status", row.get("Orb_Status"))) == "APPLYING"
        and _safe_number(row, "Score_Impact") > 0
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda row: (_safe_number(row, "Priority"), _safe_number(row, "Score_Impact")))


def get_countdown_master_row(trigger_id: Any) -> dict[str, Any] | None:
    normalized_trigger_id = _normalize_trigger_id(trigger_id)
    if not normalized_trigger_id:
        return None

    countdown_df = MASTER_DATAFRAMES.get("countdown", pd.DataFrame())
    if countdown_df.empty or "Trigger_ID" not in countdown_df.columns:
        LOGGER.error("Countdown master is empty, failed to load, or missing Trigger_ID.")
        return None

    matches = countdown_df[
        countdown_df["Trigger_ID"].map(_normalize_trigger_id) == normalized_trigger_id
    ]
    selected = _pick_highest_priority(matches) if not matches.empty else None
    return selected


def _extract_current_orb(row: dict[str, Any] | None) -> float:
    if not row:
        return 0.0

    source = row.get("_input") if isinstance(row.get("_input"), dict) else {}
    for candidate in (
        source.get("orb"),
        source.get("Orb"),
        source.get("orb_diff"),
        source.get("orb_difference"),
        source.get("繧ｪ繝ｼ繝門ｷｮ"),
        row.get("orb"),
        row.get("Orb"),
    ):
        value = _normalize_float(candidate)
        if value is not None:
            return abs(value)
    return 0.0


def _estimate_days_remaining(row: dict[str, Any], current_orb: float, total_days: int) -> int:
    transit_planet = _normalize_planet(row.get("T_Planet"))
    speed = AVERAGE_PLANET_SPEED_DEGREES_PER_DAY.get(transit_planet, 1.0)
    if speed <= 0:
        speed = 1.0
    return _clamp(ceil(current_orb / speed), 0, max(total_days, 0))


def build_countdown_data(countdown_target: dict[str, Any] | None) -> dict[str, Any] | None:
    if not countdown_target:
        return None

    countdown_id = _safe_text(countdown_target, "Countdown_ID")
    fallback_label = _safe_text(countdown_target, "Countdown_Label")
    current_orb = _extract_current_orb(countdown_target)
    master_row = get_countdown_master_row(countdown_id)
    if not master_row:
        title = fallback_label or "次の追い風まで"
        return {
            "title": title,
            "daysLeft": 0,
            "totalDays": DEFAULT_COUNTDOWN_TOTAL_DAYS,
            "note": title,
            "days_remaining": 0,
            "total_days": DEFAULT_COUNTDOWN_TOTAL_DAYS,
            "percent": 0,
            "trigger_id": countdown_id,
            "countdown_id": countdown_id,
            "fallback_label": fallback_label,
            "current_orb": current_orb,
            "target": countdown_target,
        }

    threshold_orb = (
        _normalize_float(master_row.get("Threshold_Orb"))
        or DEFAULT_COUNTDOWN_THRESHOLD_ORB
    )
    total_days = (
        _normalize_int(master_row.get("Max_Progress_Days"))
        or _normalize_int(master_row.get("Progress_Max_Days"))
        or DEFAULT_COUNTDOWN_TOTAL_DAYS
    )
    percent = 100 - ((current_orb / threshold_orb) * 100) if threshold_orb > 0 else 100
    progress_percent = _clamp(percent, 0, 100)
    days_remaining = _estimate_days_remaining(countdown_target, current_orb, total_days)
    title_column = "Arrival_Text" if current_orb <= 0.5 else "Display_Title"
    title = _safe_text(master_row, title_column, _safe_text(master_row, "Display_Title", fallback_label))
    note = _safe_text(master_row, "Next_Action_Hint")

    return {
        "title": title,
        "daysLeft": days_remaining,
        "totalDays": total_days,
        "note": note,
        "days_remaining": days_remaining,
        "total_days": total_days,
        "percent": progress_percent,
        "trigger_id": _safe_text(master_row, "Trigger_ID", countdown_id),
        "countdown_id": countdown_id,
        "fallback_label": fallback_label,
        "current_orb": current_orb,
        "threshold_orb": threshold_orb,
        "arrival_text": _safe_text(master_row, "Arrival_Text"),
        "display_title": _safe_text(master_row, "Display_Title"),
        "target": countdown_target,
    }


TIMELINE_SLOT_DEFS = [
    {"id": "MORNING", "label": "06:00 - 12:00 (Morning)", "time_range": "06:00-12:00", "sample_hour": 9},
    {"id": "AFTERNOON", "label": "12:00 - 18:00 (Afternoon)", "time_range": "12:00-18:00", "sample_hour": 15},
    {"id": "EVENING", "label": "18:00 - 24:00 (Evening)", "time_range": "18:00-24:00", "sample_hour": 21},
    {"id": "NIGHT", "label": "00:00 - 06:00 (Night)", "time_range": "00:00-06:00", "sample_hour": 3},
]


def _timeline_advice_rows() -> pd.DataFrame:
    return MASTER_DATAFRAMES.get("timeline_advice", pd.DataFrame())


def _timeline_target_score(slot_id: str) -> int:
    advice_df = _timeline_advice_rows()
    if advice_df.empty:
        return 50
    slot_rows = advice_df[
        advice_df["Time_Slot_ID"].map(lambda value: str(value).strip().upper()) == slot_id.upper()
    ]
    if slot_rows.empty:
        return 50
    return _normalize_int(slot_rows.iloc[0].get("Target_Score")) or 50


def _get_timeline_advice(slot_id: str, final_score: int) -> dict[str, Any]:
    fallback = {
        "Target_Score": 50,
        "Condition": "MATCH",
        "Status_Label": "安定推移",
        "Action_Type": "Focus",
        "Recommended_Action": "勢いを上げすぎず、目の前の流れを整えてください。",
    }
    advice_df = _timeline_advice_rows()
    if advice_df.empty:
        return fallback

    slot_rows = advice_df[
        advice_df["Time_Slot_ID"].map(lambda value: str(value).strip().upper()) == slot_id.upper()
    ]
    if slot_rows.empty:
        return fallback

    target_score = _normalize_int(slot_rows.iloc[0].get("Target_Score")) or 50
    delta = final_score - target_score
    over_row = slot_rows[slot_rows["Condition"].map(lambda value: str(value).strip().upper()) == "OVER"]
    under_row = slot_rows[slot_rows["Condition"].map(lambda value: str(value).strip().upper()) == "UNDER"]
    match_row = slot_rows[slot_rows["Condition"].map(lambda value: str(value).strip().upper()) == "MATCH"]

    if not over_row.empty and delta >= (_normalize_int(over_row.iloc[0].get("Condition_Threshold")) or 999):
        return dict(over_row.iloc[0])
    if not under_row.empty and delta <= (_normalize_int(under_row.iloc[0].get("Condition_Threshold")) or -999):
        return dict(under_row.iloc[0])
    if not match_row.empty:
        return dict(match_row.iloc[0])
    return dict(slot_rows.iloc[0])


def _build_natal_planet_rows(birth_input: BirthInput) -> list[dict[str, Any]]:
    chart_rows = build_chart_rows(birth_input)
    natal_rows: list[dict[str, Any]] = []
    for row in chart_rows["planets"]:
        if len(row) < 6:
            continue
        longitude = _normalize_float(row[1])
        if longitude is None:
            continue
        natal_rows.append(
            {
                "planet": _normalize_planet(row[0]),
                "longitude": longitude,
                "house": _normalize_int(row[5]) or 1,
            }
        )
    return natal_rows


def _local_sample_datetime(target_date: date, sample_hour: int) -> datetime:
    return datetime.combine(target_date, dt_time(hour=sample_hour))


def _calc_transit_moon_state(sample_local_dt: datetime, timezone_offset: float) -> tuple[float, bool]:
    if swe is None:
        raise RuntimeError("swisseph is not installed")
    utc_dt = sample_local_dt - timedelta(hours=timezone_offset)
    hour_decimal = utc_dt.hour + (utc_dt.minute / 60) + (utc_dt.second / 3600)
    jd = swe.julday(utc_dt.year, utc_dt.month, utc_dt.day, hour_decimal)
    result = swe.calc_ut(jd, swe.MOON, swe.FLG_SPEED)
    return float(result[0][0]), float(result[0][3]) < 0


def _classify_orb_status(
    sample_local_dt: datetime,
    timezone_offset: float,
    natal_longitude: float,
    exact_angle: int,
) -> str:
    current_longitude, _ = _calc_transit_moon_state(sample_local_dt, timezone_offset)
    future_longitude, _ = _calc_transit_moon_state(sample_local_dt + timedelta(hours=1), timezone_offset)
    current_deviation = abs(get_angle_diff(current_longitude, natal_longitude) - exact_angle)
    future_deviation = abs(get_angle_diff(future_longitude, natal_longitude) - exact_angle)
    return "Applying" if future_deviation < current_deviation else "Separating"


def _build_slot_interpretations(
    birth_input: BirthInput,
    slot_def: dict[str, Any],
    target_date: date,
) -> list[dict[str, Any]]:
    natal_rows = _build_natal_planet_rows(birth_input)
    sample_local_dt = _local_sample_datetime(target_date, slot_def["sample_hour"])
    transit_longitude, is_retrograde = _calc_transit_moon_state(sample_local_dt, birth_input.timezone_offset)
    slot_rows: list[dict[str, Any]] = []
    for natal_row in natal_rows:
        angle_diff = get_angle_diff(transit_longitude, natal_row["longitude"])
        _, exact_angle, orb_diff = get_aspect(angle_diff)
        if exact_angle is None:
            continue
        orb_status = _classify_orb_status(
            sample_local_dt,
            birth_input.timezone_offset,
            natal_row["longitude"],
            exact_angle,
        )
        interpretation = get_aspect_interpretation(
            t_planet="MOON",
            n_planet=natal_row["planet"],
            angle=exact_angle,
            house=natal_row["house"],
            is_retrograde=is_retrograde,
            orb_status=orb_status,
        )
        if not interpretation:
            continue
        interpretation = dict(interpretation)
        interpretation["_input"] = {
            "t_planet": "MOON",
            "n_planet": natal_row["planet"],
            "angle": exact_angle,
            "house": natal_row["house"],
            "orb": orb_diff,
            "sample_time": sample_local_dt.strftime("%H:%M"),
            "time_slot_id": slot_def["id"],
        }
        interpretation["_orb_status"] = orb_status
        slot_rows.append(interpretation)
    return slot_rows


def _build_timeline_slot_from_rows(
    slot_def: dict[str, Any],
    slot_rows: list[dict[str, Any]],
    fallback_row: dict[str, Any] | None = None,
) -> dict[str, Any]:
    target_score = _timeline_target_score(slot_def["id"])
    total_impact = sum(_safe_number(row, "Score_Impact") for row in slot_rows)
    final_score = _clamp(target_score + total_impact, 0, 100)
    dominant_candidates = slot_rows or ([fallback_row] if fallback_row else [])
    dominant_row = (
        max(
            dominant_candidates,
            key=lambda row: (_safe_number(row, "Score_Impact"), _safe_number(row, "Priority")),
        )
        if dominant_candidates
        else None
    )
    advice_row = _get_timeline_advice(slot_def["id"], final_score)
    aspect_action = _safe_text(dominant_row, "Advised_Task")
    advice_action = _safe_text(advice_row, "Recommended_Action")
    combined_description = " ".join(part for part in [aspect_action, advice_action] if part).strip()
    detail = _safe_text(dominant_row, "Text_Description", combined_description or advice_action)

    LOGGER.info(
        "Timeline score: slot=%s target=%s impact=%s final=%s condition=%s",
        slot_def["id"],
        target_score,
        total_impact,
        final_score,
        _safe_text(advice_row, "Condition", "MATCH"),
    )

    return {
        "label": slot_def["label"],
        "title": _safe_text(advice_row, "Status_Label", slot_def["id"]),
        "score": final_score,
        "recommendedAction": aspect_action or advice_action,
        "description": combined_description or advice_action,
        "recommendation": aspect_action or advice_action,
        "detail": detail,
        "statusLabel": _safe_text(advice_row, "Status_Label"),
        "actionType": _safe_text(advice_row, "Action_Type"),
        "condition": _safe_text(advice_row, "Condition", "MATCH"),
        "targetScore": target_score,
        "scoreImpactTotal": total_impact,
        "sourceAspect": {
            "t_planet": _safe_text(dominant_row, "T_Planet"),
            "n_planet": _safe_text(dominant_row, "N_Planet"),
            "angle": _safe_number(dominant_row or {}, "Aspect_Angle"),
            "category": _safe_text(dominant_row, "Category", "General"),
        },
    }


def _build_timeline_from_interpretations(
    rows: list[dict[str, Any]],
    baseline_score: int = 50,
    birth_input: BirthInput | None = None,
    current_dt: datetime | date | None = None,
) -> list[dict[str, Any]]:
    ranked = sorted(
        rows,
        key=lambda row: (_safe_number(row, "Priority"), abs(_safe_number(row, "Score_Impact"))),
        reverse=True,
    )

    if birth_input is not None and swe is not None:
        target_date = current_dt.date() if isinstance(current_dt, datetime) else current_dt or date.today()
        used_keys: set[tuple[str, str, int, str]] = set()
        timeline: list[dict[str, Any]] = []
        for index, slot_def in enumerate(TIMELINE_SLOT_DEFS):
            slot_rows = _build_slot_interpretations(birth_input, slot_def, target_date)
            fallback_row = _pick_timeline_row(slot_rows, ranked, index, used_keys)
            timeline.append(_build_timeline_slot_from_rows(slot_def, slot_rows, fallback_row))
        return timeline

    moon_rows = [row for row in ranked if _normalize_planet(row.get("T_Planet")) == "MOON"]
    used_keys: set[tuple[str, str, int, str]] = set()
    timeline: list[dict[str, Any]] = []
    for index, slot_def in enumerate(TIMELINE_SLOT_DEFS):
        row = _pick_timeline_row(moon_rows, ranked, index, used_keys)
        fallback_row = row or _pick_timeline_row([], ranked, index, used_keys)
        slot_rows = [row] if row else []
        timeline.append(_build_timeline_slot_from_rows(slot_def, slot_rows, fallback_row))
    return timeline


def build_dashboard_data_from_interpretations(
    interpretations: list[dict[str, Any]],
    daily_vibe: dict[str, Any],
    basic_interpretations: list[dict[str, Any]] | None = None,
    birth_input: BirthInput | None = None,
    current_dt: datetime | date | None = None,
) -> dict[str, Any]:
    daily_modifier = _safe_number(daily_vibe, "modifier")
    if not interpretations:
        final_score = _clamp(50 + daily_modifier, 0, 100)
        hero = {
            "rank": _score_to_rank(final_score),
            "score": final_score,
            "title": "Today Overview",
            "guidance": "穏やかな日です。予定を詰め込みすぎず、余白を保つほど安定します。",
            "summary": "大きな衝突や追い風は控えめです。整える、確認する、休むといった基本動作が今日の運勢を底上げします。",
        }
        hero = _apply_basic_to_hero(hero, basic_interpretations, None, [])
        return {
            "header": _dashboard_header(),
            "hero": hero,
            "countdown": None,
            "timeline": _build_timeline_from_interpretations([], final_score, birth_input=birth_input, current_dt=current_dt),
            "topics": _build_topics_from_interpretations([], final_score),
            "premium": {"title": "Premium AI Preview", "description": "", "placeholder": "", "preview": ""},
            "aspect_interpretations": [],
            "basic_interpretations": basic_interpretations or [],
            "daily_vibe": daily_vibe,
        }

    average_score = sum(_safe_number(row, "Score_Impact") for row in interpretations) / len(interpretations)
    final_score = _clamp(average_score + daily_modifier, 0, 100)
    hero_row = _top_priority_row(interpretations)
    countdown_target = _select_countdown_target(interpretations)
    countdown_data = build_countdown_data(countdown_target)
    hero = {
        "rank": _score_to_rank(final_score),
        "score": final_score,
        "title": "Today Overview",
        "guidance": _safe_text(hero_row, "Advised_Task"),
        "summary": _safe_text(hero_row, "Text_Description"),
    }
    hero = _apply_basic_to_hero(hero, basic_interpretations, hero_row, interpretations)
    return {
        "header": _dashboard_header(),
        "hero": hero,
        "countdown": countdown_data,
        "timeline": _build_timeline_from_interpretations(
            interpretations,
            final_score,
            birth_input=birth_input,
            current_dt=current_dt,
        ),
        "topics": _build_topics_from_interpretations(interpretations, final_score),
        "premium": {
            "title": "Premium AI Preview",
            "description": "複数のトランジット条件と日運補正を組み合わせた追加解釈を提供します。",
            "placeholder": "例：今日、仕事と恋愛どちらにリソースを割くべき？",
            "preview": _safe_text(hero_row, "Text_Description"),
        },
        "aspect_interpretations": interpretations,
        "basic_interpretations": basic_interpretations or [],
        "daily_vibe": daily_vibe,
    }


def build_dashboard_data_from_aspects(
    aspects: list[dict[str, Any]],
    current_dt: datetime | date | None = None,
    retrograde_planets: list[str] | None = None,
    event_types: list[str | dict[str, Any]] | None = None,
    moon_sign: str | None = None,
    basic_interpretations: list[dict[str, Any]] | None = None,
    birth_input: BirthInput | None = None,
) -> dict[str, Any]:
    interpretations = get_all_aspect_interpretations(aspects)
    daily_vibe = get_daily_vibe_modifiers(
        current_dt=current_dt,
        retrograde_planets=retrograde_planets,
        event_types=event_types,
        moon_sign=moon_sign,
    )
    return build_dashboard_data_from_interpretations(
        interpretations,
        daily_vibe,
        basic_interpretations,
        birth_input=birth_input,
        current_dt=current_dt,
    )


def build_aspect_inputs_from_chart_rows(aspect_rows: list[list[Any]]) -> list[dict[str, Any]]:
    inputs: list[dict[str, Any]] = []
    for row in aspect_rows:
        if len(row) < 7:
            continue
        inputs.append(
            {
                "planet1": row[0],
                "planet2": row[1],
                "angle": row[6],
                "orb_status": "Applying",
                "house": 1,
                "is_retrograde": False,
                "orb": row[7] if len(row) > 7 else None,
            }
        )
    return inputs


def extract_retrograde_planets_from_chart_rows(planet_rows: list[list[Any]]) -> list[str]:
    retrograde_planets: list[str] = []
    direct_labels = {"DIRECT", "D", "-", "", "鬆・｡・"}
    for row in planet_rows:
        if len(row) < 5:
            continue
        motion = str(row[4] or "").strip().upper()
        if motion in direct_labels:
            continue
        if "RETRO" in motion or motion == "R" or motion not in direct_labels:
            retrograde_planets.append(str(row[0]))
    return retrograde_planets


def get_aspect_dashboard_data(
    t_planet: str,
    n_planet: str,
    angle: int,
    house: int,
    is_retrograde: bool,
    orb_status: str,
) -> dict[str, Any]:
    interpretation = get_aspect_interpretation(
        t_planet=t_planet,
        n_planet=n_planet,
        angle=angle,
        house=house,
        is_retrograde=is_retrograde,
        orb_status=orb_status,
    )
    return build_dashboard_data_from_aspect(interpretation)


def generate_readings(payload: ReadingRequest) -> ReadingResponse:
    timezone_offset = payload.timezone_offset
    if timezone_offset is None:
        if not payload.timezone_name:
            raise ValueError("timezone information is missing")
        from backend.app.services.geocoding_service import resolve_timezone_offset

        timezone_offset, _ = resolve_timezone_offset(
            timezone_name=payload.timezone_name,
            birth_date=payload.birth_date.isoformat(),
            birth_time=payload.birth_time.strftime("%H:%M") if payload.birth_time else None,
            birth_time_unknown=payload.birth_time_unknown,
        )

    birth_input = BirthInput(
        full_name=payload.full_name,
        birth_date=payload.birth_date.isoformat(),
        birth_time=payload.birth_time.strftime("%H:%M") if payload.birth_time else "",
        birth_time_unknown=payload.birth_time_unknown,
        birthplace=payload.birthplace,
        latitude=payload.latitude,
        longitude=payload.longitude,
        timezone_offset=timezone_offset,
    )

    chart_rows = build_chart_rows(birth_input)
    dashboard_data = build_dashboard_data_from_aspects(
        aspects=build_aspect_inputs_from_chart_rows(chart_rows["aspects"]),
        current_dt=datetime.now(),
        retrograde_planets=extract_retrograde_planets_from_chart_rows(chart_rows["planets"]),
        basic_interpretations=build_basic_interpretations_from_chart_rows(
            chart_rows["planets"],
            chart_rows["angles"],
        ),
        birth_input=birth_input,
    )

    with TemporaryDirectory(prefix="chart_run_") as tmp:
        temp_dir = Path(tmp)
        files = write_chart_csvs(chart_rows, temp_dir)
        chart_data = build_natal_chart_data(files["planets"], files["angles"], files["houses"])
        transit_data = load_transit_support_data(files["aspects"], files["houses"])
        report_text = generate_report_from_csvs(
            planets_file=files["planets"],
            angles_file=files["angles"],
            aspects_file=files["aspects"],
        )

    return ReadingResponse(
        meta=ReadingMeta(
            full_name=payload.full_name,
            birthplace=payload.birthplace,
            birth_date=payload.birth_date.isoformat(),
            birth_time=payload.birth_time.strftime("%H:%M") if payload.birth_time else UNKNOWN_BIRTH_TIME_LABEL,
            birth_time_unknown=payload.birth_time_unknown,
            timezone_offset=timezone_offset,
            timezone_name=payload.timezone_name,
        ),
        chart_data=chart_data,
        readings=[ReadingSection(type=REPORT_TYPE, title=REPORT_TITLE, content=report_text)],
        transit_ready=bool(transit_data.get("aspect_map")) and bool(transit_data.get("house_map")),
        dashboard_data=dashboard_data,
    )
