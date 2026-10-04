"""Generate fictional birth-data fixture locally; no member or production data."""
import json
from pathlib import Path
from backend.app.schemas import ReadingRequest
from backend.app.services.reading_service import generate_readings

request = ReadingRequest(full_name="サンプル", birth_date="1990-09-01", birth_time="12:00", birthplace="東京都", latitude=35.681, longitude=139.767, timezone_name="Asia/Tokyo", display_timezone_name="Asia/Tokyo", target_date="2026-10-04")
data = generate_readings(request).model_dump(mode="json")["dashboard_data"]
# Only the daily cards needed by the screenshot; omit chart/yearly datasets.
keys = ("reading_date", "dailyStarVibe", "aspectHighlights", "dailyPerformance", "celestial_event_calendar", "daily_vibe", "countdown", "nextStellarEvent", "weekly_aspects")
Path("artifacts/forecast-preview-sample.json").write_text(json.dumps({key: data[key] for key in keys if key in data}, ensure_ascii=False), encoding="utf-8")
print("Fictional daily fixture generated.")
