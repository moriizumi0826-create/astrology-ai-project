"""Read-only by default Stripe/Supabase subscription reconciliation command."""
import argparse
from datetime import datetime, timezone
import json
import sys
from uuid import UUID

import stripe

from backend.v3.billing import BillingStore, StripeBilling, _plain_dict
from backend.v3.deployment import environment, require_expected_supabase_project
from backend.v3.supabase_auth import SupabaseAuth


COMPARE_FIELDS = (
    "stripe_customer_id", "stripe_price_id", "currency", "status",
    "access_until", "cancel_at_period_end",
)


def normalized_user_id(value: str) -> str:
    try:
        return str(UUID(value))
    except (ValueError, TypeError, AttributeError):
        raise ValueError("user-idにはSupabase AuthのUUIDを指定してください。") from None


def require_apply_confirmation(user_id: str, apply: bool, confirmation: str | None):
    if apply and confirmation != user_id:
        raise ValueError("更新する場合は --confirm に同じuser-idを指定してください。")


def _stripe_subscriptions(service: StripeBilling, customer_id: str):
    try:
        listing = stripe.Subscription.list(
            api_key=service.secret_key,
            customer=customer_id,
            status="all",
            limit=100,
        )
        iterator = listing.auto_paging_iter() if hasattr(listing, "auto_paging_iter") else listing.data
        return [_plain_dict(item) for item in iterator]
    except stripe.StripeError:
        raise RuntimeError("Stripeの契約一覧を取得できませんでした。") from None


def _comparable(record: dict | None):
    if not record:
        return None
    result = {field: record.get(field) for field in COMPARE_FIELDS}
    access_until = result.get("access_until")
    if isinstance(access_until, str):
        try:
            result["access_until"] = datetime.fromisoformat(
                access_until.replace("Z", "+00:00")).astimezone(timezone.utc).isoformat()
        except ValueError:
            pass
    return result


def reconcile_user(service: StripeBilling, user_id: str, *, apply: bool = False,
                   observed_at: datetime | None = None):
    user_id = normalized_user_id(user_id)
    service._require()
    observed_at = observed_at or datetime.now(timezone.utc)
    customer_id = service.store.customer(user_id)
    if not customer_id:
        return {"user_id": user_id, "mode": service.mode, "apply": apply,
                "customer": False, "differences": [], "database_only": [],
                "skipped": [], "writes": 0}

    database_rows = service.store.subscriptions_for_user(user_id)
    database_by_id = {row["stripe_subscription_id"]: row for row in database_rows}
    stripe_rows = _stripe_subscriptions(service, customer_id)
    seen = set()
    differences = []
    skipped = []
    writes = 0
    event_created = int(observed_at.timestamp())

    for subscription in stripe_rows:
        subscription_id = str(subscription.get("id") or "")
        if not subscription_id:
            skipped.append({"reason": "missing_subscription_id"})
            continue
        seen.add(subscription_id)
        record = service.current_subscription_record(subscription, observed_at=observed_at)
        if not record:
            skipped.append({"stripe_subscription_id": subscription_id,
                            "reason": "customer_mapping_or_price_not_allowed"})
            continue
        if record.get("user_id") != user_id or record.get("stripe_customer_id") != customer_id:
            skipped.append({"stripe_subscription_id": subscription_id,
                            "reason": "customer_user_mapping_mismatch"})
            continue
        before = database_by_id.get(subscription_id)
        if _comparable(before) == _comparable(record):
            continue
        differences.append({"stripe_subscription_id": subscription_id,
                            "before": _comparable(before), "after": _comparable(record)})
        if apply:
            service.store.save_subscription(record, event_created)
            writes += 1

    database_only = sorted(set(database_by_id) - seen)
    return {"user_id": user_id, "mode": service.mode, "apply": apply,
            "customer": True, "differences": differences,
            "database_only": database_only, "skipped": skipped, "writes": writes}


def build_service():
    deployment = environment()
    auth = SupabaseAuth(deployment)
    if not auth.configured:
        raise RuntimeError("Supabase設定が必要です。")
    require_expected_supabase_project(deployment, auth.project)
    service = StripeBilling(BillingStore(auth.url, deployment), deployment, checkout_enabled=False)
    if not service.configured:
        raise RuntimeError("StripeとSupabaseのサーバー設定が必要です。")
    return service


def main(argv=None):
    parser = argparse.ArgumentParser(description="StripeとSupabaseのV3契約状態を照合します。既定では更新しません。")
    parser.add_argument("--user-id", required=True, help="Supabase Auth user UUID")
    parser.add_argument("--apply", action="store_true", help="差異をSupabaseへ反映する")
    parser.add_argument("--confirm", help="--apply時に同じuser-idを指定する")
    args = parser.parse_args(argv)
    try:
        user_id = normalized_user_id(args.user_id)
        require_apply_confirmation(user_id, args.apply, args.confirm)
        report = reconcile_user(build_service(), user_id, apply=args.apply)
    except (RuntimeError, ValueError) as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False))
        return 2
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if report["database_only"] or report["skipped"]:
        return 3
    return 0


if __name__ == "__main__":
    sys.exit(main())
