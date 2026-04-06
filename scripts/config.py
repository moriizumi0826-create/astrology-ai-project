from typing import Dict, List, Set, Any, Optional
from pathlib import Path

# =========================================================
# パス設定
# =========================================================
SCRIPT_DIR: Path = Path(__file__).resolve().parent
PROJECT_ROOT: Path = SCRIPT_DIR.parent
DATABASE_DIR: Path = PROJECT_ROOT / "database"
OUTPUT_DIR: Path = PROJECT_ROOT / "output"

# 入出力の基本パス候補 (resolve_existing_pathで解決する前のベース)
PLANET_INPUT_REL: str = "output/planets.csv"
HOUSE_INPUT_REL: str = "output/houses.csv"
ANGLE_INPUT_REL: str = "output/angles.csv"
ASPECT_INPUT_REL: str = "output/aspects.csv"
NODE_INPUT_REL: str = "output/nodes.csv"

PLANET_SIGN_HOUSE_REL: str = "database/planet_sign_house.csv"
PLANET_SIGN_REL: str = "database/planet_sign.csv"
PLANET_HOUSE_REL: str = "database/planet_house.csv"
ANGLE_SIGN_REL: str = "database/angle_sign.csv"
ASPECT_MASTER_REL: str = "database/aspect.csv"
PLANET_MASTER_REL: str = "database/planet.csv"
SIGN_MASTER_REL: str = "database/sign.csv"
HOUSE_MASTER_REL: str = "database/house.csv"
MOTION_MASTER_REL: str = "database/motion.csv"
ASPECT_TYPE_MASTER_REL: str = "database/aspect_type.csv"
NODE_AXIS_REL: str = "database/node_axis.csv"
NODE_SIGN_HOUSE_REL: str = "database/node_sign_house.csv"
CORE_THEME_CSV: str = "database/core_theme.csv"
CONFLICT_DIRECTION_CSV: str = "database/conflict_direction.csv"
STELLIUM_THEME_CSV: str = "database/stellium_theme.csv"
PATTERN_THEME_CSV: str = "database/pattern_theme.csv"
ASPECT_TO_THEME_CSV: str = "database/aspect.csv"
CAREER_AXIS_CSV: str = "database/career_axis.csv"
HEMISPHERE_AXIS_CSV: str = "database/hemisphere_axis.csv"
NODE_THEME_CSV: str = "database/node_theme.csv"

OUTPUT_FILE_PATH: Path = PROJECT_ROOT / "output" / "reading.txt"

# =========================================================
# 定数
# =========================================================
PLANET_ORDER: List[str] = [
    "Sun", "Moon", "Mercury", "Venus", "Mars",
    "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"
]
ANGLE_ORDER: List[str] = ["ASC", "MC"]

PLANET_PRIORITY: Dict[str, int] = {
    "Sun": 100,
    "ASC": 98,
    "Moon": 95,
    "MC": 92,
    "Mercury": 82,
    "Venus": 80,
    "Mars": 79,
    "Jupiter": 74,
    "Saturn": 74,
    "Pluto": 70,
    "Uranus": 62,
    "Neptune": 62,
}

ASPECT_PRIORITY: Dict[str, int] = {
    "conjunction": 90,
    "square": 86,
    "opposition": 85,
    "trine": 72,
    "sextile": 68,
    "quincunx": 66,
}

MAJOR_PATTERN_PRIORITY: Dict[str, int] = {
    "t_square": 100,
    "grand_trine": 95,
    "kite": 92,
    "yod": 90,
}

ESSENTIAL_DIGNITIES: Dict[str, Dict[str, List[str]]] = {
    "Sun": {"domicile": ["獅子座"], "exaltation": ["牡羊座"], "detriment": ["水瓶座"], "fall": ["天秤座"]},
    "Moon": {"domicile": ["蟹座"], "exaltation": ["牡牛座"], "detriment": ["山羊座"], "fall": ["蠍座"]},
    "Mercury": {"domicile": ["双子座", "乙女座"], "exaltation": ["乙女座"], "detriment": ["射手座", "魚座"], "fall": ["魚座"]},
    "Venus": {"domicile": ["牡牛座", "天秤座"], "exaltation": ["魚座"], "detriment": ["牡羊座", "蠍座"], "fall": ["乙女座"]},
    "Mars": {"domicile": ["牡羊座", "蠍座"], "exaltation": ["山羊座"], "detriment": ["天秤座", "牡牛座"], "fall": ["蟹座"]},
    "Jupiter": {"domicile": ["射手座", "魚座"], "exaltation": ["蟹座"], "detriment": ["双子座", "乙女座"], "fall": ["山羊座"]},
    "Saturn": {"domicile": ["山羊座", "水瓶座"], "exaltation": ["天秤座"], "detriment": ["蟹座", "獅子座"], "fall": ["牡羊座"]},
    # Modern planets generally don't have traditional essential dignities but we can use their modern associations
    "Uranus": {"domicile": ["水瓶座"], "exaltation": ["蠍座"], "detriment": ["獅子座"], "fall": ["牡牛座"]},
    "Neptune": {"domicile": ["魚座"], "exaltation": ["蟹座"], "detriment": ["乙女座"], "fall": ["山羊座"]},
    "Pluto": {"domicile": ["蠍座"], "exaltation": ["獅子座"], "detriment": ["牡牛座"], "fall": ["水瓶座"]},
}

DOMINANCE_WEIGHTS: Dict[str, int] = {
    "asc_ruler": 50,
    "mc_ruler": 40,
    "angle_house": 25,
    "succedent_house": 10,
    "cadent_house": 4,
    "north_node_contact": 18,
    "south_node_contact": 10,
    "tight_aspect": 16,
    "medium_aspect": 8,
    "stellium_member": 15,
    "stellium_lead": 20,
    "pattern_member": 12,
    "pattern_apex": 20,
}

ANGULAR_HOUSES: Set[str] = {"1", "4", "7", "10"}
SUCCEDENT_HOUSES: Set[str] = {"2", "5", "8", "11"}
CADENT_HOUSES: Set[str] = {"3", "6", "9", "12"}

PERSONAL_HOUSES: Set[str] = {"1", "2", "3"}
PRIVATE_HOUSES: Set[str] = {"4", "5", "6"}
RELATIONAL_HOUSES: Set[str] = {"7", "8", "9"}
SOCIAL_HOUSES: Set[str] = {"10", "11", "12"}

UPPER_HEMISPHERE_HOUSES: Set[str] = {"7", "8", "9", "10", "11", "12"}
LOWER_HEMISPHERE_HOUSES: Set[str] = {"1", "2", "3", "4", "5", "6"}
EASTERN_HEMISPHERE_HOUSES: Set[str] = {"10", "11", "12", "1", "2", "3"}
WESTERN_HEMISPHERE_HOUSES: Set[str] = {"4", "5", "6", "7", "8", "9"}


# 天体ごとの語尾（将来CSV化しやすいように参照関数を経由させる）
PLANET_ENDINGS: Dict[str, str] = {
    "Sun": "人生の中心テーマとして表れやすい配置です。",
    "Moon": "感情や安心感に表れやすいでしょう。",
    "Mercury": "思考や判断の働きとして表れやすい配置です。",
    "Venus": "魅力や好みに自然と表れやすいでしょう。",
    "Mars": "行動力やエネルギーの使い方に表れやすい配置です。",
    "Jupiter": "発展や可能性の広がりとして表れやすい配置です。",
    "Saturn": "責任や課題のテーマとして表れやすい配置です。",
    "Uranus": "独自性や変化の衝動として表れやすいでしょう。",
    "Neptune": "理想や感受性の領域に影響しやすい配置です。",
    "Pluto": "深い変容や執着のテーマとして表れやすい配置です。",
}

# 動的語尾のためのトーン定義 (masculine: 力強い, feminine: 柔らかい, strict: 重みのある)
PLANET_TONES: Dict[str, str] = {
    "Sun": "masculine",
    "Moon": "feminine",
    "Mercury": "neutral",
    "Venus": "feminine",
    "Mars": "masculine",
    "Jupiter": "neutral",
    "Saturn": "strict",
    "Uranus": "neutral",
    "Neptune": "feminine",
    "Pluto": "strict",
}

# オーブ(許容角)の狭さによる強調表現
ORB_MODIFIERS: Dict[str, str] = {
    "tight": "非常に強く",
    "normal": "",
    "wide": "無意識の傾向として",
}


JA_PLANET_TO_EN: Dict[str, str] = {
    "太陽": "Sun",
    "月": "Moon",
    "水星": "Mercury",
    "金星": "Venus",
    "火星": "Mars",
    "木星": "Jupiter",
    "土星": "Saturn",
    "天王星": "Uranus",
    "海王星": "Neptune",
    "冥王星": "Pluto",
    "ASC": "ASC",
    "MC": "MC",
    "ドラゴンヘッド": "North Node",
    "ドラゴンテール": "South Node",
}
EN_PLANET_TO_JA: Dict[str, str] = {v: k for k, v in JA_PLANET_TO_EN.items()}

JA_SIGN_TO_EN: Dict[str, str] = {
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
EN_SIGN_TO_JA: Dict[str, str] = {v: k for k, v in JA_SIGN_TO_EN.items()}

JA_ASPECT_TO_EN: Dict[str, str] = {
    "コンジャンクション": "conjunction",
    "セクスタイル": "sextile",
    "スクエア": "square",
    "トライン": "trine",
    "オポジション": "opposition",
    "クインカンクス": "quincunx",
}
EN_ASPECT_TO_JA: Dict[str, str] = {v: k for k, v in JA_ASPECT_TO_EN.items()}

HOUSE_FOCUS_PHRASES: Dict[str, str] = {
    "1": "自己表現や第一印象",
    "2": "価値観や収入基盤",
    "3": "学びや言語化",
    "4": "安心感や土台づくり",
    "5": "創造性や自己表現",
    "6": "仕事や日常運営",
    "7": "対人関係や契約",
    "8": "深い結びつきや共有資源",
    "9": "探求や思想の拡張",
    "10": "社会的役割や評価",
    "11": "仲間や未来志向",
    "12": "内面世界や癒やし",
}

SIGN_FOCUS_PHRASES: Dict[str, str] = {
    "牡羊座": "先駆性と行動力",
    "牡牛座": "安定感と継続力",
    "双子座": "知的好奇心と柔軟性",
    "蟹座": "保護力と共感性",
    "獅子座": "表現力と存在感",
    "乙女座": "改善力と実務能力",
    "天秤座": "調整力と対人感覚",
    "蠍座": "集中力と洞察力",
    "射手座": "探求心と視野の広さ",
    "山羊座": "責任感と構築力",
    "水瓶座": "革新性と客観性",
    "魚座": "受容性と感受性",
}

SIGN_RULERS: Dict[str, List[str]] = {
    "牡羊座": ["Mars"],
    "牡牛座": ["Venus"],
    "双子座": ["Mercury"],
    "蟹座": ["Moon"],
    "獅子座": ["Sun"],
    "乙女座": ["Mercury"],
    "天秤座": ["Venus"],
    "蠍座": ["Pluto", "Mars"],
    "射手座": ["Jupiter"],
    "山羊座": ["Saturn"],
    "水瓶座": ["Uranus", "Saturn"],
    "魚座": ["Neptune", "Jupiter"],
}

SIGN_ELEMENTS: Dict[str, str] = {
    "牡羊座": "火",
    "牡牛座": "地",
    "双子座": "風",
    "蟹座": "水",
    "獅子座": "火",
    "乙女座": "地",
    "天秤座": "風",
    "蠍座": "水",
    "射手座": "火",
    "山羊座": "地",
    "水瓶座": "風",
    "魚座": "水",
}

SIGN_MODALITIES: Dict[str, str] = {
    "牡羊座": "活動",
    "牡牛座": "不動",
    "双子座": "柔軟",
    "蟹座": "活動",
    "獅子座": "不動",
    "乙女座": "柔軟",
    "天秤座": "活動",
    "蠍座": "不動",
    "射手座": "柔軟",
    "山羊座": "活動",
    "水瓶座": "不動",
    "魚座": "柔軟",
}

ELEMENT_MODALITY_WEIGHTS: Dict[str, float] = {
    "Sun": 3.0,
    "Moon": 3.0,
    "Mercury": 2.0,
    "Venus": 2.0,
    "Mars": 2.0,
    "Jupiter": 1.5,
    "Saturn": 1.5,
    "Uranus": 1.0,
    "Neptune": 1.0,
    "Pluto": 1.0,
    "ASC": 3.0,
    "MC": 1.5,
}

ELEMENT_TEXT: Dict[str, Dict[str, str]] = {
    "火": {
        "strong": "火の要素が強く、直感で動く推進力や、自分の熱量を原動力にする力が目立ちやすいでしょう。",
        "weak": "火の要素が控えめなため、勢いで押し切るよりも、納得感や安心感を得てから動く方が自然です。",
    },
    "地": {
        "strong": "地の要素が強く、現実感覚や実務力、形にしていく安定した力が大きな強みになりやすいでしょう。",
        "weak": "地の要素が控えめなため、現実化や継続の局面では、意識的に基盤や習慣を整えることが大切です。",
    },
    "風": {
        "strong": "風の要素が強く、物事を言語化し、客観的に整理し、人と知的につながる力が発達しやすいでしょう。",
        "weak": "風の要素が控えめなため、感情や感覚で捉える傾向が強く、距離を取って整理するには少し意識が必要です。",
    },
    "水": {
        "strong": "水の要素が強く、感受性や共感性が豊かで、人や空気の機微を深く受け取りやすいでしょう。",
        "weak": "水の要素が控えめなため、感情を丁寧に味わうよりも、理解や処理を優先しやすい傾向があります。",
    },
}

MODALITY_TEXT: Dict[str, Dict[str, str]] = {
    "活動": {
        "strong": "活動宮が強いため、自分から流れを作る力があり、始めることや決断することにエネルギーが向きやすいでしょう。",
        "weak": "活動宮が控えめなため、何かを無理に切り開くより、状況を見てから動く方が自然です。",
    },
    "不動": {
        "strong": "不動宮が強く、粘り強さや一貫性があり、自分の価値観や信念を深めていく力があります。",
        "weak": "不動宮が控えめなため、一つのことを守り続けるより、柔軟に切り替える方が得意でしょう。",
    },
    "柔軟": {
        "strong": "柔軟宮が強く、適応力や調整力が高く、状況に応じて考え方や動き方を変えやすいタイプです。",
        "weak": "柔軟宮が控えめなため、変化に合わせ続けるより、自分の方針やペースを保つ方が力を発揮しやすいでしょう。",
    },
}

HARD_ASPECTS: Set[str] = {"square", "opposition"}
SOFT_ASPECTS: Set[str] = {"trine", "sextile"}

ASPECT_SECTION_LIMITS: Dict[str, int] = {
    "conjunction": 5,
    "square": 5,
    "opposition": 5,
    "quincunx": 4,
    "trine": 3,
    "sextile": 3,
}

ASPECT_STRENGTH_PATTERNS: List[str] = [
    "この配置の強みは、{strength}にあります。",
    "ここには、{strength}という資質が表れやすいでしょう。",
    "この関係性は、{strength}として活かされやすい配置です。",
]

ASPECT_CAUTION_PATTERNS_HARD: List[str] = [
    "一方で、少し意識しておきたいのは{caution}という点です。",
    "ただし、{caution}には注意が必要でしょう。",
    "この力が強く出すぎると、{caution}として表れやすい面もあります。",
]

ASPECT_CAUTION_PATTERNS_SOFT: List[str] = [
    "この素晴らしい資質も、無自覚なまま使われると{caution}として表れてしまうこともあるかもしれません。",
    "この資質が行き過ぎると、{caution}という形で揺れやすくなることがあります。",
    "恵まれた流れだからこそ、{caution}には少し意識を向けておくと良いでしょう。",
]

ASPECT_STRUCTURE_PATTERNS: Dict[str, List[List[str]]] = {
    "conjunction": [
        ["core", "story", "strength", "caution", "closing"],
        ["core", "story", "strength", "closing"],
        ["core", "story", "caution", "closing"],
    ],
    "square": [
        ["core", "story", "strength", "caution", "closing"],
        ["core", "story", "caution", "closing"],
        ["core", "story", "strength", "closing"],
    ],
    "opposition": [
        ["core", "story", "strength", "caution", "closing"],
        ["core", "story", "caution", "closing"],
    ],
    "quincunx": [
        ["core", "story", "caution", "closing"],
        ["core", "story", "strength", "closing"],
    ],
    "trine": [
        ["core", "story", "strength", "closing"],
        ["core", "story", "strength"],
    ],
    "sextile": [
        ["core", "story", "strength", "closing"],
        ["core", "story", "strength"],
    ],
}

THEME_NOUNS: List[str] = ["テーマ", "領域"]
FLOW_NOUNS: List[str] = ["流れ", "軸", "推進力", "力学"]

ENDING_VARIANTS: List[str] = [
    "表れやすいでしょう",
    "強まりやすい傾向があります",
    "人生で繰り返しテーマになりやすいでしょう",
    "自然と現れやすい資質です",
    "あなたの魅力として輝く側面です",
    "という個性が色濃く出るでしょう",
    "という素敵な特徴を持っています",
    "として豊かに広がりを見せます",
]

def _get_first_value(row: Optional[Dict[str, Any]], *keys: str) -> str:
    if not isinstance(row, dict):
        return ""
    for key in keys:
        if key in row and str(row[key]).strip() != "":
            return str(row[key]).strip()
    return ""


def _coerce_text_list(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    text = str(value).strip()
    return [text] if text else []


def get_planet_ending(
    planet_name: str,
    planet_row: Optional[Dict[str, Any]] = None,
    planet_master: Optional[Dict[str, Dict[str, Any]]] = None,
) -> str:
    """天体ごとの語尾を取得（将来CSV化予定）"""
    row = planet_row or (planet_master or {}).get(planet_name, {})
    ending = _get_first_value(row, "ending", "語尾", "ending_text", "ending_phrase")
    if ending:
        return ending
    return PLANET_ENDINGS.get(planet_name, "として表れやすい配置です。")


def get_house_focus_phrase(
    house: str,
    house_row: Optional[Dict[str, Any]] = None,
    house_master: Optional[Dict[str, Dict[str, Any]]] = None,
) -> str:
    """ハウス短句を取得（将来CSV化予定）"""
    key = str(house)
    row = house_row or (house_master or {}).get(key, {})
    phrase = _get_first_value(row, "focus_phrase", "短句", "テーマ短句", "要約", "概要")
    if phrase:
        return phrase
    return HOUSE_FOCUS_PHRASES.get(key, "その領域")


def get_sign_focus_phrase(
    sign_ja: str,
    sign_row: Optional[Dict[str, Any]] = None,
    sign_master: Optional[Dict[str, Dict[str, Any]]] = None,
) -> str:
    """サイン短句を取得（将来CSV化予定）"""
    row = sign_row or (sign_master or {}).get(sign_ja, {})
    phrase = _get_first_value(row, "focus_phrase", "短句", "テーマ短句", "要約", "概要")
    if phrase:
        return phrase
    return SIGN_FOCUS_PHRASES.get(sign_ja, "そのサインの質")


def get_orb_modifier(
    orb_key: str,
    aspect_row: Optional[Dict[str, Any]] = None,
    aspect_type_row: Optional[Dict[str, Any]] = None,
    aspect_theme_row: Optional[Dict[str, Any]] = None,
) -> str:
    """オーブ強調語句を取得（将来aspect_to_theme.csvで統合予定）"""
    for row in (aspect_theme_row, aspect_row, aspect_type_row):
        modifier = _get_first_value(row, "orb_modifier", "orb_text", "orb_phrase", "オーブ補正")
        if modifier:
            return modifier
    return ORB_MODIFIERS.get(orb_key, "")


def get_aspect_strength_patterns(row: Optional[Dict[str, Any]] = None) -> List[str]:
    """アスペクト強みテンプレを取得（将来aspect_to_theme.csvへ移行）"""
    patterns = _coerce_text_list(
        _get_first_value(row, "strength_patterns", "strength_pattern", "strength_template", "強みテンプレ")
    )
    return patterns or list(ASPECT_STRENGTH_PATTERNS)


def get_aspect_caution_patterns_hard(row: Optional[Dict[str, Any]] = None) -> List[str]:
    """ハードアスペクト注意テンプレを取得（将来aspect_to_theme.csvへ移行）"""
    patterns = _coerce_text_list(
        _get_first_value(row, "caution_patterns_hard", "caution_pattern", "caution_template", "注意テンプレ")
    )
    return patterns or list(ASPECT_CAUTION_PATTERNS_HARD)


def get_aspect_caution_patterns_soft(row: Optional[Dict[str, Any]] = None) -> List[str]:
    """ソフトアスペクト注意テンプレを取得（将来aspect_to_theme.csvへ移行）"""
    patterns = _coerce_text_list(
        _get_first_value(row, "caution_patterns_soft", "caution_pattern", "caution_template", "注意テンプレ")
    )
    return patterns or list(ASPECT_CAUTION_PATTERNS_SOFT)


def get_ending_variants(row: Optional[Dict[str, Any]] = None) -> List[str]:
    """語尾バリエーションを取得（将来CSV化予定）"""
    patterns = _coerce_text_list(
        _get_first_value(row, "ending_variants", "ending_variant", "語尾バリエーション")
    )
    return patterns or list(ENDING_VARIANTS)
