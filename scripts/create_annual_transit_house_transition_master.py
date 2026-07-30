"""Create the annual transit transition interpretation master."""

from __future__ import annotations

import csv
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = PROJECT_ROOT / "database" / "M_Annual_Transit_House_Transitions.csv"
PLANETS = (
    "SUN",
    "MERCURY",
    "VENUS",
    "MARS",
    "JUPITER",
    "SATURN",
    "URANUS",
    "NEPTUNE",
    "PLUTO",
)
SIGNS = (
    "ARIES",
    "TAURUS",
    "GEMINI",
    "CANCER",
    "LEO",
    "VIRGO",
    "LIBRA",
    "SCORPIO",
    "SAGITTARIUS",
    "CAPRICORN",
    "AQUARIUS",
    "PISCES",
)
FIELDNAMES = (
    "Planet",
    "Transition_Type",
    "Transition_Value",
    "Sign_ID",
    "Solar_House",
    "Natal_House",
    "Title",
    "Text_Description",
    "Sort_Order",
)
PLANET_LABELS = {
    "SUN": "太陽",
    "MERCURY": "水星",
    "VENUS": "金星",
    "MARS": "火星",
    "JUPITER": "木星",
    "SATURN": "土星",
    "URANUS": "天王星",
    "NEPTUNE": "海王星",
    "PLUTO": "冥王星",
}
PLANET_ROLES = {
    "SUN": "自己表現",
    "MERCURY": "思考と伝達",
    "VENUS": "愛情と価値観",
    "MARS": "行動と意欲",
    "JUPITER": "成長と拡大",
    "SATURN": "責任と構築",
    "URANUS": "変化と自由",
    "NEPTUNE": "感性と境界",
    "PLUTO": "変容と再生",
}
SIGN_LABELS = {
    "ARIES": "牡羊座",
    "TAURUS": "牡牛座",
    "GEMINI": "双子座",
    "CANCER": "蟹座",
    "LEO": "獅子座",
    "VIRGO": "乙女座",
    "LIBRA": "天秤座",
    "SCORPIO": "蠍座",
    "SAGITTARIUS": "射手座",
    "CAPRICORN": "山羊座",
    "AQUARIUS": "水瓶座",
    "PISCES": "魚座",
}
SIGN_THEMES = {
    "ARIES": "始動と自己主張",
    "TAURUS": "安定と所有",
    "GEMINI": "学習と交流",
    "CANCER": "安心と居場所",
    "LEO": "創造と表現",
    "VIRGO": "整理と実務",
    "LIBRA": "調和と対話",
    "SCORPIO": "集中と変容",
    "SAGITTARIUS": "探求と拡大",
    "CAPRICORN": "責任と達成",
    "AQUARIUS": "革新と仲間",
    "PISCES": "共感と手放し",
}
HOUSE_THEMES = {
    1: "自分自身と始まり",
    2: "収入と価値観",
    3: "学習と連絡",
    4: "家庭と基盤",
    5: "創造と恋愛",
    6: "仕事と習慣",
    7: "対人関係と契約",
    8: "共有と深い結びつき",
    9: "探求と遠方",
    10: "仕事と社会的立場",
    11: "仲間と未来",
    12: "休息と無意識",
}


def interpretation_text(planet: str, transition_type: str, value: str) -> tuple[str, str]:
    planet_label = PLANET_LABELS[planet]
    role = PLANET_ROLES[planet]
    if transition_type == "SIGN_INGRESS":
        sign_label = SIGN_LABELS[value]
        theme = SIGN_THEMES[value]
        return (
            f"{sign_label}への移動",
            f"{planet_label}の{role}に{theme}が加わる。",
        )
    house = int(value)
    house_theme = HOUSE_THEMES[house]
    if transition_type == "SOLAR_HOUSE_INGRESS":
        return (
            f"ソーラー{house}ハウスへの移動",
            f"{planet_label}の{role}が{house_theme}へ向く。",
        )
    return (
        f"ネイタル{house}ハウスへの移動",
        f"{planet_label}の{role}が{house_theme}を動かす。",
    )


def build_rows() -> list[dict[str, str | int]]:
    rows: list[dict[str, str | int]] = []
    sort_order = 1
    for planet in PLANETS:
        for sign in SIGNS:
            title, description = interpretation_text(planet, "SIGN_INGRESS", sign)
            rows.append({
                "Planet": planet,
                "Transition_Type": "SIGN_INGRESS",
                "Transition_Value": sign,
                "Sign_ID": sign,
                "Solar_House": "",
                "Natal_House": "",
                "Title": title,
                "Text_Description": description,
                "Sort_Order": sort_order,
            })
            sort_order += 1
        for transition_type, house_column in (
            ("SOLAR_HOUSE_INGRESS", "Solar_House"),
            ("NATAL_HOUSE_INGRESS", "Natal_House"),
        ):
            for house in range(1, 13):
                title, description = interpretation_text(planet, transition_type, str(house))
                rows.append({
                    "Planet": planet,
                    "Transition_Type": transition_type,
                    "Transition_Value": house,
                    "Sign_ID": "",
                    "Solar_House": house if house_column == "Solar_House" else "",
                    "Natal_House": house if house_column == "Natal_House" else "",
                    "Title": title,
                    "Text_Description": description,
                    "Sort_Order": sort_order,
                })
                sort_order += 1
    return rows


def main() -> None:
    rows = build_rows()
    with OUTPUT_PATH.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDNAMES, lineterminator="\r\n")
        writer.writeheader()
        writer.writerows(rows)
    print({"path": str(OUTPUT_PATH), "rows": len(rows), "planets": len(PLANETS)})


if __name__ == "__main__":
    main()
