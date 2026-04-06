import csv
from pathlib import Path


SIGN_MAP = {
    "牡羊座": "Aries",
    "牡牛座": "Taurus",
    "双子座": "Gemini",
    "蟹座": "Cancer",
    "獅子座": "Leo",
    "乙女座": "Virgo",
    "天秤座": "Libra",
    "蠍座": "Scorpio",
    "射手座": "Sagittarius",
    "山羊座": "Capricorn",
    "水瓶座": "Aquarius",
    "魚座": "Pisces",
}

PLANET_KEY_MAP = {
    "sun": "太陽",
    "moon": "月",
    "mercury": "水星",
    "venus": "金星",
    "mars": "火星",
    "jupiter": "木星",
    "saturn": "土星",
}


def load_csv_dicts(path) -> list[dict]:
    csv_path = Path(path)
    if not csv_path.exists():
        raise FileNotFoundError(f"CSV file not found: {csv_path}")

    with csv_path.open("r", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))

    if not rows:
        raise ValueError(f"CSV is empty: {csv_path}")

    return rows


def jp_sign_to_en(sign_jp) -> str:
    try:
        return SIGN_MAP[sign_jp]
    except KeyError as exc:
        raise ValueError(f"Unknown sign name: {sign_jp}") from exc


def format_planet_with_house(row) -> str:
    sign_en = jp_sign_to_en(row["星座名"])
    house = row["ハウス"]
    if not house:
        raise ValueError(f"Missing house value: {row}")
    return f"{sign_en} {house}H"


def format_sign_only(sign_jp) -> str:
    return jp_sign_to_en(sign_jp)


def _find_required_row(row_map: dict, key: str, label: str) -> dict:
    try:
        return row_map[key]
    except KeyError as exc:
        raise ValueError(f"Required row not found: {label}") from exc


def build_natal_chart_data(planets_file, angles_file, houses_file) -> dict:
    planet_rows = load_csv_dicts(planets_file)
    angle_rows = load_csv_dicts(angles_file)
    house_rows = load_csv_dicts(houses_file)

    planet_map = {row["天体名"]: row for row in planet_rows}
    angle_map = {row["感受点名"]: row for row in angle_rows}
    house_map = {str(row["ハウス番号"]): row for row in house_rows}

    chart_data = {
        key: format_planet_with_house(
            _find_required_row(planet_map, planet_name, planet_name)
        )
        for key, planet_name in PLANET_KEY_MAP.items()
    }

    chart_data["asc"] = format_sign_only(
        _find_required_row(angle_map, "ASC", "ASC")["星座名"]
    )
    chart_data["mc"] = format_sign_only(
        _find_required_row(angle_map, "MC", "MC")["星座名"]
    )
    chart_data["house7"] = format_sign_only(
        _find_required_row(house_map, "7", "7ハウス")["星座名"]
    )
    chart_data["house10"] = format_sign_only(
        _find_required_row(house_map, "10", "10ハウス")["星座名"]
    )

    return {
        "sun": chart_data["sun"],
        "moon": chart_data["moon"],
        "asc": chart_data["asc"],
        "mercury": chart_data["mercury"],
        "venus": chart_data["venus"],
        "mars": chart_data["mars"],
        "jupiter": chart_data["jupiter"],
        "saturn": chart_data["saturn"],
        "house7": chart_data["house7"],
        "mc": chart_data["mc"],
        "house10": chart_data["house10"],
    }
