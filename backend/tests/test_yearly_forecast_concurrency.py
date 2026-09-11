import unittest
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Lock
from time import sleep
from unittest.mock import patch

from backend.app.services import yearly_forecast_service as service
from backend.app.services.chart_calculator import BirthInput


class YearlyForecastConcurrencyTests(unittest.TestCase):
    def test_simultaneous_detail_requests_compute_the_year_only_once(self):
        payload = BirthInput(
            full_name="Concurrency Test", birth_date="1984-08-26",
            birth_time="19:20", birth_time_unknown=False, birthplace="Kawaguchi",
            latitude=35.8077, longitude=139.7241, timezone_offset=9,
        )
        barrier = Barrier(3)
        calls = []
        guard = Lock()

        def compute(*args):
            with guard:
                calls.append(args)
            sleep(0.15)
            return {"year": 2026}

        def request():
            barrier.wait(timeout=5)
            return service.generate_yearly_forecast(payload, 2026)

        service._cached_yearly_forecast.cache_clear()
        self.addCleanup(service._cached_yearly_forecast.cache_clear)
        with patch.object(service.reading_service, "reload_master_dataframes_if_changed", return_value=False), \
             patch.object(service, "reload_yearly_master_caches_if_changed", return_value=False), \
             patch.object(service, "_generate_yearly_forecast_uncached", side_effect=compute), \
             ThreadPoolExecutor(max_workers=3) as executor:
            results = list(executor.map(lambda _: request(), range(3)))
        self.assertEqual(len(calls), 1)
        self.assertTrue(all(result is results[0] for result in results))
