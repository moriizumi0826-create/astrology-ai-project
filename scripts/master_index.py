from pathlib import Path
from typing import List, Dict, Any, Tuple, Optional
from config import (
    PLANET_ORDER,
    ANGLE_ORDER,
    PLANET_PRIORITY,
    ASPECT_PRIORITY,
    EN_PLANET_TO_JA,
    EN_SIGN_TO_JA,
    JA_PLANET_TO_EN,
    JA_SIGN_TO_EN,
    JA_ASPECT_TO_EN,
    EN_ASPECT_TO_JA,
    PLANET_INPUT_REL,
    ANGLE_INPUT_REL,
    ASPECT_INPUT_REL,
    NODE_INPUT_REL,
)
from io_utils import clean_text, read_csv_rows, get_first, resolve_existing_path, normalize_aspect_key
from models import PlanetData, AngleData, AspectData, NodeData

def normalize_planet_name_to_en(name: str) -> str:
    name = clean_text(name)
    return JA_PLANET_TO_EN.get(name, name)

def normalize_sign_name_to_en(name: str) -> str:
    name = clean_text(name)
    return JA_SIGN_TO_EN.get(name, name)

def normalize_aspect_name_to_en(name: str) -> str:
    name = clean_text(name)
    if name in JA_ASPECT_TO_EN:
        return JA_ASPECT_TO_EN[name]
    low = name.lower()
    mapping = {
        "conj": "conjunction",
        "conjunction": "conjunction",
        "sex": "sextile",
        "sextile": "sextile",
        "sq": "square",
        "square": "square",
        "tri": "trine",
        "trine": "trine",
        "opp": "opposition",
        "opposition": "opposition",
        "quin": "quincunx",
        "quincunx": "quincunx",
    }
    return mapping.get(low, low)

# =========================================================
# master読み込み
# =========================================================
def build_planet_sign_house_index(rows: List[Dict[str, Any]]) -> Dict[Tuple[str, str, str], Dict[str, Any]]:
    index = {}
    for row in rows:
        planet = normalize_planet_name_to_en(get_first(row, "planet", "天体", "天体名"))
        sign = normalize_sign_name_to_en(get_first(row, "sign", "星座", "星座名"))
        house = str(get_first(row, "house", "ハウス", "ハウス番号"))
        if planet and sign and house:
            index[(planet, sign, house)] = row
    return index

def build_angle_sign_index(rows: List[Dict[str, Any]]) -> Dict[Tuple[str, str], Dict[str, Any]]:
    index = {}
    for row in rows:
        angle = normalize_planet_name_to_en(get_first(row, "angle", "感受点", "感受点名"))
        sign = normalize_sign_name_to_en(get_first(row, "sign", "星座", "星座名"))
        if angle and sign:
            index[(angle, sign)] = row
    return index

def build_aspect_index(rows: List[Dict[str, Any]]) -> Dict[Tuple[str, ...], Dict[str, Any]]:
    index = {}
    for row in rows:
        p1 = normalize_planet_name_to_en(get_first(row, "planet1", "天体1"))
        p2 = normalize_planet_name_to_en(get_first(row, "planet2", "天体2"))
        aspect = normalize_aspect_name_to_en(get_first(row, "aspect", "アスペクト", "アスペクト名"))
        if p1 and p2 and aspect:
            key = tuple(sorted([p1, p2])) + (aspect,)
            index[key] = row
    return index

def build_planet_master_index(rows: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    by_en = {}
    for row in rows:
        en = get_first(row, "英語名")
        if en:
            by_en[en] = row
    return by_en

def build_sign_master_index(rows: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    by_en = {}
    for row in rows:
        en = get_first(row, "英語名")
        if en:
            by_en[en] = row
    return by_en

def build_house_master_index(rows: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    index = {}
    for row in rows:
        key = str(get_first(row, "ハウス"))
        if key:
            index[key] = row
    return index

def build_motion_master_index(rows: List[Dict[str, Any]]) -> Dict[Tuple[str, str], Dict[str, Any]]:
    index = {}
    for row in rows:
        planet = normalize_planet_name_to_en(get_first(row, "planet", "天体", "天体名"))
        motion = get_first(row, "motion", "順逆")
        if planet and motion:
            index[(planet, motion)] = row
    return index

def build_aspect_type_index(rows: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    by_en = {}
    for row in rows:
        en = get_first(row, "英語名")
        if en:
            by_en[en] = row
    return by_en

def build_core_theme_index(rows: List[Dict[str, Any]]) -> Dict[str, Dict[str, str]]:
    index: Dict[str, Dict[str, str]] = {}
    for row in rows or []:
        theme_id = clean_text(get_first(row, "theme_id", "id", "theme"))
        if theme_id:
            index[theme_id] = row
    return index

def build_conflict_direction_index(rows: List[Dict[str, Any]]) -> Dict[str, Dict[str, str]]:
    index: Dict[str, Dict[str, str]] = {}
    for row in rows or []:
        theme_id = clean_text(get_first(row, "theme_id", "id", "theme"))
        if theme_id:
            index[theme_id] = row
    return index

def build_stellium_theme_index(rows: List[Dict[str, Any]]) -> Dict[Tuple[str, str], List[Dict[str, str]]]:
    index: Dict[Tuple[str, str], List[Dict[str, str]]] = {}
    for row in rows or []:
        sign = normalize_sign_name_to_en(get_first(row, "sign", "星座", "星座名"))
        house = clean_text(str(get_first(row, "house", "ハウス", "ハウス番号")))
        if not sign or not house:
            continue
        key = (sign, house)
        index.setdefault(key, []).append(row)
    return index

def _normalize_pattern_type(value: str) -> str:
    return clean_text(value).lower()

def build_pattern_theme_index(rows: List[Dict[str, Any]]) -> Dict[Any, Dict[str, Any]]:
    index: Dict[Any, Dict[str, Any]] = {}
    for row in rows or []:
        pattern_type = _normalize_pattern_type(get_first(row, "pattern_type", "pattern", "type", "パターン"))
        planet = normalize_planet_name_to_en(get_first(row, "planet", "天体", "天体名", "planet_name"))
        if not pattern_type:
            continue
        key = (pattern_type, planet) if planet else pattern_type
        index[key] = row
    return index

def build_aspect_theme_index(rows: List[Dict[str, Any]]) -> Dict[Tuple[str, ...], Dict[str, Any]]:
    index: Dict[Tuple[str, ...], Dict[str, Any]] = {}
    for row in rows or []:
        p1 = normalize_planet_name_to_en(get_first(row, "planet1", "天体1"))
        p2 = normalize_planet_name_to_en(get_first(row, "planet2", "天体2"))
        aspect = normalize_aspect_name_to_en(get_first(row, "aspect", "アスペクト", "アスペクト名"))
        if p1 and p2 and aspect:
            key = tuple(sorted([p1, p2])) + (aspect,)
            index[key] = row
    return index

def build_aspect_lookup_key(planet1: Any, planet2: Any, aspect: Any) -> str:
    return normalize_aspect_key(planet1, planet2, aspect)

def build_aspect_usage_index(rows: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    index: Dict[str, Dict[str, Any]] = {}
    for row in rows or []:
        key = build_aspect_lookup_key(
            get_first(row, "planet1", "天体1"),
            get_first(row, "planet2", "天体2"),
            get_first(row, "aspect", "アスペクト", "アスペクト名"),
        )
        if key:
            index[key] = row
    return index

def build_career_axis_index(rows: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    index: Dict[str, Dict[str, Any]] = {}

    def normalize_house_axis(value: Any) -> str:
        text = clean_text(value).upper()
        if not text:
            return ""
        text = text.replace("HOUSE", "H").replace("ハウス", "H")
        if text.endswith("H"):
            num = text[:-1]
        else:
            num = text
        return f"{num}H" if num.isdigit() else text

    for row in rows or []:
        career_id = clean_text(get_first(row, "career_id", "id"))
        mc_sign = normalize_sign_name_to_en(get_first(row, "mc_sign", "mc", "mc_sign_ja"))
        mc_ruler = normalize_planet_name_to_en(get_first(row, "mc_ruler", "ruler", "mc_ruler_ja"))
        dominant_axis = normalize_house_axis(get_first(row, "dominant_axis", "axis", "axis_type"))
        jupiter_house = normalize_house_axis(get_first(row, "jupiter_house", "jupiter", "jupiter_axis"))

        mc_sign_key = clean_text(mc_sign).lower()
        mc_ruler_key = clean_text(mc_ruler).lower()
        dominant_axis_key = clean_text(dominant_axis).lower()
        jupiter_house_key = clean_text(jupiter_house).lower()

        if career_id:
            index[f"id:{career_id.lower()}"] = row

        combos = [
            (mc_sign_key, mc_ruler_key, dominant_axis_key, jupiter_house_key),
            (mc_sign_key, mc_ruler_key, dominant_axis_key),
            (mc_sign_key, dominant_axis_key),
            (dominant_axis_key,),
        ]
        for combo in combos:
            if not all(combo):
                continue
            base = "_".join(combo)
            for variant in _career_axis_key_variants(base):
                if variant not in index:
                    index[variant] = row

    return index


def _career_axis_key_variants(base: str) -> List[str]:
    variants = {base}
    variants.add(base.replace("_", "-"))
    variants.add(base.replace("_", ":"))
    variants.add(base.replace("_", ""))
    return [v for v in variants if v]

def build_hemisphere_axis_index(rows: List[Dict[str, Any]]) -> Dict[Tuple[str, str], Dict[str, Any]]:
    index: Dict[Tuple[str, str], Dict[str, Any]] = {}
    for row in rows or []:
        axis_type = clean_text(get_first(row, "axis_type", "axis", "軸"))
        bias_level = clean_text(get_first(row, "bias_level", "bias", "level", "偏り"))
        if axis_type and bias_level:
            index[(axis_type.lower(), bias_level.lower())] = row
    return index

def build_node_theme_index(rows: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    index: Dict[str, Dict[str, Any]] = {}
    for row in rows or []:
        theme_id = clean_text(get_first(row, "theme_id", "id", "theme"))
        if theme_id:
            index[theme_id] = row
    return index

# =========================================================
# 入力チャート読込
# =========================================================
def load_planets(has_birth_time: bool = True, planet_input_file: Optional[Path] = None) -> List[PlanetData]:
    planet_input_file = planet_input_file or resolve_existing_path(PLANET_INPUT_REL)
    rows = read_csv_rows(planet_input_file)
    planets = []
    for row in rows:
        name_ja = get_first(row, "天体名", "planet", "name")
        sign_ja = get_first(row, "星座名", "sign")
        house = str(get_first(row, "ハウス", "house"))
        rev = get_first(row, "順逆", "retrograde")
        degree = get_first(row, "度数", "degree", "lon", "longitude")

        name_en = normalize_planet_name_to_en(name_ja)
        sign_en = normalize_sign_name_to_en(sign_ja)

        if name_en and sign_en:
            planets.append(PlanetData(
                name_en=name_en,
                name_ja=EN_PLANET_TO_JA.get(name_en, name_ja or name_en),
                sign_en=sign_en,
                sign_ja=EN_SIGN_TO_JA.get(sign_en, sign_ja or sign_en),
                house=house if has_birth_time and house else "",
                retrograde=rev,
                degree=degree,
                priority=PLANET_PRIORITY.get(name_en, 50)
            ))

    order_map = {name: i for i, name in enumerate(PLANET_ORDER)}
    planets.sort(key=lambda x: order_map.get(x.name_en, 999))
    return planets

def load_angles(angle_input_file: Optional[Path] = None) -> List[AngleData]:
    try:
        angle_input_file = angle_input_file or resolve_existing_path(ANGLE_INPUT_REL)
    except FileNotFoundError:
        return []

    rows = read_csv_rows(angle_input_file)
    angles = []
    for row in rows:
        name_ja = get_first(row, "感受点名", "angle", "name")
        sign_ja = get_first(row, "星座名", "sign")

        name_en = normalize_planet_name_to_en(name_ja)
        sign_en = normalize_sign_name_to_en(sign_ja)

        if name_en and sign_en:
            angles.append(AngleData(
                name_en=name_en,
                name_ja=EN_PLANET_TO_JA.get(name_en, name_ja or name_en),
                sign_en=sign_en,
                sign_ja=EN_SIGN_TO_JA.get(sign_en, sign_ja or sign_en),
                priority=PLANET_PRIORITY.get(name_en, 50)
            ))

    order_map = {name: i for i, name in enumerate(ANGLE_ORDER)}
    angles.sort(key=lambda x: order_map.get(x.name_en, 999))
    return angles

def load_aspects(aspect_input_file: Optional[Path] = None) -> List[AspectData]:
    try:
        aspect_input_file = aspect_input_file or resolve_existing_path(ASPECT_INPUT_REL)
    except FileNotFoundError:
        return []

    rows = read_csv_rows(aspect_input_file)
    aspects = []
    for row in rows:
        p1_ja = get_first(row, "天体1", "planet1")
        p2_ja = get_first(row, "天体2", "planet2")
        aspect_ja = get_first(row, "アスペクト名", "aspect")
        orb = get_first(row, "オーブ差", "orb")

        p1_en = normalize_planet_name_to_en(p1_ja)
        p2_en = normalize_planet_name_to_en(p2_ja)
        aspect_en = normalize_aspect_name_to_en(aspect_ja)

        if p1_en and p2_en and aspect_en:
            aspects.append(AspectData(
                planet1_en=p1_en,
                planet2_en=p2_en,
                planet1_ja=EN_PLANET_TO_JA.get(p1_en, p1_ja or p1_en),
                planet2_ja=EN_PLANET_TO_JA.get(p2_en, p2_ja or p2_en),
                aspect_en=aspect_en,
                aspect_ja=EN_ASPECT_TO_JA.get(aspect_en, aspect_ja or aspect_en),
                orb=clean_text(orb),
                priority=ASPECT_PRIORITY.get(aspect_en, 50)
            ))

    aspects.sort(key=lambda x: x.priority, reverse=True)
    return aspects

def load_nodes(has_birth_time: bool = True, planet_input_file: Optional[Path] = None) -> List[NodeData]:
    """
    planets.csv からドラゴンヘッド / ドラゴンテールを抽出して NodeData 化する
    """
    try:
        planet_input_file = planet_input_file or resolve_existing_path(PLANET_INPUT_REL)
    except FileNotFoundError:
        return []

    rows = read_csv_rows(planet_input_file)
    nodes: List[NodeData] = []

    for row in rows:
        name_ja = str(get_first(row, "天体名", "name") or "").strip()
        sign_ja = str(get_first(row, "星座名", "sign") or "").strip()
        house_raw = get_first(row, "ハウス", "house")
        house = str(house_raw).strip() if house_raw is not None else ""

        if not name_ja:
            continue

        if "ドラゴンヘッド" in name_ja or "ノースノード" in name_ja:
            name_en = "North Node"
            fixed_name_ja = "ドラゴンヘッド"
            priority = 100
        elif "ドラゴンテール" in name_ja or "サウスノード" in name_ja:
            name_en = "South Node"
            fixed_name_ja = "ドラゴンテール"
            priority = 99
        else:
            continue

        sign_en = normalize_sign_name_to_en(sign_ja) if sign_ja else ""

        nodes.append(
            NodeData(
                name_en=name_en,
                name_ja=fixed_name_ja,
                sign_en=sign_en,
                sign_ja=EN_SIGN_TO_JA.get(sign_en, sign_ja or ""),
                house=house if has_birth_time and house else "",
                priority=priority,
            )
        )

    nodes.sort(key=lambda n: 0 if n.name_en == "North Node" else 1)
    return nodes

def infer_has_birth_time(angles: List[AngleData]) -> bool:
    if not angles:
        return False
    asc = next((a for a in angles if a.name_en == "ASC" and a.sign_ja), None)
    mc = next((a for a in angles if a.name_en == "MC" and a.sign_ja), None)
    return bool(asc or mc)

def infer_has_house_data(planets: List[PlanetData], has_birth_time: bool) -> bool:
    if not has_birth_time:
        return False
    # Check if key planets have house info
    key_planets = [p for p in planets if p.name_en in ["Sun", "Moon", "Mercury"]]
    for p in key_planets: # if any core planet has a house, assume we have houses
        if p.house:
            return True
    return False

def infer_has_nodes(nodes: List[NodeData]) -> bool:
    return len(nodes) > 0

def infer_has_node_house(nodes: List[NodeData]) -> bool:
    return any(n.house for n in nodes)

def enrich_summary_rows(
    planets: List[PlanetData],
    angles: List[AngleData],
    psh_index: Dict[Tuple[str, str, str], Dict[str, Any]],
    angle_sign_index: Dict[Tuple[str, str], Dict[str, Any]],
    has_birth_time: bool = True
) -> List[Dict[str, Any]]:
    rows = []
    for p in planets:
        row = None
        if has_birth_time and p.has_house:
            key = (p.name_en, p.sign_en, p.house)
            row = psh_index.get(key)
        if row:
            item = dict(row)
            item["_priority"] = p.priority
            item["_sign_ja"] = p.sign_ja
            item["_house"] = p.house if p.house else "-"
            rows.append(item)

    if has_birth_time:
        for a in angles:
            key = (a.name_en, a.sign_en)
            row = angle_sign_index.get(key)
            if row:
                item = dict(row)
                item["_priority"] = a.priority
                item["_sign_ja"] = a.sign_ja
                item["_house"] = "-"
                rows.append(item)
    return rows

def build_planet_sign_index(rows: List[Dict[str, Any]]) -> Dict[Tuple[str, str], Dict[str, Any]]:
    index = {}
    for row in rows:
        planet = normalize_planet_name_to_en(get_first(row, "planet", "天体", "天体名"))
        sign = normalize_sign_name_to_en(get_first(row, "sign", "星座", "星座名"))
        if planet and sign:
            index[(planet, sign)] = row
    return index

def build_planet_house_index(rows: List[Dict[str, Any]]) -> Dict[Tuple[str, str], Dict[str, Any]]:
    index = {}
    for row in rows:
        planet = normalize_planet_name_to_en(get_first(row, "planet", "天体", "天体名"))
        house = str(get_first(row, "house", "ハウス", "ハウス番号"))
        if planet and house:
            index[(planet, house)] = row
    return index

def build_node_axis_index(rows: List[Dict[str, Any]]) -> Dict[Tuple[str, str, str, str], Dict[str, Any]]:
    index = {}
    for row in rows:
        n_sign = get_first(row, "ヘッド星座")
        n_house = str(get_first(row, "ヘッドハウス"))
        s_sign = get_first(row, "テール星座")
        s_house = str(get_first(row, "テールハウス"))
        if n_sign and n_house and s_sign and s_house:
            index[(n_sign, n_house, s_sign, s_house)] = row
    return index

def build_node_sign_house_index(rows: List[Dict[str, Any]]) -> Dict[Tuple[str, str, str], Dict[str, Any]]:
    index = {}
    for row in rows:
        name = get_first(row, "感受点名")
        sign = get_first(row, "星座名")
        house = str(get_first(row, "ハウス"))
        if name and sign and house:
            index[(name, sign, house)] = row
    return index
