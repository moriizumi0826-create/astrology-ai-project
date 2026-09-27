"""Explicit V3 route adapters; never mount the legacy app or admin endpoints."""
from datetime import timedelta
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from backend.app import main as legacy
from backend.app.schemas import LocationSearchResponse, ReadingRequest, TransitChartsRequest
from backend.v3.access import AccessSnapshot, get_access_snapshot, require_paid_access
from backend.v3.horoscope import generate_horoscope
from backend.v3.location_search import normalize_prefecture

router = APIRouter(prefix="/api/v3")


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
def location_search(payload: LocationSearchPayload):
    return legacy.location_search(
        q=payload.q,
        prefecture=normalize_prefecture(payload.prefecture, payload.country_code),
        country_code=payload.country_code,
        limit=payload.limit,
        birth_date=None,
        birth_time=None,
        birth_time_unknown=False,
    )


for path, endpoint in [
    ("/master-version", legacy.master_version),
    ("/aspect-interpretations", legacy.v2_aspect_interpretations),
]:
    router.add_api_route(path, endpoint, methods=["GET"])

for path, endpoint in [
    ("/transit-chart", legacy.create_transit_chart),
]:
    router.add_api_route(path, endpoint, methods=["POST"])


@router.post("/transit-charts")
def playback_charts(payload: TransitChartsRequest, access: AccessSnapshot = Depends(get_access_snapshot)):
    if access.capabilities.playback_policy != "paid_existing":
        today = access.checked_at.astimezone(ZoneInfo(payload.display_timezone_name or "Asia/Tokyo")).date()
        first, last = today - timedelta(days=15), today + timedelta(days=15)
        if any(day < first or day > last for day in payload.target_dates):
            raise HTTPException(403, f"無料版の連続再生は今日±15日（{first}〜{last}）です。単日のチャートは自由に選択できます。")
    return legacy.create_transit_charts(payload)

for path, endpoint in [
    ("/paid-reading", legacy.create_reading),
    ("/readings/deferred", legacy.create_deferred_reading_widgets),
    ("/yearly-forecast", legacy.create_yearly_forecast),
    ("/yearly-forecast/detail", legacy.create_yearly_forecast_detail),
]:
    router.add_api_route(path, endpoint, methods=["POST"], dependencies=[Depends(require_paid_access)])
