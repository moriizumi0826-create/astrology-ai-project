"""Stripe billing. Entitlements come from verified webhooks, never redirects."""
from datetime import datetime, timezone
import os
from pathlib import Path
from typing import Literal

import httpx
import stripe
from dotenv import dotenv_values
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict

from backend.v3.access import AccessContext, get_access_context
from backend.v3.deployment import require_allowed_origin


ACTIVE_STATUSES = {"active", "trialing"}


def _plain_dict(value):
    """Normalize Stripe resources across stripe-python serialization APIs."""
    for name in ("to_dict_recursive", "_to_dict_recursive", "to_dict"):
        converter = getattr(value, name, None)
        if callable(converter):
            return converter()
    return dict(value)


def _env(name: str, local: dict) -> str:
    return (os.environ.get(name, local.get(name)) or "").strip()


class BillingStore:
    """Server-only Data API client. The secret key must never reach the browser."""

    def __init__(self, supabase_url: str, deployment: str = "local"):
        local = (dotenv_values(Path(__file__).resolve().parents[2] / ".env.v3.local")
                 if deployment == "local" else {})
        self.url = supabase_url.rstrip("/")
        self.key = _env("V3_SUPABASE_SECRET_KEY", local)
        self.configured = bool(self.key)
        if self.configured and not self.key.startswith("sb_secret_"):
            raise RuntimeError("V3_SUPABASE_SECRET_KEYにはバックエンド専用のsb_secret_キーが必要です。")

    def request(self, method: str, table: str, **kwargs):
        headers = {"apikey": self.key, "User-Agent": "celestial-atelier-v3-server",
                   "Prefer": kwargs.pop("prefer", "return=representation")}
        try:
            response = httpx.request(method, f"{self.url}/rest/v1/{table}", headers=headers,
                                     timeout=15, follow_redirects=False, **kwargs)
        except httpx.RequestError:
            raise HTTPException(503, "契約情報の保存先に接続できません。") from None
        if not response.is_success:
            raise HTTPException(503, "契約情報の保存先を確認できません。")
        try:
            return response.json()
        except ValueError:
            return None

    def customer(self, user_id: str):
        rows = self.request("GET", "v3_billing_customers",
            params={"user_id": f"eq.{user_id}", "select": "stripe_customer_id", "limit": "1"})
        return rows[0]["stripe_customer_id"] if rows else None

    def user_for_customer(self, customer_id: str):
        rows = self.request("GET", "v3_billing_customers",
            params={"stripe_customer_id": f"eq.{customer_id}", "select": "user_id", "limit": "1"})
        return rows[0]["user_id"] if rows else None

    def save_customer(self, user_id: str, customer_id: str):
        rows = self.request("POST", "v3_billing_customers", params={"on_conflict": "user_id"},
            prefer="resolution=merge-duplicates,return=representation",
            json={"user_id": user_id, "stripe_customer_id": customer_id,
                  "updated_at": datetime.now(timezone.utc).isoformat()})
        return rows[0]["stripe_customer_id"]

    def subscription(self, subscription_id: str):
        rows = self.request("GET", "v3_subscriptions",
            params={"stripe_subscription_id": f"eq.{subscription_id}", "select": "*", "limit": "1"})
        return rows[0] if rows else None

    def status(self, user_id: str):
        rows = self.request("GET", "v3_subscriptions", params={"user_id": f"eq.{user_id}",
            "select": "status,currency,access_until,cancel_at_period_end,stripe_price_id",
            "order": "access_until.desc.nullslast", "limit": "1"})
        return rows[0] if rows else None

    def entitlement(self, user_id: str):
        current = self.status(user_id)
        if not current or current["status"] not in ACTIVE_STATUSES or not current.get("access_until"):
            return "none", None
        try:
            valid_until = datetime.fromisoformat(current["access_until"].replace("Z", "+00:00"))
        except (TypeError, ValueError):
            return "unavailable", None
        return ("active", valid_until) if valid_until > datetime.now(timezone.utc) else ("none", None)

    def save_subscription(self, record: dict, event_created: int):
        existing = self.subscription(record["stripe_subscription_id"])
        if existing and int(existing.get("latest_event_created") or 0) > event_created:
            # A paid invoice may arrive after a newer subscription-state event. Extend
            # access without rolling the newer status back.
            if record.get("access_until") and record["access_until"] > (existing.get("access_until") or ""):
                self.request("PATCH", "v3_subscriptions",
                    params={"stripe_subscription_id": f"eq.{record['stripe_subscription_id']}"},
                    json={"access_until": record["access_until"],
                          "updated_at": datetime.now(timezone.utc).isoformat()})
                return True
            return False
        if existing and "access_until" not in record:
            record["access_until"] = existing.get("access_until")
        payload = {**record, "latest_event_created": event_created,
                   "updated_at": datetime.now(timezone.utc).isoformat()}
        self.request("POST", "v3_subscriptions", params={"on_conflict": "stripe_subscription_id"},
            prefer="resolution=merge-duplicates,return=representation", json=payload)
        return True

    def begin_event(self, event_id: str, event_type: str, created: int):
        self.request("POST", "v3_stripe_events", params={"on_conflict": "stripe_event_id"},
            prefer="resolution=ignore-duplicates,return=representation",
            json={"stripe_event_id": event_id, "event_type": event_type, "event_created": created})
        rows = self.request("GET", "v3_stripe_events", params={"stripe_event_id": f"eq.{event_id}",
            "select": "processed_at", "limit": "1"})
        return not bool(rows and rows[0].get("processed_at"))

    def finish_event(self, event_id: str, error: str | None = None):
        payload = {"processing_error": error[:500] if error else None}
        if not error:
            payload["processed_at"] = datetime.now(timezone.utc).isoformat()
        self.request("PATCH", "v3_stripe_events", params={"stripe_event_id": f"eq.{event_id}"}, json=payload)


class StripeBilling:
    def __init__(self, store: BillingStore, deployment: str = "local", checkout_enabled: bool = True):
        local = (dotenv_values(Path(__file__).resolve().parents[2] / ".env.v3.local")
                 if deployment == "local" else {})
        self.deployment = deployment
        self.live_mode = deployment == "production"
        self.mode = "live" if self.live_mode else "test"
        self.checkout_enabled = checkout_enabled
        self.secret_key = _env("V3_STRIPE_SECRET_KEY", local)
        self.webhook_secret = _env("V3_STRIPE_WEBHOOK_SECRET", local)
        jpy_price = _env("V3_STRIPE_PRICE_JPY", local)
        usd_price = _env("V3_STRIPE_PRICE_USD", local)
        self.prices = {"jpy": jpy_price}
        if usd_price:
            self.prices["usd"] = usd_price
        stripe_values = [self.secret_key, self.webhook_secret, jpy_price]
        required = [*stripe_values, store.key]
        self.configured = all(required)
        # The production shell may run with sales disabled before live Stripe
        # credentials exist. A Supabase secret by itself is database config,
        # not a partial Stripe configuration.
        if any([*stripe_values, usd_price]) and not self.configured:
            raise RuntimeError("V3のStripe設定とSupabase Secret keyを全て設定してください。")
        if self.configured:
            expected_prefix = "sk_live_" if self.live_mode else "sk_test_"
            if not self.secret_key.startswith(expected_prefix):
                raise RuntimeError(f"{deployment}ではStripeの{expected_prefix}キーだけを使用できます。")
            if not self.webhook_secret.startswith("whsec_"):
                raise RuntimeError("V3_STRIPE_WEBHOOK_SECRETを確認してください。")
            if any(not value.startswith("price_") for value in self.prices.values()):
                raise RuntimeError("Stripeの月額Price IDを確認してください。")
            if len(set(self.prices.values())) != len(self.prices):
                raise RuntimeError("円価格とドル価格には別のStripe Price IDが必要です。")
        self.store = store
        self._prices_validated = False

    def _require(self):
        if not self.configured:
            raise HTTPException(503, "Stripe決済はまだ設定されていません。")

    def ensure_customer(self, user_id: str, email: str):
        self._require()
        customer_id = self.store.customer(user_id)
        if customer_id:
            return customer_id
        try:
            customer = stripe.Customer.create(api_key=self.secret_key, email=email or None,
                metadata={"v3_user_id": user_id}, idempotency_key=f"v3-customer-{user_id}")
        except stripe.StripeError:
            raise HTTPException(503, "Stripeの顧客情報を作成できません。") from None
        return self.store.save_customer(user_id, customer.id)

    def validate_prices(self):
        self._require()
        if self._prices_validated:
            return
        products = set()
        expected = {"jpy": 400, "usd": 450}
        try:
            for currency, price_id in self.prices.items():
                price = stripe.Price.retrieve(price_id, api_key=self.secret_key)
                data = _plain_dict(price)
                recurring = data.get("recurring") or {}
                if (data.get("livemode") is not self.live_mode or not data.get("active") or data.get("currency") != currency
                        or int(data.get("unit_amount") or -1) != expected[currency]
                        or recurring.get("interval") != "month" or int(recurring.get("interval_count") or 0) != 1):
                    raise RuntimeError("price mismatch")
                products.add(data.get("product"))
        except (stripe.StripeError, RuntimeError, TypeError, ValueError):
            raise HTTPException(503, "Stripeの月額価格設定が登録内容と一致しません。") from None
        if None in products or (len(self.prices) > 1 and len(products) != 1):
            raise HTTPException(503, "円価格とドル価格を同じStripe商品に設定してください。")
        self._prices_validated = True

    def checkout(self, user_id: str, email: str, currency: str, origin: str):
        if not self.checkout_enabled:
            raise HTTPException(503, "現在、新規の有料プラン申し込みを停止しています。")
        if currency not in self.prices:
            raise HTTPException(422, "選択した通貨の決済は現在利用できません。")
        self.validate_prices()
        current = self.store.status(user_id)
        if current and current.get("status") in {"active", "trialing", "past_due", "unpaid", "paused", "incomplete"}:
            raise HTTPException(409, "既存の契約は契約管理画面から確認してください。")
        customer_id = self.ensure_customer(user_id, email)
        try:
            session = stripe.checkout.Session.create(api_key=self.secret_key, mode="subscription",
                customer=customer_id, client_reference_id=user_id,
                line_items=[{"price": self.prices[currency], "quantity": 1}],
                success_url=f"{origin}/billing.html?checkout=success",
                cancel_url=f"{origin}/billing.html?checkout=cancel",
                subscription_data={"metadata": {"v3_user_id": user_id}},
                metadata={"v3_user_id": user_id, "currency_choice": currency})
        except stripe.StripeError:
            raise HTTPException(503, "Stripe Checkoutを開始できません。") from None
        return session.url

    def portal(self, user_id: str, origin: str):
        self._require()
        customer_id = self.store.customer(user_id)
        if not customer_id:
            raise HTTPException(409, "管理できる契約がまだありません。")
        try:
            session = stripe.billing_portal.Session.create(api_key=self.secret_key,
                customer=customer_id, return_url=f"{origin}/billing.html")
        except stripe.StripeError:
            raise HTTPException(503, "契約管理画面を開けません。") from None
        return session.url

    def event(self, payload: bytes, signature: str):
        self._require()
        try:
            return stripe.Webhook.construct_event(payload, signature, self.webhook_secret)
        except (ValueError, stripe.SignatureVerificationError):
            raise HTTPException(400, "Stripe署名を確認できません。") from None

    @staticmethod
    def _subscription_id(invoice: dict):
        return (invoice.get("subscription") or
                invoice.get("parent", {}).get("subscription_details", {}).get("subscription"))

    def _retrieve_subscription(self, subscription_id: str):
        try:
            result = stripe.Subscription.retrieve(subscription_id, api_key=self.secret_key)
            return _plain_dict(result)
        except stripe.StripeError:
            raise HTTPException(503, "Stripeの契約状態を確認できません。") from None

    def _record(self, subscription: dict, event_type: str):
        customer_id = subscription.get("customer")
        user_id = self.store.user_for_customer(customer_id) if isinstance(customer_id, str) else None
        items = subscription.get("items", {}).get("data", [])
        price = items[0].get("price", {}) if items else {}
        price_id = price.get("id")
        if not user_id or price_id not in self.prices.values():
            return None
        period_end = subscription.get("current_period_end") or (items[0].get("current_period_end") if items else None)
        record = {"stripe_subscription_id": subscription["id"], "user_id": user_id,
                  "stripe_customer_id": customer_id, "stripe_price_id": price_id,
                  "currency": subscription.get("currency") or price.get("currency"),
                  "status": subscription.get("status", "unknown"),
                  "cancel_at_period_end": bool(subscription.get("cancel_at_period_end"))}
        if event_type == "invoice.paid" and period_end:
            record["access_until"] = datetime.fromtimestamp(int(period_end), timezone.utc).isoformat()
        elif event_type == "customer.subscription.deleted":
            record["access_until"] = datetime.now(timezone.utc).isoformat()
        return record

    def handle(self, event):
        raw = _plain_dict(event)
        if not isinstance(raw.get("livemode"), bool) or raw["livemode"] is not self.live_mode:
            raise HTTPException(400, "Stripeイベントの環境が一致しません。")
        event_id, event_type, created = raw["id"], raw["type"], int(raw["created"])
        if not self.store.begin_event(event_id, event_type, created):
            return "duplicate"
        try:
            obj = raw.get("data", {}).get("object", {})
            subscription = None
            if event_type in {"customer.subscription.created", "customer.subscription.updated",
                              "customer.subscription.deleted"}:
                subscription = obj
            elif event_type == "invoice.paid":
                subscription_id = self._subscription_id(obj)
                if subscription_id:
                    subscription = self._retrieve_subscription(subscription_id)
            if subscription:
                record = self._record(subscription, event_type)
                if record:
                    self.store.save_subscription(record, created)
            self.store.finish_event(event_id)
        except Exception as exc:
            self.store.finish_event(event_id, type(exc).__name__)
            raise
        return "processed"


class CheckoutRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    currency: Literal["jpy", "usd"]


router = APIRouter(prefix="/api/v3/billing")


def _identity(request: Request, access: AccessContext = Depends(get_access_context)):
    if not access.user_id or not hasattr(request.state, "supabase_subject"):
        raise HTTPException(401, "決済には会員ログインが必要です。")
    return request.state.supabase_subject


def _origin(request: Request):
    return require_allowed_origin(request)


def _service(request: Request) -> StripeBilling:
    service = getattr(request.app.state, "billing", None)
    if not service:
        raise HTTPException(503, "Stripe決済はまだ設定されていません。")
    return service


@router.get("/status")
def billing_status(request: Request, user_id=Depends(_identity)):
    service = _service(request)
    if not service.configured:
        return {"configured": False, "checkout_enabled": False, "mode": service.mode,
                "customer": False, "subscription": None}
    return {"configured": True, "checkout_enabled": service.checkout_enabled, "mode": service.mode,
            "customer": bool(service.store.customer(user_id)),
            "subscription": service.store.status(user_id)}


@router.post("/checkout")
def checkout(payload: CheckoutRequest, request: Request, user_id=Depends(_identity)):
    origin = _origin(request)
    service = _service(request)
    return {"url": service.checkout(user_id, getattr(request.state, "supabase_email", ""), payload.currency, origin)}


@router.post("/portal")
def portal(request: Request, user_id=Depends(_identity)):
    origin = _origin(request)
    return {"url": _service(request).portal(user_id, origin)}


@router.post("/webhook")
async def webhook(request: Request):
    service = _service(request)
    payload = await request.body()
    if len(payload) > 1_000_000:
        raise HTTPException(413, "Webhook payload is too large")
    event = service.event(payload, request.headers.get("stripe-signature", ""))
    return {"status": service.handle(event)}
