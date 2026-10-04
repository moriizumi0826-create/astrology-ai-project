import unittest
from datetime import time
from unittest.mock import patch
from starlette.requests import Request
from pydantic import ValidationError
from backend.app.schemas import TransitChartRequest, TransitChartsRequest
from backend.v3.routes import V3TransitChartRequest, single_chart
from backend.v3.map_assistant import MapContext, _model_screen

FORM = dict(full_name='test',birth_date='1990-01-01',birth_time='12:00',birthplace='Tokyo',latitude=35.68,longitude=139.76,timezone_offset=9,display_timezone_name='Asia/Tokyo',target_date='2026-10-04',target_time='07:54:13')

class CalendarMapTests(unittest.TestCase):
    def test_v3_exact_seconds_do_not_change_legacy_or_bulk_contract(self):
        self.assertEqual(V3TransitChartRequest(**FORM).target_time,time(7,54,13))
        with self.assertRaises(ValidationError): TransitChartRequest(**FORM)
        with self.assertRaises(ValidationError): TransitChartsRequest(**{**FORM,'target_dates':['2026-10-04']})

    def test_exact_event_calculated_in_utc_then_labeled_locally(self):
        payload=V3TransitChartRequest(**FORM,target_utc_datetime='2026-10-03T22:54:13Z')
        request=Request({'type':'http','headers':[]})
        with patch('backend.v3.routes.check_request_limit'), patch('backend.v3.routes.legacy.create_transit_chart',return_value={'utc_datetime':'2026-10-03T22:54:13Z','transits':[]}) as build:
            result=single_chart(payload,request)
            actual=build.call_args.args[0]
            self.assertEqual(actual.display_timezone_name,'UTC')
            self.assertEqual(actual.target_date.isoformat(),'2026-10-03')
            self.assertEqual(actual.target_time,time(22,54,13))
            self.assertEqual(result['date'],'2026-10-04'); self.assertEqual(result['time'],'07:54:13')
            self.assertEqual(result['timezone_offset'],9)

    def test_dst_duplicate_clock_selects_correct_utc_instant(self):
        for instant in ['2026-11-01T05:30:00Z','2026-11-01T06:30:00Z']:
            p=V3TransitChartRequest(**{**FORM,'display_timezone_name':'America/New_York','target_date':'2026-11-01','target_time':'01:30:00','target_utc_datetime':instant})
            self.assertEqual(p.target_utc_datetime.isoformat(),instant.replace('Z','+00:00'))

    def test_mismatched_or_timezone_free_instants_rejected(self):
        for instant in ['2026-10-03T22:55:13Z','2026-10-03T22:54:13']:
            with self.assertRaises(ValidationError): V3TransitChartRequest(**FORM,target_utc_datetime=instant)

    def test_event_context_reaches_model_without_new_tools(self):
        event=dict(title='満月',type='full_moon',date='2026-10-04',time='07:54:13',approximate=False)
        screen=_model_screen(MapContext(selected_event=event))
        self.assertEqual(screen['selected_event']['title'],'満月')
        self.assertEqual(screen['selected_event']['date'],'2026-10-04')
        self.assertNotIn('selected_event',_model_screen(MapContext()))
