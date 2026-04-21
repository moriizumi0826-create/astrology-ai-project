from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from backend.app.schemas import ReadingRequest
from backend.app.services import reading_service
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
