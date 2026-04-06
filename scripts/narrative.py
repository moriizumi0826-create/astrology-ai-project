from typing import Any, Dict, List, Optional, Tuple
import re

from io_utils import (
    apply_stellium_strength,
    clean_text,
    get_aspect_row_for_section7,
    get_conflict_direction_row,
    get_stellium_theme_row,
    normalize_aspect_key,
    normalize_planet_name,
    normalize_sign_name,
)
from master_index import normalize_planet_name_to_en, normalize_sign_name_to_en
from models import (
    ChartContext,
    ChartEvidenceBundle,
    CoreTheme,
    CareerAxisSelection,
    NarrativeBundle,
    NarrativePlan,
    NarrativeSectionPlan,
    Section7Plan,
    Section7AspectItem,
)
from selection import collect_suppressed_theme_ids


def _select_text_from_text_set(text_set: object) -> str:
    """Pick the first meaningful text from a FieldTextSet-like object."""
    if text_set is None:
        return ""

    for attr_name in ("interpretation", "summary", "core", "theme"):
        value = getattr(text_set, attr_name, "")
        if value:
            return value

    for attr_name in ("strengths", "cautions", "relationship", "work", "growth"):
        items = getattr(text_set, attr_name, None)
        if items:
            return items[0]

    return ""


def build_narrative_bundle(
    bundle: ChartEvidenceBundle,
    narrative_plan: Optional[NarrativePlan],
    ctx: ChartContext,
) -> NarrativeBundle:
    """Integrate selected themes into a narrative bundle without generating new text."""
    core_themes = list(getattr(narrative_plan, "core_themes", []) or [])

    main_axis_theme_id, primary_stellium_key = _pick_main_axis(bundle, core_themes, ctx)

    core_theme_id = _theme_id(getattr(narrative_plan, "main_theme", None))
    conflict_theme_id = _theme_id(getattr(narrative_plan, "conflict_theme", None))
    direction_theme_id = _theme_id(getattr(narrative_plan, "direction_theme", None))

    support_theme_ids = _pick_support_theme_ids(
        core_themes,
        reserved_ids={
            main_axis_theme_id,
            core_theme_id,
            conflict_theme_id,
            direction_theme_id,
        },
        limit=3,
    )

    suppressed_theme_ids = _collect_suppressed_ids(
        core_themes,
        selected_ids={
            main_axis_theme_id,
            core_theme_id,
            conflict_theme_id,
            direction_theme_id,
        },
    )
    if primary_stellium_key:
        suppressed_theme_ids.extend(
            _collect_stellium_suppressed_ids(
                bundle,
                core_themes,
                main_axis_theme_id,
                primary_stellium_key,
                ctx,
            )
        )
        suppressed_theme_ids = _dedupe_ids(suppressed_theme_ids)

    return NarrativeBundle(
        main_axis_theme_id=main_axis_theme_id,
        core_theme_id=core_theme_id,
        conflict_theme_id=conflict_theme_id,
        direction_theme_id=direction_theme_id,
        primary_stellium_key=primary_stellium_key,
        support_theme_ids=support_theme_ids,
        suppressed_theme_ids=suppressed_theme_ids,
    )


def build_narrative_section_plan(
    bundle: ChartEvidenceBundle,
    narrative_bundle: NarrativeBundle,
    narrative_plan: Optional[NarrativePlan],
    ctx: ChartContext,
) -> NarrativeSectionPlan:
    """Build section-level narrative usage rules (stellium-centered)."""
    section_plan = NarrativeSectionPlan()
    section_plan.main_axis_theme_id = narrative_bundle.main_axis_theme_id
    section_plan.allow_short_term_conflict = {
        "sec5": False,
        "sec7": True,
        "sec8": True,
    }
    section_plan.allow_growth_theme = {
        "sec5": True,
        "sec7": False,
        "sec8": True,
    }
    section_plan.allow_node_usage = {
        "sec5": True,
        "sec7": False,
        "sec8": True,
    }

    main_axis_theme = _find_theme_by_id(
        getattr(narrative_plan, "core_themes", []) or [],
        narrative_bundle.main_axis_theme_id,
    )
    section_plan.main_axis_source_type = getattr(main_axis_theme, "source_type", "")

    if narrative_bundle.primary_stellium_key:
        stellium = _find_stellium_by_key(
            bundle.stelliums,
            narrative_bundle.primary_stellium_key,
        )
        if stellium:
            payload = build_stellium_payload_from_data(stellium, ctx)
            section_plan.stellium_payload = payload
            section_plan.stellium_section_texts = _build_stellium_section_texts(payload)

    career_selection = select_career_axis(bundle, narrative_bundle, ctx)
    section_plan.career_axis_selection = career_selection
    row = get_career_axis_row_by_selection(career_selection, ctx)
    if row:
        section_plan.career_axis_row = {k: str(v) for k, v in row.items() if isinstance(k, str)}
    section_plan.section6_blocks = _build_section6_blocks(
        bundle=bundle,
        narrative_bundle=narrative_bundle,
        narrative_plan=narrative_plan,
        career_row=row,
        section_plan=section_plan,
        ctx=ctx,
    )

    section_plan.core_personality_blocks = build_core_personality_blocks(
        bundle=bundle,
        ctx=ctx,
    )

    section7_plan = build_section7_plan(
        bundle,
        narrative_plan,
        narrative_bundle,
        ctx,
        allow_node_usage=section_plan.allow_node_usage.get("sec7", False),
        allow_short_term_conflict=section_plan.allow_short_term_conflict.get("sec7", True),
    )
    section_plan.section7_plan = section7_plan
    section_plan.section7_blocks = section7_plan.section7_blocks if section7_plan else {}

    _apply_role_texts_for_sec5_sec8(
        narrative_plan=narrative_plan,
        section7_plan=section7_plan,
        section_plan=section_plan,
    )

    return section_plan


def build_core_personality_blocks(
    bundle: ChartEvidenceBundle,
    ctx: ChartContext,
) -> Dict[str, str]:
    _ = ctx
    planet_map = bundle.planet_map
    angle_map = bundle.angle_map

    sun_ev = planet_map.get("Sun")
    moon_ev = planet_map.get("Moon")
    asc_ev = angle_map.get("ASC")

    core_self = clean_text(_select_text_from_text_set(getattr(sun_ev, "text_set", None)))
    emotional_self = clean_text(_select_text_from_text_set(getattr(moon_ev, "text_set", None)))
    public_self = clean_text(_select_text_from_text_set(getattr(asc_ev, "text_set", None)))

    integrated = _select_integrated_personality(
        core_self=core_self,
        emotional_self=emotional_self,
        public_self=public_self,
    )

    return {
        "core_self": core_self,
        "emotional_self": emotional_self,
        "public_self": public_self,
        "integrated": integrated,
    }


def _select_integrated_personality(
    core_self: str,
    emotional_self: str,
    public_self: str,
) -> str:
    core_self = clean_text(core_self)
    emotional_self = clean_text(emotional_self)
    public_self = clean_text(public_self)

    candidates = [
        {"source": "sun", "text": core_self},
        {"source": "moon", "text": emotional_self},
        {"source": "asc", "text": public_self},
    ]
    candidates = [c for c in candidates if c["text"]]
    if not candidates:
        return core_self or emotional_self or public_self

    non_sun_candidates = [c for c in candidates if c["text"] != clean_text(core_self)]
    has_non_sun = bool(non_sun_candidates)

    non_work_candidates = [c for c in candidates if not _is_work_or_impression_text(c["text"])]
    if non_work_candidates:
        candidates = non_work_candidates

    if has_non_sun and len(candidates) > 1:
        candidates = [c for c in candidates if c["text"] != clean_text(core_self)] or candidates

    if not candidates:
        return core_self or emotional_self or public_self

    token_sets = {c["text"]: _text_bigrams(c["text"]) for c in candidates}

    def similarity_avg(text: str) -> float:
        others = [c["text"] for c in candidates if c["text"] != text]
        if not others:
            return 0.0
        scores = [_jaccard(token_sets.get(text, set()), token_sets.get(o, set())) for o in others]
        return sum(scores) / len(scores)

    def personality_score(text: str) -> int:
        keywords = ["人格", "性格", "人柄", "本質", "自分", "自己", "内面", "価値観", "軸", "在り方", "使い方"]
        return sum(1 for k in keywords if k in text)

    source_priority = {"sun": 4, "moon": 2, "asc": 1}

    def moon_penalty(text: str) -> float:
        if not text:
            return 0.0
        penalty = 0.0
        if "安心" in text or "認められ" in text:
            penalty += 0.3
        return penalty

    scored = []
    for c in candidates:
        text = c["text"]
        score = similarity_avg(text)
        score += personality_score(text) * 0.35
        score += source_priority.get(c["source"], 0) * 0.1
        if _is_work_or_impression_text(text):
            score -= 0.4
        if c["source"] == "moon":
            score -= moon_penalty(text)
        scored.append((score, c))

    scored.sort(key=lambda x: x[0], reverse=True)
    for _score, c in scored:
        if c["text"]:
            return c["text"]

    return core_self or emotional_self or public_self


def _is_work_or_impression_text(text: str) -> bool:
    text = clean_text(text)
    if not text:
        return False
    keywords = [
        "仕事",
        "職業",
        "キャリア",
        "社会",
        "評価",
        "成果",
        "肩書",
        "第一印象",
        "印象",
        "見られ",
        "外から",
    ]
    return any(k in text for k in keywords)


def _text_bigrams(text: str) -> set[str]:
    value = re.sub(r"\s+", "", clean_text(text))
    if not value:
        return set()
    if len(value) < 2:
        return {value}
    return {value[i : i + 2] for i in range(len(value) - 1)}


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    union = a | b
    if not union:
        return 0.0
    return len(a & b) / len(union)


def build_section7_plan(
    bundle: ChartEvidenceBundle,
    narrative_plan: Optional[NarrativePlan],
    narrative_bundle: NarrativeBundle,
    ctx: ChartContext,
    allow_node_usage: bool = False,
    allow_short_term_conflict: bool = True,
) -> Section7Plan:
    conflict_theme = narrative_plan.conflict_theme if narrative_plan else None
    direction_theme = narrative_plan.direction_theme if narrative_plan else None

    reinforcing_items, suppressed_keys = select_section7_aspects(
        bundle=bundle,
        conflict_theme=conflict_theme,
        direction_theme=direction_theme,
        narrative_bundle=narrative_bundle,
        ctx=ctx,
        allow_short_term_conflict=allow_short_term_conflict,
    )
    pattern_items = select_section7_patterns(bundle)
    reinforcing_items = _merge_reinforcing_items(reinforcing_items, pattern_items, limit=3)

    direction_item = select_section7_direction_item(
        bundle=bundle,
        conflict_theme=conflict_theme,
        direction_theme=direction_theme,
        reinforcing_items=reinforcing_items,
        ctx=ctx,
        allow_node_usage=allow_node_usage,
        allow_short_term_conflict=allow_short_term_conflict,
    )

    support_item = select_section7_support_item(
        bundle=bundle,
        reinforcing_items=reinforcing_items,
        ctx=ctx,
        allow_short_term_conflict=allow_short_term_conflict,
    )

    concrete_items = [item for item in reinforcing_items if clean_text(item.section7_summary)]

    core_item = concrete_items[0] if concrete_items else None
    core_conflict_text = ""
    if pattern_items:
        core_conflict_text = clean_text(pattern_items[0].section7_summary)
    if not core_conflict_text and conflict_theme:
        core_conflict_text = _build_conflict_core_text(conflict_theme, ctx)
    if not core_conflict_text:
        core_conflict_text = _pick_text_by_role(core_item, "sec7_core")

    # Factors: exclude core item, dedupe by aspect_key, pick top 2
    factors: List[Section7AspectItem] = []
    used_keys = {core_item.aspect_key} if core_item else set()
    for item in concrete_items:
        if item.aspect_key in used_keys:
            continue
        factors.append(item)
        used_keys.add(item.aspect_key)
        if len(factors) >= 2:
            break

    reinforcing_texts = _dedupe_texts(
        [_pick_text_by_role(item, "sec7_factor") for item in factors],
        limit=2,
    )

    integration_hint = _build_integration_hint(direction_theme, None, bundle, ctx)

    support_text = _pick_text_by_role(support_item, "sec7_support") if support_item else ""

    blocks = {
        "core": _normalize_redundant_phrase(core_conflict_text),
        "reinforcing": [_normalize_redundant_phrase(t) for t in reinforcing_texts if t],
        "integration": _normalize_redundant_phrase(integration_hint),
        "support": _normalize_redundant_phrase(support_text),
    }

    return Section7Plan(
        core_conflict_theme_id=getattr(conflict_theme, "theme_id", ""),
        conflict_summary=core_conflict_text,
        reinforcing_items=reinforcing_items,
        core_item=core_item,
        factor_items=factors,
        direction_item=direction_item,
        support_item=support_item,
        integration_hint=integration_hint,
        suppressed_aspect_keys=suppressed_keys,
        section7_blocks=blocks,
    )


def select_section7_aspects(
    bundle: ChartEvidenceBundle,
    conflict_theme: Optional[CoreTheme],
    direction_theme: Optional[CoreTheme],
    narrative_bundle: NarrativeBundle,
    ctx: ChartContext,
    allow_short_term_conflict: bool = True,
) -> tuple[List[Section7AspectItem], List[str]]:
    aspects = list(bundle.aspect_evidences or [])
    if not aspects:
        return [], []

    conflict_planets = set(getattr(conflict_theme, "planets", []) or [])
    direction_planets = set(getattr(direction_theme, "planets", []) or [])
    _ = narrative_bundle

    candidates: List[tuple[Section7AspectItem, float, str, str]] = []
    quincunx_candidates: List[tuple[Section7AspectItem, float, str, str]] = []
    fallback_candidates: List[tuple[Section7AspectItem, float, str, str]] = []
    fallback_quincunx: List[tuple[Section7AspectItem, float, str, str]] = []
    suppressed: List[str] = []

    def _is_short_term_pair(planets: set[str]) -> bool:
        banned = {"Saturn", "Pluto", "North Node", "South Node", "Node"}
        return not planets.intersection(banned)

    def _has_core_planet(planets: set[str]) -> bool:
        return bool(planets.intersection({"Sun", "Moon", "Mercury", "Mars"}))

    filtered_aspects = []
    for ev in aspects:
        aspect_type = clean_text(ev.aspect.aspect_en).lower()
        if not _is_hard_aspect(aspect_type):
            continue
        planets = {ev.aspect.planet1_en, ev.aspect.planet2_en}
        if allow_short_term_conflict and not _is_short_term_pair(planets):
            continue
        filtered_aspects.append(ev)

    if allow_short_term_conflict:
        core_filtered = [
            ev for ev in filtered_aspects
            if _has_core_planet({ev.aspect.planet1_en, ev.aspect.planet2_en})
        ]
        active_aspects = core_filtered if core_filtered else filtered_aspects
    else:
        active_aspects = filtered_aspects

    hard_pairs: set[tuple[str, str]] = set()
    for ev in active_aspects:
        aspect_type = clean_text(ev.aspect.aspect_en).lower()
        if aspect_type in {"square", "opposition"}:
            pair = tuple(sorted([ev.aspect.planet1_en, ev.aspect.planet2_en]))
            hard_pairs.add(pair)

    for ev in active_aspects:
        aspect_type = clean_text(ev.aspect.aspect_en).lower()
        if not _is_hard_aspect(aspect_type):
            continue
        item, meta = _build_section7_item_from_aspect(ev, conflict_theme, direction_theme, ctx)
        if not item:
            continue
        use_in_section = meta.get("use_in_section", True)
        theme_key = meta.get("theme_key", "")
        is_quincunx = aspect_type == "quincunx"
        pair = tuple(sorted([ev.aspect.planet1_en, ev.aspect.planet2_en]))
        if is_quincunx and pair in hard_pairs:
            suppressed.append(item.aspect_key)
            continue
        if not use_in_section:
            suppressed.append(item.aspect_key)

        planets = {ev.aspect.planet1_en, ev.aspect.planet2_en}
        score = 0.0
        score += _role_score(item.role)
        score += _priority_score(item.priority)
        score += float(item.conflict_weight or 0.0)
        if conflict_planets and planets.intersection(conflict_planets):
            score += 1.2
        if direction_planets and planets.intersection(direction_planets):
            score += 0.6
        if planets.intersection({"Saturn", "Pluto", "Mars"}):
            score += 0.3
        score += float(getattr(ev, "priority", 0.0)) / 100.0

        if item.role == "support":
            continue
        if is_quincunx:
            target = quincunx_candidates if use_in_section else fallback_quincunx
        else:
            target = candidates if use_in_section else fallback_candidates
        target.append((item, score, item.aspect_key, theme_key))

    ordered = sorted(candidates, key=lambda x: x[1], reverse=True)
    quincunx_ordered = sorted(quincunx_candidates, key=lambda x: x[1], reverse=True)
    if not ordered and not quincunx_ordered:
        ordered = sorted(fallback_candidates, key=lambda x: x[1], reverse=True)
        quincunx_ordered = sorted(fallback_quincunx, key=lambda x: x[1], reverse=True)
    selected: List[Section7AspectItem] = []
    used_keys: set[str] = set()
    used_theme_keys: set[str] = set()
    for item, _, aspect_key, theme_key in ordered:
        if len(selected) >= 3:
            break
        if aspect_key and aspect_key in used_keys:
            suppressed.append(aspect_key)
            continue
        if theme_key and theme_key in used_theme_keys:
            suppressed.append(aspect_key)
            continue
        used_keys.add(aspect_key)
        if theme_key:
            used_theme_keys.add(theme_key)
        selected.append(item)

    # Quincunx is treated as a supplemental conflict factor (max 1-2 items)
    if len(selected) < 3 and quincunx_ordered:
        quincunx_added = 0
        for item, _, aspect_key, theme_key in quincunx_ordered:
            if len(selected) >= 3 or quincunx_added >= 2:
                break
            if aspect_key and aspect_key in used_keys:
                suppressed.append(aspect_key)
                continue
            if theme_key and theme_key in used_theme_keys:
                suppressed.append(aspect_key)
                continue
            used_keys.add(aspect_key)
            if theme_key:
                used_theme_keys.add(theme_key)
            selected.append(item)
            quincunx_added += 1

    return selected, _dedupe_ids(suppressed)


def select_section7_direction_item(
    bundle: ChartEvidenceBundle,
    conflict_theme: Optional[CoreTheme],
    direction_theme: Optional[CoreTheme],
    reinforcing_items: List[Section7AspectItem],
    ctx: ChartContext,
    allow_node_usage: bool = False,
    allow_short_term_conflict: bool = True,
) -> Optional[Section7AspectItem]:
    used = {item.aspect_key for item in reinforcing_items}
    candidates: List[tuple[Section7AspectItem, float]] = []

    for ev in bundle.aspect_evidences or []:
        aspect_type = clean_text(ev.aspect.aspect_en).lower()
        if not _is_hard_aspect(aspect_type):
            continue
        if aspect_type == "quincunx":
            continue
        if allow_short_term_conflict:
            planets = {ev.aspect.planet1_en, ev.aspect.planet2_en}
            if planets.intersection({"Saturn", "Pluto", "North Node", "South Node", "Node"}):
                continue
            if not planets.intersection({"Sun", "Moon", "Mercury", "Mars"}):
                continue
        item, meta = _build_section7_item_from_aspect(ev, conflict_theme, direction_theme, ctx)
        if not item or item.aspect_key in used:
            continue
        use_in_section = meta.get("use_in_section", True)
        if not use_in_section:
            continue
        if item.role != "direction":
            continue
        score = _priority_score(item.priority) + float(item.direction_weight or 0.0)
        score += float(getattr(ev, "priority", 0.0)) / 100.0
        candidates.append((item, score))

    if candidates:
        candidates.sort(key=lambda x: x[1], reverse=True)
        return candidates[0][0]

    if allow_node_usage:
        node_item = _build_section7_item_from_node(bundle.node_evidence)
        return node_item
    return None


def select_section7_support_item(
    bundle: ChartEvidenceBundle,
    reinforcing_items: List[Section7AspectItem],
    ctx: ChartContext,
    allow_short_term_conflict: bool = True,
) -> Optional[Section7AspectItem]:
    used = {item.aspect_key for item in reinforcing_items}
    candidates: List[tuple[Section7AspectItem, float]] = []

    for ev in bundle.aspect_evidences or []:
        if ev.aspect.aspect_en not in {"trine", "sextile"}:
            continue
        if allow_short_term_conflict:
            planets = {ev.aspect.planet1_en, ev.aspect.planet2_en}
            if planets.intersection({"Saturn", "Pluto", "North Node", "South Node", "Node"}):
                continue
            if not planets.intersection({"Sun", "Moon", "Mercury", "Mars"}):
                continue
        item, meta = _build_section7_item_from_aspect(ev, None, None, ctx)
        if not item or item.aspect_key in used:
            continue
        use_in_section = meta.get("use_in_section", True)
        if not use_in_section:
            continue
        if item.role != "support":
            continue
        score = _priority_score(item.priority) + float(item.support_weight or 0.0)
        score += float(getattr(ev, "priority", 0.0)) / 100.0
        candidates.append((item, score))

    if candidates:
        candidates.sort(key=lambda x: x[1], reverse=True)
        return candidates[0][0]

    pattern_item = _select_support_pattern_item(bundle)
    return pattern_item


def select_section7_patterns(bundle: ChartEvidenceBundle) -> List[Section7AspectItem]:
    items: List[Section7AspectItem] = []
    for ev in bundle.pattern_evidences or []:
        pattern_type = _pattern_type_from_key(ev.key)
        if pattern_type not in {"t_square", "yod"}:
            continue
        summary = clean_text(ev.text)
        if not summary or not _is_concrete_section7_text(summary):
            continue
        items.append(
            Section7AspectItem(
                aspect_key=f"pattern:{pattern_type}",
                role="conflict",
                priority="high",
                section7_summary=summary,
                conflict_weight=0.8,
                support_weight=0.0,
                direction_weight=0.0,
                source_theme_ids=[],
            )
        )
    return items


def _select_support_pattern_item(bundle: ChartEvidenceBundle) -> Optional[Section7AspectItem]:
    for ev in bundle.pattern_evidences or []:
        pattern_type = _pattern_type_from_key(ev.key)
        if pattern_type not in {"grand_trine", "kite"}:
            continue
        summary = clean_text(ev.text)
        if not summary or not _is_concrete_section7_text(summary):
            continue
        return Section7AspectItem(
            aspect_key=f"pattern:{pattern_type}",
            role="support",
            priority="medium",
            section7_summary=summary,
            conflict_weight=0.0,
            support_weight=0.6,
            direction_weight=0.0,
            source_theme_ids=[],
        )
    return None


def _build_conflict_core_text(conflict_theme: Optional[CoreTheme], ctx: ChartContext) -> str:
    if not conflict_theme:
        return ""
    row = get_conflict_direction_row(getattr(conflict_theme, "theme_id", ""), ctx)
    if row:
        for field in ("summary", "problem_text", "section5_text"):
            value = clean_text(row.get(field, ""))
            if value and _is_concrete_section7_text(value):
                return value
    for field in ("summary", "section5_text"):
        value = clean_text(getattr(conflict_theme, field, ""))
        if value and _is_concrete_section7_text(value):
            return value
    return ""


def _build_integration_hint(
    direction_theme: Optional[CoreTheme],
    direction_item: Optional[Section7AspectItem],
    bundle: ChartEvidenceBundle,
    ctx: ChartContext,
) -> str:
    if direction_item and clean_text(direction_item.section7_summary):
        return clean_text(direction_item.section7_summary)

    if direction_theme:
        row = get_conflict_direction_row(getattr(direction_theme, "theme_id", ""), ctx)
        if row:
            for field in ("growth_text", "section5_text", "summary"):
                value = clean_text(row.get(field, ""))
                if value:
                    return value
        for field in ("section5_text", "summary"):
            value = clean_text(getattr(direction_theme, field, ""))
            if value:
                return value

    node_item = _build_section7_item_from_node(bundle.node_evidence)
    return clean_text(node_item.section7_summary) if node_item else ""


def _is_concrete_section7_text(text: str) -> bool:
    text = clean_text(text)
    if not text:
        return False
    banned_phrases = [
        "複数の緊張",
        "テーマです",
        "傾向があります",
        "緊張関係",
        "推進力",
        "エネルギー",
        "2つの天体",
        "一体化しやすいアスペクト",
        "出やすい",
    ]
    if any(phrase in text for phrase in banned_phrases):
        return False
    required_verbs = ["ぶつかる", "引き合い", "一体化", "噛み合わない", "噛み合い"]
    if not any(verb in text for verb in required_verbs):
        return False
    return True


def _is_concrete_action_text(text: str) -> bool:
    text = clean_text(text)
    if not text:
        return False
    banned_phrases = [
        "複数の緊張",
        "テーマです",
        "傾向があります",
        "緊張関係",
        "推進力",
        "エネルギー",
        "影響",
        "結びつき",
        "2つの天体",
        "一体化しやすいアスペクト",
        "出やすい",
    ]
    if any(phrase in text for phrase in banned_phrases):
        return False
    action_verbs = [
        "ぶつか",
        "引き合",
        "一体化",
        "噛み合",
        "揺れ",
        "増え",
        "止ま",
        "進み",
        "固ま",
        "乱れ",
        "崩れ",
        "深ま",
        "暴走",
        "刺さ",
        "飲み込",
        "断絶",
        "広が",
        "縮ま",
        "強まり",
        "弱まり",
        "ずれ",
        "焦り",
        "空回り",
        "迷い",
        "重く",
        "硬く",
        "溶け",
        "整え",
        "築",
        "通じ",
        "積み上げ",
        "変え",
        "生まれ",
        "作り",
        "提供",
        "進め",
        "深め",
        "保ち",
        "支え",
        "現実化",
        "形に",
        "避け",
        "取り入れ",
        "意識",
        "磨く",
        "学び",
        "見直",
        "実践",
        "続け",
        "活か",
        "確認",
        "向け",
        "捨て",
        "抑え",
        "整え",
        "任せ",
        "見極め",
        "優先",
        "選ぶ",
    ]
    if not any(verb in text for verb in action_verbs):
        return False
    return True


def _pick_first_concrete_text(candidates: List[str]) -> str:
    for text in candidates:
        value = clean_text(text)
        if value and _is_concrete_action_text(value):
            return value
    return ""


def _apply_role_texts_for_sec5_sec8(
    narrative_plan: Optional[NarrativePlan],
    section7_plan: Optional[Section7Plan],
    section_plan: NarrativeSectionPlan,
) -> None:
    if not narrative_plan or not section7_plan:
        return

    used_texts: set[str] = set()
    override_flags = {
        "sec5_conflict": False,
        "sec5_direction": False,
        "sec8_conflict": False,
        "sec8_direction": False,
    }
    sec7_blocks = section7_plan.section7_blocks or {}
    for text in [
        clean_text(sec7_blocks.get("core", "")),
        clean_text(sec7_blocks.get("support", "")),
    ]:
        if text:
            _add_used_text(used_texts, text)
    for t in sec7_blocks.get("reinforcing", []) or []:
        value = clean_text(t)
        if value:
            _add_used_text(used_texts, value)

    def pick_from_item(
        item: Optional[Section7AspectItem],
        role_key: str,
        exclude_columns: Optional[set[str]] = None,
    ) -> str:
        return _pick_text_by_role(
            item,
            role_key,
            used_texts=used_texts,
            exclude_columns=exclude_columns,
        )

    # sec5 Conflict: 注意点 -> 要約 -> 核となる意味
    if narrative_plan.conflict_theme:
        theme = narrative_plan.conflict_theme
        preserved_text = clean_text(getattr(theme, "section5_text", "")) or clean_text(
            getattr(theme, "problem_text", "")
        )
        needs_override = not preserved_text or preserved_text in used_texts
        if _is_priority_conflict_theme(theme) and preserved_text and not needs_override:
            _add_used_text(used_texts, preserved_text)
        elif needs_override:
            core_item = section7_plan.core_item
            exclude_cols = {core_item.selected_column} if core_item else set()
            conflict_text = pick_from_item(core_item, "sec5_conflict", exclude_cols)
            if not conflict_text:
                alt_item = section7_plan.factor_items[0] if section7_plan.factor_items else None
                exclude_cols = {alt_item.selected_column} if alt_item else set()
                conflict_text = pick_from_item(alt_item, "sec5_conflict", exclude_cols)
            if conflict_text:
                _add_used_text(used_texts, conflict_text)
                theme.section5_text = conflict_text
                override_flags["sec5_conflict"] = True

    # sec5 Direction: 成長のコツ -> 要約 -> 解釈文
    if narrative_plan.direction_theme:
        theme = narrative_plan.direction_theme
        is_node_direction = (
            getattr(theme, "source_type", "") == "node"
            or getattr(theme, "theme_id", "") == "node:axis"
        )
        if is_node_direction:
            # Keep node direction texts as-is (do not override via section7)
            pass
        else:
            preserved_text = clean_text(getattr(theme, "section5_text", "")) or clean_text(
                getattr(theme, "summary", "")
            )
            needs_override = not preserved_text or preserved_text in used_texts
            if preserved_text and not needs_override:
                _add_used_text(used_texts, preserved_text)
            else:
                direction_item = section7_plan.direction_item
                exclude_cols = {direction_item.selected_column} if direction_item else set()
                direction_text = pick_from_item(direction_item, "sec5_direction", exclude_cols)
                if direction_text and not _is_direction_text(direction_text, allow_lifespan=True):
                    direction_text = ""
                if not direction_text:
                    core_item = section7_plan.core_item
                    exclude_cols = {core_item.selected_column} if core_item else set()
                    direction_text = pick_from_item(core_item, "sec5_direction", exclude_cols)
                    if direction_text and not _is_direction_text(direction_text, allow_lifespan=True):
                        direction_text = ""
                if not direction_text:
                    alt_item = section7_plan.factor_items[0] if section7_plan.factor_items else None
                    exclude_cols = {alt_item.selected_column} if alt_item else set()
                    direction_text = pick_from_item(alt_item, "sec5_direction", exclude_cols)
                    if direction_text and not _is_direction_text(direction_text, allow_lifespan=True):
                        direction_text = ""
                if direction_text:
                    _add_used_text(used_texts, direction_text)
                    theme.section5_text = direction_text
                    override_flags["sec5_direction"] = True
                    # If sec7 hint duplicates sec5 direction, pick alternate hint.
                    sec7_blocks = section7_plan.section7_blocks or {}
                    if clean_text(sec7_blocks.get("integration", "")) == direction_text:
                        alt_hint = ""
                        for item in section7_plan.factor_items:
                            alt_hint = _pick_text_by_role(item, "sec7_hint", used_texts)
                            if alt_hint:
                                break
                        if not alt_hint:
                            alt_hint = _pick_text_by_role(section7_plan.core_item, "sec7_hint", used_texts)
                        if alt_hint:
                            section7_plan.section7_blocks["integration"] = alt_hint
                            _add_used_text(used_texts, alt_hint)

    # sec8 Conflict: 解釈文 -> 要約 -> 注意点 -> 核となる意味
    if narrative_plan.conflict_theme:
        theme = narrative_plan.conflict_theme
        preserved_text = clean_text(getattr(theme, "section8_text", "")) or clean_text(
            getattr(theme, "problem_text", "")
        )
        needs_override = not preserved_text or preserved_text in used_texts
        if override_flags["sec5_conflict"]:
            needs_override = False
        if preserved_text and not needs_override:
            _add_used_text(used_texts, preserved_text)
        elif needs_override:
            core_item = section7_plan.core_item
            exclude_cols = {core_item.selected_column} if core_item else set()
            conflict_text = pick_from_item(core_item, "sec8_conflict", exclude_cols)
            if conflict_text and not _is_conflict_text(conflict_text):
                conflict_text = ""
            if not conflict_text:
                alt_item = section7_plan.factor_items[0] if section7_plan.factor_items else None
                exclude_cols = {alt_item.selected_column} if alt_item else set()
                conflict_text = pick_from_item(alt_item, "sec8_conflict", exclude_cols)
                if conflict_text and not _is_conflict_text(conflict_text):
                    conflict_text = ""
            if not conflict_text:
                conflict_text = _pick_text_by_role(core_item, "sec8_conflict", used_texts=used_texts, exclude_columns=exclude_cols)
                if conflict_text and not _is_conflict_text(conflict_text):
                    conflict_text = ""
            if not conflict_text and core_item and core_item.source_row:
                conflict_text, _ = _pick_text_from_aspect_row(
                    core_item.source_row,
                    ["注意点", "要約"],
                    exclude_texts=used_texts,
                    exclude_columns=exclude_cols,
                    require_concrete=False,
                )
            if conflict_text:
                _add_used_text(used_texts, conflict_text)
                theme.section8_text = conflict_text
                override_flags["sec8_conflict"] = True

    # sec8 Direction: 解釈文(人生スパン優先) -> 成長のコツ -> 要約
    if narrative_plan.direction_theme:
        theme = narrative_plan.direction_theme
        is_node_direction = (
            getattr(theme, "source_type", "") == "node"
            or getattr(theme, "theme_id", "") == "node:axis"
        )
        direction_text = ""
        if not is_node_direction:
            preserved_text = clean_text(getattr(theme, "section8_text", "")) or clean_text(
                getattr(theme, "growth_text", "")
            )
            needs_override = not preserved_text or preserved_text in used_texts
            if override_flags["sec5_direction"]:
                needs_override = False
            if preserved_text and not needs_override:
                _add_used_text(used_texts, preserved_text)
            elif needs_override:
                sec5_direction_text = clean_text(getattr(narrative_plan.direction_theme, "section5_text", ""))
                if sec5_direction_text:
                    _add_used_text(used_texts, sec5_direction_text)
                direction_item = section7_plan.direction_item
                exclude_cols = {direction_item.selected_column} if direction_item else set()
                direction_text = pick_from_item(direction_item, "sec8_direction", exclude_cols)
                if not direction_text:
                    core_item = section7_plan.core_item
                    exclude_cols = {core_item.selected_column} if core_item else set()
                    direction_text = pick_from_item(core_item, "sec8_direction", exclude_cols)
                if not direction_text:
                    alt_item = section7_plan.factor_items[0] if section7_plan.factor_items else None
                    exclude_cols = {alt_item.selected_column} if alt_item else set()
                    direction_text = pick_from_item(alt_item, "sec8_direction", exclude_cols)
                if not direction_text:
                    direction_text = _pick_text_by_role(
                        section7_plan.core_item,
                        "sec8_direction",
                        used_texts=used_texts,
                    )
                if not direction_text:
                    # Allow interpretation text as a lifespan-direction candidate
                    direction_text = _pick_text_from_direction_fallback(
                        section7_plan.core_item, used_texts
                    )
                if direction_text:
                    _add_used_text(used_texts, direction_text)
                    theme.section8_text = direction_text
                    override_flags["sec8_direction"] = True

    # sec8 Main Theme is kept as-is (non-aspect-based)
    section_plan.section7_blocks["override_flags"] = override_flags


def _filter_concrete_section7_texts(texts: List[str]) -> List[str]:
    return [t for t in texts if _is_concrete_section7_text(t)]


def _is_priority_conflict_theme(theme: Optional[CoreTheme]) -> bool:
    if not theme:
        return False
    if getattr(theme, "source_type", "") == "pattern" and any(
        tag in {"t_square", "yod"} for tag in (getattr(theme, "tags", []) or [])
    ):
        return True
    planets = set(getattr(theme, "planets", []) or [])
    if {"Saturn", "Pluto"} & planets:
        return True
    tags = set(getattr(theme, "tags", []) or [])
    return bool({"Saturn", "Pluto", "土星", "冥王星"} & tags)


def _pick_texts_from_text_set(text_set: Any, fields: tuple[str, ...]) -> List[str]:
    texts: List[str] = []
    if not text_set:
        return texts
    for field in fields:
        value = getattr(text_set, field, "")
        if isinstance(value, list):
            texts.extend([clean_text(v) for v in value if clean_text(v)])
        elif clean_text(value):
            texts.append(clean_text(value))
    return texts


def _pick_text_from_aspect_row(
    row: Dict[str, Any],
    columns: List[str],
    exclude_texts: Optional[set[str]] = None,
    exclude_columns: Optional[set[str]] = None,
    require_concrete: bool = True,
    exact_match_only: bool = False,
) -> tuple[str, str]:
    exclude_texts = exclude_texts or set()
    exclude_columns = exclude_columns or set()
    for col in columns:
        if col in exclude_columns:
            continue
        value = clean_text(row.get(col, "")) if isinstance(row, dict) else ""
        if not value or value in exclude_texts:
            continue
        if exact_match_only:
            if any(exclude and (exclude == value or value == exclude) for exclude in exclude_texts):
                continue
        else:
            if any(exclude and (exclude in value or value in exclude) for exclude in exclude_texts):
                continue
        if require_concrete and not _is_concrete_action_text(value):
            continue
        if len(value) < 10:
            continue
        if value and value not in exclude_texts:
            return value, col
    return "", ""


def _pick_text_from_direction_fallback(
    item: Optional[Section7AspectItem],
    used_texts: set[str],
) -> str:
    if not item or not item.source_row:
        return ""
    # Prefer interpretation for life-span direction, then summary, then growth tips.
    text, _ = _pick_text_from_aspect_row(
        item.source_row,
        ["解釈文", "要約", "成長のコツ"],
        exclude_texts=used_texts,
        require_concrete=False,
    )
    if text and _is_direction_text(text, allow_lifespan=True):
        return text
    if text and _is_lifespan_text(text):
        return text
    return ""


def _pick_text_from_direction_last_resort(
    item: Optional[Section7AspectItem],
    used_texts: set[str],
) -> str:
    if not item or not item.source_row:
        return ""
    text, _ = _pick_text_from_aspect_row(
        item.source_row,
        ["解釈文", "要約", "成長のコツ", "核となる意味"],
        exclude_texts=used_texts,
        require_concrete=False,
    )
    return text


def _is_direction_text(text: str, allow_lifespan: bool = False) -> bool:
    text = clean_text(text)
    if not text:
        return False
    # Must contain action guidance
    if "することで" in text or "すること" in text or "ことで" in text or "するために" in text:
        return True
    if allow_lifespan and _is_lifespan_text(text):
        return True
    return False


def _is_lifespan_text(text: str) -> bool:
    text = clean_text(text)
    if not text:
        return False
    lifespan_terms = [
        "習慣",
        "長期",
        "長期的",
        "積み上げ",
        "継続",
        "続け",
        "していく",
        "ていく",
        "将来",
        "人生",
    ]
    return any(term in text for term in lifespan_terms)


def _add_used_text(used_texts: set[str], text: str) -> None:
    t = clean_text(text)
    if not t:
        return
    used_texts.add(t)
    used_texts.add(t.rstrip("。"))


def _is_conflict_text(text: str) -> bool:
    text = clean_text(text)
    if not text:
        return False
    banned = ["変わっていく", "成長", "力になる"]
    if any(term in text for term in banned):
        return False
    return True


def _normalize_redundant_phrase(text: str) -> str:
    t = clean_text(text)
    if not t:
        return t
    t = t.replace("思考と言葉と行動と衝動", "思考と行動と衝動")
    return t


def _simplify_conflict_cause(text: str) -> str:
    t = clean_text(text)
    if not t:
        return t
    patterns = [
        (r"([^、]+?)ことと[^、]+?ことを続けると", r"\1ことを続けると"),
        (r"([^、]+?)と[^、]+?を続けると", r"\1を続けると"),
        (r"([^、]+?)と[^、]+?に偏ると", r"\1に偏ると"),
        (r"([^、]+?)と[^、]+?が重なると", r"\1が重なると"),
    ]
    for pattern, repl in patterns:
        new_t = re.sub(pattern, repl, t)
        if new_t != t:
            t = new_t
            break
    return t


ROLE_COLUMN_PRIORITY = {
    "sec5_conflict": ["sec5_conflict"],
    "sec5_direction": ["sec5_direction"],
    "sec7_core": ["要約", "核となる意味"],
    "sec7_factor": ["要約", "核となる意味"],
    "sec7_hint": ["成長のコツ", "要約"],
    "sec7_support": ["要約", "核となる意味"],
    "sec8_main": ["解釈文", "要約", "核となる意味"],
    "sec8_conflict": ["sec8_conflict"],
    "sec8_direction": ["sec8_direction"],
}


def _pick_text_by_role(
    item: Optional[Section7AspectItem],
    role_key: str,
    used_texts: Optional[set[str]] = None,
    exclude_columns: Optional[set[str]] = None,
) -> str:
    if not item or not item.source_row:
        return ""
    columns = ROLE_COLUMN_PRIORITY.get(role_key, [])
    if not columns:
        return ""
    used_texts = used_texts or set()
    require_concrete = role_key not in {"sec7_support", "sec5_direction", "sec8_direction", "sec7_hint", "sec8_conflict"}
    text, _ = _pick_text_from_aspect_row(
        item.source_row,
        columns,
        exclude_texts=used_texts,
        exclude_columns=exclude_columns,
        require_concrete=require_concrete,
        exact_match_only=(role_key == "sec8_direction"),
    )
    if text:
        return text
    text, _ = _pick_text_from_aspect_row(
        item.source_row,
        columns,
        exclude_texts=used_texts,
        exclude_columns=exclude_columns,
        require_concrete=False,
        exact_match_only=(role_key == "sec8_direction"),
    )
    return text


def _build_section7_item_from_aspect(
    ev: Any,
    conflict_theme: Optional[CoreTheme],
    direction_theme: Optional[CoreTheme],
    ctx: ChartContext,
) -> tuple[Optional[Section7AspectItem], Dict[str, Any]]:
    row = get_aspect_row_for_section7(ev.aspect.planet1_en, ev.aspect.planet2_en, ev.aspect.aspect_en, ctx) or {}
    use_in_section = _parse_bool(row.get("use_in_section"), default=True)
    role = clean_text(row.get("role", ""))

    aspect_type = clean_text(ev.aspect.aspect_en).lower()
    if not role:
        if aspect_type in {"trine", "sextile"}:
            role = "support"
        elif aspect_type in {"conjunction", "square", "opposition", "quincunx"}:
            role = "conflict"
        else:
            role = "neutral"

    priority = clean_text(row.get("priority", "")) or "medium"
    conflict_weight = _parse_float(row.get("conflict_weight"))
    support_weight = _parse_float(row.get("support_weight"))
    direction_weight = _parse_float(row.get("direction_weight"))

    summary = ""
    selected_column = ""
    if isinstance(row, dict):
        if role == "support":
            summary, selected_column = _pick_text_from_aspect_row(
                row, ["要約", "核となる意味"]
            )
        elif role == "direction":
            summary, selected_column = _pick_text_from_aspect_row(
                row, ["成長のコツ", "要約"]
            )
        else:
            summary, selected_column = _pick_text_from_aspect_row(
                row, ["要約", "核となる意味"]
            )
    if not summary:
        summary = _pick_aspect_text_from_evidence(ev, role)

    aspect_key = normalize_aspect_key(ev.aspect.planet1_en, ev.aspect.planet2_en, ev.aspect.aspect_en)
    theme_key = clean_text(row.get("テーマ", "")) if isinstance(row, dict) else ""

    source_theme_ids: List[str] = []
    planets = {ev.aspect.planet1_en, ev.aspect.planet2_en}
    if conflict_theme and planets.intersection(set(getattr(conflict_theme, "planets", []) or [])):
        source_theme_ids.append(getattr(conflict_theme, "theme_id", ""))
    if direction_theme and planets.intersection(set(getattr(direction_theme, "planets", []) or [])):
        source_theme_ids.append(getattr(direction_theme, "theme_id", ""))
    source_theme_ids = [tid for tid in source_theme_ids if tid]

    item = Section7AspectItem(
        aspect_key=aspect_key,
        role=role,
        priority=priority,
        section7_summary=summary,
        selected_column=selected_column,
        source_row=dict(row) if isinstance(row, dict) else {},
        conflict_weight=conflict_weight,
        support_weight=support_weight,
        direction_weight=direction_weight,
        source_theme_ids=source_theme_ids,
    )
    meta = {
        "use_in_section": use_in_section,
        "theme_key": theme_key,
    }
    return item, meta


def _build_section7_item_from_node(node_ev: Any) -> Optional[Section7AspectItem]:
    if not node_ev:
        return None
    texts = _pick_texts_from_text_set(node_ev.axis_text_set, ("growth", "summary"))
    if not texts:
        texts = _pick_texts_from_text_set(node_ev.north_text_set, ("summary", "growth"))
    if not texts:
        return None
    summary = clean_text(texts[0])
    if not summary:
        return None
    return Section7AspectItem(
        aspect_key="node:axis",
        role="direction",
        priority="medium",
        section7_summary=summary,
        selected_column="node",
        source_row={},
        conflict_weight=0.0,
        support_weight=0.0,
        direction_weight=0.8,
        source_theme_ids=[],
    )


def _pick_aspect_text_from_evidence(ev: Any, role: str) -> str:
    if role == "support":
        for field in ("strengths", "summary", "interpretation"):
            value = getattr(ev.text_set, field, "")
            if isinstance(value, list) and value:
                return clean_text(value[0])
            if isinstance(value, str) and value:
                return clean_text(value)
    for field in ("cautions", "interpretation", "summary"):
        value = getattr(ev.text_set, field, "")
        if isinstance(value, list) and value:
            return clean_text(value[0])
        if isinstance(value, str) and value:
            return clean_text(value)
    return ""


def _is_hard_aspect(aspect_en: str) -> bool:
    return clean_text(aspect_en).lower() in {"square", "opposition", "conjunction", "quincunx"}


def _merge_reinforcing_items(
    base_items: List[Section7AspectItem],
    extra_items: List[Section7AspectItem],
    limit: int = 3,
) -> List[Section7AspectItem]:
    merged = list(base_items)
    if len(merged) >= limit:
        return merged[:limit]
    used = {item.aspect_key for item in merged}
    for item in extra_items:
        if len(merged) >= limit:
            break
        if item.aspect_key in used:
            continue
        merged.append(item)
        used.add(item.aspect_key)
    return merged


def _pattern_type_from_key(key: str) -> str:
    parts = clean_text(key).split(":", 1)
    return parts[0] if parts else ""


def _role_score(role: str) -> float:
    role = clean_text(role).lower()
    return {"conflict": 3.0, "direction": 2.0, "neutral": 1.0}.get(role, 0.0)


def _priority_score(priority: str) -> float:
    value = clean_text(priority).lower()
    return {"high": 1.0, "medium": 0.6, "low": 0.2}.get(value, 0.0)


def _parse_bool(value: Any, default: bool = True) -> bool:
    if value is None:
        return default
    text = clean_text(value).lower()
    if text in {"true", "1", "yes", "y"}:
        return True
    if text in {"false", "0", "no", "n"}:
        return False
    return default


def _parse_float(value: Any) -> float:
    try:
        return float(str(value).strip())
    except Exception:
        return 0.0


def _dedupe_texts(texts: List[str], limit: int = 3) -> List[str]:
    seen = set()
    seen_keys: List[str] = []
    ordered = []
    for text in texts:
        t = clean_text(text)
        if not t or t in seen:
            continue
        t_norm = _normalize_text_key(t)
        if t_norm in seen:
            continue
        if any(t_norm in key or key in t_norm for key in seen_keys):
            continue
        ordered.append(t)
        seen.add(t)
        seen.add(t_norm)
        seen_keys.append(t_norm)
        if len(ordered) >= limit:
            break
    return ordered


def _normalize_text_key(text: str) -> str:
    cleaned = clean_text(text)
    for ch in "。、,.，・「」『』（）()[]【】 　":
        cleaned = cleaned.replace(ch, "")
    return cleaned


def select_career_axis(
    bundle: ChartEvidenceBundle,
    narrative_bundle: NarrativeBundle,
    ctx: ChartContext,
) -> CareerAxisSelection:
    mc_sign = ""
    mc_ruler = ""
    dominant_house_axis = ""
    jupiter_house = ""
    linked_theme_ids: List[str] = []

    mc_ev = bundle.angle_map.get("MC") if bundle.angle_map else None
    if mc_ev and getattr(mc_ev, "angle", None):
        mc_sign = clean_text(getattr(mc_ev.angle, "sign_ja", ""))
    if mc_ev and getattr(mc_ev, "ruler_evidences", None):
        mc_ruler = clean_text(getattr(mc_ev.ruler_evidences[0].planet, "name_en", ""))

    jupiter_ev = bundle.planet_map.get("Jupiter") if bundle.planet_map else None
    if jupiter_ev and getattr(jupiter_ev, "planet", None):
        jupiter_house = clean_text(getattr(jupiter_ev.planet, "house", ""))

    dominant_house_axis = _pick_dominant_house_axis(
        bundle=bundle,
        narrative_bundle=narrative_bundle,
        jupiter_house=jupiter_house,
    )

    mc_sign = normalize_sign_name_to_en(mc_sign).lower() if mc_sign else ""
    mc_ruler = normalize_planet_name_to_en(mc_ruler).lower() if mc_ruler else ""
    dominant_house_axis = _normalize_house_axis(dominant_house_axis).lower() if dominant_house_axis else ""
    jupiter_house = _normalize_house_axis(jupiter_house).lower() if jupiter_house else ""

    career_ev = bundle.career_evidence
    if career_ev and career_ev.linked_themes:
        linked_theme_ids = list(career_ev.linked_themes)

    main_work_tags = _build_main_work_tags(
        bundle=bundle,
        narrative_bundle=narrative_bundle,
        ctx=ctx,
    )

    return CareerAxisSelection(
        career_id="",
        mc_sign=mc_sign,
        mc_ruler=mc_ruler,
        dominant_house_axis=dominant_house_axis,
        jupiter_house=jupiter_house,
        linked_theme_ids=linked_theme_ids,
        main_work_tags=main_work_tags,
    )


def get_career_axis_row_by_selection(
    selection: CareerAxisSelection,
    ctx: ChartContext,
) -> Optional[Dict[str, str]]:
    if not selection:
        return None
    index = getattr(ctx, "career_axis_index", {}) or {}
    if not isinstance(index, dict) or not index:
        return None

    career_id = clean_text(selection.career_id).lower()
    if career_id:
        row = index.get(f"id:{career_id}")
        if isinstance(row, dict):
            return row

    candidates = _build_career_axis_key_candidates(selection)
    for key in candidates:
        row = index.get(key)
        if isinstance(row, dict):
            return row
    return None


def _build_career_axis_key_candidates(selection: CareerAxisSelection) -> List[str]:
    parts = {
        "mc_sign": clean_text(selection.mc_sign).lower(),
        "mc_ruler": clean_text(selection.mc_ruler).lower(),
        "dominant_house_axis": clean_text(selection.dominant_house_axis).lower(),
        "jupiter_house": clean_text(selection.jupiter_house).lower(),
    }
    combos = [
        ["mc_sign", "mc_ruler", "dominant_house_axis", "jupiter_house"],
        ["mc_sign", "mc_ruler", "dominant_house_axis"],
        ["mc_sign", "dominant_house_axis"],
        ["dominant_house_axis"],
    ]
    keys: List[str] = []
    for combo in combos:
        values = [parts[name] for name in combo if parts.get(name)]
        if not values:
            continue
        base = "_".join(values)
        keys.extend(_axis_key_variants(base))
    # Deduplicate while preserving order
    seen = set()
    ordered: List[str] = []
    for key in keys:
        if key and key not in seen:
            ordered.append(key)
            seen.add(key)
    return ordered


def _axis_key_variants(base: str) -> List[str]:
    variants = {base}
    variants.add(base.replace("_", "-"))
    variants.add(base.replace("_", ":"))
    variants.add(base.replace("_", ""))
    return [v for v in variants if v]


def _pick_dominant_house_axis(
    bundle: ChartEvidenceBundle,
    narrative_bundle: NarrativeBundle,
    jupiter_house: str,
) -> str:
    target_houses = {"2", "6", "10"}

    if narrative_bundle.primary_stellium_key:
        parts = str(narrative_bundle.primary_stellium_key).split(":", 2)
        if len(parts) == 3:
            _, _, house = parts
            house = clean_text(house)
            if house in target_houses:
                return _normalize_house_axis(house)

    chart_profile = getattr(bundle, "chart_profile", None)
    dominant = getattr(chart_profile, "dominant_houses", []) if chart_profile else []
    for house, _ in dominant:
        house_str = clean_text(house)
        if house_str in target_houses:
            return _normalize_house_axis(house_str)

    if jupiter_house in target_houses:
        return _normalize_house_axis(jupiter_house)

    return ""


def _build_main_work_tags(
    bundle: ChartEvidenceBundle,
    narrative_bundle: NarrativeBundle,
    ctx: ChartContext,
) -> List[str]:
    tags: List[str] = []
    if narrative_bundle.primary_stellium_key:
        stellium = _find_stellium_by_key(bundle.stelliums, narrative_bundle.primary_stellium_key)
        if stellium:
            row = get_stellium_theme_row(
                stellium.get("sign_ja", ""),
                stellium.get("house", ""),
                stellium.get("count", 0),
                ctx,
            )
            if row:
                tags.extend(_parse_tags(row.get("tags", "")))
    return [tag for tag in tags if tag]


def _build_section6_blocks(
    bundle: ChartEvidenceBundle,
    narrative_bundle: NarrativeBundle,
    narrative_plan: Optional[NarrativePlan],
    career_row: Optional[Dict[str, str]],
    section_plan: NarrativeSectionPlan,
    ctx: ChartContext,
) -> Dict[str, str]:
    main_axis_is_stellium = bool(narrative_bundle.primary_stellium_key)
    row = career_row or {}
    row_tags = set(_parse_tags(row.get("tags", "")))
    main_work_tags = set(section_plan.career_axis_selection.main_work_tags if section_plan.career_axis_selection else [])
    row_is_compatible = not row_tags or not main_work_tags or bool(row_tags.intersection(main_work_tags))

    career = bundle.career_evidence
    mc_ev = career.mc if career else None
    jupiter_ev = career.jupiter if career else None
    mc_ruler_ev = mc_ev.ruler_evidences[0] if mc_ev and mc_ev.ruler_evidences else None

    # Main priority: career_axis (main role) -> work texts -> MC/10th house as fallback
    main_axis_text = ""
    if row and row_is_compatible:
        main_axis_text = _pick_first_text(row, ["main_role_text", "main_text", "role_text", "summary", "text"])
    if not main_axis_text and career and career.work_texts:
        main_axis_text = clean_text(career.work_texts[0])
    if not main_axis_text and main_axis_is_stellium:
        main_axis_text = clean_text(section_plan.stellium_payload.get("work_text", ""))
    if not main_axis_text and narrative_plan and narrative_plan.main_theme:
        main_axis_text = clean_text(getattr(narrative_plan.main_theme, "summary", ""))
    if not main_axis_text:
        if mc_ev:
            main_axis_text = clean_text(_select_text_from_text_set(mc_ev.text_set))
    if not main_axis_text and career and career.house_10_texts:
        main_axis_text = clean_text(career.house_10_texts[0].text)
    if not main_axis_text:
        main_axis_text = _pick_first_text_from_career_evidence(bundle)

    preferred_axis = _get_preferred_house_axis(narrative_bundle, section_plan)

    # Strength priority: career_axis strength -> work texts -> MC ruler -> Jupiter
    strengths_text = ""
    if not strengths_text and row:
        strengths_text = _pick_first_text(row, ["strength_text", "strengths_text", "role_text"])
    if not strengths_text and career and career.work_texts:
        strengths_text = clean_text(career.work_texts[0])
    if not strengths_text and mc_ruler_ev:
        strengths_text = clean_text(_select_text_from_text_set(mc_ruler_ev.text_set))
    if not strengths_text and jupiter_ev:
        strengths_text = clean_text(_select_text_from_text_set(jupiter_ev.text_set))
    if not strengths_text:
        strengths_text = _pick_first_text_from_work_texts(bundle, preferred_axis)
    if strengths_text == main_axis_text:
        strengths_text = ""

    expansion_text = ""
    if row:
        expansion_text = _pick_first_text(row, ["expansion_text", "growth_text", "direction_text"])
    if not expansion_text and jupiter_ev:
        texts = _pick_texts_from_text_set(jupiter_ev.text_set, ("growth", "summary", "work", "interpretation"))
        if texts:
            expansion_text = clean_text(texts[0])
    if not expansion_text:
        expansion_text = _pick_first_growth_text(bundle)
    if expansion_text == main_axis_text or expansion_text == strengths_text:
        expansion_text = ""

    # Caution priority: Saturn
    caution_text = ""
    if not caution_text and row:
        caution_text = _pick_first_text(row, ["caution_text", "risk_text", "caution"])
    if not caution_text and mc_ruler_ev:
        texts = _pick_texts_from_text_set(mc_ruler_ev.text_set, ("cautions", "work", "summary"))
        if texts:
            caution_text = clean_text(texts[0])
    if not caution_text and jupiter_ev:
        texts = _pick_texts_from_text_set(jupiter_ev.text_set, ("cautions", "summary"))
        if texts:
            caution_text = clean_text(texts[0])
    if not caution_text:
        if career and career.house_6_texts:
            caution_text = clean_text(career.house_6_texts[0].text)
        elif career and career.house_10_texts:
            caution_text = clean_text(career.house_10_texts[0].text)
    if not caution_text:
        caution_text = _pick_first_work_caution(bundle, preferred_axis)

    return {
        "main": main_axis_text,
        "strengths": strengths_text,
        "expansion": expansion_text,
        "caution": caution_text,
    }


def _pick_first_text(row: Dict[str, Any], keys: List[str]) -> str:
    for key in keys:
        value = clean_text(row.get(key, ""))
        if value:
            return value
    return ""


def _pick_first_text_from_career_evidence(bundle: ChartEvidenceBundle) -> str:
    career = bundle.career_evidence
    if not career:
        return ""
    if career.work_texts:
        return clean_text(career.work_texts[0])
    if career.summary_texts:
        return clean_text(career.summary_texts[0])
    if career.house_6_texts:
        return clean_text(career.house_6_texts[0].text)
    if career.house_10_texts:
        return clean_text(career.house_10_texts[0].text)
    if career.house_2_texts:
        return clean_text(career.house_2_texts[0].text)
    return ""


def _pick_first_text_from_work_texts(
    bundle: ChartEvidenceBundle,
    preferred_house_axis: str = "",
) -> str:
    career = bundle.career_evidence
    if not career:
        return ""
    # Prefer house-specific work texts when available
    if preferred_house_axis == "6" and career.house_6_texts:
        return clean_text(career.house_6_texts[0].text)
    if preferred_house_axis == "10" and career.house_10_texts:
        return clean_text(career.house_10_texts[0].text)
    if preferred_house_axis == "2" and career.house_2_texts:
        return clean_text(career.house_2_texts[0].text)
    if career.work_texts:
        return clean_text(career.work_texts[0])
    if career.house_6_texts:
        return clean_text(career.house_6_texts[0].text)
    if career.house_10_texts:
        return clean_text(career.house_10_texts[0].text)
    if career.house_2_texts:
        return clean_text(career.house_2_texts[0].text)
    return ""


def _get_preferred_house_axis(
    narrative_bundle: NarrativeBundle,
    section_plan: NarrativeSectionPlan,
) -> str:
    selection = section_plan.career_axis_selection
    if selection and selection.dominant_house_axis:
        return clean_text(selection.dominant_house_axis).replace("H", "").replace("h", "")
    if narrative_bundle.primary_stellium_key:
        parts = str(narrative_bundle.primary_stellium_key).split(":", 2)
        if len(parts) == 3:
            _, _, house = parts
            return clean_text(house)
    return ""


def _normalize_house_axis(value: Any) -> str:
    text = clean_text(value).upper()
    if not text:
        return ""
    text = text.replace("HOUSE", "H").replace("ハウス", "H")
    if text.endswith("H"):
        num = text[:-1]
    else:
        num = text
    return f"{num}H" if num.isdigit() else text


def _pick_first_text_from_summary_texts(bundle: ChartEvidenceBundle) -> str:
    career = bundle.career_evidence
    if not career:
        return ""
    if career.summary_texts:
        return clean_text(career.summary_texts[0])
    if career.work_texts:
        return clean_text(career.work_texts[0])
    return ""


def _pick_first_growth_text(bundle: ChartEvidenceBundle) -> str:
    career = bundle.career_evidence
    if not career:
        return ""
    if career.mc and getattr(career.mc, "text_set", None):
        growth = getattr(career.mc.text_set, "growth", None)
        if isinstance(growth, list) and growth:
            return clean_text(growth[0])
        if isinstance(growth, str) and growth:
            return clean_text(growth)
    if career.jupiter and getattr(career.jupiter, "text_set", None):
        growth = getattr(career.jupiter.text_set, "growth", None)
        if isinstance(growth, list) and growth:
            return clean_text(growth[0])
        if isinstance(growth, str) and growth:
            return clean_text(growth)
    if career.summary_texts:
        return clean_text(career.summary_texts[0])
    if career.work_texts:
        return clean_text(career.work_texts[0])
    return ""


def _pick_first_work_caution(
    bundle: ChartEvidenceBundle,
    preferred_house_axis: str = "",
) -> str:
    target_houses = {"2", "6", "10"}
    preferred_house = clean_text(preferred_house_axis)
    planet_order = list(bundle.dominant_planets) if bundle.dominant_planets else []
    planet_map = bundle.planet_map or {}

    def iter_candidates():
        for name in planet_order:
            evidence = planet_map.get(name)
            if not evidence or not getattr(evidence, "planet", None):
                continue
            house = clean_text(getattr(evidence.planet, "house", ""))
            if house in target_houses:
                yield evidence
        for evidence in planet_map.values():
            if not evidence or not getattr(evidence, "planet", None):
                continue
            house = clean_text(getattr(evidence.planet, "house", ""))
            if house in target_houses:
                yield evidence

    fallback = ""
    for evidence in iter_candidates():
        house = clean_text(getattr(evidence.planet, "house", ""))
        cautions = getattr(evidence.text_set, "cautions", None)
        if isinstance(cautions, list) and cautions:
            text = clean_text(cautions[0])
        elif isinstance(cautions, str) and cautions:
            text = clean_text(cautions)
        else:
            text = ""
        if not text:
            continue
        if preferred_house and house == preferred_house:
            return text
        if not fallback:
            fallback = text
    return fallback


def _pick_main_axis(
    bundle: ChartEvidenceBundle,
    core_themes: List[CoreTheme],
    ctx: ChartContext,
) -> Tuple[str, str]:
    """Return (main_axis_theme_id, primary_stellium_key)."""
    strong_stellium = _pick_strong_stellium(bundle)
    if strong_stellium:
        theme_id = _resolve_stellium_theme_id(strong_stellium, ctx)
        key = _build_stellium_key(strong_stellium)
        return theme_id, key

    main_candidate = _pick_best_main_candidate(core_themes)
    return _theme_id(main_candidate), ""


def _pick_strong_stellium(bundle: ChartEvidenceBundle) -> Optional[Dict[str, Any]]:
    for stellium in bundle.stelliums:
        if str(stellium.get("strength", "")) == "strong":
            return stellium
    return None


def _resolve_stellium_theme_id(stellium: Dict[str, Any], ctx: ChartContext) -> str:
    sign = normalize_sign_name(stellium.get("sign_ja", ""))
    house = clean_text(stellium.get("house", ""))
    count = int(stellium.get("count", 0) or 0)
    row = get_stellium_theme_row(sign, house, count, ctx)
    if row:
        theme_id = clean_text(row.get("theme_id"))
        if theme_id:
            return theme_id
    return f"stellium:{sign}:{house}"


def _build_stellium_key(stellium: Dict[str, Any]) -> str:
    sign = normalize_sign_name(stellium.get("sign_ja", ""))
    house = clean_text(stellium.get("house", ""))
    return f"stellium:{sign}:{house}"


def _pick_best_main_candidate(core_themes: List[CoreTheme]) -> Optional[CoreTheme]:
    candidates = [theme for theme in core_themes if theme.source_type != "node"]
    non_pattern = [theme for theme in candidates if theme.source_type != "pattern"]
    if not non_pattern:
        return None
    return max(non_pattern, key=lambda theme: theme.score)


def _pick_support_theme_ids(
    core_themes: List[CoreTheme],
    reserved_ids: set[str],
    limit: int = 3,
) -> List[str]:
    reserved = {theme_id for theme_id in reserved_ids if theme_id}
    remaining = [theme for theme in core_themes if theme.theme_id not in reserved]
    remaining.sort(key=lambda theme: theme.score, reverse=True)
    return [theme.theme_id for theme in remaining[:limit]]


def _collect_suppressed_ids(
    core_themes: List[CoreTheme],
    selected_ids: set[str],
) -> List[str]:
    selected_themes = [
        theme for theme in core_themes if theme.theme_id in selected_ids
    ]
    suppressed: List[str] = []
    for selected in selected_themes:
        suppressed.extend(collect_suppressed_theme_ids(core_themes, selected))
    unique = []
    seen = set()
    for theme_id in suppressed:
        if theme_id and theme_id not in selected_ids and theme_id not in seen:
            unique.append(theme_id)
            seen.add(theme_id)
    return unique


def _collect_stellium_suppressed_ids(
    bundle: ChartEvidenceBundle,
    core_themes: List[CoreTheme],
    main_axis_theme_id: str,
    primary_stellium_key: str,
    ctx: ChartContext,
) -> List[str]:
    stellium = _find_stellium_by_key(bundle.stelliums, primary_stellium_key)
    if not stellium:
        return []

    main_axis_theme = _find_theme_by_id(core_themes, main_axis_theme_id)
    meaning_tags = set(_extract_meaning_tags(main_axis_theme, stellium, ctx))
    stellium_sign = normalize_sign_name(stellium.get("sign_ja", ""))
    stellium_house = clean_text(stellium.get("house", ""))
    member_names = {getattr(p, "name_en", "") for p in stellium.get("members", []) if getattr(p, "name_en", "")}

    suppressed: List[str] = []
    for candidate in core_themes:
        if candidate.theme_id == main_axis_theme_id:
            continue
        candidate_tags = set(candidate.tags)
        candidate_houses = set(candidate.houses)
        candidate_planets = set(candidate.planets)

        same_sign_house = bool(stellium_sign and stellium_sign in candidate_tags) and bool(
            stellium_house and stellium_house in candidate_houses
        )
        same_member = bool(member_names and candidate_planets.intersection(member_names))
        if candidate.source_type == "planet" and (same_sign_house or same_member):
            suppressed.append(candidate.theme_id)
            continue

        if meaning_tags and candidate_tags.intersection(meaning_tags) and candidate.role == "support":
            suppressed.append(candidate.theme_id)

    return suppressed


def _extract_meaning_tags(
    main_axis_theme: Optional[CoreTheme],
    stellium: Dict[str, Any],
    ctx: ChartContext,
) -> List[str]:
    tags: List[str] = []
    if main_axis_theme:
        tags.extend(main_axis_theme.tags)
    row = get_stellium_theme_row(
        stellium.get("sign_ja", ""), stellium.get("house", ""), stellium.get("count", 0), ctx
    )
    if row:
        tags.extend(_parse_tags(row.get("tags", "")))
    return [tag for tag in tags if tag]


def _parse_tags(value: Any) -> List[str]:
    raw = clean_text(value)
    if not raw:
        return []
    normalized = raw.replace("、", ",").replace("/", ",")
    items = [item.strip() for item in normalized.split(",") if item.strip()]
    normalized_items: List[str] = []
    for item in items:
        item = normalize_sign_name(item)
        item = normalize_planet_name(item)
        normalized_items.append(item)
    return normalized_items


def _dedupe_ids(ids: List[str]) -> List[str]:
    seen = set()
    ordered: List[str] = []
    for theme_id in ids:
        if theme_id and theme_id not in seen:
            seen.add(theme_id)
            ordered.append(theme_id)
    return ordered


def _theme_id(theme: Optional[CoreTheme]) -> str:
    if theme is None:
        return ""
    return str(getattr(theme, "theme_id", "") or "")


def _find_theme_by_id(core_themes: List[CoreTheme], theme_id: str) -> Optional[CoreTheme]:
    if not theme_id:
        return None
    for theme in core_themes:
        if theme.theme_id == theme_id:
            return theme
    return None


def _find_stellium_by_key(
    stelliums: List[Dict[str, Any]],
    key: str,
) -> Optional[Dict[str, Any]]:
    parts = str(key).split(":", 2)
    if len(parts) != 3:
        return None
    _, sign, house = parts
    for stellium in stelliums:
        if normalize_sign_name(stellium.get("sign_ja", "")) == sign and clean_text(stellium.get("house", "")) == house:
            return stellium
    return None


def build_stellium_payload_from_data(
    stellium: Dict[str, Any],
    ctx: ChartContext,
) -> Dict[str, str]:
    sign = normalize_sign_name(stellium.get("sign_ja", ""))
    house = clean_text(stellium.get("house", ""))
    count = int(stellium.get("count", 0) or 0)
    row = get_stellium_theme_row(sign, house, count, ctx)
    if not row:
        return {}
    row_count_min = int(clean_text(row.get("count_min")) or "0")
    payload = {
        "summary": clean_text(row.get("summary", "")),
        "main_text": clean_text(row.get("main_text", "")),
        "work_text": clean_text(row.get("work_text", "")),
        "relationship_text": clean_text(row.get("relationship_text", "")),
        "caution_text": clean_text(row.get("caution_text", "")),
    }
    for field_name, value in list(payload.items()):
        payload[field_name] = apply_stellium_strength(value, count, row_count_min, field_name)
    return payload


def _build_stellium_section_texts(payload: Dict[str, str]) -> Dict[str, str]:
    return {
        "sec2": clean_text(payload.get("main_text", "")),
        "sec6": clean_text(payload.get("work_text", "")),
        "sec4_relationship": clean_text(payload.get("relationship_text", "")),
        "sec8": clean_text(payload.get("summary", "")) or clean_text(payload.get("main_text", "")),
        "caution": clean_text(payload.get("caution_text", "")),
    }
