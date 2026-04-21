import sys
from pathlib import Path
from tempfile import TemporaryDirectory

from backend.app.schemas import ReadingMeta, ReadingRequest, ReadingResponse, ReadingSection
from backend.app.services.chart_calculator import BirthInput, build_chart_rows, write_chart_csvs


PROJECT_ROOT = Path(__file__).resolve().parents[3]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.generate_report import generate_report_from_csvs  # noqa: E402
from scripts.natal_loader import build_natal_chart_data  # noqa: E402
from scripts.transit_loader import load_transit_support_data  # noqa: E402


REPORT_TYPE = "full_report"
REPORT_TITLE = "Full Reading"

UNKNOWN_BIRTH_TIME_LABEL = "Unknown (calculated with 12:00 local time)"


def generate_readings(payload: ReadingRequest) -> ReadingResponse:
    birth_input = BirthInput(
        full_name=payload.full_name,
        birth_date=payload.birth_date.isoformat(),
        birth_time=payload.birth_time.strftime("%H:%M") if payload.birth_time else "",
        birth_time_unknown=payload.birth_time_unknown,
        birthplace=payload.birthplace,
        latitude=payload.latitude,
        longitude=payload.longitude,
        timezone_offset=payload.timezone_offset,
    )

    chart_rows = build_chart_rows(birth_input)

    with TemporaryDirectory(prefix="chart_run_") as tmp:
        temp_dir = Path(tmp)
        files = write_chart_csvs(chart_rows, temp_dir)
        chart_data = build_natal_chart_data(files["planets"], files["angles"], files["houses"])
        transit_data = load_transit_support_data(files["aspects"], files["houses"])
        report_text = generate_report_from_csvs(
            planets_file=files["planets"],
            angles_file=files["angles"],
            aspects_file=files["aspects"],
        )

    return ReadingResponse(
        meta=ReadingMeta(
            full_name=payload.full_name,
            birthplace=payload.birthplace,
            birth_date=payload.birth_date.isoformat(),
            birth_time=(
                payload.birth_time.strftime("%H:%M")
                if payload.birth_time
                else UNKNOWN_BIRTH_TIME_LABEL
            ),
            birth_time_unknown=payload.birth_time_unknown,
            timezone_offset=payload.timezone_offset,
        ),
        chart_data=chart_data,
        readings=[
            ReadingSection(
                type=REPORT_TYPE,
                title=REPORT_TITLE,
                content=report_text,
            )
        ],
        transit_ready=bool(transit_data.get("aspect_map")) and bool(transit_data.get("house_map")),
    )
