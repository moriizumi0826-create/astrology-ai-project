"""Disposable local test login. Never an authentication provider for production."""
import os
import secrets
from collections import deque
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import Lock

from dotenv import dotenv_values
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from backend.v3.access import AccessContext, evaluate_access

COOKIE = "v3_local_test_session"
TTL = timedelta(hours=8)
ORIGINS = {f"http://{host}:{port}" for host in ("127.0.0.1", "localhost") for port in (5176, 8103)}
router = APIRouter(prefix="/api/v3/test-auth")


class Credentials(BaseModel):
    login_id: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1, max_length=128)


class LocalTestAuth:
    def __init__(self):
        config = dotenv_values(Path(__file__).resolve().parents[2] / ".env.v3.local")
        self.login_id = os.environ.get("V3_TEST_LOGIN_ID", config.get("V3_TEST_LOGIN_ID")) or ""
        self.password = os.environ.get("V3_TEST_LOGIN_PASSWORD", config.get("V3_TEST_LOGIN_PASSWORD")) or ""
        self.sessions = {}
        self.attempts = deque(maxlen=10)
        self.lock = Lock()

    def context(self, token):
        with self.lock:
            now = datetime.now(timezone.utc)
            self.sessions = {key: expiry for key, expiry in self.sessions.items() if expiry > now}
            expiry = self.sessions.get(token)
            return AccessContext("local-test-user", "active", expiry) if expiry else AccessContext()

    def login(self, credentials, old_token):
        with self.lock:
            now = datetime.now(timezone.utc)
            if not self.login_id or not self.password:
                raise HTTPException(503, "ローカルのテストログイン設定がありません。")
            if len(self.attempts) == 10 and (now - self.attempts[0]).total_seconds() < 60:
                raise HTTPException(429, "しばらく待ってから再試行してください。")
            self.attempts.append(now)
            valid_id = secrets.compare_digest(credentials.login_id.encode(), self.login_id.encode())
            valid_password = secrets.compare_digest(credentials.password.encode(), self.password.encode())
            if not (valid_id and valid_password):
                raise HTTPException(401, "IDまたはパスワードが違います。")
            self.sessions = {key: expiry for key, expiry in self.sessions.items() if expiry > now}
            self.sessions.pop(old_token, None)
            if len(self.sessions) >= 128:
                raise HTTPException(429, "検証セッションが上限に達しました。バックエンドを再起動してください。")
            token = secrets.token_urlsafe(32)
            self.sessions[token] = now + TTL
            return token

    def logout(self, token):
        with self.lock:
            self.sessions.pop(token, None)


def check_origin(request):
    if request.headers.get("origin") not in ORIGINS:
        raise HTTPException(403, "V3ローカル画面から操作してください。")


@router.post("/login")
def login(credentials: Credentials, request: Request, response: Response):
    check_origin(request)
    auth = request.app.state.local_test_auth
    token = auth.login(credentials, request.cookies.get(COOKIE))
    response.set_cookie(COOKIE, token, max_age=int(TTL.total_seconds()), httponly=True,
                        secure=False, samesite="strict", path="/api/v3")
    return evaluate_access(auth.context(token), datetime.now(timezone.utc))


@router.post("/logout")
def logout(request: Request, response: Response):
    check_origin(request)
    request.app.state.local_test_auth.logout(request.cookies.get(COOKIE))
    response.delete_cookie(COOKIE, path="/api/v3", httponly=True, samesite="strict")
    return evaluate_access(AccessContext(), datetime.now(timezone.utc))
