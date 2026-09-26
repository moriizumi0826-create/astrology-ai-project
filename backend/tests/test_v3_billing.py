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
from backend.v3.billing import BillingStore, checkout_available, subscription_access_state


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

    def test_production_checkout_requires_explicit_single_user_allowlist(self):
        production = {**CONFIG,
            "V3_ENVIRONMENT": "production",
            "V3_ALLOWED_ORIGINS": "https://atelier.example",
            "V3_ALLOWED_HOSTS": "api.atelier.example",
            "V3_SUPABASE_PROJECT_REF": "test",
            "V3_STRIPE_SECRET_KEY": "sk_live_example",
            "V3_BILLING_ENABLED": "true",
        }
        headers = {"Authorization": AUTH["Authorization"], "Origin": "https://atelier.example",
                   "Host": "api.atelier.example"}

        with patch.dict(os.environ, production, clear=True):
            closed_app = create_app()
        closed_app.state.billing.store = self.store
        closed_client = local_test_client(closed_app, "192.0.2.5")
        self.assertFalse(closed_client.get("/api/v3/billing/status", headers=headers).json()["checkout_enabled"])
        with patch("backend.v3.billing.stripe.Price.retrieve") as price:
            response = closed_client.post("/api/v3/billing/checkout", headers=headers, json={"currency": "jpy"})
            self.assertEqual(response.status_code, 403)
            price.assert_not_called()
        self.store.save_customer.assert_not_called()

        with patch.dict(os.environ, {**production, "V3_BILLING_ALLOWED_USER_ID": USER}, clear=True):
            allowed_app = create_app()
        allowed_app.state.billing.store = self.store
        allowed_app.state.billing._prices_validated = True
        allowed_client = local_test_client(allowed_app, "192.0.2.5")
        status = allowed_client.get("/api/v3/billing/status", headers=headers).json()
        self.assertTrue(status["checkout_enabled"])
        self.assertTrue(status["checkout_available"])

        other_user = "00000000-0000-4000-8000-000000000002"
        self.auth_http.return_value = httpx.Response(200, json={"id": other_user,
            "email": "other@example.test", "email_confirmed_at": "2026-09-19T00:00:00Z"})
        status = allowed_client.get("/api/v3/billing/status", headers=headers).json()
        self.assertFalse(status["checkout_enabled"])
        self.assertFalse(status["checkout_available"])
        self.assertEqual(allowed_client.post("/api/v3/billing/checkout", headers=headers,
            json={"currency": "jpy"}).status_code, 403)
        self.store.save_customer.assert_not_called()
        self.store.customer.return_value = "cus_existing"
        with patch("backend.v3.billing.stripe.billing_portal.Session.create",
                   return_value=SimpleNamespace(url="https://billing.stripe.com/p/session/test")):
            self.assertEqual(allowed_client.post("/api/v3/billing/portal", headers=headers,
                json={}).status_code, 200)

        self.auth_http.return_value = auth_response()
        self.store.customer.return_value = None
        self.store.save_customer.return_value = "cus_member"
        with patch("backend.v3.billing.stripe.Customer.create",
                   return_value=SimpleNamespace(id="cus_member")), patch(
                   "backend.v3.billing.stripe.checkout.Session.create",
                   return_value=SimpleNamespace(url="https://checkout.stripe.com/test/session")):
            response = allowed_client.post("/api/v3/billing/checkout", headers=headers, json={"currency": "jpy"})
        self.assertEqual(response.status_code, 200)

        with patch.dict(os.environ, {**production, "V3_BILLING_ENABLED": "false",
                                  "V3_BILLING_ALLOWED_USER_ID": USER}, clear=True):
            stopped_app = create_app()
        stopped_app.state.billing.store = self.store
        stopped_client = local_test_client(stopped_app, "192.0.2.5")
        self.assertFalse(stopped_client.get("/api/v3/billing/status", headers=headers).json()["checkout_enabled"])
        self.assertEqual(stopped_client.post("/api/v3/billing/checkout", headers=headers,
            json={"currency": "jpy"}).status_code, 503)

    def test_public_checkout_requires_explicit_scope_and_no_stale_allowlist(self):
        production = {**CONFIG,
            "V3_ENVIRONMENT": "production",
            "V3_ALLOWED_ORIGINS": "https://atelier.example",
            "V3_ALLOWED_HOSTS": "api.atelier.example",
            "V3_SUPABASE_PROJECT_REF": "test",
            "V3_STRIPE_SECRET_KEY": "sk_live_example",
            "V3_BILLING_ENABLED": "true",
            "V3_BILLING_ACCESS_MODE": "public",
        }
        with patch.dict(os.environ, production, clear=True):
            app = create_app()
        self.assertTrue(app.state.billing.checkout_enabled_for(USER))
        with patch.dict(os.environ, {**production, "V3_BILLING_ALLOWED_USER_ID": USER}, clear=True):
            with self.assertRaisesRegex(RuntimeError, "空にしてください"):
                create_app()
        with patch.dict(os.environ, {**production, "V3_BILLING_ACCESS_MODE": "unknown"}, clear=True):
            with self.assertRaisesRegex(RuntimeError, "V3_BILLING_ACCESS_MODE"):
                create_app()
        with patch.dict(os.environ, {**production, "V3_BILLING_ACCESS_MODE": "single_user",
                                  "V3_BILLING_ALLOWED_USER_ID": "not-a-uuid"}, clear=True):
            with self.assertRaisesRegex(RuntimeError, "V3_BILLING_ALLOWED_USER_ID"):
                create_app()

    def test_verified_database_entitlement_unlocks_paid_state(self):
        expiry = datetime.now(timezone.utc) + timedelta(days=20)
        self.store.entitlement.return_value = ("active", expiry)
        response = self.client.get("/api/v3/session", headers=AUTH)
        self.assertEqual(response.json()["state"], "paid")
        self.assertTrue(response.json()["capabilities"]["stellar_forecast"])
        self.assertEqual(response.json()["user_id"], f"supabase:test:{USER}")

    def test_subscription_access_states_and_checkout_safety(self):
        now = datetime(2026, 9, 22, tzinfo=timezone.utc)
        future = (now + timedelta(days=10)).isoformat()
        self.assertEqual(subscription_access_state(None, now), "none")
        self.assertEqual(subscription_access_state({"status": "active", "access_until": future}, now), "active")
        self.assertEqual(subscription_access_state({"status": "active", "access_until": future,
            "cancel_at_period_end": True}, now), "active_canceling")
        self.assertEqual(subscription_access_state({"status": "active",
            "access_until": now.isoformat()}, now), "expired")
        for status, expected in [("past_due", "payment_required"), ("unpaid", "payment_required"),
                                 ("paused", "paused"), ("incomplete", "processing"),
                                 ("incomplete_expired", "expired"), ("canceled", "canceled"),
                                 ("unexpected", "unknown")]:
            with self.subTest(status=status):
                self.assertEqual(subscription_access_state({"status": status}, now), expected)
        self.assertTrue(checkout_available(None))
        self.assertTrue(checkout_available({"status": "canceled"}))
        self.assertFalse(checkout_available({"status": "past_due"}))
        self.assertFalse(checkout_available({"status": "unexpected"}))

    def test_billing_status_guides_payment_recovery_without_new_checkout(self):
        self.store.customer.return_value = "cus_member"
        self.store.status.return_value = {"status": "past_due", "currency": "jpy",
                                          "access_until": "2026-10-01T00:00:00+00:00"}
        response = self.client.get("/api/v3/billing/status", headers=AUTH)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["access_state"], "payment_required")
        self.assertFalse(response.json()["checkout_available"])
        self.assertTrue(response.json()["customer"])

        self.app.state.billing._prices_validated = True
        response = self.client.post("/api/v3/billing/checkout", headers=AUTH, json={"currency": "jpy"})
        self.assertEqual(response.status_code, 409)

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

    def test_current_subscription_record_uses_period_end_or_observed_terminal_time(self):
        observed_at = datetime(2026, 9, 22, tzinfo=timezone.utc)
        self.store.user_for_customer.return_value = USER
        subscription = {"id": "sub_current", "customer": "cus_member", "status": "active",
            "currency": "jpy", "current_period_end": 1792713600,
            "cancel_at_period_end": False,
            "items": {"data": [{"price": {"id": "price_jpyTest", "currency": "jpy"}}]}}

        active = self.app.state.billing.current_subscription_record(
            subscription, observed_at=observed_at)
        self.assertEqual(active["access_until"],
            datetime.fromtimestamp(1792713600, timezone.utc).isoformat())

        subscription["status"] = "canceled"
        canceled = self.app.state.billing.current_subscription_record(
            subscription, observed_at=observed_at)
        self.assertEqual(canceled["access_until"], observed_at.isoformat())

    def test_scheduled_cancel_at_is_reflected_even_without_period_end_flag(self):
        self.store.begin_event.return_value = True
        self.store.user_for_customer.return_value = USER
        subscription = {"id": "sub_canceling", "customer": "cus_member", "status": "active",
            "currency": "jpy", "current_period_end": 1793012079,
            "cancel_at": 1793012079, "cancel_at_period_end": False,
            "items": {"data": [{"price": {"id": "price_jpyTest", "currency": "jpy"}}]}}
        event = {"id": "evt_canceling", "type": "customer.subscription.updated",
                 "created": 1790420975, "livemode": False, "data": {"object": subscription}}

        self.assertEqual(self.app.state.billing.handle(event), "processed")
        record = self.store.save_subscription.call_args.args[0]
        self.assertTrue(record["cancel_at_period_end"])
        self.assertEqual(record["status"], "active")
        self.store.finish_event.assert_called_once_with("evt_canceling")

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

    def test_failed_invoice_updates_subscription_state_for_recovery_ui(self):
        self.store.begin_event.return_value = True
        self.store.user_for_customer.return_value = USER
        subscription = {"id": "sub_failed", "customer": "cus_member", "status": "past_due",
            "currency": "jpy", "current_period_end": 1790000000,
            "cancel_at_period_end": False,
            "items": {"data": [{"price": {"id": "price_jpyTest", "currency": "jpy"}}]}}
        patch("backend.v3.billing.stripe.Subscription.retrieve",
              return_value=SimpleNamespace(to_dict_recursive=lambda: subscription)).start()
        event = {"id": "evt_failed", "type": "invoice.payment_failed", "created": 1787000000,
                 "livemode": False, "data": {"object": {"subscription": "sub_failed"}}}
        self.assertEqual(self.app.state.billing.handle(event), "processed")
        record = self.store.save_subscription.call_args.args[0]
        self.assertEqual(record["status"], "past_due")
        self.assertNotIn("access_until", record)
        self.store.finish_event.assert_called_once_with("evt_failed")

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
        with patch.dict(os.environ, {**production, "V3_STRIPE_SECRET_KEY": "rk_live_example"}):
            restricted_app = create_app()
        self.assertEqual(restricted_app.state.billing.mode, "live")
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
