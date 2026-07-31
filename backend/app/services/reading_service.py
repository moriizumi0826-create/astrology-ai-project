import io
import logging
import re
import sys
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import date, datetime, time as dt_time, timedelta
from math import ceil, isfinite
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Lock
from typing import Any, Iterator
from zoneinfo import ZoneInfo

import pandas as pd

from backend.app.schemas import ReadingMeta, ReadingRequest, ReadingResponse, ReadingSection
from backend.app.services.chart_calculator import (
    ASPECT_DEFS,
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
LUNAR_COUNTDOWN_STEP_HOURS = 2
LUNAR_COUNTDOWN_HORIZON_DAYS = 32
COUNTDOWN_ASPECT_ANGLES = (0, 60, 90, 120, 150, 180)

LOGGER = logging.getLogger(__name__)
DATABASE_DIR = PROJECT_ROOT / "database"
APP_TIMEZONE = ZoneInfo("Asia/Tokyo")

_TRANSIT_MOTION_REQUEST_CACHE: ContextVar[
    dict[tuple[str, datetime, float], tuple[float, float]] | None
] = ContextVar("transit_motion_request_cache", default=None)
_COUNTDOWN_ORB_REQUEST_CACHE: ContextVar[
    dict[tuple[str, datetime, float, float, int], tuple[float, bool]] | None
] = ContextVar("countdown_orb_request_cache", default=None)
_NATAL_DATA_REQUEST_CACHE: ContextVar[dict[tuple[str, tuple[Any, ...]], Any] | None] = ContextVar(
    "natal_data_request_cache",
    default=None,
)

MASTER_CSV_FILES = {
    "basic": "M_Basic_Interpretation.csv",
    "daily_vibe": "M_Daily_Vibe_Logic.csv",
    "daily_star_vibe": "M_Daily_Star_Vibe.csv",
    "daily_performance_action_advice": "M_Daily_Performance_Action_Advice.csv",
    "countdown": "M_Countdown_Master.csv",
    "transit_calendar": "M_Transit_Calendar_2026.csv",
    "retrograde_calendar": "M_Retrograde_Calendar.generated.csv",
}

ASPECT_MASTER_CSV_FILES = [
    "M_Aspect_Interpretation sun,moon.csv",
    "M_Aspect_Interpretation venus,mars.csv",
    "M_Aspect_Interpretation mercury.csv",
    "M_Aspect_Interpretation jupiter,uranus.csv",
    "M_Aspect_Interpretation neptune,pluto.csv",
]

ASPECT_GENRE_DESCRIPTION_COLUMNS = {
    "love": "Love_Text_Description",
    "work": "Work_Text_Description",
    "money": "Money_Text_Description",
}
ASPECT_GENRE_SCORE_IMPACT_COLUMNS = {
    "love": "Love_Score_Impact",
    "work": "Work_Score_Impact",
    "money": "Money_Score_Impact",
}
ASPECT_GENRE_DUAL_SCORE_COLUMNS = {
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
ASPECT_GENRE_REPRESENTATIVE_ELEMENT_ORDER = {
    "FIRE": 0,
    "EARTH": 1,
    "AIR": 2,
    "WATER": 3,
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

TRANSIT_PLANET_ORDER = (
    "SUN",
    "MOON",
    "MERCURY",
    "VENUS",
    "MARS",
    "JUPITER",
    "SATURN",
    "URANUS",
    "NEPTUNE",
    "PLUTO",
)
MOTION_INDICATOR_PLANETS = (
    "MERCURY",
    "VENUS",
    "MARS",
    "JUPITER",
    "SATURN",
    "URANUS",
    "NEPTUNE",
    "PLUTO",
)
PLANET_MOTION_LABELS = {
    "MERCURY": "\u6c34\u661f",
    "VENUS": "\u91d1\u661f",
    "MARS": "\u706b\u661f",
    "JUPITER": "\u6728\u661f",
    "SATURN": "\u571f\u661f",
    "URANUS": "\u5929\u738b\u661f",
    "NEPTUNE": "\u6d77\u738b\u661f",
    "PLUTO": "\u51a5\u738b\u661f",
}
PLANET_STATION_SPEED_THRESHOLDS = {
    "MERCURY": 0.05,
    "VENUS": 0.03,
    "MARS": 0.02,
    "JUPITER": 0.005,
    "SATURN": 0.003,
}
STATIONARY_LOOKAHEAD_DAYS = 3
MOTION_CHANGE_LOOKAHEAD_DAYS = 800
CELESTIAL_EVENT_HORIZON_DAYS = 30
CELESTIAL_EVENT_ASPECT_ANGLES = (0, 90, 180)
CELESTIAL_SIGN_LABELS = (
    "牡羊座", "牡牛座", "双子座", "蟹座", "獅子座", "乙女座",
    "天秤座", "蠍座", "射手座", "山羊座", "水瓶座", "魚座",
)
CELESTIAL_EVENT_PLANET_PRIORITY = {
    "SUN": 10, "MOON": 4, "MERCURY": 6, "VENUS": 7, "MARS": 8,
    "JUPITER": 9, "SATURN": 10, "URANUS": 10, "NEPTUNE": 10, "PLUTO": 10,
}

COUNTDOWN_SHORT_PLANETS = {"MOON", "SUN", "MERCURY", "VENUS", "MARS"}
COUNTDOWN_LONG_PLANETS = {"JUPITER", "SATURN", "URANUS", "NEPTUNE", "PLUTO"}
PRESSURE_COUNTDOWN_TRANSIT_PLANETS = {
    "MOON", "SUN", "MERCURY", "VENUS", "MARS",
    "SATURN", "URANUS", "NEPTUNE", "PLUTO",
}
PRESSURE_COUNTDOWN_SCORE_THRESHOLD = -22
PRESSURE_COUNTDOWN_PLANET_THRESHOLDS = {"NEPTUNE": -28}
PERSONAL_READING_TRANSIT_PLANETS = {"MOON", "MERCURY", "VENUS", "MARS"}
COUNTDOWN_PRIORITY_BANDS = {
    "high": {"label": "高", "min": 8, "max": None},
    "middle": {"label": "中", "min": 5, "max": 7},
    "low": {"label": "低", "min": None, "max": 4},
}

SIGN_ALIASES = {
    "ARIES": "ARIES",
    "\u7261\u7f8a\u5ea7": "ARIES",
    "迚｡鄒雁ｺｧ": "ARIES",
    "縺翫・縺､縺伜ｺｧ": "ARIES",
    "TAURUS": "TAURUS",
    "\u7261\u725b\u5ea7": "TAURUS",
    "迚｡迚帛ｺｧ": "TAURUS",
    "縺翫≧縺怜ｺｧ": "TAURUS",
    "GEMINI": "GEMINI",
    "\u53cc\u5b50\u5ea7": "GEMINI",
    "蜿悟ｭ仙ｺｧ": "GEMINI",
    "縺ｵ縺溘＃蠎ｧ": "GEMINI",
    "CANCER": "CANCER",
    "\u87f9\u5ea7": "CANCER",
    "陝ｹ蠎ｧ": "CANCER",
    "縺九↓蠎ｧ": "CANCER",
    "LEO": "LEO",
    "\u7345\u5b50\u5ea7": "LEO",
    "迯・ｭ仙ｺｧ": "LEO",
    "縺励＠蠎ｧ": "LEO",
    "VIRGO": "VIRGO",
    "\u4e59\u5973\u5ea7": "VIRGO",
    "荵吝･ｳ蠎ｧ": "VIRGO",
    "縺翫→繧∝ｺｧ": "VIRGO",
    "LIBRA": "LIBRA",
    "\u5929\u79e4\u5ea7": "LIBRA",
    "螟ｩ遘､蠎ｧ": "LIBRA",
    "縺ｦ繧薙・繧灘ｺｧ": "LIBRA",
    "SCORPIO": "SCORPIO",
    "\u880d\u5ea7": "SCORPIO",
    "陟榊ｺｧ": "SCORPIO",
    "縺輔◎繧雁ｺｧ": "SCORPIO",
    "SAGITTARIUS": "SAGITTARIUS",
    "\u5c04\u624b\u5ea7": "SAGITTARIUS",
    "蟆・焔蠎ｧ": "SAGITTARIUS",
    "縺・※蠎ｧ": "SAGITTARIUS",
    "CAPRICORN": "CAPRICORN",
    "\u5c71\u7f8a\u5ea7": "CAPRICORN",
    "螻ｱ鄒雁ｺｧ": "CAPRICORN",
    "繧・℃蠎ｧ": "CAPRICORN",
    "AQUARIUS": "AQUARIUS",
    "\u6c34\u74f6\u5ea7": "AQUARIUS",
    "豌ｴ逑ｶ蠎ｧ": "AQUARIUS",
    "縺ｿ縺壹′繧∝ｺｧ": "AQUARIUS",
    "PISCES": "PISCES",
    "\u9b5a\u5ea7": "PISCES",
    "鬲壼ｺｧ": "PISCES",
    "縺・♀蠎ｧ": "PISCES",
}

PRIORITY_BASIC_PLANETS = ("SUN", "MOON", "ASC")

PLANET_ALIASES = {
    "SUN": "SUN",
    "SOL": "SUN",
    "\u592a\u967d": "SUN",
    "陞滂ｽｪ鬮ｯ・ｽ": "SUN",
    "MOON": "MOON",
    "\u6708": "MOON",
    "隴帙・": "MOON",
    "MERCURY": "MERCURY",
    "\u6c34\u661f": "MERCURY",
    "雎鯉ｽｴ隴上・": "MERCURY",
    "VENUS": "VENUS",
    "\u91d1\u661f": "VENUS",
    "鬩･隨ｬ蠑・": "VENUS",
    "MARS": "MARS",
    "\u706b\u661f": "MARS",
    "霓｣・ｫ隴上・": "MARS",
    "JUPITER": "JUPITER",
    "\u6728\u661f": "JUPITER",
    "隴幢ｽｨ隴上・": "JUPITER",
    "SATURN": "SATURN",
    "\u571f\u661f": "SATURN",
    "陜ｨ貊灘ｼ・": "SATURN",
    "URANUS": "URANUS",
    "\u5929\u738b\u661f": "URANUS",
    "陞滂ｽｩ驍・玄蠑・": "URANUS",
    "NEPTUNE": "NEPTUNE",
    "\u6d77\u738b\u661f": "NEPTUNE",
    "雎ｬ・ｷ驍・玄蠑・": "NEPTUNE",
    "PLUTO": "PLUTO",
    "\u51a5\u738b\u661f": "PLUTO",
    "陷・･驍・玄蠑・": "PLUTO",
    "NODE": "NODE",
    "TRUE_NODE": "NODE",
    "\u30c9\u30e9\u30b4\u30f3\u30d8\u30c3\u30c9": "NODE",
    "郢晏ｳｨﾎ帷ｹｧ・ｴ郢晢ｽｳ郢晏･繝｣郢昴・": "NODE",
    "MC": "MC",
    "ASC": "ASC",
}


def _read_master_csv(path: Path) -> pd.DataFrame:
    for encoding in ("utf-8-sig", "utf-8", "cp932"):
        try:
            return pd.read_csv(path, encoding=encoding, low_memory=False)
        except UnicodeDecodeError:
            continue
        except pd.errors.ParserError:
            repaired = _read_repaired_master_csv(path, encoding)
            if repaired is not None:
                return repaired
    return pd.read_csv(path)


def _attach_source_metadata(dataframe: pd.DataFrame, path: Path) -> pd.DataFrame:
    if dataframe.empty:
        dataframe = dataframe.copy()
    else:
        dataframe = dataframe.copy()
    dataframe["_csv_file"] = path.name
    dataframe["_csv_row"] = dataframe.index + 2
    return dataframe


def _read_repaired_master_csv(path: Path, encoding: str) -> pd.DataFrame | None:
    if not path.name.startswith("M_Aspect_Interpretation") or path.suffix.lower() != ".csv":
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
            masters[key] = _attach_source_metadata(_read_master_csv(path), path)
        except Exception as exc:
            LOGGER.exception("Failed to load master CSV: %s", path)
            masters[key] = pd.DataFrame()
            masters[key].attrs["load_error"] = str(exc)
    aspect_frames: list[pd.DataFrame] = []
    aspect_errors: list[str] = []
    for filename in ASPECT_MASTER_CSV_FILES:
        path = DATABASE_DIR / filename
        generated_path = path.with_suffix(".generated.csv")
        candidate_path = generated_path if generated_path.exists() else path
        try:
            aspect_frames.append(_attach_source_metadata(_read_master_csv(candidate_path), candidate_path))
        except Exception as exc:
            LOGGER.exception("Failed to load master CSV: %s", candidate_path)
            aspect_errors.append(f"{candidate_path.name}: {exc}")

    if aspect_frames:
        masters["aspect"] = pd.concat(aspect_frames, ignore_index=True)
    else:
        masters["aspect"] = pd.DataFrame()
        if aspect_errors:
            masters["aspect"].attrs["load_error"] = "; ".join(aspect_errors)
    return masters


def _master_csv_paths() -> list[Path]:
    paths = [DATABASE_DIR / filename for filename in MASTER_CSV_FILES.values()]
    paths.extend(DATABASE_DIR / filename for filename in ASPECT_MASTER_CSV_FILES)
    return paths


def master_csv_paths_for_version() -> list[Path]:
    paths = [DATABASE_DIR / filename for filename in MASTER_CSV_FILES.values()]
    for filename in ASPECT_MASTER_CSV_FILES:
        path = DATABASE_DIR / filename
        generated_path = path.with_suffix(".generated.csv")
        paths.append(generated_path if generated_path.exists() else path)
    return paths


def _csv_file_signature(paths: list[Path]) -> tuple[tuple[str, int | None, int | None], ...]:
    signature = []
    for path in paths:
        if path.exists():
            stat = path.stat()
            signature.append((str(path), stat.st_mtime_ns, stat.st_size))
        else:
            signature.append((str(path), None, None))
    return tuple(signature)


MASTER_DATAFRAMES = load_master_dataframes()
_MASTER_CSV_SIGNATURE = _csv_file_signature(_master_csv_paths())
_ASPECT_CANDIDATES_BY_KEY: dict[tuple[str, str, int], list[dict[str, Any]]] | None = None
_ASPECT_GENRE_DESCRIPTION_LOOKUP: dict[tuple[str, str, int, int], dict[str, str]] | None = None
_ASPECT_GENRE_SCORE_IMPACT_LOOKUP: dict[tuple[str, str, int, int], dict[str, float | None]] | None = None
_ASPECT_GENRE_DUAL_SCORE_LOOKUP: dict[
    tuple[str, str, int, int], dict[str, dict[str, float | None]]
] | None = None
_MASTER_TIMELINE_ADVISE_LOOKUP: dict[tuple[Any, ...], str] | None = None
_MASTER_PRESSURE_SCORE_LOOKUP: dict[tuple[Any, ...], float] | None = None
_COUNTDOWN_MASTER_LOOKUP: dict[str, dict[str, Any]] | None = None
_TRANSIT_RETROGRADE_START_DATES_BY_PLANET: dict[str, tuple[date, ...]] | None = None
_RETROGRADE_CALENDAR_INDEX: dict[
    tuple[str, str], tuple[tuple[date, dict[str, Any]], ...]
] | None = None
_ASPECT_INTERPRETATION_CACHE: dict[tuple[str, str, int, int, bool, str], dict[str, Any]] = {}
_ASPECT_MASTER_INDEX_LOCK = Lock()


def reload_master_dataframes_if_changed(force: bool = False) -> bool:
    global MASTER_DATAFRAMES, _MASTER_CSV_SIGNATURE, _ASPECT_CANDIDATES_BY_KEY
    global _ASPECT_GENRE_DESCRIPTION_LOOKUP, _ASPECT_GENRE_SCORE_IMPACT_LOOKUP
    global _ASPECT_GENRE_DUAL_SCORE_LOOKUP
    global _MASTER_TIMELINE_ADVISE_LOOKUP, _MASTER_PRESSURE_SCORE_LOOKUP, _COUNTDOWN_MASTER_LOOKUP
    global _TRANSIT_RETROGRADE_START_DATES_BY_PLANET, _RETROGRADE_CALENDAR_INDEX
    current_signature = _csv_file_signature(_master_csv_paths())
    if not force and current_signature == _MASTER_CSV_SIGNATURE:
        return False
    reloaded_dataframes = load_master_dataframes()
    with _ASPECT_MASTER_INDEX_LOCK:
        MASTER_DATAFRAMES = reloaded_dataframes
        _MASTER_CSV_SIGNATURE = current_signature
        _ASPECT_CANDIDATES_BY_KEY = None
        _ASPECT_GENRE_DESCRIPTION_LOOKUP = None
        _ASPECT_GENRE_SCORE_IMPACT_LOOKUP = None
        _ASPECT_GENRE_DUAL_SCORE_LOOKUP = None
        _MASTER_TIMELINE_ADVISE_LOOKUP = None
        _MASTER_PRESSURE_SCORE_LOOKUP = None
        _COUNTDOWN_MASTER_LOOKUP = None
        _TRANSIT_RETROGRADE_START_DATES_BY_PLANET = None
        _RETROGRADE_CALENDAR_INDEX = None
        _ASPECT_INTERPRETATION_CACHE.clear()
    return True


def _normalize_planet(value: Any) -> str:
    raw = str(value or "").strip()
    if raw in PLANET_ALIASES:
        return PLANET_ALIASES[raw]
    if "螟ｪ" in raw or "太" in raw:
        return "SUN"
    if "譛" in raw or "隴" in raw or "月" in raw:
        return "MOON"
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


def _damp(value: float, factor: float = 150.0) -> float:
    """極端な合計値を抑制する減衰関数。"""
    if value == 0:
        return 0
    sign = 1 if value > 0 else -1
    abs_val = abs(value)
    return sign * (abs_val * factor) / (abs_val + factor)


def _clamp(value: float, min_val: float = 10.0, max_val: float = 95.0) -> float:
    return int(max(min_val, min(max_val, round(value))))


def _safe_number(row: dict[str, Any], column: str, default: int = 0) -> int:
    return _normalize_int(row.get(column)) or default


def _safe_text(row: dict[str, Any] | None, column: str, default: str = "") -> str:
    if not row:
        return default
    value = row.get(column, default)
    if value is None or pd.isna(value):
        return default
    return str(value)


def _non_placeholder_text(value: Any) -> str:
    if value is None or pd.isna(value):
        return ""
    text = str(value).strip()
    return "" if text in {"", "-"} else text


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
    completeness_columns = ("Score_Impact", "Priority", "Text_Description", "Advised_Task", "Countdown_ID")
    ranked["_completeness_sort"] = ranked.apply(
        lambda row: sum(1 for column in completeness_columns if column in ranked.columns and pd.notna(row.get(column))),
        axis=1,
    )
    ranked["_priority_sort"] = 0
    ranked["_impact_sort"] = -999
    if "Priority" in ranked.columns:
        ranked["_priority_sort"] = pd.to_numeric(ranked["Priority"], errors="coerce").fillna(0)
    if "Score_Impact" in ranked.columns:
        ranked["_impact_sort"] = pd.to_numeric(ranked["Score_Impact"], errors="coerce").fillna(-999)
    ranked = ranked.sort_values(
        ["_completeness_sort", "_priority_sort", "_impact_sort"],
        ascending=[False, False, False],
        kind="mergesort",
    )
    return ranked.iloc[0].drop(labels=["_completeness_sort", "_priority_sort", "_impact_sort"], errors="ignore").to_dict()


PLANET_LABELS = {
    "SUN": "太陽",
    "MOON": "月",
    "MERCURY": "水星",
    "VENUS": "金星",
    "MARS": "火星",
    "JUPITER": "木星",
    "SATURN": "土星",
    "URANUS": "天王星",
    "NEPTUNE": "海王星",
    "PLUTO": "冥王星",
    "ASC": "ASC",
    "MC": "MC",
}

PLANET_LABELS.update({
    "SUN": "太陽",
    "MOON": "月",
    "MERCURY": "水星",
    "VENUS": "金星",
    "MARS": "火星",
    "JUPITER": "木星",
    "SATURN": "土星",
    "URANUS": "天王星",
    "NEPTUNE": "海王星",
    "PLUTO": "冥王星",
})


def _planet_label(value: Any) -> str:
    normalized = _normalize_planet(value)
    return PLANET_LABELS.get(normalized, normalized)


def _has_meaningful_aspect_content(row: dict[str, Any]) -> bool:
    return any(
        bool(_safe_text(row, column))
        for column in ("Text_Description", "Advised_Task")
    ) or _normalize_float(row.get("Score_Impact")) is not None


def _fallback_aspect_score(
    transit_planet: str,
    natal_planet: str,
    angle: int,
    category: str,
    is_retrograde: bool,
) -> int:
    base_scores = {
        0: 55,
        60: 35,
        90: -20,
        120: 45,
        150: -25,
        180: -30,
    }
    score = base_scores.get(angle, 0)
    pair = {transit_planet, natal_planet}
    if angle in {0, 60, 120}:
        if "VENUS" in pair:
            score += 15
        if "MOON" in pair:
            score += 15
        if "JUPITER" in pair:
            score += 12
        if pair == {"SUN"}:
            score += 30
    else:
        if "MARS" in pair and angle in {90, 180}:
            score -= 5
        if "SATURN" in pair:
            score -= 8
        if "PLUTO" in pair:
            score -= 8
    if category == "Work":
        score += 5 if score > 0 else -2
    if category == "Love" and score > 0:
        score += 5
    if is_retrograde:
        score -= 5 if score < 0 else 10
    return _clamp(score, -95, 95)


def _fallback_aspect_priority(angle: int, score: int) -> int:
    if angle == 0 and abs(score) >= 70:
        return 10
    if abs(score) >= 60:
        return 8
    if abs(score) >= 30:
        return 6
    return 4


def _fallback_aspect_text(
    transit_planet: str,
    natal_planet: str,
    angle: int,
    category: str,
    orb_status: str,
    is_retrograde: bool,
) -> str:
    return "----"
    transit_label = _planet_label(transit_planet)
    natal_label = _planet_label(natal_planet)
    phase_text = (
        "これからピークへ向かう予兆が強まっています"
        if _normalize_orb_status(orb_status) == "APPLYING"
        else "ピークを越えた余韻から学びを整える段階です"
    )
    retro_text = " 逆行の影響で過去の課題や見直しテーマも浮かびやすくなっています。" if is_retrograde else ""
    angle_tone = "調和" if angle in {0, 60, 120} else "摩擦"
    return (
        f"トランジットの{transit_label}とネイタルの{natal_label}が{angle}度を形成し、"
        f"{category or 'General'}領域で{angle_tone}が際立つタイミングです。{phase_text}。{retro_text}"
    ).strip()


def _fallback_aspect_task(category: str, orb_status: str, is_retrograde: bool) -> str:
    return "----"
    if is_retrograde:
        return "過去の記録や未処理タスクを見直し、急がず再調整してください。"
    if _normalize_orb_status(orb_status) == "APPLYING":
        if category == "Work":
            return "優先順位を整理し、先に判断が必要な仕事から着手してください。"
        if category == "Love":
            return "気持ちを言葉にする準備を整え、丁寧なやり取りを意識してください。"
        if category == "Health":
            return "無理を増やす前に、生活リズムと休息を先に整えてください。"
        return "今日いちばん育てたいテーマを一つ決め、先回りして準備してください。"
    if category == "Work":
        return "進めた内容を振り返り、次に引き継ぐ判断材料を整理してください。"
    if category == "Love":
        return "感情の反応を落ち着いて見直し、余韻を言葉にして定着させてください。"
    if category == "Health":
        return "疲労サインを確認し、回復を優先する動きへ切り替えてください。"
    return "起きた流れを振り返り、次に活かすための気づきをメモしてください。"


def _hydrate_aspect_interpretation_row(row: dict[str, Any] | None) -> dict[str, Any]:
    if not row:
        return {}
    hydrated = dict(row)
    transit_planet = _normalize_planet(hydrated.get("T_Planet"))
    natal_planet = _normalize_planet(hydrated.get("N_Planet"))
    angle = _safe_number(hydrated, "Aspect_Angle")
    category = _safe_text(hydrated, "Category", "General")
    is_retrograde = bool(_normalize_bool_flag(hydrated.get("T_Retrograde_Flag")))
    orb_status = _safe_text(hydrated, "Orb_Status", "Applying")

    if _normalize_float(hydrated.get("Score_Impact")) is None:
        hydrated["Score_Impact"] = _fallback_aspect_score(transit_planet, natal_planet, angle, category, is_retrograde)
    if _normalize_float(hydrated.get("Priority")) is None:
        hydrated["Priority"] = _fallback_aspect_priority(angle, _safe_number(hydrated, "Score_Impact"))
    if not _safe_text(hydrated, "Text_Description"):
        hydrated["Text_Description"] = _fallback_aspect_text(
            transit_planet, natal_planet, angle, category, orb_status, is_retrograde
        )
    if not _safe_text(hydrated, "Advised_Task"):
        hydrated["Advised_Task"] = _fallback_aspect_task(category, orb_status, is_retrograde)
    return hydrated


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
    normalized_angle = _normalize_int(angle)
    cache_key = (
        transit_planet,
        natal_planet,
        normalized_angle or 0,
        _normalize_int(house) or 1,
        bool(is_retrograde),
        _normalize_orb_status(orb_status),
    )
    if cache_key in _ASPECT_INTERPRETATION_CACHE:
        return dict(_ASPECT_INTERPRETATION_CACHE[cache_key])

    _ensure_aspect_master_indexes()
    candidates_by_key = _ASPECT_CANDIDATES_BY_KEY or {}
    base_candidate_rows = candidates_by_key.get((transit_planet, natal_planet, normalized_angle or 0), [])
    if not base_candidate_rows:
        LOGGER.info(
            "No aspect interpretation found for required conditions: %s/%s/%s",
            transit_planet,
            natal_planet,
            angle,
        )
        return {}
    base_candidates = pd.DataFrame(base_candidate_rows)
    text_orb_status = "Applying"

    optional_filters = [
        ("N_House", lambda df: _series_int_equals(df["N_House"], house)),
        ("T_Retrograde_Flag", lambda df: _series_bool_equals(df["T_Retrograde_Flag"], is_retrograde)),
        ("Orb_Status", lambda df: _series_orb_equals(df["Orb_Status"], text_orb_status)),
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
            hydrated = _hydrate_aspect_interpretation_row(selected)
            _ASPECT_INTERPRETATION_CACHE[cache_key] = dict(hydrated)
            return hydrated
    return {}


def _normalize_aspect_input(aspect: dict[str, Any]) -> dict[str, Any]:
    angle = _first_present(aspect, ("angle", "Aspect_Angle", "aspect_angle", "exact_angle", "騾・・・ｫ蜀ｶ・ｧ雋橸ｽｺ・ｦ"))
    return {
        "t_planet": _first_present(aspect, ("t_planet", "T_Planet", "transit_planet", "planet1", "陞滂ｽｩ闖ｴ繝ｻ")),
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


def get_daily_star_vibe_description(current_dt: datetime | date | None = None) -> str:
    daily_star_df = MASTER_DATAFRAMES.get("daily_star_vibe", pd.DataFrame())
    if daily_star_df.empty:
        return ""

    target_date = _dashboard_target_date(current_dt)
    target_values = {
        target_date.strftime("%Y/%m/%d"),
        target_date.isoformat(),
    }
    for row in daily_star_df.to_dict("records"):
        row_date = _safe_text(row, "Date").strip()
        if row_date in target_values:
            return _safe_text(row, "Text_Description").strip()
    return ""


def _dashboard_header() -> dict[str, Any]:
    return {
        "brand": {"name": "The Celestial Atelier", "sublabel": "Transit Operations Dashboard"},
        "actions": ["History", "My Page", "Plan"],
    }


def _app_now() -> datetime:
    return datetime.now(APP_TIMEZONE).replace(tzinfo=None)


def _app_today() -> date:
    return _app_now().date()


def _dashboard_date(current_dt: datetime | date | None) -> str:
    if isinstance(current_dt, datetime):
        return current_dt.date().isoformat()
    if isinstance(current_dt, date):
        return current_dt.isoformat()
    return _app_today().isoformat()


def _dashboard_target_date(current_dt: datetime | date | None) -> date:
    if isinstance(current_dt, datetime):
        return current_dt.date()
    if isinstance(current_dt, date):
        return current_dt
    return _app_today()


def build_dashboard_data_from_aspect(row: dict[str, Any]) -> dict[str, Any]:
    return build_dashboard_data_from_interpretations([row] if row else [], {"modifier": 0, "raw_modifier": 0, "items": []})


def _top_priority_row(rows: list[dict[str, Any]]) -> dict[str, Any]:
    return max(rows, key=lambda row: (_safe_number(row, "Priority"), _safe_number(row, "Score_Impact")))


def _aspect_label(row: dict[str, Any]) -> str:
    transit_label = _planet_label(row.get("T_Planet"))
    natal_label = _planet_label(row.get("N_Planet"))
    angle = _safe_number(row, "Aspect_Angle")
    if transit_label and natal_label and angle is not None:
        return f"ネイタル{natal_label} × トランジット{transit_label} {angle}°"
    if transit_label and natal_label and angle is not None:
        return f"ネイタル{natal_label} × トランジット{transit_label} {angle}°"
    return _safe_text(row, "Aspect_Logic_ID") or "アスペクト"


def _daily_aspect_highlight(row: dict[str, Any], polarity: str) -> dict[str, Any]:
    score = _safe_number(row, "Score_Impact")
    return {
        "polarity": polarity,
        "label": _aspect_label(row),
        "score": score,
        "impact": abs(score),
        "priority": _safe_number(row, "Priority"),
        "category": _safe_text(row, "Category", "General"),
        "description": _safe_text(row, "Text_Description"),
        "advisedTask": _safe_text(row, "Advised_Task"),
        "source": _source_reference(
            row,
            columns=["Aspect_Logic_ID", "T_Planet", "N_Planet", "Aspect_Angle", "Score_Impact", "Priority", "Text_Description", "Advised_Task"],
        ),
    }


def _aspect_input_orb(row: dict[str, Any]) -> float | None:
    source = row.get("_input")
    if isinstance(source, dict):
        return _normalize_float(source.get("orb"))
    return None


def _weekly_aspect_target(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "Countdown_ID": _safe_text(row, "Countdown_ID"),
        "T_Planet": _safe_text(row, "T_Planet"),
        "N_Planet": _safe_text(row, "N_Planet"),
        "Aspect_Angle": _safe_number(row, "Aspect_Angle"),
    }


def _build_weekly_aspect_items(
    birth_input: BirthInput | None,
    current_dt: datetime | date | None,
    days: int = 6,
) -> list[dict[str, Any]]:
    if birth_input is None or swe is None:
        return []
    target_date = _dashboard_target_date(current_dt)
    grouped_items: dict[str, dict[str, Any]] = {}
    for day_offset in range(max(days, 0)):
        sample_dt = datetime.combine(target_date + timedelta(days=day_offset), dt_time(hour=12))
        try:
            day_rows = get_all_aspect_interpretations(build_transit_aspect_inputs(birth_input, sample_dt))
        except Exception as exc:
            LOGGER.warning("Failed to build weekly aspect items for %s: %s", sample_dt.date(), exc)
            continue
        candidate_rows = [
            row
            for row in day_rows
            if _is_countdown_candidate_orb_status(row)
            and _normalize_planet(row.get("T_Planet")) in (COUNTDOWN_SHORT_PLANETS | COUNTDOWN_LONG_PLANETS)
            and _safe_number(row, "Score_Impact") != 0
            and _countdown_priority_band(_safe_number(row, "Priority")) != "low"
        ]
        for row in sorted(
            candidate_rows,
            key=lambda item: (_safe_number(item, "Priority"), abs(_safe_number(item, "Score_Impact")), -_extract_current_orb(item)),
            reverse=True,
        ):
            aspect_key = "|".join(
                [
                    _safe_text(row, "Countdown_ID"),
                    _safe_text(row, "T_Planet"),
                    _safe_text(row, "N_Planet"),
                    str(_safe_number(row, "Aspect_Angle")),
                ]
            )
            row_rank = (_safe_number(row, "Priority"), abs(_safe_number(row, "Score_Impact")), -_extract_current_orb(row))
            item = grouped_items.get(aspect_key)
            if item:
                item["end_date"] = sample_dt.date().isoformat()
                item["end_days_until"] = day_offset
                item["active_dates"].append(sample_dt.date().isoformat())
                if row_rank > item["_rank"]:
                    item.update({
                        "label": _aspect_label(row),
                        "title": _safe_text(row, "Category", "Aspect"),
                        "category": _safe_text(row, "Category", "General"),
                        "scoreImpact": _safe_number(row, "Score_Impact"),
                        "priority": _safe_number(row, "Priority"),
                        "orb": round(_extract_current_orb(row), 2),
                        "orbStatus": _safe_text(row, "_orb_status", _safe_text(row, "Orb_Status")),
                        "description": _safe_text(row, "Text_Description"),
                        "advisedTask": _safe_text(row, "Advised_Task"),
                        "target": _weekly_aspect_target(row),
                        "_rank": row_rank,
                    })
                continue
            grouped_items[aspect_key] = {
                "date": sample_dt.date().isoformat(),
                "days_until": day_offset,
                "start_date": sample_dt.date().isoformat(),
                "end_date": sample_dt.date().isoformat(),
                "start_days_until": day_offset,
                "end_days_until": day_offset,
                "active_dates": [sample_dt.date().isoformat()],
                "label": _aspect_label(row),
                "title": _safe_text(row, "Category", "Aspect"),
                "category": _safe_text(row, "Category", "General"),
                "scoreImpact": _safe_number(row, "Score_Impact"),
                "priority": _safe_number(row, "Priority"),
                "orb": round(_extract_current_orb(row), 2),
                "orbStatus": _safe_text(row, "_orb_status", _safe_text(row, "Orb_Status")),
                "description": _safe_text(row, "Text_Description"),
                "advisedTask": _safe_text(row, "Advised_Task"),
                "target": _weekly_aspect_target(row),
                "_rank": row_rank,
            }
    items = list(grouped_items.values())
    items.sort(key=lambda item: (item["start_days_until"], -_safe_number(item, "priority"), -abs(_safe_number(item, "scoreImpact"))))
    for item in items:
        item.pop("_rank", None)
    return items


def _mars_aspect_peaks_on_target_date(row: dict[str, Any], current_dt: datetime | date | None) -> bool:
    if swe is None:
        orb = _aspect_input_orb(row)
        return orb is not None and orb == 0
    natal_longitude = _countdown_target_longitude(row)
    if natal_longitude is None:
        orb = _aspect_input_orb(row)
        return orb is not None and orb == 0

    source = row.get("_input") if isinstance(row.get("_input"), dict) else {}
    timezone_offset = _normalize_float(source.get("timezone_offset")) or 9.0
    target_date = _dashboard_target_date(current_dt)
    scan_start = datetime.combine(target_date - timedelta(days=1), dt_time(hour=0))
    scan_end = datetime.combine(target_date + timedelta(days=2), dt_time(hour=0))
    exact_angle = _safe_number(row, "Aspect_Angle")

    best_dt: datetime | None = None
    best_orb = float("inf")
    sample_dt = scan_start
    while sample_dt <= scan_end:
        orb, _is_retrograde = _aspect_orb_at(
            "MARS",
            sample_dt,
            timezone_offset,
            natal_longitude,
            exact_angle,
        )
        if orb < best_orb:
            best_orb = orb
            best_dt = sample_dt
        sample_dt += timedelta(minutes=10)

    return best_dt is not None and best_dt.date() == target_date and best_orb <= 0.01


def _is_daily_aspect_highlight_candidate(row: dict[str, Any], current_dt: datetime | date | None = None) -> bool:
    transit_planet = _normalize_planet(row.get("T_Planet"))
    if transit_planet not in PERSONAL_READING_TRANSIT_PLANETS:
        return False
    if transit_planet == "MARS":
        return _mars_aspect_peaks_on_target_date(row, current_dt)
    return True


def _top_daily_aspect_highlights(
    rows: list[dict[str, Any]],
    limit: int = 2,
    current_dt: datetime | date | None = None,
) -> dict[str, list[dict[str, Any]]]:
    eligible_rows = [
        row
        for row in rows
        if _is_daily_aspect_highlight_candidate(row, current_dt)
    ]
    positive_rows = [row for row in eligible_rows if _safe_number(row, "Score_Impact") > 0]
    negative_rows = [row for row in eligible_rows if _safe_number(row, "Score_Impact") < 0]

    positive_ranked = sorted(
        positive_rows,
        key=lambda row: (_safe_number(row, "Score_Impact"), _safe_number(row, "Priority")),
        reverse=True,
    )[:limit]
    negative_ranked = sorted(
        negative_rows,
        key=lambda row: (abs(_safe_number(row, "Score_Impact")), _safe_number(row, "Priority")),
        reverse=True,
    )[:limit]
    return {
        "positive": [_daily_aspect_highlight(row, "positive") for row in positive_ranked],
        "negative": [_daily_aspect_highlight(row, "negative") for row in negative_ranked],
    }


def _source_reference(
    row: dict[str, Any] | None,
    *,
    columns: list[str] | None = None,
    note: str | None = None,
) -> dict[str, Any] | None:
    if not row:
        return None
    row_key = (
        _safe_text(row, "Aspect_Logic_ID")
        or _safe_text(row, "Trigger_ID")
        or _safe_text(row, "Planet_ID")
        or _safe_text(row, "Event_Type")
    )
    return {
        "csv": _safe_text(row, "_csv_file"),
        "row": _safe_number(row, "_csv_row"),
        "key": row_key,
        "columns": columns or [],
        "note": note or "",
    }


def _rank_aspect_influence_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        rows,
        key=lambda row: (_safe_number(row, "Priority"), abs(_safe_number(row, "Score_Impact"))),
        reverse=True,
    )


def _select_countdown_target(rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    targets = _select_countdown_targets(rows, limit=1)
    return targets[0] if targets else None


def _is_countdown_candidate_orb_status(row: dict[str, Any]) -> bool:
    orb_status = _normalize_orb_status(row.get("_orb_status", row.get("Orb_Status")))
    return orb_status in {"", "APPLYING", "SEPARATING"}


def _select_countdown_targets(
    rows: list[dict[str, Any]],
    limit: int = 3,
    score_sign: str = "positive",
) -> list[dict[str, Any]]:
    score_sign_normalized = str(score_sign or "").strip().lower()
    candidates = [
        row
        for row in rows
        if _is_countdown_candidate_orb_status(row)
        and (
            _safe_number(row, "Score_Impact") > 0
            if score_sign_normalized != "negative"
            else _safe_number(row, "Score_Impact") < 0
        )
    ]
    if not candidates:
        return []
    if score_sign_normalized == "negative":
        ranked = sorted(
            candidates,
            key=lambda row: (
                _safe_number(row, "Priority"),
                abs(_safe_number(row, "Score_Impact")),
                -_extract_current_orb(row),
            ),
            reverse=True,
        )
        return ranked[:limit]
    ranked = sorted(
        candidates,
        key=lambda row: (
            _safe_number(row, "Priority"),
            _safe_number(row, "Score_Impact"),
            -_extract_current_orb(row),
        ),
        reverse=True,
    )
    return ranked[:limit]


def _countdown_targets_by_planet_group(
    rows: list[dict[str, Any]],
    planets: set[str],
    limit: int = 3,
    score_sign: str = "positive",
) -> list[dict[str, Any]]:
    group_rows = [row for row in rows if _normalize_planet(row.get("T_Planet")) in planets]
    return _select_countdown_targets(group_rows, limit=limit, score_sign=score_sign)


def _select_display_countdown_items(items: list[dict[str, Any]], limit: int | None = 3) -> list[dict[str, Any]]:
    def remaining_hours(item: dict[str, Any]) -> int:
        hours_remaining = _normalize_int(item.get("hours_remaining", item.get("hoursLeft")))
        if hours_remaining is not None:
            return hours_remaining
        days_remaining = _normalize_int(item.get("days_remaining", item.get("daysLeft"))) or 0
        return days_remaining * 24

    def display_bucket(item: dict[str, Any]) -> int:
        time_remaining = remaining_hours(item)
        scan_status = str(item.get("scan_status") or item.get("scan", {}).get("scan_status") or "").strip().lower()
        if time_remaining > 0:
            return 0
        if scan_status == "exact":
            return 1
        return 2

    ranked = sorted(
        enumerate(items),
        key=lambda pair: (display_bucket(pair[1]), remaining_hours(pair[1]), pair[0]),
    )
    selected = ranked if limit is None else ranked[:limit]
    return [item for _index, item in selected]


def _countdown_score(item: dict[str, Any]) -> float:
    target = item.get("target") if isinstance(item.get("target"), dict) else item
    return _normalize_float(target.get("Score_Impact", target.get("score_impact", target.get("scoreImpact")))) or 0.0


def _countdown_item_identity(item: dict[str, Any]) -> tuple[Any, ...]:
    target = item.get("target") if isinstance(item.get("target"), dict) else item
    return (
        _safe_text(target, "Countdown_ID"),
        _normalize_planet(target.get("T_Planet")),
        _normalize_planet(target.get("N_Planet")),
        _normalize_int(target.get("Aspect_Angle")),
    )


def _is_pressure_countdown_target(row: dict[str, Any], pressure_lookup: dict[tuple[Any, ...], float] | None = None) -> bool:
    transit_planet = _normalize_planet(row.get("T_Planet"))
    if transit_planet not in PRESSURE_COUNTDOWN_TRANSIT_PLANETS:
        return False
    pressure_score = _pressure_score_for_row(row, pressure_lookup)
    score_threshold = PRESSURE_COUNTDOWN_PLANET_THRESHOLDS.get(
        transit_planet,
        PRESSURE_COUNTDOWN_SCORE_THRESHOLD,
    )
    return pressure_score is not None and pressure_score <= score_threshold


def _is_pressure_countdown_item(
    item: dict[str, Any],
    pressure_lookup: dict[tuple[Any, ...], float] | None = None,
) -> bool:
    target = item.get("target") if isinstance(item.get("target"), dict) else {}
    return _is_pressure_countdown_target(target, pressure_lookup)


def _pressure_natal_focus_rank(row: dict[str, Any]) -> int:
    natal_planet = _normalize_planet(row.get("N_Planet"))
    if natal_planet in {"SUN", "MOON", "ASC", "MC"}:
        return 0
    if natal_planet in {"MERCURY", "MARS"}:
        return 1
    return 2


def _pressure_aspect_rank(row: dict[str, Any]) -> int:
    angle = _normalize_int(row.get("Aspect_Angle")) or 0
    if angle in {0, 90, 180}:
        return 0
    if angle == 150:
        return 1
    return 2


def _select_pressure_countdown_items(
    items: list[dict[str, Any]],
    pressure_lookup: dict[tuple[Any, ...], float] | None = None,
) -> list[dict[str, Any]]:
    departing_items = [
        item
        for item in items
        if str(item.get("countdown_mode") or "").strip().lower() == "departure"
        and str(item.get("scan_status") or item.get("scan", {}).get("scan_status") or "").strip().lower() == "departing"
        and _is_pressure_countdown_item(item, pressure_lookup)
    ]
    for item in departing_items:
        target = item.get("target") if isinstance(item.get("target"), dict) else {}
        score = _pressure_score_for_row(target, pressure_lookup)
        if score is not None:
            item["pressure_score"] = score
            item["pressureScore"] = score
            if isinstance(target, dict):
                target["Pressure_Score"] = score
    ranked = sorted(
        departing_items,
        key=lambda item: _pressure_countdown_sort_key(item, pressure_lookup),
    )
    return ranked


def _pressure_countdown_sort_key(
    item: dict[str, Any],
    pressure_lookup: dict[tuple[Any, ...], float] | None = None,
) -> tuple[Any, ...]:
    target = item.get("target") if isinstance(item.get("target"), dict) else {}
    pressure_score = _pressure_score_for_row(target, pressure_lookup) or 0
    hours_remaining = _normalize_int(item.get("hours_remaining", item.get("hoursLeft")))
    days_remaining = _normalize_int(item.get("days_remaining", item.get("daysLeft")))
    if hours_remaining is not None or days_remaining is not None:
        return (
            0,
            hours_remaining if hours_remaining is not None else days_remaining * 24,
            -_safe_number(target, "Priority"),
            pressure_score,
            _extract_current_orb(target),
        )
    return (
        1,
        _pressure_natal_focus_rank(target),
        _pressure_aspect_rank(target),
        _extract_current_orb(target),
        pressure_score,
        -_safe_number(target, "Priority"),
    )


def _timeline_advise_lookup_key(row: dict[str, Any]) -> tuple[Any, ...]:
    return (
        _normalize_planet(row.get("T_Planet")),
        _normalize_planet(row.get("N_Planet")),
        _normalize_int(row.get("Aspect_Angle")) or 0,
    )


def _build_timeline_advise_lookup(rows: list[dict[str, Any]]) -> dict[tuple[Any, ...], str]:
    lookup: dict[tuple[Any, ...], str] = {}
    for row in rows:
        advise = _non_placeholder_text(row.get("timeline_advise"))
        if not advise:
            continue
        lookup.setdefault(_timeline_advise_lookup_key(row), advise)
    return lookup


def _build_master_timeline_advise_lookup() -> dict[tuple[Any, ...], str]:
    _ensure_aspect_master_indexes()
    return _MASTER_TIMELINE_ADVISE_LOOKUP or {}


def _build_pressure_score_lookup(rows: list[dict[str, Any]]) -> dict[tuple[Any, ...], float]:
    lookup: dict[tuple[Any, ...], float] = {}
    for row in rows:
        score = _normalize_float(row.get("Pressure_Score"))
        if score is None:
            continue
        lookup[_timeline_advise_lookup_key(row)] = score
    return lookup


def _build_master_pressure_score_lookup() -> dict[tuple[Any, ...], float]:
    _ensure_aspect_master_indexes()
    return _MASTER_PRESSURE_SCORE_LOOKUP or {}


def _build_aspect_master_indexes(
    rows: list[dict[str, Any]],
) -> tuple[
    dict[tuple[str, str, int], list[dict[str, Any]]],
    dict[tuple[Any, ...], str],
    dict[tuple[Any, ...], float],
]:
    candidates_by_key: dict[tuple[str, str, int], list[dict[str, Any]]] = {}
    for row in rows:
        row_angle = _normalize_int(row.get("Aspect_Angle"))
        if row_angle is None:
            continue
        key = (
            _normalize_planet(row.get("T_Planet")),
            _normalize_planet(row.get("N_Planet")),
            row_angle,
        )
        candidates_by_key.setdefault(key, []).append(row)
    return (
        candidates_by_key,
        _build_timeline_advise_lookup(rows),
        _build_pressure_score_lookup(rows),
    )


def _genre_description_text(value: Any) -> str:
    if value is None or pd.isna(value):
        return ""
    text = str(value).strip()
    return "" if not text or text == "-" else text


def _aspect_genre_representative_rank(row: dict[str, Any]) -> tuple[int, int, int, int]:
    element = str(row.get("N_Sign_Element") or "").strip().upper()
    element_rank = ASPECT_GENRE_REPRESENTATIVE_ELEMENT_ORDER.get(element, 4)
    retrograde_rank = 0 if _normalize_bool_flag(row.get("T_Retrograde_Flag")) == 0 else 1
    orb_rank = 0 if _normalize_orb_status(row.get("Orb_Status")) == "APPLYING" else 1
    source_row = _normalize_int(row.get("_csv_row")) or 10**9
    return element_rank, retrograde_rank, orb_rank, source_row


def _build_aspect_genre_description_lookup(
    rows: list[dict[str, Any]],
) -> dict[tuple[str, str, int, int], dict[str, str]]:
    representative_rows: dict[tuple[str, str, int, int], dict[str, Any]] = {}
    representative_ranks: dict[tuple[str, str, int, int], tuple[int, int, int, int]] = {}
    for row in rows:
        angle = _normalize_int(row.get("Aspect_Angle"))
        house = _normalize_int(row.get("N_House"))
        if angle is None or house is None:
            continue
        key = (
            _normalize_planet(row.get("T_Planet")),
            _normalize_planet(row.get("N_Planet")),
            angle,
            house,
        )
        rank = _aspect_genre_representative_rank(row)
        if key not in representative_ranks or rank < representative_ranks[key]:
            representative_rows[key] = row
            representative_ranks[key] = rank

    return {
        key: {
            genre: _genre_description_text(row.get(column))
            for genre, column in ASPECT_GENRE_DESCRIPTION_COLUMNS.items()
        }
        for key, row in representative_rows.items()
    }


def _genre_score_impact(value: Any) -> float | None:
    if value is None or pd.isna(value):
        return None
    text = str(value).strip()
    if not text or text == "-":
        return None
    score = _normalize_float(value)
    if score is None or not -100 <= score <= 100:
        return None
    return score


def _genre_score_component(value: Any) -> float | None:
    if value is None or pd.isna(value):
        return None
    text = str(value).strip()
    if not text or text == "-":
        return None
    score = _normalize_float(value)
    if score is None or not 0 <= score <= 100:
        return None
    return score


def _build_aspect_genre_score_impact_lookup(
    rows: list[dict[str, Any]],
) -> dict[tuple[str, str, int, int], dict[str, float | None]]:
    representative_rows: dict[tuple[str, str, int, int], dict[str, Any]] = {}
    representative_ranks: dict[tuple[str, str, int, int], tuple[int, int, int, int]] = {}
    for row in rows:
        angle = _normalize_int(row.get("Aspect_Angle"))
        house = _normalize_int(row.get("N_House"))
        if angle is None or house is None:
            continue
        key = (
            _normalize_planet(row.get("T_Planet")),
            _normalize_planet(row.get("N_Planet")),
            angle,
            house,
        )
        rank = _aspect_genre_representative_rank(row)
        if key not in representative_ranks or rank < representative_ranks[key]:
            representative_rows[key] = row
            representative_ranks[key] = rank

    return {
        key: {
            genre: _genre_score_impact(row.get(column))
            for genre, column in ASPECT_GENRE_SCORE_IMPACT_COLUMNS.items()
        }
        for key, row in representative_rows.items()
    }


def _build_aspect_genre_dual_score_lookup(
    rows: list[dict[str, Any]],
) -> dict[tuple[str, str, int, int], dict[str, dict[str, float | None]]]:
    representative_rows: dict[tuple[str, str, int, int], dict[str, Any]] = {}
    representative_ranks: dict[tuple[str, str, int, int], tuple[int, int, int, int]] = {}
    for row in rows:
        angle = _normalize_int(row.get("Aspect_Angle"))
        house = _normalize_int(row.get("N_House"))
        if angle is None or house is None:
            continue
        key = (
            _normalize_planet(row.get("T_Planet")),
            _normalize_planet(row.get("N_Planet")),
            angle,
            house,
        )
        rank = _aspect_genre_representative_rank(row)
        if key not in representative_ranks or rank < representative_ranks[key]:
            representative_rows[key] = row
            representative_ranks[key] = rank

    return {
        key: {
            genre: {
                component: _genre_score_component(row.get(column))
                for component, column in columns.items()
            }
            for genre, columns in ASPECT_GENRE_DUAL_SCORE_COLUMNS.items()
        }
        for key, row in representative_rows.items()
    }


def _ensure_aspect_master_indexes() -> None:
    global _ASPECT_CANDIDATES_BY_KEY, _MASTER_TIMELINE_ADVISE_LOOKUP, _MASTER_PRESSURE_SCORE_LOOKUP
    if (
        _ASPECT_CANDIDATES_BY_KEY is not None
        and _MASTER_TIMELINE_ADVISE_LOOKUP is not None
        and _MASTER_PRESSURE_SCORE_LOOKUP is not None
    ):
        return

    with _ASPECT_MASTER_INDEX_LOCK:
        if (
            _ASPECT_CANDIDATES_BY_KEY is not None
            and _MASTER_TIMELINE_ADVISE_LOOKUP is not None
            and _MASTER_PRESSURE_SCORE_LOOKUP is not None
        ):
            return
        aspect_df = MASTER_DATAFRAMES.get("aspect", pd.DataFrame())
        rows = [] if aspect_df.empty else aspect_df.to_dict(orient="records")
        (
            _ASPECT_CANDIDATES_BY_KEY,
            _MASTER_TIMELINE_ADVISE_LOOKUP,
            _MASTER_PRESSURE_SCORE_LOOKUP,
        ) = _build_aspect_master_indexes(rows)


def get_aspect_genre_descriptions(
    t_planet: str,
    n_planet: str,
    angle: int,
    house: int,
) -> dict[str, str]:
    global _ASPECT_GENRE_DESCRIPTION_LOOKUP
    _ensure_aspect_master_indexes()
    if _ASPECT_GENRE_DESCRIPTION_LOOKUP is None:
        with _ASPECT_MASTER_INDEX_LOCK:
            if _ASPECT_GENRE_DESCRIPTION_LOOKUP is None:
                rows = [
                    row
                    for candidates in (_ASPECT_CANDIDATES_BY_KEY or {}).values()
                    for row in candidates
                ]
                _ASPECT_GENRE_DESCRIPTION_LOOKUP = _build_aspect_genre_description_lookup(rows)

    key = (
        _normalize_planet(t_planet),
        _normalize_planet(n_planet),
        _normalize_int(angle) or 0,
        _normalize_int(house) or 1,
    )
    descriptions = (_ASPECT_GENRE_DESCRIPTION_LOOKUP or {}).get(key, {})
    return {
        genre: descriptions.get(genre, "")
        for genre in ASPECT_GENRE_DESCRIPTION_COLUMNS
    }


def get_aspect_genre_score_impacts(
    t_planet: str,
    n_planet: str,
    angle: int,
    house: int,
) -> dict[str, float | None]:
    """Return signed graph impacts from the authored dual-score columns."""
    components = get_aspect_genre_score_components(
        t_planet,
        n_planet,
        angle,
        house,
    )
    impacts: dict[str, float | None] = {}
    for genre in ASPECT_GENRE_DUAL_SCORE_COLUMNS:
        genre_components = components.get(genre, {})
        positive = genre_components.get("positive")
        negative = genre_components.get("negative")
        impacts[genre] = (
            None
            if positive is None and negative is None
            else float(positive or 0.0) - float(negative or 0.0)
        )
    return impacts


def get_aspect_genre_score_components(
    t_planet: str,
    n_planet: str,
    angle: int,
    house: int,
) -> dict[str, dict[str, float | None]]:
    global _ASPECT_GENRE_DUAL_SCORE_LOOKUP
    _ensure_aspect_master_indexes()
    if _ASPECT_GENRE_DUAL_SCORE_LOOKUP is None:
        with _ASPECT_MASTER_INDEX_LOCK:
            if _ASPECT_GENRE_DUAL_SCORE_LOOKUP is None:
                rows = [
                    row
                    for candidates in (_ASPECT_CANDIDATES_BY_KEY or {}).values()
                    for row in candidates
                ]
                _ASPECT_GENRE_DUAL_SCORE_LOOKUP = (
                    _build_aspect_genre_dual_score_lookup(rows)
                )

    key = (
        _normalize_planet(t_planet),
        _normalize_planet(n_planet),
        _normalize_int(angle) or 0,
        _normalize_int(house) or 1,
    )
    scores = (_ASPECT_GENRE_DUAL_SCORE_LOOKUP or {}).get(key, {})
    return {
        genre: {
            component: scores.get(genre, {}).get(component)
            for component in ("positive", "negative")
        }
        for genre in ASPECT_GENRE_DUAL_SCORE_COLUMNS
    }


def _pressure_score_for_row(row: dict[str, Any], lookup: dict[tuple[Any, ...], float] | None = None) -> float | None:
    score = _normalize_float(row.get("Pressure_Score"))
    if score is not None:
        return score
    if lookup is None:
        lookup = _build_master_pressure_score_lookup()
    return lookup.get(_timeline_advise_lookup_key(row))


def _attach_pressure_timeline_advise(
    items: list[dict[str, Any]],
    timeline_lookup: dict[tuple[Any, ...], str],
) -> list[dict[str, Any]]:
    for item in items:
        target = item.get("target") if isinstance(item.get("target"), dict) else {}
        advise = _non_placeholder_text(target.get("timeline_advise"))
        if not advise:
            advise = timeline_lookup.get(_timeline_advise_lookup_key(target), "")
        if isinstance(target, dict):
            target["timeline_advise"] = advise
        item["timeline_advise"] = advise
        item["timelineAdvise"] = advise
    return items


def _countdown_priority_band(priority: Any) -> str:
    normalized = _normalize_int(priority) or 0
    if normalized >= 8:
        return "high"
    if normalized >= 5:
        return "middle"
    return "low"


def _countdown_priority_band_groups(items: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    groups = {key: [] for key in COUNTDOWN_PRIORITY_BANDS}
    for item in items:
        target = item.get("target") if isinstance(item.get("target"), dict) else {}
        priority = item.get("priority", target.get("Priority"))
        band = _countdown_priority_band(priority)
        item["priority_band"] = band
        item["priority_band_label"] = COUNTDOWN_PRIORITY_BANDS[band]["label"]
        groups[band].append(item)
    return groups


def get_countdown_master_row(trigger_id: Any) -> dict[str, Any] | None:
    normalized_trigger_id = _normalize_trigger_id(trigger_id)
    if not normalized_trigger_id:
        return None
    _ensure_countdown_master_lookup()
    return (_COUNTDOWN_MASTER_LOOKUP or {}).get(normalized_trigger_id)


def _build_countdown_master_lookup(countdown_df: pd.DataFrame) -> dict[str, dict[str, Any]]:
    if countdown_df.empty or "Trigger_ID" not in countdown_df.columns:
        return {}
    candidates_by_trigger: dict[str, list[dict[str, Any]]] = {}
    for row in countdown_df.to_dict(orient="records"):
        trigger_id = _normalize_trigger_id(row.get("Trigger_ID"))
        if trigger_id:
            candidates_by_trigger.setdefault(trigger_id, []).append(row)
    return {
        trigger_id: selected
        for trigger_id, candidates in candidates_by_trigger.items()
        if (selected := _pick_highest_priority(pd.DataFrame(candidates))) is not None
    }


def _ensure_countdown_master_lookup() -> None:
    global _COUNTDOWN_MASTER_LOOKUP
    if _COUNTDOWN_MASTER_LOOKUP is not None:
        return
    with _ASPECT_MASTER_INDEX_LOCK:
        if _COUNTDOWN_MASTER_LOOKUP is not None:
            return
        countdown_df = MASTER_DATAFRAMES.get("countdown", pd.DataFrame())
        if countdown_df.empty or "Trigger_ID" not in countdown_df.columns:
            LOGGER.error("Countdown master is empty, failed to load, or missing Trigger_ID.")
        _COUNTDOWN_MASTER_LOOKUP = _build_countdown_master_lookup(countdown_df)


def _extract_current_orb(row: dict[str, Any] | None) -> float:
    if not row:
        return 0.0
    source = row.get("_input") if isinstance(row.get("_input"), dict) else {}
    for candidate in (
        source.get("orb"),
        source.get("Orb"),
        source.get("orb_diff"),
        source.get("orb_difference"),
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


def _estimate_departure_days(row: dict[str, Any], current_orb: float, total_days: int, threshold_orb: float) -> int:
    transit_planet = _normalize_planet(row.get("T_Planet"))
    speed = AVERAGE_PLANET_SPEED_DEGREES_PER_DAY.get(transit_planet, 1.0)
    if speed <= 0:
        speed = 1.0
    orb_status = _normalize_orb_status(row.get("_orb_status", row.get("Orb_Status")))
    remaining_orb = max(threshold_orb - current_orb, 0)
    if orb_status == "APPLYING":
        remaining_orb = threshold_orb + current_orb
    return _clamp(ceil(remaining_orb / speed), 0, max(total_days, 0))


def _estimate_exit_days(row: dict[str, Any], current_orb: float, total_days: int, threshold_orb: float) -> int:
    transit_planet = _normalize_planet(row.get("T_Planet"))
    speed = AVERAGE_PLANET_SPEED_DEGREES_PER_DAY.get(transit_planet, 1.0)
    if speed <= 0:
        speed = 1.0
    remaining_orb = max(threshold_orb - current_orb, 0)
    return _clamp(ceil(remaining_orb / speed), 0, max(total_days, 0))


def _countdown_scan_start(current_dt: datetime | date | None) -> datetime:
    if isinstance(current_dt, datetime):
        return current_dt
    if isinstance(current_dt, date):
        return datetime.combine(current_dt, dt_time(hour=12))
    return _app_now()


def _parse_transit_calendar_date(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        parsed = pd.to_datetime(value, errors="coerce")
    except Exception:
        return None
    if pd.isna(parsed):
        return None
    return parsed.date()


def _build_calendar_indexes() -> tuple[
    dict[str, tuple[date, ...]],
    dict[tuple[str, str], tuple[tuple[date, dict[str, Any]], ...]],
]:
    transit_dates: dict[str, list[date]] = {}
    transit_df = MASTER_DATAFRAMES.get("transit_calendar", pd.DataFrame())
    required_transit_columns = {"Date", "Planet", "Retrograde_Start_Flag"}
    if not transit_df.empty and required_transit_columns.issubset(transit_df.columns):
        for row in transit_df.to_dict(orient="records"):
            if _normalize_bool_flag(row.get("Retrograde_Start_Flag")) != 1:
                continue
            event_date = _parse_transit_calendar_date(row.get("Date"))
            if event_date is None:
                continue
            planet = _normalize_planet(row.get("Planet"))
            transit_dates.setdefault(planet, []).append(event_date)

    retrograde_rows: list[tuple[date, dict[str, Any]]] = []
    retrograde_df = MASTER_DATAFRAMES.get("retrograde_calendar", pd.DataFrame())
    if not retrograde_df.empty:
        for raw_row in retrograde_df.to_dict(orient="records"):
            event_date = _parse_transit_calendar_date(raw_row.get("Event_Date"))
            if event_date is None:
                continue
            row = dict(raw_row)
            row["Event_Date"] = event_date.isoformat()
            retrograde_rows.append((event_date, row))
    retrograde_rows.sort(
        key=lambda item: (
            str(item[1].get("Event_DateTime_JST") or item[1].get("Event_Date")),
            str(item[1].get("Planet") or ""),
        )
    )

    retrograde_index: dict[tuple[str, str], list[tuple[date, dict[str, Any]]]] = {}
    for event_date, row in retrograde_rows:
        planet = _normalize_planet(row.get("Planet"))
        event_type = str(row.get("Event_Type") or "").strip().upper()
        keys = dict.fromkeys((("", ""), (planet, ""), ("", event_type), (planet, event_type)))
        for key in keys:
            retrograde_index.setdefault(key, []).append((event_date, row))
    return (
        {planet: tuple(dates) for planet, dates in transit_dates.items()},
        {key: tuple(rows) for key, rows in retrograde_index.items()},
    )


def _ensure_calendar_indexes() -> None:
    global _TRANSIT_RETROGRADE_START_DATES_BY_PLANET, _RETROGRADE_CALENDAR_INDEX
    if _TRANSIT_RETROGRADE_START_DATES_BY_PLANET is not None and _RETROGRADE_CALENDAR_INDEX is not None:
        return
    with _ASPECT_MASTER_INDEX_LOCK:
        if _TRANSIT_RETROGRADE_START_DATES_BY_PLANET is not None and _RETROGRADE_CALENDAR_INDEX is not None:
            return
        (
            _TRANSIT_RETROGRADE_START_DATES_BY_PLANET,
            _RETROGRADE_CALENDAR_INDEX,
        ) = _build_calendar_indexes()


def _retrograde_calendar_start_day(
    transit_planet: str,
    scan_start: datetime,
    through_day: int,
) -> int | None:
    _ensure_calendar_indexes()
    normalized_planet = _normalize_planet(transit_planet)
    start_date = scan_start.date()
    end_date = (scan_start + timedelta(days=max(through_day, 0))).date()
    for event_date in (_TRANSIT_RETROGRADE_START_DATES_BY_PLANET or {}).get(normalized_planet, ()):
        if not (start_date <= event_date <= end_date):
            continue
        return (event_date - start_date).days
    return None


def _countdown_target_longitude(row: dict[str, Any]) -> float | None:
    source = row.get("_input") if isinstance(row.get("_input"), dict) else {}
    for candidate in (
        source.get("natal_longitude"),
        source.get("natalLongitude"),
        row.get("natal_longitude"),
        row.get("Natal_Longitude"),
    ):
        value = _normalize_float(candidate)
        if value is not None:
            return value
    return None


def _aspect_orb_at(
    transit_planet: str,
    sample_local_dt: datetime,
    timezone_offset: float,
    natal_longitude: float,
    exact_angle: int,
) -> tuple[float, bool]:
    normalized_planet = _normalize_planet(transit_planet)
    cache = _COUNTDOWN_ORB_REQUEST_CACHE.get()
    cache_key = (
        normalized_planet,
        sample_local_dt,
        float(timezone_offset),
        float(natal_longitude),
        int(exact_angle),
    )
    if cache is not None and cache_key in cache:
        return cache[cache_key]
    transit_longitude, is_retrograde = _calc_transit_planet_state(
        normalized_planet,
        sample_local_dt,
        timezone_offset,
    )
    orb = abs(get_angle_diff(transit_longitude, natal_longitude) - exact_angle)
    result = (orb, is_retrograde)
    if cache is not None:
        cache[cache_key] = result
    return result


def _scan_lunar_countdown_arrival(
    row: dict[str, Any],
    current_dt: datetime | date | None,
    total_days: int,
    threshold_orb: float,
) -> dict[str, Any] | None:
    natal_longitude = _countdown_target_longitude(row)
    if swe is None or natal_longitude is None:
        return None

    exact_angle = _safe_number(row, "Aspect_Angle")
    source = row.get("_input") if isinstance(row.get("_input"), dict) else {}
    timezone_offset = _normalize_float(source.get("timezone_offset")) or 9.0
    scan_start = _countdown_scan_start(current_dt)
    current_orb, current_retrograde = _aspect_orb_at(
        "MOON", scan_start, timezone_offset, natal_longitude, exact_angle
    )
    horizon_hours = max(LUNAR_COUNTDOWN_HORIZON_DAYS * 24, max(total_days, 1) * 24)

    arrival_hour: int | None = 0 if current_orb <= threshold_orb else None
    arrival_orb = current_orb
    arrival_retrograde = current_retrograde
    if arrival_hour is None:
        for hour in range(LUNAR_COUNTDOWN_STEP_HOURS, horizon_hours + 1, LUNAR_COUNTDOWN_STEP_HOURS):
            sample_dt = scan_start + timedelta(hours=hour)
            orb, is_retrograde = _aspect_orb_at("MOON", sample_dt, timezone_offset, natal_longitude, exact_angle)
            if orb <= threshold_orb:
                arrival_hour = hour
                arrival_orb = orb
                arrival_retrograde = is_retrograde
                break
    if arrival_hour is None:
        return None

    total_hours = max(max(total_days, 1) * 24, arrival_hour, LUNAR_COUNTDOWN_STEP_HOURS)
    percent = ((total_hours - arrival_hour) / total_hours) * 100
    arrival_dt = scan_start + timedelta(hours=arrival_hour)
    impact_end_dt: datetime | None = None
    for hour in range(arrival_hour + LUNAR_COUNTDOWN_STEP_HOURS, horizon_hours + 1, LUNAR_COUNTDOWN_STEP_HOURS):
        sample_dt = scan_start + timedelta(hours=hour)
        orb, _ = _aspect_orb_at("MOON", sample_dt, timezone_offset, natal_longitude, exact_angle)
        if orb > threshold_orb:
            impact_end_dt = sample_dt
            break
    return {
        "days_remaining": ceil(arrival_hour / 24),
        "hours_remaining": arrival_hour,
        "total_days": ceil(total_hours / 24),
        "total_hours": total_hours,
        "percent": _clamp(percent, 0, 100),
        "scan_status": "active" if arrival_hour == 0 else "upcoming",
        "current_orb": round(current_orb, 3),
        "arrival_hour": arrival_hour,
        "arrival_orb": round(arrival_orb, 3),
        "arrival_retrograde": arrival_retrograde,
        "impact_start_date": arrival_dt.date().isoformat(),
        "impact_start_datetime": arrival_dt.isoformat(),
        "impact_end_date": impact_end_dt.date().isoformat() if impact_end_dt else None,
        "impact_end_datetime": impact_end_dt.isoformat() if impact_end_dt else None,
    }


def _scan_lunar_countdown_departure(
    row: dict[str, Any],
    current_dt: datetime | date | None,
    total_days: int,
    threshold_orb: float,
) -> dict[str, Any] | None:
    natal_longitude = _countdown_target_longitude(row)
    if swe is None or natal_longitude is None:
        return None

    exact_angle = _safe_number(row, "Aspect_Angle")
    source = row.get("_input") if isinstance(row.get("_input"), dict) else {}
    timezone_offset = _normalize_float(source.get("timezone_offset")) or 9.0
    scan_start = _countdown_scan_start(current_dt)
    current_orb, _ = _aspect_orb_at("MOON", scan_start, timezone_offset, natal_longitude, exact_angle)
    if current_orb > threshold_orb:
        return None

    horizon_hours = LUNAR_COUNTDOWN_HORIZON_DAYS * 24
    impact_start_dt = scan_start
    for hour in range(LUNAR_COUNTDOWN_STEP_HOURS, horizon_hours + 1, LUNAR_COUNTDOWN_STEP_HOURS):
        sample_dt = scan_start - timedelta(hours=hour)
        orb, _ = _aspect_orb_at("MOON", sample_dt, timezone_offset, natal_longitude, exact_angle)
        if orb > threshold_orb:
            impact_start_dt = sample_dt + timedelta(hours=LUNAR_COUNTDOWN_STEP_HOURS)
            break

    for hour in range(LUNAR_COUNTDOWN_STEP_HOURS, horizon_hours + 1, LUNAR_COUNTDOWN_STEP_HOURS):
        sample_dt = scan_start + timedelta(hours=hour)
        orb, is_retrograde = _aspect_orb_at("MOON", sample_dt, timezone_offset, natal_longitude, exact_angle)
        if orb <= threshold_orb:
            continue
        total_hours = max(
            int(ceil((sample_dt - impact_start_dt).total_seconds() / 3600)),
            hour,
            LUNAR_COUNTDOWN_STEP_HOURS,
        )
        percent = ((total_hours - hour) / total_hours) * 100
        return {
            "days_remaining": ceil(hour / 24),
            "hours_remaining": hour,
            "total_days": ceil(total_hours / 24),
            "total_hours": total_hours,
            "percent": _clamp(percent, 0, 100),
            "scan_status": "departing",
            "current_orb": round(current_orb, 3),
            "departure_day": ceil(hour / 24),
            "departure_hour": hour,
            "departure_orb": round(orb, 3),
            "departure_retrograde": is_retrograde,
            "impact_start_date": impact_start_dt.date().isoformat(),
            "impact_end_date": sample_dt.date().isoformat(),
            "impact_start_datetime": impact_start_dt.isoformat(),
            "impact_end_datetime": sample_dt.isoformat(),
        }
    return None


def _scan_countdown_ephemeris(
    row: dict[str, Any],
    current_dt: datetime | date | None,
    total_days: int,
    threshold_orb: float,
) -> dict[str, Any] | None:
    if _normalize_planet(row.get("T_Planet")) == "MOON":
        return _scan_lunar_countdown_arrival(row, current_dt, total_days, threshold_orb)
    if swe is None:
        return None
    natal_longitude = _countdown_target_longitude(row)
    if natal_longitude is None:
        return None

    transit_planet = _normalize_planet(row.get("T_Planet"))
    exact_angle = _safe_number(row, "Aspect_Angle")
    source = row.get("_input") if isinstance(row.get("_input"), dict) else {}
    timezone_offset = _normalize_float(source.get("timezone_offset")) or 9.0
    scan_start = _countdown_scan_start(current_dt)
    scan_horizon_days = max(total_days * 4, 60)
    scan_horizon_days = min(scan_horizon_days, 365)

    previous_orb: float | None = None
    minimum_orb = float("inf")
    minimum_day = 0
    minimum_retrograde = False
    reached_exact_day: int | None = None
    separating_day: int | None = None
    separating_orb: float | None = None
    retrograde_started_day: int | None = None
    previous_retrograde: bool | None = None
    current_orb: float | None = None
    impact_start_day: int | None = None

    for day in range(scan_horizon_days + 1):
        sample_dt = scan_start + timedelta(days=day)
        orb, is_retrograde = _aspect_orb_at(
            transit_planet,
            sample_dt,
            timezone_offset,
            natal_longitude,
            exact_angle,
        )
        if day == 0:
            current_orb = orb
        if impact_start_day is None and orb <= threshold_orb:
            impact_start_day = day
        if previous_retrograde is False and is_retrograde:
            retrograde_started_day = day
        if orb < minimum_orb:
            minimum_orb = orb
            minimum_day = day
            minimum_retrograde = is_retrograde
        if reached_exact_day is None and orb <= 0.5:
            reached_exact_day = day
            break
        if previous_orb is not None and day > 0 and orb > previous_orb + 0.01:
            separating_day = day
            separating_orb = orb
            break
        previous_orb = orb
        previous_retrograde = is_retrograde

    reapproach_day: int | None = None
    if separating_day is not None and separating_orb is not None:
        previous_orb = separating_orb
        for day in range(separating_day + 1, scan_horizon_days + 1):
            sample_dt = scan_start + timedelta(days=day)
            orb, _is_retrograde = _aspect_orb_at(
                transit_planet,
                sample_dt,
                timezone_offset,
                natal_longitude,
                exact_angle,
            )
            if orb < previous_orb - 0.01:
                reapproach_day = day
                break
            previous_orb = orb
    calendar_retrograde_start_day = (
        _retrograde_calendar_start_day(transit_planet, scan_start, separating_day)
        if separating_day is not None
        else None
    )
    retrograde_timing = ""
    if calendar_retrograde_start_day is not None:
        if calendar_retrograde_start_day < minimum_day:
            retrograde_timing = "before_peak"
        elif calendar_retrograde_start_day == minimum_day:
            retrograde_timing = "at_peak"
        else:
            retrograde_timing = "after_peak"
    
    if reached_exact_day is not None:
        scan_status = "exact"
    elif (
        separating_day is not None
        and calendar_retrograde_start_day is not None
        and retrograde_timing in {"before_peak", "at_peak"}
        and reapproach_day is not None
    ):
        scan_status = "retrograde_turning_away"
    elif separating_day is not None:
        scan_status = "turning_away"
    else:
        scan_status = "closest"
    days_remaining = reached_exact_day if reached_exact_day is not None else minimum_day
    hours_remaining: int | None = None
    if days_remaining <= 1:
        hourly_minimum_orb = float("inf")
        hourly_minimum_hour = 0
        previous_hourly_orb: float | None = None
        for hour in range(25):
            sample_dt = scan_start + timedelta(hours=hour)
            orb, _ = _aspect_orb_at(
                transit_planet,
                sample_dt,
                timezone_offset,
                natal_longitude,
                exact_angle,
            )
            if orb < hourly_minimum_orb:
                hourly_minimum_orb = orb
                hourly_minimum_hour = hour
            if orb <= 0.5:
                hourly_minimum_hour = hour
                break
            if previous_hourly_orb is not None and orb > previous_hourly_orb + 0.01 and hour > hourly_minimum_hour:
                break
            previous_hourly_orb = orb
        if hourly_minimum_hour < 24:
            hours_remaining = hourly_minimum_hour
    impact_end_day: int | None = None
    if impact_start_day is not None and impact_start_day > 0:
        for day in range(impact_start_day + 1, scan_horizon_days + 1):
            sample_dt = scan_start + timedelta(days=day)
            orb, _ = _aspect_orb_at(
                transit_planet,
                sample_dt,
                timezone_offset,
                natal_longitude,
                exact_angle,
            )
            if orb > threshold_orb:
                impact_end_day = day
                break
    total_progress_days = max(total_days, days_remaining, 1)
    clamped_days_remaining = _clamp(days_remaining, 0, total_progress_days)
    percent = ((total_progress_days - clamped_days_remaining) / total_progress_days) * 100
    return {
        "days_remaining": clamped_days_remaining,
        "hours_remaining": hours_remaining,
        "total_days": total_progress_days,
        "percent": _clamp(percent, 0, 100),
        "scan_status": scan_status,
        "peak_day": minimum_day,
        "peak_orb": round(minimum_orb, 3),
        "current_orb": round(current_orb if current_orb is not None else minimum_orb, 3),
        "impact_start_date": (scan_start + timedelta(days=impact_start_day)).date().isoformat() if impact_start_day is not None else None,
        "impact_end_date": (scan_start + timedelta(days=impact_end_day)).date().isoformat() if impact_end_day is not None else None,
        "peak_retrograde": minimum_retrograde,
        "retrograde_started_day": retrograde_started_day,
        "calendar_retrograde_start_day": calendar_retrograde_start_day,
        "retrograde_timing": retrograde_timing,
        "reapproach_day": reapproach_day,
    }


def _scan_countdown_departure(
    row: dict[str, Any],
    current_dt: datetime | date | None,
    total_days: int,
    threshold_orb: float,
) -> dict[str, Any] | None:
    if _normalize_planet(row.get("T_Planet")) == "MOON":
        return _scan_lunar_countdown_departure(row, current_dt, total_days, threshold_orb)
    if swe is None:
        return None
    natal_longitude = _countdown_target_longitude(row)
    if natal_longitude is None:
        return None

    transit_planet = _normalize_planet(row.get("T_Planet"))
    exact_angle = _safe_number(row, "Aspect_Angle")
    source = row.get("_input") if isinstance(row.get("_input"), dict) else {}
    timezone_offset = _normalize_float(source.get("timezone_offset")) or 9.0
    scan_start = _countdown_scan_start(current_dt)
    scan_horizon_days = max(total_days * 4, 60)
    scan_horizon_days = min(scan_horizon_days, 365)
    has_been_within_threshold = False
    current_orb: float | None = None
    impact_start_date: str | None = None

    for past_day in range(1, scan_horizon_days + 1):
        sample_dt = scan_start - timedelta(days=past_day)
        orb, _ = _aspect_orb_at(
            transit_planet,
            sample_dt,
            timezone_offset,
            natal_longitude,
            exact_angle,
        )
        if orb > threshold_orb:
            impact_start_date = (scan_start - timedelta(days=past_day - 1)).date().isoformat()
            break

    for day in range(scan_horizon_days + 1):
        sample_dt = scan_start + timedelta(days=day)
        orb, is_retrograde = _aspect_orb_at(
            transit_planet,
            sample_dt,
            timezone_offset,
            natal_longitude,
            exact_angle,
        )
        if day == 0:
            current_orb = orb
            if orb > threshold_orb:
                return None
        if orb <= threshold_orb:
            has_been_within_threshold = True
        if has_been_within_threshold and day > 0 and orb > threshold_orb:
            hours_remaining: int | None = None
            departure_dt = sample_dt
            if day == 1:
                for hour in range(1, 25):
                    hourly_dt = scan_start + timedelta(hours=hour)
                    hourly_orb, hourly_retrograde = _aspect_orb_at(
                        transit_planet,
                        hourly_dt,
                        timezone_offset,
                        natal_longitude,
                        exact_angle,
                    )
                    if hourly_orb > threshold_orb:
                        hours_remaining = hour
                        departure_dt = hourly_dt
                        orb = hourly_orb
                        is_retrograde = hourly_retrograde
                        break
            total_progress_days = max(total_days, day, 1)
            percent = ((total_progress_days - day) / total_progress_days) * 100
            return {
                "days_remaining": _clamp(day, 0, total_progress_days),
                "hours_remaining": hours_remaining,
                "total_days": total_progress_days,
                "percent": _clamp(percent, 0, 100),
                "scan_status": "departing",
                "current_orb": round(current_orb if current_orb is not None else orb, 3),
                "departure_day": day,
                "departure_orb": round(orb, 3),
                "departure_retrograde": is_retrograde,
                "impact_start_date": impact_start_date,
                "impact_end_date": departure_dt.date().isoformat(),
                "impact_end_datetime": departure_dt.isoformat(),
            }
    return None


def _scan_countdown_departure_year_bound(
    row: dict[str, Any],
    current_dt: datetime | date | None,
    threshold_orb: float,
) -> dict[str, Any] | None:
    if _normalize_planet(row.get("T_Planet")) == "MOON":
        return _scan_lunar_countdown_departure(
            row,
            current_dt,
            LUNAR_COUNTDOWN_HORIZON_DAYS,
            threshold_orb,
        )
    if swe is None:
        return None
    natal_longitude = _countdown_target_longitude(row)
    if natal_longitude is None:
        return None

    transit_planet = _normalize_planet(row.get("T_Planet"))
    exact_angle = _safe_number(row, "Aspect_Angle")
    source = row.get("_input") if isinstance(row.get("_input"), dict) else {}
    timezone_offset = _normalize_float(source.get("timezone_offset")) or 9.0
    scan_start = _countdown_scan_start(current_dt)
    year_start = datetime(scan_start.year, 1, 1)
    year_end = datetime(scan_start.year, 12, 31)
    current_orb, _ = _aspect_orb_at(transit_planet, scan_start, timezone_offset, natal_longitude, exact_angle)
    if current_orb > threshold_orb:
        return None

    impact_start = year_start
    impact_start_is_before = True
    days_since_year_start = max((scan_start.date() - year_start.date()).days, 0)
    previous_within: bool | None = None
    for day in range(days_since_year_start + 1):
        sample_dt = year_start + timedelta(days=day)
        orb, _ = _aspect_orb_at(transit_planet, sample_dt, timezone_offset, natal_longitude, exact_angle)
        within = orb <= threshold_orb
        if within and previous_within is False:
            impact_start = sample_dt
            impact_start_is_before = False
        previous_within = within

    impact_end = year_end
    impact_end_is_after = True
    days_until_year_end = max((year_end.date() - scan_start.date()).days, 0)
    days_remaining: int | None = None
    departure_orb: float | None = None
    departure_retrograde = False
    for day in range(1, days_until_year_end + 1):
        sample_dt = scan_start + timedelta(days=day)
        orb, is_retrograde = _aspect_orb_at(
            transit_planet,
            sample_dt,
            timezone_offset,
            natal_longitude,
            exact_angle,
        )
        if orb > threshold_orb:
            impact_end = sample_dt
            impact_end_is_after = False
            days_remaining = day
            departure_orb = orb
            departure_retrograde = is_retrograde
            break

    hours_remaining: int | None = None
    if days_remaining == 1:
        for hour in range(1, 25):
            sample_dt = scan_start + timedelta(hours=hour)
            orb, is_retrograde = _aspect_orb_at(
                transit_planet,
                sample_dt,
                timezone_offset,
                natal_longitude,
                exact_angle,
            )
            if orb > threshold_orb:
                hours_remaining = hour
                impact_end = sample_dt
                departure_orb = orb
                departure_retrograde = is_retrograde
                break

    total_progress_days = max((impact_end.date() - impact_start.date()).days, days_remaining or 0, 1)
    percent = 0 if days_remaining is None else ((total_progress_days - days_remaining) / total_progress_days) * 100
    return {
        "days_remaining": days_remaining,
        "hours_remaining": hours_remaining,
        "total_days": total_progress_days,
        "percent": _clamp(percent, 0, 100),
        "scan_status": "departing",
        "current_orb": round(current_orb, 3),
        "departure_day": days_remaining,
        "departure_orb": round(departure_orb, 3) if departure_orb is not None else None,
        "departure_retrograde": departure_retrograde,
        "impact_start_date": impact_start.date().isoformat(),
        "impact_end_date": impact_end.date().isoformat(),
        "impact_end_datetime": impact_end.isoformat(),
        "impact_start_is_before": impact_start_is_before,
        "impact_end_is_after": impact_end_is_after,
        "countdown_unavailable": days_remaining is None,
    }


def _countdown_aspect_label(row: dict[str, Any]) -> str:
    natal_planet = _planet_label(row.get("N_Planet"))
    transit_planet = _planet_label(row.get("T_Planet"))
    angle = _safe_number(row, "Aspect_Angle")
    if not natal_planet or not transit_planet:
        return ""
    return f"ネイタル{natal_planet} × トランジット{transit_planet} {angle}°"
    return f"Natal {natal_planet} × Transit {transit_planet} {angle}"


def build_countdown_data(
    countdown_target: dict[str, Any] | None,
    current_dt: datetime | date | None = None,
    countdown_mode: str = "arrival",
    scan_scope: str = "default",
) -> dict[str, Any] | None:
    if not countdown_target:
        return None
    countdown_id = _safe_text(countdown_target, "Countdown_ID")
    advised_task = _safe_text(countdown_target, "Advised_Task")
    current_orb = _extract_current_orb(countdown_target)
    master_row = get_countdown_master_row(countdown_id)
    if not master_row:
        return {
            "daysLeft": 0,
            "totalDays": DEFAULT_COUNTDOWN_TOTAL_DAYS,
            "note": advised_task,
            "days_remaining": 0,
            "total_days": DEFAULT_COUNTDOWN_TOTAL_DAYS,
            "percent": 0,
            "orb_percent": 0,
            "exit_days_remaining": 0,
            "departure_days_remaining": 0,
            "priority": _safe_number(countdown_target, "Priority"),
            "trigger_id": countdown_id,
            "countdown_id": countdown_id,
            "aspect_label": _countdown_aspect_label(countdown_target),
            "timeline_advise": _non_placeholder_text(countdown_target.get("timeline_advise")),
            "timelineAdvise": _non_placeholder_text(countdown_target.get("timeline_advise")),
            "current_orb": current_orb,
            "countdown_mode": countdown_mode,
            "target": countdown_target,
        }

    threshold_orb = _normalize_float(master_row.get("Threshold_Orb")) or DEFAULT_COUNTDOWN_THRESHOLD_ORB
    total_days = _normalize_int(master_row.get("Max_Progress_Days")) or _normalize_int(master_row.get("Progress_Max_Days")) or DEFAULT_COUNTDOWN_TOTAL_DAYS
    countdown_mode_normalized = str(countdown_mode or "").strip().lower()
    scan_scope_normalized = str(scan_scope or "").strip().lower()
    scan = (
        (
            _scan_countdown_departure_year_bound(countdown_target, current_dt, threshold_orb)
            if scan_scope_normalized == "year_bound"
            else _scan_countdown_departure(countdown_target, current_dt, total_days, threshold_orb)
        )
        if countdown_mode_normalized == "departure"
        else _scan_countdown_ephemeris(countdown_target, current_dt, total_days, threshold_orb)
    )
    if scan and _normalize_float(scan.get("current_orb")) is not None:
        current_orb = abs(_normalize_float(scan.get("current_orb")) or 0)
    percent = 100 - ((current_orb / threshold_orb) * 100) if threshold_orb > 0 else 100
    orb_percent = _clamp(percent, 0, 100)
    progress_percent = orb_percent
    days_remaining = (
        _estimate_departure_days(countdown_target, current_orb, total_days, threshold_orb)
        if countdown_mode_normalized == "departure"
        else _estimate_days_remaining(countdown_target, current_orb, total_days)
    )
    exit_days_remaining = _estimate_exit_days(countdown_target, current_orb, total_days, threshold_orb)
    if scan:
        days_remaining = scan["days_remaining"]
        total_days = scan["total_days"]
        progress_percent = scan["percent"]
        scan_status = scan.get("scan_status")
    else:
        scan_status = "unknown"
    departure_days_remaining = days_remaining if countdown_mode_normalized == "departure" else exit_days_remaining
    hours_remaining = _normalize_int(scan.get("hours_remaining")) if scan else None
    total_hours = _normalize_int(scan.get("total_hours")) if scan else None
    note = _safe_text(master_row, "Next_Action_Hint") or advised_task

    return {
        "daysLeft": days_remaining,
        "totalDays": total_days,
        "note": note,
        "days_remaining": days_remaining,
        "hoursLeft": hours_remaining,
        "hours_remaining": hours_remaining,
        "total_days": total_days,
        "totalHours": total_hours,
        "total_hours": total_hours,
        "percent": progress_percent,
        "orb_percent": orb_percent,
        "exit_days_remaining": exit_days_remaining,
        "departure_days_remaining": departure_days_remaining,
        "scan_status": scan_status,
        "impact_start_date": scan.get("impact_start_date") if scan else None,
        "impact_end_date": scan.get("impact_end_date") if scan else None,
        "impact_start_datetime": scan.get("impact_start_datetime") if scan else None,
        "impact_end_datetime": scan.get("impact_end_datetime") if scan else None,
        "impact_start_is_before": bool(scan.get("impact_start_is_before")) if scan else False,
        "impact_end_is_after": bool(scan.get("impact_end_is_after")) if scan else False,
        "countdown_unavailable": bool(scan.get("countdown_unavailable")) if scan else False,
        "priority": _safe_number(countdown_target, "Priority"),
        "trigger_id": _safe_text(master_row, "Trigger_ID", countdown_id),
        "countdown_id": countdown_id,
        "aspect_label": _countdown_aspect_label(countdown_target),
        "timeline_advise": _non_placeholder_text(countdown_target.get("timeline_advise")),
        "timelineAdvise": _non_placeholder_text(countdown_target.get("timeline_advise")),
        "current_orb": current_orb,
        "threshold_orb": threshold_orb,
        "countdown_mode": countdown_mode_normalized or "arrival",
        "scan": scan,
        "arrival_text": _safe_text(master_row, "Arrival_Text"),
        "display_title": _safe_text(master_row, "Display_Title"),
        "target": countdown_target,
    }


DAILY_PERFORMANCE_SAMPLE_STEP_HOURS = 3
DAILY_PERFORMANCE_SAMPLE_HOURS = tuple(range(0, 73, DAILY_PERFORMANCE_SAMPLE_STEP_HOURS))
DAILY_PERFORMANCE_DRIVE_ANGLES = {0, 60, 120}
DAILY_PERFORMANCE_FRICTION_ANGLES = {90, 150, 180}
DAILY_PERFORMANCE_DECISION_PLANETS = {"SUN", "MERCURY", "SATURN"}
DAILY_PERFORMANCE_FLOW_PLANETS = {"MOON", "VENUS", "JUPITER"}
DAILY_PERFORMANCE_NOISE_PLANETS = {"URANUS", "NEPTUNE", "PLUTO"}
DAILY_PERFORMANCE_FAST_PLANETS = {"MOON", "MERCURY", "MARS", "VENUS"}
DAILY_PERFORMANCE_JUPITER_SUPPORT_NATAL_PLANETS = {"VENUS"}
DAILY_PERFORMANCE_FAST_FRICTION_MULTIPLIER = 1.4
DAILY_PERFORMANCE_FAST_SUPPORT_BUFFER_RATE = 0.15
DAILY_PERFORMANCE_INSPIRATION_ANGLES = {0, 60, 120}
DAILY_PERFORMANCE_INSPIRATION_PLANETS = {"MOON", "MERCURY", "VENUS", "JUPITER", "NEPTUNE"}
DAILY_PERFORMANCE_OUTER_PLANETS = {"URANUS", "NEPTUNE", "PLUTO"}
DAILY_PERFORMANCE_TRANSIT_WEIGHTS = {
    "MOON": 1.35,
    "MERCURY": 1.20,
    "MARS": 1.15,
    "SUN": 0.75,
    "VENUS": 0.75,
    "JUPITER": 0.45,
    "SATURN": 0.45,
    "URANUS": 0.25,
    "NEPTUNE": 0.22,
    "PLUTO": 0.20,
}
DAILY_PERFORMANCE_ADVICE_METRICS = {
    "DRIVE": "drive",
    "FLOW": "flow",
    "INSPIRATION": "inspiration",
}
DAILY_PERFORMANCE_FRICTION_ADVICE_FIELD = "friction"
DAILY_PERFORMANCE_MARS_ADVICE_FIELD = "marsActivity"
DAILY_PERFORMANCE_HIGH_THRESHOLD = 70
DAILY_PERFORMANCE_LOW_THRESHOLD = 35
DAILY_PERFORMANCE_BALANCED_SPREAD = 10
DAILY_PERFORMANCE_DUAL_DELTA = 5
DAILY_PERFORMANCE_DUAL_HIGH_MIN = 60
DAILY_PERFORMANCE_DUAL_LOW_MAX = 45
DAILY_PERFORMANCE_FRICTION_HIGH_THRESHOLD = 65
DAILY_PERFORMANCE_FRICTION_SPIKE_THRESHOLD = 80
DAILY_PERFORMANCE_ENVIRONMENT_RATIO = 0.20
DAILY_PERFORMANCE_ENVIRONMENT_PLANETS = (
    "MERCURY",
    "VENUS",
    "MARS",
    "JUPITER",
    "SATURN",
    "URANUS",
    "NEPTUNE",
    "PLUTO",
)
DAILY_PERFORMANCE_MARS_HARD_ENVIRONMENT_PLANETS = ("SATURN", "URANUS", "NEPTUNE", "PLUTO")
DAILY_PERFORMANCE_PRESSURE_FLOOR_SCORE_THRESHOLD = -25
DAILY_PERFORMANCE_PRESSURE_FLOOR_BASE = 10.0
DAILY_PERFORMANCE_PRESSURE_FLOOR_MIN = 25.0
DAILY_PERFORMANCE_PRESSURE_FLOOR_MAX = 55.0
DAILY_PERFORMANCE_PRESSURE_FLOOR_SCORE_RATE = 0.6
DAILY_PERFORMANCE_PRESSURE_FLOOR_PRIORITY_BASE = 5
DAILY_PERFORMANCE_PRESSURE_FLOOR_PRIORITY_RATE = 1.5
DAILY_PERFORMANCE_PRESSURE_FLOOR_TRANSIT_PLANETS = frozenset(COUNTDOWN_SHORT_PLANETS)
DAILY_PERFORMANCE_ASPECT_ORBS = {
    int(aspect["angle"]): float(aspect["orb"])
    for aspect in ASPECT_DEFS
}


def _daily_performance_action_advice_rows() -> pd.DataFrame:
    return MASTER_DATAFRAMES.get("daily_performance_action_advice", pd.DataFrame())


def _daily_performance_metric_extremes(point: dict[str, Any]) -> tuple[str, float, str, float]:
    values = {
        metric: float(point.get(field) or 0)
        for metric, field in DAILY_PERFORMANCE_ADVICE_METRICS.items()
    }
    high_metric, high_score = max(values.items(), key=lambda item: item[1])
    low_metric, low_score = min(values.items(), key=lambda item: item[1])
    return high_metric, high_score, low_metric, low_score


def _daily_performance_mars_context(point: dict[str, Any]) -> tuple[float, str]:
    score = float(point.get(DAILY_PERFORMANCE_MARS_ADVICE_FIELD) or 0)
    if score >= 70:
        return score, "HIGH"
    if score <= 35:
        return score, "LOW"
    return score, "NEUTRAL"


def _daily_performance_friction_context(point: dict[str, Any]) -> tuple[float, str]:
    score = float(point.get(DAILY_PERFORMANCE_FRICTION_ADVICE_FIELD) or 0)
    if score >= DAILY_PERFORMANCE_FRICTION_SPIKE_THRESHOLD:
        return score, "SPIKE"
    if score >= DAILY_PERFORMANCE_FRICTION_HIGH_THRESHOLD:
        return score, "HIGH"
    if score <= DAILY_PERFORMANCE_LOW_THRESHOLD:
        return score, "LOW"
    return score, "NEUTRAL"


def _daily_performance_action_pattern(point: dict[str, Any]) -> dict[str, Any]:
    scores = {
        metric: float(point.get(field) or 0)
        for metric, field in DAILY_PERFORMANCE_ADVICE_METRICS.items()
    }
    ordered_high = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    ordered_low = sorted(scores.items(), key=lambda item: item[1])
    primary_high, high_score = ordered_high[0]
    secondary_high, secondary_high_score = ordered_high[1]
    primary_low, low_score = ordered_low[0]
    secondary_low, secondary_low_score = ordered_low[1]
    spread = high_score - low_score
    average_score = sum(scores.values()) / max(1, len(scores))
    friction_score, friction_state = _daily_performance_friction_context(point)
    mars_score, mars_state = _daily_performance_mars_context(point)

    all_high = min(scores.values()) >= DAILY_PERFORMANCE_HIGH_THRESHOLD
    all_low = max(scores.values()) <= DAILY_PERFORMANCE_LOW_THRESHOLD
    is_balanced = spread < DAILY_PERFORMANCE_BALANCED_SPREAD
    is_dual_high = (
        abs(high_score - secondary_high_score) <= DAILY_PERFORMANCE_DUAL_DELTA
        and min(high_score, secondary_high_score) >= DAILY_PERFORMANCE_DUAL_HIGH_MIN
    )
    is_dual_low = (
        abs(low_score - secondary_low_score) <= DAILY_PERFORMANCE_DUAL_DELTA
        and max(low_score, secondary_low_score) <= DAILY_PERFORMANCE_DUAL_LOW_MAX
    )

    if friction_state == "SPIKE":
        pattern_type = "FRICTION_SPIKE"
    elif friction_state == "HIGH" and all_low:
        pattern_type = "FRICTION_HIGH_ALL_LOW"
    elif friction_state == "HIGH" and all_high:
        pattern_type = "FRICTION_HIGH_ALL_HIGH"
    elif friction_state == "HIGH":
        pattern_type = "FRICTION_WITH_HIGH"
    elif all_low:
        pattern_type = "ALL_LOW"
    elif all_high:
        pattern_type = "ALL_HIGH"
    elif is_balanced:
        pattern_type = "BALANCED"
    elif is_dual_high:
        pattern_type = "DUAL_HIGH"
    elif is_dual_low:
        pattern_type = "DUAL_LOW"
    else:
        pattern_type = "PAIR_HIGH_LOW"

    if all_high:
        overall_level = "HIGH"
    elif all_low:
        overall_level = "LOW"
    elif is_balanced and average_score >= 58:
        overall_level = "SLIGHT_POSITIVE"
    elif is_balanced and average_score <= 42:
        overall_level = "SLIGHT_HEAVY"
    elif is_balanced:
        overall_level = "NEUTRAL"
    else:
        overall_level = "MIXED"

    return {
        "patternType": pattern_type,
        "primaryHighMetric": primary_high,
        "secondaryHighMetric": secondary_high if pattern_type in {"DUAL_HIGH", "ALL_HIGH", "FRICTION_HIGH_ALL_HIGH"} else "",
        "primaryLowMetric": primary_low,
        "secondaryLowMetric": secondary_low if pattern_type in {"DUAL_LOW", "ALL_LOW", "FRICTION_HIGH_ALL_LOW"} else "",
        "highMetric": primary_high,
        "highScore": high_score,
        "lowMetric": primary_low,
        "lowScore": low_score,
        "overallLevel": overall_level,
        "spread": spread,
        "averageScore": average_score,
        "frictionScore": friction_score,
        "frictionState": friction_state,
        "marsScore": mars_score,
        "marsState": mars_state,
    }


def _daily_advice_column(row: dict[str, Any], column: str) -> str:
    return _safe_text(row, column).strip().upper()


def _daily_advice_matches(value: str, expected: str) -> bool:
    if pd.isna(value):
        return True
    normalized_value = str(value or "").strip().upper()
    normalized_expected = str(expected or "").strip().upper()
    return not normalized_value or normalized_value == normalized_expected


def _daily_performance_pattern_rows(rows: pd.DataFrame, pattern: dict[str, Any], hour: int) -> pd.DataFrame:
    if rows.empty or "Pattern_Type" not in rows.columns:
        return pd.DataFrame()

    working = rows.copy()
    for column in (
        "Pattern_Type",
        "Primary_High_Metric",
        "Secondary_High_Metric",
        "Primary_Low_Metric",
        "Secondary_Low_Metric",
        "Overall_Level",
        "Friction_State",
        "Mars_State",
        "Time_Block",
    ):
        if column not in working.columns:
            working[column] = ""

    filtered = working[
        (working["Pattern_Type"].map(lambda value: str(value).strip().upper()) == pattern["patternType"])
        & (working["Time_Block"].map(lambda value: str(value).strip().upper()).isin({"", "ANY", f"{hour % 24:02d}:00"}))
    ]
    if filtered.empty:
        return filtered

    checks = (
        ("Primary_High_Metric", pattern["primaryHighMetric"]),
        ("Secondary_High_Metric", pattern["secondaryHighMetric"]),
        ("Primary_Low_Metric", pattern["primaryLowMetric"]),
        ("Secondary_Low_Metric", pattern["secondaryLowMetric"]),
        ("Overall_Level", pattern["overallLevel"]),
        ("Friction_State", pattern["frictionState"]),
        ("Mars_State", pattern["marsState"]),
    )
    for column, expected in checks:
        filtered = filtered[filtered[column].map(lambda value, expected=expected: _daily_advice_matches(value, expected))]
        if filtered.empty:
            break
    return filtered


def _daily_performance_action_advice(point: dict[str, Any], hour: int) -> dict[str, Any]:
    advice_df = _daily_performance_action_advice_rows()
    pattern = _daily_performance_action_pattern(point)
    high_metric = pattern["highMetric"]
    high_score = pattern["highScore"]
    low_metric = pattern["lowMetric"]
    low_score = pattern["lowScore"]
    mars_score = pattern["marsScore"]
    mars_state = pattern["marsState"]
    friction_score = pattern["frictionScore"]
    friction_state = pattern["frictionState"]
    fallback = {
        "adviceId": "",
        "timeBlock": "ANY",
        "patternType": pattern["patternType"],
        "primaryHighMetric": pattern["primaryHighMetric"],
        "secondaryHighMetric": pattern["secondaryHighMetric"],
        "primaryLowMetric": pattern["primaryLowMetric"],
        "secondaryLowMetric": pattern["secondaryLowMetric"],
        "overallLevel": pattern["overallLevel"],
        "highMetric": high_metric,
        "highScore": round(high_score),
        "lowMetric": low_metric,
        "lowScore": round(low_score),
        "frictionScore": round(friction_score),
        "frictionState": friction_state,
        "marsScore": round(mars_score),
        "marsState": mars_state,
        "actionMode": "Balanced",
        "headline": "負荷を見ながら整える時間",
        "recommendedAction": "大きく広げすぎず、今の状態に合わせて作業量を調整してください。",
        "thinkingStyle": "一つの作業に絞り、反応を見ながら進める使い方が向いています。",
        "restGuidance": "疲れを感じる場合は短い休憩を先に入れてください。",
        "variant": "fallback",
    }
    if advice_df.empty:
        return fallback

    rows = advice_df.copy()
    candidates = _daily_performance_pattern_rows(rows, pattern, hour)
    if candidates.empty:
        candidates = pd.DataFrame()

    rows["_high"] = rows["High_Metric"].map(lambda value: str(value).strip().upper())
    rows["_low"] = rows["Low_Metric"].map(lambda value: str(value).strip().upper())
    rows["_time"] = rows["Time_Block"].map(lambda value: str(value).strip().upper())
    if candidates.empty:
        metric_rows = rows[
            (rows["_high"] == high_metric)
            & (rows["_low"] == low_metric)
            & (rows["_time"].isin({"ANY", f"{hour % 24:02d}:00"}))
        ]
        threshold_rows = metric_rows[
            (metric_rows["High_Min"].map(lambda value: _normalize_int(value) or 0) <= high_score)
            & (metric_rows["Low_Max"].map(lambda value: _normalize_int(value) or 100) >= low_score)
        ]
        candidates = threshold_rows if not threshold_rows.empty else metric_rows
    if candidates.empty:
        return fallback

    candidates = candidates.sort_values(
        by=["Priority", "Advice_ID"],
        ascending=[False, True],
        kind="stable",
    ).reset_index(drop=True)
    row = dict(candidates.iloc[(hour // DAILY_PERFORMANCE_SAMPLE_STEP_HOURS) % len(candidates)])
    return {
        "adviceId": _safe_text(row, "Advice_ID"),
        "timeBlock": _safe_text(row, "Time_Block", "ANY"),
        "patternType": pattern["patternType"],
        "primaryHighMetric": pattern["primaryHighMetric"],
        "secondaryHighMetric": pattern["secondaryHighMetric"],
        "primaryLowMetric": pattern["primaryLowMetric"],
        "secondaryLowMetric": pattern["secondaryLowMetric"],
        "overallLevel": pattern["overallLevel"],
        "highMetric": high_metric,
        "highScore": round(high_score),
        "lowMetric": low_metric,
        "lowScore": round(low_score),
        "frictionScore": round(friction_score),
        "frictionState": friction_state,
        "marsScore": round(mars_score),
        "marsState": mars_state,
        "actionMode": _safe_text(row, "Action_Mode"),
        "headline": _safe_text(row, "Headline"),
        "impactType": _safe_text(row, "Impact_Type"),
        "recommendedAction": "",
        "thinkingStyle": _safe_text(row, "Thinking_Style"),
        "restGuidance": _safe_text(row, "Rest_Guidance"),
        "variant": _safe_text(row, "Variant"),
    }


def _pressure_load_summary(items: list[dict[str, Any]]) -> dict[str, Any]:
    scores = [
        abs(_normalize_float(item.get("pressure_score", item.get("pressureScore"))) or 0)
        for item in items
    ]
    load_score = round(sum(scores[:5]))
    fallback = {
        "adviceId": "PRESSURE_NONE",
        "patternType": "PRESSURE_LOAD",
        "overallLevel": 0,
        "loadScore": load_score,
        "headline": "強い負荷は目立ちません",
        "actionMode": "通常運転",
        "restGuidance": "通常運転で問題ありません。",
    }
    advice_df = _daily_performance_action_advice_rows()
    if advice_df.empty or "Pattern_Type" not in advice_df.columns:
        return fallback
    rows = advice_df.copy()
    rows = rows[rows["Pattern_Type"].map(lambda value: str(value).strip().upper()) == "PRESSURE_LOAD"]
    if rows.empty:
        return fallback
    candidates = rows[
        (rows["Min_Score"].map(lambda value: _normalize_float(value) if _normalize_float(value) is not None else float("-inf")) <= load_score)
        & (rows["Max_Score"].map(lambda value: _normalize_float(value) if _normalize_float(value) is not None else float("inf")) >= load_score)
    ]
    if candidates.empty:
        return fallback
    row = dict(candidates.sort_values(by=["Priority", "Advice_ID"], ascending=[False, True], kind="stable").iloc[0])
    return {
        "adviceId": _safe_text(row, "Advice_ID"),
        "patternType": "PRESSURE_LOAD",
        "overallLevel": _normalize_int(row.get("Overall_Level")) or 0,
        "loadScore": load_score,
        "headline": _safe_text(row, "Headline"),
        "actionMode": _safe_text(row, "Action_Mode"),
        "restGuidance": _safe_text(row, "Rest_Guidance"),
        "minScore": _normalize_float(row.get("Min_Score")),
        "maxScore": _normalize_float(row.get("Max_Score")),
    }


def _pressure_load_group_summary(items: list[dict[str, Any]]) -> dict[str, Any]:
    """Return separate short/long pressure comments without changing the legacy total."""
    groups = {
        "short": {"label": "短期", "planets": COUNTDOWN_SHORT_PLANETS},
        "long": {"label": "中長期", "planets": COUNTDOWN_LONG_PLANETS},
    }
    result: dict[str, Any] = {}
    for key, group in groups.items():
        group_items = []
        for item in items:
            target = item.get("target") if isinstance(item.get("target"), dict) else item
            if _normalize_planet(target.get("T_Planet")) in group["planets"]:
                group_items.append(item)
        scores = []
        for item in group_items:
            target = item.get("target") if isinstance(item.get("target"), dict) else item
            score = item.get("pressure_score", item.get("pressureScore"))
            if score is None:
                score = target.get("Pressure_Score")
            scores.append(abs(_normalize_float(score) or 0))
        load_score = round(sum(scores))
        if load_score >= 80:
            level = "high"
            comment = f"{group['label']}の負荷が重なっています。予定を詰め込みすぎず、回復の余白を確保してください。"
        elif load_score > 0:
            level = "moderate"
            comment = f"{group['label']}に軽〜中程度の負荷があります。優先順位を絞って進めてください。"
        else:
            level = "low"
            comment = f"{group['label']}の強い負荷は目立ちません。通常のペースで問題ありません。"
        result[key] = {
            "label": group["label"],
            "loadScore": load_score,
            "itemCount": len(group_items),
            "level": level,
            "comment": comment,
        }

    short_level = result["short"]["level"]
    long_level = result["long"]["level"]
    if short_level == "high" and long_level == "high":
        overall_comment = "短期と中長期の両方で高い負荷が重なっています。新しい予定を増やさず、まず回復を優先してください。"
    elif short_level == "high":
        overall_comment = "高い負荷は短期側に集中しています。目の前の予定を小分けにして、短い休息を挟んでください。"
    elif long_level == "high":
        overall_comment = "高い負荷は中長期側に集中しています。先を急いで結論を出さず、長期の課題を分割して扱ってください。"
    elif short_level == "low" and long_level == "low":
        overall_comment = "短期・中長期ともに強い負荷はあまりありません。通常のペースで整えていけます。"
    elif short_level == "moderate" and long_level == "moderate":
        overall_comment = "短期と中長期の両方に負荷があります。無理を一つに絞り、余白を残して進めてください。"
    else:
        overall_comment = "負荷は一方に偏っています。短期と中長期のどちらに余力が必要かを確認して調整してください。"
    return {"groups": result, "overallComment": overall_comment}


def _birth_input_cache_key(birth_input: BirthInput) -> tuple[Any, ...]:
    return (
        birth_input.birth_date,
        birth_input.birth_time,
        bool(birth_input.birth_time_unknown),
        birth_input.birthplace,
        float(birth_input.latitude),
        float(birth_input.longitude),
        float(birth_input.timezone_offset),
    )


@contextmanager
def _natal_data_request_cache() -> Iterator[dict[tuple[str, tuple[Any, ...]], Any]]:
    active_cache = _NATAL_DATA_REQUEST_CACHE.get()
    if active_cache is not None:
        yield active_cache
        return

    request_cache: dict[tuple[str, tuple[Any, ...]], Any] = {}
    token = _NATAL_DATA_REQUEST_CACHE.set(request_cache)
    try:
        yield request_cache
    finally:
        _NATAL_DATA_REQUEST_CACHE.reset(token)


def _chart_rows_for_request(birth_input: BirthInput) -> dict[str, list[list[Any]]]:
    cache = _NATAL_DATA_REQUEST_CACHE.get()
    cache_key = ("chart_rows", _birth_input_cache_key(birth_input))
    if cache is not None and cache_key in cache:
        return cache[cache_key]

    chart_rows = build_chart_rows(birth_input)
    if cache is not None:
        cache[cache_key] = chart_rows
    return chart_rows


def _build_natal_planet_rows(birth_input: BirthInput) -> list[dict[str, Any]]:
    cache = _NATAL_DATA_REQUEST_CACHE.get()
    cache_key = ("natal_planet_rows", _birth_input_cache_key(birth_input))
    if cache is not None and cache_key in cache:
        return cache[cache_key]

    chart_rows = _chart_rows_for_request(birth_input)
    natal_rows: list[dict[str, Any]] = []
    for row in chart_rows["planets"]:
        if len(row) < 6:
            continue
        longitude = _normalize_float(row[1])
        if longitude is None:
            continue
        natal_rows.append({
            "planet": _normalize_planet(row[0]),
            "longitude": longitude,
            "house": _normalize_int(row[5]) or 1,
        })
    if cache is not None:
        cache[cache_key] = natal_rows
    return natal_rows


def _build_natal_aspect_points(birth_input: BirthInput) -> list[dict[str, Any]]:
    cache = _NATAL_DATA_REQUEST_CACHE.get()
    cache_key = ("natal_aspect_points", _birth_input_cache_key(birth_input))
    if cache is not None and cache_key in cache:
        return cache[cache_key]

    chart_rows = _chart_rows_for_request(birth_input)
    natal_rows: list[dict[str, Any]] = []
    for row in chart_rows["planets"]:
        if len(row) < 6:
            continue
        longitude = _normalize_float(row[1])
        if longitude is None:
            continue
        natal_rows.append({
            "planet": _normalize_planet(row[0]),
            "longitude": longitude,
            "house": _normalize_int(row[5]) or 1,
        })

    if not birth_input.birth_time_unknown:
        angle_house = {"ASC": 1, "MC": 10}
        for row in chart_rows["angles"]:
            if len(row) < 2:
                continue
            point = _normalize_planet(row[0])
            longitude = _normalize_float(row[1])
            if point not in angle_house or longitude is None:
                continue
            natal_rows.append({
                "planet": point,
                "longitude": longitude,
                "house": angle_house[point],
            })
    if cache is not None:
        cache[cache_key] = natal_rows
    return natal_rows


def _build_lunar_countdown_candidate_rows(
    birth_input: BirthInput | None,
    current_dt: datetime | date | None,
) -> list[dict[str, Any]]:
    if birth_input is None or swe is None or not hasattr(birth_input, "timezone_offset"):
        return []
    sample_local_dt = _countdown_scan_start(current_dt)
    transit_longitude, is_retrograde = _calc_transit_planet_state(
        "MOON", sample_local_dt, birth_input.timezone_offset
    )
    candidates: list[dict[str, Any]] = []
    for natal_point in _build_natal_aspect_points(birth_input):
        natal_longitude = natal_point["longitude"]
        angle_diff = get_angle_diff(transit_longitude, natal_longitude)
        for exact_angle in COUNTDOWN_ASPECT_ANGLES:
            orb_diff = abs(angle_diff - exact_angle)
            orb_status = _classify_orb_status(
                sample_local_dt,
                birth_input.timezone_offset,
                natal_longitude,
                exact_angle,
                transit_planet="MOON",
            )
            interpretation = get_aspect_interpretation(
                t_planet="MOON",
                n_planet=natal_point["planet"],
                angle=exact_angle,
                house=natal_point["house"],
                is_retrograde=is_retrograde,
                orb_status=orb_status,
            )
            if not interpretation or _safe_number(interpretation, "Score_Impact") == 0:
                continue
            interpretation = dict(interpretation)
            interpretation["_input"] = {
                "t_planet": "MOON",
                "n_planet": natal_point["planet"],
                "angle": exact_angle,
                "house": natal_point["house"],
                "orb": orb_diff,
                "natal_longitude": natal_longitude,
                "timezone_offset": birth_input.timezone_offset,
                "sample_time": sample_local_dt.strftime("%H:%M"),
                "time_slot_id": "LUNAR_COUNTDOWN_2H",
            }
            interpretation["_orb_status"] = orb_status
            candidates.append(interpretation)
    return candidates


def _countdown_interpretations_with_lunar_candidates(
    interpretations: list[dict[str, Any]],
    birth_input: BirthInput | None,
    current_dt: datetime | date | None,
) -> list[dict[str, Any]]:
    non_lunar_rows = [
        row for row in interpretations if _normalize_planet(row.get("T_Planet")) != "MOON"
    ]
    lunar_rows = _build_lunar_countdown_candidate_rows(birth_input, current_dt)
    if not lunar_rows:
        lunar_rows = [
            row for row in interpretations if _normalize_planet(row.get("T_Planet")) == "MOON"
        ]
    return [*non_lunar_rows, *lunar_rows]


def _local_sample_datetime(target_date: date, sample_hour: int, day_offset: int = 0) -> datetime:
    return datetime.combine(target_date + timedelta(days=day_offset), dt_time(hour=sample_hour))


def _calc_transit_moon_state(sample_local_dt: datetime, timezone_offset: float) -> tuple[float, bool]:
    return _calc_transit_planet_state("MOON", sample_local_dt, timezone_offset)


def _transit_planet_ids() -> dict[str, int]:
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


def _calc_transit_planet_state(planet: str, sample_local_dt: datetime, timezone_offset: float) -> tuple[float, bool]:
    longitude, speed = _calc_transit_planet_motion(planet, sample_local_dt, timezone_offset)
    return longitude, speed < 0


def _calc_transit_planet_motion(planet: str, sample_local_dt: datetime, timezone_offset: float) -> tuple[float, float]:
    normalized_planet = _normalize_planet(planet)
    normalized_timezone_offset = float(timezone_offset)
    cache = _TRANSIT_MOTION_REQUEST_CACHE.get()
    cache_key = (normalized_planet, sample_local_dt, normalized_timezone_offset)
    if cache is not None and cache_key in cache:
        return cache[cache_key]

    planet_ids = _transit_planet_ids()
    planet_id = planet_ids[normalized_planet]
    utc_dt = sample_local_dt - timedelta(hours=normalized_timezone_offset)
    hour_decimal = utc_dt.hour + (utc_dt.minute / 60) + (utc_dt.second / 3600)
    jd = swe.julday(utc_dt.year, utc_dt.month, utc_dt.day, hour_decimal)
    result = swe.calc_ut(jd, planet_id, swe.FLG_SPEED)
    motion = (float(result[0][0]), float(result[0][3]))
    if cache is not None:
        cache[cache_key] = motion
    return motion


@contextmanager
def _transit_motion_request_cache() -> Iterator[dict[tuple[str, datetime, float], tuple[float, float]]]:
    active_cache = _TRANSIT_MOTION_REQUEST_CACHE.get()
    if active_cache is not None:
        yield active_cache
        return

    request_cache: dict[tuple[str, datetime, float], tuple[float, float]] = {}
    token = _TRANSIT_MOTION_REQUEST_CACHE.set(request_cache)
    try:
        yield request_cache
    finally:
        _TRANSIT_MOTION_REQUEST_CACHE.reset(token)


@contextmanager
def _countdown_orb_request_cache() -> Iterator[
    dict[tuple[str, datetime, float, float, int], tuple[float, bool]]
]:
    active_cache = _COUNTDOWN_ORB_REQUEST_CACHE.get()
    if active_cache is not None:
        yield active_cache
        return

    request_cache: dict[tuple[str, datetime, float, float, int], tuple[float, bool]] = {}
    token = _COUNTDOWN_ORB_REQUEST_CACHE.set(request_cache)
    try:
        yield request_cache
    finally:
        _COUNTDOWN_ORB_REQUEST_CACHE.reset(token)


def _motion_status_from_speed(
    planet: str,
    speed: float,
    future_speed: float | None = None,
) -> str:
    normalized_planet = _normalize_planet(planet)
    threshold = PLANET_STATION_SPEED_THRESHOLDS.get(normalized_planet)
    if (
        threshold is not None
        and future_speed is not None
        and abs(speed) <= threshold
        and ((speed >= 0 > future_speed) or (speed <= 0 < future_speed))
    ):
        return "stationary"
    return "retrograde" if speed < 0 else "direct"


def _format_motion_change_date(value: date) -> str:
    return f"{value.year}年{value.month}月{value.day}日"


def _retrograde_calendar_rows(
    current_dt: datetime | date | None = None,
    planet: str | None = None,
    event_type: str | None = None,
) -> list[dict[str, Any]]:
    _ensure_calendar_indexes()
    target_date = current_dt.date() if isinstance(current_dt, datetime) else current_dt
    if target_date is None:
        target_date = _app_today()
    normalized_planet = _normalize_planet(planet) if planet else ""
    normalized_event = str(event_type or "").strip().upper()
    indexed_rows = (_RETROGRADE_CALENDAR_INDEX or {}).get(
        (normalized_planet, normalized_event),
        (),
    )
    return [dict(row) for event_date, row in indexed_rows if event_date >= target_date]


def _next_motion_change_from_calendar(
    planet: str,
    sample_local_dt: datetime,
    current_speed: float,
) -> dict[str, str] | None:
    event_type = "RETROGRADE_START" if current_speed >= 0 else "DIRECT_START"
    rows = _retrograde_calendar_rows(sample_local_dt, planet=planet, event_type=event_type)
    if not rows:
        return None
    row = rows[0]
    event_date = _parse_transit_calendar_date(row.get("Event_Date"))
    if event_date is None:
        return None
    type_label = "次の逆行開始日" if event_type == "RETROGRADE_START" else "次の順行開始日"
    date_label = _format_motion_change_date(event_date)
    degree_display = _safe_text(row, "Degree_Display")
    return {
        "type": event_type.lower(),
        "date": event_date.isoformat(),
        "label": f"{type_label}: {date_label}{f' {degree_display}' if degree_display else ''}",
    }


def _next_motion_change(
    planet: str,
    sample_local_dt: datetime,
    timezone_offset: float,
    current_speed: float,
) -> dict[str, str] | None:
    calendar_change = _next_motion_change_from_calendar(planet, sample_local_dt, current_speed)
    if calendar_change:
        return calendar_change
    target_retrograde = current_speed >= 0
    previous_is_retrograde = current_speed < 0

    for day in range(1, MOTION_CHANGE_LOOKAHEAD_DAYS + 1):
        check_dt = sample_local_dt + timedelta(days=day)
        _, speed = _calc_transit_planet_motion(planet, check_dt, timezone_offset)
        is_retrograde = speed < 0
        if is_retrograde == previous_is_retrograde:
            continue
        if target_retrograde and is_retrograde:
            event_date = check_dt.date()
            return {
                "type": "retrograde_start",
                "date": event_date.isoformat(),
                "label": f"次の逆行開始日: {_format_motion_change_date(event_date)}",
            }
        if not target_retrograde and not is_retrograde:
            event_date = check_dt.date()
            return {
                "type": "direct_start",
                "date": event_date.isoformat(),
                "label": f"次の順行開始日: {_format_motion_change_date(event_date)}",
            }
        previous_is_retrograde = is_retrograde
    return None


def build_current_retrograde_planets(
    current_dt: datetime | date | None = None,
    timezone_offset: float = 0,
) -> list[str]:
    if swe is None:
        raise RuntimeError("swisseph is not installed")

    if isinstance(current_dt, datetime):
        sample_local_dt = current_dt
    elif isinstance(current_dt, date):
        sample_local_dt = datetime.combine(current_dt, dt_time(hour=12))
    else:
        sample_local_dt = _app_now()

    retrograde_planets: list[str] = []
    for planet in TRANSIT_PLANET_ORDER:
        _, is_retrograde = _calc_transit_planet_state(
            planet,
            sample_local_dt,
            timezone_offset,
        )
        if is_retrograde:
            retrograde_planets.append(planet)
    return retrograde_planets


def build_current_planet_motion_indicators(
    current_dt: datetime | date | None = None,
    timezone_offset: float = 0,
) -> list[dict[str, Any]]:
    if swe is None:
        raise RuntimeError("swisseph is not installed")

    if isinstance(current_dt, datetime):
        sample_local_dt = current_dt
    elif isinstance(current_dt, date):
        sample_local_dt = datetime.combine(current_dt, dt_time(hour=12))
    else:
        sample_local_dt = _app_now()

    indicators: list[dict[str, Any]] = []
    for planet in MOTION_INDICATOR_PLANETS:
        longitude, speed = _calc_transit_planet_motion(
            planet,
            sample_local_dt,
            timezone_offset,
        )
        _, future_speed = _calc_transit_planet_motion(
            planet,
            sample_local_dt + timedelta(days=STATIONARY_LOOKAHEAD_DAYS),
            timezone_offset,
        )
        motion_change = _next_motion_change(planet, sample_local_dt, timezone_offset, speed)
        indicators.append({
            "planet": planet,
            "label": PLANET_MOTION_LABELS.get(planet, planet),
            "status": _motion_status_from_speed(planet, speed, future_speed),
            "speed": round(speed, 6),
            "longitude": round(longitude, 2),
            "next_motion_change": motion_change,
            "motion_tooltip": motion_change.get("label") if motion_change else "",
        })
    return indicators


def _dashboard_planet_motion(
    birth_input: BirthInput | None,
    current_dt: datetime | date | None,
) -> list[dict[str, Any]]:
    if birth_input is None or swe is None:
        return []
    try:
        return build_current_planet_motion_indicators(
            current_dt,
            birth_input.timezone_offset,
        )
    except Exception as exc:
        LOGGER.warning("Failed to build planet motion indicators: %s", exc)
        return []


def _dashboard_retrograde_calendar(current_dt: datetime | date | None) -> list[dict[str, Any]]:
    rows = _retrograde_calendar_rows(current_dt)
    calendar: list[dict[str, Any]] = []
    for row in rows:
        event_type = str(row.get("Event_Type") or "").strip().upper()
        event_date = _parse_transit_calendar_date(row.get("Event_Date"))
        calendar.append({
            "planet": _safe_text(row, "Planet"),
            "planet_label": _safe_text(row, "Planet_Label") or PLANET_MOTION_LABELS.get(_normalize_planet(row.get("Planet")), ""),
            "event_type": event_type,
            "event_label": "逆行開始" if event_type == "RETROGRADE_START" else "順行開始",
            "event_date": event_date.isoformat() if event_date else _safe_text(row, "Event_Date"),
            "event_datetime_jst": _safe_text(row, "Event_DateTime_JST"),
            "sign": _safe_text(row, "Sign_ID"),
            "sign_label": _safe_text(row, "Sign_Label"),
            "degree_in_sign": _safe_number(row, "Degree_In_Sign"),
            "degree_display": _safe_text(row, "Degree_Display"),
            "display_label": _safe_text(row, "Display_Label"),
        })
    return calendar


def _celestial_event_start(current_dt: datetime | date | None) -> datetime:
    if isinstance(current_dt, datetime):
        return current_dt.replace(microsecond=0)
    if isinstance(current_dt, date):
        return datetime.combine(current_dt, dt_time.min)
    return _app_now().replace(microsecond=0)


def _signed_longitude_delta(start: float, end: float) -> float:
    return ((end - start + 180.0) % 360.0) - 180.0


def _crossing_targets(start_value: float, end_value: float, targets: list[float]) -> list[tuple[float, float]]:
    low, high = sorted((start_value, end_value))
    crossings: list[tuple[float, float]] = []
    for target in targets:
        first_cycle = int((low - target) // 360) - 1
        last_cycle = int((high - target) // 360) + 1
        for cycle in range(first_cycle, last_cycle + 1):
            unwrapped_target = target + (cycle * 360)
            if low < unwrapped_target <= high:
                crossings.append((target % 360, unwrapped_target))
    return crossings


def _refine_planet_crossing(
    planet: str,
    start_dt: datetime,
    end_dt: datetime,
    start_unwrapped: float,
    target_unwrapped: float,
    timezone_offset: float,
) -> datetime:
    ascending = target_unwrapped > start_unwrapped
    low_dt, high_dt = start_dt, end_dt
    start_longitude, _ = _calc_transit_planet_motion(planet, start_dt, timezone_offset)
    for _ in range(12):
        mid_dt = low_dt + ((high_dt - low_dt) / 2)
        longitude, _ = _calc_transit_planet_motion(planet, mid_dt, timezone_offset)
        mid_unwrapped = start_unwrapped + _signed_longitude_delta(start_longitude, longitude)
        if (mid_unwrapped < target_unwrapped) == ascending:
            low_dt = mid_dt
        else:
            high_dt = mid_dt
    return (low_dt + ((high_dt - low_dt) / 2)).replace(microsecond=0)


def _refine_lunation_crossing(
    start_dt: datetime,
    end_dt: datetime,
    start_unwrapped: float,
    target_unwrapped: float,
    timezone_offset: float,
) -> datetime:
    ascending = target_unwrapped > start_unwrapped
    start_moon, _ = _calc_transit_planet_motion("MOON", start_dt, timezone_offset)
    start_sun, _ = _calc_transit_planet_motion("SUN", start_dt, timezone_offset)
    start_relative = (start_moon - start_sun) % 360
    low_dt, high_dt = start_dt, end_dt
    for _ in range(12):
        mid_dt = low_dt + ((high_dt - low_dt) / 2)
        moon, _ = _calc_transit_planet_motion("MOON", mid_dt, timezone_offset)
        sun, _ = _calc_transit_planet_motion("SUN", mid_dt, timezone_offset)
        relative = (moon - sun) % 360
        mid_unwrapped = start_unwrapped + _signed_longitude_delta(start_relative, relative)
        if (mid_unwrapped < target_unwrapped) == ascending:
            low_dt = mid_dt
        else:
            high_dt = mid_dt
    return (low_dt + ((high_dt - low_dt) / 2)).replace(microsecond=0)


def _celestial_planet_samples(
    start_dt: datetime,
    end_dt: datetime,
    timezone_offset: float,
) -> dict[str, list[tuple[datetime, float, float, float]]]:
    samples: dict[str, list[tuple[datetime, float, float, float]]] = {}
    for planet in TRANSIT_PLANET_ORDER:
        planet_samples: list[tuple[datetime, float, float, float]] = []
        sample_dt = start_dt
        previous_longitude: float | None = None
        unwrapped = 0.0
        step_hours = 6 if planet in {"SUN", "MOON"} else 12 if planet in {"MERCURY", "VENUS"} else 24
        while sample_dt <= end_dt:
            longitude, speed = _calc_transit_planet_motion(planet, sample_dt, timezone_offset)
            if previous_longitude is None:
                unwrapped = longitude
            else:
                unwrapped += _signed_longitude_delta(previous_longitude, longitude)
            planet_samples.append((sample_dt, longitude, speed, unwrapped))
            previous_longitude = longitude
            sample_dt += timedelta(hours=step_hours)
        if planet_samples[-1][0] < end_dt:
            longitude, speed = _calc_transit_planet_motion(planet, end_dt, timezone_offset)
            unwrapped += _signed_longitude_delta(previous_longitude or longitude, longitude)
            planet_samples.append((end_dt, longitude, speed, unwrapped))
        samples[planet] = planet_samples
    return samples


def _celestial_event_item(
    *,
    event_type: str,
    event_dt: datetime,
    start_dt: datetime,
    title: str,
    note: str,
    priority: int,
    classification: str = "neutral",
    **details: Any,
) -> dict[str, Any]:
    hours_remaining = max(0.0, (event_dt - start_dt).total_seconds() / 3600)
    return {
        "event_id": "|".join([
            event_type,
            event_dt.isoformat(timespec="seconds"),
            str(details.get("transit_planet") or details.get("planet") or ""),
            str(details.get("natal_planet") or details.get("house") or details.get("sign") or ""),
            str(details.get("aspect_angle") or ""),
        ]),
        "event_type": event_type,
        "event_datetime": event_dt.isoformat(timespec="seconds"),
        "event_date": event_dt.date().isoformat(),
        "hours_remaining": round(hours_remaining, 2),
        "days_remaining": int(ceil(hours_remaining / 24)),
        "title": title,
        "note": note,
        "priority": priority,
        "classification": classification,
        **details,
    }


def _celestial_event_genres(category: Any) -> list[str]:
    genre_by_category = {
        "LOVE": "love",
        "RELATIONSHIP": "love",
        "PARTNERSHIP": "love",
        "FAMILY": "love",
        "MONEY": "money",
        "WORK": "work",
    }
    genres: list[str] = []
    for value in str(category or "").split(","):
        genre = genre_by_category.get(value.strip().upper())
        if genre and genre not in genres:
            genres.append(genre)
    return genres or ["general"]


def _celestial_house_category(house: Any) -> str:
    return {
        2: "Money,Work",
        4: "Love",
        5: "Love",
        6: "Work",
        7: "Love",
        8: "Love,Money",
        10: "Work",
        11: "Love",
    }.get(_normalize_int(house), "General")


def _celestial_aspect_category(category: Any, transit_planet: Any, natal_planet: Any) -> str:
    categories = {
        value.strip().title()
        for value in str(category or "").split(",")
        if value.strip().upper() in {"LOVE", "MONEY", "WORK"}
    }
    planet_pair = {_normalize_planet(transit_planet), _normalize_planet(natal_planet)}
    if "VENUS" in planet_pair:
        categories.add("Love")
    if planet_pair == {"VENUS", "JUPITER"}:
        categories.add("Money")
    ordered = [value for value in ("Love", "Money", "Work") if value in categories]
    return ",".join(ordered) or "General"


def _build_celestial_event_calendar(
    birth_input: BirthInput | None,
    current_dt: datetime | date | None,
    horizon_days: int = CELESTIAL_EVENT_HORIZON_DAYS,
) -> list[dict[str, Any]]:
    """Build the independent source of truth used only by Next Stellar Event."""
    if birth_input is None or swe is None or not hasattr(birth_input, "timezone_offset"):
        return []
    start_dt = _celestial_event_start(current_dt)
    end_dt = start_dt + timedelta(days=max(1, horizon_days))
    timezone_offset = birth_input.timezone_offset
    samples = _celestial_planet_samples(start_dt, end_dt, timezone_offset)
    events: list[dict[str, Any]] = []

    chart_rows = _chart_rows_for_request(birth_input)
    supported_natal_points = set(TRANSIT_PLANET_ORDER) | {"ASC", "MC"}
    natal_points = [
        point for point in _build_natal_aspect_points(birth_input)
        if point.get("planet") in supported_natal_points
    ]
    house_cusps = [] if birth_input.birth_time_unknown else [
        (int(row[0]), float(row[1]))
        for row in chart_rows.get("houses", [])
        if len(row) >= 2 and _normalize_float(row[1]) is not None
    ]

    for planet, planet_samples in samples.items():
        planet_label = _planet_label(planet)
        planet_priority = CELESTIAL_EVENT_PLANET_PRIORITY.get(planet, 5)
        for index in range(len(planet_samples) - 1):
            left_dt, _left_longitude, _left_speed, left_unwrapped = planet_samples[index]
            right_dt, _right_longitude, _right_speed, right_unwrapped = planet_samples[index + 1]

            for sign_target, target_unwrapped in _crossing_targets(left_unwrapped, right_unwrapped, [float(value) for value in range(0, 360, 30)]):
                event_dt = _refine_planet_crossing(planet, left_dt, right_dt, left_unwrapped, target_unwrapped, timezone_offset)
                direction = 1 if right_unwrapped > left_unwrapped else -1
                sign_index = int((sign_target / 30 + (0 if direction > 0 else -1)) % 12)
                sign_label = CELESTIAL_SIGN_LABELS[sign_index]
                events.append(_celestial_event_item(
                    event_type="sign_ingress", event_dt=event_dt, start_dt=start_dt,
                    title=f"{planet_label}が{sign_label}へ移動",
                    note=f"{planet_label}のテーマが{sign_label}の領域へ切り替わります。",
                    priority=70 + planet_priority, planet=planet, transit_planet=planet,
                    sign=sign_label, direction="direct" if direction > 0 else "retrograde",
                ))

            for house, cusp in house_cusps:
                for _target, target_unwrapped in _crossing_targets(left_unwrapped, right_unwrapped, [cusp]):
                    event_dt = _refine_planet_crossing(planet, left_dt, right_dt, left_unwrapped, target_unwrapped, timezone_offset)
                    entered_house = house if right_unwrapped > left_unwrapped else (12 if house == 1 else house - 1)
                    category = _celestial_house_category(entered_house)
                    events.append(_celestial_event_item(
                        event_type="natal_house_ingress", event_dt=event_dt, start_dt=start_dt,
                        title=f"{planet_label}がネイタル第{entered_house}ハウスへ移動",
                        note=f"{planet_label}が個人天体図の第{entered_house}ハウスへ入り、焦点が切り替わります。",
                        priority=60 + planet_priority, planet=planet, transit_planet=planet, house=entered_house,
                        category=category, genres=_celestial_event_genres(category),
                    ))

            for natal in natal_points:
                natal_label = _planet_label(natal["planet"])
                for angle in CELESTIAL_EVENT_ASPECT_ANGLES:
                    if planet == "MOON" and angle == 90:
                        continue
                    targets = {(natal["longitude"] + angle) % 360, (natal["longitude"] - angle) % 360}
                    for _target, target_unwrapped in _crossing_targets(left_unwrapped, right_unwrapped, list(targets)):
                        event_dt = _refine_planet_crossing(planet, left_dt, right_dt, left_unwrapped, target_unwrapped, timezone_offset)
                        interpretation = get_aspect_interpretation(
                            t_planet=planet,
                            n_planet=natal["planet"],
                            angle=angle,
                            house=natal["house"],
                            is_retrograde=_right_speed < 0,
                            orb_status="Applying",
                        )
                        category = _celestial_aspect_category(
                            _safe_text(interpretation, "Category", "General"),
                            planet,
                            natal["planet"],
                        )
                        classification = "caution" if angle == 90 else "major"
                        note = (
                            "負荷や摩擦が高まりやすい時期です。結果を断定せず、調整余地を確保してください。"
                            if angle == 90 else
                            f"トランジット{planet_label}とネイタル{natal_label}の主要アスペクトが正確になります。"
                        )
                        events.append(_celestial_event_item(
                            event_type="transit_natal_aspect", event_dt=event_dt, start_dt=start_dt,
                            title=f"{planet_label} × ネイタル{natal_label} {angle}°",
                            note=note, priority=80 + planet_priority + (3 if angle == 0 else 2 if angle == 180 else 0),
                            classification=classification, planet=planet, transit_planet=planet,
                            natal_planet=natal["planet"], aspect_angle=angle,
                            category=category, genres=_celestial_event_genres(category),
                        ))

    sun_samples = samples["SUN"]
    moon_samples = samples["MOON"]
    relative_unwrapped = (moon_samples[0][1] - sun_samples[0][1]) % 360
    relative_samples: list[tuple[datetime, float]] = [(start_dt, relative_unwrapped)]
    previous_relative = relative_unwrapped
    for index in range(1, min(len(sun_samples), len(moon_samples))):
        relative = (moon_samples[index][1] - sun_samples[index][1]) % 360
        relative_unwrapped += _signed_longitude_delta(previous_relative, relative)
        relative_samples.append((moon_samples[index][0], relative_unwrapped))
        previous_relative = relative
    for index in range(len(relative_samples) - 1):
        left_dt, left_value = relative_samples[index]
        right_dt, right_value = relative_samples[index + 1]
        for target, target_unwrapped in _crossing_targets(left_value, right_value, [0.0, 180.0]):
            event_dt = _refine_lunation_crossing(
                left_dt, right_dt, left_value, target_unwrapped, timezone_offset
            )
            is_new = target == 0
            events.append(_celestial_event_item(
                event_type="new_moon" if is_new else "full_moon", event_dt=event_dt, start_dt=start_dt,
                title="新月" if is_new else "満月",
                note="新しいサイクルの始まりです。意図を定めるタイミングです。" if is_new else "サイクルの到達点です。成果と手放すものを確認するタイミングです。",
                priority=98 if is_new else 96, planet="MOON", transit_planet="MOON", classification="major",
            ))

    for row in _dashboard_retrograde_calendar(start_dt):
        raw_datetime = row.get("event_datetime_jst") or row.get("event_date")
        try:
            event_dt = datetime.fromisoformat(str(raw_datetime))
        except ValueError:
            continue
        if not (start_dt <= event_dt <= end_dt):
            continue
        is_retrograde = row.get("event_type") == "RETROGRADE_START"
        planet = _normalize_planet(row.get("planet"))
        planet_label = row.get("planet_label") or _planet_label(planet)
        events.append(_celestial_event_item(
            event_type="retrograde_start" if is_retrograde else "direct_start",
            event_dt=event_dt, start_dt=start_dt,
            title=f"{planet_label}{'逆行開始' if is_retrograde else '順行復帰'}",
            note=f"{planet_label}が{'逆行を開始します。見直しと再調整の期間に入ります。' if is_retrograde else '順行へ戻り、停滞していたテーマが動き始めます。'}",
            priority=94 if is_retrograde else 92, planet=planet, transit_planet=planet,
            classification="caution" if is_retrograde else "major",
        ))

    unique_events: dict[str, dict[str, Any]] = {}
    for event in events:
        unique_events[event["event_id"]] = event
    return sorted(
        unique_events.values(),
        key=lambda event: (event["event_date"], -event["priority"], event["event_datetime"], event["event_id"]),
    )


def _classify_orb_status(
    sample_local_dt: datetime,
    timezone_offset: float,
    natal_longitude: float,
    exact_angle: int,
    transit_planet: str = "MOON",
) -> str:
    current_longitude, _ = _calc_transit_planet_state(transit_planet, sample_local_dt, timezone_offset)
    future_longitude, _ = _calc_transit_planet_state(transit_planet, sample_local_dt + timedelta(hours=1), timezone_offset)
    current_deviation = abs(get_angle_diff(current_longitude, natal_longitude) - exact_angle)
    future_deviation = abs(get_angle_diff(future_longitude, natal_longitude) - exact_angle)
    return "Applying" if future_deviation < current_deviation else "Separating"


def _build_slot_interpretations(
    birth_input: BirthInput,
    slot_def: dict[str, Any],
    target_date: date,
    transit_planets: tuple[str, ...] = TRANSIT_PLANET_ORDER,
    natal_rows: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    natal_rows = natal_rows if natal_rows is not None else _build_natal_planet_rows(birth_input)
    sample_local_dt = _local_sample_datetime(target_date, slot_def["sample_hour"], slot_def.get("day_offset", 0))
    slot_rows: list[dict[str, Any]] = []
    for transit_planet in transit_planets:
        transit_longitude, is_retrograde = _calc_transit_planet_state(
            transit_planet,
            sample_local_dt,
            birth_input.timezone_offset,
        )
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
                transit_planet=transit_planet,
            )
            interpretation = get_aspect_interpretation(
                t_planet=transit_planet,
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
                "t_planet": transit_planet,
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


def _daily_performance_dignity(row: dict[str, Any]) -> float:
    return _normalize_float(row.get("Essential_Dignity_Score")) or 0.0


def _daily_performance_angle(row: dict[str, Any]) -> int:
    return _safe_number(row, "Aspect_Angle")


def _daily_performance_pressure_floor(row: dict[str, Any]) -> float | None:
    transit_planet = _normalize_planet(row.get("T_Planet"))
    if transit_planet not in DAILY_PERFORMANCE_PRESSURE_FLOOR_TRANSIT_PLANETS:
        return None
    impact = _safe_number(row, "Score_Impact")
    if impact > DAILY_PERFORMANCE_PRESSURE_FLOOR_SCORE_THRESHOLD:
        return None

    orb_limit = DAILY_PERFORMANCE_ASPECT_ORBS.get(_daily_performance_angle(row))
    if not orb_limit:
        return None
    current_orb = abs(_extract_current_orb(row))
    if current_orb >= orb_limit:
        return None

    priority = _safe_number(row, "Priority")
    exact_floor = (
        DAILY_PERFORMANCE_PRESSURE_FLOOR_BASE
        + (abs(impact) * DAILY_PERFORMANCE_PRESSURE_FLOOR_SCORE_RATE)
        + (
            max(0, priority - DAILY_PERFORMANCE_PRESSURE_FLOOR_PRIORITY_BASE)
            * DAILY_PERFORMANCE_PRESSURE_FLOOR_PRIORITY_RATE
        )
    )
    exact_floor = max(
        DAILY_PERFORMANCE_PRESSURE_FLOOR_MIN,
        min(DAILY_PERFORMANCE_PRESSURE_FLOOR_MAX, exact_floor),
    )
    orb_strength = max(0.0, 1.0 - (current_orb / orb_limit))
    return DAILY_PERFORMANCE_PRESSURE_FLOOR_BASE + (
        (exact_floor - DAILY_PERFORMANCE_PRESSURE_FLOOR_BASE) * orb_strength
    )


def _daily_performance_mars_bonus(daily_vibe: dict[str, Any]) -> int:
    bonus = 0
    for item in daily_vibe.get("items", []):
        planet = _normalize_planet(item.get("Target_Planet") or item.get("Planet"))
        if planet != "MARS":
            continue
        event_type = _safe_text(item, "Event_Type").strip().upper()
        condition = _safe_text(item, "Condition").strip().upper()
        if event_type == "OUT_OF_BOUNDS":
            bonus += 50
        elif event_type == "RETROGRADE" and condition in {"", "START"}:
            bonus += 35
    return bonus


def _daily_performance_transit_weight(planet: Any) -> float:
    return DAILY_PERFORMANCE_TRANSIT_WEIGHTS.get(_normalize_planet(planet), 1.0)


def _daily_performance_aspect_breakdown(row: dict[str, Any], contribution: float, note: str) -> dict[str, Any]:
    return {
        "label": _aspect_label(row),
        "contribution": round(contribution, 2),
        "rawContribution": round(contribution, 2),
        "scoreContribution": round(contribution, 2),
        "note": note,
        "t_planet": _normalize_planet(row.get("T_Planet")),
        "n_planet": _normalize_planet(row.get("N_Planet")),
        "angle": _safe_number(row, "Aspect_Angle"),
        "category": _safe_text(row, "Category", "General"),
        "scoreImpact": _safe_number(row, "Score_Impact"),
        "essentialDignityScore": _daily_performance_dignity(row),
        "priority": _safe_number(row, "Priority"),
        "decisionFlag": _safe_number(row, "Decision_Flag"),
        "syncFlag": _safe_number(row, "Sync_Flag"),
        "noiseFlag": _safe_number(row, "Noise_Flag"),
        "orb": round(_extract_current_orb(row), 2),
        "orbStatus": _safe_text(row, "_orb_status", _safe_text(row, "Orb_Status")),
        "description": _safe_text(row, "Text_Description"),
        "advisedTask": _safe_text(row, "Advised_Task"),
        "source": _source_reference(
            row,
            columns=[
                "Aspect_Logic_ID",
                "T_Planet",
                "N_Planet",
                "Aspect_Angle",
                "Essential_Dignity_Score",
                "Score_Impact",
                "Priority",
                "Decision_Flag",
                "Sync_Flag",
                "Noise_Flag",
            ],
        ),
    }


def _daily_performance_environment_breakdown(
    *,
    source_planet: str,
    target_planet: str,
    angle: int,
    orb: float,
    contribution: float,
    note: str,
) -> dict[str, Any]:
    source_label = _planet_label(source_planet)
    target_label = _planet_label(target_planet)
    return {
        "label": f"トランジット{source_label} × トランジット{target_label} {angle}°",
        "contribution": round(contribution, 2),
        "rawContribution": round(contribution, 2),
        "scoreContribution": round(contribution, 2),
        "note": note,
        "t_planet": _normalize_planet(source_planet),
        "n_planet": _normalize_planet(target_planet),
        "angle": angle,
        "category": "Environment",
        "scoreImpact": 0,
        "essentialDignityScore": 0,
        "priority": 0,
        "decisionFlag": 0,
        "syncFlag": 0,
        "noiseFlag": 0,
        "orb": round(orb, 2),
        "orbStatus": "Environment",
        "description": "",
        "advisedTask": "",
        "source": {
            "rowKey": f"TRANSIT_{_normalize_planet(source_planet)}_TRANSIT_{_normalize_planet(target_planet)}_{angle}",
            "columns": {
                "T_Planet": f"TRANSIT_{_normalize_planet(source_planet)}",
                "N_Planet": f"TRANSIT_{_normalize_planet(target_planet)}",
                "Aspect_Angle": angle,
            },
        },
    }


def _daily_performance_environment_layer(
    birth_input: BirthInput,
    sample_local_dt: datetime,
) -> dict[str, Any]:
    moon_longitude, _ = _calc_transit_planet_state("MOON", sample_local_dt, birth_input.timezone_offset)
    totals = {
        "drive": 0.0,
        "flow": 0.0,
        "inspiration": 0.0,
        "friction": 0.0,
        "mars": 0.0,
    }
    breakdown = {key: [] for key in totals}

    for target_planet in DAILY_PERFORMANCE_ENVIRONMENT_PLANETS:
        target_longitude, _ = _calc_transit_planet_state(target_planet, sample_local_dt, birth_input.timezone_offset)
        angle_diff = get_angle_diff(moon_longitude, target_longitude)
        _, exact_angle, orb_diff = get_aspect(angle_diff)
        if exact_angle is None:
            continue
        closeness = max(0.0, 5.0 - abs(orb_diff))
        if closeness <= 0:
            continue

        is_harmony = exact_angle in DAILY_PERFORMANCE_DRIVE_ANGLES
        is_hard = exact_angle in DAILY_PERFORMANCE_FRICTION_ANGLES
        planet = _normalize_planet(target_planet)

        def add(metric: str, weight: float, note: str) -> None:
            contribution = closeness * weight * DAILY_PERFORMANCE_ENVIRONMENT_RATIO
            if contribution <= 0:
                return
            totals[metric] += contribution
            breakdown[metric].append(
                _daily_performance_environment_breakdown(
                    source_planet="MOON",
                    target_planet=planet,
                    angle=exact_angle,
                    orb=abs(orb_diff),
                    contribution=contribution,
                    note=note,
                )
            )

        if is_harmony:
            if planet == "MERCURY":
                add("drive", 2.2, "Transit environment drive")
            elif planet == "VENUS":
                add("flow", 2.4, "Transit environment flow")
                add("inspiration", 0.9, "Transit environment inspiration")
            elif planet == "MARS":
                add("drive", 2.0, "Transit environment drive")
                add("mars", 1.8, "Transit environment Mars")
            elif planet == "JUPITER":
                add("flow", 2.0, "Transit environment flow")
                add("inspiration", 1.0, "Transit environment inspiration")
            elif planet == "SATURN":
                add("drive", 1.2, "Transit environment structure")
            elif planet == "NEPTUNE":
                add("inspiration", 2.8, "Transit environment inspiration")
        elif is_hard:
            if planet in {"MERCURY", "MARS", "SATURN", "URANUS", "NEPTUNE", "PLUTO"}:
                add("friction", 2.8 if planet in {"MARS", "PLUTO"} else 2.2, "Transit environment friction")
            if planet == "MARS":
                add("mars", 1.5, "Transit environment Mars")
            if planet == "NEPTUNE":
                add("inspiration", -0.8, "Transit environment inspiration drag")

    mars_longitude, _ = _calc_transit_planet_state("MARS", sample_local_dt, birth_input.timezone_offset)
    for target_planet in DAILY_PERFORMANCE_MARS_HARD_ENVIRONMENT_PLANETS:
        target_longitude, _ = _calc_transit_planet_state(target_planet, sample_local_dt, birth_input.timezone_offset)
        angle_diff = get_angle_diff(mars_longitude, target_longitude)
        _, exact_angle, orb_diff = get_aspect(angle_diff)
        if exact_angle not in DAILY_PERFORMANCE_FRICTION_ANGLES:
            continue
        closeness = max(0.0, 5.0 - abs(orb_diff))
        if closeness <= 0:
            continue
        planet = _normalize_planet(target_planet)
        friction_weight = 2.4 if planet in {"URANUS", "PLUTO"} else 1.9
        mars_weight = 1.1 if planet in {"URANUS", "PLUTO"} else 0.7
        friction_contribution = closeness * friction_weight * DAILY_PERFORMANCE_ENVIRONMENT_RATIO
        mars_contribution = closeness * mars_weight * DAILY_PERFORMANCE_ENVIRONMENT_RATIO
        totals["friction"] += friction_contribution
        totals["mars"] += mars_contribution
        breakdown["friction"].append(
            _daily_performance_environment_breakdown(
                source_planet="MARS",
                target_planet=planet,
                angle=exact_angle,
                orb=abs(orb_diff),
                contribution=friction_contribution,
                note="Transit Mars hard environment friction",
            )
        )
        breakdown["mars"].append(
            _daily_performance_environment_breakdown(
                source_planet="MARS",
                target_planet=planet,
                angle=exact_angle,
                orb=abs(orb_diff),
                contribution=mars_contribution,
                note="Transit Mars hard environment Mars",
            )
        )
        if planet == "SATURN":
            totals["drive"] -= closeness * 0.5 * DAILY_PERFORMANCE_ENVIRONMENT_RATIO
            breakdown["drive"].append(
                _daily_performance_environment_breakdown(
                    source_planet="MARS",
                    target_planet=planet,
                    angle=exact_angle,
                    orb=abs(orb_diff),
                    contribution=-(closeness * 0.5 * DAILY_PERFORMANCE_ENVIRONMENT_RATIO),
                    note="Transit Mars Saturn drive drag",
                )
            )
        if planet == "NEPTUNE":
            totals["inspiration"] -= closeness * 0.5 * DAILY_PERFORMANCE_ENVIRONMENT_RATIO
            breakdown["inspiration"].append(
                _daily_performance_environment_breakdown(
                    source_planet="MARS",
                    target_planet=planet,
                    angle=exact_angle,
                    orb=abs(orb_diff),
                    contribution=-(closeness * 0.5 * DAILY_PERFORMANCE_ENVIRONMENT_RATIO),
                    note="Transit Mars Neptune inspiration drag",
                )
            )

    return {
        "totals": totals,
        "breakdown": breakdown,
    }


def _allocate_daily_performance_score_contributions(
    breakdown: dict[str, list[dict[str, Any]]],
    *,
    mars_activity_raw: float,
    noise_sum: float,
    mars_friction: float,
) -> dict[str, list[dict[str, Any]]]:
    mars_final_total = _damp(mars_activity_raw, 35) * 2.2 if mars_activity_raw else 0
    noise_final_total = _damp(noise_sum, 90) * 0.08 if noise_sum else 0
    mars_friction_final_total = _damp(mars_friction, 60) * 0.12 if mars_friction else 0

    for item in breakdown.get("mars", []):
        raw = _normalize_float(item.get("rawContribution")) or 0.0
        final = (raw / mars_activity_raw * mars_final_total) if mars_activity_raw else 0.0
        item["scoreContribution"] = round(final, 2)
        item["contribution"] = round(final, 2)

    for item in breakdown.get("friction", []):
        raw = _normalize_float(item.get("rawContribution")) or 0.0
        note = _safe_text(item, "note")
        final = raw
        if note == "Outer planet noise":
            final = (raw / noise_sum * noise_final_total) if noise_sum else 0.0
        elif note == "Mars hard aspect":
            final = (raw / mars_friction * mars_friction_final_total) if mars_friction else 0.0
        item["scoreContribution"] = round(final, 2)
        item["contribution"] = round(final, 2)

    return breakdown


def _build_daily_performance(
    birth_input: BirthInput | None,
    current_dt: datetime | date | None,
    daily_vibe: dict[str, Any],
) -> list[dict[str, Any]]:
    target_date = _dashboard_target_date(current_dt)
    points: list[dict[str, Any]] = []
    mars_vibe_bonus = _daily_performance_mars_bonus(daily_vibe)

    if not birth_input:
        fallback_points = []
        for hour in DAILY_PERFORMANCE_SAMPLE_HOURS:
            point = {
                "time": f"{hour % 24:02d}:00",
                "hour": hour,
                "dayOffset": hour // 24,
                "date": (target_date + timedelta(days=hour // 24)).isoformat(),
                "drive": 50,
                "flow": 50,
                "inspiration": 50,
                "friction": _clamp(15 + mars_vibe_bonus, 0, 100),
                "marsActivity": _clamp(mars_vibe_bonus, 0, 100),
                "breakdown": {"mars": [], "drive": [], "flow": [], "inspiration": [], "friction": []},
                "sourceAspects": [],
            }
            point["actionAdvice"] = _daily_performance_action_advice(point, hour)
            fallback_points.append(point)
        return fallback_points

    natal_rows = _build_natal_planet_rows(birth_input)
    for hour in DAILY_PERFORMANCE_SAMPLE_HOURS:
        day_offset = hour // 24
        sample_hour = hour % 24
        slot_def = {
            "id": f"DAILY_PERFORMANCE_{hour:02d}",
            "label": f"{sample_hour:02d}:00",
            "sample_hour": sample_hour,
        }
        slot_date = target_date + timedelta(days=day_offset)
        rows = _build_slot_interpretations(
            birth_input,
            slot_def,
            slot_date,
            transit_planets=TRANSIT_PLANET_ORDER,
            natal_rows=natal_rows,
        )
        sample_local_dt = _local_sample_datetime(slot_date, slot_def["sample_hour"], slot_def.get("day_offset", 0))
        environment_layer = _daily_performance_environment_layer(birth_input, sample_local_dt)

        decision_sum = 0.0
        flow_sum = 0.0
        noise_sum = 0.0
        fast_drive = 0.0
        fast_flow = 0.0
        inspiration_raw = 0.0
        fast_friction = 0.0
        fast_support = 0.0
        fast_support_rows: list[tuple[dict[str, Any], float]] = []
        mars_drive = 0.0
        mars_friction = 0.0
        mars_activity_raw = 0.0
        strongest_pressure_floor = 0.0
        source_rows: list[dict[str, Any]] = []
        breakdown: dict[str, list[dict[str, Any]]] = {
            "drive": [],
            "flow": [],
            "inspiration": [],
            "friction": [],
            "mars": [],
        }
        for metric, items in environment_layer["breakdown"].items():
            breakdown[metric].extend(items)

        for row in rows:
            transit_planet = _normalize_planet(row.get("T_Planet"))
            angle = _daily_performance_angle(row)
            impact = _safe_number(row, "Score_Impact")
            dignity = _daily_performance_dignity(row)
            current_orb = _extract_current_orb(row)
            closeness = max(0.0, 5.0 - current_orb)
            is_hard_angle = angle in DAILY_PERFORMANCE_FRICTION_ANGLES
            has_neptune = transit_planet == "NEPTUNE" or _normalize_planet(row.get("N_Planet")) == "NEPTUNE"
            transit_weight = _daily_performance_transit_weight(transit_planet)
            pressure_floor = _daily_performance_pressure_floor(row)
            if pressure_floor is not None:
                strongest_pressure_floor = max(strongest_pressure_floor, pressure_floor)

            if transit_planet in DAILY_PERFORMANCE_DECISION_PLANETS:
                decision_flag = _safe_number(row, "Decision_Flag")
                decision_contribution = decision_flag * transit_weight
                decision_sum += decision_contribution
                if decision_flag:
                    breakdown["drive"].append(
                        _daily_performance_aspect_breakdown(row, decision_contribution * 0.9, "Decision_Flag")
                    )
            if transit_planet in DAILY_PERFORMANCE_FLOW_PLANETS:
                sync_flag = _safe_number(row, "Sync_Flag")
                flow_contribution = sync_flag * transit_weight if sync_flag and not is_hard_angle else 0
                flow_sum += flow_contribution
                if flow_contribution:
                    breakdown["flow"].append(
                        _daily_performance_aspect_breakdown(row, flow_contribution * 2.1, "Sync_Flag")
                    )
            if transit_planet in DAILY_PERFORMANCE_NOISE_PLANETS:
                noise_contribution = (max(0, _safe_number(row, "Noise_Flag")) + max(0, -impact)) * transit_weight
                noise_sum += noise_contribution
                if noise_contribution:
                    breakdown["friction"].append(
                        _daily_performance_aspect_breakdown(row, noise_contribution, "Outer planet noise")
                    )

            if angle in DAILY_PERFORMANCE_INSPIRATION_ANGLES and (
                has_neptune
                or (
                    transit_planet in {"MOON", "MERCURY", "VENUS", "JUPITER"}
                    and _normalize_planet(row.get("N_Planet")) in {"MOON", "MERCURY", "VENUS", "JUPITER", "NEPTUNE"}
                )
            ):
                inspiration_weight = 1.0 if has_neptune else 0.42
                if transit_planet in DAILY_PERFORMANCE_OUTER_PLANETS:
                    inspiration_weight *= transit_weight
                contribution = closeness * (1 + min(abs(impact), 80) / 100) * inspiration_weight
                inspiration_raw += contribution
                if contribution:
                    breakdown["inspiration"].append(
                        _daily_performance_aspect_breakdown(row, contribution * 4.0, "Inspiration aspect")
                    )

            if transit_planet in DAILY_PERFORMANCE_FAST_PLANETS:
                if angle in DAILY_PERFORMANCE_DRIVE_ANGLES and impact > 0 and not has_neptune:
                    contribution = closeness * (1 + min(abs(impact), 80) / 80) * transit_weight
                    fast_drive += contribution
                    breakdown["drive"].append(
                        _daily_performance_aspect_breakdown(row, contribution * 1.55, "Fast planet drive")
                    )
                if transit_planet == "MOON" and _safe_number(row, "Sync_Flag") > 0 and not is_hard_angle:
                    contribution = closeness * 1.35 * transit_weight
                    fast_flow += contribution
                    breakdown["flow"].append(
                        _daily_performance_aspect_breakdown(row, contribution * 4.2, "Moon flow")
                    )
                if angle in DAILY_PERFORMANCE_FRICTION_ANGLES or impact < 0:
                    contribution = closeness * (1 + min(abs(impact), 80) / 80) * transit_weight
                    fast_friction += contribution
                    breakdown["friction"].append(
                        _daily_performance_aspect_breakdown(
                            row,
                            contribution * DAILY_PERFORMANCE_FAST_FRICTION_MULTIPLIER,
                            "Fast planet friction",
                        )
                    )
                elif impact > 0:
                    contribution = closeness * (1 + min(abs(impact), 80) / 80) * transit_weight
                    fast_support += contribution
                    if contribution:
                        fast_support_rows.append((row, contribution))

            if (
                transit_planet == "JUPITER"
                and _normalize_planet(row.get("N_Planet")) in DAILY_PERFORMANCE_JUPITER_SUPPORT_NATAL_PLANETS
                and angle == 0
                and impact > 0
            ):
                contribution = closeness * (1 + min(abs(impact), 80) / 80) * transit_weight
                fast_support += contribution
                if contribution:
                    fast_support_rows.append((row, contribution))

            if transit_planet == "MARS":
                mars_activity_contribution = max(0.0, 5.0 - current_orb) + abs(dignity)
                mars_activity_raw += mars_activity_contribution
                if mars_activity_contribution:
                    breakdown["mars"].append(
                        _daily_performance_aspect_breakdown(row, mars_activity_contribution, "Mars total activity")
                    )
                if angle in DAILY_PERFORMANCE_FRICTION_ANGLES:
                    contribution = max(0, -impact) + abs(min(0.0, dignity))
                    mars_friction += contribution
                    if contribution:
                        breakdown["friction"].append(
                            _daily_performance_aspect_breakdown(row, contribution, "Mars hard aspect")
                        )
                source_rows.append(row)
            elif transit_planet in {"SUN", "MERCURY", "SATURN", "MOON", "VENUS", "JUPITER", "URANUS", "NEPTUNE", "PLUTO"}:
                source_rows.append(row)

        env_totals = environment_layer["totals"]
        mars_activity = _clamp((_damp(mars_activity_raw, 35) * 2.2) + env_totals["mars"] + mars_vibe_bonus, 0, 100)
        drive = _clamp(
            34
            + (decision_sum * 0.9)
            + (_damp(mars_drive, 60) * 0.14)
            + (fast_drive * 1.55)
            + env_totals["drive"],
            0,
            100,
        )
        flow = _clamp(
            40
            + (flow_sum * 2.1)
            + (fast_flow * 4.2)
            + env_totals["flow"],
            0,
            100,
        )
        inspiration = _clamp(
            34
            + (inspiration_raw * 4.0)
            + env_totals["inspiration"],
            0,
            100,
        )
        applied_fast_support = min(
            fast_friction,
            fast_support * DAILY_PERFORMANCE_FAST_SUPPORT_BUFFER_RATE,
        )
        if fast_support and applied_fast_support:
            for row, contribution in fast_support_rows:
                support_share = contribution / fast_support
                breakdown["friction"].append(
                    _daily_performance_aspect_breakdown(
                        row,
                        -applied_fast_support
                        * support_share
                        * DAILY_PERFORMANCE_FAST_FRICTION_MULTIPLIER,
                        "Fast planet support",
                    )
                )

        additive_friction = (
            10
            + (_damp(noise_sum, 90) * 0.08)
            + (_damp(mars_friction, 60) * 0.12)
            + (
                (fast_friction - applied_fast_support)
                * DAILY_PERFORMANCE_FAST_FRICTION_MULTIPLIER
            )
            + (mars_activity * 0.04)
            + env_totals["friction"]
        )
        friction = _clamp(
            max(additive_friction, strongest_pressure_floor),
            0,
            100,
        )
        breakdown = _allocate_daily_performance_score_contributions(
            breakdown,
            mars_activity_raw=mars_activity_raw,
            noise_sum=noise_sum,
            mars_friction=mars_friction,
        )
        ranked_sources = _rank_aspect_influence_rows(source_rows)[:5]
        ranked_transit_sources = {
            planet: _rank_aspect_influence_rows([
                row for row in source_rows
                if _normalize_planet(row.get("T_Planet")) == planet
            ])[:limit]
            for planet, limit in (("MOON", 5), ("MERCURY", 3), ("VENUS", 3))
        }

        def transit_aspect_payload(row: dict[str, Any]) -> dict[str, Any]:
            return {
                "label": _aspect_label(row),
                "t_planet": _normalize_planet(row.get("T_Planet")),
                "n_planet": _normalize_planet(row.get("N_Planet")),
                "angle": _safe_number(row, "Aspect_Angle"),
                "category": _safe_text(row, "Category", "General"),
                "scoreImpact": _safe_number(row, "Score_Impact"),
                "essentialDignityScore": _daily_performance_dignity(row),
                "priority": _safe_number(row, "Priority"),
                "orb": round(_extract_current_orb(row), 2),
                "orbStatus": _safe_text(row, "_orb_status", _safe_text(row, "Orb_Status")),
                "description": _safe_text(row, "Text_Description"),
                "advisedTask": _safe_text(row, "Advised_Task"),
            }

        point = {
            "time": f"{sample_hour:02d}:00",
            "hour": hour,
            "dayOffset": day_offset,
            "date": slot_date.isoformat(),
            "drive": drive,
            "flow": flow,
            "inspiration": inspiration,
            "friction": friction,
            "marsActivity": mars_activity,
            "breakdown": {
                key: sorted(items, key=lambda item: abs(item["contribution"]), reverse=True)
                for key, items in breakdown.items()
            },
            "sourceAspects": [
                {
                    "t_planet": _normalize_planet(row.get("T_Planet")),
                    "n_planet": _normalize_planet(row.get("N_Planet")),
                    "angle": _safe_number(row, "Aspect_Angle"),
                    "scoreImpact": _safe_number(row, "Score_Impact"),
                    "essentialDignityScore": _daily_performance_dignity(row),
                    "orb": _extract_current_orb(row),
                }
                for row in ranked_sources
            ],
            # The daily timeline needs the complete candidate set across the
            # 72-hour window; presentation-side ranking decides what to show.
            "timelineAspects": [
                transit_aspect_payload(row)
                for row in source_rows
            ],
            "moonAspects": [
                transit_aspect_payload(row)
                for row in ranked_transit_sources["MOON"]
            ],
            "mercuryAspects": [
                transit_aspect_payload(row)
                for row in ranked_transit_sources["MERCURY"]
            ],
            "venusAspects": [
                transit_aspect_payload(row)
                for row in ranked_transit_sources["VENUS"]
            ],
        }
        point["actionAdvice"] = _daily_performance_action_advice(point, hour)
        points.append(point)

    return points



def build_dashboard_data_from_interpretations(
    interpretations: list[dict[str, Any]],
    daily_vibe: dict[str, Any],
    basic_interpretations: list[dict[str, Any]] | None = None,
    birth_input: BirthInput | None = None,
    current_dt: datetime | date | None = None,
    include_deferred_widgets: bool = True,
) -> dict[str, Any]:
    daily_star_vibe = get_daily_star_vibe_description(current_dt)
    if not interpretations:
        dashboard_data = {
            "header": _dashboard_header(),
            "dailyStarVibe": daily_star_vibe,
            "aspectHighlights": {"positive": [], "negative": []},
            "countdown": None,
            "celestial_event_calendar": (
                _build_celestial_event_calendar(birth_input, current_dt)
                if include_deferred_widgets
                else []
            ),
            "relief_countdown_items": [],
            "dailyPerformance": (
                _build_daily_performance(birth_input, current_dt, daily_vibe)
                if include_deferred_widgets
                else []
            ),
            "planetMotion": _dashboard_planet_motion(birth_input, current_dt),
            "retrogradeCalendar": _dashboard_retrograde_calendar(current_dt),
            "weekly_aspects": [],
            "premium": {"title": "Premium AI Preview", "description": "", "placeholder": "", "preview": ""},
            "aspect_interpretations": [],
            "basic_interpretations": basic_interpretations or [],
            "daily_vibe": daily_vibe,
        }
        if not include_deferred_widgets:
            dashboard_data["deferred_widgets_pending"] = True
        return _to_json_compatible(dashboard_data)

    preview_row = _top_priority_row(interpretations)
    countdown_interpretations = _countdown_interpretations_with_lunar_candidates(
        interpretations,
        birth_input,
        current_dt,
    )
    short_countdown_targets = _countdown_targets_by_planet_group(
        countdown_interpretations,
        COUNTDOWN_SHORT_PLANETS,
        limit=999,
        score_sign="positive",
    )
    long_countdown_targets = _countdown_targets_by_planet_group(
        countdown_interpretations,
        COUNTDOWN_LONG_PLANETS,
        limit=999,
        score_sign="positive",
    )
    short_negative_countdown_targets = _countdown_targets_by_planet_group(
        countdown_interpretations,
        COUNTDOWN_SHORT_PLANETS,
        limit=999,
        score_sign="negative",
    )
    long_negative_countdown_targets = _countdown_targets_by_planet_group(
        countdown_interpretations,
        COUNTDOWN_LONG_PLANETS,
        limit=999,
        score_sign="negative",
    )
    short_countdown_candidates = [
        item for item in (build_countdown_data(target, current_dt=current_dt) for target in short_countdown_targets) if item
    ]
    long_countdown_candidates = [
        item for item in (build_countdown_data(target, current_dt=current_dt) for target in long_countdown_targets) if item
    ]
    short_countdown_items = _select_display_countdown_items(short_countdown_candidates, limit=3)
    long_countdown_items = _select_display_countdown_items(long_countdown_candidates, limit=3)
    relief_short_countdown_items = _select_display_countdown_items(
        [item for item in short_countdown_candidates if _countdown_score(item) >= 25],
        limit=None,
    )
    relief_long_countdown_items = _select_display_countdown_items(
        [item for item in long_countdown_candidates if _countdown_score(item) >= 25],
        limit=None,
    )
    relief_active_candidates = [
        item
        for item in (
            build_countdown_data(target, current_dt=current_dt, countdown_mode="departure", scan_scope="year_bound")
            for target in [*short_countdown_targets, *long_countdown_targets]
            if _safe_number(target, "Score_Impact") >= 25
        )
        if item and item.get("scan_status") == "departing"
    ]
    relief_active_items = _select_display_countdown_items(
        relief_active_candidates,
        limit=len(relief_active_candidates),
    )
    long_countdown_all_items = _select_display_countdown_items(
        long_countdown_candidates,
        limit=len(long_countdown_candidates),
    )
    short_negative_countdown_items = [
        item
        for item in (
            build_countdown_data(target, current_dt=current_dt, countdown_mode="departure")
            for target in short_negative_countdown_targets
        )
        if item and item.get("scan_status") == "departing"
    ][:3]
    long_negative_countdown_items = [
        item
        for item in (
            build_countdown_data(target, current_dt=current_dt, countdown_mode="departure")
            for target in long_negative_countdown_targets
        )
        if item and item.get("scan_status") == "departing"
    ]
    timeline_advise_lookup = _build_master_timeline_advise_lookup()
    pressure_score_lookup = _build_master_pressure_score_lookup()
    pressure_countdown_candidates = [
        item
        for item in (
            build_countdown_data(target, current_dt=current_dt, countdown_mode="departure", scan_scope="year_bound")
            for target in countdown_interpretations
            if _is_pressure_countdown_target(target, pressure_score_lookup)
        )
        if item and item.get("scan_status") == "departing"
    ]
    _attach_pressure_timeline_advise(short_negative_countdown_items, timeline_advise_lookup)
    _attach_pressure_timeline_advise(long_negative_countdown_items, timeline_advise_lookup)
    _attach_pressure_timeline_advise(pressure_countdown_candidates, timeline_advise_lookup)
    pressure_countdown_items = _select_pressure_countdown_items(pressure_countdown_candidates, pressure_score_lookup)
    pressure_load_summary = _pressure_load_summary(pressure_countdown_items)
    pressure_load_summary.update(_pressure_load_group_summary(pressure_countdown_items))
    short_countdown_group = [*short_countdown_items, *short_negative_countdown_items]
    long_countdown_group = [*long_countdown_all_items, *long_negative_countdown_items]
    long_countdown_priority_groups = _countdown_priority_band_groups(long_countdown_group)
    positive_countdown_items = [*short_countdown_items, *long_countdown_items][:3]
    relief_upcoming_items = [*relief_short_countdown_items, *relief_long_countdown_items]
    active_relief_keys = {_countdown_item_identity(item) for item in relief_active_items}
    relief_countdown_items = [
        *[
            item
            for item in relief_upcoming_items
            if _countdown_item_identity(item) not in active_relief_keys
        ],
        *relief_active_items,
    ]
    _attach_pressure_timeline_advise(relief_countdown_items, timeline_advise_lookup)
    countdown_items = positive_countdown_items
    countdown_data = (positive_countdown_items or [None])[0]
    daily_performance = (
        _build_daily_performance(birth_input, current_dt, daily_vibe)
        if include_deferred_widgets
        else []
    )
    weekly_aspects = (
        _build_weekly_aspect_items(birth_input, current_dt)
        if include_deferred_widgets
        else []
    )
    celestial_event_calendar = (
        _build_celestial_event_calendar(birth_input, current_dt)
        if include_deferred_widgets
        else []
    )
    aspect_highlights = _top_daily_aspect_highlights(interpretations, current_dt=current_dt)
    dashboard_data = {
        "header": _dashboard_header(),
        "dailyStarVibe": daily_star_vibe,
        "aspectHighlights": aspect_highlights,
        "countdown": countdown_data,
        "celestial_event_calendar": celestial_event_calendar,
        "countdown_items": countdown_items,
        "relief_countdown_items": relief_countdown_items,
        "pressure_countdown_items": pressure_countdown_items,
        "pressure_load_summary": pressure_load_summary,
        "countdown_groups": {
            "short": short_countdown_group,
            "long": long_countdown_group,
            "pressure": pressure_countdown_items,
            "relief": relief_countdown_items,
            "long_by_priority": long_countdown_priority_groups,
            "priority_bands": {
                key: {"label": value["label"]}
                for key, value in COUNTDOWN_PRIORITY_BANDS.items()
            },
            "legacy_short": short_countdown_items,
            "legacy_long": long_countdown_items,
        },
        "dailyPerformance": daily_performance,
        "planetMotion": _dashboard_planet_motion(birth_input, current_dt),
        "retrogradeCalendar": _dashboard_retrograde_calendar(current_dt),
        "weekly_aspects": weekly_aspects,
        "premium": {
            "title": "Premium AI Preview",
            "description": "複数のトランジット条件と日運補正を組み合わせた追加解釈を提供します。",
            "placeholder": "将来的には、恋愛や仕事などテーマ別の深掘りリソースをここへ表示します。",
            "preview": _safe_text(preview_row, "Text_Description"),
        },
        "aspect_interpretations": interpretations,
        "basic_interpretations": basic_interpretations or [],
        "daily_vibe": daily_vibe,
    }
    if not include_deferred_widgets:
        dashboard_data["deferred_widgets_pending"] = True
    return _to_json_compatible(dashboard_data)


def build_dashboard_data_from_aspects(
    aspects: list[dict[str, Any]],
    current_dt: datetime | date | None = None,
    retrograde_planets: list[str] | None = None,
    event_types: list[str | dict[str, Any]] | None = None,
    moon_sign: str | None = None,
    basic_interpretations: list[dict[str, Any]] | None = None,
    birth_input: BirthInput | None = None,
    include_deferred_widgets: bool = True,
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
        include_deferred_widgets=include_deferred_widgets,
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


def build_transit_aspect_inputs(
    birth_input: BirthInput,
    current_dt: datetime | date | None = None,
) -> list[dict[str, Any]]:
    if swe is None:
        raise RuntimeError("swisseph is not installed")

    if isinstance(current_dt, datetime):
        sample_local_dt = current_dt
    elif isinstance(current_dt, date):
        sample_local_dt = datetime.combine(current_dt, dt_time(hour=12))
    else:
        sample_local_dt = _app_now()

    natal_points = _build_natal_aspect_points(birth_input)
    inputs: list[dict[str, Any]] = []
    for transit_planet in TRANSIT_PLANET_ORDER:
        transit_longitude, is_retrograde = _calc_transit_planet_state(
            transit_planet,
            sample_local_dt,
            birth_input.timezone_offset,
        )
        for natal_point in natal_points:
            angle_diff = get_angle_diff(transit_longitude, natal_point["longitude"])
            _, exact_angle, orb_diff = get_aspect(angle_diff)
            if exact_angle is None:
                continue
            orb_status = _classify_orb_status(
                sample_local_dt,
                birth_input.timezone_offset,
                natal_point["longitude"],
                exact_angle,
                transit_planet=transit_planet,
            )
            inputs.append({
                "t_planet": transit_planet,
                "n_planet": natal_point["planet"],
                "angle": exact_angle,
                "orb_status": orb_status,
                "house": natal_point["house"],
                "is_retrograde": is_retrograde,
                "orb": orb_diff,
                "transit_longitude": round(transit_longitude, 2),
                "natal_longitude": round(natal_point["longitude"], 2),
                "angle_diff": round(angle_diff, 2),
                "timezone_offset": birth_input.timezone_offset,
            })
    return inputs


def _to_json_compatible(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _to_json_compatible(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_to_json_compatible(item) for item in value]
    if isinstance(value, tuple):
        return [_to_json_compatible(item) for item in value]
    if isinstance(value, float) and not isfinite(value):
        return None
    if value is pd.NA:
        return None
    if hasattr(value, "item") and callable(value.item):
        try:
            return _to_json_compatible(value.item())
        except (TypeError, ValueError):
            return value
    return value


def extract_retrograde_planets_from_chart_rows(planet_rows: list[list[Any]]) -> list[str]:
    retrograde_planets: list[str] = []
    direct_labels = {"DIRECT", "D", "-", "", "鬯・・・｡繝ｻ"}
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


def _birth_input_from_request(payload: ReadingRequest) -> BirthInput:
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
    return BirthInput(
        full_name=payload.full_name,
        birth_date=payload.birth_date.isoformat(),
        birth_time=payload.birth_time.strftime("%H:%M") if payload.birth_time else "",
        birth_time_unknown=payload.birth_time_unknown,
        birthplace=payload.birthplace,
        latitude=payload.latitude,
        longitude=payload.longitude,
        timezone_offset=timezone_offset,
    )


def _reading_current_datetime(payload: ReadingRequest) -> datetime:
    current_dt = _app_now()
    if payload.target_date and payload.target_date != _app_today():
        return datetime.combine(payload.target_date, dt_time(hour=12))
    return current_dt


def generate_readings(
    payload: ReadingRequest,
    include_deferred_widgets: bool = True,
) -> ReadingResponse:
    with _transit_motion_request_cache(), _countdown_orb_request_cache(), _natal_data_request_cache():
        if include_deferred_widgets:
            return _generate_readings(payload)
        return _generate_readings(payload, include_deferred_widgets=False)


def generate_deferred_dashboard_widgets(payload: ReadingRequest) -> dict[str, Any]:
    with _transit_motion_request_cache(), _countdown_orb_request_cache(), _natal_data_request_cache():
        reload_master_dataframes_if_changed()
        birth_input = _birth_input_from_request(payload)
        current_dt = _reading_current_datetime(payload)
        daily_vibe = get_daily_vibe_modifiers(
            current_dt=current_dt,
            retrograde_planets=build_current_retrograde_planets(
                current_dt,
                birth_input.timezone_offset,
            ),
        )
        return _to_json_compatible({
            "dailyPerformance": _build_daily_performance(birth_input, current_dt, daily_vibe),
            "weekly_aspects": _build_weekly_aspect_items(birth_input, current_dt),
            "celestial_event_calendar": _build_celestial_event_calendar(birth_input, current_dt),
            "deferred_widgets_pending": False,
        })


def _generate_readings(
    payload: ReadingRequest,
    include_deferred_widgets: bool = True,
) -> ReadingResponse:
    reload_master_dataframes_if_changed()
    birth_input = _birth_input_from_request(payload)
    timezone_offset = birth_input.timezone_offset

    chart_rows = _chart_rows_for_request(birth_input)
    current_dt = _reading_current_datetime(payload)
    dashboard_data = build_dashboard_data_from_aspects(
        aspects=build_transit_aspect_inputs(birth_input, current_dt),
        current_dt=current_dt,
        retrograde_planets=build_current_retrograde_planets(
            current_dt,
            birth_input.timezone_offset,
        ),
        basic_interpretations=build_basic_interpretations_from_chart_rows(
            chart_rows["planets"],
            chart_rows["angles"],
        ),
        birth_input=birth_input,
        include_deferred_widgets=include_deferred_widgets,
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
        dashboard_data=_to_json_compatible(dashboard_data),
    )
