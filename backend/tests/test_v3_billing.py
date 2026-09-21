import os
import unittest
import base64
import json
import time
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import Mock, patch

import httpx
import stripe

from backend.tests.test_v3_access import local_test_client
from backend.v3.app import create_app
from backend.v3.billing import BillingStore


USER = "00000000-0000-4000-8000-000000000001"
AUTH = {"Authorization": "Bearer member-token", "Origin": "http://127.0.0.1:5176"}
CONFIG = {"V3_SUPABASE_URL": "https://test.supabase.co",
          "V3_SUPABASE_PUBLISHABLE_KEY": "sb_publishable_test",
          "V3_SUPABASE_SECRET_KEY": "sb_secret_test",
          "V3_STRIPE_SECRET_KEY": "sk_test_example",
          "V3_STRIPE_WEBHOOK_SECRET": "whsec_example",
          "V3_STRIPE_PRICE_JPY": "price_jpyTest",
          "V3_STRIPE_PRICE_USD": ""}


def bearer_token(issued_at: int):
    def segment(value):
        return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")
    return f"{segment({'alg': 'none'})}.{segment({'iat': issued_at})}.signature"


def auth_response():
    return httpx.Response(200, json={"id": USER, "email": "member@example.test",
        "email_confirmed_at": "2026-09-19T00:00:00Z"})


class BillingTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, CONFIG)
        self.env.start()
        self.addCleanup(self.env.stop)
        self.app = create_app()
        self.client = local_test_client(self.app)
        self.store = Mock()
        self.store.key = CONFIG["V3_SUPABASE_SECRET_KEY"]
        self.store.configured = True
        self.store.entitlement.return_value = ("none", None)
        self.store.customer.return_value = None
        self.store.status.return_value = None
        self.app.state.billing.store = self.store
        self.auth_http = patch("backend.v3.supabase_auth.httpx.request", return_value=auth_response()).start()
        self.addCleanup(patch.stopall)

    def test_checkout_uses_allowlisted_price_and_verified_member(self):
        self.store.save_customer.return_value = "cus_member"
        def price(price_id, **_kwargs):
            data = {"id": price_id, "active": True, "livemode": False, "currency": "jpy",
                    "unit_amount": 400, "product": "prod_v3", "recurring": {"interval": "month", "interval_count": 1}}
            return SimpleNamespace(to_dict=lambda: data)
        patch("backend.v3.billing.stripe.Price.retrieve", side_effect=price).start()
        customer = patch("backend.v3.billing.stripe.Customer.create",
            return_value=SimpleNamespace(id="cus_member")).start()
        checkout = patch("backend.v3.billing.stripe.checkout.Session.create",
            return_value=SimpleNamespace(url="https://checkout.stripe.com/test/session")).start()
        response = self.client.post("/api/v3/billing/checkout", headers=AUTH, json={"currency": "jpy"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["url"], "https://checkout.stripe.com/test/session")
        self.assertEqual(customer.call_args.kwargs["metadata"]["v3_user_id"], USER)
        self.assertEqual(customer.call_args.kwargs["email"], "member@example.test")
        self.assertEqual(checkout.call_args.kwargs["line_items"][0]["price"], "price_jpyTest")
        self.assertEqual(checkout.call_args.kwargs["mode"], "subscription")

    def test_checkout_refuses_mispriced_or_existing_subscription(self):
        bad = {"active": True, "livemode": False, "currency": "jpy", "unit_amount": 999,
               "product": "prod_v3", "recurring": {"interval": "month", "interval_count": 1}}
        patch("backend.v3.billing.stripe.Price.retrieve",
              return_value=SimpleNamespace(to_dict_recursive=lambda: bad)).start()
        response = self.client.post("/api/v3/billing/checkout", headers=AUTH, json={"currency": "jpy"})
        self.assertEqual(response.status_code, 503)
        response = self.client.post("/api/v3/billing/checkout", headers=AUTH, json={"currency": "usd"})
        self.assertEqual(response.status_code, 422)

    def test_checkout_rejects_unknown_currency_origin_and_anonymous(self):
        self.assertEqual(self.client.post("/api/v3/billing/checkout", headers=AUTH, json={"currency": "eur"}).status_code, 422)
        self.assertEqual(self.client.post("/api/v3/billing/checkout",
            headers={"Authorization": "Bearer member-token"}, json={"currency": "jpy"}).status_code, 403)
        self.assertEqual(self.client.post("/api/v3/billing/checkout",
            headers={"Origin": AUTH["Origin"]}, json={"currency": "jpy"}).status_code, 401)

    def test_billing_switch_stops_only_new_checkout(self):
        self.app.state.billing.checkout_enabled = False
        response = self.client.get("/api/v3/billing/status", headers=AUTH)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["checkout_enabled"])
        self.assertEqual(response.json()["mode"], "test")
        response = self.client.post("/api/v3/billing/checkout", headers=AUTH, json={"currency": "jpy"})
        self.assertEqual(response.status_code, 503)
        self.assertIn("新規", response.json()["detail"])
        self.store.customer.return_value = "cus_member"
        patch("backend.v3.billing.stripe.billing_portal.Session.create",
            return_value=SimpleNamespace(url="https://billing.stripe.com/p/session/test")).start()
        self.assertEqual(self.client.post("/api/v3/billing/portal", headers=AUTH, json={}).status_code, 200)

    def test_verified_database_entitlement_unlocks_paid_state(self):
        expiry = datetime.now(timezone.utc) + timedelta(days=20)
        self.store.entitlement.return_value = ("active", expiry)
        response = self.client.get("/api/v3/session", headers=AUTH)
        self.assertEqual(response.json()["state"], "paid")
        self.assertTrue(response.json()["capabilities"]["stellar_forecast"])
        self.assertEqual(response.json()["user_id"], f"supabase:test:{USER}")

    def test_billing_store_failure_fails_closed(self):
        from fastapi import HTTPException
        self.store.entitlement.side_effect = HTTPException(503, "offline")
        response = self.client.get("/api/v3/session", headers=AUTH)
        self.assertEqual(response.json()["state"], "unavailable")
        paid = self.client.post("/api/v3/paid-reading", headers=AUTH, json={})
        self.assertEqual(paid.status_code, 503)

    def test_portal_requires_existing_customer(self):
        response = self.client.post("/api/v3/billing/portal", headers=AUTH, json={})
        self.assertEqual(response.status_code, 409)
        self.store.customer.return_value = "cus_member"
        portal = patch("backend.v3.billing.stripe.billing_portal.Session.create",
            return_value=SimpleNamespace(url="https://billing.stripe.com/p/session/test")).start()
        response = self.client.post("/api/v3/billing/portal", headers=AUTH, json={})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(portal.call_args.kwargs["customer"], "cus_member")

    def test_invalid_webhook_signature_is_rejected(self):
        patch("backend.v3.billing.stripe.Webhook.construct_event",
            side_effect=stripe.SignatureVerificationError("bad", "sig")).start()
        response = self.client.post("/api/v3/billing/webhook", content=b"{}",
            headers={"Stripe-Signature": "bad"})
        self.assertEqual(response.status_code, 400)

    def test_paid_invoice_extends_access_using_customer_mapping(self):
        self.store.begin_event.return_value = True
        self.store.user_for_customer.return_value = USER
        subscription = {"id": "sub_paid", "customer": "cus_member", "status": "active", "currency": "jpy",
            "current_period_end": 1790000000, "cancel_at_period_end": False,
            "items": {"data": [{"price": {"id": "price_jpyTest", "currency": "jpy"}}]}}
        retrieved = SimpleNamespace(to_dict_recursive=lambda: subscription)
        patch("backend.v3.billing.stripe.Subscription.retrieve", return_value=retrieved).start()
        event = {"id": "evt_paid", "type": "invoice.paid", "created": 1787000000, "livemode": False,
                 "data": {"object": {"subscription": "sub_paid"}}}
        self.assertEqual(self.app.state.billing.handle(event), "processed")
        record = self.store.save_subscription.call_args.args[0]
        self.assertEqual(record["user_id"], USER)
        self.assertEqual(record["stripe_price_id"], "price_jpyTest")
        self.assertIn("access_until", record)
        self.store.finish_event.assert_called_once_with("evt_paid")

    def test_duplicate_webhook_is_idempotent(self):
        self.store.begin_event.return_value = False
        event = {"id": "evt_same", "type": "customer.subscription.updated", "created": 1, "livemode": False,
                 "data": {"object": {}}}
        self.assertEqual(self.app.state.billing.handle(event), "duplicate")
        self.store.save_subscription.assert_not_called()

    def test_webhook_mode_must_match_deployment(self):
        event = {"id": "evt_live", "type": "customer.subscription.updated", "created": 1,
                 "livemode": True, "data": {"object": {}}}
        with self.assertRaisesRegex(Exception, "環境が一致"):
            self.app.state.billing.handle(event)
        self.store.begin_event.assert_not_called()

    def test_live_or_partial_configuration_is_refused(self):
        with patch.dict(os.environ, {**CONFIG, "V3_STRIPE_SECRET_KEY": "sk_live_forbidden"}):
            with self.assertRaises(RuntimeError):
                create_app()
        with patch.dict(os.environ, {**CONFIG, "V3_STRIPE_PRICE_JPY": ""}):
            with self.assertRaises(RuntimeError):
                create_app()

    def test_production_accepts_only_live_configuration_and_live_price(self):
        production = {**CONFIG,
            "V3_ENVIRONMENT": "production",
            "V3_ALLOWED_ORIGINS": "https://atelier.example",
            "V3_ALLOWED_HOSTS": "api.atelier.example",
            "V3_SUPABASE_PROJECT_REF": "test",
            "V3_STRIPE_SECRET_KEY": "sk_live_example",
            "V3_BILLING_ENABLED": "false",
        }
        with patch.dict(os.environ, production):
            app = create_app()
        self.assertEqual(app.state.v3_environment, "production")
        self.assertEqual(app.state.billing.mode, "live")
        self.assertFalse(app.state.billing.checkout_enabled)
        with patch.dict(os.environ, {**production, "V3_STRIPE_SECRET_KEY": "sk_test_forbidden"}):
            with self.assertRaises(RuntimeError):
                create_app()

        billing_closed = {**production,
            "V3_STRIPE_SECRET_KEY": "",
            "V3_STRIPE_WEBHOOK_SECRET": "",
            "V3_STRIPE_PRICE_JPY": "",
        }
        with patch.dict(os.environ, billing_closed):
            closed_app = create_app()
        self.assertFalse(closed_app.state.billing.configured)
        self.assertFalse(closed_app.state.billing.checkout_enabled)

        live_price = {"active": True, "livemode": True, "currency": "jpy", "unit_amount": 400,
                      "product": "prod_v3", "recurring": {"interval": "month", "interval_count": 1}}
        app.state.billing.checkout_enabled = True
        with patch("backend.v3.billing.stripe.Price.retrieve",
                   return_value=SimpleNamespace(to_dict_recursive=lambda: live_price)):
            app.state.billing.validate_prices()

    def test_account_delete_requires_recent_auth_and_no_open_subscription(self):
        recent = {**AUTH, "Authorization": f"Bearer {bearer_token(int(time.time()))}"}
        self.store.status.return_value = {"status": "active"}
        response = self.client.request("DELETE", "/api/v3/account", headers=recent,
            json={"confirmation": "アカウントを削除"})
        self.assertEqual(response.status_code, 409)
        self.store.delete_auth_user.assert_not_called()

        self.store.status.return_value = None
        response = self.client.request("DELETE", "/api/v3/account", headers=recent,
            json={"confirmation": "アカウントを削除"})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["deleted"])
        self.store.delete_auth_user.assert_called_once_with(USER)

    def test_account_delete_rejects_stale_auth_and_wrong_confirmation(self):
        stale = {**AUTH, "Authorization": f"Bearer {bearer_token(int(time.time()) - 3600)}"}
        response = self.client.request("DELETE", "/api/v3/account", headers=stale,
            json={"confirmation": "アカウントを削除"})
        self.assertEqual(response.status_code, 401)
        self.store.delete_auth_user.assert_not_called()

        recent = {**AUTH, "Authorization": f"Bearer {bearer_token(int(time.time()))}"}
        response = self.client.request("DELETE", "/api/v3/account", headers=recent,
            json={"confirmation": "削除"})
        self.assertEqual(response.status_code, 422)

    def test_account_delete_uses_server_secret_for_supabase_admin(self):
        store = BillingStore(CONFIG["V3_SUPABASE_URL"])
        remote = patch("backend.v3.billing.httpx.delete", return_value=httpx.Response(200, json={})).start()
        store.delete_auth_user(USER)
        headers = remote.call_args.kwargs["headers"]
        self.assertEqual(headers["apikey"], CONFIG["V3_SUPABASE_SECRET_KEY"])
        self.assertEqual(headers["Authorization"], f"Bearer {CONFIG['V3_SUPABASE_SECRET_KEY']}")
        self.assertTrue(remote.call_args.args[0].endswith(f"/auth/v1/admin/users/{USER}"))


if __name__ == "__main__":
    unittest.main()
