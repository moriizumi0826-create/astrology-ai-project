import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend.app.alignment_routes import router


class AlignmentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app = FastAPI()
        app.include_router(router)
        cls.client = TestClient(app)

    def payload(self, **changes):
        return dict(birth_date="1984-08-26", birth_time="19:20", birthplace="埼玉県川口市",
                    latitude=35.8078, longitude=139.7241, timezone_name="Asia/Tokyo", **changes)

    def test_real_chart_and_house_rulers(self):
        response = self.client.post('/api/alignment/chart', json=self.payload())
        self.assertEqual(response.status_code, 200, response.text)
        chart = response.json()
        self.assertEqual(len(chart['planets']), 10)
        self.assertEqual(len(chart['houses']), 12)
        self.assertEqual(chart['timezone_offset'], 9)
        sun = next(p for p in chart['planets'] if p['name'] == '太陽')
        self.assertEqual(sun['sign'], '乙女座')
        self.assertTrue(153 < sun['longitude'] < 154)
        self.assertTrue(all(h['ruler'] for h in chart['houses']))
        self.assertTrue(all(a['orb'] >= 0 for a in chart['aspects']))
        self.assertNotIn('birthplace', chart)

    def test_unknown_time_is_rejected_even_with_stale_time(self):
        response = self.client.post('/api/alignment/chart', json=self.payload(birth_time_unknown=True))
        self.assertEqual(response.status_code, 422, response.text)
        self.assertNotIn('planets', response.json())

    def test_invalid_and_future_input_rejected(self):
        for changes in [dict(latitude=91), dict(birth_date='2999-01-01'), dict(timezone_name='invalid/zone'), dict(birth_time=None)]:
            payload = self.payload()
            payload.update(changes)
            self.assertEqual(self.client.post('/api/alignment/chart', json=payload).status_code, 422)

    def test_unavailable_calculator_fails_without_inventing_chart(self):
        with patch('backend.app.alignment_routes.build_chart_rows', side_effect=RuntimeError('private details')):
            response = self.client.post('/api/alignment/chart', json=self.payload())
        self.assertEqual(response.status_code, 503)
        self.assertNotIn('private details', response.text)
        self.assertNotIn('planets', response.json())


if __name__ == '__main__':
    unittest.main()
