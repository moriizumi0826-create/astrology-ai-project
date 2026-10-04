"""Explicit V3 route adapters; never mount the legacy app or admin endpoints."""
from datetime import timedelta, datetime, timezone, time
import sqlite3
from zoneinfo import ZoneInfo
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from backend.app import main as legacy
from backend.app.schemas import LocationSearchResponse, ReadingRequest, TransitChartRequest, TransitChartsRequest
from backend.v3.access import AccessSnapshot, get_access_snapshot, require_paid_access
from backend.v3.horoscope import generate_horoscope
from backend.v3.location_search import search_locations
from backend.v3.rate_limit import check_request_limit
from backend.v3.deployment import require_allowed_origin

router = APIRouter(prefix="/api/v3")


class AspectDetailRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    transit_planet: str = Field(pattern=r"^[A-Z_]{1,24}$")
    natal_planet: str = Field(pattern=r"^[A-Z_]{1,24}$")
    angle: int = Field(ge=0, le=180)
    natal_house: int = Field(ge=1, le=12)
    retrograde: bool
    orb_status: Literal["Applying", "Separating", "Exact"] = "Applying"


@router.post("/aspect-interpretation-detail")
def aspect_interpretation_detail(payload: AspectDetailRequest, request: Request,
                                 access: AccessSnapshot = Depends(require_paid_access)):
    require_allowed_origin(request)
    row = legacy.reading_service.get_aspect_interpretation(
        t_planet=payload.transit_planet, n_planet=payload.natal_planet,
        angle=payload.angle, house=payload.natal_house,
        is_retrograde=payload.retrograde, orb_status=payload.orb_status,
    )
    return {"description": legacy.reading_service._safe_text(row, "Text_Description")}


class LocationSearchPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    q: str = Field(min_length=1, max_length=100)
    prefecture: str | None = None
    country_code: str = "JP"
    limit: int = Field(default=5, ge=1, le=10)


@router.post("/readings")
def horoscope(payload: ReadingRequest):
    try:
        return legacy._attach_master_version(generate_horoscope(payload))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/location-search", response_model=LocationSearchResponse)
def location_search(payload: LocationSearchPayload, request: Request):
    check_request_limit(request, "location")
    try:
        return LocationSearchResponse(results=search_locations(
            query=payload.q,
            prefecture=payload.prefecture,
            country_code=payload.country_code,
            limit=payload.limit,
        ))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except (RuntimeError, sqlite3.Error) as exc:
        raise HTTPException(status_code=503, detail="出生地検索を一時的に利用できません。") from exc


for path, endpoint in [
    ("/master-version", legacy.master_version),
    ("/aspect-interpretations", legacy.v2_aspect_interpretations),
]:
    router.add_api_route(path, endpoint, methods=["GET"])

class V3TransitChartRequest(TransitChartRequest):
    # Keep the legacy and bulk endpoints on their existing ten-minute contract.
    target_utc_datetime: datetime | None = None

    @field_validator('target_time')
    @classmethod
    def validate_target_time_step(cls, value: time):
        if value.microsecond or value.tzinfo:
            raise ValueError('target_time must be a local time with second precision')
        return value

    @model_validator(mode='after')
    def verify_event_instant(self):
        if self.target_utc_datetime is not None:
            if self.target_utc_datetime.tzinfo is None or self.target_utc_datetime.microsecond:
                raise ValueError('target_utc_datetime must include a timezone and whole seconds')
            local = self.target_utc_datetime.astimezone(ZoneInfo(self.display_timezone_name or 'Asia/Tokyo'))
            if local.date() != self.target_date or local.time().replace(tzinfo=None) != self.target_time:
                raise ValueError('event instant does not match target date/time')
        return self


@router.post("/transit-chart")
def single_chart(payload: V3TransitChartRequest, request: Request):
    check_request_limit(request, "single")
    instant = payload.target_utc_datetime
    if instant:
        local = instant.astimezone(ZoneInfo(payload.display_timezone_name or 'Asia/Tokyo'))
        utc = instant.astimezone(timezone.utc)
        chart = legacy.create_transit_chart(payload.model_copy(update={
            'target_date':utc.date(), 'target_time':utc.time().replace(tzinfo=None), 'display_timezone_name':'UTC'}))
        return {**chart, 'date':payload.target_date.isoformat(), 'time':payload.target_time.strftime('%H:%M:%S') if payload.target_time.second else payload.target_time.strftime('%H:%M'),
                'display_timezone_name':payload.display_timezone_name, 'timezone_offset':local.utcoffset().total_seconds()/3600,
                'time_adjustment':None}
    chart = legacy.create_transit_chart(payload)
    return {**chart, 'time':payload.target_time.strftime('%H:%M:%S') if payload.target_time.second else payload.target_time.strftime('%H:%M')}


@router.post("/transit-charts")
def playback_charts(payload: TransitChartsRequest, request: Request, access: AccessSnapshot = Depends(get_access_snapshot)):
    if access.capabilities.playback_policy != "paid_existing":
        today = access.checked_at.astimezone(ZoneInfo(payload.display_timezone_name or "Asia/Tokyo")).date()
        first, last = today - timedelta(days=30), today + timedelta(days=30)
        if any(day < first or day > last for day in payload.target_dates):
            raise HTTPException(403, f"無料版の連続再生は今日±30日（{first}〜{last}）です。単日のチャートは自由に選択できます。")
    category = "year" if len(set(payload.target_dates)) > 31 else "month"
    check_request_limit(request, category, access.user_id)
    return legacy.create_transit_charts(payload)

for path, endpoint in [
    ("/paid-reading", legacy.create_reading),
    ("/readings/deferred", legacy.create_deferred_reading_widgets),
    ("/yearly-forecast", legacy.create_yearly_forecast),
    ("/yearly-forecast/detail", legacy.create_yearly_forecast_detail),
]:
    router.add_api_route(path, endpoint, methods=["POST"], dependencies=[Depends(require_paid_access)])
