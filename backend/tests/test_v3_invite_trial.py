import os
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import Mock, patch

import httpx
from fastapi import HTTPException

from backend.tests.test_v3_access import local_test_client
from backend.v3.app import create_app


USER = "00000000-0000-4000-8000-000000000001"
AUTH = {"Authorization": "Bearer member-token", "Origin": "http://127.0.0.1:5176"}
CONFIG = {
    "V3_SUPABASE_URL": "https://test.supabase.co",
    "V3_SUPABASE_PUBLISHABLE_KEY": "sb_publishable_test",
    "V3_SUPABASE_SECRET_KEY": "sb_secret_test",
    "V3_STRIPE_SECRET_KEY": "sk_test_example",
    "V3_STRIPE_WEBHOOK_SECRET": "whsec_example",
    "V3_STRIPE_PRICE_JPY": "price_jpyTest",
    "V3_STRIPE_PRICE_USD": "",
    "V3_INVITE_ACCESS_ENABLED": "true",
    "V3_TRIAL_ENABLED": "true",
}


def subscription(status="trialing"):
    return {"id": "sub_trial", "customer": "cus_member", "status": status,
            "currency": "jpy", "trial_end": int((datetime.now(timezone.utc) + timedelta(days=30)).timestamp()),
            "current_period_end": int((datetime.now(timezone.utc) + timedelta(days=30)).timestamp()),
            "default_payment_method": "pm_trial", "metadata": {"v3_trial_offer": "30d"},
            "items": {"data": [{"price": {"id": "price_jpyTest", "currency": "jpy"}}]}}


class InviteTrialTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, CONFIG)
        self.env.start()
        self.addCleanup(self.env.stop)
        self.app = create_app()
        self.client = local_test_client(self.app)
        self.store = Mock()
        self.store.key = CONFIG["V3_SUPABASE_SECRET_KEY"]
        self.store.configured = True
        self.store.claim_campaign_invite.return_value = False
        self.store.invite.return_value = False
        self.store.entitlement.return_value = ("none", None)
        self.store.customer.return_value = "cus_member"
        self.store.status.return_value = None
        self.store.trial_used_or_denied.return_value = False
        self.store.trial_verified.return_value = False
        self.store.user_for_customer.return_value = USER
        self.store.begin_event.return_value = True
        self.app.state.billing.store = self.store
        self.auth = patch("backend.v3.supabase_auth.httpx.request", return_value=httpx.Response(200,
            json={"id": USER, "email": "member@example.test", "email_confirmed_at": "2026-09-28T00:00:00Z"}))
        self.auth.start()
        self.addCleanup(self.auth.stop)

    def test_invite_unlocks_paid_features_without_card_or_checkout(self):
        self.store.claim_campaign_invite.return_value = True
        self.store.invite.return_value = True
        session = self.client.get("/api/v3/session", headers=AUTH).json()
        self.assertEqual(session["state"], "paid")
        self.assertEqual(session["access_source"], "invite")
        self.assertIsNone(session["valid_until"])
        self.assertTrue(session["capabilities"]["stellar_forecast"])
        billing = self.client.get("/api/v3/billing/status", headers=AUTH).json()
        self.assertEqual(billing["access_state"], "invite")
        self.assertFalse(billing["checkout_available"])
        self.assertEqual(self.client.post("/api/v3/billing/checkout", headers=AUTH,
            json={"currency": "jpy"}).status_code, 409)

    def test_trial_checkout_requires_card_and_is_only_offered_once(self):
        self.app.state.billing._prices_validated = True
        self.store.customer.return_value = None
        self.store.save_customer.return_value = "cus_member"
        with patch("backend.v3.billing.GENERAL_LAUNCH_AT", datetime(2020, 1, 1, tzinfo=timezone.utc)), patch(
                "backend.v3.billing.stripe.checkout.Session.create",
                return_value=SimpleNamespace(url="https://checkout.stripe.com/test/session")) as checkout, patch(
                "backend.v3.billing.stripe.Customer.create",
                return_value=SimpleNamespace(id="cus_member")):
            self.assertEqual(self.client.post("/api/v3/billing/checkout", headers=AUTH,
                json={"currency": "jpy"}).status_code, 200)
            payload = checkout.call_args.kwargs
            self.assertEqual(payload["subscription_data"]["trial_period_days"], 30)
            self.assertEqual(payload["payment_method_collection"], "always")
            self.store.trial_used_or_denied.return_value = True
            self.assertEqual(self.client.post("/api/v3/billing/checkout", headers=AUTH,
                json={"currency": "jpy"}).status_code, 200)
            self.assertNotIn("trial_period_days", checkout.call_args.kwargs["subscription_data"])

    def test_existing_stripe_customer_cannot_receive_first_trial(self):
        with patch("backend.v3.billing.GENERAL_LAUNCH_AT", datetime(2020, 1, 1, tzinfo=timezone.utc)):
            self.assertFalse(self.app.state.billing.trial_available_for(USER))

    def test_test_mode_can_verify_trial_before_live_launch(self):
        self.store.customer.return_value = None
        with patch("backend.v3.billing.GENERAL_LAUNCH_AT", datetime(2099, 1, 1, tzinfo=timezone.utc)):
            self.assertTrue(self.app.state.billing.trial_available_for(USER))
            self.app.state.billing.live_mode = True
            self.assertFalse(self.app.state.billing.trial_available_for(USER))

    def test_trial_webhook_verifies_card_before_granting_access(self):
        current = subscription()
        self.store.claim_trial_card.return_value = True
        event = {"id": "evt_trial", "type": "customer.subscription.created", "created": 1,
                 "livemode": False, "data": {"object": {"id": "sub_trial"}}}
        with patch("backend.v3.billing.stripe.Subscription.retrieve",
                   return_value=SimpleNamespace(to_dict_recursive=lambda: current)), patch(
                   "backend.v3.billing.stripe.PaymentMethod.retrieve",
                   return_value=SimpleNamespace(to_dict_recursive=lambda: {
                       "type": "card", "card": {"fingerprint": "fingerprint_abc"}})):
            self.assertEqual(self.app.state.billing.handle(event), "processed")
        self.store.claim_trial_card.assert_called_once_with(USER, "fingerprint_abc", "sub_trial")
        record = self.store.save_subscription.call_args.args[0]
        self.assertEqual(record["status"], "trialing")
        self.assertEqual(record["access_until"],
            datetime.fromtimestamp(current["trial_end"], timezone.utc).isoformat())

    def test_duplicate_card_cancels_trial_without_paid_access(self):
        current = subscription()
        self.store.claim_trial_card.return_value = False
        event = {"id": "evt_duplicate", "type": "checkout.session.completed", "created": 2,
                 "livemode": False, "data": {"object": {"subscription": "sub_trial"}}}
        with patch("backend.v3.billing.stripe.Subscription.retrieve",
                   return_value=SimpleNamespace(to_dict_recursive=lambda: current)), patch(
                   "backend.v3.billing.stripe.PaymentMethod.retrieve",
                   return_value=SimpleNamespace(to_dict_recursive=lambda: {
                       "type": "card", "card": {"fingerprint": "fingerprint_abc"}})), patch(
                   "backend.v3.billing.stripe.Subscription.delete",
                   return_value=SimpleNamespace(to_dict_recursive=lambda: subscription("canceled"))) as cancel:
            self.assertEqual(self.app.state.billing.handle(event), "processed")
        cancel.assert_called_once()
        record = self.store.save_subscription.call_args.args[0]
        self.assertEqual(record["status"], "canceled")
        self.assertLessEqual(datetime.fromisoformat(record["access_until"]), datetime.now(timezone.utc))

    def test_missing_card_fails_closed_and_webhook_can_retry(self):
        current = subscription()
        current["default_payment_method"] = None
        event = {"id": "evt_no_card", "type": "customer.subscription.created", "created": 1,
                 "livemode": False, "data": {"object": {"id": "sub_trial"}}}
        with patch("backend.v3.billing.stripe.Subscription.retrieve",
                   return_value=SimpleNamespace(to_dict_recursive=lambda: current)), patch(
                   "backend.v3.billing.stripe.Customer.retrieve",
                   return_value=SimpleNamespace(to_dict_recursive=lambda: {"invoice_settings": {}})):
            with self.assertRaises(HTTPException) as raised:
                self.app.state.billing.handle(event)
        self.assertEqual(raised.exception.status_code, 503)
        self.store.save_subscription.assert_not_called()
        self.store.finish_event.assert_called_once_with("evt_no_card", "HTTPException")


if __name__ == "__main__":
    unittest.main()
