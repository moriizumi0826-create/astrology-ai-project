"""Print a human-readable monthly-peak narrative snapshot for the quality fixture."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.app.services.chart_calculator import BirthInput
from backend.app.services.yearly_forecast_service import generate_yearly_forecast
from backend.tests.monthly_peak_narrative_quality_fixture import NARRATIVE_QUALITY_BIRTH_INPUT


def main() -> None:
    fixture = NARRATIVE_QUALITY_BIRTH_INPUT
    birth_input = BirthInput(
        full_name="Narrative Snapshot",
        birth_date=fixture["birth_date"],
        birth_time=fixture["birth_time"],
        birth_time_unknown=False,
        birthplace=fixture["birthplace"],
        latitude=fixture["latitude"],
        longitude=fixture["longitude"],
        timezone_offset=fixture["timezone_offset"],
    )
    forecast = generate_yearly_forecast(birth_input, fixture["year"])
    month_prefix = f"{fixture['year']}-{fixture['month']:02d}"

    print(f"# Monthly Peak Narrative Snapshot: {month_prefix}")
    for category, periods in forecast["monthly_peak_periods"].items():
        print(f"\n## {category}")
        for period in periods:
            if not period["start_date"].startswith(month_prefix):
                continue
            print(f"\n### {period['start_date']} - {period['end_date']} ({period['narrative_state']})")
            print(period["title"])
            print(period["summary"])
            print(period["description"])
            if period["caution_text"]:
                print(f"注意: {period['caution_text']}")
            print(f"主因: {period['primary_factor']['label']}")
            if period["secondary_factor"]:
                print(f"補助: {period['secondary_factor']['label']}")


if __name__ == "__main__":
    main()
