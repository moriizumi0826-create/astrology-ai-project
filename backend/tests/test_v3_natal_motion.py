import unittest
from unittest.mock import patch
from backend.app.services.chart_calculator import BirthInput
from backend.app.services import reading_service

class NatalMotionTests(unittest.TestCase):
    def test_existing_chart_motion_is_forwarded_without_another_calculation(self):
        birth=BirthInput(full_name='確認用',birth_date='2000-01-01',birth_time='12:00',birth_time_unknown=False,birthplace='Tokyo',latitude=35,longitude=139,timezone_offset=9)
        rows={'planets':[['水星',150,'乙女座',0,'逆行',6],['金星',180,'天秤座',0,'順行',7]],'angles':[]}
        with patch.object(reading_service,'_chart_rows_for_request',return_value=rows) as chart:
            points=reading_service._build_natal_aspect_points(birth)
        chart.assert_called_once_with(birth)
        self.assertEqual([p['retrograde'] for p in points],[True,False])
        self.assertEqual([p['longitude'] for p in points],[150,180])
