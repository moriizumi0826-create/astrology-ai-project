"""Auth boundary tests with mocked Supabase HTTP; never create remote users."""
import os
import unittest
from unittest.mock import patch

import httpx

from backend.tests.test_v3_access import local_test_client
from backend.v3.app import create_app

USER = "00000000-0000-4000-8000-000000000001"
OTHER = "00000000-0000-4000-8000-000000000002"
FORM = {"full_name": "Test", "birth_date": "1984-08-26", "birth_time": "19:20",
        "birthplace": "Tokyo", "latitude": 35.68, "longitude": 139.76, "timezone_name": "Asia/Tokyo"}
HEADERS = {"Authorization": "Bearer test-token", "Origin": "http://127.0.0.1:5176"}


class SupabaseTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {"V3_SUPABASE_URL": "https://test.supabase.co",
            "V3_SUPABASE_PUBLISHABLE_KEY": "sb_publishable_test",
            "V3_SUPABASE_SECRET_KEY": "", "V3_STRIPE_SECRET_KEY": "",
            "V3_STRIPE_WEBHOOK_SECRET": "", "V3_STRIPE_PRICE_JPY": "",
            "V3_STRIPE_PRICE_USD": ""})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.client = local_test_client(create_app())
        self.http = patch("backend.v3.supabase_auth.httpx.request").start()
        self.addCleanup(patch.stopall)

    def user(self, **overrides):
        return httpx.Response(200, json={"id": USER, "email_confirmed_at": "2026-09-19T00:00:00Z", **overrides})

    def test_anonymous_cannot_read_or_write_profiles(self):
        self.assertEqual(self.client.get("/api/v3/profile").status_code, 401)
        self.assertEqual(self.client.put("/api/v3/profile", json={"profile": FORM}).status_code, 401)
        self.assertEqual(self.client.delete("/api/v3/profile").status_code, 401)
        self.http.assert_not_called()

    def test_metadata_cannot_grant_paid_access_and_test_login_disabled(self):
        self.http.return_value = self.user(user_metadata={"plan": "paid", "user_id": OTHER})
        response = self.client.get("/api/v3/session?plan=paid", headers=HEADERS)
        self.assertEqual(response.json()["state"], "free")
        self.assertEqual(response.json()["user_id"], f"supabase:test:{USER}")
        self.assertEqual(self.client.post("/api/v3/auth/test-login", json={}).status_code, 404)
        self.assertEqual(self.client.post("/api/v3/paid-reading", headers=HEADERS, json=FORM).status_code, 403)

    def test_invalid_unconfirmed_and_unavailable_auth_fail_closed(self):
        for remote, expected in [(httpx.Response(401, json={}), 401),
                                 (self.user(email_confirmed_at=None), 403),
                                 (self.user(is_anonymous=True), 403),
                                 (httpx.Response(503, json={}), 503)]:
            self.http.return_value = remote
            self.assertEqual(self.client.get("/api/v3/session", headers=HEADERS).status_code, expected)
        self.http.side_effect = httpx.ConnectError("test offline")
        self.assertEqual(self.client.get("/api/v3/session", headers=HEADERS).status_code, 503)

    def test_profile_read_uses_verified_subject_and_user_token(self):
        self.http.side_effect = [self.user(), httpx.Response(200, json=[{"profile": FORM, "revision": 1}])]
        response = self.client.get(f"/api/v3/profile?user_id={OTHER}", headers=HEADERS)
        self.assertEqual(response.status_code, 200)
        call = self.http.call_args
        self.assertEqual(call.kwargs["params"]["user_id"], f"eq.{USER}")
        self.assertEqual(call.kwargs["headers"]["Authorization"], "Bearer test-token")

    def test_profile_create_has_server_owner_and_no_display_fields(self):
        self.http.side_effect = [self.user(), httpx.Response(201, json=[{"profile": FORM, "revision": 1}])]
        response = self.client.put("/api/v3/profile", headers=HEADERS,
            json={"profile": {**FORM, "display_timezone_name": "America/New_York", "target_date": "2026-09-19"}})
        self.assertEqual(response.status_code, 200)
        call = self.http.call_args
        self.assertEqual(call.args[0], "POST")
        self.assertEqual(call.kwargs["json"]["user_id"], USER)
        self.assertNotIn("target_date", call.kwargs["json"]["profile"])
        self.assertNotIn("display_timezone_name", call.kwargs["json"]["profile"])

    def test_update_conflict_is_not_overwritten(self):
        self.http.side_effect = [self.user(), httpx.Response(200, json=[])]
        response = self.client.put("/api/v3/profile", headers=HEADERS, json={"profile": FORM, "expected_revision": 3})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.http.call_args.args[0], "PATCH")
        self.assertEqual(self.http.call_args.kwargs["params"]["revision"], "eq.3")

    def test_profile_delete_uses_verified_subject_and_requires_origin(self):
        self.http.side_effect = [self.user(), httpx.Response(200, json=[{"user_id": USER}])]
        response = self.client.delete("/api/v3/profile", headers=HEADERS)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["deleted"])
        call = self.http.call_args
        self.assertEqual(call.args[0], "DELETE")
        self.assertEqual(call.kwargs["params"]["user_id"], f"eq.{USER}")
        self.assertEqual(call.kwargs["headers"]["Authorization"], "Bearer test-token")

        self.http.reset_mock()
        self.http.side_effect = None
        self.http.return_value = self.user()
        response = self.client.delete("/api/v3/profile", headers={"Authorization": "Bearer test-token"})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.http.call_count, 1)

    def test_write_origin_and_injected_owner_are_rejected(self):
        self.http.return_value = self.user()
        self.assertEqual(self.client.put("/api/v3/profile", headers={"Authorization": "Bearer test-token"}, json={"profile": FORM}).status_code, 403)
        self.assertEqual(self.client.put("/api/v3/profile", headers=HEADERS, json={"profile": FORM, "user_id": OTHER}).status_code, 422)
        self.assertEqual(self.client.put("/api/v3/profile", headers=HEADERS, json={"profile": {**FORM, "timezone_name": "Not/AZone"}}).status_code, 422)

    def test_secret_key_configuration_rejected(self):
        with patch.dict(os.environ, {"V3_SUPABASE_PUBLISHABLE_KEY": "sb_secret_forbidden"}):
            with self.assertRaises(RuntimeError):
                create_app()
