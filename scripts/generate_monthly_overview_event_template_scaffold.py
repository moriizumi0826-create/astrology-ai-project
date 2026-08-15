from __future__ import annotations

import argparse
import csv
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TARGET_PLANETS = ("SUN", "MERCURY", "VENUS", "MARS", "JUPITER")
SIGN_INGRESS_SECTION_ORDERS = (30, 35, 40, 50, 55)

FIELDNAMES = [
    "Template_ID",
    "Month_ID",
    "Section_Order",
    "Planet",
    "Event_Type",
    "Transit_Sign_From",
    "Transit_Sign_To",
    "Solar_House_From",
    "Solar_House_To",
    "Natal_House_From",
    "Natal_House_To",
    "Natal_House_At_Event",
    "Date_Source",
    "Date_Key",
    "Date_Precision",
    "Paragraph_Template",
    "Priority",
    "Active_Flag",
]


def previous_house(house: int) -> int:
    return 12 if house == 1 else house - 1


def _month_id(year: int, month: int) -> str:
    return f"{year:04d}-{month:02d}"


def _calendar_rows(year: int, database_dir: Path) -> list[dict[str, str]]:
    path = database_dir / f"M_Transit_Calendar_{year}.csv"
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def _month_conditions(
    year: int,
    month: int,
    database_dir: Path,
) -> tuple[list[tuple[str, str, str, int]], dict[str, list[str]]]:
    target_month = _month_id(year, month)
    previous_sign: dict[str, str] = {}
    ingresses: list[tuple[date, int, str, str, str]] = []
    segments = {planet: [] for planet in TARGET_PLANETS}

    for source_order, row in enumerate(_calendar_rows(year, database_dir)):
        planet = str(row.get("Planet") or "").strip().upper()
        if planet not in TARGET_PLANETS:
            continue
        row_date = date.fromisoformat(str(row["Date"]).strip()[:10])
        sign = str(row.get("Sign_ID") or "").strip().upper()
        if row_date.strftime("%Y-%m") == target_month:
            if sign and sign not in segments[planet]:
                segments[planet].append(sign)
            if str(row.get("Sign_Ingress_Flag") or "").strip() == "1":
                sign_from = previous_sign.get(planet)
                if not sign_from:
                    raise ValueError(
                        f"Cannot resolve the prior sign for {planet} on {row_date}"
                    )
                ingresses.append((row_date, source_order, planet, sign_from, sign))
        if sign:
            previous_sign[planet] = sign

    ingresses.sort(key=lambda item: (item[0], item[1]))
    if len(ingresses) > len(SIGN_INGRESS_SECTION_ORDERS):
        raise ValueError(
            "More sign ingresses were found than the monthly overview schema supports: "
            f"{len(ingresses)}"
        )

    ingress_conditions = [
        (planet, sign_from, sign_to, SIGN_INGRESS_SECTION_ORDERS[index])
        for index, (_event_date, _order, planet, sign_from, sign_to) in enumerate(
            ingresses
        )
    ]
    if any(not signs for signs in segments.values()):
        missing = [planet for planet, signs in segments.items() if not signs]
        raise ValueError(f"Missing transit calendar segments for: {missing}")
    return ingress_conditions, segments


def _make_sign_ingress_rows(
    year: int,
    month: int,
    ingresses: list[tuple[str, str, str, int]],
) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    id_month = f"{year:04d}_{month:02d}"
    month_id = _month_id(year, month)
    for planet, sign_from, sign_to, section_order in ingresses:
        for solar_to in range(1, 13):
            solar_from = previous_house(solar_to)
            for natal_house in range(1, 13):
                rows.append(
                    {
                        "Template_ID": (
                            f"{id_month}_SIGN_{planet}_{sign_from}_{sign_to}_"
                            f"S{solar_from:02d}_S{solar_to:02d}_N{natal_house:02d}"
                        ),
                        "Month_ID": month_id,
                        "Section_Order": section_order,
                        "Planet": planet,
                        "Event_Type": "sign_ingress",
                        "Transit_Sign_From": sign_from,
                        "Transit_Sign_To": sign_to,
                        "Solar_House_From": solar_from,
                        "Solar_House_To": solar_to,
                        "Natal_House_From": "ANY",
                        "Natal_House_To": "ANY",
                        "Natal_House_At_Event": natal_house,
                        "Date_Source": "transit_calendar",
                        "Date_Key": f"{planet}:sign_ingress:{sign_to}",
                        "Date_Precision": "exact_day",
                        "Paragraph_Template": "",
                        "Priority": 100,
                        "Active_Flag": 0,
                    }
                )
    return rows


def _make_natal_ingress_rows(
    year: int,
    month: int,
    segments: dict[str, list[str]],
) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    id_month = f"{year:04d}_{month:02d}"
    month_id = _month_id(year, month)
    for planet in TARGET_PLANETS:
        for sign in segments[planet]:
            for natal_to in range(1, 13):
                natal_from = previous_house(natal_to)
                rows.append(
                    {
                        "Template_ID": (
                            f"{id_month}_NATAL_{planet}_{sign}_"
                            f"N{natal_from:02d}_N{natal_to:02d}"
                        ),
                        "Month_ID": month_id,
                        "Section_Order": 45,
                        "Planet": planet,
                        "Event_Type": "natal_house_ingress",
                        "Transit_Sign_From": sign,
                        "Transit_Sign_To": sign,
                        "Solar_House_From": "ANY",
                        "Solar_House_To": "ANY",
                        "Natal_House_From": natal_from,
                        "Natal_House_To": natal_to,
                        "Natal_House_At_Event": natal_to,
                        "Date_Source": "natal_house_calculation",
                        "Date_Key": f"{planet}:natal_house_ingress:{natal_to}",
                        "Date_Precision": "local_day_or_approximate",
                        "Paragraph_Template": "",
                        "Priority": 80,
                        "Active_Flag": 0,
                    }
                )
    return rows


def build_rows(
    year: int,
    month: int,
    database_dir: Path | None = None,
) -> list[dict[str, object]]:
    source_dir = (database_dir or ROOT / "database").resolve()
    ingresses, segments = _month_conditions(year, month, source_dir)
    return _make_sign_ingress_rows(year, month, ingresses) + _make_natal_ingress_rows(
        year,
        month,
        segments,
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate an inactive monthly overview event-paragraph scaffold."
    )
    parser.add_argument("year", type=int)
    parser.add_argument("month", type=int, choices=range(1, 13))
    parser.add_argument("--database-dir", type=Path, default=ROOT / "database")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    output = args.output or (
        args.database_dir
        / f"M_Monthly_Overview_Event_Paragraphs_{args.year:04d}_{args.month:02d}.csv"
    )
    output = output.resolve()
    if output.exists() and not args.force:
        print(f"Refusing to overwrite existing file without --force: {output}")
        return 1

    rows = build_rows(args.year, args.month, args.database_dir)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDNAMES, lineterminator="\r\n")
        writer.writeheader()
        writer.writerows(rows)
    print(f"wrote {len(rows)} inactive rows to {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
