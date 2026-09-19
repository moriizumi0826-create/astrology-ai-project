"""Provider-independent access contract. Only server-side providers set context."""

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal

from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel


@dataclass(frozen=True)
class AccessContext:
    # Future authentication adapter supplies a verified internal account ID.
    user_id: str | None = None
    entitlement: Literal["none", "active", "checking", "unavailable"] = "none"
    valid_until: datetime | None = None


class Capabilities(BaseModel):
    horoscope: bool = True
    single_chart_any_date: bool = True
    brief_report: bool = True
    aspect_list: bool = False
    compound_aspects: bool = False
    stellar_forecast: bool = False
    playback_policy: Literal["today_plus_minus_15", "paid_existing"] = "today_plus_minus_15"


class AccessSnapshot(BaseModel):
    state: Literal["anonymous", "free", "paid", "checking", "unavailable"]
    user_id: str | None
    checked_at: datetime
    valid_until: datetime | None = None
    capabilities: Capabilities


def evaluate_access(context: AccessContext, now: datetime) -> AccessSnapshot:
    if now.utcoffset() is None:
        raise ValueError("Access evaluation requires an aware server timestamp")
    user_id = (context.user_id or "").strip() or None
    state = "anonymous" if user_id is None else "free"
    valid_until = None
    if user_id:
        if context.entitlement in ("checking", "unavailable"):
            state = context.entitlement
        elif context.entitlement == "active":
            if context.valid_until is None or context.valid_until.utcoffset() is None:
                state = "unavailable"
            elif context.valid_until > now:
                state = "paid"
                valid_until = context.valid_until
    paid = state == "paid"
    return AccessSnapshot(
        state=state,
        user_id=user_id,
        checked_at=now,
        valid_until=valid_until,
        capabilities=Capabilities(
            aspect_list=paid,
            compound_aspects=paid,
            stellar_forecast=paid,
            playback_policy="paid_existing" if paid else "today_plus_minus_15",
        ),
    )


def get_access_context(request: Request) -> AccessContext:
    provider = getattr(request.app.state, "supabase_auth", None)
    if provider is not None:
        # Stage 5 establishes identity, not payment. Never read plan from user metadata.
        user_id = provider.authenticate(request)
        if not user_id:
            return AccessContext()
        billing = getattr(request.app.state, "billing", None)
        if billing is not None and billing.configured:
            try:
                entitlement, valid_until = billing.store.entitlement(request.state.supabase_subject)
            except HTTPException as exc:
                if exc.status_code != 503:
                    raise
                return AccessContext(user_id=user_id, entitlement="unavailable")
            return AccessContext(user_id=user_id, entitlement=entitlement, valid_until=valid_until)
        return AccessContext(user_id=user_id)
    # Only an opaque server-issued local cookie can select the test account.
    # The app owning this store refuses non-local environments and clients.
    auth = getattr(request.app.state, "local_test_auth", None)
    return auth.context(request.cookies.get("v3_local_test_session")) if auth else AccessContext()


def get_access_snapshot(context: AccessContext = Depends(get_access_context)) -> AccessSnapshot:
    return evaluate_access(context, datetime.now(timezone.utc))


def require_paid_access(access: AccessSnapshot = Depends(get_access_snapshot)) -> AccessSnapshot:
    if access.state in ("checking", "unavailable"):
        raise HTTPException(status_code=503, detail="利用資格を確認できません。再度お試しください。")
    if access.state != "paid":
        raise HTTPException(
            status_code=401 if access.state == "anonymous" else 403,
            detail="この機能にはログインと有料利用資格が必要です。",
        )
    return access
