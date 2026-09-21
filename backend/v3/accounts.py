"""Self-service account deletion with recent authentication and billing safeguards."""
import base64
import json
import time
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict

from backend.v3.access import AccessContext, get_access_context
from backend.v3.deployment import require_allowed_origin


router = APIRouter(prefix="/api/v3/account")
BLOCKING_SUBSCRIPTION_STATUSES = {
    "active", "trialing", "past_due", "unpaid", "paused", "incomplete",
}
RECENT_AUTH_SECONDS = 10 * 60


class DeleteAccount(BaseModel):
    model_config = ConfigDict(extra="forbid")
    confirmation: Literal["アカウントを削除"]


def identity(request: Request, access: AccessContext = Depends(get_access_context)):
    if not access.user_id or not hasattr(request.state, "supabase_subject"):
        raise HTTPException(401, "アカウント管理には会員ログインが必要です。")
    return request.state.supabase_subject


def require_recent_auth(request: Request):
    token = getattr(request.state, "supabase_token", "")
    try:
        encoded = token.split(".")[1]
        encoded += "=" * (-len(encoded) % 4)
        issued_at = int(json.loads(base64.urlsafe_b64decode(encoded))["iat"])
    except (IndexError, KeyError, TypeError, ValueError, json.JSONDecodeError):
        raise HTTPException(401, "安全確認のため、パスワードを入力して再認証してください。") from None
    age = int(time.time()) - issued_at
    if age < -60 or age > RECENT_AUTH_SECONDS:
        raise HTTPException(401, "安全確認のため、パスワードを入力して再認証してください。")


@router.delete("")
def delete_account(payload: DeleteAccount, request: Request, user_id=Depends(identity)):
    require_allowed_origin(request)
    require_recent_auth(request)
    billing = getattr(request.app.state, "billing", None)
    store = getattr(billing, "store", None)
    if not store or not getattr(store, "configured", False):
        raise HTTPException(503, "アカウント削除の設定が完了していません。")
    subscription = store.status(user_id)
    if subscription and subscription.get("status") in BLOCKING_SUBSCRIPTION_STATUSES:
        raise HTTPException(409, "契約または支払い処理が残っています。契約管理画面で解約・支払い状態を確認し、利用期間終了後に削除してください。")
    store.delete_auth_user(user_id)
    return {"deleted": True}
