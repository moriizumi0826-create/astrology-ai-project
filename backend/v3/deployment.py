"""Environment boundaries shared by the V3 API routes."""

import os
from urllib.parse import urlsplit

from fastapi import HTTPException, Request


LOCAL_ORIGINS = {"http://127.0.0.1:5176", "http://localhost:5176"}
LOCAL_HOSTS = {"127.0.0.1", "localhost"}


def environment() -> str:
    value = os.environ.get("V3_ENVIRONMENT", "local").strip().lower()
    if value not in {"local", "preview"}:
        raise RuntimeError("V3_ENVIRONMENTはlocalまたはpreviewを指定してください。")
    return value


def _csv(name: str) -> set[str]:
    return {value.strip() for value in os.environ.get(name, "").split(",") if value.strip()}


def allowed_origins() -> set[str]:
    if environment() == "local":
        return LOCAL_ORIGINS
    origins = _csv("V3_ALLOWED_ORIGINS")
    if not origins:
        raise RuntimeError("公開テスト環境にはV3_ALLOWED_ORIGINSが必要です。")
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
        raise RuntimeError("公開テスト環境にはV3_ALLOWED_HOSTSのホスト名が必要です。")
    return hosts


def require_allowed_origin(request: Request, message: str = "V3の画面から操作してください。") -> str:
    origin = request.headers.get("origin", "")
    if origin not in request.app.state.v3_allowed_origins:
        raise HTTPException(403, message)
    return origin
