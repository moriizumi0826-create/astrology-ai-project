import swisseph as swe
from datetime import datetime, timedelta
import csv
import os
from itertools import combinations

# =========================
# 1. 出生データを入力
#    ※入力は現地時間
# =========================
birth_year = 1984
birth_month = 8
birth_day = 26
birth_hour = 19
birth_minute = 20

# 出生地（例: 東京）
latitude = 35.6812
longitude = 139.7671

# 日本時間 = UTC+9
timezone_offset = 9

# =========================
# 2. ローカル時間 → UTC に変換
# =========================
local_dt = datetime(
    birth_year,
    birth_month,
    birth_day,
    birth_hour,
    birth_minute
)

utc_dt = local_dt - timedelta(hours=timezone_offset)
utc_hour_decimal = utc_dt.hour + (utc_dt.minute / 60) + (utc_dt.second / 3600)

# =========================
# 3. ユリウス日を計算
# =========================
jd = swe.julday(
    utc_dt.year,
    utc_dt.month,
    utc_dt.day,
    utc_hour_decimal
)

# =========================
# 4. 天体一覧（日本語名）
# =========================
planets = {
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
    "ドラゴンヘッド": swe.TRUE_NODE,   # Mean Node にしたい場合は swe.MEAN_NODE
}

# =========================
# 5. 星座一覧（日本語名）
# =========================
signs = [
    "牡羊座", "牡牛座", "双子座", "蟹座",
    "獅子座", "乙女座", "天秤座", "蠍座",
    "射手座", "山羊座", "水瓶座", "魚座"
]

# =========================
# 6. 主要アスペクト定義（日本語名）
#    クインカンクス(150°) を追加
# =========================
aspect_defs = [
    {"name": "コンジャンクション", "angle": 0, "orb": 8},
    {"name": "セクスタイル", "angle": 60, "orb": 4},
    {"name": "スクエア", "angle": 90, "orb": 6},
    {"name": "トライン", "angle": 120, "orb": 6},
    {"name": "クインカンクス", "angle": 150, "orb": 3},
    {"name": "オポジション", "angle": 180, "orb": 8},
]

# =========================
# 7. 黄経から星座情報を出す関数
# =========================
def get_sign_info(ecliptic_longitude):
    sign_index = int(ecliptic_longitude // 30)
    sign_name = signs[sign_index]
    degree_in_sign = ecliptic_longitude % 30
    return sign_name, degree_in_sign

# =========================
# 8. 2天体の角度差を0〜180度で求める関数
# =========================
def get_angle_diff(long1, long2):
    diff = abs(long1 - long2) % 360
    if diff > 180:
        diff = 360 - diff
    return diff

# =========================
# 9. どのアスペクトか判定する関数
# =========================
def get_aspect(angle_diff, defs):
    for aspect in defs:
        target = aspect["angle"]
        orb = aspect["orb"]
        deviation = abs(angle_diff - target)

        if deviation <= orb:
            return aspect["name"], target, round(deviation, 2)

    return None, None, None

# =========================
# 10. ハウスカスプ計算
#     Placidus = b'P'
# =========================
houses, ascmc = swe.houses(jd, latitude, longitude, b'P')

# =========================
# 11. 黄経が何ハウスか判定する関数
# =========================
def get_house(ecliptic_longitude, house_cusps):
    cusps = list(house_cusps)

    for i in range(12):
        start = cusps[i]
        end = cusps[(i + 1) % 12]

        # 360度またぎ対応
        if start <= end:
            if start <= ecliptic_longitude < end:
                return i + 1
        else:
            if ecliptic_longitude >= start or ecliptic_longitude < end:
                return i + 1

    return 12

# =========================
# 12. 出力フォルダ作成
# =========================
output_dir = "output"
os.makedirs(output_dir, exist_ok=True)

# =========================
# 13. planets.csv 用データ作成
# =========================
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
    house_number = get_house(ecliptic_longitude, houses)

    planet_rows.append([
        name,
        round(ecliptic_longitude, 2),
        sign_name,
        round(degree_in_sign, 2),
        motion,
        house_number
    ])

    planet_positions[name] = ecliptic_longitude

    if name == "ドラゴンヘッド":
        dragon_head_motion = motion

# -------------------------
# ドラゴンテールを追加
# -------------------------
dragon_head_longitude = planet_positions["ドラゴンヘッド"]
dragon_tail_longitude = (dragon_head_longitude + 180) % 360
dragon_tail_sign, dragon_tail_degree = get_sign_info(dragon_tail_longitude)
dragon_tail_house = get_house(dragon_tail_longitude, houses)

planet_rows.append([
    "ドラゴンテール",
    round(dragon_tail_longitude, 2),
    dragon_tail_sign,
    round(dragon_tail_degree, 2),
    dragon_head_motion,
    dragon_tail_house
])

planet_positions["ドラゴンテール"] = dragon_tail_longitude

# =========================
# 14. angles.csv 用データ作成
# =========================
asc_longitude = ascmc[0]
mc_longitude = ascmc[1]

asc_sign, asc_degree = get_sign_info(asc_longitude)
mc_sign, mc_degree = get_sign_info(mc_longitude)

angle_rows = [
    ["ASC", round(asc_longitude, 2), asc_sign, round(asc_degree, 2)],
    ["MC", round(mc_longitude, 2), mc_sign, round(mc_degree, 2)],
]

# =========================
# 15. houses.csv 用データ作成
# =========================
house_rows = []

for i, cusp in enumerate(houses, start=1):
    sign_name, degree_in_sign = get_sign_info(cusp)
    house_rows.append([
        i,
        round(cusp, 2),
        sign_name,
        round(degree_in_sign, 2)
    ])

# =========================
# 16. aspects.csv 用データ作成
# =========================
aspect_rows = []

for planet1, planet2 in combinations(planet_positions.keys(), 2):
    long1 = planet_positions[planet1]
    long2 = planet_positions[planet2]

    angle_diff = get_angle_diff(long1, long2)
    aspect_name, exact_angle, orb_diff = get_aspect(angle_diff, aspect_defs)

    if aspect_name is not None:
        aspect_rows.append([
            planet1,
            planet2,
            round(long1, 2),
            round(long2, 2),
            round(angle_diff, 2),
            aspect_name,
            exact_angle,
            orb_diff
        ])

# =========================
# 17. planets.csv 保存
# =========================
planets_csv_path = os.path.join(output_dir, "planets.csv")

with open(planets_csv_path, "w", newline="", encoding="utf-8-sig") as f:
    writer = csv.writer(f)
    writer.writerow([
        "天体名",
        "黄経",
        "星座名",
        "星座内度数",
        "順逆",
        "ハウス"
    ])
    writer.writerows(planet_rows)

# =========================
# 18. angles.csv 保存
# =========================
angles_csv_path = os.path.join(output_dir, "angles.csv")

with open(angles_csv_path, "w", newline="", encoding="utf-8-sig") as f:
    writer = csv.writer(f)
    writer.writerow([
        "感受点名",
        "黄経",
        "星座名",
        "星座内度数"
    ])
    writer.writerows(angle_rows)

# =========================
# 19. houses.csv 保存
# =========================
houses_csv_path = os.path.join(output_dir, "houses.csv")

with open(houses_csv_path, "w", newline="", encoding="utf-8-sig") as f:
    writer = csv.writer(f)
    writer.writerow([
        "ハウス番号",
        "カスプ黄経",
        "星座名",
        "星座内度数"
    ])
    writer.writerows(house_rows)

# =========================
# 20. aspects.csv 保存
# =========================
aspects_csv_path = os.path.join(output_dir, "aspects.csv")

with open(aspects_csv_path, "w", newline="", encoding="utf-8-sig") as f:
    writer = csv.writer(f)
    writer.writerow([
        "天体1",
        "天体2",
        "黄経1",
        "黄経2",
        "角度差",
        "アスペクト名",
        "理論角度",
        "オーブ差"
    ])
    writer.writerows(aspect_rows)

# =========================
# 21. 画面表示
# =========================
print("=== 天体位置とハウス ===")
print()

for row in planet_rows:
    name, ecliptic_longitude, sign_name, degree_in_sign, motion, house_number = row
    print(
        f"{name:<8} | "
        f"{ecliptic_longitude:7.2f}° | "
        f"{sign_name:<4} {degree_in_sign:5.2f}° | "
        f"{motion:<2} | "
        f"{house_number}ハウス"
    )

print()
print("=== ASC / MC ===")
for row in angle_rows:
    angle_name, longitude_value, sign_name, degree_in_sign = row
    print(f"{angle_name}: {longitude_value:.2f}° | {sign_name} {degree_in_sign:.2f}°")

print()
print("=== ハウスカスプ ===")
for row in house_rows:
    house_number, cusp_longitude, sign_name, degree_in_sign = row
    print(f"{house_number}ハウス: {cusp_longitude:7.2f}° | {sign_name} {degree_in_sign:.2f}°")

print()
print("=== アスペクト ===")
for row in aspect_rows:
    planet1, planet2, long1, long2, angle_diff, aspect_name, exact_angle, orb_difference = row
    print(
        f"{planet1:<8} - {planet2:<8} | "
        f"{aspect_name:<10} | "
        f"角度差={angle_diff:6.2f}° | "
        f"オーブ差={orb_difference:.2f}"
    )

print()
print("CSV保存先:")
print(planets_csv_path)
print(angles_csv_path)
print(houses_csv_path)
print(aspects_csv_path)