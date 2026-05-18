import io
import logging
import re
import sys
from datetime import date, datetime, time as dt_time, timedelta
from math import ceil
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any
from zoneinfo import ZoneInfo

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
HERO_ASPECT_AVERAGE_WEIGHT = 2.0
DIAGNOSTIC_BASE_SCORE = 50
DIAGNOSTIC_OVERALL_IMPACT_WEIGHT = 0.25
DIAGNOSTIC_DECISION_IMPACT_WEIGHT = 0.30
DIAGNOSTIC_EMOTION_IMPACT_WEIGHT = 0.30
DIAGNOSTIC_DAILY_WORK_WEIGHT = 0.50
DIAGNOSTIC_DAILY_LOVE_WEIGHT = 0.50
DIAGNOSTIC_NOISE_NEGATIVE_WEIGHT = 0.25
DIAGNOSTIC_NOISE_POSITIVE_WEIGHT = 0.10
DIAGNOSTIC_SAFETY_WEIGHT = 0.50
TIMELINE_CONDITION_MULTIPLIERS = {
    "OVER": 1.08,
    "MATCH": 1.0,
    "UNDER": 0.92,
}
SAFETY_LEVEL_MODIFIERS = {
    "HIGH": 5,
    "MEDIUM": -4,
    "LOW": -12,
}

LOGGER = logging.getLogger(__name__)
DATABASE_DIR = PROJECT_ROOT / "database"
APP_TIMEZONE = ZoneInfo("Asia/Tokyo")

MASTER_CSV_FILES = {
    "basic": "M_Basic_Interpretation.csv",
    "daily_vibe": "M_Daily_Vibe_Logic.csv",
    "daily_star_vibe": "M_Daily_Star_Vibe.csv",
    "countdown": "M_Countdown_Master.csv",
    "timeline_advice": "M_Timeline_Advice.csv",
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

COUNTDOWN_SHORT_PLANETS = {"SUN", "MERCURY", "VENUS", "MARS"}
COUNTDOWN_LONG_PLANETS = {"JUPITER", "SATURN", "URANUS", "NEPTUNE", "PLUTO"}
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


MASTER_DATAFRAMES = load_master_dataframes()


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


def _planet_label(value: Any) -> str:
    normalized = _normalize_planet(value)
    return PLANET_LABELS.get(normalized, normalized)


def _has_meaningful_aspect_content(row: dict[str, Any]) -> bool:
    return any(
        bool(_safe_text(row, column))
        for column in ("Text_Description", "Advised_Task", "Countdown_Label")
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
    if not _safe_text(hydrated, "Countdown_Label"):
        countdown_master = get_countdown_master_row(hydrated.get("Countdown_ID"))
        hydrated["Countdown_Label"] = _safe_text(countdown_master, "Display_Title", category or "General")
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
            return _hydrate_aspect_interpretation_row(selected)
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


def _build_timeline_days(
    rows: list[dict[str, Any]],
    baseline_score: int,
    *,
    birth_input: BirthInput | None,
    current_dt: datetime | date | None,
    daily_modifier: int,
    is_noise_heavy: bool,
) -> list[dict[str, Any]]:
    target_date = _dashboard_target_date(current_dt)
    return [
        {
            "date": (target_date + timedelta(days=offset)).isoformat(),
            "timeline": _build_timeline_from_interpretations(
                rows,
                baseline_score,
                birth_input=birth_input,
                current_dt=target_date + timedelta(days=offset),
                daily_modifier=daily_modifier,
                is_noise_heavy=is_noise_heavy,
            ),
        }
        for offset in (-1, 0, 1)
    ]


def build_dashboard_data_from_aspect(row: dict[str, Any]) -> dict[str, Any]:
    return build_dashboard_data_from_interpretations([row] if row else [], {"modifier": 0, "raw_modifier": 0, "items": []})


def _rank_to_catchcopy(rank: str) -> str:
    catchcopies = {
        "S": "\u8ffd\u3044\u98a8\u3092\u6700\u5927\u9650\u306b\u6d3b\u304b\u3059\u65e5",
        "A": "\u8ffd\u3044\u98a8\u3092\u3064\u304b\u3080\u65e5",
        "B+": "\u6d41\u308c\u3092\u6574\u3048\u3066\u524d\u9032\u3059\u308b\u65e5",
        "B": "\u6d41\u308c\u3092\u4fdd\u3061\u306a\u304c\u3089\u9032\u3080\u65e5",
        "C": "\u8db3\u5143\u3092\u6574\u3048\u308b\u65e5",
        "D": "\u614e\u91cd\u306b\u4f59\u767d\u3092\u5b88\u308b\u65e5",
        "E": "\u7121\u7406\u3092\u305b\u305a\u56de\u5fa9\u3092\u512a\u5148\u3059\u308b\u65e5",
    }
    return catchcopies.get(rank, catchcopies.get(rank[:1], catchcopies["C"]))


def _first_sentence(text: str, max_length: int = 140) -> str:
    normalized = str(text or "").strip()
    if not normalized:
        return ""
    for separator in ("。", "、", ".", "\n"):
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
    aspect_description = _safe_text(aspect_row, "Text_Description")

    hero["description"] = description
    hero["guideline"] = _safe_text(basic_row, "Text_Health")
    hero["basicTexts"] = {
        "general": _safe_text(basic_row, "Text_General"),
        "love": _safe_text(basic_row, "Text_Love"),
        "work": _safe_text(basic_row, "Text_Work"),
        "human": _safe_text(basic_row, "Text_Human"),
        "health": _safe_text(basic_row, "Text_Health"),
    }
    hero["basic"] = {
        "planet": _safe_text(basic_row, "Planet_ID"),
        "sign": _safe_text(basic_row, "Sign_ID"),
        "house": _safe_number(basic_row, "House_ID"),
        "source_planet": _safe_text(basic_row, "_source_planet", _safe_text(basic_row, "Planet_ID")),
    }
    if aspect_description:
        hero["summary"] = aspect_description
    return hero


def _top_priority_row(rows: list[dict[str, Any]]) -> dict[str, Any]:
    return max(rows, key=lambda row: (_safe_number(row, "Priority"), _safe_number(row, "Score_Impact")))


def _hero_aspect_label(row: dict[str, Any]) -> str:
    transit_label = _planet_label(row.get("T_Planet"))
    natal_label = _planet_label(row.get("N_Planet"))
    angle = _safe_number(row, "Aspect_Angle")
    if transit_label and natal_label and angle is not None:
        return f"ネイタル{natal_label} × トランジット{transit_label} {angle}°"
    return _safe_text(row, "Aspect_Logic_ID") or "アスペクト"


def _hero_aspect_highlight(row: dict[str, Any], polarity: str) -> dict[str, Any]:
    score = _safe_number(row, "Score_Impact")
    return {
        "polarity": polarity,
        "label": _hero_aspect_label(row),
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


def _top_hero_aspect_highlights(rows: list[dict[str, Any]], limit: int = 2) -> dict[str, list[dict[str, Any]]]:
    eligible_rows = [
        row
        for row in rows
        if _normalize_planet(row.get("T_Planet")) in PERSONAL_READING_TRANSIT_PLANETS
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
        "positive": [_hero_aspect_highlight(row, "positive") for row in positive_ranked],
        "negative": [_hero_aspect_highlight(row, "negative") for row in negative_ranked],
    }


def _sum_daily_vibe_column(daily_vibe: dict[str, Any], column: str) -> int:
    return sum(_safe_number(item, column) for item in daily_vibe.get("items", []))


def _daily_vibe_safety_modifier(daily_vibe: dict[str, Any]) -> int:
    total = 0
    for item in daily_vibe.get("items", []):
        safety_level = _safe_text(item, "Safety_Level").strip().upper()
        total += SAFETY_LEVEL_MODIFIERS.get(safety_level, 0)
    return total


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


def _source_references(
    rows: list[dict[str, Any]],
    *,
    columns: list[str] | None = None,
    note_builder: Any | None = None,
    limit: int | None = None,
) -> list[dict[str, Any]]:
    references: list[dict[str, Any]] = []
    for row in rows[: limit or len(rows)]:
        note = note_builder(row) if callable(note_builder) else None
        reference = _source_reference(row, columns=columns, note=note)
        if reference:
            references.append(reference)
    return references


def _diagnostic_status(score: int) -> tuple[str, str]:
    if score >= 80:
        return (
            "安定運転",
            "ロジックは安定しています。計画通りの実行に適した状態です。",
        )
    if score >= 50:
        return (
            "調整局面",
            "流れは中立に近く、外部要因を見ながら進めると安定しやすい状態です。",
        )
    return (
        "負荷注意",
        "外部要因や重いアスペクトの影響が強めです。無理を減らして足場を固めるのが安全です。",
    )


def _select_primary_diagnostic_row(rows: list[dict[str, Any]], overall_score: int) -> dict[str, Any] | None:
    if not rows:
        return None
    if overall_score < 80:
        negative_rows = [row for row in rows if _safe_number(row, "Score_Impact") < 0]
        if negative_rows:
            return max(negative_rows, key=lambda row: (_safe_number(row, "Priority"), abs(_safe_number(row, "Score_Impact"))))
    return max(rows, key=lambda row: (_safe_number(row, "Priority"), abs(_safe_number(row, "Score_Impact"))))


def _compute_diagnostic_scores(
    total_impact: int,
    decision_impact: int,
    emotion_impact: int,
    negative_load: int,
    positive_buffer: int,
    daily_work_modifier: int,
    daily_love_modifier: int,
    safety_modifier: int,
) -> dict[str, int | float]:
    d_total = _damp(total_impact, 200)
    d_decision = _damp(decision_impact, 150)
    d_emotion = _damp(emotion_impact, 150)
    d_neg_load = _damp(negative_load, 150)
    d_pos_buf = _damp(positive_buffer, 100)

    overall_raw = (
        DIAGNOSTIC_BASE_SCORE
        + (d_total * DIAGNOSTIC_OVERALL_IMPACT_WEIGHT)
        + (daily_work_modifier * DIAGNOSTIC_DAILY_WORK_WEIGHT)
    )
    decision_raw = (
        DIAGNOSTIC_BASE_SCORE
        + (d_decision * DIAGNOSTIC_DECISION_IMPACT_WEIGHT)
        + (daily_work_modifier * DIAGNOSTIC_DAILY_WORK_WEIGHT)
    )
    emotion_raw = (
        DIAGNOSTIC_BASE_SCORE
        + (d_emotion * DIAGNOSTIC_EMOTION_IMPACT_WEIGHT)
        + (daily_love_modifier * DIAGNOSTIC_DAILY_LOVE_WEIGHT)
    )
    noise_raw = (
        DIAGNOSTIC_BASE_SCORE
        - (d_neg_load * DIAGNOSTIC_NOISE_NEGATIVE_WEIGHT)
        + (d_pos_buf * DIAGNOSTIC_NOISE_POSITIVE_WEIGHT)
        + (safety_modifier * DIAGNOSTIC_SAFETY_WEIGHT)
    )
    return {
        "overall_raw": overall_raw,
        "decision_raw": decision_raw,
        "emotion_raw": emotion_raw,
        "noise_raw": noise_raw,
        "overall_score": _clamp(overall_raw, 10, 95),
        "decision_score": _clamp(decision_raw, 10, 95),
        "emotion_score": _clamp(emotion_raw, 10, 95),
        "noise_score": _clamp(noise_raw, 10, 95),
    }


def _build_diagnostic_data(
    interpretations: list[dict[str, Any]],
    daily_vibe: dict[str, Any],
    countdown_data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    total_impact = sum(_safe_number(row, "Score_Impact") for row in interpretations)
    daily_work_modifier = _sum_daily_vibe_column(daily_vibe, "Work_Efficiency_Modifier")
    daily_love_modifier = _sum_daily_vibe_column(daily_vibe, "Love_Vibe_Modifier")
    safety_modifier = _daily_vibe_safety_modifier(daily_vibe)

    decision_impact = 0
    for row in interpretations:
        if _safe_text(row, "Category", "General") == "Work":
            impact = _safe_number(row, "Score_Impact")
            if _safe_number(row, "N_House") == 10:
                impact *= 2
            decision_impact += impact
    emotion_impact = sum(
        _safe_number(row, "Score_Impact")
        for row in interpretations
        if _safe_text(row, "Category", "General") in {"Love", "Health"}
        or _normalize_planet(row.get("T_Planet")) == "MOON"
        or _normalize_planet(row.get("N_Planet")) == "MOON"
    )
    negative_load = sum(max(0, -_safe_number(row, "Score_Impact")) for row in interpretations)
    positive_buffer = sum(max(0, _safe_number(row, "Score_Impact")) for row in interpretations)

    score_bundle = _compute_diagnostic_scores(
        total_impact=total_impact,
        decision_impact=decision_impact,
        emotion_impact=emotion_impact,
        negative_load=negative_load,
        positive_buffer=positive_buffer,
        daily_work_modifier=daily_work_modifier,
        daily_love_modifier=daily_love_modifier,
        safety_modifier=safety_modifier,
    )
    overall_score = int(score_bundle["overall_score"])
    decision_score = int(score_bundle["decision_score"])
    emotion_score = int(score_bundle["emotion_score"])
    noise_score = int(score_bundle["noise_score"])

    status_label, summary = _diagnostic_status(overall_score)

    return {
        "score": overall_score,
        "statusLabel": status_label,
        "summary": summary,
        "items": [
            {
                "label": "意思決定の整合性",
                "value": decision_score,
                "description": "仕事系と日運の仕事補正から、判断軸のぶれにくさを算出しています。",
            },
            {
                "label": "感情と行動の同期",
                "value": emotion_score,
                "description": "月や愛情・健康テーマのアスペクトから、内面と行動の噛み合いを見ています。",
            },
            {
                "label": "外部ノイズ耐性",
                "value": noise_score,
                "description": "負荷の強いアスペクトと安全度補正から、外圧への耐性を可視化しています。",
            },
        ],
    }


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
                "description": "穏やかな日です。無理に動くより、整える時間に向いています。",
                "body": "穏やかな日です。無理に動くより、整える時間に向いています。",
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
            "sourceRow": row,
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


def _ordered_timeline_pool(rows: list[dict[str, Any]], slot_index: int) -> list[dict[str, Any]]:
    if not rows:
        return []
    return rows[slot_index:] + rows[:slot_index]


def _pick_timeline_row_for_planet(
    pools: list[list[dict[str, Any]]],
    planet: str | None,
    slot_index: int,
    used_keys: set[tuple[str, str, int, str]],
    allow_used: bool = False,
) -> dict[str, Any] | None:
    for pool in pools:
        for row in _ordered_timeline_pool(pool, slot_index):
            if planet is not None and _normalize_planet(row.get("T_Planet")) != planet:
                continue
            if not allow_used and _timeline_row_key(row) in used_keys:
                continue
            return row
    return None


def _select_timeline_display_rows(
    primary_rows: list[dict[str, Any]],
    fallback_rows: list[dict[str, Any]],
    slot_index: int,
    used_keys: set[tuple[str, str, int, str]],
) -> list[dict[str, Any]]:
    pools = [primary_rows, fallback_rows]

    def pick_pair(first_planet: str, second_planet: str, allow_used: bool = False) -> list[dict[str, Any]]:
        first = _pick_timeline_row_for_planet(pools, first_planet, slot_index, used_keys, allow_used)
        second = _pick_timeline_row_for_planet(pools, second_planet, slot_index, used_keys, allow_used)
        if not first or not second:
            return []
        if _timeline_row_key(first) == _timeline_row_key(second):
            return []
        return [first, second]

    def pick_single(planet: str, allow_used: bool = False) -> list[dict[str, Any]]:
        row = _pick_timeline_row_for_planet(pools, planet, slot_index, used_keys, allow_used)
        return [row] if row else []

    def pick_other(allow_used: bool = False) -> list[dict[str, Any]]:
        excluded = {"MOON", "SUN", "MERCURY"}
        for pool in pools:
            for row in _ordered_timeline_pool(pool, slot_index):
                if _normalize_planet(row.get("T_Planet")) in excluded:
                    continue
                if not allow_used and _timeline_row_key(row) in used_keys:
                    continue
                return [row]
        return []

    for allow_used in (False, True):
        selected = (
            pick_pair("MOON", "MERCURY", allow_used)
            or pick_pair("SUN", "MERCURY", allow_used)
            or pick_single("MOON", allow_used)
            or pick_single("MERCURY", allow_used)
            or pick_other(allow_used)
        )
        if selected:
            for row in selected:
                used_keys.add(_timeline_row_key(row))
            return selected
    return []


def _timeline_aspect_entry(row: dict[str, Any] | None) -> dict[str, Any]:
    if not row:
        return {}
    recommended_action = _safe_text(row, "Recommended_Action") or _safe_text(row, "Advised_Task")
    return {
        "planet": _normalize_planet(row.get("T_Planet")),
        "planetLabel": _planet_label(row.get("T_Planet")),
        "timelineLabel": _safe_text(row, "timeline_Label"),
        "recommendedAction": recommended_action,
        "description": _safe_text(row, "Text_Description"),
        "sourceRow": row,
        "sourceAspect": {
            "t_planet": _normalize_planet(row.get("T_Planet")),
            "n_planet": _normalize_planet(row.get("N_Planet")),
            "angle": _safe_number(row or {}, "Aspect_Angle"),
            "category": _safe_text(row, "Category", "General"),
        },
    }


def _rank_timeline_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        rows,
        key=lambda row: (_safe_number(row, "Priority"), abs(_safe_number(row, "Score_Impact"))),
        reverse=True,
    )


def _has_timeline_planet(rows: list[dict[str, Any]], planet: str) -> bool:
    return any(_normalize_planet(row.get("T_Planet")) == planet for row in rows)


def _build_prioritized_slot_interpretations(
    birth_input: BirthInput,
    slot_def: dict[str, Any],
    target_date: date,
) -> list[dict[str, Any]]:
    rows = _build_slot_interpretations(
        birth_input,
        slot_def,
        target_date,
        transit_planets=("MOON", "MERCURY"),
    )
    has_moon = _has_timeline_planet(rows, "MOON")
    has_mercury = _has_timeline_planet(rows, "MERCURY")
    if has_moon and has_mercury:
        return _rank_timeline_rows(rows)
    if has_mercury and not has_moon:
        rows.extend(
            _build_slot_interpretations(
                birth_input,
                slot_def,
                target_date,
                transit_planets=("SUN",),
            )
        )
        return _rank_timeline_rows(rows)
    if has_moon:
        return _rank_timeline_rows(rows)
    rows.extend(
        _build_slot_interpretations(
            birth_input,
            slot_def,
            target_date,
            transit_planets=tuple(planet for planet in TRANSIT_PLANET_ORDER if planet not in {"MOON", "SUN", "MERCURY"}),
        )
    )
    return _rank_timeline_rows(rows)


def _select_countdown_target(rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    targets = _select_countdown_targets(rows, limit=1)
    return targets[0] if targets else None


def _select_countdown_targets(
    rows: list[dict[str, Any]],
    limit: int = 3,
    score_sign: str = "positive",
) -> list[dict[str, Any]]:
    score_sign_normalized = str(score_sign or "").strip().lower()
    allowed_orb_statuses = {"APPLYING", "SEPARATING"}
    candidates = [
        row
        for row in rows
        if _normalize_orb_status(row.get("_orb_status", row.get("Orb_Status"))) in allowed_orb_statuses
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


def _select_display_countdown_items(items: list[dict[str, Any]], limit: int = 3) -> list[dict[str, Any]]:
    def display_bucket(item: dict[str, Any]) -> int:
        days_remaining = _normalize_int(item.get("days_remaining", item.get("daysLeft"))) or 0
        scan_status = str(item.get("scan_status") or item.get("scan", {}).get("scan_status") or "").strip().lower()
        if days_remaining > 0:
            return 0
        if scan_status == "exact":
            return 1
        return 2

    ranked = sorted(enumerate(items), key=lambda pair: (display_bucket(pair[1]), pair[0]))
    return [item for _index, item in ranked[:limit]]


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
    countdown_df = MASTER_DATAFRAMES.get("countdown", pd.DataFrame())
    if countdown_df.empty or "Trigger_ID" not in countdown_df.columns:
        LOGGER.error("Countdown master is empty, failed to load, or missing Trigger_ID.")
        return None
    matches = countdown_df[countdown_df["Trigger_ID"].map(_normalize_trigger_id) == normalized_trigger_id]
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


def _retrograde_calendar_start_day(
    transit_planet: str,
    scan_start: datetime,
    through_day: int,
) -> int | None:
    calendar_df = MASTER_DATAFRAMES.get("transit_calendar", pd.DataFrame())
    if calendar_df.empty:
        return None
    required_columns = {"Date", "Planet", "Retrograde_Start_Flag"}
    if not required_columns.issubset(calendar_df.columns):
        return None
    normalized_planet = _normalize_planet(transit_planet)
    start_date = scan_start.date()
    end_date = (scan_start + timedelta(days=max(through_day, 0))).date()
    for row in calendar_df.to_dict("records"):
        if _normalize_planet(row.get("Planet")) != normalized_planet:
            continue
        if _normalize_bool_flag(row.get("Retrograde_Start_Flag")) != 1:
            continue
        event_date = _parse_transit_calendar_date(row.get("Date"))
        if event_date is None or not (start_date <= event_date <= end_date):
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
    transit_longitude, is_retrograde = _calc_transit_planet_state(
        transit_planet,
        sample_local_dt,
        timezone_offset,
    )
    orb = abs(get_angle_diff(transit_longitude, natal_longitude) - exact_angle)
    return orb, is_retrograde


def _scan_countdown_ephemeris(
    row: dict[str, Any],
    current_dt: datetime | date | None,
    total_days: int,
    threshold_orb: float,
) -> dict[str, Any] | None:
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
    total_progress_days = max(total_days, days_remaining, 1)
    clamped_days_remaining = _clamp(days_remaining, 0, total_progress_days)
    percent = ((total_progress_days - clamped_days_remaining) / total_progress_days) * 100
    return {
        "days_remaining": clamped_days_remaining,
        "total_days": total_progress_days,
        "percent": _clamp(percent, 0, 100),
        "scan_status": scan_status,
        "peak_day": minimum_day,
        "peak_orb": round(minimum_orb, 3),
        "current_orb": round(current_orb if current_orb is not None else minimum_orb, 3),
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
            total_progress_days = max(total_days, day, 1)
            percent = ((total_progress_days - day) / total_progress_days) * 100
            return {
                "days_remaining": _clamp(day, 0, total_progress_days),
                "total_days": total_progress_days,
                "percent": _clamp(percent, 0, 100),
                "scan_status": "departing",
                "current_orb": round(current_orb if current_orb is not None else orb, 3),
                "departure_day": day,
                "departure_orb": round(orb, 3),
                "departure_retrograde": is_retrograde,
            }
    return None


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
) -> dict[str, Any] | None:
    if not countdown_target:
        return None
    countdown_id = _safe_text(countdown_target, "Countdown_ID")
    fallback_label = _safe_text(countdown_target, "Countdown_Label")
    advised_task = _safe_text(countdown_target, "Advised_Task")
    current_orb = _extract_current_orb(countdown_target)
    master_row = get_countdown_master_row(countdown_id)
    if not master_row:
        title = fallback_label or "谺｡縺ｮ霑ｽ縺・｢ｨ縺ｾ縺ｧ"
        return {
            "title": title,
            "daysLeft": 0,
            "totalDays": DEFAULT_COUNTDOWN_TOTAL_DAYS,
            "note": advised_task or title,
            "days_remaining": 0,
            "total_days": DEFAULT_COUNTDOWN_TOTAL_DAYS,
            "percent": 0,
            "orb_percent": 0,
            "exit_days_remaining": 0,
            "departure_days_remaining": 0,
            "priority": _safe_number(countdown_target, "Priority"),
            "trigger_id": countdown_id,
            "countdown_id": countdown_id,
            "fallback_label": fallback_label,
            "aspect_label": _countdown_aspect_label(countdown_target),
            "current_orb": current_orb,
            "countdown_mode": countdown_mode,
            "target": countdown_target,
        }

    threshold_orb = _normalize_float(master_row.get("Threshold_Orb")) or DEFAULT_COUNTDOWN_THRESHOLD_ORB
    total_days = _normalize_int(master_row.get("Max_Progress_Days")) or _normalize_int(master_row.get("Progress_Max_Days")) or DEFAULT_COUNTDOWN_TOTAL_DAYS
    countdown_mode_normalized = str(countdown_mode or "").strip().lower()
    scan = (
        _scan_countdown_departure(countdown_target, current_dt, total_days, threshold_orb)
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
    if countdown_mode_normalized == "departure":
        title = (
            _safe_text(master_row, "Arrival_Text", _safe_text(master_row, "Display_Title") or fallback_label)
            if days_remaining <= 0
            else _safe_text(master_row, "Display_Title") or fallback_label
        )
    else:
        title = (
            _safe_text(master_row, "Arrival_Text", _safe_text(master_row, "Display_Title") or fallback_label)
            if current_orb <= 0.5
            else _safe_text(master_row, "Display_Title") or fallback_label
        )
    note = _safe_text(master_row, "Next_Action_Hint") or advised_task

    return {
        "title": title,
        "daysLeft": days_remaining,
        "totalDays": total_days,
        "note": note,
        "days_remaining": days_remaining,
        "total_days": total_days,
        "percent": progress_percent,
        "orb_percent": orb_percent,
        "exit_days_remaining": exit_days_remaining,
        "departure_days_remaining": exit_days_remaining,
        "scan_status": scan_status,
        "priority": _safe_number(countdown_target, "Priority"),
        "trigger_id": _safe_text(master_row, "Trigger_ID", countdown_id),
        "countdown_id": countdown_id,
        "fallback_label": fallback_label,
        "aspect_label": _countdown_aspect_label(countdown_target),
        "current_orb": current_orb,
        "threshold_orb": threshold_orb,
        "countdown_mode": countdown_mode_normalized or "arrival",
        "scan": scan,
        "arrival_text": _safe_text(master_row, "Arrival_Text"),
        "display_title": _safe_text(master_row, "Display_Title"),
        "target": countdown_target,
    }


TIMELINE_SLOT_DEFS = [
    {"id": "MORNING", "label": "06:00 - 12:00 (Morning)", "time_range": "06:00-12:00", "sample_hour": 9},
    {"id": "AFTERNOON", "label": "12:00 - 18:00 (Afternoon)", "time_range": "12:00-18:00", "sample_hour": 15},
    {"id": "EVENING", "label": "18:00 - 24:00 (Evening)", "time_range": "18:00-24:00", "sample_hour": 21},
    {"id": "NIGHT", "label": "00:00 - 06:00 (Night)", "time_range": "00:00-06:00", "sample_hour": 3, "day_offset": 1},
]


def _timeline_advice_rows() -> pd.DataFrame:
    return MASTER_DATAFRAMES.get("timeline_advice", pd.DataFrame())


def _timeline_target_score(slot_id: str) -> int:
    advice_df = _timeline_advice_rows()
    if advice_df.empty:
        return 50
    slot_rows = advice_df[advice_df["Time_Slot_ID"].map(lambda value: str(value).strip().upper()) == slot_id.upper()]
    if slot_rows.empty:
        return 50
    return _normalize_int(slot_rows.iloc[0].get("Target_Score")) or 50


def _get_timeline_advice(slot_id: str, additive_score: int) -> dict[str, Any]:
    fallback = {
        "Target_Score": 50,
        "Condition": "MATCH",
        "Status_Label": "螳牙ｮ壽耳遘ｻ",
        "Action_Type": "Focus",
    }
    advice_df = _timeline_advice_rows()
    if advice_df.empty:
        return fallback
    slot_rows = advice_df[advice_df["Time_Slot_ID"].map(lambda value: str(value).strip().upper()) == slot_id.upper()]
    if slot_rows.empty:
        return fallback
    target_score = _normalize_int(slot_rows.iloc[0].get("Target_Score")) or 50
    delta = additive_score - target_score
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


def _timeline_condition_multiplier(condition: Any) -> float:
    normalized_condition = str(condition or "").strip().upper()
    return TIMELINE_CONDITION_MULTIPLIERS.get(normalized_condition, 1.0)


def _build_natal_planet_rows(birth_input: BirthInput) -> list[dict[str, Any]]:
    chart_rows = build_chart_rows(birth_input)
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
    return natal_rows


def _build_natal_aspect_points(birth_input: BirthInput) -> list[dict[str, Any]]:
    chart_rows = build_chart_rows(birth_input)
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
    return natal_rows


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
    planet_ids = _transit_planet_ids()
    planet_id = planet_ids[_normalize_planet(planet)]
    utc_dt = sample_local_dt - timedelta(hours=timezone_offset)
    hour_decimal = utc_dt.hour + (utc_dt.minute / 60) + (utc_dt.second / 3600)
    jd = swe.julday(utc_dt.year, utc_dt.month, utc_dt.day, hour_decimal)
    result = swe.calc_ut(jd, planet_id, swe.FLG_SPEED)
    return float(result[0][0]), float(result[0][3])


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
    calendar_df = MASTER_DATAFRAMES.get("retrograde_calendar", pd.DataFrame())
    if calendar_df.empty:
        return []
    target_date = current_dt.date() if isinstance(current_dt, datetime) else current_dt
    if target_date is None:
        target_date = _app_today()
    normalized_planet = _normalize_planet(planet) if planet else ""
    normalized_event = str(event_type or "").strip().upper()
    rows: list[dict[str, Any]] = []
    for raw_row in calendar_df.to_dict("records"):
        event_date = _parse_transit_calendar_date(raw_row.get("Event_Date"))
        if event_date is None or event_date < target_date:
            continue
        if normalized_planet and _normalize_planet(raw_row.get("Planet")) != normalized_planet:
            continue
        if normalized_event and str(raw_row.get("Event_Type") or "").strip().upper() != normalized_event:
            continue
        row = dict(raw_row)
        row["Event_Date"] = event_date.isoformat()
        rows.append(row)
    rows.sort(key=lambda row: (str(row.get("Event_DateTime_JST") or row.get("Event_Date")), str(row.get("Planet") or "")))
    return rows


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
) -> list[dict[str, Any]]:
    natal_rows = _build_natal_planet_rows(birth_input)
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


def _build_timeline_slot_from_rows(
    slot_def: dict[str, Any],
    slot_rows: list[dict[str, Any]],
    fallback_row: dict[str, Any] | None = None,
    daily_modifier: int = 0,
    is_noise_heavy: bool = False,
) -> dict[str, Any]:
    target_score = _timeline_target_score(slot_def["id"])
    total_impact = sum(_safe_number(row, "Score_Impact") for row in slot_rows)
    dominant_candidates = slot_rows or ([fallback_row] if fallback_row else [])
    dominant_row = max(dominant_candidates, key=lambda row: (_safe_number(row, "Score_Impact"), _safe_number(row, "Priority"))) if dominant_candidates else None
    additive_score = _clamp(target_score + total_impact + daily_modifier, 0, 100)
    advice_row = _get_timeline_advice(slot_def["id"], additive_score)
    condition = _safe_text(advice_row, "Condition", "MATCH")
    multiplier = _timeline_condition_multiplier(condition)
    final_score = _clamp(round(additive_score * multiplier), 0, 100)

    aspect_recommended_action = _safe_text(dominant_row, "Recommended_Action")
    aspect_action = _safe_text(dominant_row, "Advised_Task")
    timeline_label = _safe_text(dominant_row, "timeline_Label")
    detail = _safe_text(dominant_row, "Text_Description")
    timeline_aspects = [_timeline_aspect_entry(row) for row in dominant_candidates if row]

    advice_status = _safe_text(advice_row, "Status_Label", slot_def["id"])

    combined_recommendation = aspect_recommended_action or aspect_action

    LOGGER.info(
        "Timeline score: slot=%s target=%s impact=%s daily=%s additive=%s final=%s condition=%s multiplier=%s",
        slot_def["id"],
        target_score,
        total_impact,
        daily_modifier,
        additive_score,
        final_score,
        condition,
        multiplier,
    )

    return {
        "label": slot_def["label"],
        "title": advice_status,
        "score": final_score,
        "timelineLabel": timeline_label,
        "timelineAspects": timeline_aspects,
        "recommendedAction": combined_recommendation,
        "description": detail,
        "recommendation": combined_recommendation,
        "detail": detail,
        "statusLabel": advice_status,
        "actionType": _safe_text(advice_row, "Action_Type"),
        "condition": condition,
        "targetScore": target_score,
        "scoreImpactTotal": total_impact,
        "dailyModifier": daily_modifier,
        "additiveScore": additive_score,
        "multiplier": multiplier,
        "sourceRow": dominant_row,
        "timelineAdviceRow": advice_row,
        "sourceAspect": {
            "t_planet": _normalize_planet(dominant_row.get("T_Planet")) if dominant_row else "",
            "n_planet": _normalize_planet(dominant_row.get("N_Planet")) if dominant_row else "",
            "angle": _safe_number(dominant_row or {}, "Aspect_Angle"),
            "category": _safe_text(dominant_row, "Category", "General"),
        },
    }


def _build_timeline_from_interpretations(
    rows: list[dict[str, Any]],
    baseline_score: int = 50,
    birth_input: BirthInput | None = None,
    current_dt: datetime | date | None = None,
    daily_modifier: int = 0,
    is_noise_heavy: bool = False,
) -> list[dict[str, Any]]:
    ranked = _rank_timeline_rows(rows)

    if birth_input is not None and swe is not None:
        target_date = current_dt.date() if isinstance(current_dt, datetime) else current_dt or _app_today()
        used_keys: set[tuple[str, str, int, str]] = set()
        timeline: list[dict[str, Any]] = []
        for index, slot_def in enumerate(TIMELINE_SLOT_DEFS):
            slot_rows = _build_prioritized_slot_interpretations(birth_input, slot_def, target_date)
            display_rows = _select_timeline_display_rows(slot_rows, ranked, index, used_keys)
            fallback_row = display_rows[0] if display_rows else None
            timeline.append(_build_timeline_slot_from_rows(slot_def, display_rows, fallback_row, daily_modifier=daily_modifier, is_noise_heavy=is_noise_heavy))
        return timeline

    used_keys: set[tuple[str, str, int, str]] = set()
    timeline: list[dict[str, Any]] = []
    for index, slot_def in enumerate(TIMELINE_SLOT_DEFS):
        slot_rows = _select_timeline_display_rows(ranked, [], index, used_keys)
        fallback_row = slot_rows[0] if slot_rows else None
        if not slot_rows and fallback_row is None:
            target_score = _timeline_target_score(slot_def["id"])
            additive_score = _clamp(target_score + daily_modifier, 0, 100)
            advice_row = _get_timeline_advice(slot_def["id"], additive_score)
            condition = _safe_text(advice_row, "Condition", "MATCH")
            multiplier = _timeline_condition_multiplier(condition)
            final_score = _clamp(round(additive_score * multiplier), 0, 100)
            timeline.append({
                "label": slot_def["label"],
                "title": _safe_text(advice_row, "Status_Label", slot_def["id"]),
                "score": final_score,
                "recommendedAction": "予定を詰め込みすぎず、整える時間を優先してください。",
                "description": "強いアスペクトが少ないため、無理に動くより日常のリズムを整える時間帯です。",
                "recommendation": "穏やかな調整",
                "detail": "強いアスペクトが少ないため、無理に動くより日常のリズムを整える時間帯です。",
                "statusLabel": _safe_text(advice_row, "Status_Label"),
                "actionType": _safe_text(advice_row, "Action_Type"),
                "condition": condition,
                "targetScore": target_score,
                "scoreImpactTotal": 0,
                "dailyModifier": daily_modifier,
                "additiveScore": additive_score,
                "multiplier": multiplier,
                "sourceRow": None,
                "timelineAdviceRow": advice_row,
                "sourceAspect": {"t_planet": "", "n_planet": "", "angle": 0, "category": "General"},
                "timelineAspects": [],
            })
            continue
        timeline.append(_build_timeline_slot_from_rows(slot_def, slot_rows, fallback_row, daily_modifier=daily_modifier, is_noise_heavy=is_noise_heavy))
    return timeline


def _build_developer_meta(
    hero_row: dict[str, Any] | None,
    interpretations: list[dict[str, Any]],
    basic_interpretations: list[dict[str, Any]] | None,
    daily_vibe: dict[str, Any],
    countdown_data: dict[str, Any] | None,
    timeline: list[dict[str, Any]],
    topics: list[dict[str, Any]],
    final_score: int,
    average_score: int | float,
) -> dict[str, Any]:
    total_impact = sum(_safe_number(row, "Score_Impact") for row in interpretations)
    daily_work_modifier = _sum_daily_vibe_column(daily_vibe, "Work_Efficiency_Modifier")
    daily_love_modifier = _sum_daily_vibe_column(daily_vibe, "Love_Vibe_Modifier")
    safety_modifier = _daily_vibe_safety_modifier(daily_vibe)
    decision_rows = [row for row in interpretations if _safe_text(row, "Category", "General") == "Work"]
    emotion_rows = [
        row for row in interpretations
        if _safe_text(row, "Category", "General") in {"Love", "Health"}
        or _normalize_planet(row.get("T_Planet")) == "MOON"
        or _normalize_planet(row.get("N_Planet")) == "MOON"
    ]
    decision_impact = sum(_safe_number(row, "Score_Impact") for row in decision_rows)
    emotion_impact = sum(_safe_number(row, "Score_Impact") for row in emotion_rows)
    negative_load = sum(max(0, -_safe_number(row, "Score_Impact")) for row in interpretations)
    positive_buffer = sum(max(0, _safe_number(row, "Score_Impact")) for row in interpretations)
    score_bundle = _compute_diagnostic_scores(
        total_impact=total_impact,
        decision_impact=decision_impact,
        emotion_impact=emotion_impact,
        negative_load=negative_load,
        positive_buffer=positive_buffer,
        daily_work_modifier=daily_work_modifier,
        daily_love_modifier=daily_love_modifier,
        safety_modifier=safety_modifier,
    )
    overall_score = int(score_bundle["overall_score"])
    decision_score = int(score_bundle["decision_score"])
    emotion_score = int(score_bundle["emotion_score"])
    noise_score = int(score_bundle["noise_score"])
    hero_score_breakdown = [_safe_number(row, "Score_Impact") for row in interpretations]
    hero_score_breakdown_text = " + ".join(str(score) for score in hero_score_breakdown) if hero_score_breakdown else "0"
    hero_score_count = len(hero_score_breakdown) if hero_score_breakdown else 1

    personal_sources: list[dict[str, Any]] = []
    if hero_row:
        ref = _source_reference(
            hero_row,
            columns=["Aspect_Logic_ID", "Text_Description", "Advised_Task", "Score_Impact", "Priority"],
            note="Hero の主採用アスペクトです。",
        )
        if ref:
            personal_sources.append(ref)
    basic_primary = _primary_basic_row(basic_interpretations or [])
    if basic_primary:
        ref = _source_reference(
            basic_primary,
            columns=["Planet_ID", "Sign_ID", "House_ID", "Text_General", "Text_Work", "Text_Love", "Text_Human", "Text_Health"],
            note="ネイタル基本解釈の参照元です。",
        )
        if ref:
            personal_sources.append(ref)

    daily_sources = _source_references(
        daily_vibe.get("items", []),
        columns=["Event_Type", "Target_Planet", "Condition", "Work_Efficiency_Modifier", "Love_Vibe_Modifier", "Safety_Level"],
        note_builder=lambda row: (
            f"日運補正 Work={_safe_number(row, 'Work_Efficiency_Modifier')} / "
            f"Love={_safe_number(row, 'Love_Vibe_Modifier')} / "
            f"Safety={_safe_text(row, 'Safety_Level')}"
        ),
        limit=5,
    )

    timeline_sources: list[dict[str, Any]] = []
    for slot in timeline:
        slot_sources: list[dict[str, Any]] = []
        aspect_source = _source_reference(
            slot.get("sourceRow"),
            columns=[
                "Aspect_Logic_ID",
                "T_Planet",
                "N_Planet",
                "Aspect_Angle",
                "Recommended_Action",
                "timeline_Label",
                "Text_Description",
                "Advised_Task",
                "Score_Impact",
                "Priority",
            ],
            note=(
                f"{slot.get('label')} の本文に使った主アスペクトです。"
                f"基準値 {slot.get('targetScore')} + アスペクト合計 {slot.get('scoreImpactTotal')} + "
                f"日運補正 {slot.get('dailyModifier')} = 加算後 {slot.get('additiveScore')}"
            ),
        )
        if aspect_source:
            slot_sources.append(aspect_source)
        advice_source = _source_reference(
            slot.get("timelineAdviceRow"),
            columns=["Time_Slot_ID", "Target_Score", "Condition", "Condition_Threshold", "Status_Label", "Action_Type"],
            note=f"{slot.get('label')} の Condition={slot.get('condition')} を判定したタイムラインマスタです。",
        )
        if advice_source:
            slot_sources.append(advice_source)
        timeline_sources.append(
            {
                "slot": slot.get("label"),
                "logic": (
                    f"計算式は (基準値 {slot.get('targetScore')} + アスペクト合計 {slot.get('scoreImpactTotal')} + "
                    f"日運補正 {slot.get('dailyModifier')}) × 条件倍率 {slot.get('multiplier')} です。"
                    f"今回は ({slot.get('targetScore')} + {slot.get('scoreImpactTotal')} + {slot.get('dailyModifier')}) × "
                    f"{slot.get('multiplier')} = {slot.get('score')} として算出しています。"
                ),
                "sources": slot_sources,
            }
        )

    topic_sources: list[dict[str, Any]] = []
    for topic in topics:
        topic_source = _source_reference(
            topic.get("sourceRow"),
            columns=["Aspect_Logic_ID", "Category", "Advised_Task", "Score_Impact", "Priority"],
            note=f"{topic.get('title')} カードで採用した最大 Score_Impact 行です。",
        )
        topic_sources.append(
            {
                "topic": topic.get("title"),
                "logic": (
                    f"計算式は カテゴリ内の Score_Impact 最大値 = カード採用値 です。"
                    f"{topic.get('title')} では、そのカテゴリ候補の中で最も高い 1 行だけを表示しています。"
                ),
                "sources": [topic_source] if topic_source else [],
            }
        )

    countdown_logic = (
        f"計算式は 100 - (現在オーブ {countdown_data.get('current_orb', 0)} / "
        f"しきい値 {countdown_data.get('threshold_orb', 0)}) × 100 です。"
        f"今回は進捗率 {countdown_data.get('percent', 0)}% を表示しています。"
        f"残り日数は 現在オーブ {countdown_data.get('current_orb', 0)} を平均速度で割って "
        f"{countdown_data.get('days_remaining', 0)} 日と見積もっています。"
        if countdown_data
        else "Applying かつ Score_Impact が正の候補から 1 件を選び、Countdown_ID で M_Countdown_Master と突き合わせて表示内容を決めています。"
    )

    countdown_sources: list[dict[str, Any]] = []
    if countdown_data:
        target_ref = _source_reference(
            countdown_data.get("target"),
            columns=["Aspect_Logic_ID", "Countdown_ID", "Countdown_Label", "Score_Impact", "Priority"],
            note=f"採用したアスペクトです。現在オーブは {countdown_data.get('current_orb')} です。",
        )
        if target_ref:
            countdown_sources.append(target_ref)
        master_ref = _source_reference(
            get_countdown_master_row(countdown_data.get("countdown_id") or countdown_data.get("trigger_id")),
            columns=["Trigger_ID", "Display_Title", "Arrival_Text", "Next_Action_Hint", "Threshold_Orb", "Max_Progress_Days"],
            note="表示タイトル、到達メッセージ、しきい値、総日数の参照元です。",
        )
        if master_ref:
            countdown_sources.append(master_ref)

    return {
        "personalReading": {
            "logic": (
                f"計算式は 基準点 50 + 平均アスペクト値 × {HERO_ASPECT_AVERAGE_WEIGHT} + 日運補正 = Hero スコア です。"
                f"平均アスペクト値の内訳は ({hero_score_breakdown_text}) / {hero_score_count} = {round(average_score, 2)} です。"
                f"今回は 50 + {round(average_score, 2)} × {HERO_ASPECT_AVERAGE_WEIGHT} + {daily_work_modifier} = {final_score} として算出しています。"
                f"つまり基準点 50 に、Score_Impact の合計 {total_impact} を {hero_score_count} 件で割った平均へ倍率をかけ、日運補正 {daily_work_modifier} を加えています。"
            ),
            "sources": personal_sources,
        },
        "diagnostic": {
            "logic": (
                f"計算式は 50 + 全アスペクト合計 × {DIAGNOSTIC_OVERALL_IMPACT_WEIGHT} + 日運の仕事補正 × {DIAGNOSTIC_DAILY_WORK_WEIGHT} です。"
                f"全アスペクト合計の内訳は ({hero_score_breakdown_text}) = {total_impact} です。"
                f"今回は 50 + {total_impact} × {DIAGNOSTIC_OVERALL_IMPACT_WEIGHT} + {daily_work_modifier} × {DIAGNOSTIC_DAILY_WORK_WEIGHT} = {round(score_bundle['overall_raw'], 2)} と計算し、0〜100 に収めて {overall_score} としています。"
                f"文章はこの総合値をもとに、80以上なら 安定運転、50以上なら 調整局面、それ未満なら 負荷注意 へ振り分けています。"
                f"本文は _diagnostic_status で総合ラベルごとの定型文を選び、主要因は _select_primary_diagnostic_row で最優先のアスペクト行を 1 件選んで表示しています。"
            ),
            "sources": [
                *(_source_references(
                    interpretations,
                    columns=["Aspect_Logic_ID", "Category", "Score_Impact", "Priority"],
                    note_builder=lambda row: (
                        f"総合判定への内訳 {_safe_number(row, 'Score_Impact')} / "
                        f"{_safe_text(row, 'Aspect_Logic_ID') or _safe_text(row, 'T_Planet')}"
                    ),
                )),
                *daily_sources,
            ],
            "entries": [
                {
                    "label": "意思決定の整合性",
                    "logic": (
                        f"計算式は 50 + Category が Work の行だけを合計した値 × {DIAGNOSTIC_DECISION_IMPACT_WEIGHT} + "
                        f"日運の仕事補正 × {DIAGNOSTIC_DAILY_WORK_WEIGHT} です。"
                        f"ここで使う {decision_impact} は全アスペクト合計ではなく、Work に分類された行だけの Score_Impact 合計です。"
                        f"今回は 50 + {decision_impact} × {DIAGNOSTIC_DECISION_IMPACT_WEIGHT} + "
                        f"{daily_work_modifier} × {DIAGNOSTIC_DAILY_WORK_WEIGHT} = {round(score_bundle['decision_raw'], 2)} と計算し、"
                        f"最終値を {decision_score} としています。"
                    ),
                    "sources": [
                        *(_source_references(
                            decision_rows,
                            columns=["Aspect_Logic_ID", "Category", "Score_Impact", "Priority"],
                            note_builder=lambda row: f"意思決定への内訳 {_safe_number(row, 'Score_Impact')}",
                        )),
                        *(_source_references(
                            daily_vibe.get("items", []),
                            columns=["Event_Type", "Target_Planet", "Condition", "Work_Efficiency_Modifier"],
                            note_builder=lambda row: f"仕事補正 {_safe_number(row, 'Work_Efficiency_Modifier')}",
                            limit=3,
                        )),
                    ],
                },
                {
                    "label": "感情と行動の同期",
                    "logic": (
                        f"計算式は 50 + Category が Love または Health の行、または Transit/Natal のどちらかが Moon の行だけを合計した値 × {DIAGNOSTIC_EMOTION_IMPACT_WEIGHT} + 日運の感情補正 × {DIAGNOSTIC_DAILY_LOVE_WEIGHT} です。"
                        f"今回は 50 + {emotion_impact} × {DIAGNOSTIC_EMOTION_IMPACT_WEIGHT} + {daily_love_modifier} × {DIAGNOSTIC_DAILY_LOVE_WEIGHT} = {round(score_bundle['emotion_raw'], 2)} と計算し、最終値を {emotion_score} としています。"
                    ),
                    "sources": [
                        *(_source_references(
                            emotion_rows,
                            columns=["Aspect_Logic_ID", "Category", "Score_Impact", "Priority"],
                            note_builder=lambda row: f"感情同期への内訳 {_safe_number(row, 'Score_Impact')}",
                        )),
                        *(_source_references(
                            daily_vibe.get("items", []),
                            columns=["Event_Type", "Target_Planet", "Condition", "Love_Vibe_Modifier"],
                            note_builder=lambda row: f"感情補正 {_safe_number(row, 'Love_Vibe_Modifier')}",
                            limit=3,
                        )),
                    ],
                },
                {
                    "label": "外部ノイズ耐性",
                    "logic": (
                        f"計算式は 50 - 負荷合計 × {DIAGNOSTIC_NOISE_NEGATIVE_WEIGHT} + 正のバッファ × {DIAGNOSTIC_NOISE_POSITIVE_WEIGHT} + Safety補正 × {DIAGNOSTIC_SAFETY_WEIGHT} です。"
                        f"今回は 50 - {negative_load} × {DIAGNOSTIC_NOISE_NEGATIVE_WEIGHT} + {positive_buffer} × {DIAGNOSTIC_NOISE_POSITIVE_WEIGHT} + {safety_modifier} × {DIAGNOSTIC_SAFETY_WEIGHT} = {round(score_bundle['noise_raw'], 2)} と計算し、最終値を {noise_score} としています。"
                    ),
                    "sources": [
                        *(_source_references(
                            interpretations,
                            columns=["Aspect_Logic_ID", "Category", "Score_Impact", "Priority"],
                            note_builder=lambda row: f"ノイズ耐性への内訳 {_safe_number(row, 'Score_Impact')}",
                        )),
                        *(_source_references(
                            daily_vibe.get("items", []),
                            columns=["Event_Type", "Target_Planet", "Condition", "Safety_Level"],
                            note_builder=lambda row: f"Safety補正 {_safe_text(row, 'Safety_Level')}",
                            limit=3,
                        )),
                    ],
                },
            ],
        },
        "countdown": {
            "logic": countdown_logic,
            "sources": countdown_sources,
        },
        "timeline": {
            "logic": "各時間帯では、主アスペクト 1 件を選び、M_Timeline_Advice の基準値にアスペクト合計と日運補正を加えた後、Condition に応じた倍率を掛けてスコアを出しています。",
            "sources": timeline_sources,
        },
        "topics": {
            "logic": "トピック強化カードは Category ごとに候補をまとめ、その中で Score_Impact が最も高い 1 行だけを採用しています。",
            "sources": topic_sources,
        },
    }
def build_dashboard_data_from_interpretations(
    interpretations: list[dict[str, Any]],
    daily_vibe: dict[str, Any],
    basic_interpretations: list[dict[str, Any]] | None = None,
    birth_input: BirthInput | None = None,
    current_dt: datetime | date | None = None,
) -> dict[str, Any]:
    daily_modifier = _safe_number(daily_vibe, "modifier")
    daily_star_vibe = get_daily_star_vibe_description(current_dt)
    if not interpretations:
        final_score = _clamp(50 + daily_modifier, 0, 100)
        hero = {
            "rank": _score_to_rank(final_score),
            "score": final_score,
            "title": "Today Overview",
            "dailyStarVibe": daily_star_vibe,
            "guidance": "穏やかな日です。予定を詰め込みすぎず、余白を保つほど安定します。",
            "summary": "大きな追い風も逆風も薄い日です。整えること、記録すること、静かに選ぶことが今日の運気を底上げします。",
        }
        hero = _apply_basic_to_hero(hero, basic_interpretations, None, [])
        diagnostic = _build_diagnostic_data([], daily_vibe, None)
        is_noise_heavy = any(str(item.get("Safety_Level", "")).strip().upper() == "LOW" for item in daily_vibe.get("items", []))
        timeline = _build_timeline_from_interpretations([], final_score, birth_input=birth_input, current_dt=current_dt, daily_modifier=daily_modifier, is_noise_heavy=is_noise_heavy)
        timeline_days = _build_timeline_days([], final_score, birth_input=birth_input, current_dt=current_dt, daily_modifier=daily_modifier, is_noise_heavy=is_noise_heavy)
        topics = _build_topics_from_interpretations([], final_score)
        return _to_json_compatible({
            "header": _dashboard_header(),
            "hero": hero,
            "countdown": None,
            "diagnostic": diagnostic,
            "timeline": timeline,
            "timelineDate": _dashboard_date(current_dt),
            "timelineDays": timeline_days,
            "planetMotion": _dashboard_planet_motion(birth_input, current_dt),
            "retrogradeCalendar": _dashboard_retrograde_calendar(current_dt),
            "topics": topics,
            "premium": {"title": "Premium AI Preview", "description": "", "placeholder": "", "preview": ""},
            "aspect_interpretations": [],
            "basic_interpretations": basic_interpretations or [],
            "daily_vibe": daily_vibe,
            "developerMeta": _build_developer_meta(None, [], basic_interpretations or [], daily_vibe, None, timeline, topics, final_score, 50),
        })

    average_score = sum(_safe_number(row, "Score_Impact") for row in interpretations) / len(interpretations)
    final_score = _clamp(50 + (average_score * HERO_ASPECT_AVERAGE_WEIGHT) + daily_modifier, 0, 100)
    hero_row = _top_priority_row(interpretations)
    short_countdown_targets = _countdown_targets_by_planet_group(
        interpretations,
        COUNTDOWN_SHORT_PLANETS,
        limit=12,
        score_sign="positive",
    )
    long_countdown_targets = _countdown_targets_by_planet_group(
        interpretations,
        COUNTDOWN_LONG_PLANETS,
        limit=999,
        score_sign="positive",
    )
    short_negative_countdown_targets = _countdown_targets_by_planet_group(
        interpretations,
        COUNTDOWN_SHORT_PLANETS,
        limit=12,
        score_sign="negative",
    )
    long_negative_countdown_targets = _countdown_targets_by_planet_group(
        interpretations,
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
    short_countdown_group = [*short_countdown_items, *short_negative_countdown_items]
    long_countdown_group = [*long_countdown_all_items, *long_negative_countdown_items]
    long_countdown_priority_groups = _countdown_priority_band_groups(long_countdown_group)
    positive_countdown_items = [*short_countdown_items, *long_countdown_items][:3]
    countdown_items = positive_countdown_items
    countdown_data = (positive_countdown_items or [None])[0]
    diagnostic_data = _build_diagnostic_data(interpretations, daily_vibe, countdown_data)
    is_noise_heavy = any(str(item.get("Safety_Level", "")).strip().upper() == "LOW" for item in daily_vibe.get("items", []))
    timeline = _build_timeline_from_interpretations(interpretations, final_score, birth_input=birth_input, current_dt=current_dt, daily_modifier=daily_modifier, is_noise_heavy=is_noise_heavy)
    timeline_days = _build_timeline_days(interpretations, final_score, birth_input=birth_input, current_dt=current_dt, daily_modifier=daily_modifier, is_noise_heavy=is_noise_heavy)
    topics = _build_topics_from_interpretations(interpretations, final_score)
    hero = {
        "rank": _score_to_rank(final_score),
        "score": final_score,
        "title": "Today Overview",
        "guidance": _safe_text(hero_row, "Advised_Task"),
        "summary": _safe_text(hero_row, "Text_Description"),
        "aspectHighlights": _top_hero_aspect_highlights(interpretations),
        "dailyStarVibe": daily_star_vibe,
    }
    hero = _apply_basic_to_hero(hero, basic_interpretations, hero_row, interpretations)
    return _to_json_compatible({
        "header": _dashboard_header(),
        "hero": hero,
        "countdown": countdown_data,
        "countdown_items": countdown_items,
        "countdown_groups": {
            "short": short_countdown_group,
            "long": long_countdown_group,
            "long_by_priority": long_countdown_priority_groups,
            "priority_bands": {
                key: {"label": value["label"]}
                for key, value in COUNTDOWN_PRIORITY_BANDS.items()
            },
            "legacy_short": short_countdown_items,
            "legacy_long": long_countdown_items,
        },
        "diagnostic": diagnostic_data,
        "timeline": timeline,
        "timelineDate": _dashboard_date(current_dt),
        "timelineDays": timeline_days,
        "planetMotion": _dashboard_planet_motion(birth_input, current_dt),
        "retrogradeCalendar": _dashboard_retrograde_calendar(current_dt),
        "topics": topics,
        "premium": {
            "title": "Premium AI Preview",
            "description": "複数のトランジット条件と日運補正を組み合わせた追加解釈を提供します。",
            "placeholder": "将来的には、恋愛や仕事などテーマ別の深掘りリソースをここへ表示します。",
            "preview": _safe_text(hero_row, "Text_Description"),
        },
        "aspect_interpretations": interpretations,
        "basic_interpretations": basic_interpretations or [],
        "daily_vibe": daily_vibe,
        "developerMeta": _build_developer_meta(hero_row, interpretations, basic_interpretations or [], daily_vibe, countdown_data, timeline, topics, final_score, average_score),
    })


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
            })
    return inputs


def _to_json_compatible(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _to_json_compatible(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_to_json_compatible(item) for item in value]
    if isinstance(value, tuple):
        return [_to_json_compatible(item) for item in value]
    if hasattr(value, "item") and callable(value.item):
        try:
            return value.item()
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
    current_dt = _app_now()
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
