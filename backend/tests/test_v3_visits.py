import unittest
from types import SimpleNamespace
from unittest.mock import Mock

from backend.tests.test_v3_access import local_test_client
from backend.v3.app import create_app

VISITOR = 'f37a8ec9-c8a7-4bc9-95e8-c0d680c33eb9'


class VisitTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(auth_mode='local_test')
        self.app.state.v3_allowed_origins = {'https://thecelestialatelier.com'}
        self.app.state.v3_environment = 'production'
        self.store = Mock(configured=True)
        self.app.state.billing = SimpleNamespace(store=self.store)
        self.client = local_test_client(self.app)
        self.headers = {'Origin': 'https://thecelestialatelier.com'}

    def test_anonymous_visit_passes_only_uuid_to_server_dated_rpc(self):
        for _ in range(2):
            result = self.client.post('/api/v3/visits', json={'visitor_id': VISITOR}, headers=self.headers)
            self.assertEqual(result.status_code, 200)
        self.store.request.assert_called_with('POST', 'rpc/v3_record_visit', json={'p_visitor_id': VISITOR})
        self.assertEqual(self.client.get('/api/v3/visits').status_code, 405)

    def test_bad_origin_and_extra_personal_fields_are_rejected(self):
        self.assertEqual(self.client.post('/api/v3/visits', json={'visitor_id': VISITOR}).status_code, 403)
        for body in [{'visitor_id': 'bad'}, {'visitor_id': VISITOR, 'email': 'test@example.com'}]:
            self.assertEqual(self.client.post('/api/v3/visits', json=body, headers=self.headers).status_code, 422)
        self.store.request.assert_not_called()

    def test_nonproduction_does_not_write_and_request_flood_is_limited(self):
        self.app.state.v3_environment = 'preview'
        result = self.client.post('/api/v3/visits', json={'visitor_id': VISITOR}, headers=self.headers)
        self.assertFalse(result.json()['recorded']); self.store.request.assert_not_called()
        self.app.state.v3_environment = 'production'
        for _ in range(29):
            self.client.post('/api/v3/visits', json={'visitor_id': VISITOR}, headers=self.headers)
        self.assertEqual(self.client.post('/api/v3/visits', json={'visitor_id': VISITOR}, headers=self.headers).status_code, 429)
