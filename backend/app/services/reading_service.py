import csv
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

from openai import OpenAI

from backend.app.schemas import ReadingMeta, ReadingRequest, ReadingResponse, ReadingSection
from backend.app.services.chart_calculator import BirthInput, build_chart_rows, write_chart_csvs
from backend.app.settings import settings


PROJECT_ROOT = Path(__file__).resolve().parents[3]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.natal_loader import build_natal_chart_data  # noqa: E402
from scripts.transit_loader import load_transit_support_data  # noqa: E402


READING_TITLES = {
    "personality": "Natal Blueprint",
    "love": "Relational Pattern",
    "career": "Career Axis",
}


def load_prompt_rows(prompt_file: Path) -> list[dict]:
    with prompt_file.open("r", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        raise ValueError(f"Prompt CSV is empty: {prompt_file}")
    return [row for row in rows if row["type"] != "transit"]


def generate_readings(payload: ReadingRequest) -> ReadingResponse:
    if not settings.openai_api_key:
        raise ValueError("OPENAI_API_KEY is not configured.")

    birth_input = BirthInput(
        full_name=payload.full_name,
        birth_date=payload.birth_date.isoformat(),
        birth_time=payload.birth_time.strftime("%H:%M"),
        birthplace=payload.birthplace,
        latitude=payload.latitude,
        longitude=payload.longitude,
        timezone_offset=payload.timezone_offset,
    )

    chart_rows = build_chart_rows(birth_input)
    client = OpenAI(api_key=settings.openai_api_key)
    prompt_file = PROJECT_ROOT / "database" / "ai_prompt.csv"

    with TemporaryDirectory(prefix="chart_run_") as tmp:
        temp_dir = Path(tmp)
        files = write_chart_csvs(chart_rows, temp_dir)
        chart_data = build_natal_chart_data(files["planets"], files["angles"], files["houses"])
        transit_data = load_transit_support_data(files["aspects"], files["houses"])

    prompt_rows = load_prompt_rows(prompt_file)
    readings = []
    for row in prompt_rows:
        prompt_type = row["type"]
        final_prompt = row["prompt"].format(**chart_data)
        response = client.responses.create(
            model=settings.openai_model,
            input=final_prompt,
        )
        readings.append(
            ReadingSection(
                type=prompt_type,
                title=READING_TITLES.get(prompt_type, prompt_type),
                content=response.output_text,
            )
        )

    return ReadingResponse(
        meta=ReadingMeta(
            full_name=payload.full_name,
            birthplace=payload.birthplace,
            birth_date=payload.birth_date.isoformat(),
            birth_time=payload.birth_time.strftime("%H:%M"),
            timezone_offset=payload.timezone_offset,
        ),
        chart_data=chart_data,
        readings=readings,
        transit_ready=bool(transit_data.get("aspect_map")) and bool(transit_data.get("house_map")),
    )
