"""Local-only V3 API shell. Deliberately does not mount the legacy API."""

from ipaddress import ip_address

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.responses import JSONResponse

from backend.v3.access import AccessSnapshot, get_access_snapshot
from backend.v3.routes import router
from backend.v3.test_login import LocalTestAuth, router as test_auth_router
from backend.app.main import lifespan
from starlette.middleware.gzip import GZipMiddleware
from backend.v3.supabase_auth import SupabaseAuth
from backend.v3.profiles import router as profile_router
from backend.v3.billing import BillingStore, StripeBilling, router as billing_router
from backend.v3.accounts import router as account_router
from backend.v3.deployment import (
    allowed_hosts,
    allowed_origins,
    billing_enabled,
    environment,
    require_expected_supabase_project,
)


API_SECURITY_HEADERS = {
    "Content-Security-Policy": "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
}


def create_app(*, auth_mode: str | None = None) -> FastAPI:
    deployment = environment()
    origins = allowed_origins()
    hosts = allowed_hosts()
    app = FastAPI(title=f"Celestial Atelier V3 — {deployment}", docs_url=None, redoc_url=None, lifespan=lifespan)
    app.state.v3_environment = deployment
    app.state.v3_allowed_origins = origins
    provider = None if auth_mode == "local_test" else SupabaseAuth(deployment)
    if deployment != "local" and (provider is None or not provider.configured):
        raise RuntimeError("公開環境にはSupabase認証設定が必要です。")
    if provider is not None and provider.configured:
        require_expected_supabase_project(deployment, provider.project)
        app.state.supabase_auth = provider
        app.state.billing = StripeBilling(
            BillingStore(provider.url, deployment),
            deployment,
            checkout_enabled=billing_enabled(deployment),
        )
    else:
        app.state.local_test_auth = LocalTestAuth()
    app.add_middleware(GZipMiddleware, minimum_size=1000)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=sorted(hosts))
    app.add_middleware(
        CORSMiddleware,
        allow_origins=sorted(origins),
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Content-Type", "Authorization"],
    )

    @app.middleware("http")
    async def local_only(request: Request, call_next):
        if deployment == "local":
            try:
                local = request.client is not None and ip_address(request.client.host).is_loopback
            except ValueError:
                local = False
            if not local:
                return JSONResponse({"detail": "Local V3 only"}, status_code=403)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        for name, value in API_SECURITY_HEADERS.items():
            response.headers[name] = value
        if deployment != "local":
            response.headers["Strict-Transport-Security"] = "max-age=31536000"
        return response

    @app.get("/api/v3/health")
    def health():
        return {"status": "ok", "environment": deployment, "stage": 6}

    @app.get("/api/v3/auth/config")
    def auth_config():
        auth = getattr(app.state, "supabase_auth", None)
        return ({"mode": "supabase", "url": auth.url, "publishable_key": auth.key}
                if auth else {"mode": "local_test"})

    @app.get("/api/v3/session", response_model=AccessSnapshot)
    def session(access: AccessSnapshot = Depends(get_access_snapshot)):
        return access

    app.include_router(router)
    app.include_router(profile_router)
    app.include_router(billing_router)
    app.include_router(account_router)
    if deployment == "local" and not hasattr(app.state, "supabase_auth"):
        app.include_router(test_auth_router)
    return app


app = create_app()
