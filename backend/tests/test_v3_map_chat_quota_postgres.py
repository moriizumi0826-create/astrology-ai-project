"""Opt-in integration test on a NEW disposable loopback database only.

V3_QUOTA_TEST_PSQL=path to psql, V3_QUOTA_TEST_PORT=isolated local PostgreSQL port.
The database named v3_chat_quota_test must be empty. Never runs against Supabase.
"""
import json
import os
from pathlib import Path
import subprocess
import unittest
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4


@unittest.skipUnless(os.getenv('V3_QUOTA_TEST_PSQL') and os.getenv('V3_QUOTA_TEST_PORT'), 'isolated PostgreSQL not configured')
class PostgresChatQuotaTests(unittest.TestCase):
    @classmethod
    def sql(cls,sql=None,file=None,check=True):
        args=[os.environ['V3_QUOTA_TEST_PSQL'],'-X','-w','-h','127.0.0.1','-p',os.environ['V3_QUOTA_TEST_PORT'],
              '-U','postgres','-d','v3_chat_quota_test','-v','ON_ERROR_STOP=1','-At']
        return subprocess.run(args+(['-f',str(file)] if file else ['-c',sql]),capture_output=True,text=True,encoding='utf-8',check=check)

    @classmethod
    def setUpClass(cls):
        cls.sql("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);")
        cls.sql(file=Path(__file__).resolve().parents[1]/'v3/sql/010_map_chat_quota.sql')

    def setUp(self):
        self.user=str(uuid4())
        self.sql(f"insert into auth.users values('{self.user}');")

    def call(self,action='status',token=None,user=None):
        token=f"'{token}'" if token else 'null'
        result=self.sql(f"set role service_role;select public.v3_map_chat_quota('{user or self.user}','{action}',{token},20);")
        return json.loads(result.stdout.strip().splitlines()[-1])

    def test_real_concurrent_reservations_success_and_release(self):
        tokens=[str(uuid4()) for _ in range(30)]
        with ThreadPoolExecutor(max_workers=12) as pool:
            results=list(pool.map(lambda token:self.call('reserve',token),tokens))
        accepted=[token for token,result in zip(tokens,results) if result['error'] is None]
        self.assertEqual(len(accepted),20)
        self.assertEqual(self.call()['remaining'],0)
        self.call('success',accepted[0]);self.call('success',accepted[0]);self.call('failure',accepted[0])
        self.assertEqual(self.call()['used'],1)
        self.call('failure',accepted[1])
        self.assertEqual(self.call()['remaining'],1)

    def test_expired_pending_cannot_commit_but_completed_is_preserved(self):
        token=str(uuid4());self.call('reserve',token)
        self.sql(f"update public.v3_map_chat_usage set expires_at=now()-interval '1 second' where token='{token}';")
        self.assertEqual(self.call('success',token)['error'],'expired')
        self.assertEqual(self.call()['remaining'],20)

    def test_daily_boundary_and_account_isolation(self):
        token=str(uuid4());self.call('reserve',token)
        other=str(uuid4());self.sql(f"insert into auth.users values('{other}');")
        self.assertEqual(self.call('success',token,user=other)['error'],'expired')
        self.assertEqual(self.call(user=other)['remaining'],20)
        self.sql(f"update public.v3_map_chat_usage set usage_date=usage_date-1 where token='{token}';")
        self.assertEqual(self.call('success',token)['remaining'],20)
        self.assertEqual(self.sql(f"select succeeded from public.v3_map_chat_usage where token='{token}';").stdout.strip(),'t')

    def test_public_roles_cannot_read_or_invoke_quota(self):
        for role in ['anon','authenticated']:
            result=self.sql(f"set role {role};select * from public.v3_map_chat_usage;",check=False)
            self.assertNotEqual(result.returncode,0)
            result=self.sql(f"set role {role};select public.v3_map_chat_quota('{self.user}','status',null,20);",check=False)
            self.assertNotEqual(result.returncode,0)
