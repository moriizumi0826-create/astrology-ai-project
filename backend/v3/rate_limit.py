"""Small per-process limits for V3 map requests; no billing or webhook routes."""

from collections import OrderedDict, deque
from ipaddress import ip_address
from math import ceil
from threading import Lock
from time import monotonic

from fastapi import HTTPException, Request


# Sliding windows. A batch counts as one request, not one request per date.
LIMITS = {
    "location": ((60, 30),),
    "single": ((60, 60),),
    "month": ((60, 12),),
    "year": ((60, 4), (3600, 24)),
}
LIMIT_MESSAGE = "操作が続いています。少し待ってから再試行してください。"


def rate_limit_subject(request: Request, user_id: str | None = None) -> str:
    if user_id:
        return f"user:{user_id}"
    # Render's public edge overwrites this header. Never trust caller-provided
    # X-Forwarded-For, or CF-Connecting-IP in a local test environment.
    if getattr(request.app.state, "v3_environment", "local") != "local":
        header = request.headers.get("cf-connecting-ip", "")
        try:
            return f"ip:{ip_address(header.strip()).compressed}"
        except ValueError:
            pass
    try:
        return f"ip:{ip_address(request.client.host).compressed}"
    except (AttributeError, ValueError):
        return "ip:unknown"


class SlidingWindowLimiter:
    def __init__(self, *, clock=monotonic, max_subjects=8192):
        self.clock = clock
        self.max_subjects = max_subjects
        self._lock = Lock()
        self._calls = OrderedDict()

    def check(self, category: str, subject: str) -> None:
        windows = LIMITS[category]
        longest = max(seconds for seconds, _ in windows)
        key = (category, subject)
        with self._lock:
            now = self.clock()
            calls = self._calls.get(key)
            if calls is None:
                if len(self._calls) >= self.max_subjects:
                    self._calls.popitem(last=False)
                calls = deque()
                self._calls[key] = calls
            self._calls.move_to_end(key)
            while calls and calls[0] <= now - longest:
                calls.popleft()
            retry_after = 0
            for seconds, limit in windows:
                recent = [timestamp for timestamp in calls if timestamp > now - seconds]
                if len(recent) >= limit:
                    retry_after = max(retry_after, ceil(recent[-limit] + seconds - now))
            if retry_after:
                raise HTTPException(429, LIMIT_MESSAGE, headers={"Retry-After": str(max(1, retry_after))})
            calls.append(now)


def check_request_limit(request: Request, category: str, user_id: str | None = None) -> None:
    request.app.state.v3_rate_limiter.check(category, rate_limit_subject(request, user_id))
