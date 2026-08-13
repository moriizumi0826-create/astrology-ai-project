"""CSV loading primitives for the personalized monthly overview."""

from __future__ import annotations

import csv
import re
from collections.abc import Iterable, Mapping
from datetime import date, datetime
from functools import lru_cache
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DATABASE_DIR = PROJECT_ROOT / "database"

EDITORIAL_FILENAME = "M_Monthly_Overview_Editorial.csv"
EVENT_PARAGRAPHS_FILENAME = "M_Monthly_Overview_Event_Paragraphs_{month_id}.csv"
ASPECT_CLUSTERS_FILENAME = "M_Monthly_Overview_Aspect_Clusters_{month_id}.csv"
LONG_TERM_BACKGROUND_FILENAME = "M_Personal_Long_Term_Background_{month_id}.csv"
TRANSIT_CALENDAR_FILENAME = "M_Transit_Calendar_{year}.csv"

EDITORIAL_REQUIRED_COLUMNS = {
    "Edition_ID",
    "Solar_House",
    "Natal_House",
    "Title",
    "Summary",
    "Interpretation",
    "Action",
}
EVENT_PARAGRAPH_REQUIRED_COLUMNS = {
    "Template_ID",
    "Month_ID",
    "Section_Order",
    "Planet",
    "Event_Type",
    "Transit_Sign_From",
    "Transit_Sign_To",
    "Solar_House_From",
    "Solar_House_To",
    "Natal_House_From",
    "Natal_House_To",
    "Natal_House_At_Event",
    "Date_Source",
    "Date_Key",
    "Date_Precision",
    "Paragraph_Template",
    "Priority",
    "Active_Flag",
}
ASPECT_CLUSTER_REQUIRED_COLUMNS = {
    "Template_ID",
    "Cluster_ID",
    "Month_ID",
    "Event_Type",
    "Valid_From",
    "Peak_At",
    "Valid_To",
    "Carryover_Flag",
    "Participating_Planets",
    "Sign_Signature",
    "Aspect_Signature",
    "Max_Orb",
    "Min_Planet_Count",
    "Moon_Eligibility",
    "Anchor_Planet",
    "Anchor_Solar_House",
    "Anchor_Natal_House",
    "Personalization_Mode",
    "House_Token_Planets",
    "Date_Source",
    "Date_Key",
    "Date_Precision",
    "Selection_Group",
    "Supersedes_Cluster_IDs",
    "Section_Order",
    "Priority",
    "Title",
    "Paragraph_Template",
    "Tags",
    "Active_Flag",
}
LONG_TERM_BACKGROUND_REQUIRED_COLUMNS = {
    "Record_ID",
    "Month_ID",
    "Record_Type",
    "Primary_Planet",
    "Secondary_Planet",
    "Primary_Sign",
    "Secondary_Sign",
    "Match_Type",
    "Target_Natal_House",
    "Valid_From",
    "Valid_To",
    "State_Changes",
    "Tone",
    "Title",
    "Interpretation",
    "Priority",
    "Active_Flag",
}
TRANSIT_CALENDAR_REQUIRED_COLUMNS = {
    "Date",
    "Planet",
    "Sign_ID",
    "Sign_Ingress_Flag",
}

_MONTH_ID_PATTERN = re.compile(r"^\d{4}_(?:0[1-9]|1[0-2])$")

EDITORIAL_INDEX_COLUMNS = (
    "Edition_ID",
    "Solar_House",
    "Natal_House",
)
EVENT_CONDITION_INDEX_COLUMNS = (
    "Month_ID",
    "Planet",
    "Event_Type",
    "Transit_Sign_From",
    "Transit_Sign_To",
    "Solar_House_From",
    "Solar_House_To",
    "Natal_House_From",
    "Natal_House_To",
    "Natal_House_At_Event",
)
ASPECT_ANCHOR_INDEX_COLUMNS = (
    "Month_ID",
    "Anchor_Solar_House",
    "Anchor_Natal_House",
)
LONG_TERM_HOUSE_INDEX_COLUMNS = (
    "Month_ID",
    "Record_Type",
    "Target_Natal_House",
)


def _file_signature(path: Path) -> tuple[int, int]:
    stat = path.stat()
    return stat.st_mtime_ns, stat.st_size


@lru_cache(maxsize=32)
def _read_csv_rows(path_text: str, _signature: tuple[int, int]) -> tuple[dict[str, str], ...]:
    path = Path(path_text)
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return tuple(dict(row) for row in csv.DictReader(handle))


def _load_rows(
    path: Path,
    required_columns: set[str],
) -> tuple[dict[str, str], ...]:
    if not path.exists():
        raise FileNotFoundError(f"Monthly overview CSV is missing: {path}")
    rows = _read_csv_rows(str(path), _file_signature(path))
    if not rows:
        raise ValueError(f"Monthly overview CSV has no rows: {path}")
    missing = required_columns.difference(rows[0])
    if missing:
        raise ValueError(
            f"Monthly overview CSV is missing columns {sorted(missing)}: {path}"
        )
    return rows


def _month_filename(pattern: str, month_id: str) -> str:
    normalized = str(month_id).strip()
    if not _MONTH_ID_PATTERN.fullmatch(normalized):
        raise ValueError(f"Invalid monthly overview Month_ID: {month_id!r}")
    return pattern.format(month_id=normalized)


def _data_month_id(month_id: str) -> str:
    normalized = str(month_id).strip()
    if not _MONTH_ID_PATTERN.fullmatch(normalized):
        raise ValueError(f"Invalid monthly overview Month_ID: {month_id!r}")
    return normalized.replace("_", "-")


def _house_value(value: object, field_name: str) -> str:
    normalized = str(value).strip()
    try:
        house = int(normalized)
    except ValueError as exc:
        raise ValueError(f"Invalid {field_name}: {value!r}") from exc
    if not 1 <= house <= 12 or normalized != str(house):
        raise ValueError(f"Invalid {field_name}: {value!r}")
    return str(house)


def _house_or_any(value: object, field_name: str) -> str:
    normalized = str(value).strip().upper()
    if normalized == "ANY":
        return normalized
    return _house_value(value, field_name)


def _event_value(
    event: Mapping[str, object],
    csv_name: str,
    *aliases: str,
    default: object = "",
) -> object:
    for name in (csv_name, *aliases):
        if name in event:
            return event[name]
    return default


def _event_condition_key(
    month_id: str,
    event: Mapping[str, object],
) -> tuple[str, ...]:
    event_type = str(
        _event_value(event, "Event_Type", "event_type")
    ).strip().lower()
    if event_type not in {"sign_ingress", "natal_house_ingress"}:
        raise ValueError(f"Unsupported monthly overview Event_Type: {event_type!r}")

    sign_from = str(
        _event_value(event, "Transit_Sign_From", "transit_sign_from")
    ).strip().upper()
    sign_to = str(
        _event_value(event, "Transit_Sign_To", "transit_sign_to")
    ).strip().upper()
    if not sign_from or not sign_to:
        raise ValueError("Event requires Transit_Sign_From and Transit_Sign_To")

    natal_house_to = _house_or_any(
        _event_value(
            event,
            "Natal_House_To",
            "natal_house_to",
            default="ANY" if event_type == "sign_ingress" else "",
        ),
        "Natal_House_To",
    )
    return (
        _data_month_id(month_id),
        str(_event_value(event, "Planet", "planet", "transit_planet")).strip().upper(),
        event_type,
        sign_from,
        sign_to,
        _house_or_any(
            _event_value(
                event,
                "Solar_House_From",
                "solar_house_from",
                default="ANY" if event_type == "natal_house_ingress" else "",
            ),
            "Solar_House_From",
        ),
        _house_or_any(
            _event_value(
                event,
                "Solar_House_To",
                "solar_house_to",
                default="ANY" if event_type == "natal_house_ingress" else "",
            ),
            "Solar_House_To",
        ),
        _house_or_any(
            _event_value(
                event,
                "Natal_House_From",
                "natal_house_from",
                default="ANY" if event_type == "sign_ingress" else "",
            ),
            "Natal_House_From",
        ),
        natal_house_to,
        _house_or_any(
            _event_value(
                event,
                "Natal_House_At_Event",
                "natal_house_at_event",
                default=natal_house_to,
            ),
            "Natal_House_At_Event",
        ),
    )


def _parse_event_date(value: object) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value).strip()[:10])
    except ValueError as exc:
        raise ValueError(f"Invalid monthly overview event date: {value!r}") from exc


def _resolve_transit_calendar_event_date(
    month_id: str,
    date_key: str,
    database_dir: Path | None,
) -> date:
    parts = date_key.split(":")
    if len(parts) != 3 or parts[1] != "sign_ingress":
        raise ValueError(f"Unsupported transit calendar Date_Key: {date_key!r}")
    planet, _event_type, sign_to = (part.strip().upper() for part in parts)
    data_month_id = _data_month_id(month_id)
    matches = [
        row
        for row in load_transit_calendar(int(data_month_id[:4]), database_dir)
        if str(row["Date"]).strip().startswith(f"{data_month_id}-")
        and str(row["Planet"]).strip().upper() == planet
        and str(row["Sign_ID"]).strip().upper() == sign_to
        and str(row["Sign_Ingress_Flag"]).strip() == "1"
    ]
    if len(matches) != 1:
        raise LookupError(
            f"Expected one transit calendar date for {date_key}, found {len(matches)}"
        )
    return _parse_event_date(matches[0]["Date"])


def _format_event_date(event_date: date, precision: str) -> str:
    if precision == "exact_day":
        return f"{event_date.month}月{event_date.day}日"
    if precision == "local_day_or_approximate":
        return f"{event_date.month}月{event_date.day}日頃"
    raise ValueError(f"Unsupported monthly overview Date_Precision: {precision!r}")


def _anchor_house_pair(value: object, planet: str) -> tuple[str, str]:
    if isinstance(value, Mapping):
        solar_house = _event_value(
            value,
            "Solar_House",
            "solar_house",
            "Anchor_Solar_House",
        )
        natal_house = _event_value(
            value,
            "Natal_House",
            "natal_house",
            "Anchor_Natal_House",
        )
    elif isinstance(value, (tuple, list)) and len(value) == 2:
        solar_house, natal_house = value
    else:
        raise ValueError(f"Invalid anchor house pair for {planet}: {value!r}")
    return (
        _house_value(solar_house, f"{planet} Anchor_Solar_House"),
        _house_value(natal_house, f"{planet} Anchor_Natal_House"),
    )


def _cluster_date_labels(
    row: Mapping[str, str],
    month_id: str,
) -> tuple[str, str | None]:
    key_dates = [
        _parse_event_date(raw_date)
        for raw_date in re.findall(r"\d{4}-\d{2}-\d{2}", str(row["Date_Key"]))
    ]
    peak_date = _parse_event_date(row["Peak_At"])
    primary_date = key_dates[0] if key_dates else peak_date
    if primary_date != peak_date:
        raise ValueError(
            f"Aspect cluster Date_Key and Peak_At disagree for {row['Cluster_ID']}"
        )

    target_year, target_month = (int(part) for part in _data_month_id(month_id).split("-"))
    precision = str(row["Date_Precision"]).strip()
    if precision == "month_end":
        if (primary_date.year, primary_date.month) > (target_year, target_month):
            primary_label = (
                f"{target_month}月末から{primary_date.month}月初めにかけて"
            )
        else:
            primary_label = f"{target_month}月末頃"
    elif precision == "around_day" and (
        primary_date.year,
        primary_date.month,
    ) < (target_year, target_month):
        primary_label = f"{primary_date.month}月末"
    elif precision in {"around_day", "exact_day"}:
        primary_label = f"{primary_date.month}月{primary_date.day}日"
    else:
        raise ValueError(f"Unsupported aspect cluster Date_Precision: {precision!r}")

    secondary_label = None
    if len(key_dates) > 1:
        secondary_date = key_dates[1]
        secondary_label = f"{secondary_date.month}月{secondary_date.day}日"
    return primary_label, secondary_label


def _resolve_aspect_cluster_tokens(
    row: Mapping[str, str],
    month_id: str,
) -> dict[str, str]:
    resolved = dict(row)
    primary_label, secondary_label = _cluster_date_labels(row, month_id)
    paragraph = str(row["Paragraph_Template"]).replace(
        "{event_date}",
        primary_label,
    )
    if "{secondary_event_date}" in paragraph:
        if secondary_label is None:
            raise ValueError(
                f"Missing secondary event date for aspect cluster {row['Cluster_ID']}"
            )
        paragraph = paragraph.replace("{secondary_event_date}", secondary_label)
    if re.search(r"\{[^{}]+\}", paragraph):
        raise ValueError(f"Unresolved token in aspect cluster {row['Template_ID']}")
    resolved["Paragraph_Template"] = paragraph
    return resolved


def _normalized_paragraph(value: object) -> str:
    return re.sub(r"[\s、。,.・:：;；!?！？]", "", str(value))


def _unique_narrative_rows(
    rows: Iterable[dict[str, str]],
    text_column: str,
    seen_narratives: set[str],
) -> list[dict[str, str]]:
    selected: list[dict[str, str]] = []
    for row in rows:
        narrative_key = _normalized_paragraph(row[text_column])
        if not narrative_key or narrative_key in seen_narratives:
            continue
        seen_narratives.add(narrative_key)
        selected.append(dict(row))
    return selected


def _transit_placement_pair(value: object, planet: str) -> tuple[str, str]:
    if isinstance(value, Mapping):
        sign = _event_value(value, "Sign_ID", "sign", "transit_sign")
        natal_house = _event_value(
            value,
            "Natal_House",
            "natal_house",
            "house",
        )
    elif isinstance(value, (tuple, list)) and len(value) == 2:
        sign, natal_house = value
    else:
        raise ValueError(f"Invalid transit placement for {planet}: {value!r}")
    normalized_sign = str(sign).strip().upper()
    if not normalized_sign:
        raise ValueError(f"Invalid transit sign for {planet}: {sign!r}")
    return normalized_sign, _house_value(natal_house, f"{planet} Natal_House")


def _index_key(
    row: dict[str, str],
    columns: tuple[str, ...],
) -> tuple[str, ...]:
    return tuple(str(row[column]).strip() for column in columns)


def _unique_index(
    rows: tuple[dict[str, str], ...],
    columns: tuple[str, ...],
) -> dict[tuple[str, ...], dict[str, str]]:
    index: dict[tuple[str, ...], dict[str, str]] = {}
    for row in rows:
        key = _index_key(row, columns)
        if key in index:
            raise ValueError(f"Duplicate monthly overview index key {key!r}")
        index[key] = row
    return index


def _bucket_index(
    rows: tuple[dict[str, str], ...],
    columns: tuple[str, ...],
) -> dict[tuple[str, ...], tuple[dict[str, str], ...]]:
    buckets: dict[tuple[str, ...], list[dict[str, str]]] = {}
    for row in rows:
        buckets.setdefault(_index_key(row, columns), []).append(row)
    return {key: tuple(bucket) for key, bucket in buckets.items()}


def _active_rows_for_month(
    rows: tuple[dict[str, str], ...],
    month_id: str,
) -> tuple[dict[str, str], ...]:
    expected_month_id = _data_month_id(month_id)
    mismatched = {
        str(row["Month_ID"]).strip()
        for row in rows
        if str(row["Month_ID"]).strip() != expected_month_id
    }
    if mismatched:
        raise ValueError(
            "Monthly overview CSV contains unexpected Month_ID values: "
            f"{sorted(mismatched)}; expected {expected_month_id}"
        )
    return tuple(row for row in rows if str(row["Active_Flag"]).strip() == "1")


def load_monthly_overview_editorial(
    database_dir: Path | None = None,
) -> tuple[dict[str, str], ...]:
    return _load_rows(
        (database_dir or DATABASE_DIR) / EDITORIAL_FILENAME,
        EDITORIAL_REQUIRED_COLUMNS,
    )


def load_monthly_overview_event_paragraphs(
    month_id: str,
    database_dir: Path | None = None,
) -> tuple[dict[str, str], ...]:
    filename = _month_filename(EVENT_PARAGRAPHS_FILENAME, month_id)
    return _load_rows(
        (database_dir or DATABASE_DIR) / filename,
        EVENT_PARAGRAPH_REQUIRED_COLUMNS,
    )


def load_monthly_overview_aspect_clusters(
    month_id: str,
    database_dir: Path | None = None,
) -> tuple[dict[str, str], ...]:
    filename = _month_filename(ASPECT_CLUSTERS_FILENAME, month_id)
    return _load_rows(
        (database_dir or DATABASE_DIR) / filename,
        ASPECT_CLUSTER_REQUIRED_COLUMNS,
    )


def load_personal_long_term_background(
    month_id: str,
    database_dir: Path | None = None,
) -> tuple[dict[str, str], ...]:
    filename = _month_filename(LONG_TERM_BACKGROUND_FILENAME, month_id)
    return _load_rows(
        (database_dir or DATABASE_DIR) / filename,
        LONG_TERM_BACKGROUND_REQUIRED_COLUMNS,
    )


def load_transit_calendar(
    year: int,
    database_dir: Path | None = None,
) -> tuple[dict[str, str], ...]:
    normalized_year = str(year).strip()
    if not re.fullmatch(r"\d{4}", normalized_year):
        raise ValueError(f"Invalid transit calendar year: {year!r}")
    return _load_rows(
        (database_dir or DATABASE_DIR)
        / TRANSIT_CALENDAR_FILENAME.format(year=normalized_year),
        TRANSIT_CALENDAR_REQUIRED_COLUMNS,
    )


def resolve_monthly_overview_edition_id(
    month_id: str,
    database_dir: Path | None = None,
) -> str:
    data_month_id = _data_month_id(month_id)
    first_day = f"{data_month_id}-01"
    sun_rows = [
        row
        for row in load_transit_calendar(int(data_month_id[:4]), database_dir)
        if str(row["Date"]).strip() == first_day
        and str(row["Planet"]).strip().upper() == "SUN"
    ]
    if len(sun_rows) != 1:
        raise LookupError(
            f"Expected one SUN transit row for {first_day}, found {len(sun_rows)}"
        )
    sign_id = str(sun_rows[0]["Sign_ID"]).strip().upper()
    if not sign_id:
        raise ValueError(f"SUN transit row has no Sign_ID for {first_day}")
    return f"{data_month_id[:4]}_{sign_id}"


def select_monthly_overview_editorial(
    month_id: str,
    solar_house: object,
    natal_house: object,
    database_dir: Path | None = None,
) -> dict[str, str]:
    edition_id = resolve_monthly_overview_edition_id(month_id, database_dir)
    key = (
        edition_id,
        _house_value(solar_house, "Solar_House"),
        _house_value(natal_house, "Natal_House"),
    )
    index = _unique_index(
        load_monthly_overview_editorial(database_dir),
        EDITORIAL_INDEX_COLUMNS,
    )
    try:
        return dict(index[key])
    except KeyError as exc:
        raise LookupError(
            "No monthly overview editorial row for "
            f"Edition_ID={key[0]}, Solar_House={key[1]}, Natal_House={key[2]}"
        ) from exc


def select_monthly_overview_event_paragraph(
    month_id: str,
    event: Mapping[str, object],
    calculated_event_dates: Mapping[str, object] | None = None,
    database_dir: Path | None = None,
) -> dict[str, str] | None:
    event_rows = _active_rows_for_month(
        load_monthly_overview_event_paragraphs(month_id, database_dir),
        month_id,
    )
    index = _unique_index(event_rows, EVENT_CONDITION_INDEX_COLUMNS)
    row = index.get(_event_condition_key(month_id, event))
    if row is None:
        return None

    date_source = str(row["Date_Source"]).strip()
    date_key = str(row["Date_Key"]).strip()
    if date_source == "transit_calendar":
        event_date = _resolve_transit_calendar_event_date(
            month_id,
            date_key,
            database_dir,
        )
    elif date_source == "natal_house_calculation":
        if calculated_event_dates is None or date_key not in calculated_event_dates:
            return None
        event_date = _parse_event_date(calculated_event_dates[date_key])
        if not event_date.isoformat().startswith(f"{_data_month_id(month_id)}-"):
            return None
    else:
        raise ValueError(f"Unsupported monthly overview Date_Source: {date_source!r}")

    resolved = dict(row)
    resolved["Event_Date"] = event_date.isoformat()
    paragraph_template = str(row["Paragraph_Template"])
    event_date_label = _format_event_date(
        event_date,
        str(row["Date_Precision"]).strip(),
    )
    if event_date_label.endswith("頃") and "{event_date}頃" in paragraph_template:
        event_date_label = event_date_label[:-1]
    resolved["Paragraph_Template"] = paragraph_template.replace(
        "{event_date}",
        event_date_label,
    )
    if re.search(r"\{[^{}]+\}", resolved["Paragraph_Template"]):
        raise ValueError(f"Unresolved token in event paragraph {row['Template_ID']}")
    return resolved


def select_monthly_overview_aspect_clusters(
    month_id: str,
    as_of: object,
    matched_cluster_ids: set[str] | tuple[str, ...] | list[str],
    anchor_houses: Mapping[str, object],
    database_dir: Path | None = None,
) -> list[dict[str, str]]:
    target_date = _parse_event_date(as_of)
    requested_clusters = {
        str(cluster_id).strip()
        for cluster_id in matched_cluster_ids
        if str(cluster_id).strip()
    }
    if not requested_clusters:
        return []

    rows = _active_rows_for_month(
        load_monthly_overview_aspect_clusters(month_id, database_dir),
        month_id,
    )
    definitions: dict[str, dict[str, str]] = {}
    for row in rows:
        definitions.setdefault(str(row["Cluster_ID"]).strip(), row)

    candidates: list[dict[str, str]] = []
    for cluster_id in sorted(requested_clusters):
        definition = definitions.get(cluster_id)
        if definition is None:
            continue
        valid_from = _parse_event_date(definition["Valid_From"])
        valid_to = _parse_event_date(definition["Valid_To"])
        if not valid_from <= target_date <= valid_to:
            continue

        anchor_planet = str(definition["Anchor_Planet"]).strip().upper()
        anchor_value = anchor_houses.get(anchor_planet)
        if anchor_value is None:
            continue
        solar_house, natal_house = _anchor_house_pair(anchor_value, anchor_planet)
        matches = [
            row
            for row in rows
            if str(row["Cluster_ID"]).strip() == cluster_id
            and str(row["Anchor_Solar_House"]).strip() == solar_house
            and str(row["Anchor_Natal_House"]).strip() == natal_house
        ]
        if len(matches) != 1:
            raise LookupError(
                "Expected one aspect cluster paragraph for "
                f"Cluster_ID={cluster_id}, Solar_House={solar_house}, "
                f"Natal_House={natal_house}; found {len(matches)}"
            )
        candidates.append(matches[0])

    superseded = {
        superseded_id.strip()
        for row in candidates
        for superseded_id in str(row["Supersedes_Cluster_IDs"]).split("|")
        if superseded_id.strip()
    }
    candidates = [
        row for row in candidates if str(row["Cluster_ID"]).strip() not in superseded
    ]

    by_selection_group: dict[str, dict[str, str]] = {}
    for row in candidates:
        cluster_id = str(row["Cluster_ID"]).strip()
        group = str(row["Selection_Group"]).strip() or cluster_id
        current = by_selection_group.get(group)
        rank = (
            int(str(row["Priority"]).strip()),
            -int(str(row["Section_Order"]).strip()),
            cluster_id,
        )
        if current is None:
            by_selection_group[group] = row
            continue
        current_rank = (
            int(str(current["Priority"]).strip()),
            -int(str(current["Section_Order"]).strip()),
            str(current["Cluster_ID"]).strip(),
        )
        if rank > current_rank:
            by_selection_group[group] = row

    selected: list[dict[str, str]] = []
    seen_paragraphs: set[str] = set()
    for row in sorted(
        by_selection_group.values(),
        key=lambda item: (
            _parse_event_date(item["Peak_At"]),
            int(str(item["Section_Order"]).strip()),
            -int(str(item["Priority"]).strip()),
            str(item["Cluster_ID"]).strip(),
        ),
    ):
        resolved = _resolve_aspect_cluster_tokens(row, month_id)
        paragraph_key = _normalized_paragraph(resolved["Paragraph_Template"])
        if paragraph_key in seen_paragraphs:
            continue
        seen_paragraphs.add(paragraph_key)
        selected.append(resolved)
    return selected


def select_personal_long_term_backgrounds(
    month_id: str,
    as_of: object,
    transit_placements: Mapping[str, object],
    database_dir: Path | None = None,
) -> list[dict[str, str]]:
    target_date = _parse_event_date(as_of)
    normalized_placements = {
        str(planet).strip().upper(): _transit_placement_pair(value, str(planet).strip().upper())
        for planet, value in transit_placements.items()
    }
    rows = _active_rows_for_month(
        load_personal_long_term_background(month_id, database_dir),
        month_id,
    )

    matches: dict[str, dict[str, str]] = {}
    for planet, (sign, natal_house) in normalized_placements.items():
        planet_rows = [
            row
            for row in rows
            if str(row["Record_Type"]).strip() == "background"
            and str(row["Primary_Planet"]).strip().upper() == planet
            and str(row["Primary_Sign"]).strip().upper() == sign
            and str(row["Target_Natal_House"]).strip() == natal_house
            and _parse_event_date(row["Valid_From"])
            <= target_date
            <= _parse_event_date(row["Valid_To"])
        ]
        if len(planet_rows) > 1:
            raise LookupError(
                "Expected at most one long-term background for "
                f"{planet} {sign} Natal_House={natal_house}; found {len(planet_rows)}"
            )
        if planet_rows:
            matches[planet] = planet_rows[0]

    structural_rows = [
        matches[planet]
        for planet in ("SATURN", "NEPTUNE", "PLUTO")
        if planet in matches
    ]
    candidates: list[dict[str, str]] = []
    if structural_rows:
        candidates.append(
            max(
                structural_rows,
                key=lambda row: (
                    int(str(row["Priority"]).strip()),
                    str(row["Primary_Planet"]).strip(),
                ),
            )
        )
    if "JUPITER" in matches:
        candidates.append(matches["JUPITER"])
    if "URANUS" in matches:
        candidates.append(matches["URANUS"])

    ranked = sorted(
        candidates,
        key=lambda row: (
            -int(str(row["Priority"]).strip()),
            str(row["Primary_Planet"]).strip(),
            str(row["Record_ID"]).strip(),
        ),
    )
    selected: list[dict[str, str]] = []
    seen_interpretations: set[str] = set()
    for row in ranked:
        interpretation_key = _normalized_paragraph(row["Interpretation"])
        if interpretation_key in seen_interpretations:
            continue
        seen_interpretations.add(interpretation_key)
        selected.append(dict(row))
        if len(selected) == 2:
            break
    return selected


def select_personal_long_term_resonance(
    month_id: str,
    as_of: object,
    transit_placements: Mapping[str, object],
    database_dir: Path | None = None,
) -> dict[str, str] | None:
    target_date = _parse_event_date(as_of)
    normalized_placements = {
        str(planet).strip().upper(): _transit_placement_pair(
            value,
            str(planet).strip().upper(),
        )
        for planet, value in transit_placements.items()
    }
    rows = _active_rows_for_month(
        load_personal_long_term_background(month_id, database_dir),
        month_id,
    )

    matches: list[dict[str, str]] = []
    for row in rows:
        if str(row["Record_Type"]).strip() != "resonance":
            continue
        primary_planet = str(row["Primary_Planet"]).strip().upper()
        secondary_planet = str(row["Secondary_Planet"]).strip().upper()
        if primary_planet not in normalized_placements or secondary_planet not in normalized_placements:
            continue
        if not (
            _parse_event_date(row["Valid_From"])
            <= target_date
            <= _parse_event_date(row["Valid_To"])
        ):
            continue

        primary_sign, primary_house = normalized_placements[primary_planet]
        secondary_sign, secondary_house = normalized_placements[secondary_planet]
        if (
            str(row["Primary_Sign"]).strip().upper() != primary_sign
            or str(row["Secondary_Sign"]).strip().upper() != secondary_sign
        ):
            continue

        match_type = str(row["Match_Type"]).strip()
        target_house = str(row["Target_Natal_House"]).strip()
        if match_type == "same_sign":
            if primary_sign != secondary_sign or target_house != "ANY":
                continue
        elif match_type == "same_natal_house":
            if primary_house != secondary_house or target_house != primary_house:
                continue
        else:
            raise ValueError(
                f"Unknown resonance Match_Type {match_type!r} in {row['Record_ID']}"
            )
        matches.append(row)

    same_sign_pairs = {
        tuple(sorted((row["Primary_Planet"], row["Secondary_Planet"])))
        for row in matches
        if str(row["Match_Type"]).strip() == "same_sign"
    }
    preferred = [
        row
        for row in matches
        if str(row["Match_Type"]).strip() == "same_sign"
        or tuple(sorted((row["Primary_Planet"], row["Secondary_Planet"])))
        not in same_sign_pairs
    ]
    if not preferred:
        return None

    selected = min(
        preferred,
        key=lambda row: (
            -int(str(row["Priority"]).strip()),
            0 if str(row["Match_Type"]).strip() == "same_sign" else 1,
            str(row["Record_ID"]).strip(),
        ),
    )
    return dict(selected)


def compose_monthly_overview(
    month_id: str,
    as_of: object,
    solar_house: object,
    natal_house: object,
    *,
    events: Iterable[Mapping[str, object]] = (),
    calculated_event_dates: Mapping[str, object] | None = None,
    matched_cluster_ids: Iterable[str] = (),
    anchor_houses: Mapping[str, object] | None = None,
    transit_placements: Mapping[str, object] | None = None,
    database_dir: Path | None = None,
) -> dict[str, object]:
    target_date = _parse_event_date(as_of)
    data_month_id = _data_month_id(month_id)
    if target_date.strftime("%Y-%m") != data_month_id:
        raise ValueError(
            f"Monthly overview as_of {target_date.isoformat()} is outside {data_month_id}"
        )

    editorial = select_monthly_overview_editorial(
        month_id,
        solar_house,
        natal_house,
        database_dir,
    )
    event_rows = [
        selected
        for event in events
        if (
            selected := select_monthly_overview_event_paragraph(
                month_id,
                event,
                calculated_event_dates,
                database_dir,
            )
        )
        is not None
    ]
    event_rows.sort(
        key=lambda row: (
            _parse_event_date(row["Event_Date"]),
            int(str(row["Section_Order"]).strip()),
            -int(str(row["Priority"]).strip()),
            str(row["Template_ID"]).strip(),
        )
    )
    aspect_rows = select_monthly_overview_aspect_clusters(
        month_id,
        target_date,
        tuple(matched_cluster_ids),
        anchor_houses or {},
        database_dir,
    )
    background_rows = select_personal_long_term_backgrounds(
        month_id,
        target_date,
        transit_placements or {},
        database_dir,
    )
    resonance = select_personal_long_term_resonance(
        month_id,
        target_date,
        transit_placements or {},
        database_dir,
    )

    seen_narratives = {
        _normalized_paragraph(editorial[column])
        for column in ("Summary", "Interpretation", "Action")
    }
    unique_events = _unique_narrative_rows(
        event_rows,
        "Paragraph_Template",
        seen_narratives,
    )
    unique_aspects = _unique_narrative_rows(
        aspect_rows,
        "Paragraph_Template",
        seen_narratives,
    )
    unique_backgrounds = _unique_narrative_rows(
        background_rows,
        "Interpretation",
        seen_narratives,
    )
    if resonance is not None:
        resonance_rows = _unique_narrative_rows(
            (resonance,),
            "Interpretation",
            seen_narratives,
        )
        resonance = resonance_rows[0] if resonance_rows else None

    return {
        "month_id": data_month_id,
        "as_of": target_date.isoformat(),
        "editorial": editorial,
        "event_paragraphs": unique_events,
        "aspect_clusters": unique_aspects,
        "long_term_backgrounds": unique_backgrounds,
        "resonance": resonance,
    }


def build_monthly_overview_indexes(
    month_id: str,
    database_dir: Path | None = None,
) -> dict[str, object]:
    event_rows = _active_rows_for_month(
        load_monthly_overview_event_paragraphs(month_id, database_dir),
        month_id,
    )
    aspect_rows = _active_rows_for_month(
        load_monthly_overview_aspect_clusters(month_id, database_dir),
        month_id,
    )
    long_term_rows = _active_rows_for_month(
        load_personal_long_term_background(month_id, database_dir),
        month_id,
    )

    return {
        "month_id": _data_month_id(month_id),
        "editorial_by_house": _unique_index(
            load_monthly_overview_editorial(database_dir),
            EDITORIAL_INDEX_COLUMNS,
        ),
        "event_by_condition": _unique_index(
            event_rows,
            EVENT_CONDITION_INDEX_COLUMNS,
        ),
        "aspect_by_anchor": _bucket_index(
            aspect_rows,
            ASPECT_ANCHOR_INDEX_COLUMNS,
        ),
        "long_term_by_house": _bucket_index(
            long_term_rows,
            LONG_TERM_HOUSE_INDEX_COLUMNS,
        ),
    }


def clear_monthly_overview_caches() -> None:
    _read_csv_rows.cache_clear()
