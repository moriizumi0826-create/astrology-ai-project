"""Read-only GeoNames lookup for V3 birth locations."""

from pathlib import Path
from contextlib import closing
import sqlite3
import unicodedata

JAPANESE_PREFECTURES = dict(zip(
    "Hokkaido Aomori Iwate Miyagi Akita Yamagata Fukushima Ibaraki Tochigi Gunma "
    "Saitama Chiba Tokyo Kanagawa Niigata Toyama Ishikawa Fukui Yamanashi Nagano "
    "Gifu Shizuoka Aichi Mie Shiga Kyoto Osaka Hyogo Nara Wakayama Tottori "
    "Shimane Okayama Hiroshima Yamaguchi Tokushima Kagawa Ehime Kochi Fukuoka "
    "Saga Nagasaki Kumamoto Oita Miyazaki Kagoshima Okinawa".lower().split(),
    "北海道 青森県 岩手県 宮城県 秋田県 山形県 福島県 茨城県 栃木県 群馬県 "
    "埼玉県 千葉県 東京都 神奈川県 新潟県 富山県 石川県 福井県 山梨県 長野県 "
    "岐阜県 静岡県 愛知県 三重県 滋賀県 京都府 大阪府 兵庫県 奈良県 和歌山県 鳥取県 "
    "島根県 岡山県 広島県 山口県 徳島県 香川県 愛媛県 高知県 福岡県 "
    "佐賀県 長崎県 熊本県 大分県 宮崎県 鹿児島県 沖縄県".split(),
))


def normalize_prefecture(prefecture: str | None, country_code: str) -> str | None:
    if country_code.upper() != "JP" or not prefecture:
        return prefecture
    value = prefecture.strip()
    return JAPANESE_PREFECTURES.get(value.casefold(), value)


DEFAULT_DATABASE = Path(__file__).parent / "data" / "geonames.sqlite"


def normalize_name(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split())


def database_ready(path: Path = DEFAULT_DATABASE) -> bool:
    return path.is_file() and path.stat().st_size > 100


def search_locations(
    query: str,
    country_code: str = "JP",
    prefecture: str | None = None,
    limit: int = 5,
    database: Path = DEFAULT_DATABASE,
) -> list[dict]:
    if not database_ready(database):
        raise RuntimeError("V3 location database is unavailable")
    country = country_code.strip().upper()
    if country != "WORLD" and (len(country) != 2 or not country.isalpha()):
        raise ValueError("country_code must be an ISO country code or WORLD")
    if not 1 <= limit <= 10:
        raise ValueError("limit must be between 1 and 10")
    parts = [part.strip() for part in query.split(",")]
    city = parts[0]
    hints = [normalize_name(part) for part in parts[1:] if part]
    key = normalize_name(city)
    if not key:
        raise ValueError("query is required")
    prefecture_name = normalize_prefecture(prefecture, country) if country == "JP" else None
    candidates: dict[int, tuple[tuple, sqlite3.Row]] = {}
    uri = f"file:{database.resolve().as_posix()}?mode=ro"
    with closing(sqlite3.connect(uri, uri=True)) as connection:
        connection.row_factory = sqlite3.Row
        for exact in (True, False):
            if exact:
                term_clause = "n.term = ?"
                term_args = (key,)
            else:
                term_clause = "n.term >= ? AND n.term < ?"
                term_args = (key, key + "\U0010ffff")
            rows = connection.execute(
                f"""SELECT n.term, p.* FROM names n JOIN places p ON p.id = n.place_id
                WHERE {term_clause} AND (? = 'WORLD' OR p.country_code = ?)
                  AND (? IS NULL OR p.admin1_name = ?)
                LIMIT 1500""",
                (*term_args, country, country, prefecture_name, prefecture_name),
            )
            for row in rows:
                place_id = row["id"]
                region_keys = (normalize_name(row["admin1_name"] or ""),
                               normalize_name(row["country_name"]),
                               normalize_name(row["country_code"]))
                score = (
                    0 if all(hint in region_keys for hint in hints) else 1,
                    0 if key in (normalize_name(row["name"]), normalize_name(row["display_name"])) else 1,
                    0 if row["term"] == key else 1,
                    -row["population"],
                    row["feature_rank"],
                    row["name"],
                )
                previous = candidates.get(place_id)
                if previous is None or score < previous[0]:
                    candidates[place_id] = (score, row)
            if len(candidates) >= limit and exact:
                break
    if not candidates and country == "JP":
        shortened = city.rstrip("市区町村")
        if len(shortened) >= 2 and shortened != city:
            fallback = search_locations(shortened, country, prefecture, limit, database)
            for item in fallback:
                item["query"] = query.strip()
            return fallback
    results = []
    seen_labels = set()
    for _, row in sorted(candidates.values(), key=lambda item: item[0]):
        label = row["display_name"]
        region = row["admin1_name"]
        nation = row["country_name"]
        display_name = ", ".join(dict.fromkeys(part for part in (label, region, nation) if part))
        if display_name in seen_labels:
            continue
        seen_labels.add(display_name)
        results.append({
            "query": query.strip(),
            "display_name": display_name,
            "latitude": row["latitude"],
            "longitude": row["longitude"],
            "timezone_name": row["timezone_name"],
            "timezone_offset": None,
            "resolved_at": None,
        })
        if len(results) >= limit:
            break
    return results
