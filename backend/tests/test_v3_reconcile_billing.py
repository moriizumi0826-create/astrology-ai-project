import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import Mock, patch

from backend.v3.reconcile_billing import (
    normalized_user_id,
    reconcile_user,
    require_apply_confirmation,
)


USER = "00000000-0000-4000-8000-000000000001"
NOW = datetime(2026, 9, 22, 0, 0, tzinfo=timezone.utc)


def subscription(status="active", price="price_jpyTest"):
    return {
        "id": "sub_current", "customer": "cus_member", "status": status,
        "currency": "jpy", "current_period_end": 1792713600,
        "cancel_at_period_end": False,
        "items": {"data": [{"price": {"id": price, "currency": "jpy"}}]},
    }


class ReconcileBillingTests(unittest.TestCase):
    def service(self):
        service = Mock()
        service.mode = "test"
        service.secret_key = "sk_test_example"
        service._require.return_value = None
        service.store.customer.return_value = "cus_member"
        service.store.user_for_customer.return_value = USER
        service.store.subscriptions_for_user.return_value = []

        def record(value, observed_at=None):
            if value["items"]["data"][0]["price"]["id"] != "price_jpyTest":
                return None
            return {"stripe_subscription_id": value["id"], "user_id": USER,
                    "stripe_customer_id": value["customer"], "stripe_price_id": "price_jpyTest",
                    "currency": "jpy", "status": value["status"],
                    "access_until": "2026-10-23T00:00:00+00:00", "cancel_at_period_end": False}
        service.current_subscription_record.side_effect = record
        return service

    def test_dry_run_reports_difference_without_writing(self):
        service = self.service()
        listing = SimpleNamespace(auto_paging_iter=lambda: iter([subscription()]))
        with patch("backend.v3.reconcile_billing.stripe.Subscription.list", return_value=listing):
            report = reconcile_user(service, USER, observed_at=NOW)
        self.assertEqual(len(report["differences"]), 1)
        self.assertEqual(report["writes"], 0)
        service.store.save_subscription.assert_not_called()

    def test_apply_writes_current_record_with_recovery_timestamp(self):
        service = self.service()
        listing = SimpleNamespace(auto_paging_iter=lambda: iter([subscription()]))
        with patch("backend.v3.reconcile_billing.stripe.Subscription.list", return_value=listing):
            report = reconcile_user(service, USER, apply=True, observed_at=NOW)
        self.assertEqual(report["writes"], 1)
        record, event_created = service.store.save_subscription.call_args.args
        self.assertEqual(record["stripe_subscription_id"], "sub_current")
        self.assertEqual(event_created, int(NOW.timestamp()))

    def test_equal_records_are_not_written_and_database_only_is_reported(self):
        service = self.service()
        current = service.current_subscription_record(subscription(), observed_at=NOW)
        current["access_until"] = "2026-10-23T00:00:00Z"
        service.store.subscriptions_for_user.return_value = [current, {
            **current, "stripe_subscription_id": "sub_missing_from_stripe"}]
        listing = SimpleNamespace(auto_paging_iter=lambda: iter([subscription()]))
        with patch("backend.v3.reconcile_billing.stripe.Subscription.list", return_value=listing):
            report = reconcile_user(service, USER, apply=True, observed_at=NOW)
        self.assertEqual(report["differences"], [])
        self.assertEqual(report["database_only"], ["sub_missing_from_stripe"])
        service.store.save_subscription.assert_not_called()

    def test_unapproved_price_is_skipped(self):
        service = self.service()
        listing = SimpleNamespace(auto_paging_iter=lambda: iter([subscription(price="price_other")]))
        with patch("backend.v3.reconcile_billing.stripe.Subscription.list", return_value=listing):
            report = reconcile_user(service, USER, apply=True, observed_at=NOW)
        self.assertEqual(report["skipped"][0]["reason"], "customer_mapping_or_price_not_allowed")
        service.store.save_subscription.assert_not_called()

    def test_mismatched_customer_user_mapping_is_skipped(self):
        service = self.service()
        current = service.current_subscription_record(subscription(), observed_at=NOW)
        current["user_id"] = "00000000-0000-4000-8000-000000000002"
        service.current_subscription_record.side_effect = None
        service.current_subscription_record.return_value = current
        listing = SimpleNamespace(auto_paging_iter=lambda: iter([subscription()]))
        with patch("backend.v3.reconcile_billing.stripe.Subscription.list", return_value=listing):
            report = reconcile_user(service, USER, apply=True, observed_at=NOW)
        self.assertEqual(report["skipped"][0]["reason"], "customer_user_mapping_mismatch")
        service.store.save_subscription.assert_not_called()

    def test_apply_requires_exact_user_confirmation(self):
        self.assertEqual(normalized_user_id(USER), USER)
        with self.assertRaisesRegex(ValueError, "UUID"):
            normalized_user_id("not-a-user")
        with self.assertRaisesRegex(ValueError, "confirm"):
            require_apply_confirmation(USER, True, None)
        require_apply_confirmation(USER, True, USER)


if __name__ == "__main__":
    unittest.main()
