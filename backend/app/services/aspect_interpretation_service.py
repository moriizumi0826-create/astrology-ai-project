"""V2-only lookup for natal/natal and transit/transit aspect summaries."""

import csv
from pathlib import Path
from threading import Lock


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DATABASE_DIR = PROJECT_ROOT / "database"

_FILES = {
    "natalNatal": DATABASE_DIR / "M_Aspect_Interpretation_NatalNatal.csv",
    "transitTransit": DATABASE_DIR / "M_Aspect_Interpretation_TransitTransit.csv",
}
_cache: dict[str, dict[str, str]] | None = None
_cache_signature: tuple[tuple[str, int, int], ...] | None = None
_lock = Lock()


def _normalise_planet(value: str) -> str:
    return str(value or "").strip().upper()


def _normalise_angle(value: str) -> str:
    try:
        number = float(str(value or "").strip())
    except (TypeError, ValueError):
        return ""
    return str(int(number)) if number.is_integer() else str(number)


def _key(planet1: str, planet2: str, angle: str) -> str:
    pair = sorted((_normalise_planet(planet1), _normalise_planet(planet2)))
    return "|".join((*pair, _normalise_angle(angle)))


def _signature() -> tuple[tuple[str, int, int], ...]:
    values = []
    for name, path in sorted(_FILES.items()):
        stat = path.stat() if path.exists() else None
        values.append((name, stat.st_mtime_ns if stat else -1, stat.st_size if stat else -1))
    return tuple(values)


def _load() -> dict[str, dict[str, str]]:
    result = {name: {} for name in _FILES}
    for name, path in _FILES.items():
        if not path.exists():
            continue
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            for row in csv.DictReader(handle):
                summary = str(row.get("Summary") or "").strip()
                key = _key(row.get("planet1"), row.get("planet2"), row.get("Aspect_Angle") or row.get("aspect"))
                if key and summary:
                    result[name][key] = summary
    return result


def get_v2_aspect_interpretations() -> dict[str, dict[str, str]]:
    global _cache, _cache_signature
    signature = _signature()
    with _lock:
        if _cache is None or _cache_signature != signature:
            _cache = _load()
            _cache_signature = signature
        return {name: dict(values) for name, values in _cache.items()}
