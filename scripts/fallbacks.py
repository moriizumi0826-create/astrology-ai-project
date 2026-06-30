import random
import re
from typing import Dict, Any, List, Optional, Tuple
from models import PlanetData, AngleData, AspectData, NodeData
from io_utils import clean_text, get_first, get_node_theme_row

def strip_suffix(text: str) -> str:
    if not text:
         return ""
         
    text = clean_text(text).rstrip("。、")
    
    # Strip common endings only when embedding mid-sentence
    suffixes = ["の領域", "の星座", "中心テーマ", "のテーマ", "領域", "テーマ", "を示す", "を表す"]
    for suffix in suffixes:
        if text.endswith(suffix):
            text = text[:-len(suffix)]
            
    return text.strip()

def simplify_sign_meaning(text: str) -> str:
    # Keep raw text when possible; trim only for mid-sentence embedding
    return strip_suffix(text)


def _pick_row_text(row: Optional[Dict[str, Any]], *extra_keys: str) -> str:
    if not row:
        return ""
    return clean_text(
        get_first(
            row,
            *extra_keys,
            "解釈文",
            "要約",
            "核となる意味",
            "テーマ",
            "意味",
        )
    )

def build_planet_sign_fallback(
    p: PlanetData,
    planet_master_en: Dict[str, Any],
    sign_master_en: Dict[str, Any],
    planet_sign_index: Optional[Dict[Tuple[str, str], Dict[str, Any]]] = None,
) -> str:
    row = (planet_sign_index or {}).get((p.name_en, p.sign_en), {})
    row_text = _pick_row_text(row)
    if row_text:
        return row_text

    planet_row = planet_master_en.get(p.name_en, {})
    sign_row = sign_master_en.get(p.sign_en, {})
    return (
        _pick_row_text(planet_row)
        or _pick_row_text(sign_row)
        or f"{p.name_ja}が{p.sign_ja}にある配置です。"
    )

def build_planet_house_fallback(
    p: PlanetData,
    planet_master_en: Dict[str, Any],
    house_master: Dict[str, Any],
    planet_house_index: Optional[Dict[Tuple[str, str], Dict[str, Any]]] = None,
) -> str:
    row = (planet_house_index or {}).get((p.name_en, p.house), {})
    row_text = _pick_row_text(row)
    if row_text:
        return row_text

    planet_row = planet_master_en.get(p.name_en, {})
    house_row = house_master.get(p.house, {})
    return (
        _pick_row_text(house_row)
        or _pick_row_text(planet_row)
        or f"{p.name_ja}が{p.house}ハウスにある配置です。"
    )

def build_planet_sign_house_fallback(
    p: PlanetData,
    planet_master_en: Dict[str, Any],
    sign_master_en: Dict[str, Any],
    house_master: Dict[str, Any],
    planet_sign_house_index: Optional[Dict[Tuple[str, str, str], Dict[str, Any]]] = None,
    planet_sign_index: Optional[Dict[Tuple[str, str], Dict[str, Any]]] = None,
    planet_house_index: Optional[Dict[Tuple[str, str], Dict[str, Any]]] = None,
) -> str:
    row = (planet_sign_house_index or {}).get((p.name_en, p.sign_en, p.house), {})
    row_text = _pick_row_text(row)
    if row_text:
        return row_text

    ps_row = (planet_sign_index or {}).get((p.name_en, p.sign_en), {})
    ps_text = _pick_row_text(ps_row)
    if ps_text:
        return ps_text

    ph_row = (planet_house_index or {}).get((p.name_en, p.house), {})
    ph_text = _pick_row_text(ph_row)
    if ph_text:
        return ph_text

    planet_row = planet_master_en.get(p.name_en, {})
    sign_row = sign_master_en.get(p.sign_en, {})
    house_row = house_master.get(p.house, {})

    return (
        _pick_row_text(planet_row)
        or _pick_row_text(sign_row)
        or _pick_row_text(house_row)
        or f"{p.name_ja}が{p.sign_ja}{p.house}ハウスにある配置です。"
    )

def build_angle_fallback(
    a: AngleData,
    sign_master_en: Dict[str, Any],
    angle_sign_index: Optional[Dict[Tuple[str, str], Dict[str, Any]]] = None,
) -> str:
    row = (angle_sign_index or {}).get((a.name_en, a.sign_en), {})
    row_text = _pick_row_text(row)
    if row_text:
        return row_text

    sign_row = sign_master_en.get(a.sign_en, {})
    sign_meaning = clean_text(get_first(sign_row, "意味"))

    if a.name_en == "ASC":
        if sign_meaning:
            trimmed = simplify_sign_meaning(sign_meaning)
            return f"ASCが{a.sign_ja}にあることで、第一印象や対人の入り口には{trimmed}雰囲気が出やすいでしょう。"
        return f"ASCが{a.sign_ja}にあることで、第一印象や対人の入り口が特徴づけられます。"
        
    if a.name_en == "MC":
        if sign_meaning:
            trimmed = simplify_sign_meaning(sign_meaning)
            return f"MCが{a.sign_ja}にあることで、社会的な見られ方や目指す方向には{trimmed}傾向が出やすいでしょう。"
        return f"MCが{a.sign_ja}にあることで、社会的な見られ方や目指す方向が特徴づけられます。"
        
    return f"{a.name_ja}が{a.sign_ja}にある配置です。"

def build_aspect_fallback(
    a: AspectData,
    aspect_type_en: Dict[str, Any],
    aspect_index: Optional[Dict[Tuple[str, ...], Dict[str, Any]]] = None,
) -> str:
    key = tuple(sorted([a.planet1_en, a.planet2_en])) + (a.aspect_en,)
    row = (aspect_index or {}).get(key, {})
    row_text = _pick_row_text(row)
    if row_text:
        return row_text

    aspect_type_row = aspect_type_en.get(a.aspect_en, {})
    return (
        _pick_row_text(aspect_type_row, "行動パターン文", "統合ヒント", "注意ニュアンス")
        or f"{a.planet1_ja}と{a.planet2_ja}の{a.aspect_ja}です。"
    )

def build_motion_fallback(planet_name: str, retrograde: str, motion_index: Dict[Tuple[str, str], Dict[str, Any]]) -> str:
    if not retrograde:
        return ""
    row = motion_index.get((planet_name, retrograde), {})
    row_text = _pick_row_text(row)
    if row_text:
        return row_text
    return f"{planet_name}の順逆テーマが強調されやすい配置です。"

def build_node_fallback(
    n: NodeData,
    conflict_direction_index: Optional[Dict[str, Dict[str, Any]]] = None,
) -> str:
    node_theme_source = conflict_direction_index
    sign_en = clean_text(getattr(n, "sign_en", "")).lower()
    house = clean_text(getattr(n, "house", ""))
    theme_id = f"node_{sign_en}_{house}h_direction" if sign_en and house else ""

    if node_theme_source:
        # Prefer a future node_theme.csv index when passed as a context-like object.
        if not isinstance(node_theme_source, dict):
            row = get_node_theme_row(theme_id, node_theme_source) if theme_id else None
            if row:
                row_text = _pick_row_text(row, "summary", "section5_text", "section8_text")
                if row_text:
                    return row_text

        # Current behavior: conflict_direction.csv lookup
        if isinstance(node_theme_source, dict) and theme_id:
            row = node_theme_source.get(theme_id, {})
            if clean_text(row.get("role")) == "direction":
                row_text = _pick_row_text(row, "summary", "section5_text", "section8_text")
                if row_text:
                    return row_text

    house_str = f"{n.house}ハウス" if getattr(n, "house", None) else ""
    if n.name_en == "North Node":
        if house_str:
            return f"今世で新しく開拓し、成長していく方向性が{n.sign_ja}{house_str}のテーマにあります。"
        return f"今世で新しく開拓し、成長していく方向性が{n.sign_ja}のテーマにあります。"
    else:
        if house_str:
            return f"無意識に慣れ親しんでおり、手放しや統合が求められる過去のパターンが{n.sign_ja}{house_str}のテーマにあります。"
        return f"無意識に慣れ親しんでおり、手放しや統合が求められる過去のパターンが{n.sign_ja}のテーマにあります。"
