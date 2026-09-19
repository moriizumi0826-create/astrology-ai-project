import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from fastapi import Depends
from backend.tests.test_v3_access import local_test_client
from backend.v3.access import require_paid_access
from backend.v3.app import create_app
from backend.v3.test_login import COOKIE

ORIGIN = {"Origin": "http://127.0.0.1:5176"}


class TestLocalLogin(unittest.TestCase):
    def setUp(self):
        with patch.dict("os.environ", {"V3_TEST_LOGIN_ID": "test", "V3_TEST_LOGIN_PASSWORD": "test"}):
            self.app = create_app(auth_mode="local_test")
        self.client = local_test_client(self.app)

        @self.app.get("/test-paid", dependencies=[Depends(require_paid_access)])
        def paid():
            return {"ok": True}

    def login(self, password="test", headers=None):
        return self.client.post("/api/v3/test-auth/login", json={"login_id": "test", "password": password},
                                headers=ORIGIN if headers is None else headers)

    def test_login_cookie_reload_and_logout(self):
        self.assertEqual(self.client.get("/test-paid").status_code, 401)
        result = self.login()
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["state"], "paid")
        cookie = result.headers["set-cookie"].lower()
        for flag in ("httponly", "samesite=strict", "path=/api/v3"):
            self.assertIn(flag, cookie)
        self.assertNotIn("password", result.text)
        self.assertEqual(result.headers["cache-control"], "no-store")
        self.assertEqual(self.client.get("/api/v3/session").json()["state"], "paid")
        # Cookie path intentionally excludes the test-only /test-paid route.
        token = self.client.cookies.get(COOKIE)
        self.assertEqual(self.client.get("/test-paid", headers={"Cookie": f"{COOKIE}={token}"}).status_code, 200)
        self.assertEqual(self.client.post("/api/v3/test-auth/logout", json={}, headers=ORIGIN).status_code, 200)
        self.assertEqual(self.client.get("/api/v3/session").json()["state"], "anonymous")
        self.assertEqual(self.client.get("/api/v3/session", headers={"Cookie": f"{COOKIE}={token}"}).json()["state"], "anonymous")

    def test_wrong_password_does_not_issue_cookie(self):
        response = self.login("wrong")
        self.assertEqual(response.status_code, 401)
        self.assertNotIn("set-cookie", response.headers)
        self.assertEqual(self.client.get("/api/v3/session").json()["state"], "anonymous")

    def test_origin_required_and_foreign_origin_rejected(self):
        for headers in ({}, {"Origin": "https://example.com"}, {"Origin": "null"}):
            self.assertEqual(self.login(headers=headers).status_code, 403)
            self.assertEqual(self.client.post("/api/v3/test-auth/logout", json={}, headers=headers).status_code, 403)

    def test_forged_cookie_and_restart_do_not_grant_access(self):
        self.assertEqual(self.client.get("/api/v3/session", headers={"Cookie": f"{COOKIE}=test"}).json()["state"], "anonymous")
        self.login()
        token = self.client.cookies.get(COOKIE)
        other = local_test_client(create_app(auth_mode="local_test"))
        self.assertEqual(other.get("/api/v3/session", headers={"Cookie": f"{COOKIE}={token}"}).json()["state"], "anonymous")

    def test_expired_token_and_rotation(self):
        self.login()
        first = self.client.cookies.get(COOKIE)
        self.login()
        second = self.client.cookies.get(COOKIE)
        self.assertNotEqual(first, second)
        self.assertNotIn(first, self.app.state.local_test_auth.sessions)
        self.app.state.local_test_auth.sessions[second] = datetime.now(timezone.utc) - timedelta(seconds=1)
        self.assertEqual(self.client.get("/api/v3/session").json()["state"], "anonymous")

    def test_unconfigured_login_is_disabled(self):
        self.app.state.local_test_auth.password = ""
        self.assertEqual(self.login().status_code, 503)

    def test_throttles_failed_attempts(self):
        for _ in range(10):
            self.assertEqual(self.login("wrong").status_code, 401)
        self.assertEqual(self.login().status_code, 429)

    def test_nonlocal_client_cannot_login(self):
        remote = local_test_client(self.app, "192.0.2.5")
        response = remote.post("/api/v3/test-auth/login", json={"login_id": "test", "password": "test"}, headers=ORIGIN)
        self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main()
