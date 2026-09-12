"""Read-only hourly cache for 3D transit charts (not natal/forecast readings)."""
from __future__ import annotations

import csv
import hashlib
import json
import logging
import math
import os
from datetime import datetime, timedelta
from functools import lru_cache
from pathlib import Path

try:
    import swisseph as swe
except ModuleNotFoundError:
    swe = None

LOGGER = logging.getLogger(__name__)
DATA_DIR = Path(__file__).resolve().parents[3] / "database" / "ephemeris"
YEAR = 2026
PLANETS = ("SUN", "MOON", "MERCURY", "VENUS", "MARS", "JUPITER", "SATURN", "URANUS", "NEPTUNE", "PLUTO", "NORTH_NODE")
HEADER = ["utc_datetime", *[f"{planet}_{field}" for planet in PLANETS for field in ("longitude", "speed")]]


def cache_enabled() -> bool:
    return os.environ.get("TRANSIT_EPHEMERIS_CACHE_ENABLED", "1").lower() not in {"0", "false", "off"}


def planet_ids() -> tuple[int, ...]:
    return tuple(getattr(swe, "TRUE_NODE" if name == "NORTH_NODE" else name) for name in PLANETS)


def julian_day(utc_dt: datetime) -> float:
    return swe.julday(utc_dt.year, utc_dt.month, utc_dt.day, utc_dt.hour + utc_dt.minute / 60 + utc_dt.second / 3600)


@lru_cache(maxsize=1)
def load_hourly_cache() -> dict[datetime, tuple[float, ...]]:
    """Load once per process; reject incomplete, corrupt or incompatible data."""
    if swe is None:
        return {}
    path = DATA_DIR / f"transit_hourly_{YEAR}.csv"
    try:
        metadata = json.loads(path.with_suffix(".json").read_text(encoding="utf-8"))
        raw = path.read_bytes()
        if metadata["schema_version"] != 1 or metadata["swisseph_version"] != swe.version:
            raise ValueError("ephemeris schema/library version mismatch")
        if metadata["sha256"] != hashlib.sha256(raw).hexdigest():
            raise ValueError("ephemeris checksum mismatch")
        reader = csv.reader(raw.decode("utf-8").splitlines())
        if next(reader) != HEADER:
            raise ValueError("ephemeris columns mismatch")
        rows = {}
        expected = datetime(YEAR, 1, 1)
        end = datetime(YEAR + 1, 1, 1)
        for row in reader:
            stamp = datetime.strptime(row[0], "%Y-%m-%dT%H:%M:%SZ")
            values = tuple(float(value) for value in row[1:])
            if stamp != expected or stamp >= end or len(values) != len(PLANETS) * 2:
                raise ValueError("ephemeris hourly sequence mismatch")
            if not all(math.isfinite(value) for value in values) or not all(0 <= value < 360 for value in values[::2]):
                raise ValueError("invalid ephemeris value")
            rows[stamp] = values
            expected += timedelta(hours=1)
        if expected != end:
            raise ValueError("incomplete ephemeris year")
        # Different installed ephemeris files can change the engine even with the
        # same library version. Compare samples before using a generated cache.
        for stamp in (datetime(YEAR, 1, 1), datetime(YEAR, 7, 1), end - timedelta(hours=1)):
            for index, planet_id in enumerate(planet_ids()):
                result, flags = swe.calc_ut(julian_day(stamp), planet_id, swe.FLG_SPEED)
                if flags != metadata["returned_flags"][PLANETS[index]]:
                    raise ValueError("ephemeris calculation engine mismatch")
                if abs(rows[stamp][index * 2] - result[0] % 360) > 1e-8 or abs(rows[stamp][index * 2 + 1] - result[3]) > 1e-8:
                    raise ValueError("ephemeris sample mismatch")
        LOGGER.info("Loaded %s hourly transit rows", len(rows))
        return rows
    except (OSError, ValueError, KeyError, IndexError, TypeError, StopIteration, csv.Error) as exc:
        LOGGER.warning("Hourly transit cache unavailable; using direct calculation: %s", exc)
        return {}


def cached_states(local_dt: datetime, timezone_offset: float) -> tuple[float, ...] | None:
    if not cache_enabled():
        return None
    utc_dt = local_dt - timedelta(hours=timezone_offset)
    # Do not round or interpolate: preserve the selected ten-minute time exactly.
    if utc_dt.year != YEAR or utc_dt.minute or utc_dt.second or utc_dt.microsecond:
        return None
    return load_hourly_cache().get(utc_dt)
