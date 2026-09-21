import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from fastapi import Depends
from fastapi.testclient import TestClient

from backend.v3.access import AccessContext, evaluate_access, get_access_context, require_paid_access
from backend.v3.app import create_app


def local_test_client(app, address="127.0.0.1"):
    # The pinned Starlette version predates TestClient's client= option.
    async def transport(scope, receive, send):
        await app({**scope, "client": (address, 1234)}, receive, send)
    return TestClient(transport, base_url="http://127.0.0.1")


class AccessContractTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 9, 13, tzinfo=timezone.utc)

    def test_login_and_payment_are_independent(self):
        for context, expected in [
            (AccessContext(), "anonymous"),
            (AccessContext("member"), "free"),
            (AccessContext(None, "active", self.now + timedelta(days=1)), "anonymous"),
            (AccessContext("member", "active", self.now + timedelta(days=1)), "paid"),
            (AccessContext("member", "active", self.now), "free"),
            (AccessContext("member", "active", self.now - timedelta(seconds=1)), "free"),
            (AccessContext("member", "checking"), "checking"),
            (AccessContext("member", "unavailable"), "unavailable"),
        ]:
            with self.subTest(expected=expected, context=context):
                result = evaluate_access(context, self.now)
                self.assertEqual(result.state, expected)
                self.assertEqual(result.capabilities.stellar_forecast, expected == "paid")
                self.assertEqual(result.capabilities.aspect_list, expected == "paid")
                self.assertEqual(result.capabilities.compound_aspects, expected == "paid")
                self.assertTrue(result.capabilities.single_chart_any_date)

    def test_incomplete_expiry_fails_closed_without_claiming_no_contract(self):
        for expires in (None, datetime(2027, 1, 1)):
            result = evaluate_access(AccessContext("member", "active", expires), self.now)
            self.assertEqual(result.state, "unavailable")
            self.assertFalse(result.capabilities.stellar_forecast)

    def test_naive_server_time_is_rejected(self):
        with self.assertRaises(ValueError):
            evaluate_access(AccessContext(), datetime(2026, 9, 13))


class V3BoundaryTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(auth_mode="local_test")
        self.client = local_test_client(self.app)

    def test_local_health_and_session_are_non_cached(self):
        health = self.client.get("/api/v3/health")
        self.assertEqual(health.json()["stage"], 6)
        self.assertEqual(health.headers["content-security-policy"],
                         "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
        self.assertEqual(health.headers["permissions-policy"], "camera=(), microphone=(), geolocation=()")
        self.assertEqual(health.headers["referrer-policy"], "no-referrer")
        self.assertEqual(health.headers["x-content-type-options"], "nosniff")
        self.assertEqual(health.headers["x-frame-options"], "DENY")
        self.assertNotIn("strict-transport-security", health.headers)
        response = self.client.get("/api/v3/session")
        self.assertEqual(response.json()["state"], "anonymous")
        self.assertEqual(response.headers["cache-control"], "no-store")

    def test_http_inputs_cannot_grant_paid_access(self):
        response = self.client.get(
            "/api/v3/session?plan=paid&user_id=member",
            headers={"Authorization": "Bearer fake", "X-Plan": "paid", "X-User-Id": "member", "Cookie": "plan=paid"},
        )
        self.assertEqual(response.json()["state"], "anonymous")
        self.assertIsNone(response.json()["user_id"])

    def test_legacy_paid_and_admin_endpoints_are_not_mounted(self):
        for path in ("/api/readings", "/api/yearly-forecast", "/api/yearly-forecast/detail", "/api/dev/reload-csv"):
            with self.subTest(path=path):
                self.assertEqual(self.client.post(path, json={}).status_code, 404)

    def test_remote_clients_and_unknown_hosts_are_rejected(self):
        remote = local_test_client(self.app, "192.0.2.5")
        self.assertEqual(remote.get("/api/v3/session").status_code, 403)
        self.assertEqual(self.client.get("/api/v3/session", headers={"host": "example.com"}).status_code, 400)

    def test_public_preview_accepts_only_configured_host_and_origin_without_test_login(self):
        config = {
            "V3_ENVIRONMENT": "preview",
            "V3_ALLOWED_ORIGINS": "https://preview.example.test",
            "V3_ALLOWED_HOSTS": "api.example.test",
            "V3_SUPABASE_URL": "https://test.supabase.co",
            "V3_SUPABASE_PUBLISHABLE_KEY": "sb_publishable_test",
            "V3_SUPABASE_SECRET_KEY": "sb_secret_test",
            "V3_STRIPE_SECRET_KEY": "sk_test_example",
            "V3_STRIPE_WEBHOOK_SECRET": "whsec_example",
            "V3_STRIPE_PRICE_JPY": "price_jpyTest",
            "V3_STRIPE_PRICE_USD": "",
        }
        with patch.dict("os.environ", config):
            app = create_app()
        client = local_test_client(app, "192.0.2.5")
        response = client.get("/api/v3/health", headers={"host": "api.example.test", "origin": "https://preview.example.test"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["environment"], "preview")
        self.assertEqual(response.headers["access-control-allow-origin"], "https://preview.example.test")
        self.assertEqual(client.post("/api/v3/test-auth/login", headers={"host": "api.example.test"}, json={}).status_code, 404)
        self.assertEqual(client.get("/api/v3/health", headers={"host": "wrong.example.test"}).status_code, 400)

    def test_production_requires_public_auth_and_never_mounts_test_login(self):
        config = {
            "V3_ENVIRONMENT": "production",
            "V3_ALLOWED_ORIGINS": "https://atelier.example",
            "V3_ALLOWED_HOSTS": "api.atelier.example",
            "V3_SUPABASE_PROJECT_REF": "production",
            "V3_SUPABASE_URL": "https://production.supabase.co",
            "V3_SUPABASE_PUBLISHABLE_KEY": "sb_publishable_production",
            "V3_SUPABASE_SECRET_KEY": "sb_secret_production",
            "V3_STRIPE_SECRET_KEY": "sk_live_example",
            "V3_STRIPE_WEBHOOK_SECRET": "whsec_example",
            "V3_STRIPE_PRICE_JPY": "price_jpyLive",
            "V3_STRIPE_PRICE_USD": "",
            "V3_BILLING_ENABLED": "false",
        }
        with patch.dict("os.environ", config):
            app = create_app()
        client = local_test_client(app, "192.0.2.5")
        response = client.get("/api/v3/health", headers={"host": "api.atelier.example",
            "origin": "https://atelier.example"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["environment"], "production")
        self.assertEqual(response.headers["strict-transport-security"], "max-age=31536000")
        self.assertEqual(client.post("/api/v3/test-auth/login",
            headers={"host": "api.atelier.example"}, json={}).status_code, 404)
        with patch.dict("os.environ", {**config, "V3_SUPABASE_PROJECT_REF": "wrong"}):
            with self.assertRaises(RuntimeError):
                create_app()
        with patch.dict("os.environ", {"V3_ENVIRONMENT": "production"}):
            with self.assertRaises(RuntimeError):
                create_app(auth_mode="local_test")

    def test_paid_dependency_checks_server_context_and_expiry(self):
        # This route exists only in the test, not in the shipped preview API.
        @self.app.get("/test-paid", dependencies=[Depends(require_paid_access)])
        def probe():
            return {"ok": True}

        now = datetime.now(timezone.utc)
        for context, status in [
            (AccessContext(), 401),
            (AccessContext("member"), 403),
            (AccessContext("member", "active", now + timedelta(days=1)), 200),
            (AccessContext("member", "active", now - timedelta(seconds=1)), 403),
            (AccessContext("member", "checking"), 503),
            (AccessContext("member", "unavailable"), 503),
        ]:
            with self.subTest(context=context):
                self.app.dependency_overrides[get_access_context] = lambda: context
                self.assertEqual(self.client.get("/test-paid").status_code, status)
        self.app.dependency_overrides.clear()


if __name__ == "__main__":
    unittest.main()
