import csv
from dataclasses import dataclass
from datetime import datetime, timedelta
from itertools import combinations
from pathlib import Path

try:
    import swisseph as swe
except ModuleNotFoundError:
    swe = None


SIGNS = [
    "牡羊座", "牡牛座", "双子座", "蟹座",
    "獅子座", "乙女座", "天秤座", "蠍座",
    "射手座", "山羊座", "水瓶座", "魚座",
]

ASPECT_DEFS = [
    {"name": "コンジャンクション", "angle": 0, "orb": 8},
    {"name": "セクスタイル", "angle": 60, "orb": 4},
    {"name": "スクエア", "angle": 90, "orb": 6},
    {"name": "トライン", "angle": 120, "orb": 6},
    {"name": "クインカンクス", "angle": 150, "orb": 3},
    {"name": "オポジション", "angle": 180, "orb": 8},
]


@dataclass
class BirthInput:
    full_name: str
    birth_date: str
    birth_time: str
    birth_time_unknown: bool
    birthplace: str
    latitude: float
    longitude: float
    timezone_offset: float


def require_swisseph():
    if swe is None:
        raise RuntimeError(
            "swisseph is not installed. Install pyswisseph before running live reading generation."
        )
    return {
        "太陽": swe.SUN,
        "月": swe.MOON,
        "水星": swe.MERCURY,
        "金星": swe.VENUS,
        "火星": swe.MARS,
        "木星": swe.JUPITER,
        "土星": swe.SATURN,
        "天王星": swe.URANUS,
        "海王星": swe.NEPTUNE,
        "冥王星": swe.PLUTO,
        "ドラゴンヘッド": swe.TRUE_NODE,
    }


def get_sign_info(ecliptic_longitude: float) -> tuple[str, float]:
    sign_index = int(ecliptic_longitude // 30)
    sign_name = SIGNS[sign_index]
    degree_in_sign = ecliptic_longitude % 30
    return sign_name, degree_in_sign


def get_angle_diff(long1: float, long2: float) -> float:
    diff = abs(long1 - long2) % 360
    if diff > 180:
        diff = 360 - diff
    return diff


def get_aspect(angle_diff: float):
    for aspect in ASPECT_DEFS:
        target = aspect["angle"]
        deviation = abs(angle_diff - target)
        if deviation <= aspect["orb"]:
            return aspect["name"], target, round(deviation, 2)
    return None, None, None


def get_house(ecliptic_longitude: float, house_cusps) -> int:
    cusps = list(house_cusps)
    for i in range(12):
        start = cusps[i]
        end = cusps[(i + 1) % 12]
        if start <= end:
            if start <= ecliptic_longitude < end:
                return i + 1
        else:
            if ecliptic_longitude >= start or ecliptic_longitude < end:
                return i + 1
    return 12


def build_chart_rows(payload: BirthInput) -> dict[str, list[list]]:
    planets = require_swisseph()
    # When the birth time is unknown, use local noon as a stable fallback so
    # Swiss Ephemeris can still calculate approximate chart positions.
    effective_birth_time = payload.birth_time or "12:00"
    local_dt = datetime.fromisoformat(f"{payload.birth_date}T{effective_birth_time}")
    utc_dt = local_dt - timedelta(hours=payload.timezone_offset)
    utc_hour_decimal = utc_dt.hour + (utc_dt.minute / 60) + (utc_dt.second / 3600)
    jd = swe.julday(utc_dt.year, utc_dt.month, utc_dt.day, utc_hour_decimal)

    houses, ascmc = swe.houses(jd, payload.latitude, payload.longitude, b"P")

    planet_rows = []
    planet_positions = {}
    dragon_head_motion = "順行"

    for name, planet_id in planets.items():
        result = swe.calc_ut(jd, planet_id, swe.FLG_SPEED)
        data = result[0]
        ecliptic_longitude = data[0]
        speed_longitude = data[3]
        sign_name, degree_in_sign = get_sign_info(ecliptic_longitude)
        motion = "逆行" if speed_longitude < 0 else "順行"
        house_number = "-" if payload.birth_time_unknown else get_house(ecliptic_longitude, houses)

        planet_rows.append([
            name,
            round(ecliptic_longitude, 2),
            sign_name,
            round(degree_in_sign, 2),
            motion,
            house_number,
        ])
        planet_positions[name] = ecliptic_longitude

        if name == "ドラゴンヘッド":
            dragon_head_motion = motion

    dragon_head_longitude = planet_positions["ドラゴンヘッド"]
    dragon_tail_longitude = (dragon_head_longitude + 180) % 360
    dragon_tail_sign, dragon_tail_degree = get_sign_info(dragon_tail_longitude)
    dragon_tail_house = "-" if payload.birth_time_unknown else get_house(dragon_tail_longitude, houses)

    planet_rows.append([
        "ドラゴンテール",
        round(dragon_tail_longitude, 2),
        dragon_tail_sign,
        round(dragon_tail_degree, 2),
        dragon_head_motion,
        dragon_tail_house,
    ])
    planet_positions["ドラゴンテール"] = dragon_tail_longitude

    asc_longitude = ascmc[0]
    mc_longitude = ascmc[1]
    asc_sign, asc_degree = get_sign_info(asc_longitude)
    mc_sign, mc_degree = get_sign_info(mc_longitude)
    if payload.birth_time_unknown:
        angle_rows = [["-", "-", "-", "-"] for _ in range(2)]
        house_rows = [["-", "-", "-", "-"] for _ in range(12)]
    else:
        angle_rows = [
            ["ASC", round(asc_longitude, 2), asc_sign, round(asc_degree, 2)],
            ["MC", round(mc_longitude, 2), mc_sign, round(mc_degree, 2)],
        ]

        house_rows = []
        for i, cusp in enumerate(houses, start=1):
            sign_name, degree_in_sign = get_sign_info(cusp)
            house_rows.append([i, round(cusp, 2), sign_name, round(degree_in_sign, 2)])

    aspect_rows = []
    for planet1, planet2 in combinations(planet_positions.keys(), 2):
        if payload.birth_time_unknown and ("月" in (planet1, planet2)):
            continue
        long1 = planet_positions[planet1]
        long2 = planet_positions[planet2]
        angle_diff = get_angle_diff(long1, long2)
        aspect_name, exact_angle, orb_diff = get_aspect(angle_diff)
        if aspect_name is not None:
            aspect_rows.append([
                planet1,
                planet2,
                round(long1, 2),
                round(long2, 2),
                round(angle_diff, 2),
                aspect_name,
                exact_angle,
                orb_diff,
            ])

    return {
        "planets": planet_rows,
        "angles": angle_rows,
        "houses": house_rows,
        "aspects": aspect_rows,
    }


def write_chart_csvs(chart_rows: dict[str, list[list]], output_dir: Path) -> dict[str, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)

    files = {
        "planets": output_dir / "planets.csv",
        "angles": output_dir / "angles.csv",
        "houses": output_dir / "houses.csv",
        "aspects": output_dir / "aspects.csv",
    }
    headers = {
        "planets": ["天体名", "黄経", "星座名", "星座内度数", "順逆", "ハウス"],
        "angles": ["感受点名", "黄経", "星座名", "星座内度数"],
        "houses": ["ハウス番号", "カスプ黄経", "星座名", "星座内度数"],
        "aspects": ["天体1", "天体2", "黄経1", "黄経2", "角度差", "アスペクト名", "理論角度", "オーブ差"],
    }

    for key, path in files.items():
        with path.open("w", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f)
            writer.writerow(headers[key])
            writer.writerows(chart_rows[key])

    return files
