import unittest
from unittest.mock import patch
from datetime import datetime,timedelta,timezone
from backend.tests.test_v3_access import local_test_client
from backend.v3.app import create_app
from backend.v3.access import AccessContext,get_access_context

class AspectDetailTests(unittest.TestCase):
    def setUp(self):
        self.app=create_app(auth_mode='local_test')
        self.app.dependency_overrides[get_access_context]=lambda:AccessContext(user_id='owner',entitlement='owner')
        self.client=local_test_client(self.app)
        self.client.headers['origin']='http://127.0.0.1:5176'
        self.payload=dict(transit_planet='SATURN',natal_planet='SUN',angle=90,natal_house=5,retrograde=True,orb_status='Separating')
    def test_paid_reads_detailed_column_using_existing_matcher(self):
        with patch('backend.v3.routes.legacy.reading_service.get_aspect_interpretation',return_value={'Text_Description':'個別詳細','timeline_advise':'無料代表'}) as lookup:
            result=self.client.post('/api/v3/aspect-interpretation-detail',json=self.payload)
            self.assertEqual(result.status_code,200)
            self.assertEqual(result.json(),{'description':'個別詳細'})
            lookup.assert_called_once_with(t_planet='SATURN',n_planet='SUN',angle=90,house=5,is_retrograde=True,orb_status='Separating')
    def test_unpaid_never_receives_detailed_text(self):
        for ctx,code in [(AccessContext(),401),(AccessContext(user_id='free'),403),(AccessContext(user_id='expired',entitlement='active',valid_until=datetime.now(timezone.utc)-timedelta(days=1)),403)]:
            self.app.dependency_overrides[get_access_context]=lambda:ctx
            with patch('backend.v3.routes.legacy.reading_service.get_aspect_interpretation') as lookup:
                self.assertEqual(self.client.post('/api/v3/aspect-interpretation-detail',json=self.payload).status_code,code)
                lookup.assert_not_called()
    def test_invalid_house_and_origin_rejected(self):
        self.assertEqual(self.client.post('/api/v3/aspect-interpretation-detail',json={**self.payload,'natal_house':13}).status_code,422)
        self.assertEqual(self.client.post('/api/v3/aspect-interpretation-detail',json=self.payload,headers={'origin':'https://example.com'}).status_code,403)
