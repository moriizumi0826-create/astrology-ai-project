"""One private birth profile per authenticated account, with optimistic locking."""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from backend.app.schemas import ReadingRequest
from backend.v3.access import AccessContext, get_access_context
from backend.v3.deployment import require_allowed_origin

router = APIRouter(prefix="/api/v3/profile")


class BirthProfile(ReadingRequest):
    model_config = ConfigDict(extra="forbid")
    birth_country: str | None = Field(default=None, max_length=100)
    birth_prefecture: str | None = Field(default=None, max_length=100)

    @field_validator("timezone_name")
    @classmethod
    def valid_birth_zone(cls, value):
        if value:
            try:
                ZoneInfo(value)
            except (ZoneInfoNotFoundError, ValueError):
                raise ValueError("出生地のタイムゾーンが正しくありません") from None
        return value


class SaveProfile(BaseModel):
    model_config = ConfigDict(extra="forbid")
    profile: BirthProfile
    expected_revision: int | None = Field(default=None, ge=1)


def identity(request: Request, access: AccessContext = Depends(get_access_context)):
    if not access.user_id or not hasattr(request.state, "supabase_subject"):
        raise HTTPException(401, "出生情報の保存には会員ログインが必要です。")
    return request.state.supabase_subject, request.state.supabase_token


def check_origin(request: Request):
    require_allowed_origin(request)


@router.get("")
def load(request: Request, owner=Depends(identity)):
    subject, token = owner
    rows = request.app.state.supabase_auth.request("GET", "/rest/v1/v3_birth_profiles", token,
        params={"user_id": f"eq.{subject}", "select": "profile,revision", "limit": "1"})
    return {"saved": rows[0] if rows else None}


@router.put("")
def save(payload: SaveProfile, request: Request, owner=Depends(identity)):
    check_origin(request)
    subject, token = owner
    # Only birth inputs are durable. Display timezone, chart date and paid results are not profiles.
    body = {"profile": payload.profile.model_dump(mode="json", exclude={"display_timezone_name", "target_date"})}
    if payload.expected_revision is None:
        method, params = "POST", {}
        body["user_id"] = subject
    else:
        method, params = "PATCH", {"user_id": f"eq.{subject}", "revision": f"eq.{payload.expected_revision}"}
    rows = request.app.state.supabase_auth.request(method, "/rest/v1/v3_birth_profiles", token,
        params={**params, "select": "profile,revision"}, json=body)
    if not rows:
        raise HTTPException(409, "別の画面で出生情報が更新されています。再読み込みしてから変更してください。")
    return {"saved": rows[0]}
