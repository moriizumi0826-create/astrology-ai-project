import unittest
from types import SimpleNamespace
from unittest.mock import Mock
from backend.tests.test_v3_access import local_test_client
from backend.v3.app import create_app
from backend.v3.access import AccessContext, get_access_context
from backend.v3.profiles import identity

OWNER='11111111-1111-4111-8111-111111111111'
NOTE='22222222-2222-4222-8222-222222222222'

class CalendarNotesTests(unittest.TestCase):
    def setUp(self):
        self.app=create_app(auth_mode='local_test')
        self.app.dependency_overrides[identity]=lambda:(OWNER,'token')
        self.app.dependency_overrides[get_access_context]=lambda:AccessContext(user_id=OWNER,entitlement='owner')
        self.auth=Mock();self.auth.request.return_value=[]
        self.store=Mock(configured=True)
        self.store.request.return_value={'saved':{'id':NOTE,'content':'メモ','note_date':'2026-09-30','revision':1}}
        self.app.state.supabase_auth=self.auth
        self.app.state.billing=SimpleNamespace(store=self.store)
        self.client=local_test_client(self.app)
        self.client.headers['origin']='http://127.0.0.1:5176'
        self.payload={'note_date':'2026-09-30','content':'メモ'}

    def test_save_uses_verified_owner_not_client_identity(self):
        self.assertEqual(self.client.put('/api/v3/calendar-notes',json=self.payload).status_code,200)
        self.assertEqual(self.store.request.call_args.kwargs['json']['p_user_id'],OWNER)
        self.assertEqual(self.client.put('/api/v3/calendar-notes',json={**self.payload,'user_id':NOTE}).status_code,422)

    def test_expired_member_can_read_and_delete_but_not_write(self):
        self.app.dependency_overrides[get_access_context]=lambda:AccessContext(user_id=OWNER)
        self.assertEqual(self.client.get('/api/v3/calendar-notes').status_code,200)
        self.assertEqual(self.auth.request.call_args.kwargs['params']['user_id'],f'eq.{OWNER}')
        self.assertEqual(self.client.delete('/api/v3/calendar-notes/'+NOTE).status_code,200)
        self.assertEqual(self.auth.request.call_args.kwargs['params']['user_id'],f'eq.{OWNER}')
        self.assertEqual(self.client.put('/api/v3/calendar-notes',json=self.payload).status_code,403)
        self.store.request.assert_not_called()

    def test_limits_dates_revision_and_unicode(self):
        for content in ['','  ','文'*1001]:
            self.assertEqual(self.client.put('/api/v3/calendar-notes',json={**self.payload,'content':content}).status_code,422)
        self.assertEqual(self.client.put('/api/v3/calendar-notes',json={**self.payload,'content':'🌟'*1000}).status_code,200)
        for extra in [{'note_date':'2026-02-30'},{'id':NOTE},{'revision':1}]:
            self.assertEqual(self.client.put('/api/v3/calendar-notes',json={**self.payload,**extra}).status_code,422)

    def test_limit_and_stale_revision_are_conflicts(self):
        for error in ['limit','conflict']:
            self.store.request.return_value={'error':error}
            self.assertEqual(self.client.put('/api/v3/calendar-notes',json=self.payload).status_code,409)

    def test_mutations_require_trusted_origin(self):
        self.client.headers['origin']='https://evil.example'
        self.assertEqual(self.client.put('/api/v3/calendar-notes',json=self.payload).status_code,403)
        self.assertEqual(self.client.delete('/api/v3/calendar-notes/'+NOTE).status_code,403)
        self.store.request.assert_not_called();self.auth.request.assert_not_called()

    def test_real_identity_dependency_rejects_anonymous(self):
        del self.app.dependency_overrides[identity]
        self.app.dependency_overrides[get_access_context]=lambda:AccessContext()
        self.assertEqual(self.client.get('/api/v3/calendar-notes').status_code,401)

if __name__=='__main__':unittest.main()
