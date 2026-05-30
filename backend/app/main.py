from datetime import date, time

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from backend.app.schemas import LocationSearchResponse, ReadingRequest
from backend.app.services import geocoding_service, reading_service, yearly_forecast_service
from backend.app.settings import settings


app = FastAPI(title="Celestial Atelier API", version="0.1.0")

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
def create_reading(payload: ReadingRequest):
    try:
        return reading_service.generate_readings(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Internal server error: {exc}") from exc


@app.post("/api/yearly-forecast")
def create_yearly_forecast(payload: ReadingRequest, year: int = Query(default=2026, ge=2015, le=2028)):
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
        return yearly_forecast_service.generate_yearly_forecast(birth_input, year)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Internal server error: {exc}") from exc
