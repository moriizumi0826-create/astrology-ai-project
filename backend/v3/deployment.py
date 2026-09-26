"""Environment boundaries shared by the V3 API routes."""

import os
from urllib.parse import urlsplit
from uuid import UUID

from fastapi import HTTPException, Request


LOCAL_ORIGINS = {"http://127.0.0.1:5176", "http://localhost:5176"}
LOCAL_HOSTS = {"127.0.0.1", "localhost"}
PUBLIC_ENVIRONMENTS = {"preview", "production"}


def environment() -> str:
    value = os.environ.get("V3_ENVIRONMENT", "local").strip().lower()
    if value not in {"local", *PUBLIC_ENVIRONMENTS}:
        raise RuntimeError("V3_ENVIRONMENTはlocal、preview、productionのいずれかを指定してください。")
    return value


def billing_enabled(deployment: str) -> bool:
    raw = os.environ.get("V3_BILLING_ENABLED", "").strip().lower()
    if not raw:
        # A production deployment must be explicitly opened for new sales.
        return deployment != "production"
    if raw not in {"true", "false"}:
        raise RuntimeError("V3_BILLING_ENABLEDはtrueまたはfalseを指定してください。")
    return raw == "true"


def billing_checkout_access(deployment: str) -> tuple[str, str | None]:
    default_mode = "single_user" if deployment == "production" else "public"
    mode = os.environ.get("V3_BILLING_ACCESS_MODE", "").strip().lower() or default_mode
    if mode not in {"single_user", "public"}:
        raise RuntimeError("V3_BILLING_ACCESS_MODEはsingle_userまたはpublicを指定してください。")
    raw_user_id = os.environ.get("V3_BILLING_ALLOWED_USER_ID", "").strip()
    if mode == "public" and raw_user_id:
        raise RuntimeError("publicで申し込みを開放する前にV3_BILLING_ALLOWED_USER_IDを空にしてください。")
    if not raw_user_id:
        return mode, None
    try:
        allowed_user_id = str(UUID(raw_user_id))
    except (ValueError, AttributeError):
        raise RuntimeError("V3_BILLING_ALLOWED_USER_IDには会員のUUIDを指定してください。") from None
    return mode, allowed_user_id


def _csv(name: str) -> set[str]:
    return {value.strip() for value in os.environ.get(name, "").split(",") if value.strip()}


def allowed_origins() -> set[str]:
    if environment() == "local":
        return LOCAL_ORIGINS
    origins = _csv("V3_ALLOWED_ORIGINS")
    if not origins:
        raise RuntimeError("公開環境にはV3_ALLOWED_ORIGINSが必要です。")
    for origin in origins:
        parsed = urlsplit(origin)
        if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
                or parsed.path not in ("", "/") or parsed.query or parsed.fragment):
            raise RuntimeError("V3_ALLOWED_ORIGINSにはHTTPSのオリジンだけを指定してください。")
    return origins


def allowed_hosts() -> set[str]:
    if environment() == "local":
        return LOCAL_HOSTS
    hosts = _csv("V3_ALLOWED_HOSTS")
    if not hosts or any("://" in host or "/" in host for host in hosts):
        raise RuntimeError("公開環境にはV3_ALLOWED_HOSTSのホスト名が必要です。")
    return hosts


def require_expected_supabase_project(deployment: str, project: str) -> None:
    expected = os.environ.get("V3_SUPABASE_PROJECT_REF", "").strip()
    if deployment == "production" and not expected:
        raise RuntimeError("productionにはV3_SUPABASE_PROJECT_REFが必要です。")
    if expected and expected != project:
        raise RuntimeError("V3_SUPABASE_PROJECT_REFとSupabase Project URLが一致しません。")


def require_allowed_origin(request: Request, message: str = "V3の画面から操作してください。") -> str:
    origin = request.headers.get("origin", "")
    if origin not in request.app.state.v3_allowed_origins:
        raise HTTPException(403, message)
    return origin
