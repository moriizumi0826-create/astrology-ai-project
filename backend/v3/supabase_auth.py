"""Supabase adapter. Never trust client metadata or use a service-role key."""
import os
from pathlib import Path
from urllib.parse import urlparse
from uuid import UUID

import httpx
from dotenv import dotenv_values
from fastapi import HTTPException, Request


class SupabaseAuth:
    def __init__(self):
        local = dotenv_values(Path(__file__).resolve().parents[2] / ".env.v3.local")
        self.url = (os.environ.get("V3_SUPABASE_URL", local.get("V3_SUPABASE_URL")) or "").strip().rstrip("/")
        self.key = (os.environ.get("V3_SUPABASE_PUBLISHABLE_KEY", local.get("V3_SUPABASE_PUBLISHABLE_KEY")) or "").strip()
        self.configured = bool(self.url or self.key)
        if self.configured:
            parsed = urlparse(self.url)
            if (parsed.scheme != "https" or not parsed.hostname or not parsed.hostname.endswith(".supabase.co")
                    or parsed.username or parsed.password or parsed.port or parsed.path or parsed.query or parsed.fragment
                    or not self.key.startswith("sb_publishable_")):
                raise RuntimeError("V3 Supabase設定を確認してください。Project URLと公開用Publishable keyが必要です。")
            self.project = parsed.hostname.split(".")[0]

    def request(self, method, path, token, **kwargs):
        try:
            response = httpx.request(method, self.url + path,
                headers={"apikey": self.key, "Authorization": f"Bearer {token}",
                         "Prefer": "return=representation"}, timeout=15, follow_redirects=False, **kwargs)
        except httpx.RequestError:
            raise HTTPException(503, "会員サービスに接続できません。時間をおいて再試行してください。") from None
        if response.status_code in (401, 403):
            raise HTTPException(401, "ログインの有効期限が切れたか、アクセスが許可されていません。再ログインしてください。")
        if response.status_code == 409:
            raise HTTPException(409, "保存済みの出生情報があります。再読み込みして確認してください。")
        if not response.is_success:
            raise HTTPException(503, "会員サービスの設定または通信を確認してください。")
        try:
            return response.json()
        except ValueError:
            raise HTTPException(503, "会員サービスの応答を確認できません。") from None

    def authenticate(self, request: Request):
        header = request.headers.get("authorization", "")
        if not header:
            return None
        scheme, separator, token = header.partition(" ")
        if scheme.lower() != "bearer" or not separator or not token or len(token) > 16384:
            raise HTTPException(401, "ログイン情報が正しくありません。")
        user = self.request("GET", "/auth/v1/user", token)
        try:
            subject = str(UUID(user["id"]))
        except (KeyError, ValueError, TypeError, AttributeError):
            raise HTTPException(503, "会員情報を確認できません。") from None
        if user.get("is_anonymous") or not user.get("email_confirmed_at"):
            raise HTTPException(403, "確認メールのリンクを開いてからログインしてください。")
        request.state.supabase_subject = subject
        request.state.supabase_token = token
        request.state.supabase_email = str(user.get("email") or "").strip()
        # Stable internal account namespace, independent of email and user_metadata.
        return f"supabase:{self.project}:{subject}"
