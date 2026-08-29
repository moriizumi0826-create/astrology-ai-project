import re
from typing import Any, Dict, List, Optional, Tuple

from fallbacks import (
    build_angle_fallback,
    build_aspect_fallback,
    build_node_fallback,
    build_planet_house_fallback,
    build_planet_sign_fallback,
    build_planet_sign_house_fallback,
)
from io_utils import clean_text, compact_texts, get_first, get_career_axis_row, get_pattern_theme_row, normalize_for_dup
from models import (
    AngleData,
    AngleEvidence,
    AspectData,
    AspectEvidence,
    CareerEvidence,
    ChartContext,
    ChartEvidenceBundle,
    FieldTextSet,
    NodeData,
    NodeEvidence,
    PlanetData,
    PlanetEvidence,
    SummaryEvidence,
    TextEvidence,
)


FIELD_PRIORITY = [
    "interpretation",
    "summary",
    "core",
    "theme",
    "strengths",
    "cautions",
    "relationship",
    "work",
    "growth",
]

def _lookup_pattern_text(pattern_type: str, ctx: ChartContext, planet_name: str = "") -> str:
    row = get_pattern_theme_row(pattern_type, planet_name, ctx) if ctx is not None else None
    if isinstance(row, dict):
        text = clean_text(get_first(row, "summary", "解釈文", "要約", "テーマ", "核となる意味"))
        if text:
            return text

    # Fallback to conflict_direction.csv (T-square / Yod) if available.
    conflict_index = getattr(ctx, "conflict_direction_index", {}) if ctx is not None else {}
    if isinstance(conflict_index, dict):
        mapping = {"t_square": "t_square_core_conflict", "yod": "yod_core_conflict"}
        theme_id = mapping.get(pattern_type, "")
        if theme_id:
            row = conflict_index.get(theme_id, {})
            if isinstance(row, dict):
                text = clean_text(get_first(row, "summary", "section5_text", "section8_text", "problem_text", "growth_text"))
                if text:
                    return text

    return ""


def _resolve_career_axis_label(axis_key: str, ctx: ChartContext | None) -> str:
    row = get_career_axis_row(axis_key, ctx) if ctx is not None else None
    if isinstance(row, dict):
        label = clean_text(get_first(row, "label", "axis_label", "name", "テーマ", "要約"))
        if label:
            return label
    fallback = {
        "income": "収入",
        "work": "実務",
        "status": "社会評価",
    }
    return fallback.get(axis_key, axis_key)


def _clean_list(*values: str) -> List[str]:
    items: List[str] = []
    for v in values:
        text = clean_text(v)
        if not text:
            continue
        if text in items:
            continue
        items.append(text)
    return items


def _clean_words(*values: str) -> List[str]:
    """Normalize the legacy three-keyword fields into individual words."""
    words: List[str] = []
    for value in values:
        text = clean_text(value)
        if not text:
            continue
        for word in re.split(r"\s+", text):
            word = word.strip("、。・,，．.؛；:：")
            if word and word not in words:
                words.append(word)
            if len(words) >= 3:
                return words
    return words


def _is_similar(left: str, right: str) -> bool:
    l_norm = normalize_for_dup(left)
    r_norm = normalize_for_dup(right)
    return bool(l_norm and r_norm and (l_norm in r_norm or r_norm in l_norm))


def _merge_values(primary: str, secondary: str) -> str:
    if clean_text(primary):
        return clean_text(primary)
    return clean_text(secondary)


def _merge_lists(primary: List[str], secondary: List[str], limit: int = 2) -> List[str]:
    def _clean_dedupe(items: List[str]) -> List[str]:
        merged: List[str] = []
        for text in items:
            text = clean_text(text)
            if not text:
                continue
            if any(_is_similar(text, existing) for existing in merged):
                continue
            merged.append(text)
            if len(merged) >= limit:
                break
        return merged

    primary_clean = _clean_dedupe(primary)
    if primary_clean:
        return primary_clean
    return _clean_dedupe(secondary)


def _field_text_set_from_row(row: Optional[Dict[str, Any]], is_node_axis: bool = False) -> FieldTextSet:
    if not row:
        return FieldTextSet()
    return FieldTextSet(
        theme=clean_text(get_first(row, "テーマ", "伸ばすテーマ")),
        core=clean_text(get_first(row, "核となる意味")),
        strengths=_clean_list(get_first(row, "長所")),
        strength_words=_clean_words(get_first(row, "長所_単語")),
        cautions=_clean_list(get_first(row, "注意点")),
        caution_words=_clean_words(get_first(row, "注意点_単語")),
        relationship=_clean_list(get_first(row, "対人での出方")),
        work=_clean_list(get_first(row, "仕事での出方")),
        growth=_clean_list(get_first(row, "成長のコツ", "伸ばすテーマ" if is_node_axis else "")),
        summary=clean_text(get_first(row, "要約")),
        interpretation=clean_text(get_first(row, "解釈文")),
    )


def _merge_field_text_sets(primary: FieldTextSet, secondary: FieldTextSet) -> FieldTextSet:
    return FieldTextSet(
        theme=_merge_values(primary.theme, secondary.theme),
        core=_merge_values(primary.core, secondary.core),
        strengths=_merge_lists(primary.strengths, secondary.strengths),
        strength_words=_merge_lists(primary.strength_words, secondary.strength_words, limit=3),
        cautions=_merge_lists(primary.cautions, secondary.cautions),
        caution_words=_merge_lists(primary.caution_words, secondary.caution_words, limit=3),
        relationship=_merge_lists(primary.relationship, secondary.relationship),
        work=_merge_lists(primary.work, secondary.work),
        growth=_merge_lists(primary.growth, secondary.growth),
        summary=_merge_values(primary.summary, secondary.summary),
        interpretation=_merge_values(primary.interpretation, secondary.interpretation),
    )


def _select_primary_text(text_set: FieldTextSet) -> str:
    if text_set.interpretation:
        return text_set.interpretation
    if text_set.summary:
        return text_set.summary
    if text_set.core:
        return text_set.core
    if text_set.theme:
        return text_set.theme
    for items in [text_set.strengths, text_set.cautions, text_set.relationship, text_set.work, text_set.growth]:
        if items:
            return items[0]
    return ""


def _select_texts(text_set: FieldTextSet, *fields: str, limit: int = 2) -> List[str]:
    texts: List[str] = []
    for field in fields:
        value = getattr(text_set, field, "")
        if isinstance(value, list):
            texts.extend(value)
        elif value:
            texts.append(value)
    return compact_texts(texts, limit=limit)


def _fallback_planet_text(planet: PlanetData, indices: Dict[str, Any], ctx: ChartContext) -> str:
    if ctx.has_birth_time and planet.has_house:
        return build_planet_sign_house_fallback(
            planet,
            indices["planet_master_en"],
            indices["sign_master_en"],
            indices["house_master"],
            indices.get("psh_index"),
            indices.get("ps_index"),
            indices.get("ph_index"),
        )
    return build_planet_sign_fallback(
        planet,
        indices["planet_master_en"],
        indices["sign_master_en"],
        indices.get("ps_index"),
    )


def build_planet_evidence(
    planet: PlanetData,
    ctx: ChartContext,
    aspects: List[AspectData],
    patterns_by_type: Dict[str, List[Any]],
    strength_map: Dict[str, Any],
    dominant_planets: List[str],
    final_dispositor_name: str,
    unaspected_names: set,
    indices: Dict[str, Any],
    find_aspects_for: Any,
    score_aspect_for_display: Any,
) -> PlanetEvidence:
    psh_row = indices["psh_index"].get((planet.name_en, planet.sign_en, planet.house)) if ctx.has_birth_time and planet.has_house else None
    ps_row = indices["ps_index"].get((planet.name_en, planet.sign_en))
    ph_row = indices["ph_index"].get((planet.name_en, planet.house)) if ctx.has_birth_time and planet.has_house else None

    text_set = _merge_field_text_sets(
        _field_text_set_from_row(psh_row),
        _merge_field_text_sets(_field_text_set_from_row(ps_row), _field_text_set_from_row(ph_row)),
    )
    if not _select_primary_text(text_set):
        text_set.interpretation = _fallback_planet_text(planet, indices, ctx)

    strength = strength_map.get(planet.name_en)
    evidence = PlanetEvidence(
        planet=planet,
        text_set=text_set,
        sign_house_text=text_set.interpretation or text_set.summary,
        sign_text=text_set.summary,
        house_text=(text_set.core or text_set.theme),
        dominance_score=getattr(strength, "final_score", 0.0),
        dominance_rank=(dominant_planets.index(planet.name_en) + 1) if planet.name_en in dominant_planets else 0,
        final_dispositor=planet.name_en == final_dispositor_name,
        is_unaspected=planet.name_en in unaspected_names,
    )

    related_aspects = sorted(find_aspects_for(aspects, planet.name_en), key=score_aspect_for_display, reverse=True)
    for aspect in related_aspects[:4]:
        aspect_ev = build_aspect_evidence(aspect, indices, score_aspect_for_display(aspect))
        primary_text = _select_primary_text(aspect_ev.text_set)
        text_ev = TextEvidence("aspect", f"{aspect.planet1_en}:{aspect.planet2_en}:{aspect.aspect_en}", primary_text, aspect_ev.priority)
        if "Node" in aspect.planet1_en or "Node" in aspect.planet2_en:
            evidence.node_texts.append(text_ev)
        else:
            evidence.aspect_texts.append(text_ev)

    for pattern_type, pattern_list in patterns_by_type.items():
        for pat in pattern_list:
            members = list(getattr(pat, "members", ()) or ())
            apex = getattr(pat, "apex", "") or ""
            if planet.name_en not in members and planet.name_en != apex:
                continue
            label = f"{pattern_type}:{','.join(members)}:{apex}"
            text = _lookup_pattern_text(pattern_type, ctx, planet.name_en)
            if not text:
                text = f"{pattern_type}パターンです。"
            evidence.pattern_texts.append(TextEvidence("pattern", label, text, float(getattr(pat, "score", 0.0))))

    evidence.aspect_texts = [TextEvidence(ev.source, ev.key, text, ev.priority) for ev, text in zip(evidence.aspect_texts, compact_texts([ev.text for ev in evidence.aspect_texts], limit=3))]
    evidence.node_texts = [TextEvidence(ev.source, ev.key, text, ev.priority) for ev, text in zip(evidence.node_texts, compact_texts([ev.text for ev in evidence.node_texts], limit=2))]
    evidence.pattern_texts = [TextEvidence(ev.source, ev.key, text, ev.priority) for ev, text in zip(evidence.pattern_texts, compact_texts([ev.text for ev in evidence.pattern_texts], limit=2))]
    return evidence


def build_angle_evidence(
    angle: AngleData,
    planets: List[PlanetData],
    angles: List[AngleData],
    ctx: ChartContext,
    planet_map: Dict[str, PlanetEvidence],
    indices: Dict[str, Any],
    get_angle_ruler_positions: Any,
) -> AngleEvidence:
    row = indices["angle_sign_index"].get((angle.name_en, angle.sign_en))
    text_set = _field_text_set_from_row(row)
    if not _select_primary_text(text_set):
        text_set.interpretation = build_angle_fallback(
            angle,
            indices["sign_master_en"],
            indices.get("angle_sign_index"),
        )
    rulers = [planet_map[p.name_en] for p in get_angle_ruler_positions(planets, angles, angle.name_en) if p.name_en in planet_map]
    return AngleEvidence(
        angle=angle,
        text_set=text_set,
        angle_text=text_set.interpretation or text_set.summary or text_set.core,
        ruler_evidences=rulers,
    )


def build_node_evidence(
    nodes: List[NodeData],
    aspects: List[AspectData],
    indices: Dict[str, Any],
    score_aspect_for_display: Any,
) -> Optional[NodeEvidence]:
    north = next((n for n in nodes if n.name_en == "North Node"), None)
    south = next((n for n in nodes if n.name_en == "South Node"), None)
    if not north and not south:
        return None

    north_set = FieldTextSet()
    south_set = FieldTextSet()
    axis_set = FieldTextSet()

    if north:
        row = indices["node_sign_house_index"].get((north.name_ja, north.sign_ja, north.house))
        north_set = _field_text_set_from_row(row)
        if not _select_primary_text(north_set):
            north_set.interpretation = build_node_fallback(north, indices.get("conflict_direction_index"))

    if south:
        row = indices["node_sign_house_index"].get((south.name_ja, south.sign_ja, south.house))
        south_set = _field_text_set_from_row(row)
        if not _select_primary_text(south_set):
            south_set.interpretation = build_node_fallback(south, indices.get("conflict_direction_index"))

    if north and south and north.house and south.house:
        row = indices["node_axis_index"].get((north.sign_ja, north.house, south.sign_ja, south.house))
        axis_set = _field_text_set_from_row(row, is_node_axis=True)

    related_aspects: List[TextEvidence] = []
    for aspect in aspects:
        if "Node" not in aspect.planet1_en and "Node" not in aspect.planet2_en:
            continue
        aspect_ev = build_aspect_evidence(aspect, indices, score_aspect_for_display(aspect))
        related_aspects.append(
            TextEvidence("aspect", f"{aspect.planet1_en}:{aspect.planet2_en}:{aspect.aspect_en}", _select_primary_text(aspect_ev.text_set), aspect_ev.priority)
        )

    related_aspects = [TextEvidence(ev.source, ev.key, text, ev.priority) for ev, text in zip(related_aspects, compact_texts([ev.text for ev in related_aspects], limit=3))]
    return NodeEvidence(
        north_node=north,
        south_node=south,
        north_text_set=north_set,
        south_text_set=south_set,
        axis_text_set=axis_set,
        north_text=_select_primary_text(north_set),
        south_text=_select_primary_text(south_set),
        axis_text=_select_primary_text(axis_set),
        related_aspects=related_aspects,
    )


def build_aspect_evidence(aspect: AspectData, indices: Dict[str, Any], priority: float) -> AspectEvidence:
    key = tuple(sorted([aspect.planet1_en, aspect.planet2_en])) + (aspect.aspect_en,)
    row = indices["aspect_index"].get(key)
    text_set = _field_text_set_from_row(row)
    if not _select_primary_text(text_set):
        text_set.interpretation = build_aspect_fallback(
            aspect,
            indices["aspect_type_en"],
            indices.get("aspect_index"),
        )
    return AspectEvidence(aspect=aspect, text_set=text_set, priority=priority)


def build_career_evidence(
    ctx: ChartContext,
    planets: List[PlanetData],
    angle_map: Dict[str, AngleEvidence],
    planet_map: Dict[str, PlanetEvidence],
) -> CareerEvidence:
    mc = angle_map.get("MC")
    jupiter = planet_map.get("Jupiter")
    career = CareerEvidence(mc=mc, jupiter=jupiter)

    for planet in planets:
        evidence = planet_map.get(planet.name_en)
        if not evidence or not planet.house:
            continue
        work_text = _select_texts(evidence.text_set, "work", "summary", "interpretation", limit=1)
        if not work_text:
            continue
        item = TextEvidence("planet", f"{planet.name_en}:{planet.house}", work_text[0], evidence.dominance_score)
        if planet.house == "2":
            career.house_2_texts.append(item)
        elif planet.house == "6":
            career.house_6_texts.append(item)
        elif planet.house == "10":
            career.house_10_texts.append(item)

    if mc:
        career.work_texts.extend(_select_texts(mc.text_set, "work", "interpretation", "summary", limit=2))
    if jupiter:
        career.work_texts.extend(_select_texts(jupiter.text_set, "work", "strengths", "summary", limit=2))
        career.summary_texts.extend(_select_texts(jupiter.text_set, "summary", "strengths", limit=2))

    linked = []
    if career.house_2_texts:
        linked.append(_resolve_career_axis_label("income", ctx))
    if career.house_6_texts:
        linked.append(_resolve_career_axis_label("work", ctx))
    if career.house_10_texts:
        linked.append(_resolve_career_axis_label("status", ctx))
    career.linked_themes = linked
    career.work_texts = compact_texts(career.work_texts, limit=3)
    career.summary_texts = compact_texts(career.summary_texts, limit=3)
    return career


def build_psychology_evidence(
    aspects: List[AspectData],
    indices: Dict[str, Any],
    score_aspect_for_display: Any,
) -> Tuple[List[AspectEvidence], List[TextEvidence]]:
    aspect_evidences = [build_aspect_evidence(aspect, indices, score_aspect_for_display(aspect)) for aspect in aspects]
    aspect_evidences.sort(key=lambda ev: ev.priority, reverse=True)
    psychology = []
    for ev in aspect_evidences[:6]:
        psychology.append(TextEvidence("aspect", f"{ev.aspect.planet1_en}:{ev.aspect.planet2_en}:{ev.aspect.aspect_en}", _select_primary_text(ev.text_set), ev.priority))
    return aspect_evidences, psychology


def build_chart_evidence_bundle(
    ctx: ChartContext,
    planets: List[PlanetData],
    angles: List[AngleData],
    aspects: List[AspectData],
    nodes: List[NodeData],
    **indices
) -> ChartEvidenceBundle:
    from analysis import (
        compute_chart_dominance_profile,
        compute_planet_strengths,
        detect_patterns_v2,
        detect_stelliums,
        detect_unaspected_planets,
        find_aspects_for,
        get_angle_ruler_positions,
        get_final_dispositor,
        score_aspect_for_display,
    )

    stelliums = detect_stelliums(planets, min_count=3, has_birth_time=ctx.has_birth_time)
    patterns_by_type = detect_patterns_v2(planets, angles, nodes, aspects)
    planet_strengths = compute_planet_strengths(planets, angles, aspects, nodes, stelliums, patterns_by_type, ctx.has_birth_time)
    chart_profile = compute_chart_dominance_profile(planets, angles, aspects, nodes, planet_strengths, patterns_by_type, ctx.has_birth_time)
    dominant_planets = [st.planet.name_en for st in planet_strengths[:3]]
    strength_map = {st.planet.name_en: st for st in planet_strengths}
    final_dispositor = get_final_dispositor(planets)
    unaspected_names = {p.name_en for p in detect_unaspected_planets(planets, aspects)}

    planet_map: Dict[str, PlanetEvidence] = {}
    for planet in planets:
        planet_map[planet.name_en] = build_planet_evidence(
            planet,
            ctx,
            aspects,
            patterns_by_type,
            strength_map,
            dominant_planets,
            getattr(final_dispositor, "name_en", "") if final_dispositor else "",
            unaspected_names,
            indices,
            find_aspects_for,
            score_aspect_for_display,
        )

    angle_map: Dict[str, AngleEvidence] = {}
    for angle in angles:
        angle_map[angle.name_en] = build_angle_evidence(
            angle,
            planets,
            angles,
            ctx,
            planet_map,
            indices,
            get_angle_ruler_positions,
        )

    node_evidence = build_node_evidence(nodes, aspects, indices, score_aspect_for_display)
    career_evidence = build_career_evidence(ctx, planets, angle_map, planet_map)
    aspect_evidences, psychology_evidences = build_psychology_evidence(aspects, indices, score_aspect_for_display)

    pattern_evidences: List[TextEvidence] = []
    for pattern_type, pattern_list in patterns_by_type.items():
        for pat in pattern_list:
            members = list(getattr(pat, "members", ()) or ())
            key = f"{pattern_type}:{','.join(members)}:{getattr(pat, 'apex', '') or ''}"
            related = [ev for ev in aspect_evidences if {ev.aspect.planet1_en, ev.aspect.planet2_en}.issubset(set(members))]
            texts = []
            primary_text = _lookup_pattern_text(pattern_type, ctx)
            if primary_text:
                texts.append(primary_text)
            for ev in related[:2]:
                texts.extend(_select_texts(ev.text_set, "summary", "interpretation", "core", limit=1))
            if not texts:
                continue
            pattern_evidences.append(TextEvidence("pattern", key, " ".join(compact_texts(texts, limit=2)), float(getattr(pat, "score", 0.0))))

    summary_evidence = SummaryEvidence()
    core_index = getattr(ctx, "core_theme_index", {}) if ctx is not None else {}
    conflict_index = getattr(ctx, "conflict_direction_index", {}) if ctx is not None else {}
    if isinstance(core_index, dict):
        main_theme_id = clean_text(getattr(ctx, "main_theme_id", ""))
        if main_theme_id:
            row = core_index.get(main_theme_id, {})
            if isinstance(row, dict):
                summary_evidence.theme_texts.extend(
                    _clean_list(get_first(row, "summary", "section2_text", "section8_text"))
                )
                summary_evidence.strength_texts.extend(
                    _clean_list(get_first(row, "strength_text", "summary"))
                )
                summary_evidence.challenge_texts.extend(
                    _clean_list(get_first(row, "caution_text", "summary"))
                )
    if isinstance(conflict_index, dict):
        conflict_theme_id = clean_text(getattr(ctx, "conflict_theme_id", ""))
        direction_theme_id = clean_text(getattr(ctx, "direction_theme_id", ""))
        for theme_id in [conflict_theme_id, direction_theme_id]:
            if not theme_id:
                continue
            row = conflict_index.get(theme_id, {})
            if isinstance(row, dict):
                summary_evidence.challenge_texts.extend(
                    _clean_list(get_first(row, "summary", "problem_text", "section5_text"))
                )
                summary_evidence.growth_texts.extend(
                    _clean_list(get_first(row, "growth_text", "summary", "section5_text"))
                )
    for name in dominant_planets:
        ev = planet_map.get(name)
        if not ev:
            continue
        summary_evidence.theme_texts.extend(_select_texts(ev.text_set, "summary", "theme", limit=1))
        summary_evidence.strength_texts.extend(_select_texts(ev.text_set, "strengths", "summary", limit=1))
    for name in ["Saturn", "Pluto"]:
        ev = planet_map.get(name)
        if not ev:
            continue
        summary_evidence.challenge_texts.extend(_select_texts(ev.text_set, "cautions", "summary", limit=1))
        summary_evidence.growth_texts.extend(_select_texts(ev.text_set, "growth", limit=1))
    if node_evidence:
        summary_evidence.theme_texts.extend(_select_texts(node_evidence.north_text_set, "summary", "theme", "growth", limit=1))
        summary_evidence.growth_texts.extend(_select_texts(node_evidence.axis_text_set, "growth", "summary", limit=1))
    summary_evidence.summary_texts = compact_texts(summary_evidence.theme_texts + summary_evidence.strength_texts + summary_evidence.challenge_texts, limit=5)

    return ChartEvidenceBundle(
        planet_map=planet_map,
        angle_map=angle_map,
        node_evidence=node_evidence,
        career_evidence=career_evidence,
        pattern_evidences=pattern_evidences,
        psychology_evidences=psychology_evidences,
        aspect_evidences=aspect_evidences,
        summary_evidence=summary_evidence,
        dominant_planets=dominant_planets,
        final_dispositor_name=getattr(final_dispositor, "name_en", "") if final_dispositor else "",
        chart_profile=chart_profile,
        patterns_by_type=patterns_by_type,
        stelliums=stelliums,
    )
