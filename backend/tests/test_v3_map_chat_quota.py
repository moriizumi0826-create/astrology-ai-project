import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from types import SimpleNamespace
from unittest.mock import Mock
from starlette.requests import Request
from fastapi import HTTPException
from backend.v3.map_chat_quota import LocalChatQuota, quota
from backend.v3.supabase_auth import SupabaseAuth


class SupabaseQuotaIdentityTests(unittest.TestCase):
    def test_actual_auth_identity_reaches_rpc_as_uuid(self):
        subject = str(uuid4())
        auth = SupabaseAuth.__new__(SupabaseAuth)
        auth.project = 'productionproject'
        auth.request = Mock(return_value={'id': subject, 'email_confirmed_at': '2026-10-01'})
        store = SimpleNamespace(configured=True, request=Mock(return_value={'remaining': 20}))
        app = SimpleNamespace(state=SimpleNamespace(v3_environment='production', billing=SimpleNamespace(store=store)))
        request = Request({'type': 'http', 'app': app, 'headers': [(b'authorization', b'Bearer test-token')]})
        user = auth.authenticate(request)
        for action in ('status', 'reserve', 'success', 'failure'):
            token = str(uuid4()) if action != 'status' else None
            self.assertEqual(quota(request, user, action, token)['remaining'], 20)
            store.request.assert_called_with('POST', 'rpc/v3_map_chat_quota',
                json={'p_user_id': subject, 'p_action': action, 'p_token': token, 'p_limit': 20})

    def test_malformed_identity_does_not_call_store(self):
        store = SimpleNamespace(configured=True, request=Mock())
        request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(
            v3_environment='production', billing=SimpleNamespace(store=store))))
        for user in ('supabase:not-a-uuid', 'supabase:project:not-a-uuid', 'supabase::' + str(uuid4())):
            with self.assertRaises(HTTPException) as error:
                quota(request, user)
            self.assertEqual(error.exception.status_code, 401)
        store.request.assert_not_called()

    def test_production_never_accepts_local_test_quota_exemption(self):
        store = SimpleNamespace(configured=True, request=Mock())
        request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(
            v3_environment='production', local_test_auth=object(), billing=SimpleNamespace(store=store))))
        with self.assertRaises(HTTPException):
            quota(request, 'local-test-user')
        store.request.assert_not_called()


class ChatQuotaTests(unittest.TestCase):
    def setUp(self):
        self.now=datetime(2026,10,1,14,59,59,tzinfo=timezone.utc)
        self.quota=LocalChatQuota(lambda:self.now)

    def call(self,action='status',token=None,user='a'):
        return self.quota.call(user,action,token,20)

    def test_parallel_reservations_never_exceed_twenty(self):
        with ThreadPoolExecutor(max_workers=30) as pool:
            results=list(pool.map(lambda _:self.call('reserve',str(uuid4())),range(50)))
        self.assertEqual(sum(r['error'] is None for r in results),20)
        self.assertEqual(self.call()['remaining'],0)
        self.assertEqual(self.call(user='b')['remaining'],20)

    def test_success_idempotency_failure_and_lease_expiry(self):
        self.now-=timedelta(hours=1)
        self.call('reserve','x');self.call('success','x');self.call('success','x');self.call('failure','x')
        self.assertEqual(self.call()['used'],1)
        self.call('reserve','y');self.call('failure','y')
        self.assertEqual(self.call()['remaining'],19)
        self.call('reserve','z')
        self.now+=timedelta(minutes=11)
        self.assertEqual(self.call('success','z')['error'],'expired')
        self.assertEqual(self.call()['remaining'],19)

    def test_jst_midnight_and_inflight_previous_day(self):
        self.call('reserve','x')
        self.assertEqual(self.call()['date'],'2026-10-01')
        self.assertEqual(self.call()['reset_at'],'2026-10-02T00:00:00+09:00')
        self.now+=timedelta(seconds=2)
        self.assertEqual(self.call()['remaining'],20)
        self.call('success','x')
        self.assertEqual(self.call()['used'],0)
        self.assertTrue(self.quota.rows['x']['success'])

    def test_other_account_cannot_finalize_reservation(self):
        self.call('reserve','x')
        self.assertEqual(self.call('success','x',user='b')['error'],'expired')
        self.assertEqual(self.call()['reserved'],1)
