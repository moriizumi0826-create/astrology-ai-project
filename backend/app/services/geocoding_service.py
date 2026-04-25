from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from backend.app.settings import settings


DEFAULT_BIRTH_TIME = "12:00"
JAPAN_TIMEZONE = "Asia/Tokyo"


@dataclass
class LocationMatch:
    query: str
    display_name: str
    latitude: float
    longitude: float
    timezone_name: str
    timezone_offset: float | None
    resolved_at: datetime | None


def _normalize_prefecture(value: str | None) -> str:
    text = str(value or "").strip().lower()
    suffixes = (" prefecture", " province", "-to", "-fu", "-ken", "-do")
    for suffix in suffixes:
        if text.endswith(suffix):
            text = text[: -len(suffix)].strip()
    return text


def _matches_prefecture(prefecture: str | None, candidate: str | None) -> bool:
    wanted = _normalize_prefecture(prefecture)
    actual = _normalize_prefecture(candidate)
    if not wanted or not actual:
        return True
    return wanted == actual or wanted in actual or actual in wanted


def _fetch_json(url: str, user_agent: str = "CelestialAtelier/0.1") -> Any:
    request = Request(url, headers={"User-Agent": user_agent})
    with urlopen(request, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def _compose_display_name(item: dict[str, Any]) -> str:
    parts = [
        str(item.get("name") or "").strip(),
        str(item.get("admin1") or "").strip(),
        str(item.get("country") or "").strip(),
    ]
    return ", ".join(part for part in parts if part)


def _compose_nominatim_display_name(item: dict[str, Any]) -> str:
    address = item.get("address") or {}
    locality = (
        address.get("city")
        or address.get("town")
        or address.get("village")
        or address.get("municipality")
        or address.get("city_district")
        or item.get("name")
        or ""
    )
    parts = [
        str(locality).strip(),
        str(address.get("state") or "").strip(),
        "Japan",
    ]
    deduped: list[str] = []
    for part in parts:
        if part and part not in deduped:
            deduped.append(part)
    return ", ".join(deduped)


def _resolve_offset_hours(
    timezone_name: str,
    birth_date: str,
    birth_time: str | None,
    birth_time_unknown: bool,
) -> tuple[float, datetime]:
    local_time = DEFAULT_BIRTH_TIME if birth_time_unknown or not birth_time else birth_time
    naive_dt = datetime.fromisoformat(f"{birth_date}T{local_time}")
    localized = naive_dt.replace(tzinfo=ZoneInfo(timezone_name))
    offset = localized.utcoffset()
    if offset is None:
        raise ValueError("Could not determine UTC offset for the selected timezone.")
    return offset.total_seconds() / 3600, localized


def _search_open_meteo(
    query: str,
    prefecture: str | None,
    birth_date: str | None,
    birth_time: str | None,
    birth_time_unknown: bool,
    limit: int,
) -> list[LocationMatch]:
    params = urlencode(
        {
            "name": query.strip(),
            "count": max(1, min(limit, 10)),
            "language": "ja",
            "format": "json",
            "countryCode": "JP",
        }
    )
    url = f"{settings.geocoding_base_url}?{params}"
    payload = _fetch_json(url)

    raw_results = payload.get("results") or []
    matches: list[LocationMatch] = []
    for item in raw_results:
        country_code = str(item.get("country_code") or "").strip().upper()
        admin1 = str(item.get("admin1") or "").strip()
        if country_code and country_code != "JP":
            continue
        if prefecture and not _matches_prefecture(prefecture, admin1):
            continue

        timezone_name = str(item.get("timezone") or "").strip() or JAPAN_TIMEZONE
        timezone_offset = None
        resolved_at = None
        if birth_date:
            timezone_offset, resolved_at = _resolve_offset_hours(
                timezone_name=timezone_name,
                birth_date=birth_date,
                birth_time=birth_time,
                birth_time_unknown=birth_time_unknown,
            )

        matches.append(
            LocationMatch(
                query=query.strip(),
                display_name=_compose_display_name(item),
                latitude=float(item["latitude"]),
                longitude=float(item["longitude"]),
                timezone_name=timezone_name,
                timezone_offset=timezone_offset,
                resolved_at=resolved_at,
            )
        )
    return matches[:limit]


def _search_nominatim(
    query: str,
    prefecture: str | None,
    limit: int,
) -> list[LocationMatch]:
    search_queries = [query.strip()]
    if prefecture:
        search_queries.insert(0, f"{query.strip()}, {prefecture}, Japan")

    matches: list[LocationMatch] = []
    seen: set[tuple[str, float, float]] = set()

    for search_query in search_queries:
        params = urlencode(
            {
                "q": search_query,
                "countrycodes": "jp",
                "format": "jsonv2",
                "addressdetails": 1,
                "limit": max(1, min(limit, 10)),
            }
        )
        url = f"https://nominatim.openstreetmap.org/search?{params}"
        payload = _fetch_json(url, user_agent="CelestialAtelier/0.1 (geocoding fallback)")
        if not isinstance(payload, list):
            continue

        for item in payload:
            address = item.get("address") or {}
            state = str(address.get("state") or "").strip()
            if prefecture and not _matches_prefecture(prefecture, state):
                continue

            latitude = float(item["lat"])
            longitude = float(item["lon"])
            display_name = _compose_nominatim_display_name(item)
            key = (display_name, latitude, longitude)
            if key in seen:
                continue
            seen.add(key)

            matches.append(
                LocationMatch(
                    query=query.strip(),
                    display_name=display_name,
                    latitude=latitude,
                    longitude=longitude,
                    timezone_name=JAPAN_TIMEZONE,
                    timezone_offset=None,
                    resolved_at=None,
                )
            )
            if len(matches) >= limit:
                return matches

    return matches


def search_locations(
    query: str,
    prefecture: str | None = None,
    birth_date: str | None = None,
    birth_time: str | None = None,
    birth_time_unknown: bool = False,
    limit: int = 5,
) -> list[LocationMatch]:
    if not query.strip():
        raise ValueError("query is required")

    try:
        open_meteo_matches = _search_open_meteo(
            query=query,
            prefecture=prefecture,
            birth_date=birth_date,
            birth_time=birth_time,
            birth_time_unknown=birth_time_unknown,
            limit=limit,
        )
        if open_meteo_matches:
            return open_meteo_matches
    except Exception:
        # Fall back to a more tolerant search below.
        pass

    try:
        nominatim_matches = _search_nominatim(
            query=query,
            prefecture=prefecture,
            limit=limit,
        )
        if nominatim_matches and birth_date:
            enriched: list[LocationMatch] = []
            for match in nominatim_matches:
                timezone_offset, resolved_at = _resolve_offset_hours(
                    timezone_name=match.timezone_name,
                    birth_date=birth_date,
                    birth_time=birth_time,
                    birth_time_unknown=birth_time_unknown,
                )
                enriched.append(
                    LocationMatch(
                        query=match.query,
                        display_name=match.display_name,
                        latitude=match.latitude,
                        longitude=match.longitude,
                        timezone_name=match.timezone_name,
                        timezone_offset=timezone_offset,
                        resolved_at=resolved_at,
                    )
                )
            return enriched
        return nominatim_matches
    except Exception as exc:
        raise ValueError(
            "出生地検索に失敗しました。しばらくして再試行するか、緯度・経度を手入力してください。"
        ) from exc


def resolve_timezone_offset(
    timezone_name: str,
    birth_date: str,
    birth_time: str | None,
    birth_time_unknown: bool,
) -> tuple[float, datetime]:
    return _resolve_offset_hours(
        timezone_name=timezone_name,
        birth_date=birth_date,
        birth_time=birth_time,
        birth_time_unknown=birth_time_unknown,
    )
