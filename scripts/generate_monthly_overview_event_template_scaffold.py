from __future__ import annotations

import csv
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "database" / "M_Monthly_Overview_Event_Paragraphs_2026_08.csv"

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

SIGN_INGRESSES = [
    ("VENUS", "VIRGO", "LIBRA", 30),
    ("MERCURY", "CANCER", "LEO", 35),
    ("MARS", "GEMINI", "CANCER", 40),
    ("SUN", "LEO", "VIRGO", 50),
    ("MERCURY", "LEO", "VIRGO", 55),
]

PLANET_SIGN_SEGMENTS = {
    "SUN": ["LEO", "VIRGO"],
    "MERCURY": ["CANCER", "LEO", "VIRGO"],
    "VENUS": ["VIRGO", "LIBRA"],
    "MARS": ["GEMINI", "CANCER"],
    "JUPITER": ["LEO"],
}

INITIAL_TEMPLATES = {
    "2026_08_SIGN_VENUS_VIRGO_LIBRA_S01_S02_N07": (
        "金星が{event_date}に天秤座へ移ると、対人関係やお金、自分の価値をめぐる空気が和らぎます。"
        "無理に盛り上がるというより、気の合う人との穏やかな交流や身近な楽しみが、今月の流れを支える息抜きになりやすいでしょう。"
    ),
    "2026_08_SIGN_MERCURY_CANCER_LEO_S11_S12_N05": (
        "{event_date}に水星が獅子座へ移ると、外へ答えを出すことより、考えやアイデアを内側で温める時間が増えていきます。"
        "創作や興味の芽を急いで形にせず、下書きや試作として育てることに向く切り替わりです。"
    ),
    "2026_08_SIGN_MARS_GEMINI_CANCER_S10_S11_N04": (
        "{event_date}に火星が蟹座へ移ると、仕事や公的な役割へ集中していた力が、友人、所属先、今後の計画へ移り始めます。"
        "人との活動が増える一方で、家庭や私生活まで消耗させないよう、自分が安心して戻れる場所を守ることが重要になります。"
    ),
    "2026_08_SIGN_SUN_LEO_VIRGO_S12_S01_N06": (
        "大きな切り替わりは{event_date}です。太陽が乙女座へ移ることで、水面下の準備期間から、自分の意思で生活を組み直す新しい周期へ入ります。"
        "急にすべてが好転するというより、仕事や日課、心身の扱いを自分の基準へ戻しながら、少しずつ主導権を取り戻す時です。"
    ),
    "2026_08_SIGN_MERCURY_LEO_VIRGO_S12_S01_N06": (
        "{event_date}に水星も乙女座へ移ると、曖昧だった考えを整理し、予定や仕事、生活の手順を現実的に組み立てやすくなります。"
        "頭の中にあるものを一つずつ言葉や予定表へ移すことで、再始動の感覚がはっきりしてくるでしょう。"
    ),
    "2026_08_NATAL_SUN_LEO_N05_N06": (
        "{event_date}頃からは、内側で育ててきた興味や創造性を、生活習慣や仕事の整理へ落とし込む段階に入ります。"
        "未処理の作業や日々の負担を静かに整えることが、月後半の再始動を支える準備になります。"
    ),
}


def previous_house(house: int) -> int:
    return 12 if house == 1 else house - 1


def make_sign_ingress_rows() -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for planet, sign_from, sign_to, section_order in SIGN_INGRESSES:
        for solar_to in range(1, 13):
            solar_from = previous_house(solar_to)
            for natal_house in range(1, 13):
                template_id = (
                    f"2026_08_SIGN_{planet}_{sign_from}_{sign_to}_"
                    f"S{solar_from:02d}_S{solar_to:02d}_N{natal_house:02d}"
                )
                paragraph = INITIAL_TEMPLATES.get(template_id, "")
                rows.append(
                    {
                        "Template_ID": template_id,
                        "Month_ID": "2026-08",
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
                        "Paragraph_Template": paragraph,
                        "Priority": 100,
                        "Active_Flag": 1 if paragraph else 0,
                    }
                )
    return rows


def make_natal_ingress_rows() -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for planet, signs in PLANET_SIGN_SEGMENTS.items():
        for sign in signs:
            for natal_to in range(1, 13):
                natal_from = previous_house(natal_to)
                template_id = (
                    f"2026_08_NATAL_{planet}_{sign}_"
                    f"N{natal_from:02d}_N{natal_to:02d}"
                )
                paragraph = INITIAL_TEMPLATES.get(template_id, "")
                rows.append(
                    {
                        "Template_ID": template_id,
                        "Month_ID": "2026-08",
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
                        "Paragraph_Template": paragraph,
                        "Priority": 80,
                        "Active_Flag": 1 if paragraph else 0,
                    }
                )
    return rows


def main() -> None:
    rows = make_sign_ingress_rows() + make_natal_ingress_rows()
    with OUTPUT.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDNAMES, lineterminator="\r\n")
        writer.writeheader()
        writer.writerows(rows)
    print(f"wrote {len(rows)} rows to {OUTPUT}")


if __name__ == "__main__":
    main()
