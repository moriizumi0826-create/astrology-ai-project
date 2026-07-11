"""Rule loading and daily matching for monthly peak calculations.

This module deliberately keeps activation and caution separate.  Conversion to
the existing graph score range and period extraction are handled by later
stages of the monthly-peak implementation.
"""

from __future__ import annotations

import csv
from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterable


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DATABASE_DIR = PROJECT_ROOT / "database"

CATEGORY_KEYS = ("general_health", "work", "love", "money")
OUTER_PLANETS = {"URANUS", "NEPTUNE", "PLUTO"}
RULES_FILENAME = "M_Monthly_Peak_Rules.csv"
SCORING_FILENAME = "monthly_peak_scoring_rules.csv"
PERIOD_FILENAME = "monthly_peak_period_rules.csv"

RULE_REQUIRED_COLUMNS = {
    "Rule_ID", "Category", "Factor_Type", "Peak_Type", "Transit_Planet",
    "Natal_Target", "Target_Role", "House_System", "Target_House",
    "Aspect_Angle", "Aspect_Class", "Transit_State", "Orb_Max",
    "Activation_Weight", "Caution_Weight", "Intensity_Hint", "Tone",
    "Monthly_Title", "Monthly_Summary", "Monthly_Description",
    "Monthly_Caution", "Yearly_Summary", "Priority", "Tags", "Active_Flag",
}
SCORING_REQUIRED_COLUMNS = {
    "Rule_ID", "Category", "Factor_Type", "Tone", "Intensity_Hint",
    "Activation_Multiplier", "Caution_Multiplier", "Graph_Bias", "Daily_Cap",
    "Priority", "Active_Flag",
}
PERIOD_REQUIRED_COLUMNS = {
    "Rule_ID", "Category", "Activation_Threshold", "Strong_Activation_Threshold",
    "Max_Period_Days", "Moon_Only_Allowed", "Outer_Only_Allowed",
    "Background_Only_Allowed", "Max_Display_Count", "Priority", "Active_Flag",
}


def _file_signature(path: Path) -> tuple[int, int]:
    stat = path.stat()
    return stat.st_mtime_ns, stat.st_size


@lru_cache(maxsize=32)
def _read_csv_rows(path_text: str, _signature: tuple[int, int]) -> tuple[dict[str, str], ...]:
    path = Path(path_text)
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = tuple(dict(row) for row in csv.DictReader(handle))
    return rows


def _load_rows(filename: str, required_columns: set[str], database_dir: Path | None = None) -> tuple[dict[str, str], ...]:
    path = (database_dir or DATABASE_DIR) / filename
    if not path.exists():
        raise FileNotFoundError(f"Monthly peak CSV is missing: {path}")
    rows = _read_csv_rows(str(path), _file_signature(path))
    if not rows:
        raise ValueError(f"Monthly peak CSV has no rows: {path}")
    missing = required_columns.difference(rows[0])
    if missing:
        raise ValueError(f"Monthly peak CSV is missing columns {sorted(missing)}: {path}")
    return rows


def load_monthly_peak_rules(database_dir: Path | None = None) -> tuple[dict[str, str], ...]:
    return _load_rows(RULES_FILENAME, RULE_REQUIRED_COLUMNS, database_dir)


def load_monthly_peak_scoring_rules(database_dir: Path | None = None) -> tuple[dict[str, str], ...]:
    return _load_rows(SCORING_FILENAME, SCORING_REQUIRED_COLUMNS, database_dir)


def load_monthly_peak_period_rules(database_dir: Path | None = None) -> tuple[dict[str, str], ...]:
    return _load_rows(PERIOD_FILENAME, PERIOD_REQUIRED_COLUMNS, database_dir)


def clear_monthly_peak_caches() -> None:
    _read_csv_rows.cache_clear()


def _normalise(value: Any) -> str:
    return str(value or "").strip().upper()


def _is_active(row: dict[str, Any]) -> bool:
    return _normalise(row.get("Active_Flag")) not in {"", "0", "FALSE", "NO"}


def _matches(rule_value: Any, event_value: Any) -> bool:
    expected = _normalise(rule_value)
    if expected in {"", "ANY", "ALL"}:
        return True
    if isinstance(event_value, (list, tuple, set, frozenset)):
        return any(_matches(rule_value, value) for value in event_value)
    return expected == _normalise(event_value)


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _as_int(value: Any, default: int = 0) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def monthly_peak_rule_matches(rule: dict[str, Any], event: dict[str, Any]) -> bool:
    """Return whether one normalized day event satisfies one peak rule."""
    if not _is_active(rule):
        return False
    for column, event_key in (
        ("Factor_Type", "factor_type"),
        ("Transit_Planet", "transit_planet"),
        ("Natal_Target", "natal_target"),
        ("Target_Role", "target_role"),
        ("House_System", "house_system"),
        ("Target_House", "target_house"),
        ("Aspect_Angle", "aspect_angle"),
        ("Aspect_Class", "aspect_class"),
        ("Transit_State", "transit_state"),
    ):
        if not _matches(rule.get(column), event.get(event_key)):
            return False

    orb_max = _as_float(rule.get("Orb_Max"), -1)
    event_orb = event.get("orb")
    if orb_max >= 0 and event_orb not in (None, "") and _as_float(event_orb) > orb_max:
        return False
    return True


def _find_scoring_rule(
    peak_rule: dict[str, Any],
    scoring_rules: Iterable[dict[str, Any]],
) -> dict[str, Any] | None:
    candidates = [
        row for row in scoring_rules
        if _is_active(row)
        and _matches(row.get("Category"), peak_rule.get("Category"))
        and _matches(row.get("Factor_Type"), peak_rule.get("Factor_Type"))
        and _matches(row.get("Tone"), peak_rule.get("Tone"))
        and _matches(row.get("Intensity_Hint"), peak_rule.get("Intensity_Hint"))
    ]
    if not candidates:
        return None
    return min(candidates, key=lambda row: _as_int(row.get("Priority"), 999999))


def aggregate_daily_peak_categories(
    events: Iterable[dict[str, Any]],
    *,
    rules: Iterable[dict[str, Any]] | None = None,
    scoring_rules: Iterable[dict[str, Any]] | None = None,
) -> dict[str, dict[str, Any]]:
    """Match normalized events and independently sum activation and caution."""
    peak_rules = tuple(rules) if rules is not None else load_monthly_peak_rules()
    score_rules = tuple(scoring_rules) if scoring_rules is not None else load_monthly_peak_scoring_rules()
    result = {
        category: {
            "activation": 0.0,
            "caution": 0.0,
            "graph_bias": 0.0,
            "daily_cap": None,
            "matched_rules": [],
        }
        for category in CATEGORY_KEYS
    }
    matched_keys: set[tuple[str, str]] = set()

    for index, event in enumerate(events):
        event_id = str(event.get("id") or index)
        for rule in peak_rules:
            category = _normalise(rule.get("Category")).lower()
            if category not in result or not monthly_peak_rule_matches(rule, event):
                continue
            match_key = (str(rule.get("Rule_ID") or ""), event_id)
            if match_key in matched_keys:
                continue
            matched_keys.add(match_key)

            scoring_rule = _find_scoring_rule(rule, score_rules)
            activation = _as_float(rule.get("Activation_Weight")) * _as_float(
                scoring_rule.get("Activation_Multiplier") if scoring_rule else 1,
                1,
            )
            caution = _as_float(rule.get("Caution_Weight")) * _as_float(
                scoring_rule.get("Caution_Multiplier") if scoring_rule else 1,
                1,
            )
            graph_bias = _as_float(scoring_rule.get("Graph_Bias") if scoring_rule else 0)
            daily_cap = _as_float(scoring_rule.get("Daily_Cap") if scoring_rule else 100, 100)
            match = {
                "rule_id": rule.get("Rule_ID"),
                "peak_type": rule.get("Peak_Type"),
                "factor_type": rule.get("Factor_Type"),
                "transit_planet": rule.get("Transit_Planet"),
                "natal_target": rule.get("Natal_Target"),
                "target_house": rule.get("Target_House"),
                "aspect_angle": rule.get("Aspect_Angle"),
                "orb": event.get("orb"),
                "tone": rule.get("Tone"),
                "intensity_hint": rule.get("Intensity_Hint"),
                "priority": _as_int(rule.get("Priority"), 999999),
                "activation": round(activation, 2),
                "caution": round(caution, 2),
                "graph_bias": round(graph_bias, 2),
                "daily_cap": daily_cap,
                "title": rule.get("Monthly_Title"),
                "summary": rule.get("Monthly_Summary"),
                "description": rule.get("Monthly_Description"),
                "caution_text": rule.get("Monthly_Caution"),
                "tags": [tag for tag in str(rule.get("Tags") or "").split(";") if tag],
                "event_id": event_id,
            }
            result[category]["activation"] += activation
            result[category]["caution"] += caution
            result[category]["graph_bias"] += graph_bias
            if daily_cap > 0:
                previous_cap = result[category]["daily_cap"]
                result[category]["daily_cap"] = daily_cap if previous_cap is None else min(previous_cap, daily_cap)
            result[category]["matched_rules"].append(match)

    for category in CATEGORY_KEYS:
        data = result[category]
        data["activation"] = round(data["activation"], 2)
        data["caution"] = round(data["caution"], 2)
        data["graph_bias"] = round(data["graph_bias"], 2)
        data["daily_cap"] = data["daily_cap"] or 100.0
        data["matched_rules"].sort(
            key=lambda item: (item["activation"] + item["caution"], item["rule_id"] or ""),
            reverse=True,
        )
    return result


def _clamp_graph_score(value: float) -> int:
    return int(max(-100, min(100, round(value))))


def calculate_daily_graph_scores(categories: dict[str, dict[str, Any]]) -> dict[str, int]:
    """Convert new category totals to the legacy graph response shape.

    Period extraction continues to use the untouched activation and caution
    totals.  Only the legacy single-value graph series represents caution as a
    negative load.
    """
    category_scores: dict[str, int] = {}
    for category in CATEGORY_KEYS:
        data = categories.get(category, {})
        daily_cap = _as_float(data.get("daily_cap"), 100)
        daily_cap = daily_cap if daily_cap > 0 else 100.0
        raw = (
            _as_float(data.get("activation"))
            - _as_float(data.get("caution"))
            + _as_float(data.get("graph_bias"))
        )
        normalized = max(-daily_cap, min(daily_cap, raw)) / daily_cap * 100
        category_scores[category] = _clamp_graph_score(normalized)

    public_scores = {
        "general": category_scores["general_health"],
        "work": category_scores["work"],
        "love": category_scores["love"],
        "money": category_scores["money"],
    }
    public_scores["total"] = _clamp_graph_score(sum(public_scores.values()) / len(public_scores))
    return public_scores


def _period_rule_for_category(
    category: str,
    period_rules: Iterable[dict[str, Any]],
) -> dict[str, Any] | None:
    candidates = [
        row for row in period_rules
        if _is_active(row) and _matches(row.get("Category"), category)
    ]
    return min(candidates, key=lambda row: _as_int(row.get("Priority"), 999999)) if candidates else None


def _factor_label(factor: dict[str, Any]) -> str:
    planet = str(factor.get("transit_planet") or "")
    target = str(factor.get("natal_target") or "")
    factor_type = str(factor.get("factor_type") or "")
    angle = str(factor.get("aspect_angle") or "")
    house = str(factor.get("target_house") or "")
    if factor_type == "transit_to_natal":
        return f"{planet} {target} {angle}°"
    if factor_type == "transit_to_transit":
        return f"{planet}-{target} {angle}°"
    if factor_type == "natal_house":
        return f"{planet} ネイタル{house}H入座"
    if factor_type == "solar_house":
        return f"{planet} ソーラー{house}H入座"
    if factor_type == "retrograde":
        return f"{planet}逆行"
    if factor_type == "station":
        return f"{planet}留"
    if factor_type == "direct":
        return f"{planet}順行化"
    return f"{planet} {factor_type}".strip()


def _period_eligible_factors(day_category: dict[str, Any], period_rule: dict[str, Any]) -> list[dict[str, Any]]:
    factors = [
        factor for factor in day_category.get("matched_rules", [])
        if _normalise(factor.get("intensity_hint")).lower() != "background_only"
    ]
    # The graph keeps the wider matching orb as context.  Periods should only
    # use the close approach of an aspect, otherwise one slow aspect turns an
    # entire month into consecutive seven-day "peaks".
    factors = [
        factor for factor in factors
        if factor.get("factor_type") not in {"transit_to_natal", "transit_to_transit"}
        or _as_float(factor.get("orb"), 999) <= 1.0
    ]
    # A retrograde condition is background for the whole phase; its station
    # and direct events are the displayable short-term triggers.
    factors = [factor for factor in factors if factor.get("factor_type") != "retrograde"]
    if not factors:
        return []

    planets = {_normalise(factor.get("transit_planet")) for factor in factors if factor.get("transit_planet")}
    moon_only = planets == {"MOON"}
    outer_only = bool(planets) and planets.issubset(OUTER_PLANETS)
    if moon_only and not _as_int(period_rule.get("Moon_Only_Allowed")):
        return []
    if outer_only and not _as_int(period_rule.get("Outer_Only_Allowed")):
        return []

    activation = sum(_as_float(factor.get("activation")) for factor in factors)
    threshold = _as_float(period_rule.get("Activation_Threshold"))
    has_strong_factor = any(
        _normalise(factor.get("intensity_hint")).lower() in {"high", "very_high"}
        for factor in factors
    )
    return factors if activation >= threshold or has_strong_factor else []


def _select_period_factors(days: list[dict[str, Any]]) -> list[dict[str, Any]]:
    selected: dict[str, dict[str, Any]] = {}
    for day in days:
        for factor in day["factors"]:
            rule_id = str(factor.get("rule_id") or factor.get("event_id") or "")
            existing = selected.get(rule_id)
            factor_strength = _as_float(factor.get("activation")) + _as_float(factor.get("caution"))
            existing_strength = (
                _as_float(existing.get("activation")) + _as_float(existing.get("caution"))
                if existing else -1
            )
            if existing is None or factor_strength > existing_strength:
                selected[rule_id] = factor
    ranked = sorted(
        selected.values(),
        key=lambda factor: (
            -(_as_float(factor.get("activation")) + _as_float(factor.get("caution"))),
            _as_int(factor.get("priority"), 999999),
            str(factor.get("rule_id") or ""),
        ),
    )
    labels: set[str] = set()
    unique_factors: list[dict[str, Any]] = []
    for factor in ranked:
        label = _factor_label(factor)
        if label in labels:
            continue
        labels.add(label)
        unique_factors.append(factor)
        if len(unique_factors) == 4:
            break
    return unique_factors


def _build_period(
    category: str,
    days: list[dict[str, Any]],
    period_rule: dict[str, Any],
) -> dict[str, Any]:
    peak_day = max(
        days,
        key=lambda item: (
            _as_float(item["data"].get("activation")),
            _as_float(item["data"].get("caution")),
        ),
    )
    factors = _select_period_factors(days)
    primary = factors[0] if factors else {}
    peak_activation = round(_as_float(peak_day["data"].get("activation")), 2)
    peak_caution = round(_as_float(peak_day["data"].get("caution")), 2)
    strong_threshold = _as_float(period_rule.get("Strong_Activation_Threshold"))
    intensity = "very_high" if strong_threshold and peak_activation >= strong_threshold else primary.get("intensity_hint", "medium")
    return {
        "start_date": days[0]["date"].isoformat(),
        "end_date": days[-1]["date"].isoformat(),
        "peak_date": peak_day["date"].isoformat(),
        "activation": peak_activation,
        "caution": peak_caution,
        "intensity": intensity,
        "tone": primary.get("tone", "mixed"),
        "peak_type": primary.get("peak_type", ""),
        "title": primary.get("title", ""),
        "summary": primary.get("summary", ""),
        "description": primary.get("description", ""),
        "caution_text": primary.get("caution_text", ""),
        "factors": [
            {
                "label": _factor_label(factor),
                "tone": factor.get("tone", "mixed"),
                "intensity_hint": factor.get("intensity_hint", "medium"),
                "activation": factor.get("activation", 0),
                "caution": factor.get("caution", 0),
                "tags": factor.get("tags", []),
            }
            for factor in factors
        ],
    }


def build_monthly_peak_periods(
    yearly_data: Iterable[dict[str, Any]],
    *,
    period_rules: Iterable[dict[str, Any]] | None = None,
) -> dict[str, list[dict[str, Any]]]:
    """Group eligible daily peak data into displayable, category-specific periods."""
    rules = tuple(period_rules) if period_rules is not None else load_monthly_peak_period_rules()
    result = {category: [] for category in CATEGORY_KEYS}
    ordered_days = sorted(yearly_data, key=lambda item: str(item.get("date") or ""))

    for category in CATEGORY_KEYS:
        period_rule = _period_rule_for_category(category, rules)
        if period_rule is None:
            continue
        max_days = max(1, _as_int(period_rule.get("Max_Period_Days"), 7))
        max_display_count = max(1, _as_int(period_rule.get("Max_Display_Count"), 3))
        segments: list[list[dict[str, Any]]] = []
        active_segment: list[dict[str, Any]] = []

        for day in ordered_days:
            try:
                day_date = date.fromisoformat(str(day.get("date")))
            except (TypeError, ValueError):
                continue
            category_data = dict(day.get("monthly_peak", {}).get(category, {}))
            factors = _period_eligible_factors(category_data, period_rule)
            if not factors:
                if active_segment:
                    segments.append(active_segment)
                    active_segment = []
                continue

            candidate_data = {
                **category_data,
                "activation": round(sum(_as_float(factor.get("activation")) for factor in factors), 2),
                "caution": round(sum(_as_float(factor.get("caution")) for factor in factors), 2),
            }
            candidate = {"date": day_date, "data": candidate_data, "factors": factors}
            previous_date = active_segment[-1]["date"] if active_segment else None
            crosses_month = previous_date is not None and previous_date.month != day_date.month
            is_consecutive = previous_date is not None and (day_date - previous_date).days == 1
            if active_segment and (not is_consecutive or crosses_month or len(active_segment) >= max_days):
                segments.append(active_segment)
                active_segment = []
            active_segment.append(candidate)
        if active_segment:
            segments.append(active_segment)

        periods = [_build_period(category, segment, period_rule) for segment in segments]
        by_month: dict[str, list[dict[str, Any]]] = {}
        for period in periods:
            by_month.setdefault(period["start_date"][:7], []).append(period)
        for month_periods in by_month.values():
            month_periods.sort(
                key=lambda period: (period["activation"], period["caution"], period["peak_date"]),
                reverse=True,
            )
            result[category].extend(month_periods[:max_display_count])
        result[category].sort(key=lambda period: (period["start_date"], period["peak_date"]))
    return result
