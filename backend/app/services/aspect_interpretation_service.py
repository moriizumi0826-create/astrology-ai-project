"""V2-only lookup for natal/natal and transit/transit aspect summaries."""

import csv
from pathlib import Path
from threading import Lock

PROJECT_ROOT = Path(__file__).resolve().parents[3]
DATABASE_DIR = PROJECT_ROOT / "database"
_FILES = {"natalNatal": DATABASE_DIR / "M_Aspect_Interpretation_NatalNatal.csv", "transitTransit": DATABASE_DIR / "M_Aspect_Interpretation_TransitTransit.csv"}
_cache = None
_cache_signature = None
_lock = Lock()

def _key(planet1, planet2, angle):
    try:
        number = float(str(angle or "").strip())
    except (TypeError, ValueError):
        return ""
    angle_value = str(int(number)) if number.is_integer() else str(number)
    return "|".join(sorted((str(planet1 or "").strip().upper(), str(planet2 or "").strip().upper())) + [angle_value])

def _signature():
    return tuple((name, path.stat().st_mtime_ns, path.stat().st_size) if path.exists() else (name, -1, -1) for name, path in sorted(_FILES.items()))

def _load():
    result = {name: {} for name in _FILES}
    for name, path in _FILES.items():
        if not path.exists():
            continue
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            for row in csv.DictReader(handle):
                key = _key(row.get("planet1"), row.get("planet2"), row.get("Aspect_Angle") or row.get("aspect"))
                summary = str(row.get("Summary") or "").strip()
                if key and summary:
                    result[name][key] = summary
    return result

def get_v2_aspect_interpretations():
    global _cache, _cache_signature
    signature = _signature()
    with _lock:
        if _cache is None or _cache_signature != signature:
            _cache, _cache_signature = _load(), signature
        return {name: dict(values) for name, values in _cache.items()}
