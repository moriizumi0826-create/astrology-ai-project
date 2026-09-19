"""Explicit local integration-test entry; no HTTP/account-state switch."""
import argparse
from datetime import datetime, timedelta, timezone
import uvicorn
from backend.v3.app import create_app
from backend.v3.access import AccessContext, get_access_context


def create_preview_app(plan):
    if plan not in ("anonymous", "free", "paid"):
        raise ValueError("Unknown local test state")
    app = create_app(auth_mode="local_test")  # retains local environment, client and Host restrictions
    def context():
        if plan == "anonymous":
            return AccessContext()
        return AccessContext("local-preview-member", "active" if plan == "paid" else "none",
                             datetime.now(timezone.utc) + timedelta(hours=1) if plan == "paid" else None)
    app.dependency_overrides[get_access_context] = context
    return app


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Local-only V3 integration testing")
    parser.add_argument("--plan", required=True, choices=["anonymous", "free", "paid"])
    parser.add_argument("--port", type=int, default=8103)
    args = parser.parse_args()
    uvicorn.run(create_preview_app(args.plan), host="127.0.0.1", port=args.port, proxy_headers=False)
