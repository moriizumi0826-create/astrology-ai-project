import unittest
from datetime import date
from unittest.mock import patch
from backend.app.services import reading_service as reading
from backend.app.services.display_time import display_scope
from backend.tests.test_v3_access import local_test_client
from backend.v3.app import create_app
from backend.v3.access import AccessContext, get_access_context

PAST={'Planet':'MERCURY','Planet_Label':'水星','Event_Type':'RETROGRADE_START','Event_Date':'2026-01-01','Event_DateTime_JST':'2026-01-01T01:00:00'}
FUTURE={'Planet':'SATURN','Planet_Label':'土星','Event_Type':'DIRECT_START','Event_Date':'2030-12-01','Event_DateTime_JST':'2030-12-01T12:00:00'}

class RetrogradeCalendarTests(unittest.TestCase):
    def setUp(self):
        indexes={('',''):((date(2026,1,1),PAST),(date(2030,12,1),FUTURE))}
        for target,value in [('_ensure_calendar_indexes',None),('_RETROGRADE_CALENDAR_INDEX',indexes)]:
            mock=patch.object(reading,target,return_value=None) if value is None else patch.object(reading,target,value)
            mock.start();self.addCleanup(mock.stop)

    def test_all_history_survives_reference_date_while_future_lookup_is_unchanged(self):
        for day in [date(2026,10,18),date(2032,1,1)]:
            rows=reading._dashboard_retrograde_calendar(day,include_past=True)
            self.assertEqual([r['event_date'] for r in rows],['2026-01-01','2030-12-01'])
        self.assertEqual([r['Event_Date'] for r in reading._retrograde_calendar_rows(date(2026,10,18))],['2030-12-01'])
        self.assertEqual(reading._retrograde_calendar_rows(date(2032,1,1)),[])

    def test_all_history_keeps_local_timezone_conversion(self):
        with display_scope('America/Los_Angeles'):
            rows=reading._dashboard_retrograde_calendar(date(2026,10,18),include_past=True)
        self.assertEqual(rows[0]['event_date'],'2025-12-31')
        self.assertEqual(PAST['Event_Date'],'2026-01-01')

    def test_fresh_paid_endpoint_returns_full_calendar_without_reading_calculation(self):
        app=create_app(auth_mode='local_test')
        app.dependency_overrides[get_access_context]=lambda:AccessContext('owner','owner')
        client=local_test_client(app)
        with patch.object(reading,'generate_readings') as calculate:
            result=client.get('/api/v3/retrograde-calendar?display_timezone_name=Asia/Tokyo')
            self.assertEqual(result.status_code,200)
            self.assertEqual(len(result.json()['events']),2)
            calculate.assert_not_called()
        self.assertEqual(client.get('/api/v3/retrograde-calendar?display_timezone_name=not_a_zone').status_code,422)
        app.dependency_overrides[get_access_context]=lambda:AccessContext('free')
        self.assertEqual(client.get('/api/v3/retrograde-calendar').status_code,403)
