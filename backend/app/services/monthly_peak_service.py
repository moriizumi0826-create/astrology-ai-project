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
CATEGORY_SCORE_KEYS = {
    "general_health": "general",
    "work": "work",
    "love": "love",
    "money": "money",
}
NARRATIVE_KEYS_BY_CATEGORY = {
    "general_health": {"self_pace", "recovery", "routine", "cognitive_load", "pressure", "transition"},
    "work": {"role", "evaluation", "workflow", "negotiation", "visibility", "network", "capacity"},
    "love": {"contact", "attraction", "conversation", "boundary", "intimacy", "relationship_review"},
    "money": {"income", "reward", "spending", "contract", "budget", "shared_money", "asset_review", "volatility"},
}
NARRATIVE_BANNED_PHRASES = ("大枠ルール", "どこかが動きやすい")
OUTER_PLANETS = {"URANUS", "NEPTUNE", "PLUTO"}
RULES_FILENAME = "M_Monthly_Peak_Rules.csv"
SCORING_FILENAME = "monthly_peak_scoring_rules.csv"
PERIOD_FILENAME = "monthly_peak_period_rules.csv"
NARRATIVE_TEMPLATES_FILENAME = "monthly_peak_narrative_templates.csv"

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
    "Activation_Multiplier", "Caution_Multiplier", "Daily_Cap",
    "Priority", "Active_Flag",
}
PERIOD_REQUIRED_COLUMNS = {
    "Rule_ID", "Category", "Activation_Threshold", "Strong_Activation_Threshold",
    "Max_Period_Days", "Moon_Only_Allowed", "Outer_Only_Allowed",
    "Background_Only_Allowed", "Max_Display_Count", "Priority", "Active_Flag",
}
NARRATIVE_TEMPLATE_REQUIRED_COLUMNS = {
    "Template_ID", "Category", "Narrative_Key", "Narrative_Label", "State", "Title", "Summary",
    "Description", "Caution", "Priority", "Active_Flag",
}
RULE_INDEX_WILDCARD = "*"
RULE_MATCH_COLUMNS = (
    ("Factor_Type", "factor_type"),
    ("Transit_Planet", "transit_planet"),
    ("Natal_Target", "natal_target"),
    ("Target_Role", "target_role"),
    ("House_System", "house_system"),
    ("Target_House", "target_house"),
    ("Aspect_Angle", "aspect_angle"),
    ("Aspect_Class", "aspect_class"),
    ("Transit_State", "transit_state"),
)


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


def load_monthly_peak_narrative_templates(database_dir: Path | None = None) -> tuple[dict[str, str], ...]:
    return _load_rows(NARRATIVE_TEMPLATES_FILENAME, NARRATIVE_TEMPLATE_REQUIRED_COLUMNS, database_dir)


def clear_monthly_peak_caches() -> None:
    _read_csv_rows.cache_clear()
    _default_monthly_peak_rule_index.cache_clear()
    _default_peak_aggregation_context.cache_clear()
    _default_narrative_template_index.cache_clear()


def _normalise(value: Any) -> str:
    return str(value or "").strip().upper()


def _rule_index_value(value: Any) -> str:
    normalized = _normalise(value)
    return RULE_INDEX_WILDCARD if normalized in {"", "ANY", "ALL"} else normalized


def _event_index_values(value: Any) -> tuple[str, ...]:
    values = value if isinstance(value, (list, tuple, set, frozenset)) else (value,)
    normalized = {_normalise(item) for item in values}
    normalized.discard("")
    return tuple(normalized) or ("",)


def _build_monthly_peak_rule_index(
    rules: Iterable[dict[str, Any]],
) -> dict[str, Any]:
    active_rules = tuple(rule for rule in rules if _is_active(rule))
    masks: dict[str, dict[str, int]] = {
        rule_column: {} for rule_column, _event_column in RULE_MATCH_COLUMNS
    }
    for rule_index, rule in enumerate(active_rules):
        bit = 1 << rule_index
        for rule_column, _event_column in RULE_MATCH_COLUMNS:
            value = _rule_index_value(rule.get(rule_column))
            masks[rule_column][value] = masks[rule_column].get(value, 0) | bit
    return {"rules": active_rules, "masks": masks}


@lru_cache(maxsize=1)
def _default_monthly_peak_rule_index(_signature: tuple[int, int]) -> dict[str, Any]:
    return _build_monthly_peak_rule_index(load_monthly_peak_rules())


def _candidate_monthly_peak_rules(
    event: dict[str, Any],
    rule_index: dict[str, Any],
) -> tuple[dict[str, Any], ...]:
    rules = rule_index["rules"]
    if not rules:
        return ()
    candidate_mask = (1 << len(rules)) - 1
    masks = rule_index["masks"]
    for rule_column, event_column in RULE_MATCH_COLUMNS:
        column_masks = masks[rule_column]
        allowed_mask = column_masks.get(RULE_INDEX_WILDCARD, 0)
        for event_value in _event_index_values(event.get(event_column)):
            allowed_mask |= column_masks.get(event_value, 0)
        candidate_mask &= allowed_mask
        if not candidate_mask:
            return ()

    candidates: list[dict[str, Any]] = []
    while candidate_mask:
        lowest_bit = candidate_mask & -candidate_mask
        candidates.append(rules[lowest_bit.bit_length() - 1])
        candidate_mask ^= lowest_bit
    return tuple(candidates)


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


def _monthly_peak_rule_orb_matches(rule: dict[str, Any], event: dict[str, Any]) -> bool:
    orb_max = _as_float(rule.get("Orb_Max"), -1)
    event_orb = event.get("orb")
    return not (
        orb_max >= 0
        and event_orb not in (None, "")
        and _as_float(event_orb) > orb_max
    )


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


def _category_scoring_rule(
    category: str,
    scoring_rules: Iterable[dict[str, Any]],
) -> dict[str, Any] | None:
    candidates = [
        row for row in scoring_rules
        if _is_active(row) and _matches(row.get("Category"), category)
    ]
    if not candidates:
        return None
    return min(candidates, key=lambda row: _as_int(row.get("Priority"), 999999))


def _scoring_match_key(rule: dict[str, Any]) -> tuple[str, str, str, str]:
    return tuple(
        _normalise(rule.get(column))
        for column in ("Category", "Factor_Type", "Tone", "Intensity_Hint")
    )


def _build_peak_aggregation_context(
    peak_rules: Iterable[dict[str, Any]],
    scoring_rules: Iterable[dict[str, Any]],
) -> dict[str, Any]:
    peak_rule_index = _build_monthly_peak_rule_index(tuple(peak_rules))
    score_rules = tuple(scoring_rules)
    scoring_rule_by_key = {
        _scoring_match_key(rule): _find_scoring_rule(rule, score_rules)
        for rule in peak_rule_index["rules"]
    }
    return {
        "peak_rule_index": peak_rule_index,
        "rule_runtime_by_id": {
            id(rule): (
                _normalise(rule.get("Category")).lower(),
                scoring_rule_by_key.get(_scoring_match_key(rule)),
            )
            for rule in peak_rule_index["rules"]
        },
        "calibrations": {
            category: _category_scoring_rule(category, score_rules)
            for category in CATEGORY_KEYS
        },
    }


@lru_cache(maxsize=1)
def _default_peak_aggregation_context(
    _rule_signature: tuple[int, int],
    _scoring_signature: tuple[int, int],
) -> dict[str, Any]:
    return _build_peak_aggregation_context(
        load_monthly_peak_rules(),
        load_monthly_peak_scoring_rules(),
    )


def _orb_exactness_multiplier(rule: dict[str, Any], event: dict[str, Any]) -> float:
    """Scale aspect effects from 0 at the configured orb edge to 1 when exact."""
    if _normalise(rule.get("Factor_Type")) not in {"TRANSIT_TO_NATAL", "TRANSIT_TO_TRANSIT"}:
        return 1.0
    orb_max = _as_float(rule.get("Orb_Max"))
    event_orb = event.get("orb")
    if orb_max <= 0 or event_orb in (None, ""):
        return 1.0
    return max(0.0, min(1.0, 1.0 - abs(_as_float(event_orb)) / orb_max))


def aggregate_daily_peak_categories(
    events: Iterable[dict[str, Any]],
    *,
    rules: Iterable[dict[str, Any]] | None = None,
    scoring_rules: Iterable[dict[str, Any]] | None = None,
) -> dict[str, dict[str, Any]]:
    """Match normalized events and independently sum activation and caution."""
    if rules is None and scoring_rules is None:
        context = _default_peak_aggregation_context(
            _file_signature(DATABASE_DIR / RULES_FILENAME),
            _file_signature(DATABASE_DIR / SCORING_FILENAME),
        )
    else:
        context = _build_peak_aggregation_context(
            tuple(rules) if rules is not None else load_monthly_peak_rules(),
            tuple(scoring_rules) if scoring_rules is not None else load_monthly_peak_scoring_rules(),
        )
    peak_rule_index = context["peak_rule_index"]
    rule_runtime_by_id = context["rule_runtime_by_id"]
    calibrations = context["calibrations"]
    result = {
        category: {
            "activation": 0.0,
            "caution": 0.0,
            "daily_cap": _as_float(calibrations[category].get("Daily_Cap") if calibrations[category] else 100, 100),
            "matched_rules": [],
        }
        for category in CATEGORY_KEYS
    }
    matched_keys: set[tuple[str, str]] = set()

    for index, event in enumerate(events):
        event_id = str(event.get("id") or index)
        for rule in _candidate_monthly_peak_rules(event, peak_rule_index):
            category, scoring_rule = rule_runtime_by_id[id(rule)]
            # The candidate index has already checked every non-orb match column.
            if category not in result or not _monthly_peak_rule_orb_matches(rule, event):
                continue
            match_key = (str(rule.get("Rule_ID") or ""), event_id)
            if match_key in matched_keys:
                continue
            matched_keys.add(match_key)

            exactness = _orb_exactness_multiplier(rule, event)
            activation_weight = _as_float(rule.get("Activation_Weight"))
            caution_weight = _as_float(rule.get("Caution_Weight"))
            activation_multiplier = _as_float(
                scoring_rule.get("Activation_Multiplier") if scoring_rule else 1,
                1,
            )
            caution_multiplier = _as_float(
                scoring_rule.get("Caution_Multiplier") if scoring_rule else 1,
                1,
            )
            has_score_impact = event.get("score_impact") not in (None, "")
            if _normalise(event.get("factor_type")) == "TRANSIT_TO_NATAL" and has_score_impact:
                score_impact = max(-100.0, min(100.0, _as_float(event.get("score_impact"))))
                yearly_weight = max(0.0, _as_float(event.get("yearly_weight"), 1.0))
                category_weight = max(abs(activation_weight), abs(caution_weight))
                signed_contribution = (
                    exactness
                    * (score_impact / 100.0)
                    * yearly_weight
                    * category_weight
                )
                activation = max(0.0, signed_contribution) * activation_multiplier
                caution = max(0.0, -signed_contribution) * caution_multiplier
            else:
                activation = exactness * activation_weight * activation_multiplier
                caution = exactness * caution_weight * caution_multiplier
            match = {
                "rule_id": rule.get("Rule_ID"),
                "peak_type": rule.get("Peak_Type"),
                "factor_type": rule.get("Factor_Type"),
                "transit_planet": rule.get("Transit_Planet"),
                "natal_target": rule.get("Natal_Target"),
                "target_role": rule.get("Target_Role"),
                "target_house": rule.get("Target_House"),
                "aspect_angle": rule.get("Aspect_Angle"),
                "orb": event.get("orb"),
                "exactness": round(exactness, 4),
                "tone": rule.get("Tone"),
                "intensity_hint": rule.get("Intensity_Hint"),
                "priority": _as_int(rule.get("Priority"), 999999),
                "narrative_key": rule.get("Narrative_Key", ""),
                "narrative_priority": _as_int(rule.get("Narrative_Priority"), 1),
                "activation": round(activation, 2),
                "caution": round(caution, 2),
                "title": rule.get("Monthly_Title"),
                "summary": rule.get("Monthly_Summary"),
                "description": rule.get("Monthly_Description"),
                "caution_text": rule.get("Monthly_Caution"),
                "tags": [tag for tag in str(rule.get("Tags") or "").split(";") if tag],
                "event_id": event_id,
            }
            result[category]["activation"] += activation
            result[category]["caution"] += caution
            result[category]["matched_rules"].append(match)

    for category in CATEGORY_KEYS:
        data = result[category]
        data["activation"] = round(data["activation"], 2)
        data["caution"] = round(data["caution"], 2)
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

    Activation and caution are both derived from matched configurations, with
    aspect effects scaled by their configured orb. The graph only expresses
    their signed difference; it has no category-level fixed offset.
    """
    category_scores: dict[str, int] = {}
    for category in CATEGORY_KEYS:
        data = categories.get(category, {})
        daily_cap = _as_float(data.get("daily_cap"), 100)
        daily_cap = daily_cap if daily_cap > 0 else 100.0
        raw = (
            _as_float(data.get("activation"))
            - _as_float(data.get("caution"))
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


def _factor_category_relevance(factor: dict[str, Any]) -> int:
    relevance = 0
    if _normalise(factor.get("target_role")).lower() not in {"", "core_theme"}:
        relevance += 2
    if _normalise(factor.get("target_house")).lower() not in {"", "any"}:
        relevance += 1
    if _normalise(factor.get("natal_target")).lower() in {"asc", "mc", "desc"}:
        relevance += 1
    if _normalise(factor.get("factor_type")).lower() == "transit_to_transit":
        relevance -= 1
    return relevance


def _select_period_factors(
    days: list[dict[str, Any]],
    peak_date: date,
) -> list[dict[str, Any]]:
    selected: dict[str, dict[str, Any]] = {}
    for day in days:
        for factor in day["factors"]:
            rule_id = str(factor.get("rule_id") or factor.get("event_id") or "")
            candidate = {**factor, "period_date": day["date"].isoformat()}
            existing = selected.get(rule_id)
            factor_strength = _as_float(candidate.get("activation")) + _as_float(candidate.get("caution"))
            existing_strength = (
                _as_float(existing.get("activation")) + _as_float(existing.get("caution"))
                if existing else -1
            )
            if existing is None or factor_strength > existing_strength:
                selected[rule_id] = candidate
    ranked = sorted(
        selected.values(),
        key=lambda factor: (
            -_as_int(factor.get("narrative_priority"), 1),
            -_factor_category_relevance(factor),
            -(_as_float(factor.get("activation")) + _as_float(factor.get("caution"))),
            abs((date.fromisoformat(str(factor["period_date"])) - peak_date).days),
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


def _period_factor_payload(factor: dict[str, Any]) -> dict[str, Any] | None:
    if not factor:
        return None
    return {
        "label": _factor_label(factor),
        "narrative_key": factor.get("narrative_key", ""),
        "narrative_priority": _as_int(factor.get("narrative_priority"), 1),
        "activation": factor.get("activation", 0),
        "caution": factor.get("caution", 0),
    }


def _build_narrative_template_index(
    templates: Iterable[dict[str, Any]],
) -> dict[tuple[str, str, str], dict[str, Any]]:
    index: dict[tuple[str, str, str], dict[str, Any]] = {}
    for template in templates:
        if not _is_active(template):
            continue
        key = (
            _normalise(template.get("Category")).lower(),
            _normalise(template.get("Narrative_Key")).lower(),
            _normalise(template.get("State")).lower(),
        )
        if key in index:
            raise ValueError(f"Duplicate monthly narrative template: {key}")
        index[key] = template
    return index


@lru_cache(maxsize=1)
def _default_narrative_template_index(
    _signature: tuple[int, int],
) -> dict[tuple[str, str, str], dict[str, Any]]:
    return _build_narrative_template_index(load_monthly_peak_narrative_templates())


def _narrative_template(
    category: str,
    narrative_key: str,
    state: str,
    template_index: dict[tuple[str, str, str], dict[str, Any]],
) -> dict[str, Any]:
    key = (category, _normalise(narrative_key).lower(), _normalise(state).lower())
    template = template_index.get(key)
    if not template:
        raise ValueError(f"Monthly narrative template is missing: {key}")
    return template


def _compose_period_narrative(
    category: str,
    primary: dict[str, Any],
    secondary: dict[str, Any],
    state: str,
    caution: float,
    template_index: dict[tuple[str, str, str], dict[str, Any]],
) -> dict[str, str]:
    primary_template = _narrative_template(category, str(primary.get("narrative_key") or ""), state, template_index)
    description = str(primary_template["Description"])
    secondary_key = str(secondary.get("narrative_key") or "")
    if secondary_key and secondary_key != primary.get("narrative_key"):
        secondary_template = _narrative_template(category, secondary_key, state, template_index)
        description = f"{description} 補助的には、{secondary_template['Narrative_Label']}も重なるため、主題だけに偏らず全体の流れを見ながら進めてください。"
    return {
        "title": str(primary_template["Title"]),
        "summary": str(primary_template["Summary"]),
        "description": description,
        "caution_text": str(primary_template["Caution"]) if caution > 0 else "",
    }


def validate_monthly_peak_narrative_quality(
    periods_by_category: dict[str, Iterable[dict[str, Any]]],
) -> list[str]:
    """Return user-visible prose and state violations for monthly peak periods."""
    violations: list[str] = []
    duplicate_texts: dict[tuple[str, str, str, str, str, str], tuple[str, str]] = {}
    for category, periods in periods_by_category.items():
        allowed_keys = NARRATIVE_KEYS_BY_CATEGORY.get(category, set())
        for period in periods:
            start_date = str(period.get("start_date") or "")
            end_date = str(period.get("end_date") or "")
            key = str(period.get("narrative_key") or "")
            state = str(period.get("narrative_state") or "")
            tone = str(period.get("tone") or "")
            caution = _as_float(period.get("caution"))
            text_parts = tuple(str(period.get(field) or "") for field in (
                "title", "summary", "description", "caution_text",
            ))
            text = " ".join(text_parts)
            label = f"{category}:{start_date}"

            if key not in allowed_keys:
                violations.append(f"{label}: invalid narrative key {key}")
            if state not in {"active", "caution", "mixed", "review"} or tone != state:
                violations.append(f"{label}: inconsistent narrative state/tone")
            if caution <= 0 and state != "active":
                violations.append(f"{label}: zero caution must be active")
            if caution <= 0 and text_parts[3]:
                violations.append(f"{label}: zero caution must not display caution text")
            for phrase in NARRATIVE_BANNED_PHRASES:
                if phrase in text:
                    violations.append(f"{label}: banned phrase {phrase}")
            try:
                duration = (date.fromisoformat(end_date) - date.fromisoformat(start_date)).days + 1
            except ValueError:
                violations.append(f"{label}: invalid period date")
                duration = 0
            if duration and duration < 20 and "月" in text:
                violations.append(f"{label}: short period contains month wording")

            duplicate_key = (category, start_date[:7], *text_parts)
            existing = duplicate_texts.get(duplicate_key)
            semantic_key = (key, state)
            if existing is not None and existing != semantic_key:
                violations.append(f"{label}: duplicate prose has different narrative meaning")
            duplicate_texts[duplicate_key] = semantic_key
    return violations


def _period_narrative_state(
    activation: float,
    caution: float,
    factors: Iterable[dict[str, Any]],
    period_rule: dict[str, Any],
) -> str:
    """Classify a period from its totals, rather than a single factor's tone."""
    activation_threshold = _as_float(period_rule.get("Activation_Threshold"), 6)
    mixed_caution_threshold = max(2.0, activation_threshold * 0.5)
    factor_list = tuple(factors)
    has_review_factor = any(
        _normalise(factor.get("tone")).lower() == "review"
        or _normalise(factor.get("factor_type")).lower() in {"station", "retrograde", "direct"}
        for factor in factor_list
    )

    if caution <= 0:
        return "active"
    if activation >= activation_threshold and caution >= mixed_caution_threshold:
        return "mixed"
    if caution >= activation:
        return "caution"
    if has_review_factor:
        return "review"
    return "active"


def _build_period(
    category: str,
    days: list[dict[str, Any]],
    period_rule: dict[str, Any],
    template_index: dict[tuple[str, str, str], dict[str, Any]],
) -> dict[str, Any]:
    peak_day = max(
        days,
        key=lambda item: (
            _as_float(item.get("graph_score")),
            _as_float(item["data"].get("activation")),
            -_as_float(item["data"].get("caution")),
        ),
    )
    factors = _select_period_factors(days, peak_day["date"])
    primary = factors[0] if factors else {}
    secondary = factors[1] if len(factors) > 1 else {}
    peak_activation = round(_as_float(peak_day["data"].get("activation")), 2)
    peak_caution = round(_as_float(peak_day["data"].get("caution")), 2)
    strong_threshold = _as_float(period_rule.get("Strong_Activation_Threshold"))
    intensity = "very_high" if strong_threshold and peak_activation >= strong_threshold else primary.get("intensity_hint", "medium")
    narrative_state = _period_narrative_state(peak_activation, peak_caution, factors, period_rule)
    narrative = _compose_period_narrative(
        category,
        primary,
        secondary,
        narrative_state,
        peak_caution,
        template_index,
    )
    return {
        "start_date": days[0]["date"].isoformat(),
        "end_date": days[-1]["date"].isoformat(),
        "peak_date": peak_day["date"].isoformat(),
        "graph_score": round(_as_float(peak_day.get("graph_score"))),
        "activation": peak_activation,
        "caution": peak_caution,
        "intensity": intensity,
        "tone": narrative_state,
        "narrative_state": narrative_state,
        "narrative_key": primary.get("narrative_key", ""),
        "secondary_narrative_key": secondary.get("narrative_key", ""),
        "primary_factor": _period_factor_payload(primary),
        "secondary_factor": _period_factor_payload(secondary),
        "peak_type": primary.get("peak_type", ""),
        **narrative,
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
    narrative_templates: Iterable[dict[str, Any]] | None = None,
) -> dict[str, list[dict[str, Any]]]:
    """Group eligible daily peak data into displayable, category-specific periods."""
    rules = tuple(period_rules) if period_rules is not None else load_monthly_peak_period_rules()
    template_index = (
        _build_narrative_template_index(tuple(narrative_templates))
        if narrative_templates is not None
        else _default_narrative_template_index(
            _file_signature(DATABASE_DIR / NARRATIVE_TEMPLATES_FILENAME)
        )
    )
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
            score_key = CATEGORY_SCORE_KEYS[category]
            graph_score = _as_float(
                day.get("scores", {}).get(score_key),
                candidate_data["activation"] - candidate_data["caution"],
            )
            candidate = {
                "date": day_date,
                "data": candidate_data,
                "factors": factors,
                "graph_score": graph_score,
            }
            previous_date = active_segment[-1]["date"] if active_segment else None
            crosses_month = previous_date is not None and previous_date.month != day_date.month
            is_consecutive = previous_date is not None and (day_date - previous_date).days == 1
            if active_segment and (not is_consecutive or crosses_month or len(active_segment) >= max_days):
                segments.append(active_segment)
                active_segment = []
            active_segment.append(candidate)
        if active_segment:
            segments.append(active_segment)

        periods = [_build_period(category, segment, period_rule, template_index) for segment in segments]
        by_month: dict[str, list[dict[str, Any]]] = {}
        for period in periods:
            by_month.setdefault(period["start_date"][:7], []).append(period)
        for month_periods in by_month.values():
            month_periods.sort(
                key=lambda period: (period["graph_score"], period["activation"], period["peak_date"]),
                reverse=True,
            )
            result[category].extend(month_periods[:max_display_count])
        result[category].sort(key=lambda period: (period["start_date"], period["peak_date"]))
    return result
