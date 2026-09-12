import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from unittest.mock import patch
from fastapi.testclient import TestClient
from backend.app.main import app, _yearly_birth_input
from backend.app.schemas import ReadingRequest
from backend.app.services import display_time as clock, reading_service as reading, yearly_forecast_service as yearly

BASE = dict(full_name="Time test", birth_date="1990-07-15", birth_time="12:00",
    birthplace="Tokyo", latitude=35.68, longitude=139.76, timezone_name="Asia/Tokyo",
    timezone_offset=9, display_timezone_name="America/New_York")

class DisplayTimeTests(unittest.TestCase):
    def chart(self, **changes):
        response = TestClient(app).post("/api/transit-chart", json={**BASE, "target_date":"2026-07-15", "target_time":"12:00", **changes})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_target_date_dst_and_same_instant_utc(self):
        for day, offset, hour in [("2026-01-15",-5,"17:00"), ("2026-07-15",-4,"16:00")]:
            local = self.chart(target_date=day)
            utc = self.chart(target_date=day, target_time=hour, display_timezone_name="UTC")
            self.assertEqual(local["timezone_offset"], offset)
            self.assertEqual(local["utc_datetime"], day+"T"+hour+":00Z")
            self.assertEqual(local["transits"], utc["transits"])
            self.assertEqual(local["house_cusps"], utc["house_cusps"])

    def test_batch_gap_and_overlap_are_explicit(self):
        dates = ["2026-03-07", "2026-03-08", "2026-03-09"]
        response = TestClient(app).post("/api/transit-charts", json={**BASE, "target_dates":dates, "target_time":"02:30"})
        self.assertEqual(response.status_code,200)
        charts = response.json()["charts"]
        self.assertEqual([x["timezone_offset"] for x in charts],[-5,-5,-4])
        self.assertIn("03:30", charts[1]["time_adjustment"])
        for chart in charts:
            self.assertEqual(chart, self.chart(target_date=chart["date"],target_time="02:30"))
        overlap = self.chart(target_date="2026-11-01",target_time="01:30")
        self.assertEqual(overlap["utc_datetime"],"2026-11-01T05:30:00Z")
        self.assertIn("1回目", overlap["time_adjustment"])

    def test_natal_unchanged(self):
        rows=[]
        for zone in ["Asia/Tokyo", "UTC", "America/New_York"]:
            with clock.display_scope(zone):
                birth=reading._birth_input_from_request(ReadingRequest(**{**BASE,"display_timezone_name":zone}))
                self.assertEqual(birth.timezone_offset,9)
                rows.append(reading.build_chart_rows(birth))
        self.assertEqual(rows[0],rows[1])
        self.assertEqual(rows[1],rows[2])

    def test_scopes_do_not_leak_between_users(self):
        def calculate(zone):
            with clock.display_scope(zone):
                return clock.transit_utc(datetime(2026,7,15,12),9)
        with ThreadPoolExecutor(max_workers=2) as pool:
            results=list(pool.map(calculate,["America/New_York","Asia/Tokyo"]*4))
        self.assertEqual(results[0],datetime(2026,7,15,16))
        self.assertEqual(results[1],datetime(2026,7,15,3))
        with self.assertRaises(RuntimeError):
            with clock.display_scope("UTC"):
                raise RuntimeError("test")
        self.assertIsNone(clock.zone_name())

    def test_today_follows_local_day(self):
        class Frozen(datetime):
            @classmethod
            def now(cls,tz=None):
                return datetime(2026,9,12,1,tzinfo=timezone.utc).astimezone(tz)
        with patch.object(clock,"datetime",Frozen):
            with clock.display_scope("America/Los_Angeles"):
                self.assertEqual(reading._app_today(),date(2026,9,11))
                payload=ReadingRequest(**{**BASE,"target_date":"2026-09-11"})
                self.assertEqual(reading._reading_current_datetime(payload),datetime(2026,9,11,18))
            with clock.display_scope("Asia/Tokyo"):
                self.assertEqual(reading._app_today(),date(2026,9,12))

    def test_motion_matches_utc(self):
        with clock.display_scope("America/New_York"):
            local=reading._calc_transit_planet_motion("MOON",datetime(2026,7,15,12),9)
        with clock.display_scope("UTC"):
            utc=reading._calc_transit_planet_motion("MOON",datetime(2026,7,15,16),9)
        self.assertEqual(local,utc)

    def test_jst_calendar_converted_before_date_filter(self):
        row={"Event_Date":"2026-09-12","Event_DateTime_JST":"2026-09-12T01:00:00","Planet":"MERCURY"}
        with clock.display_scope("America/Los_Angeles"):
            local=clock.local_calendar_row(row)
            self.assertEqual(local["Event_Date"],"2026-09-11")
            self.assertEqual(local["Event_DateTime_Local"],"2026-09-11T09:00:00")
            with patch.object(reading,"_ensure_calendar_indexes"),patch.object(reading,"_RETROGRADE_CALENDAR_INDEX",{("",""):((date(2026,9,12),row),)}):
                self.assertEqual(reading._retrograde_calendar_rows(date(2026,9,12)),[])
        self.assertEqual(row["Event_Date"],"2026-09-12")

    def test_event_elapsed_hours_and_offsets_across_dst(self):
        with clock.display_scope("America/New_York"):
            item=reading._celestial_event_item(event_type="test",event_dt=datetime(2026,3,8,12),
                start_dt=datetime(2026,3,7,12),title="test",note="",priority=1)
            self.assertEqual(item["hours_remaining"],23)
            self.assertEqual(clock.event_times(item)["event_datetime"],"2026-03-08T12:00:00-04:00")

    def test_yearly_cache_separates_zones(self):
        yearly._cached_yearly_forecast.cache_clear()
        try:
            with patch.object(yearly,"_generate_yearly_forecast_uncached",side_effect=lambda birth,year:{"zone":clock.zone_name()}):
                for zone in ["Asia/Tokyo","America/New_York"]:
                    result=yearly.generate_yearly_forecast(_yearly_birth_input(ReadingRequest(**{**BASE,"display_timezone_name":zone})))
                    self.assertEqual(result["zone"],zone)
        finally:
            yearly._cached_yearly_forecast.cache_clear()

    def test_event_refinement_uses_continuous_utc_axis_at_dst(self):
        with clock.display_scope("America/New_York"):
            midpoint = clock.transit_midpoint(datetime(2026,3,8,1), datetime(2026,3,8,4), 9)
            self.assertEqual(midpoint, datetime(2026,3,8,3))
            midpoint = clock.transit_midpoint(datetime(2026,11,1,0), datetime(2026,11,1,3), 9)
            self.assertEqual(midpoint, datetime(2026,11,1,1))
            self.assertEqual(midpoint.fold, 1)
            item = reading._celestial_event_item(event_type="test", event_dt=midpoint,
                start_dt=datetime(2026,11,1,0), title="test", note="", priority=1)
            self.assertEqual(clock.event_times(item)["event_datetime"], "2026-11-01T01:00:00-05:00")
            self.assertEqual(clock.event_times({"event_datetime":""}), {"event_datetime":""})

    def test_invalid_zone_and_legacy(self):
        result=TestClient(app).post("/api/transit-chart",json={**BASE,"target_date":"2026-09-12","display_timezone_name":"Invalid/Zone"})
        self.assertEqual(result.status_code,422)
        self.assertEqual(self.chart(display_timezone_name=None)["timezone_offset"],9)

if __name__=="__main__":
    unittest.main()
