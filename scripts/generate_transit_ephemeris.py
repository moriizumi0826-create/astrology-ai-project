"""Generate the 2026 hourly 3D-map cache with the backend's Swiss Ephemeris."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.app.services import transit_ephemeris as cache


def generate(output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / f"transit_hourly_{cache.YEAR}.csv"
    if path.exists() or path.with_suffix(".json").exists():
        raise FileExistsError("Use a new output directory, then review before replacing existing data")
    current = datetime(cache.YEAR, 1, 1)
    end = datetime(cache.YEAR + 1, 1, 1)
    flags_by_planet = {}
    with path.open("x", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(cache.HEADER)
        while current < end:
            row = [current.strftime("%Y-%m-%dT%H:%M:%SZ")]
            for name, planet_id in zip(cache.PLANETS, cache.planet_ids()):
                result, flags = cache.swe.calc_ut(cache.julian_day(current), planet_id, cache.swe.FLG_SPEED)
                if flags_by_planet.setdefault(name, flags) != flags:
                    raise ValueError(f"Calculation engine changed during generation: {name}")
                row.extend((result[0] % 360, result[3]))
            writer.writerow(row)
            current += timedelta(hours=1)
    metadata = {
        "schema_version": 1,
        "swisseph_version": cache.swe.version,
        "requested_flags": cache.swe.FLG_SPEED,
        "returned_flags": flags_by_planet,
        "timezone": "UTC",
        "longitude_unit": "degree",
        "speed_unit": "degree/day",
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
    }
    path.with_suffix(".json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    return path


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=cache.DATA_DIR)
    args = parser.parse_args()
    print(generate(args.output_dir))
