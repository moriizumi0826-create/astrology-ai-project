import hashlib
import json
from datetime import date, datetime, time, timezone

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware

from backend.app.schemas import LocationSearchResponse, ReadingRequest, TransitChartRequest
from backend.app.services import geocoding_service, reading_service, yearly_forecast_service
from backend.app.settings import settings


app = FastAPI(title="Celestial Atelier API", version="0.1.0")

app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.api_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root() -> dict:
    return {"message": "Celestial Atelier API", "health": "/api/health", "docs": "/docs"}


@app.get("/api/health")
def health_check() -> dict:
    return {"status": "ok"}


def _master_version_payload() -> dict:
    paths = [
        *reading_service.master_csv_paths_for_version(),
        *yearly_forecast_service.yearly_csv_paths_for_version(),
    ]
    entries = []
    latest_mtime = 0.0
    for path in sorted(paths, key=lambda item: str(item)):
        if path.exists():
            stat = path.stat()
            latest_mtime = max(latest_mtime, stat.st_mtime)
            entries.append(
                {
                    "path": str(
                        path.relative_to(reading_service.PROJECT_ROOT)
                        if path.is_relative_to(reading_service.PROJECT_ROOT)
                        else path
                    ),
                    "mtime_ns": stat.st_mtime_ns,
                    "size": stat.st_size,
                }
            )
        else:
            entries.append({"path": str(path), "mtime_ns": None, "size": None})
    source = json.dumps(entries, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    master_version = hashlib.sha256(source.encode("utf-8")).hexdigest()[:16]
    updated_at = datetime.fromtimestamp(latest_mtime, timezone.utc).isoformat() if latest_mtime else None
    return {
        "masterVersion": master_version,
        "master_version": master_version,
        "updatedAt": updated_at,
        "updated_at": updated_at,
        "fileCount": len(entries),
        "file_count": len(entries),
    }


@app.get("/api/master-version")
def master_version() -> dict:
    return _master_version_payload()


@app.post("/api/dev/reload-csv")
def reload_csv_masters() -> dict:
    reading_reloaded = reading_service.reload_master_dataframes_if_changed(force=True)
    yearly_reloaded = yearly_forecast_service.reload_yearly_master_caches_if_changed(force=True)
    return {
        "status": "ok",
        "reading_reloaded": reading_reloaded,
        "yearly_reloaded": yearly_reloaded,
        **_master_version_payload(),
    }


def _attach_master_version(payload):
    version_payload = _master_version_payload()
    master_value = version_payload["masterVersion"]
    if hasattr(payload, "master_version"):
        payload.master_version = master_value
    if hasattr(payload, "masterVersion"):
        payload.masterVersion = master_value
    if isinstance(getattr(payload, "dashboard_data", None), dict):
        payload.dashboard_data["master_version"] = master_value
        payload.dashboard_data["masterVersion"] = master_value
    return payload


@app.get("/api/location-search", response_model=LocationSearchResponse)
def location_search(
    q: str = Query(min_length=1, max_length=100),
    prefecture: str | None = Query(default=None),
    birth_date: date | None = Query(default=None),
    birth_time: time | None = Query(default=None),
    birth_time_unknown: bool = Query(default=False),
    limit: int = Query(default=5, ge=1, le=10),
):
    try:
        matches = geocoding_service.search_locations(
            query=q,
            prefecture=prefecture,
            birth_date=birth_date.isoformat() if birth_date else None,
            birth_time=birth_time.strftime("%H:%M") if birth_time else None,
            birth_time_unknown=birth_time_unknown,
            limit=limit,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Location search failed: {exc}") from exc

    return LocationSearchResponse(
        results=[
            {
                "query": match.query,
                "display_name": match.display_name,
                "latitude": match.latitude,
                "longitude": match.longitude,
                "timezone_name": match.timezone_name,
                "timezone_offset": match.timezone_offset,
                "resolved_at": match.resolved_at,
            }
            for match in matches
        ]
    )


@app.post("/api/readings")
def create_reading(payload: ReadingRequest, defer_widgets: bool = False):
    try:
        return _attach_master_version(
            reading_service.generate_readings(payload)
            if not defer_widgets
            else reading_service.generate_readings(payload, include_deferred_widgets=False)
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Internal server error: {exc}") from exc


@app.post("/api/readings/deferred")
def create_deferred_reading_widgets(payload: ReadingRequest):
    try:
        version_payload = _master_version_payload()
        return {
            "dashboard_data": reading_service.generate_deferred_dashboard_widgets(payload),
            "masterVersion": version_payload["masterVersion"],
            "master_version": version_payload["masterVersion"],
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Internal server error: {exc}") from exc


def _yearly_birth_input(payload: ReadingRequest) -> reading_service.BirthInput:
    timezone_offset = payload.timezone_offset
    if timezone_offset is None:
        if not payload.timezone_name:
            raise ValueError("timezone information is missing")
        timezone_offset, _ = geocoding_service.resolve_timezone_offset(
            timezone_name=payload.timezone_name,
            birth_date=payload.birth_date.isoformat(),
            birth_time=payload.birth_time.strftime("%H:%M") if payload.birth_time else None,
            birth_time_unknown=payload.birth_time_unknown,
        )
    return reading_service.BirthInput(
        full_name=payload.full_name,
        birth_date=payload.birth_date.isoformat(),
        birth_time=payload.birth_time.strftime("%H:%M") if payload.birth_time else "",
        birth_time_unknown=payload.birth_time_unknown,
        birthplace=payload.birthplace,
        latitude=payload.latitude,
        longitude=payload.longitude,
        timezone_offset=timezone_offset,
    )


@app.post("/api/yearly-forecast")
def create_yearly_forecast(payload: ReadingRequest, year: int = Query(default=2026, ge=2015, le=2028)):
    try:
        forecast = yearly_forecast_service.generate_yearly_forecast(_yearly_birth_input(payload), year)
        result = yearly_forecast_service.build_yearly_forecast_summary(forecast)
        version_payload = _master_version_payload()
        result["masterVersion"] = version_payload["masterVersion"]
        result["master_version"] = version_payload["masterVersion"]
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Internal server error: {exc}") from exc


@app.post("/api/yearly-forecast/detail")
def create_yearly_forecast_detail(
    payload: ReadingRequest,
    year: int = Query(default=2026, ge=2015, le=2028),
    scope: str = Query(pattern="^(day|month|annual)$"),
    day_date: date | None = Query(default=None, alias="date"),
    month: int | None = Query(default=None, ge=1, le=12),
):
    try:
        forecast = yearly_forecast_service.generate_yearly_forecast(_yearly_birth_input(payload), year)
        return yearly_forecast_service.build_yearly_forecast_detail(
            forecast,
            scope=scope,
            year=year,
            day_date=day_date.isoformat() if day_date else None,
            month=month,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Internal server error: {exc}") from exc


@app.post("/api/transit-chart")
def create_transit_chart(payload: TransitChartRequest):
    try:
        timezone_offset = payload.timezone_offset
        if timezone_offset is None:
            if not payload.timezone_name:
                raise ValueError("timezone information is missing")
            timezone_offset, _ = geocoding_service.resolve_timezone_offset(
                timezone_name=payload.timezone_name,
                birth_date=payload.birth_date.isoformat(),
                birth_time=payload.birth_time.strftime("%H:%M") if payload.birth_time else None,
                birth_time_unknown=payload.birth_time_unknown,
            )

        birth_input = reading_service.BirthInput(
            full_name=payload.full_name,
            birth_date=payload.birth_date.isoformat(),
            birth_time=payload.birth_time.strftime("%H:%M") if payload.birth_time else "",
            birth_time_unknown=payload.birth_time_unknown,
            birthplace=payload.birthplace,
            latitude=payload.latitude,
            longitude=payload.longitude,
            timezone_offset=timezone_offset,
        )
        return yearly_forecast_service.build_transit_chart(
            birth_input,
            payload.target_date,
            payload.target_time,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Internal server error: {exc}") from exc
