"""Read-only production Supabase boundary check.

Requires the V3 production environment variables. No key values are printed.
"""

from __future__ import annotations

import os
import sys
from urllib.parse import urlparse

import httpx


TABLES = (
    ("v3_birth_profiles", "user_id"),
    ("v3_billing_customers", "user_id"),
    ("v3_subscriptions", "stripe_subscription_id"),
    ("v3_stripe_events", "stripe_event_id"),
)


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


def configuration() -> tuple[str, str, str]:
    if required("V3_ENVIRONMENT") != "production":
        raise RuntimeError("This verifier runs only with V3_ENVIRONMENT=production")
    project = required("V3_SUPABASE_PROJECT_REF")
    url = required("V3_SUPABASE_URL").rstrip("/")
    publishable = required("V3_SUPABASE_PUBLISHABLE_KEY")
    secret = required("V3_SUPABASE_SECRET_KEY")
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != f"{project}.supabase.co" or parsed.path:
        raise RuntimeError("V3_SUPABASE_URL does not match V3_SUPABASE_PROJECT_REF")
    if not publishable.startswith("sb_publishable_"):
        raise RuntimeError("V3_SUPABASE_PUBLISHABLE_KEY must be a publishable key")
    if not secret.startswith("sb_secret_"):
        raise RuntimeError("V3_SUPABASE_SECRET_KEY must be a server-only secret key")
    return url, publishable, secret


def request(url: str, key: str, table: str, column: str) -> int:
    response = httpx.get(
        f"{url}/rest/v1/{table}",
        headers={"apikey": key, "User-Agent": "celestial-atelier-v3-production-verifier"},
        params={"select": column, "limit": "0"},
        timeout=15,
        follow_redirects=False,
    )
    return response.status_code


def main() -> int:
    try:
        url, publishable, secret = configuration()
        failures: list[str] = []
        for table, column in TABLES:
            public_status = request(url, publishable, table, column)
            secret_status = request(url, secret, table, column)
            public_blocked = public_status in {401, 403}
            secret_allowed = secret_status == 200
            print(f"{table}: browser={'BLOCKED' if public_blocked else 'FAIL'} server={'OK' if secret_allowed else 'FAIL'}")
            if not public_blocked:
                failures.append(f"{table} browser status={public_status}")
            if not secret_allowed:
                failures.append(f"{table} server status={secret_status}")
        if failures:
            print("Supabase boundary check failed: " + "; ".join(failures), file=sys.stderr)
            return 1
        print("Supabase production boundary check passed.")
        return 0
    except (RuntimeError, httpx.RequestError) as exc:
        print(f"Supabase boundary check could not run: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
