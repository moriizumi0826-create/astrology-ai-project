from __future__ import annotations

import csv
import re
from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Any

from backend.app.services.chart_calculator import get_house


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DATABASE_DIR = PROJECT_ROOT / "database"
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
OVERVIEW_PLANETS = ("JUPITER", "SATURN", "URANUS", "NEPTUNE")


def yearly_overview_csv_paths(year: int = 2026) -> list[Path]:
    return [
        DATABASE_DIR / "M_Yearly_Overview_Editorial.csv",
        DATABASE_DIR / f"M_Yearly_Overview_House_Transition_Paragraphs_{year}.csv",
        DATABASE_DIR / f"M_Yearly_Overview_Event_Paragraphs_{year}.csv",
        DATABASE_DIR / f"M_Yearly_Overview_Aspect_Clusters_{year}.csv",
    ]


def _read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


@lru_cache(maxsize=4)
def _overview_rows(year: int) -> dict[str, list[dict[str, str]]]:
    editorial, transitions, events, clusters = yearly_overview_csv_paths(year)
    return {
        "editorial": _read_csv(editorial),
        "transitions": _read_csv(transitions),
        "events": _read_csv(events),
        "clusters": _read_csv(clusters),
    }


@lru_cache(maxsize=4)
def _calendar_rows(year: int) -> dict[str, list[dict[str, str]]]:
    rows = _read_csv(DATABASE_DIR / f"M_Transit_Calendar_{year}.csv")
    by_planet: dict[str, list[dict[str, str]]] = {}
    for row in rows:
        by_planet.setdefault(str(row.get("Planet") or "").strip().upper(), []).append(row)
    for planet_rows in by_planet.values():
        planet_rows.sort(key=lambda row: str(row.get("Date") or ""))
    return by_planet


def clear_yearly_overview_caches() -> None:
    _overview_rows.cache_clear()
    _calendar_rows.cache_clear()


def _active(row: dict[str, str]) -> bool:
    return str(row.get("Active_Flag") or "1").strip().lower() in {"1", "true", "yes"}


def _as_int(value: Any, default: int = 0) -> int:
    try:
        return int(float(str(value).strip()))
    except (TypeError, ValueError):
        return default


def _sign_for_longitude(longitude: float) -> str:
    return SIGNS[int(float(longitude) % 360 // 30)]


def _solar_house(transit_sign: str, natal_sun_sign: str) -> int:
    return ((SIGNS.index(transit_sign) - SIGNS.index(natal_sun_sign)) % 12) + 1


def _japanese_date(value: str) -> str:
    parsed = date.fromisoformat(value[:10])
    return f"{parsed.month}月{parsed.day}日"


def _replace_placeholders(text: str, context: dict[str, Any]) -> str:
    def replace(match: re.Match[str]) -> str:
        key = match.group(1)
        value = context.get(key)
        if value not in {None, ""}:
            return str(value)
        if "date" in key or "timing" in key:
            return "この時期"
        if "house" in key:
            return "この領域"
        return ""

    return re.sub(r"\{([a-zA-Z0-9_]+)\}", replace, str(text or "")).strip()


def _natal_sun_house(natal_points: list[dict[str, Any]]) -> int:
    for point in natal_points:
        if str(point.get("planet") or "").upper() == "SUN":
            return _as_int(point.get("house"), 1)
    return 1


def select_editorial_row(
    year: int,
    natal_sun_sign: str,
    solar_house: int,
    natal_house: int,
) -> dict[str, str]:
    edition_id = f"{year}_{natal_sun_sign}"
    return next(
        (
            row
            for row in _overview_rows(year)["editorial"]
            if row.get("Edition_ID") == edition_id
            and _as_int(row.get("Solar_House")) == solar_house
            and _as_int(row.get("Natal_House")) == natal_house
        ),
        {},
    )


def _extract_editorial_section(text: str, heading_fragment: str) -> str:
    sections = re.findall(r"【([^】]+)】\s*(.*?)(?=\n\s*【|\Z)", str(text or ""), re.S)
    for heading, body in sections:
        if heading_fragment in heading:
            return body.strip()
    return str(text or "").strip()


def _event_date(row: dict[str, str], calendar: dict[str, list[dict[str, str]]]) -> str:
    planet = str(row.get("Planet") or "").upper()
    event_type = str(row.get("Event_Type") or "").lower()
    target_sign = str(row.get("Transit_Sign_To") or "").upper()
    previous: dict[str, str] | None = None
    for current in calendar.get(planet, []):
        sign = str(current.get("Sign_ID") or "").upper() or _sign_for_longitude(float(current["Ecliptic_Longitude"]))
        retrograde = _as_int(current.get("Retrograde_Flag")) == 1
        if previous is not None:
            previous_sign = str(previous.get("Sign_ID") or "").upper() or _sign_for_longitude(float(previous["Ecliptic_Longitude"]))
            previous_retrograde = _as_int(previous.get("Retrograde_Flag")) == 1
            if event_type == "sign_ingress" and sign == target_sign and previous_sign != sign:
                return str(current.get("Date") or "")
            if event_type == "retrograde_start" and retrograde and not previous_retrograde and (not target_sign or sign == target_sign):
                return str(current.get("Date") or "")
        previous = current
    return ""


def _calendar_row_on_date(
    calendar: dict[str, list[dict[str, str]]],
    planet: str,
    date_value: str,
) -> dict[str, str]:
    return next((row for row in calendar.get(planet, []) if row.get("Date") == date_value), {})


def _angular_separation(a: float, b: float) -> float:
    return abs((float(a) - float(b) + 180.0) % 360.0 - 180.0)


def _cluster_peak_date(row: dict[str, str], calendar: dict[str, list[dict[str, str]]]) -> str:
    signatures: list[tuple[str, str, float]] = []
    for token in str(row.get("Aspect_Signature") or "").split("|"):
        match = re.fullmatch(r"([A-Z]+)-([A-Z]+):(\d+(?:\.\d+)?)", token.strip())
        if match:
            signatures.append((match.group(1), match.group(2), float(match.group(3))))
    if not signatures:
        return str(row.get("Peak_At") or "")[:10]

    positions = {
        planet: {entry.get("Date"): float(entry["Ecliptic_Longitude"]) for entry in calendar.get(planet, [])}
        for pair in signatures
        for planet in pair[:2]
    }
    dates = set.intersection(*(set(positions[planet]) for pair in signatures for planet in pair[:2]))
    if not dates:
        return ""

    def deviation(day: str) -> float:
        return sum(
            abs(_angular_separation(positions[a][day], positions[b][day]) - angle)
            for a, b, angle in signatures
        )

    return min(dates, key=lambda day: (deviation(day), day))


def _cluster_items(
    rows: list[dict[str, str]],
    calendar: dict[str, list[dict[str, str]]],
    house_cusps: list[float],
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for cluster_id in dict.fromkeys(row.get("Cluster_ID", "") for row in rows if _active(row)):
        candidates = [row for row in rows if row.get("Cluster_ID") == cluster_id and _active(row)]
        if not candidates:
            continue
        peak_date = _cluster_peak_date(candidates[0], calendar)
        anchor_planet = str(candidates[0].get("Anchor_Planet") or "").upper()
        anchor_row = _calendar_row_on_date(calendar, anchor_planet, peak_date)
        if not anchor_row:
            continue
        anchor_house = get_house(float(anchor_row["Ecliptic_Longitude"]), house_cusps)
        selected = next(
            (row for row in candidates if _as_int(row.get("Anchor_Natal_House")) == anchor_house),
            {},
        )
        if not selected:
            continue
        context = {"event_date": _japanese_date(peak_date)}
        items.append({
            "cluster_id": cluster_id,
            "title": selected.get("Title", ""),
            "text": _replace_placeholders(selected.get("Paragraph_Template", ""), context),
            "event_date": peak_date,
            "anchor_planet": anchor_planet,
            "anchor_natal_house": anchor_house,
            "section_order": _as_int(selected.get("Section_Order")),
            "priority": _as_int(selected.get("Priority")),
            "template_id": selected.get("Template_ID", ""),
        })
    return sorted(items, key=lambda item: (item["section_order"], -item["priority"], item["cluster_id"]))


def _planet_transition(
    planet: str,
    calendar: dict[str, list[dict[str, str]]],
    house_cusps: list[float],
) -> dict[str, Any]:
    rows = calendar.get(planet, [])
    if not rows:
        return {}
    houses = [(str(row.get("Date") or ""), get_house(float(row["Ecliptic_Longitude"]), house_cusps)) for row in rows]
    house_from = houses[0][1]
    house_to = houses[-1][1]
    transition_date = next((day for day, house in houses[1:] if house != house_from), "")
    return {
        "planet": planet,
        "transition_type": "ingress" if house_from != house_to else "stay",
        "house_from": house_from,
        "house_to": house_to,
        "transition_date": transition_date,
    }


def _select_transition(
    rows: list[dict[str, str]],
    transitions: dict[str, dict[str, Any]],
) -> tuple[dict[str, str], dict[str, Any]]:
    saturn = transitions.get("SATURN", {})
    jupiter = transitions.get("JUPITER", {})
    selected_state = saturn
    if saturn.get("transition_type") != "ingress" and jupiter.get("transition_type") == "ingress":
        selected_state = jupiter
    selected = next(
        (
            row
            for row in rows
            if _active(row)
            and row.get("Planet") == selected_state.get("planet")
            and row.get("Transition_Type") == selected_state.get("transition_type")
            and _as_int(row.get("Natal_House_From")) == selected_state.get("house_from")
            and _as_int(row.get("Natal_House_To")) == selected_state.get("house_to")
        ),
        {},
    )
    return selected, selected_state


def _event_items(
    rows: list[dict[str, str]],
    calendar: dict[str, list[dict[str, str]]],
    natal_sun_sign: str,
    house_cusps: list[float],
    year: int,
) -> list[dict[str, Any]]:
    prefix = f"{year}_{natal_sun_sign}_"
    event_groups: dict[tuple[str, str, str], list[dict[str, str]]] = {}
    for row in rows:
        if _active(row) and str(row.get("Template_ID") or "").startswith(prefix):
            key = (row.get("Planet", ""), row.get("Event_Type", ""), row.get("Date_Key", ""))
            event_groups.setdefault(key, []).append(row)

    selected_items: list[dict[str, Any]] = []
    for candidates in event_groups.values():
        event_date = _event_date(candidates[0], calendar)
        planet = str(candidates[0].get("Planet") or "").upper()
        calendar_row = _calendar_row_on_date(calendar, planet, event_date)
        if not calendar_row:
            continue
        natal_house = get_house(float(calendar_row["Ecliptic_Longitude"]), house_cusps)
        selected = next(
            (row for row in candidates if _as_int(row.get("Natal_House_At_Event")) == natal_house),
            {},
        )
        if not selected:
            continue
        selected_items.append({
            "template_id": selected.get("Template_ID", ""),
            "planet": planet,
            "event_type": selected.get("Event_Type", ""),
            "event_date": event_date,
            "natal_house": natal_house,
            "section_order": _as_int(selected.get("Section_Order")),
            "priority": _as_int(selected.get("Priority")),
            "text": _replace_placeholders(
                selected.get("Paragraph_Template", ""),
                {"event_date": _japanese_date(event_date)},
            ),
        })

    # One event per annual phase keeps the five-part overview readable.
    by_section: dict[int, dict[str, Any]] = {}
    for item in sorted(selected_items, key=lambda value: (value["section_order"], -value["priority"], value["event_date"])):
        by_section.setdefault(item["section_order"], item)
    return list(by_section.values())


def build_yearly_overview(
    *,
    year: int,
    natal_points: list[dict[str, Any]],
    house_cusps: list[float],
    natal_sun_sign: str,
) -> dict[str, Any] | None:
    data = _overview_rows(year)
    if not data["editorial"] or len(house_cusps) != 12 or natal_sun_sign not in SIGNS:
        return None

    calendar = _calendar_rows(year)
    natal_house = _natal_sun_house(natal_points)
    # The 2026 editorial axis is the Saturn-Neptune conjunction at Aries 0 degrees.
    solar_house = _solar_house("ARIES", natal_sun_sign)
    editorial = select_editorial_row(year, natal_sun_sign, solar_house, natal_house)
    if not editorial:
        return None

    clusters = _cluster_items(data["clusters"], calendar, house_cusps)
    primary_cluster = next(
        (item for item in clusters if item["cluster_id"] == f"{year}_SATURN_NEPTUNE_CONJUNCTION"),
        clusters[0] if clusters else {},
    )
    transitions = {
        planet: _planet_transition(planet, calendar, house_cusps)
        for planet in OVERVIEW_PLANETS
    }
    transition_row, transition_state = _select_transition(data["transitions"], transitions)
    events = _event_items(data["events"], calendar, natal_sun_sign, house_cusps, year)

    core_text = _extract_editorial_section(editorial.get("Interpretation", ""), "中心領域の変革")
    annual_flow = "\n\n".join(item["text"] for item in events)
    transition_context = {
        "event_date": _japanese_date(transition_state["transition_date"]) if transition_state.get("transition_date") else "この時期",
    }
    transition_text = _replace_placeholders(transition_row.get("Transition_Paragraph", ""), transition_context)
    action = _replace_placeholders(editorial.get("Action", ""), {})
    paragraphs = {
        "global_theme": primary_cluster.get("text", ""),
        "core_evolution": core_text,
        "house_transition": transition_text,
        "annual_flow": annual_flow,
        "action": action,
    }

    return {
        "year": year,
        "edition_id": editorial.get("Edition_ID", ""),
        "solar_house": solar_house,
        "natal_house": natal_house,
        "title": editorial.get("Title", f"{year}年の運気"),
        "summary": _replace_placeholders(editorial.get("Summary", ""), {}),
        "action": action,
        "paragraphs": paragraphs,
        "sections": [
            {"key": "global_theme", "label": "今年の総合テーマ", "text": paragraphs["global_theme"]},
            {"key": "core_evolution", "label": "中心領域の変化", "text": paragraphs["core_evolution"]},
            {"key": "house_transition", "label": "主要天体の移動", "text": paragraphs["house_transition"]},
            {"key": "annual_flow", "label": "今年の流れ", "text": paragraphs["annual_flow"]},
            {"key": "action", "label": "今年のアクション", "text": paragraphs["action"]},
        ],
        "full_text": "\n\n".join(text for text in paragraphs.values() if text),
        "events": events,
        "clusters": clusters,
        "planet_transitions": transitions,
        "source": {
            "editorial": editorial.get("Edition_ID", ""),
            "primary_cluster": primary_cluster.get("template_id", ""),
            "transition": transition_row.get("Template_ID", ""),
            "events": [item["template_id"] for item in events],
        },
    }
