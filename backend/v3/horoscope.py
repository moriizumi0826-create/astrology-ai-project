"""Reuse natal calculations/report generation without calculating paid dashboards."""
from tempfile import TemporaryDirectory
from pathlib import Path

from backend.app.schemas import ReadingMeta, ReadingResponse, ReadingSection
from backend.app.services import reading_service as reading
from backend.app.services.display_time import display_scope


def generate_horoscope(payload):
    with display_scope(payload.display_timezone_name), reading._natal_data_request_cache():
        reading.reload_master_dataframes_if_changed()
        birth = reading._birth_input_from_request(payload)
        rows = reading._chart_rows_for_request(birth)
        with TemporaryDirectory(prefix="v3_natal_") as temporary:
            files = reading.write_chart_csvs(rows, Path(temporary))
            chart = reading.build_natal_chart_data(files["planets"], files["angles"], files["houses"])
            report = reading.generate_report_from_csvs(
                planets_file=files["planets"], angles_file=files["angles"], aspects_file=files["aspects"],
            )
        return ReadingResponse(
            meta=ReadingMeta(
                full_name=payload.full_name, birthplace=payload.birthplace,
                birth_date=payload.birth_date.isoformat(),
                birth_time=payload.birth_time.strftime("%H:%M") if payload.birth_time else reading.UNKNOWN_BIRTH_TIME_LABEL,
                birth_time_unknown=payload.birth_time_unknown, timezone_offset=birth.timezone_offset,
                timezone_name=payload.timezone_name, birth_time_fold=payload.birth_time_fold,
                display_timezone_name=payload.display_timezone_name,
            ),
            chart_data=chart,
            readings=[ReadingSection(type=reading.REPORT_TYPE, title=reading.REPORT_TITLE, content=report)],
            transit_ready=True,
            dashboard_data={
                "natal_points": reading._build_natal_aspect_points(birth),
                "natal_house_cusps": [
                    number for row in rows["houses"] if len(row) > 1
                    for number in [reading._normalize_float(row[1])] if number is not None
                ],
                "reading_date": reading._reading_current_datetime(payload).date().isoformat(),
                "display_timezone_name": payload.display_timezone_name,
            },
        )
