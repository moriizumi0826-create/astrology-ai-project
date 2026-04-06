import csv
import re
from pathlib import Path
from collections import Counter
from typing import List, Dict, Any, Optional

from config import (
    PROJECT_ROOT,
    EN_SIGN_TO_JA,
    EN_PLANET_TO_JA,
    JA_PLANET_TO_EN,
    JA_SIGN_TO_EN,
    JA_ASPECT_TO_EN,
)

def resolve_existing_path(*relative_candidates: str) -> Path:
    """与えられた相対パスの候補から、存在する最初のパスを返す"""
    checked = []
    for rel in relative_candidates:
        p = PROJECT_ROOT / rel
        checked.append(str(p))
        if p.exists():
            return p
    raise FileNotFoundError(
        "ファイルが見つかりません。確認した候補:\n- " + "\n- ".join(checked)
    )

def read_csv_rows(path: Path) -> List[Dict[str, str]]:
    """CSVファイルを読み込み、辞書のリストとして返す"""
    if not path.exists():
        raise FileNotFoundError(f"ファイルが見つかりません: {path}")
    
    try:
        with open(path, "r", encoding="utf-8-sig", newline="") as f:
            first_line = f.readline()
            if not first_line:
                return []
            delimiter = '\t' if '\t' in first_line and ',' not in first_line else ','
            f.seek(0)
            
            reader = csv.DictReader(f, delimiter=delimiter)
            return list(reader)
    except Exception as e:
        raise RuntimeError(f"CSVの読み込み中にエラーが発生しました: {path} - {e}")

def get_first(row: Dict[str, Any], *keys: str) -> str:
    """複数のキー候補から最初に見つかったプレーンな値を返す"""
    for key in keys:
        if key in row and str(row[key]).strip() != "":
            return str(row[key]).strip()
    return ""

def clean_text(text: Any) -> str:
    """テキストの余分な空白や記号を整理する"""
    if text is None:
        return ""
    text = str(text).strip()
    text = text.replace("\u3000", " ")
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = text.replace("，", "、")
    text = text.replace("、。", "。")
    text = text.replace("。。", "。")
    text = text.replace("。,", "。")
    text = text.replace("。 、", "。")
    text = text.replace("自我か", "自我が")
    text = re.sub(r"。{2,}", "。", text)
    return text.strip()

def sentence_end(text: Any, tone: str = "neutral") -> str:
    """テキストが句点で終わるように整え、指定されたトーンに応じて語尾を調整する"""
    text = clean_text(text)
    if not text:
        return ""
    
    text = text.rstrip("。")
    
    if tone == "masculine":
        if text.endswith("でしょう"):
            text = text[:-4] + "傾向があります"
        elif text.endswith("れます"):
            text = text[:-2] + "れる力があります"
    elif tone == "feminine":
        if text.endswith("配置です"):
            text = text[:-4] + "配置といえるでしょう"
        elif text.endswith("なります"):
            text = text[:-4] + "なっていくでしょう"
    elif tone == "strict":
        if text.endswith("でしょう"):
            text = text[:-4] + "点として表れます"
        elif text.endswith("ます"):
            text = text[:-2] + "ことが求められます"

    return text + "。"

def split_sentences(text: str) -> List[str]:
    """テキストを句点単位で分割する"""
    text = clean_text(text)
    if not text:
        return []
    parts = re.split(r"。", text)
    return [p.strip() + "。" for p in parts if p.strip()]

def first_sentence(text: str) -> str:
    """最初の1文を取得する"""
    sents = split_sentences(text)
    return sents[0] if sents else ""

def normalize_for_dup(text: str) -> str:
    """重複判定用に句点や空白を除去する"""
    return re.sub(r"[。、,\s]", "", clean_text(text))

def uniq_keep_order(seq: List[str]) -> List[str]:
    """順序を保ったまま重複する文字列を排除する"""
    seen = set()
    result = []
    for x in seq:
        if not x:
            continue
        k = normalize_for_dup(x)
        if k not in seen:
            seen.add(k)
            result.append(x)
    return result

def compact_texts(texts: List[str], limit: int = 2) -> List[str]:
    """類似するテキストを排除して指定数だけ抽出する"""
    out = []
    for text in texts:
        s = first_sentence(text)
        if not s:
            continue
        s_norm = normalize_for_dup(s)
        duplicated = False
        for existing in out:
            e_norm = normalize_for_dup(existing)
            if s_norm in e_norm or e_norm in s_norm:
                duplicated = True
                break
        if not duplicated:
            out.append(s)
        if len(out) >= limit:
            break
    return out

def split_keywords(text: str) -> List[str]:
    """キーワードを単語単位で分割する"""
    text = clean_text(text)
    if not text:
        return []
    parts = re.split(r"[、,\s/／・]+", text)
    return [p for p in parts if p]

def natural_join(items: List[str]) -> str:
    """要素をつないで自然な日本語の列挙（〜と〜 / 〜、〜、〜）にする"""
    items = [clean_text(x) for x in items if clean_text(x)]
    items = uniq_keep_order(items)
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    if len(items) == 2:
        return f"{items[0]}と{items[1]}"
    return "、".join(items[:-1]) + "、" + items[-1]

def top_keywords(rows: List[Dict[str, Any]], field: str, limit: int = 3) -> List[str]:
    """指定フィールドから高頻度なキーワードを抽出する"""
    words = []
    for row in rows:
        words.extend(split_keywords(row.get(field, "")))
    counts = Counter(words)
    return [w for w, _ in counts.most_common(limit)]

def pick_top_rows(rows: List[Dict[str, Any]], limit: int = 4) -> List[Dict[str, Any]]:
    """優先度が高い順に抽出する"""
    return sorted(rows, key=lambda r: r.get("_priority", 0), reverse=True)[:limit]

def clean_text_block(text: str) -> str:
    """テキストブロック内の連続する空行を整理する"""
    lines = text.splitlines()
    cleaned = []
    blank_count = 0
    for line in lines:
        line = line.rstrip()
        if line == "":
            blank_count += 1
            if blank_count <= 1:
                cleaned.append("")
        else:
            blank_count = 0
            cleaned.append(line)

    text = "\n".join(cleaned)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text

def ensure_output_dir() -> None:
    """出力先ディレクトリの存在を保証する"""
    from config import OUTPUT_DIR
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def _get_ctx_index(ctx: Any, attr_name: str) -> Dict[Any, Any]:
    index = getattr(ctx, attr_name, {}) if ctx is not None else {}
    return index if isinstance(index, dict) else {}


def normalize_sign_name(value: Any) -> str:
    text = clean_text(value)
    if not text:
        return ""
    if text in JA_SIGN_TO_EN:
        return JA_SIGN_TO_EN[text]
    low = text.lower()
    for en in EN_SIGN_TO_JA.keys():
        if en.lower() == low:
            return en
    return text


def normalize_planet_name(value: Any) -> str:
    text = clean_text(value)
    if not text:
        return ""
    node_aliases = {
        "ノースノード": "North Node",
        "ドラゴンヘッド": "North Node",
        "サウスノード": "South Node",
        "ドラゴンテール": "South Node",
    }
    if text in node_aliases:
        return node_aliases[text]
    if text in JA_PLANET_TO_EN:
        return JA_PLANET_TO_EN[text]
    low = text.lower()
    for en in EN_PLANET_TO_JA.keys():
        if en.lower() == low:
            return en
    return text


def _normalize_lookup_sign(sign: Any) -> str:
    return normalize_sign_name(sign)

def _normalize_lookup_planet(planet: Any) -> str:
    return normalize_planet_name(planet)

def _normalize_lookup_aspect(aspect: Any) -> str:
    aspect_text = clean_text(aspect)
    if not aspect_text:
        return ""
    if aspect_text in JA_ASPECT_TO_EN:
        return JA_ASPECT_TO_EN[aspect_text]
    low = aspect_text.lower()
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

def normalize_aspect_key(planet1: Any, planet2: Any, aspect: Any) -> str:
    p1 = normalize_planet_name(planet1)
    p2 = normalize_planet_name(planet2)
    aspect_key = _normalize_lookup_aspect(aspect)
    if not p1 or not p2 or not aspect_key:
        return ""
    ordered = sorted([p1, p2], key=lambda x: x.lower())
    return f"{ordered[0]}|{ordered[1]}|{aspect_key}".lower()

def _normalize_lookup_pattern_type(value: Any) -> str:
    return clean_text(value).lower()


def _normalize_lookup_house(house: Any) -> str:
    return clean_text(house)


def _safe_int(value: Any) -> Optional[int]:
    try:
        return int(str(value).strip())
    except Exception:
        return None


def strengthen_stellium_text(text: str, count: int, field_name: str) -> str:
    text = clean_text(text)
    field = clean_text(field_name)
    if not text or count <= 3:
        return text

    if field == "caution_text":
        replacements = [
            ("増えやすくなります", "やや増えやすくなります"),
            ("強まると", "やや強まると"),
            ("出やすいです", "いっそう出やすいです"),
            ("なりやすいです", "ややなりやすいです"),
        ]
    else:
        replacements = [
            ("強く前面に出やすい", "非常に強く前面に出やすい"),
            ("強く出やすい", "非常に強く出やすい"),
            ("強い集中配置", "非常に強い集中配置"),
            ("大きなテーマ", "人生の中心テーマ"),
            ("重要テーマ", "大きなテーマ"),
            ("重要になります", "より重要になります"),
        ]
        if field in {"summary", "main_text"}:
            replacements.extend(
                [
                    ("中心テーマになりやすい", "人生の中心テーマになりやすい"),
                    ("大きなテーマになりやすい", "人生の中心テーマになりやすい"),
                ]
            )

    strengthened = text
    for old, new in replacements:
        if old in strengthened and new not in strengthened:
            strengthened = strengthened.replace(old, new)
    return strengthened


def apply_stellium_strength(text: str, count: Any, row_count_min: Any, field_name: str) -> str:
    text = clean_text(text)
    actual_count = _safe_int(count)
    if not text or actual_count is None or actual_count <= 3:
        return text
    count_min = _safe_int(row_count_min) or 0
    if actual_count == 4 and count_min >= 4:
        return text
    return strengthen_stellium_text(text, actual_count, field_name)


def get_core_theme_row(theme_id: Any, ctx: Any) -> Optional[Dict[str, str]]:
    theme_key = clean_text(theme_id)
    if not theme_key:
        return None
    index = _get_ctx_index(ctx, "core_theme_index")
    row = index.get(theme_key)
    return row if isinstance(row, dict) else None


def get_conflict_direction_row(theme_id: Any, ctx: Any) -> Optional[Dict[str, str]]:
    theme_key = clean_text(theme_id)
    if not theme_key:
        return None
    index = _get_ctx_index(ctx, "conflict_direction_index")
    row = index.get(theme_key)
    return row if isinstance(row, dict) else None


def get_stellium_theme_row(sign: Any, house: Any, count: Any, ctx: Any) -> Optional[Dict[str, str]]:
    sign_key = _normalize_lookup_sign(sign)
    house_key = _normalize_lookup_house(house)
    actual_count = _safe_int(count)
    if not sign_key or not house_key or actual_count is None:
        return None

    index = _get_ctx_index(ctx, "stellium_theme_index")
    candidates = index.get((sign_key, house_key), [])
    if not isinstance(candidates, list) or not candidates:
        return None

    matched_row: Optional[Dict[str, str]] = None
    matched_count_min = -1
    for row in candidates:
        if not isinstance(row, dict):
            continue
        count_min = _safe_int(row.get("count_min"))
        if count_min is None or count_min > actual_count:
            continue
        if count_min >= matched_count_min:
            matched_row = row
            matched_count_min = count_min
    return matched_row


def get_pattern_theme_row(pattern_type: Any, planet_name: Any, ctx: Any) -> Optional[Dict[str, str]]:
    pattern_key = _normalize_lookup_pattern_type(pattern_type)
    if not pattern_key:
        return None
    planet_key = _normalize_lookup_planet(planet_name)
    index = _get_ctx_index(ctx, "pattern_theme_index")
    if planet_key:
        row = index.get((pattern_key, planet_key))
        if isinstance(row, dict):
            return row
    row = index.get(pattern_key)
    return row if isinstance(row, dict) else None


def get_aspect_theme_row(planet1: Any, planet2: Any, aspect: Any, ctx: Any) -> Optional[Dict[str, str]]:
    p1 = _normalize_lookup_planet(planet1)
    p2 = _normalize_lookup_planet(planet2)
    aspect_key = _normalize_lookup_aspect(aspect)
    if not p1 or not p2 or not aspect_key:
        return None
    key = tuple(sorted([p1, p2])) + (aspect_key,)
    index = _get_ctx_index(ctx, "aspect_theme_index")
    row = index.get(key)
    return row if isinstance(row, dict) else None


def get_aspect_row_for_section7(planet1: Any, planet2: Any, aspect: Any, ctx: Any) -> Optional[Dict[str, str]]:
    key = normalize_aspect_key(planet1, planet2, aspect)
    if not key:
        return None
    usage_index = _get_ctx_index(ctx, "aspect_usage_index")
    row = usage_index.get(key)
    if isinstance(row, dict):
        use_in_section = clean_text(row.get("use_in_section", "")).lower()
        if use_in_section in {"true", "1", "yes", "y"}:
            return row
        # If explicitly false, fall through to allow broader fallback
        return row

    # Fallback to aspect_theme_index (may be aspect.csv or other source)
    theme_row = get_aspect_theme_row(planet1, planet2, aspect, ctx)
    return theme_row if isinstance(theme_row, dict) else None


def get_career_axis_row(axis_type: Any, ctx: Any) -> Optional[Dict[str, str]]:
    axis_key = clean_text(axis_type).lower()
    if not axis_key:
        return None
    index = _get_ctx_index(ctx, "career_axis_index")
    row = index.get(axis_key)
    return row if isinstance(row, dict) else None


def get_hemisphere_axis_row(axis_type: Any, bias_level: Any, ctx: Any) -> Optional[Dict[str, str]]:
    axis_key = clean_text(axis_type).lower()
    bias_key = clean_text(bias_level).lower()
    if not axis_key or not bias_key:
        return None
    index = _get_ctx_index(ctx, "hemisphere_axis_index")
    row = index.get((axis_key, bias_key))
    return row if isinstance(row, dict) else None


def get_node_theme_row(theme_id: Any, ctx: Any) -> Optional[Dict[str, str]]:
    theme_key = clean_text(theme_id)
    if not theme_key:
        return None
    index = _get_ctx_index(ctx, "node_theme_index")
    row = index.get(theme_key)
    return row if isinstance(row, dict) else None
