from typing import List, Dict, Any, Tuple, Optional, Set
from collections import Counter
from io_utils import clean_text, get_first, get_hemisphere_axis_row
from models import (
    PlanetData, AngleData, AspectData, NodeData,
    PlanetStrength, PatternStrength, ChartDominanceProfile,
    ChartEvidenceBundle, IntegratedReading, NarrativeBundle, NarrativePlan, NarrativeSectionPlan
)

from config import (
    ELEMENT_MODALITY_WEIGHTS,
    SIGN_ELEMENTS,
    SIGN_MODALITIES,
    PLANET_ORDER,
    SIGN_RULERS,
    PLANET_PRIORITY,
    ESSENTIAL_DIGNITIES,
    DOMINANCE_WEIGHTS,
    ANGULAR_HOUSES,
    SUCCEDENT_HOUSES,
    CADENT_HOUSES,
    UPPER_HEMISPHERE_HOUSES,
    LOWER_HEMISPHERE_HOUSES,
    EASTERN_HEMISPHERE_HOUSES,
    WESTERN_HEMISPHERE_HOUSES,
    MAJOR_PATTERN_PRIORITY
)

def find_aspect_between(aspects: List[AspectData], p1_en: str, p2_en: str) -> Optional[AspectData]:
    target = {p1_en, p2_en}
    for a in aspects:
        if {a.planet1_en, a.planet2_en} == target:
            return a
    return None

def find_aspects_for(aspects: List[AspectData], target_en: str) -> List[AspectData]:
    return [a for a in aspects if a.planet1_en == target_en or a.planet2_en == target_en]

def is_node_name(name_en: str) -> bool:
    return "Node" in str(name_en or "")

def get_other_aspect_target(aspect: AspectData, target_en: str) -> str:
    return aspect.planet2_en if aspect.planet1_en == target_en else aspect.planet1_en

def get_node_contacts(aspects: List[AspectData], target_names: Set[str]) -> List[AspectData]:
    return [
        a for a in aspects
        if (
            (a.planet1_en in target_names and is_node_name(a.planet2_en))
            or (a.planet2_en in target_names and is_node_name(a.planet1_en))
        )
    ]

def collect_sign_distribution(planets: List[PlanetData], angles: Optional[List[AngleData]] = None, include_angles: bool = False) -> Counter:
    counts = Counter()
    for p in planets:
        counts[p.sign_ja] += 1
    if include_angles and angles:
        for a in angles:
            counts[a.sign_ja] += 1
    return counts

def collect_house_distribution(planets: List[PlanetData], has_birth_time: bool = True) -> Counter:
    counts = Counter()
    if not has_birth_time:
        return counts
    for p in planets:
        if p.has_house:
            counts[p.house] += 1
    return counts

def analyze_elements_and_modalities(planets: List[PlanetData], angles: Optional[List[AngleData]] = None, has_birth_time: bool = True) -> Dict[str, Dict[str, float]]:
    element_scores = {"火": 0.0, "地": 0.0, "風": 0.0, "水": 0.0}
    modality_scores = {"活動": 0.0, "不動": 0.0, "柔軟": 0.0}

    def add_score(name_en: str, sign_ja: str) -> None:
        if not sign_ja:
            return
        weight = ELEMENT_MODALITY_WEIGHTS.get(name_en, 1.0)
        element = SIGN_ELEMENTS.get(sign_ja)
        modality = SIGN_MODALITIES.get(sign_ja)
        if element:
            element_scores[element] += weight
        if modality:
            modality_scores[modality] += weight

    for p in planets:
        add_score(p.name_en, p.sign_ja)

    if has_birth_time and angles:
        for a in angles:
            if a.name_en and getattr(a, 'sign_ja', None):
                add_score(a.name_en, a.sign_ja)

    return {
        "elements": element_scores,
        "modalities": modality_scores,
    }

def sort_score_dict(d: Dict[str, float]) -> List[Tuple[str, float]]:
    return sorted(d.items(), key=lambda x: x[1], reverse=True)

def get_dominant_and_weak(d: Dict[str, float]) -> Tuple[str, str, List[Tuple[str, float]]]:
    ordered = sort_score_dict(d)
    dominant = ordered[0][0] if ordered else ""
    weak = ordered[-1][0] if ordered else ""
    return dominant, weak, ordered

def _safe_float(value: Any) -> Optional[float]:
    try:
        return float(str(value).strip())
    except Exception:
        return None

def detect_stelliums(planets: List[PlanetData], min_count: int = 3, has_birth_time: bool = True, strong_orb: float = 15.0) -> List[Dict[str, Any]]:
    groups = {}
    if has_birth_time:
        for p in planets:
            if p.has_house:
                key = (p.sign_ja, p.house)
                val = groups.get(key, [])
                val.append(p)
                groups[key] = val
    else:
        sign_groups: Dict[str, List[PlanetData]] = {}
        for p in planets:
            val2 = sign_groups.get(p.sign_ja, [])
            val2.append(p)
            sign_groups[p.sign_ja] = val2
        for sign_ja, members in sign_groups.items():
            groups[(sign_ja, "")] = members

    stelliums = []
    for (sign_ja, house), members in groups.items():
        if members and len(members) >= min_count:
            members_sorted = sorted(
                members,
                key=lambda x: PLANET_ORDER.index(x.name_en) if x.name_en in PLANET_ORDER else 999,
            )
            degrees = [_safe_float(m.degree) for m in members_sorted]
            valid_degrees = [float(d) for d in degrees if d is not None]
            degree_span = None
            if len(valid_degrees) >= 2:
                degree_span = round(float(max(valid_degrees) - min(valid_degrees)), 2)
            strength = "strong" if degree_span is not None and degree_span <= strong_orb else "loose"
            if degree_span is None:
                strength = "unknown"
            stelliums.append({
                "sign_ja": sign_ja,
                "house": house,
                "members": members_sorted,
                "count": len(members_sorted),
                "degree_span": degree_span,
                "strength": strength,
            })

    strength_order = {"strong": 0, "loose": 1, "unknown": 2}
    stelliums.sort(key=lambda x: (strength_order.get(x["strength"], 9), -x["count"]))
    return stelliums

def has_aspect(aspects: List[AspectData], p1: str, p2: str, aspect_name: str) -> bool:
    a = find_aspect_between(aspects, p1, p2)
    return bool(a and a.aspect_en == aspect_name)

def detect_t_square(aspects: List[AspectData]) -> List[Tuple[str, ...]]:
    planets_set = {a.planet1_en for a in aspects} | {a.planet2_en for a in aspects}
    planets = sorted(list(planets_set))
    found: List[Tuple[str, ...]] = []
    for apex in planets:
        for p1 in planets:
            for p2 in planets:
                if len({apex, p1, p2}) < 3:
                    continue
                if not has_aspect(aspects, apex, p1, "square"):
                    continue
                if not has_aspect(aspects, apex, p2, "square"):
                    continue
                if not has_aspect(aspects, p1, p2, "opposition"):
                    continue
                trio = tuple(sorted([apex, p1, p2]))
                if trio not in found:
                    found.append(trio)
    return found

def detect_grand_trine(aspects: List[AspectData]) -> List[Tuple[str, ...]]:
    planets_set = {a.planet1_en for a in aspects} | {a.planet2_en for a in aspects}
    planets = sorted(list(planets_set))
    found: List[Tuple[str, ...]] = []
    for i, p1 in enumerate(planets):
        for j, p2 in enumerate(planets[i + 1 :], start=i + 1):
            for p3 in planets[j + 1 :]:
                if has_aspect(aspects, p1, p2, "trine") and has_aspect(aspects, p1, p3, "trine") and has_aspect(aspects, p2, p3, "trine"):
                    trio = tuple(sorted([p1, p2, p3]))
                    found.append(trio)
    return found

def detect_kite(aspects: List[AspectData]) -> List[Tuple[Tuple[str, ...], str]]:
    grand_trines = detect_grand_trine(aspects)
    found: List[Tuple[Tuple[str, ...], str]] = []
    all_planets_set = {a.planet1_en for a in aspects} | {a.planet2_en for a in aspects}
    all_planets = sorted(list(all_planets_set))
    for trio in grand_trines:
        trio_set = set(trio) # type: ignore
        for apex in all_planets:
            if apex in trio_set:
                continue
            oppositions = sum(1 for p in trio if has_aspect(aspects, apex, str(p), "opposition"))
            sextiles = sum(1 for p in trio if has_aspect(aspects, apex, str(p), "sextile"))
            if oppositions >= 1 and sextiles >= 2:
                found.append((tuple(sorted(trio)), apex))
    return found

def detect_yod(aspects: List[AspectData]) -> List[Tuple[str, Tuple[str, ...]]]:
    planets_set = {a.planet1_en for a in aspects} | {a.planet2_en for a in aspects}
    planets = sorted(list(planets_set))
    found: List[Tuple[str, Tuple[str, ...]]] = []
    for apex in planets:
        for p1 in planets:
            for p2 in planets:
                if len({apex, p1, p2}) < 3:
                    continue
                if not has_aspect(aspects, apex, p1, "quincunx"):
                    continue
                if not has_aspect(aspects, apex, p2, "quincunx"):
                    continue
                if not has_aspect(aspects, p1, p2, "sextile"):
                    continue
                trio = (apex, tuple(sorted([p1, p2])))
                if trio not in found:
                    found.append(trio)
    return found

def find_ruler_positions(planets: List[PlanetData], sign_ja: str) -> List[PlanetData]:
    rulers = SIGN_RULERS.get(sign_ja, [])
    positions = []
    for ruler in rulers:
        matched = [p for p in planets if p.name_en == ruler]
        for m in matched:
            positions.append(m)
    return positions

def get_chart_ruler_influence(planets: List[PlanetData], angles: List[AngleData], has_birth_time: bool = True) -> Optional[PlanetData]:
    if not has_birth_time:
        return None
    asc = next((a for a in angles if a.name_en == "ASC"), None)
    if not asc:
        return None
    rulers = SIGN_RULERS.get(asc.sign_ja, [])
    if not rulers:
        return None
    ruler_name = rulers[0]  # Take primary ruler
    return next((p for p in planets if p.name_en == ruler_name), None)

def get_angle_ruler_positions(planets: List[PlanetData], angles: List[AngleData], angle_name: str) -> List[PlanetData]:
    target_angle = next((a for a in angles if a.name_en == angle_name), None)
    if not target_angle or not target_angle.sign_ja:
        return []
    
    rulers = SIGN_RULERS.get(target_angle.sign_ja, [])
    positions = []
    
    # 複数支配星（モダンと伝統など）をすべて返す
    for ruler_name in rulers:
        matched = [p for p in planets if p.name_en == ruler_name]
        positions.extend(matched)
        
    return positions

def get_final_dispositor(planets: List[PlanetData]) -> Optional[PlanetData]:
    candidate_planets = [p for p in planets if not is_node_name(getattr(p, "name_en", ""))]
    if not candidate_planets:
        return None

    by_name = {p.name_en: p for p in candidate_planets if getattr(p, "name_en", "")}

    def trace_chain(start: PlanetData) -> Optional[str]:
        current = start
        visited: Set[str] = set()
        while current and current.name_en not in visited:
            visited.add(current.name_en)
            rulers = SIGN_RULERS.get(getattr(current, "sign_ja", ""), [])
            if not rulers:
                return None
            primary_ruler = rulers[0]
            if primary_ruler == current.name_en:
                return current.name_en
            current = by_name.get(primary_ruler)
        return None

    finals = [trace_chain(p) for p in candidate_planets]
    finals = [name for name in finals if name]
    if not finals:
        return None

    final_counts = Counter(finals)
    final_name, count = final_counts.most_common(1)[0]
    if count == len(candidate_planets):
        return by_name.get(final_name)
    return None

def detect_unaspected_planets(planets: List[PlanetData], aspects: List[AspectData]) -> List[PlanetData]:
    # メジャーアスペクトを一つも持たない天体を抽出する
    major_aspects = {"conjunction", "opposition", "square", "trine", "sextile", "quincunx"}
    aspected_names = set()
    for a in aspects:
        if a.aspect_en not in major_aspects:
            continue
        aspected_names.add(a.planet1_en)
        aspected_names.add(a.planet2_en)
    
    unaspected = []
    for p in planets:
        if is_node_name(getattr(p, "name_en", "")):
            continue
        if p.name_en not in aspected_names:
            unaspected.append(p)
    return unaspected

def score_aspect_for_display(aspect: AspectData, planets: Optional[List[PlanetData]] = None) -> float:
    base_score = aspect.priority
    
    # orbの狭さによる加点
    orb = float(aspect.orb_value) if aspect.orb_value else 5.0
    orb_bonus = float(max(0.0, 10.0 - orb * 2.0)) # タイトなほど高得点（最大10点）
    
    # 重要天体（太陽・月・ASC/MC）の関与による加点
    important_points = {"Sun", "Moon", "ASC", "MC"}
    important_bonus = 0.0
    if aspect.planet1_en in important_points: important_bonus += 15.0
    if aspect.planet2_en in important_points: important_bonus += 15.0
    
    # ドラゴンヘッド/テールの関与による加点（課題としての重要度上げ）
    if "Node" in aspect.planet1_en: important_bonus += 10.0
    if "Node" in aspect.planet2_en: important_bonus += 10.0
    
    # アスペクト種別による追加調整
    aspect_bonus = 0.0
    if aspect.aspect_en == "conjunction": aspect_bonus = 5.0
    if aspect.aspect_en == "opposition": aspect_bonus = 3.0
    if aspect.aspect_en == "square": aspect_bonus = 4.0
    if aspect.aspect_en == "quincunx": aspect_bonus = 2.0
    
    return float(base_score) + orb_bonus + important_bonus + aspect_bonus

def rank_important_features(
    planets: List[PlanetData],
    angles: List[AngleData],
    aspects: List[AspectData],
    nodes: List[NodeData],
    stelliums: List[Dict[str, Any]],
    patterns: Dict[str, List[Any]],
    has_birth_time: bool = True
) -> List[Dict[str, Any]]:
    features = []
    
    # 1. 太陽/月/ASC/MC
    for p in planets:
        if p.name_en in ("Sun", "Moon"):
            features.append(_make_feature("planet", p, 100, "core_self"))
        elif p.name_en == "Saturn":
             features.append(_make_feature("planet", p, 90, "growth_challenge"))
        elif p.name_en == "Pluto":
             features.append(_make_feature("planet", p, 85, "deep_transformation"))
        elif p.name_en == "Jupiter":
             features.append(_make_feature("planet", p, 85, "expansion_strength"))
        else:
            base_score = PLANET_PRIORITY.get(p.name_en, 50)
            if has_birth_time and p.house in ("6", "8", "10"):
                base_score += 15
            features.append(_make_feature("planet", p, base_score, "base_planet"))
            
    for a in angles:
        if a.name_en in ("ASC", "MC"):
             features.append(_make_feature("angle", a, 95, "life_axis"))
             
    # 2. ノード
    for n in nodes:
        if n.name_en == "North Node":
             features.append(_make_feature("node", n, 95, "node_direction"))
             
    # 3. ステリウム
    for st in stelliums:
         count = st.get("count", 3)
         strength = st.get("strength", "loose")
         score = 80 + (count - 3) * 5
         if strength == "strong": score += 10
         features.append(_make_feature("stellium", st, score, "stellium_concentration", count=count))
         
    # 4. パターン
    for pat_name, pat_list in patterns.items():
        for pat in pat_list:
             score = 90
             if pat_name == "t_square" or pat_name == "yod": score = 95 # 課題・独自の推進力として高めに
             features.append(_make_feature("pattern", pat, score, "pattern_major", pattern=pat_name))
             
    # 5. タイトなアスペクト
    for aspect in aspects:
        orb = aspect.orb_value
        if orb <= 2.0:
            features.append(_make_feature("aspect", aspect, 85, "tight_aspect"))
            
    # ソートして上位を返す
    features.sort(key=lambda x: x["score"], reverse=True)
    return features

def _get_reason_text(reason_code: str, **kwargs: Any) -> str:
    # TODO: reason text lookup via new_csv_needed (e.g. feature_reason.csv)
    mapping = {
        "core_self": "コア人格の核",
        "growth_challenge": "成長の重要課題",
        "deep_transformation": "根本的な変容・カルマ（課題）",
        "expansion_strength": "拡大・発展の分野（強み）",
        "base_planet": "基本天体",
        "life_axis": "人生の基本テーマ",
        "node_direction": "今世の方向性（ノード）",
        "stellium_concentration": "エネルギーの集中（{count}天体）",
        "pattern_major": "重要チャートパターン（{pattern}）",
        "tight_aspect": "非常にタイトなアスペクト",
    }
    template = mapping.get(reason_code, reason_code)
    try:
        return template.format(**kwargs)
    except Exception:
        return template


def _make_feature(feature_type: str, obj: Any, score: float, reason_code: str, **reason_kwargs: Any) -> Dict[str, Any]:
    return {
        "type": feature_type,
        "obj": obj,
        "score": score,
        "reason_code": reason_code,
        "reason": _get_reason_text(reason_code, **reason_kwargs),
    }


def _get_strength_reason_text(reason_code: str) -> str:
    # TODO: strength reason lookup via new_csv_needed (e.g. strength_reason.csv)
    mapping = {
        "asc_ruler": "ASC支配星",
        "mc_ruler": "MC支配星",
        "angular_house": "アンギュラーハウス",
        "domicile": "ドミサイル(本来の座)",
        "exaltation": "エグザルテーション(高揚の座)",
    }
    return mapping.get(reason_code, reason_code)

def find_aspect_patterns(planets: List[PlanetData], aspects: List[AspectData]) -> Tuple[List[Any], List[Any], List[Any], List[Any]]:
    t_squares = detect_t_square(aspects)
    grand_trines = detect_grand_trine(aspects)
    kites = detect_kite(aspects)
    try:
        yods = detect_yod(aspects)
    except Exception:
        yods = []

def compute_planet_strengths(
    planets: List[PlanetData],
    angles: List[AngleData],
    aspects: List[AspectData],
    nodes: List[NodeData],
    stelliums: List[Dict[str, Any]],
    patterns: Dict[str, List[Any]],
    has_birth_time: bool = True
) -> List[PlanetStrength]:
    strengths: List[PlanetStrength] = []
    
    # 支配星の事前特定
    asc_rulers = set()
    mc_rulers = set()
    if has_birth_time:
        for a in angles:
            if a.name_en == "ASC" and a.sign_ja:
                asc_rulers.update(SIGN_RULERS.get(a.sign_ja, []))
            elif a.name_en == "MC" and a.sign_ja:
                mc_rulers.update(SIGN_RULERS.get(a.sign_ja, []))

    for p in planets:
        if is_node_name(getattr(p, "name_en", "")):
            continue
        st = PlanetStrength(
            planet=p,
            base_priority=PLANET_PRIORITY.get(p.name_en, 50.0)
        )
        
        # b. ruler_bonus
        if p.name_en in asc_rulers:
            st.ruler_bonus += DOMINANCE_WEIGHTS["asc_ruler"]
            st.reasons.append(_get_strength_reason_text("asc_ruler"))
        if p.name_en in mc_rulers:
            st.ruler_bonus += DOMINANCE_WEIGHTS["mc_ruler"]
            st.reasons.append(_get_strength_reason_text("mc_ruler"))
            
        # c. angle_house_bonus
        if has_birth_time and p.has_house:
            if p.house in ANGULAR_HOUSES:
                st.angle_house_bonus += DOMINANCE_WEIGHTS["angle_house"]
                st.reasons.append(_get_strength_reason_text("angular_house"))
            elif p.house in SUCCEDENT_HOUSES:
                st.angle_house_bonus += DOMINANCE_WEIGHTS["succedent_house"]
            elif p.house in CADENT_HOUSES:
                st.angle_house_bonus += DOMINANCE_WEIGHTS["cadent_house"]
                
        # d. dignity_bonus
        dignities = ESSENTIAL_DIGNITIES.get(p.name_en)
        if dignities:
            if p.sign_ja in dignities.get("domicile", []):
                st.dignity_bonus += 20.0
                st.reasons.append(_get_strength_reason_text("domicile"))
            elif p.sign_ja in dignities.get("exaltation", []):
                st.dignity_bonus += 14.0
                st.reasons.append(_get_strength_reason_text("exaltation"))
            elif p.sign_ja in dignities.get("detriment", []):
                st.dignity_bonus -= 12.0
            elif p.sign_ja in dignities.get("fall", []):
                st.dignity_bonus -= 18.0
                
        # e. retrograde_adjust
        if p.retrograde == "R":
            if p.name_en in ["Sun", "Moon", "Mercury", "Venus", "Mars"]:
                st.retrograde_adjust -= 5.0
            else:
                st.retrograde_adjust -= 2.0
                
        # f. aspect_bonus
        p_aspects = find_aspects_for(aspects, p.name_en)
        for a in p_aspects:
            orb = a.orb_value
            if orb < 2.0:
                st.aspect_bonus += DOMINANCE_WEIGHTS["tight_aspect"]
            elif orb < 4.0:
                st.aspect_bonus += DOMINANCE_WEIGHTS["medium_aspect"]
            else:
                st.aspect_bonus += 3.0
                
            other_p = a.planet2_en if a.planet1_en == p.name_en else a.planet1_en
            if other_p in ["Sun", "Moon", "ASC", "MC"]:
                st.aspect_bonus += 8.0
                
            if a.aspect_en in ["conjunction", "square", "opposition"]:
                st.aspect_bonus += 5.0
            elif a.aspect_en in ["trine", "sextile"]:
                st.aspect_bonus += 3.0
            elif a.aspect_en == "quincunx":
                st.aspect_bonus += 2.0
                
        # g. node_bonus
        for a in p_aspects:
            other_p = a.planet2_en if a.planet1_en == p.name_en else a.planet1_en
            if other_p == "North Node":
                if a.aspect_en in ["conjunction", "square", "opposition"]:
                    st.node_bonus += DOMINANCE_WEIGHTS["north_node_contact"]
                elif a.aspect_en in ["trine", "sextile"]:
                    st.node_bonus += 5.0
            elif other_p == "South Node":
                if a.aspect_en in ["conjunction", "square", "opposition"]:
                    st.node_bonus += DOMINANCE_WEIGHTS["south_node_contact"]
                elif a.aspect_en in ["trine", "sextile"]:
                    st.node_bonus += 5.0
                    
        # h. stellium_bonus
        for stellium in stelliums:
            member_names = [m.name_en for m in stellium["members"]]
            if p.name_en in member_names:
                st.stellium_bonus += DOMINANCE_WEIGHTS["stellium_member"]
                if p.name_en in asc_rulers or p.name_en in ["Sun", "Moon"]:
                    st.stellium_bonus += DOMINANCE_WEIGHTS["stellium_lead"] - DOMINANCE_WEIGHTS["stellium_member"] + 5.0
                    
        # i. pattern_bonus
        # (Using basic arrays as placeholder, apex calculation handled in detect_patterns_v2 later)
        # We will iterate patterns later, but here we estimate participation
        tsq_list = patterns.get("t_square", [])
        in_t_square = any(p.name_en in getattr(pat, "members", pat) or p.name_en == getattr(pat, "apex", None) for pat in tsq_list)
        
        yod_list = patterns.get("yod", [])
        in_yod = any(p.name_en in getattr(pat, "members", (pat[0], pat[1][0], pat[1][1]) if isinstance(pat, tuple) and len(pat) > 1 else pat) or p.name_en == getattr(pat, "apex", None) for pat in yod_list)
        
        gt_list = patterns.get("grand_trine", [])
        in_gt = any(p.name_en in getattr(pat, "members", pat) for pat in gt_list)
        
        if in_t_square: st.pattern_bonus += 12.0
        if in_yod: st.pattern_bonus += 12.0
        if in_gt: st.pattern_bonus += 10.0
        
        # Calculate final score
        st.final_score = (
            st.base_priority +
            st.ruler_bonus +
            st.angle_house_bonus +
            st.dignity_bonus +
            st.retrograde_adjust +
            st.aspect_bonus +
            st.node_bonus +
            st.stellium_bonus +
            st.pattern_bonus
        )
        strengths.append(st)
        
    strengths.sort(key=lambda x: x.final_score, reverse=True)
    return strengths

def _get_hemisphere_axis_text(axis_type: str, bias_level: str, ctx: Any | None = None) -> Optional[str]:
    # TODO: hemisphere_axis.csv lookup (axis_type + bias_level) via ctx index
    # Example axis_type: "hemisphere", "east_west"
    # Example bias_level: "upper", "lower", "eastern", "western"
    row = get_hemisphere_axis_row(axis_type, bias_level, ctx)
    if row:
        text = clean_text(get_first(row, "summary", "text", "解釈文", "要約", "説明"))
        if text:
            return text
    fallback = {
        ("hemisphere", "upper"): "社会志向",
        ("hemisphere", "lower"): "個人基盤重視",
        ("east_west", "eastern"): "自力開拓型",
        ("east_west", "western"): "対人協働型",
    }
    return fallback.get((axis_type, bias_level))


def _calculate_hemisphere_bias(planets: List[PlanetData]) -> List[str]:
    upper, lower, eastern, western = 0, 0, 0, 0
    for p in planets:
        if not p.has_house: continue
        if p.house in UPPER_HEMISPHERE_HOUSES: upper += 1
        if p.house in LOWER_HEMISPHERE_HOUSES: lower += 1
        if p.house in EASTERN_HEMISPHERE_HOUSES: eastern += 1
        if p.house in WESTERN_HEMISPHERE_HOUSES: western += 1
        
    total = upper + lower
    axes = []
    if total >= 6:
        if upper - lower >= 3:
            text = _get_hemisphere_axis_text("hemisphere", "upper")
            if text:
                axes.append(text)
        elif lower - upper >= 3:
            text = _get_hemisphere_axis_text("hemisphere", "lower")
            if text:
                axes.append(text)

    ew_total = eastern + western
    if ew_total >= 6:
        if eastern - western >= 3:
            text = _get_hemisphere_axis_text("east_west", "eastern")
            if text:
                axes.append(text)
        elif western - eastern >= 3:
            text = _get_hemisphere_axis_text("east_west", "western")
            if text:
                axes.append(text)
    return axes

def compute_chart_dominance_profile(
    planets: List[PlanetData],
    angles: List[AngleData],
    aspects: List[AspectData],
    nodes: List[NodeData],
    planet_strengths: List[PlanetStrength],
    patterns: Dict[str, List[PatternStrength]],
    has_birth_time: bool = True
) -> ChartDominanceProfile:
    
    # 2. 要素順位 & 区分順位
    em_data = analyze_elements_and_modalities(planets, angles, has_birth_time)
    dominant_elements = sort_score_dict(em_data["elements"])
    dominant_modalities = sort_score_dict(em_data["modalities"])
    
    # 4. ハウス集中 Top3
    house_dist = collect_house_distribution(planets, has_birth_time)
    dominant_houses = house_dist.most_common(3) if has_birth_time and house_dist else [] # pyre-ignore[16]
    
    # 5. 半球偏り
    axes = _calculate_hemisphere_bias(planets) if has_birth_time else []
    
    # 7. パターン (flat list of the most dominant ones)
    all_patterns = []
    for p_list in patterns.values():
        all_patterns.extend(p_list)
    all_patterns.sort(key=lambda x: x.score, reverse=True)
    dominant_patterns = all_patterns[:3]
    
    # 8. ノード関与天体
    dominant_nodes = []
    # Simplified approach for profile summary
    for n in nodes:
        a_list = find_aspects_for(aspects, n.name_en)
        if any(a.orb_value < 5.0 for a in a_list):
            dominant_nodes.append(n.name_en)

    return ChartDominanceProfile(
        dominant_planets=planet_strengths[:3],
        dominant_elements=dominant_elements,
        dominant_modalities=dominant_modalities,
        dominant_houses=dominant_houses,
        dominant_axes=axes,
        dominant_patterns=dominant_patterns,
        dominant_nodes=dominant_nodes
    )

from itertools import combinations

def _score_pattern(pattern_type: str, members: Any, apex: str, aspects: List[AspectData]) -> float:
    # pyre-ignore[16]
    score = MAJOR_PATTERN_PRIORITY.get(pattern_type, 80)
    
    important = {"Sun", "Moon", "ASC", "MC"}
    nodes = {"North Node", "South Node"}
    
    if any(m in important for m in members):
        score += 20
    if any(m in nodes for m in members):
        score += 12
        
    if apex in {"Saturn", "Pluto", "North Node", "South Node"}:
        score += 10
    elif apex in {"Jupiter", "Venus"}:
        score += 8
        
    return float(score)

def detect_patterns_v2(
    planets: List[PlanetData],
    angles: List[AngleData],
    nodes: List[NodeData],
    aspects: List[AspectData]
) -> Dict[str, List[PatternStrength]]:
    
    all_names = {p.name_en for p in planets if p.name_en}

    if angles:
        all_names |= {a.name_en for a in angles if getattr(a, "name_en", None)}

    if nodes:
        all_names |= {n.name_en for n in nodes if getattr(n, "name_en", None)}

    all_names = sorted(all_names)
    
    t_squares = []
    grand_trines = []
    yods = []
    
    # Generate 3-combinations
    for trio in combinations(all_names, 3):
        p1, p2, p3 = trio
        
        # T-Square
        sq1 = has_aspect(aspects, p1, p2, "square")
        sq2 = has_aspect(aspects, p1, p3, "square")
        sq3 = has_aspect(aspects, p2, p3, "square")
        op1 = has_aspect(aspects, p1, p2, "opposition")
        op2 = has_aspect(aspects, p1, p3, "opposition")
        op3 = has_aspect(aspects, p2, p3, "opposition")
        
        if op1 and sq2 and sq3:
            t_squares.append({ "members": (p1, p2, p3), "apex": p3 })
        elif op2 and sq1 and sq3:
            t_squares.append({ "members": (p1, p2, p3), "apex": p2 })
        elif op3 and sq1 and sq2:
            t_squares.append({ "members": (p1, p2, p3), "apex": p1 })

        # Grand Trine
        tr1 = has_aspect(aspects, p1, p2, "trine")
        tr2 = has_aspect(aspects, p1, p3, "trine")
        tr3 = has_aspect(aspects, p2, p3, "trine")
        if tr1 and tr2 and tr3:
            grand_trines.append({ "members": (p1, p2, p3), "apex": "" })
            
        # Yod
        qc1 = has_aspect(aspects, p1, p2, "quincunx")
        qc2 = has_aspect(aspects, p1, p3, "quincunx")
        qc3 = has_aspect(aspects, p2, p3, "quincunx")
        sx1 = has_aspect(aspects, p1, p2, "sextile")
        sx2 = has_aspect(aspects, p1, p3, "sextile")
        sx3 = has_aspect(aspects, p2, p3, "sextile")
        
        if sx1 and qc2 and qc3:
             yods.append({ "members": (p1, p2, p3), "apex": p3 })
        elif sx2 and qc1 and qc3:
             yods.append({ "members": (p1, p2, p3), "apex": p2 })
        elif sx3 and qc1 and qc2:
             yods.append({ "members": (p1, p2, p3), "apex": p1 })

    # Kites (needs Grand Trines)
    kites = []
    for gt in grand_trines:
        gt_members = set(gt["members"])
        for apex in all_names:
            if apex in gt_members:
                continue
            oppositions = sum(1 for p in gt_members if has_aspect(aspects, apex, p, "opposition"))
            sextiles = sum(1 for p in gt_members if has_aspect(aspects, apex, p, "sextile"))
            if oppositions >= 1 and sextiles >= 2:
                members = tuple(sorted(list(gt_members) + [apex]))
                kites.append({ "members": members, "apex": apex })
                
    # Convert to PatternStrength and Score
    # pyre-ignore[9]
    result: Dict[str, List[PatternStrength]] = {
        "t_square": [],
        "grand_trine": [],
        "kite": [],
        "yod": []
    }
    
    for pat in t_squares:
        score = _score_pattern("t_square", pat["members"], str(pat["apex"]), aspects)
        result["t_square"].append(PatternStrength("t_square", pat["members"], score, str(pat["apex"])))
    for pat in grand_trines:
        score = _score_pattern("grand_trine", pat["members"], str(pat["apex"]), aspects)
        result["grand_trine"].append(PatternStrength("grand_trine", pat["members"], score, str(pat["apex"])))
    for pat in kites:
        score = _score_pattern("kite", pat["members"], str(pat["apex"]), aspects)
        result["kite"].append(PatternStrength("kite", pat["members"], score, str(pat["apex"])))
    for pat in yods:
        score = _score_pattern("yod", pat["members"], str(pat["apex"]), aspects)
        result["yod"].append(PatternStrength("yod", pat["members"], score, str(pat["apex"])))
        
    for k in result:
        # pyre-ignore[16]
        result[k].sort(key=lambda x: float(getattr(x, 'score', 0.0)), reverse=True)
        # Limit instances (max 2 per type, T-Square important limit)
        result[k] = list(result[k])[:2]
        
    return result

def integrate_chart_evidence(
    bundle: ChartEvidenceBundle,
    ctx: Any,
    narrative_plan: Optional[NarrativePlan] = None,
    narrative_bundle: Optional[NarrativeBundle] = None,
    narrative_section_plan: Optional[NarrativeSectionPlan] = None,
) -> IntegratedReading:
    chart_profile = bundle.chart_profile
    planet_map = bundle.planet_map
    angle_map = bundle.angle_map
    node_evidence = bundle.node_evidence
    career_evidence = bundle.career_evidence

    def get_planet(name: str) -> Optional[Any]:
        return planet_map.get(name)

    def get_angle(name: str) -> Optional[Any]:
        return angle_map.get(name)

    dominant_planets = [
        planet_map[name]
        for name in bundle.dominant_planets
        if name in planet_map
    ]

    section1 = {
        "profile": chart_profile,
        "dominant_planets": dominant_planets,
        "stelliums": bundle.stelliums,
        "patterns": bundle.patterns_by_type,
    }

    section2 = {
        "asc": get_angle("ASC"),
        "mc": get_angle("MC"),
        "asc_rulers": get_angle("ASC").ruler_evidences if get_angle("ASC") else [],
        "mc_rulers": get_angle("MC").ruler_evidences if get_angle("MC") else [],
        "dominant_planets": dominant_planets,
        "dominant_houses": getattr(chart_profile, "dominant_houses", []) if chart_profile else [],
        "dominant_axes": getattr(chart_profile, "dominant_axes", []) if chart_profile else [],
        "house_focus": (getattr(chart_profile, "dominant_houses", []) or [])[:2] if chart_profile else [],
        "house_focus_texts": [],
    }
    house_master_index = getattr(ctx, "house_master_index", {}) or {}
    house_focus_texts: List[str] = []
    for house, _count in section2.get("house_focus", []) or []:
        row = house_master_index.get(str(house))
        if not isinstance(row, dict):
            continue
        for key in ("人生テーマ文", "補足文", "意味", "テーマ", "サブテーマ1"):
            value = clean_text(row.get(key, ""))
            if value:
                house_focus_texts.append(value)
                break
    section2["house_focus_texts"] = house_focus_texts

    section3 = {
        "sun": get_planet("Sun"),
        "moon": get_planet("Moon"),
        "asc": get_angle("ASC"),
    }

    section4 = {
        "mercury": get_planet("Mercury"),
        "venus": get_planet("Venus"),
        "mars": get_planet("Mars"),
        "dominant_planets": dominant_planets,
    }

    section5 = {
        "saturn": get_planet("Saturn"),
        "pluto": get_planet("Pluto"),
        "node_evidence": node_evidence,
        "unaspected": [p for p in planet_map.values() if getattr(p, "is_unaspected", False)],
    }

    section6 = {
        "career_evidence": career_evidence,
        "dominant_planets": dominant_planets,
        "mc": get_angle("MC"),
        "mc_rulers": get_angle("MC").ruler_evidences if get_angle("MC") else [],
        "jupiter": career_evidence.jupiter if career_evidence else None,
        "house_10_texts": career_evidence.house_10_texts if career_evidence else [],
        "house_6_texts": career_evidence.house_6_texts if career_evidence else [],
        "house_2_texts": career_evidence.house_2_texts if career_evidence else [],
    }

    section7 = {
        "planet_map": planet_map,
        "psychology_evidences": bundle.psychology_evidences,
        "pattern_evidences": bundle.pattern_evidences,
        "patterns_by_type": bundle.patterns_by_type,
        "aspect_evidences": bundle.aspect_evidences,
        "node_evidence": node_evidence,
    }

    summary_focus = []
    if dominant_planets:
        summary_focus.extend(dominant_planets[:3])
    if get_angle("ASC") and get_angle("ASC").ruler_evidences:
        summary_focus.append(get_angle("ASC").ruler_evidences[0])
    if bundle.final_dispositor_name and bundle.final_dispositor_name in planet_map:
        summary_focus.append(planet_map[bundle.final_dispositor_name])
    if node_evidence:
        summary_focus.append(node_evidence)
    if career_evidence:
        summary_focus.append(career_evidence)

    section8 = {
        "dominant_planets": dominant_planets,
        "asc": get_angle("ASC"),
        "asc_ruler": get_angle("ASC").ruler_evidences[0] if get_angle("ASC") and get_angle("ASC").ruler_evidences else None,
        "mc": get_angle("MC"),
        "mc_ruler": get_angle("MC").ruler_evidences[0] if get_angle("MC") and get_angle("MC").ruler_evidences else None,
        "final_dispositor": planet_map.get(bundle.final_dispositor_name) if bundle.final_dispositor_name else None,
        "node_evidence": node_evidence,
        "challenge_planets": [p for p in [get_planet("Saturn"), get_planet("Pluto")] if p],
        "pattern_evidences": bundle.pattern_evidences,
        "career_evidence": career_evidence,
        "summary_evidence": bundle.summary_evidence,
        "summary_focus": summary_focus,
    }

    return IntegratedReading(
        chart_profile=chart_profile,
        section1=section1,
        section2=section2,
        section3=section3,
        section4=section4,
        section5=section5,
        section6=section6,
        section7=section7,
        section8=section8,
        narrative_plan=narrative_plan,
        narrative_bundle=narrative_bundle,
        narrative_section_plan=narrative_section_plan,
    )
