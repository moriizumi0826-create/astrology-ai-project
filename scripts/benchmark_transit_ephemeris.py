"""Local CPU benchmark, excluding HTTP/network/browser time."""
import json
import os
import sys
from datetime import date, time
from pathlib import Path
from statistics import median
from time import perf_counter

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.app.services import transit_ephemeris as cache
from backend.app.services.chart_calculator import BirthInput
from backend.app.services.yearly_forecast_service import build_transit_chart


def main():
    start = perf_counter()
    rows = cache.load_hourly_cache()
    load_ms = (perf_counter() - start) * 1000
    if len(rows) != 8760:
        raise RuntimeError("2026 cache is not usable in this environment")
    retained_bytes = sys.getsizeof(rows) + sum(sys.getsizeof(k) + sys.getsizeof(v) + sum(map(sys.getsizeof, v)) for k, v in rows.items())
    birth = BirthInput("Benchmark", "1990-01-01", "12:00", False, "Tokyo", 35.6762, 139.6503, 9)
    timings = {}
    for enabled in (False, True):
        os.environ["TRANSIT_EPHEMERIS_CACHE_ENABLED"] = str(int(enabled))
        samples = []
        for _ in range(30):
            start = perf_counter()
            for day in range(1, 31):
                build_transit_chart(birth, date(2026, 9, day), time(12))
            samples.append((perf_counter() - start) * 1000)
        timings["cached" if enabled else "direct"] = round(median(samples), 3)
    print(json.dumps({"rows": len(rows), "csv_bytes": (cache.DATA_DIR / "transit_hourly_2026.csv").stat().st_size,
                      "load_ms": round(load_ms, 3), "retained_python_bytes": retained_bytes,
                      "30_days_median_ms": timings}, indent=2))


if __name__ == "__main__":
    main()
