from typing import Any, Dict, List, Optional
import re

from io_utils import clean_text, compact_texts, normalize_sign_name
from models import ChartContext, FieldTextSet, IntegratedReading, NarrativePlan
from narrative import build_stellium_payload_from_data

MAX_THEME_RENDER_COUNT = 2


def _planet_position(planet: Any, has_birth_time: bool) -> str:
    house = f" {planet.house}ハウス" if has_birth_time and getattr(planet, "house", None) else ""
    return f"{planet.sign_ja}{house}"


def _pick_from_set(text_set: FieldTextSet, *fields: str, limit: int = 2) -> List[str]:
    texts: List[str] = []
    for field in fields:
        value = getattr(text_set, field, "")
        if isinstance(value, list):
            texts.extend(value)
        elif clean_text(value):
            texts.append(clean_text(value))
    return compact_texts(texts, limit=limit)


def _pick_raw_from_set(text_set: FieldTextSet, *fields: str, limit: int = 2) -> List[str]:
    texts: List[str] = []
    for field in fields:
        value = getattr(text_set, field, "")
        if isinstance(value, list):
            texts.extend([clean_text(v) for v in value if clean_text(v)])
        elif clean_text(value):
            texts.append(clean_text(value))
    return texts[:limit]


def _pick_all_from_set(text_set: FieldTextSet, *fields: str) -> List[str]:
    texts: List[str] = []
    for field in fields:
        value = getattr(text_set, field, "")
        if isinstance(value, list):
            texts.extend([clean_text(v) for v in value if clean_text(v)])
        elif clean_text(value):
            texts.append(clean_text(value))
    return compact_texts(texts, limit=len(texts) or 1)


def _pick_line_avoiding(used_texts: set[str], candidates: List[str], allow_duplicate: bool = False) -> str:
    fallback = ""
    for line in candidates:
        line = clean_text(line)
        if not line:
            continue
        if not fallback:
            fallback = line
        if line in used_texts:
            continue
        return line
    return fallback if allow_duplicate else ""


def _pick_short_line(used_texts: set[str], candidates: List[str]) -> str:
    ordered = sorted([clean_text(c) for c in candidates if clean_text(c)], key=len)
    return _pick_line_avoiding(used_texts, ordered, allow_duplicate=False)


def _text_bigrams(text: str) -> set[str]:
    value = re.sub(r"\s+", "", clean_text(text))
    if not value:
        return set()
    if len(value) < 2:
        return {value}
    return {value[i : i + 2] for i in range(len(value) - 1)}


def _text_similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    sa = _text_bigrams(a)
    sb = _text_bigrams(b)
    if not sa or not sb:
        return 0.0
    union = sa | sb
    if not union:
        return 0.0
    return len(sa & sb) / len(union)


def _is_near_duplicate(a: str, b: str, threshold: float = 0.85) -> bool:
    if not a or not b:
        return False
    if clean_text(a) == clean_text(b):
        return True
    return _text_similarity(a, b) >= threshold


def _asc_is_impression_only(text: str) -> bool:
    text = clean_text(text)
    if not text:
        return False
    if "第一印象" not in text:
        return False
    return not any(k in text for k in ["自己表現", "表現", "外側", "外に", "出方", "入口", "振る舞い"])


def _asc_is_weak_template(text: str) -> bool:
    text = clean_text(text)
    if not text:
        return False
    return "の性質で自己表現の入口が形成され" in text


def _is_preachy_line(text: str) -> bool:
    text = clean_text(text)
    if not text:
        return False
    keywords = [
        "成功",
        "尊敬",
        "権威",
        "大成",
        "指導者",
        "偉大",
        "べき",
        "重要になります",
        "求められます",
        "できます",
    ]
    return any(k in text for k in keywords)


def _is_weak_mc_label(text: str) -> bool:
    text = clean_text(text)
    if not text:
        return False
    weak_phrases = [
        "型の社会役割",
        "社会的使命",
        "社会役割",
    ]
    if any(p in text for p in weak_phrases):
        return True
    return len(text) <= 8


def can_render_theme(theme: Any, used_theme_counts: Dict[str, int]) -> bool:
    """Return True when a theme is still below the global render limit."""
    if not theme:
        return False
    theme_id = getattr(theme, "theme_id", "")
    count = used_theme_counts.get(theme_id, 0)
    source_type = getattr(theme, "source_type", "")
    if theme_id.startswith("node") or theme_id == "node:axis" or source_type == "node":
        return count < 1
    if theme_id.startswith("pattern") or source_type == "pattern":
        return count < 1
    return count < 2


def mark_theme_used(theme_id: str, used_theme_counts: Dict[str, int]) -> None:
    """Record one render usage for a theme id."""
    if not theme_id:
        return
    used_theme_counts[theme_id] = used_theme_counts.get(theme_id, 0) + 1


def _consume_theme(theme: Any, used_theme_counts: Dict[str, int], expected_role: str) -> Optional[Any]:
    """Return a theme only when it is still renderable, and mark it as used."""
    if not theme:
        return None
    role = getattr(theme, "role", "")
    if role != expected_role:
        return None
    if not can_render_theme(theme, used_theme_counts):
        return None
    theme_id = getattr(theme, "theme_id", "")
    mark_theme_used(theme_id, used_theme_counts)
    return theme


def _filtered_narrative_plan(
    narrative_plan: Optional[NarrativePlan],
    used_theme_counts: Dict[str, int],
) -> Optional[NarrativePlan]:
    """Build a render-safe narrative plan that respects theme usage limits."""
    if narrative_plan is None:
        return None

    return NarrativePlan(
        core_themes=narrative_plan.core_themes,
        main_theme=_consume_theme(narrative_plan.main_theme, used_theme_counts, "main"),
        conflict_theme=_consume_theme(
            narrative_plan.conflict_theme, used_theme_counts, "conflict"
        ),
        direction_theme=_consume_theme(
            narrative_plan.direction_theme, used_theme_counts, "direction"
        ),
        support_themes=[],
    )


def _find_theme_by_id(core_themes: List[Any], theme_id: str) -> Optional[Any]:
    if not theme_id:
        return None
    for theme in core_themes or []:
        if getattr(theme, "theme_id", "") == theme_id:
            return theme
    return None


def _pick_theme_line(theme: Any, fields: List[str]) -> str:
    if not theme:
        return ""
    for field in fields:
        value = clean_text(getattr(theme, field, ""))
        if value:
            return value
    return ""


def _select_node_direction_theme(narrative_plan: Optional[NarrativePlan]) -> Optional[Any]:
    if not narrative_plan:
        return None
    if narrative_plan.direction_theme and (
        getattr(narrative_plan.direction_theme, "source_type", "") == "node"
        or getattr(narrative_plan.direction_theme, "theme_id", "") == "node:axis"
    ):
        return narrative_plan.direction_theme
    for candidate in getattr(narrative_plan, "core_themes", []) or []:
        if candidate.source_type == "node" or candidate.theme_id == "node:axis":
            return candidate
    return None


def _build_stellium_lines(stellium: Dict[str, Any], ctx: ChartContext) -> List[str]:
    payload = build_stellium_payload_from_data(stellium, ctx)
    if not payload:
        return []
    return compact_texts(
        [
            clean_text(payload.get("summary", "")),
            clean_text(payload.get("main_text", "")),
            clean_text(payload.get("caution_text", "")),
        ],
        limit=2,
    )


def _get_stellium_member_names(
    stelliums: List[Dict[str, Any]],
    primary_stellium_key: str,
) -> set[str]:
    if not primary_stellium_key:
        return set()
    parts = str(primary_stellium_key).split(":", 2)
    if len(parts) != 3:
        return set()
    _, sign, house = parts
    for stellium in stelliums:
        if (
            normalize_sign_name(stellium.get("sign_ja", "")) == sign
            and clean_text(stellium.get("house", "")) == house
        ):
            members = stellium.get("members", []) or []
            return {
                getattr(member, "name_en", "")
                for member in members
                if getattr(member, "name_en", "")
            }
    return set()


def _pick_body_lines_with_fallback(text_set: FieldTextSet, limit: int = 2) -> List[str]:
    lines: List[str] = []
    interpretation = clean_text(getattr(text_set, "interpretation", ""))
    if interpretation:
        lines.append(interpretation)
    if len(lines) < limit:
        core = clean_text(getattr(text_set, "core", ""))
        if core and core not in lines:
            lines.append(core)
    if len(lines) < limit:
        summary = clean_text(getattr(text_set, "summary", ""))
        if summary and summary not in lines:
            lines.append(summary)
    return lines[:limit]


def _pick_saturn_body_lines(text_set: FieldTextSet) -> List[str]:
    lines: List[str] = []
    interpretation = clean_text(getattr(text_set, "interpretation", ""))
    core = clean_text(getattr(text_set, "core", ""))
    summary = clean_text(getattr(text_set, "summary", ""))
    relationship = ""
    rel_list = getattr(text_set, "relationship", None)
    if isinstance(rel_list, list) and rel_list:
        relationship = clean_text(rel_list[0])

    first = interpretation or core or summary
    if first:
        lines.append(first)

    second = ""
    if relationship and relationship != first:
        second = relationship
    else:
        if first != core and core:
            second = core
        elif first != summary and summary:
            second = summary
    if second:
        lines.append(second)

    return lines[:2]


def _render_planet_section(
    title: str,
    evidence: Any,
    has_birth_time: bool,
    body_fields: List[str],
    note_fields: List[str],
    detail_level: str = "full",
    note_exclude_phrases: Optional[List[str]] = None,
    body_override: Optional[List[str]] = None,
    note_limit_override: Optional[int] = None,
) -> List[str]:
    if not evidence:
        return []
    is_reduced = detail_level == "reduced"
    body_limit = 1 if is_reduced else 2
    note_limit = 1 if is_reduced else 3
    if note_limit_override is not None:
        note_limit = note_limit_override
    lines = [f"■ {title}: {_planet_position(evidence.planet, has_birth_time)}"]
    body_lines = body_override if body_override is not None else _pick_from_set(
        evidence.text_set, *body_fields, limit=body_limit
    )
    lines.extend(body_lines)
    notes = _pick_raw_from_set(evidence.text_set, *note_fields, limit=note_limit)
    if not is_reduced and evidence.aspect_texts:
        notes.extend(compact_texts([ev.text for ev in evidence.aspect_texts], limit=1))
    if not is_reduced and evidence.node_texts:
        notes.extend(compact_texts([ev.text for ev in evidence.node_texts], limit=1))
    body_texts = [clean_text(t) for t in body_lines if clean_text(t)]
    if body_texts:
        filtered_notes = []
        for note in notes:
            note_text = clean_text(note)
            if not note_text:
                continue
            if any(_is_near_duplicate(note_text, body) for body in body_texts):
                continue
            filtered_notes.append(note_text)
        notes = filtered_notes
    if note_exclude_phrases:
        notes = [n for n in notes if not any(p in n for p in note_exclude_phrases)]
    if len(notes) > 1:
        def note_score(text: str) -> float:
            score = 0.0
            if "\n" in text or "。" in text:
                score += 1.0
            if len(text) <= 6 and "。" not in text:
                score -= 1.0
            return score
        notes = sorted(notes, key=note_score, reverse=True)
    if notes:
        lines.append("補足:")
        if any("\n" in n for n in notes):
            selected_notes = notes[:note_limit]
        else:
            selected_notes = compact_texts(notes, limit=note_limit)
        for text in selected_notes:
            if "\n" in text:
                for part in [clean_text(p) for p in text.splitlines() if clean_text(p)]:
                    lines.append(f"・{part}")
            else:
                lines.append(f"・{text}")
    lines.append("")
    return lines


def render_full_reading_v3(ctx: ChartContext, integrated: IntegratedReading) -> str:
    profile = integrated.chart_profile
    sec1_data = integrated.section1
    sec2_data = integrated.section2
    sec3_data = integrated.section3
    sec4_data = integrated.section4
    sec5_data = integrated.section5
    sec6_data = integrated.section6
    sec7_data = integrated.section7
    sec8_data = integrated.section8
    narrative_plan = integrated.narrative_plan
    narrative_bundle = integrated.narrative_bundle
    narrative_section_plan = integrated.narrative_section_plan
    used_theme_counts: Dict[str, int] = {}
    used_texts: set[str] = set()
    protected_texts: set[str] = set()
    sec5_conflict_line = ""
    sec5_direction_line = ""
    main_axis_is_stellium = bool(
        narrative_bundle and narrative_bundle.primary_stellium_key
    )
    stellium_payload = (
        narrative_section_plan.stellium_payload
        if narrative_section_plan and main_axis_is_stellium
        else {}
    )
    stellium_section_texts = (
        narrative_section_plan.stellium_section_texts
        if narrative_section_plan and main_axis_is_stellium
        else {}
    )
    stellium_member_names = _get_stellium_member_names(
        sec1_data.get("stelliums") or [],
        narrative_bundle.primary_stellium_key if narrative_bundle else "",
    )

    # (sec5/sec8 formatting is kept as-is; sec7 is handled in narrative)

    sec1_lines = ["【1. チャート構造サマリー】", ""]
    if profile:
        sec1_lines.append("■ エレメント（価値観の軸）: " + "、".join(f"{k}({v})" for k, v in profile.dominant_elements))
        sec1_lines.append("■ モダリティ（行動の軸）: " + "、".join(f"{k}({v})" for k, v in profile.dominant_modalities))
        if getattr(profile, "dominant_houses", None):
            houses = "、".join(f"{house}ハウス({count})" for house, count in profile.dominant_houses)
            if houses:
                sec1_lines.append(f"■ ハウス集中: {houses}")
    if sec1_data.get("dominant_planets"):
        names = "、".join(f"{ev.planet.name_ja} {_planet_position(ev.planet, ctx.has_birth_time)}" for ev in sec1_data["dominant_planets"][:3])
        sec1_lines.append(f"■ 支配天体: {names}")
    if sec1_data.get("stelliums"):
        st = [f"{s.get('sign_ja','')}{s.get('house','') + 'ハウス' if s.get('house') else ''}({s.get('count',0)}天体)" for s in sec1_data["stelliums"]]
        sec1_lines.append(f"■ ステリウム: {'、'.join(st)}")
        stellium_desc_lines: List[str] = []
        for stellium in (sec1_data.get("stelliums") or [])[:2]:
            stellium_desc_lines.extend(_build_stellium_lines(stellium, ctx))
        if stellium_desc_lines:
            sec1_lines.extend(compact_texts(stellium_desc_lines, limit=2))
    pattern_names = [f"{k}({len(v)}組)" for k, v in (sec1_data.get("patterns") or {}).items() if v]
    if pattern_names:
        sec1_lines.append(f"■ 複合アスペクト: {'、'.join(pattern_names)}")
    sec1 = "\n".join(sec1_lines).strip()

    sec2_lines = ["【2. 人生の基本テーマ】", ""]
    asc = sec2_data.get("asc")
    mc = sec2_data.get("mc")
    asc_rulers = sec2_data.get("asc_rulers") or []
    mc_rulers = sec2_data.get("mc_rulers") or []
    core_themes = narrative_plan.core_themes if narrative_plan else []
    main_theme_source = None
    conflict_theme_source = None
    direction_theme_source = None
    if narrative_bundle and core_themes:
        main_theme_source = _find_theme_by_id(core_themes, narrative_bundle.core_theme_id)
        conflict_theme_source = _find_theme_by_id(core_themes, narrative_bundle.conflict_theme_id)
        direction_theme_source = _find_theme_by_id(core_themes, narrative_bundle.direction_theme_id)
    if not main_theme_source and narrative_plan:
        main_theme_source = narrative_plan.main_theme
    if not conflict_theme_source and narrative_plan:
        conflict_theme_source = narrative_plan.conflict_theme
    if not direction_theme_source and narrative_plan:
        direction_theme_source = narrative_plan.direction_theme

    main_theme_for_sec2 = _consume_theme(
        main_theme_source,
        used_theme_counts,
        "main",
    )
    if main_theme_for_sec2:
        sec2_lines.append("■ Main Theme")
        if main_axis_is_stellium:
            main_axis_line = clean_text(stellium_section_texts.get("sec2", ""))
            if not main_axis_line:
                main_axis_line = clean_text(stellium_payload.get("summary", ""))
            if main_axis_line:
                sec2_lines.append(main_axis_line)
        else:
            main_axis_line = clean_text(getattr(main_theme_for_sec2, "section2_text", ""))
            if not main_axis_line:
                main_axis_line = clean_text(getattr(main_theme_for_sec2, "summary", ""))
            if main_axis_line:
                sec2_lines.append(main_axis_line)
        sec2_lines.append("")
    house_focus_texts = sec2_data.get("house_focus_texts") or []
    if house_focus_texts:
        sec2_lines.append("■ ハウス集中補足")
        sec2_lines.extend(compact_texts([clean_text(t) for t in house_focus_texts], limit=2))
        sec2_lines.append("")
    # Always show ASC / ASC ruler / MC / MC ruler
    sec2_asc_lines: List[str] = []
    if ctx.has_birth_time and asc:
        sec2_lines.append("■ ASC")
        asc_lines = _pick_from_set(asc.text_set, "interpretation", "summary", "core", limit=2)
        sec2_lines.extend(asc_lines)
        sec2_asc_lines = asc_lines[:]
        sec2_lines.append("")
    if ctx.has_birth_time and asc_rulers:
        ruler = asc_rulers[0]
        sec2_lines.append(f"■ ASC支配星: {ruler.planet.name_ja} {_planet_position(ruler.planet, ctx.has_birth_time)}")
        ruler_lines = _pick_from_set(ruler.text_set, "interpretation", "summary", "core", limit=1)
        sec2_lines.extend(ruler_lines)
        sec2_lines.append("")
    if ctx.has_birth_time and mc:
        sec2_lines.append("■ MC")
        mc_lines = _pick_from_set(mc.text_set, "interpretation", "summary", "core", limit=2)
        sec2_lines.extend(mc_lines)
        sec2_lines.append("")
    if ctx.has_birth_time and mc_rulers:
        ruler = mc_rulers[0]
        sec2_lines.append(f"■ MC支配星: {ruler.planet.name_ja} {_planet_position(ruler.planet, ctx.has_birth_time)}")
        ruler_lines = _pick_from_set(ruler.text_set, "interpretation", "summary", "core", limit=1)
        sec2_lines.extend(ruler_lines)
        sec2_lines.append("")
    sec2 = "\n".join(sec2_lines).strip()

    sec3_lines = ["【3. コア人格】", ""]
    sec3_lines.extend(
        _render_planet_section(
            "太陽",
            sec3_data.get("sun"),
            ctx.has_birth_time,
            ["interpretation", "core", "summary"],
            ["cautions", "growth"],
            detail_level="reduced" if "Sun" in stellium_member_names else "full",
            body_override=_pick_body_lines_with_fallback(
                sec3_data.get("sun").text_set, limit=2
            )
            if sec3_data.get("sun")
            else None,
            note_limit_override=2,
        )
    )
    sec3_lines.extend(
        _render_planet_section(
            "月",
            sec3_data.get("moon"),
            ctx.has_birth_time,
            ["interpretation", "core", "summary"],
            ["cautions", "growth"],
            detail_level="reduced" if "Moon" in stellium_member_names else "full",
            body_override=_pick_body_lines_with_fallback(
                sec3_data.get("moon").text_set, limit=2
            )
            if sec3_data.get("moon")
            else None,
            note_limit_override=2,
        )
    )
    asc3 = sec3_data.get("asc")
    if asc3:
        sec3_lines.append(f"■ ASC: {asc3.angle.sign_ja}")
        asc_candidates = _pick_all_from_set(asc3.text_set, "core", "interpretation", "summary")
        # Preserve order, drop duplicates
        seen = set()
        ordered = []
        for c in asc_candidates:
            if c in seen:
                continue
            seen.add(c)
            ordered.append(c)
        # Avoid repeating Section2 ASC lines when possible
        filtered = [c for c in ordered if c not in sec2_asc_lines]
        if not filtered:
            filtered = ordered
        # Prefer stronger ASC lines: avoid weak templates and impression-only when possible
        def asc_score(text: str) -> float:
            score = 0.0
            if _asc_is_weak_template(text):
                score -= 2.0
            if _asc_is_impression_only(text):
                score -= 1.0
            if any(k in text for k in ["外側", "外に", "出方", "表現", "自己表現", "反応", "入口"]):
                score += 1.0
            return score

        scored = sorted(filtered, key=asc_score, reverse=True)
        asc_line = _pick_line_avoiding(set(), scored, allow_duplicate=True)
        if asc_line:
            sec3_lines.append(asc_line)
        sec3_lines.append("")
    core_blocks = narrative_section_plan.core_personality_blocks if narrative_section_plan else {}
    integrated_text = clean_text(core_blocks.get("integrated", "")) if core_blocks else ""
    if not integrated_text and core_blocks:
        integrated_text = (
            clean_text(core_blocks.get("core_self", ""))
            or clean_text(core_blocks.get("emotional_self", ""))
            or clean_text(core_blocks.get("public_self", ""))
        )
    if not integrated_text and sec3_data.get("sun"):
        fallback = _pick_from_set(sec3_data.get("sun").text_set, "interpretation", "core", "summary", limit=1)
        if fallback:
            integrated_text = clean_text(fallback[0])
    if integrated_text:
        sec3_lines.append("■ 統合人格")
        sec3_lines.append(integrated_text)
        sec3_lines.append("")
        protected_texts.add(integrated_text)
    sec3 = "\n".join(sec3_lines).strip()

    sec4_lines = ["【4. 思考・愛情・行動パターン】", ""]
    relationship_text = ""
    if main_axis_is_stellium:
        relationship_text = clean_text(stellium_section_texts.get("sec4_relationship", ""))
    if relationship_text:
        sec4_lines.append("■ 対人テーマ補足")
        sec4_lines.append(relationship_text)
        sec4_lines.append("")
    sec4_note_excludes = [
        "人生全体で",
        "長期的に繰り返されやすい",
        "葛藤",
        "衝突",
        "人との距離感が揺れやすい",
    ]
    sec4_lines.extend(
        _render_planet_section(
            "水星",
            sec4_data.get("mercury"),
            ctx.has_birth_time,
            ["interpretation", "work", "relationship"],
            ["work", "relationship"],
            detail_level="reduced" if "Mercury" in stellium_member_names else "full",
            note_exclude_phrases=sec4_note_excludes,
        )
    )
    sec4_lines.extend(
        _render_planet_section(
            "金星",
            sec4_data.get("venus"),
            ctx.has_birth_time,
            ["interpretation", "relationship", "strengths"],
            ["relationship", "strengths", "cautions"],
            detail_level="reduced" if "Venus" in stellium_member_names else "full",
            note_exclude_phrases=sec4_note_excludes,
        )
    )
    sec4_lines.extend(
        _render_planet_section(
            "火星",
            sec4_data.get("mars"),
            ctx.has_birth_time,
            ["interpretation", "work"],
            ["cautions", "work"],
            detail_level="reduced" if "Mars" in stellium_member_names else "full",
            note_exclude_phrases=sec4_note_excludes,
        )
    )
    sec4 = "\n".join(sec4_lines).strip()

    sec5_lines = ["【5. 成長と課題】", ""]
    conflict_theme_for_sec5 = _consume_theme(
        conflict_theme_source,
        used_theme_counts,
        "conflict",
    )
    if not ctx.has_birth_time:
        node_direction = _select_node_direction_theme(narrative_plan)
        if node_direction:
            direction_theme_source = node_direction
    direction_theme_for_sec5 = _consume_theme(direction_theme_source, used_theme_counts, "direction")
    if conflict_theme_for_sec5 or direction_theme_for_sec5:
        sec7_blocks = narrative_section_plan.section7_blocks if narrative_section_plan else {}
        sec7_core = clean_text(sec7_blocks.get("core", ""))
        sec7_integration = clean_text(sec7_blocks.get("integration", ""))

        if conflict_theme_for_sec5:
            sec5_lines.append("■ Conflict Theme")
            conflict_candidates = [
                _pick_theme_line(conflict_theme_for_sec5, ["section5_text"]),
                _pick_theme_line(conflict_theme_for_sec5, ["summary"]),
            ]
            conflict_line = _pick_line_avoiding(
                used_texts, [c for c in conflict_candidates if c and c != sec7_core and c != sec7_integration]
            )
            if conflict_line:
                sec5_lines.append(conflict_line)
                sec5_conflict_line = conflict_line
                used_texts.add(conflict_line)
                protected_texts.add(conflict_line)
            sec5_lines.append("")
        if direction_theme_for_sec5:
            sec5_lines.append("■ Direction Theme")
            direction_candidates = [
                _pick_theme_line(direction_theme_for_sec5, ["section5_text"]),
                _pick_theme_line(direction_theme_for_sec5, ["summary"]),
            ]
            filtered = [c for c in direction_candidates if c and c != sec7_core and c != sec7_integration]
            if sec5_conflict_line:
                filtered = [c for c in filtered if c != sec5_conflict_line]
            direction_line = _pick_line_avoiding(used_texts, filtered)
            if direction_line:
                sec5_lines.append(direction_line)
                sec5_direction_line = direction_line
                used_texts.add(direction_line)
                protected_texts.add(direction_line)
            sec5_lines.append("")
        # Connect Section5 axis to Saturn/Pluto/Node
        axis_parts = []
        if sec5_data.get("saturn"):
            axis_parts.append("土星")
        if sec5_data.get("pluto"):
            axis_parts.append("冥王星")
        if sec5_data.get("node_evidence"):
            axis_parts.append("ノード")
        if axis_parts:
            sec5_lines.append("■ 成長軸")
            sec5_lines.append("・" + "・".join(axis_parts))
            sec5_lines.append("")
        if main_axis_is_stellium:
            caution_text = clean_text(stellium_section_texts.get("caution", ""))
            if caution_text:
                sec5_lines.append(caution_text)
                sec5_lines.append("")
    # Always include Saturn / Pluto / Node
    sec5_lines.extend(
        _render_planet_section(
            "土星",
            sec5_data.get("saturn"),
            ctx.has_birth_time,
            ["interpretation", "cautions"],
            ["cautions", "growth"],
            body_override=_pick_saturn_body_lines(sec5_data.get("saturn").text_set)
            if sec5_data.get("saturn")
            else None,
        )
    )
    sec5_lines.extend(
        _render_planet_section(
            "冥王星",
            sec5_data.get("pluto"),
            ctx.has_birth_time,
            ["interpretation", "cautions"],
            ["growth"],
        )
    )
    node_ev = sec5_data.get("node_evidence")
    if node_ev:
        sec5_lines.append("■ ノード軸")
        sec5_lines.extend(
            _pick_from_set(node_ev.north_text_set, "interpretation", "summary", limit=2)
        )
        sec5_lines.extend(
            _pick_from_set(node_ev.south_text_set, "cautions", limit=1)
        )
        sec5_lines.extend(
            _pick_from_set(node_ev.axis_text_set, "interpretation", "growth", limit=2)
        )
        sec5_lines.append("")
    sec5 = "\n".join(sec5_lines).strip()

    sec6_lines = ["【6. 社会的役割とキャリア】", ""]
    # Always include MC / MC ruler / Jupiter / 10th house supplement
    mc = sec6_data.get("mc")
    mc_rulers = sec6_data.get("mc_rulers") or []
    jupiter = sec6_data.get("jupiter")
    house_10_texts = sec6_data.get("house_10_texts") or []
    mc_ruler_line = ""
    if ctx.has_birth_time and mc:
        sec6_lines.append("■ MC")
        mc_candidates = _pick_all_from_set(mc.text_set, "summary", "interpretation", "core", "theme")
        if not mc_candidates:
            mc_candidates = _pick_from_set(mc.text_set, "summary", "interpretation", "core", "theme", limit=1)
        # Prefer non-weak labels when possible
        preferred = [c for c in mc_candidates if not _is_weak_mc_label(c)]
        if preferred:
            mc_line = _pick_short_line(used_texts, list(preferred))
        else:
            mc_line = _pick_short_line(used_texts, list(mc_candidates))
        if mc_line:
            sec6_lines.append(mc_line)
            used_texts.add(mc_line)
            protected_texts.add(mc_line)
        sec6_lines.append("")
    if ctx.has_birth_time and mc_rulers:
        ruler = mc_rulers[0]
        sec6_lines.append(f"■ MC支配星: {ruler.planet.name_ja} {_planet_position(ruler.planet, ctx.has_birth_time)}")
        ruler_candidates = _pick_all_from_set(ruler.text_set, "work", "summary", "interpretation", "core")
        mc_ruler_line = _pick_line_avoiding(used_texts, ruler_candidates, allow_duplicate=False)
        if mc_ruler_line:
            sec6_lines.append(mc_ruler_line)
            used_texts.add(mc_ruler_line)
            protected_texts.add(mc_ruler_line)
        sec6_lines.append("")
    if jupiter:
        sec6_lines.append(f"■ 木星: {jupiter.planet.name_ja} {_planet_position(jupiter.planet, ctx.has_birth_time)}")
        jupiter_candidates = _pick_all_from_set(
            jupiter.text_set, "work", "interpretation", "summary", "strengths"
        )
        if mc_ruler_line:
            jupiter_candidates = [c for c in jupiter_candidates if c != mc_ruler_line]
        jupiter_candidates = [c for c in jupiter_candidates if not _is_preachy_line(c)]
        jupiter_line = _pick_line_avoiding(used_texts, jupiter_candidates, allow_duplicate=False)
        if jupiter_line:
            sec6_lines.append(jupiter_line)
            used_texts.add(jupiter_line)
            protected_texts.add(jupiter_line)
        sec6_lines.append("")
    if ctx.has_birth_time:
        sec6_lines.append("■ 10ハウス補足")
        house10_candidates = [clean_text(ev.text) for ev in house_10_texts if clean_text(ev.text)]
        if not house10_candidates:
            # Fallback to house master texts when no planet is in 10H
            row = (ctx.house_master_index or {}).get("10")
            if isinstance(row, dict):
                for key in ("意味", "テーマ", "サブテーマ1"):
                    value = clean_text(row.get(key, ""))
                    if value:
                        house10_candidates.append(value)
                        break
        # First pass: avoid MC ruler / Jupiter duplicates
        filtered = [c for c in house10_candidates if c != mc_ruler_line and c != jupiter_line]
        house10_line = _pick_line_avoiding(used_texts, filtered, allow_duplicate=False)
        # Second pass: re-search without used_texts exclusion (still avoid MC/Jupiter)
        if not house10_line:
            house10_line = _pick_line_avoiding(set(), filtered, allow_duplicate=False)
        # Final fallback: allow first available summary/interpretation candidate
        if not house10_line and house10_candidates:
            house10_line = house10_candidates[0]
        if house10_line:
            sec6_lines.append(house10_line)
            used_texts.add(house10_line)
            protected_texts.add(house10_line)
        sec6_lines.append("")
    blocks = narrative_section_plan.section6_blocks if narrative_section_plan else {}
    if blocks.get("main") and blocks.get("main") not in used_texts:
        sec6_lines.append("■ 主戦場")
        sec6_lines.append(blocks["main"])
        sec6_lines.append("")
        used_texts.add(blocks["main"])
    if blocks.get("strengths"):
        if blocks.get("strengths") not in used_texts:
            sec6_lines.append("■ 得意な役割")
            sec6_lines.append(blocks["strengths"])
            sec6_lines.append("")
            used_texts.add(blocks["strengths"])
    if blocks.get("expansion"):
        if blocks.get("expansion") not in used_texts:
            sec6_lines.append("■ 伸びる方向")
            sec6_lines.append(blocks["expansion"])
            sec6_lines.append("")
            used_texts.add(blocks["expansion"])
    if blocks.get("caution"):
        if blocks.get("caution") not in used_texts:
            sec6_lines.append("■ 注意点")
            sec6_lines.append(blocks["caution"])
            sec6_lines.append("")
            used_texts.add(blocks["caution"])
    sec6 = "\n".join(sec6_lines).strip()

    sec7_lines = ["【7. 心理構造】", ""]
    blocks = narrative_section_plan.section7_blocks if narrative_section_plan else {}
    core_text = clean_text(blocks.get("core", ""))
    reinforcing = blocks.get("reinforcing", []) or []
    integration = clean_text(blocks.get("integration", ""))
    support = clean_text(blocks.get("support", ""))

    if core_text and core_text == sec5_conflict_line:
        core_text = ""
    if core_text and core_text == sec5_direction_line:
        core_text = ""
    if integration and integration == sec5_direction_line:
        integration = ""
    if integration and integration == sec5_conflict_line:
        integration = ""

    if core_text:
        sec7_lines.append("■ 中核葛藤の補足")
        sec7_lines.append(core_text)
        sec7_lines.append("")
        used_texts.add(core_text)
    if reinforcing:
        sec7_lines.append("■ その葛藤を強める要因")
        for text in reinforcing[:3]:
            if clean_text(text) and clean_text(text) not in used_texts:
                sec7_lines.append(clean_text(text))
                used_texts.add(clean_text(text))
        sec7_lines.append("")
    if integration:
        sec7_lines.append("■ 統合のヒント")
        sec7_lines.append(integration)
        sec7_lines.append("")
        used_texts.add(integration)
    if support:
        sec7_lines.append("■ 支えになる要素")
        sec7_lines.append(support)
        sec7_lines.append("")
        used_texts.add(support)
    sec7 = "\n".join(sec7_lines).strip()

    plan_for_sec8 = None
    if narrative_plan:
        plan_for_sec8 = NarrativePlan(
            core_themes=core_themes,
            main_theme=main_theme_source,
            conflict_theme=conflict_theme_source,
            direction_theme=direction_theme_source,
            support_themes=narrative_plan.support_themes,
        )
        if not ctx.has_birth_time:
            node_direction = _select_node_direction_theme(narrative_plan)
            if node_direction and node_direction != plan_for_sec8.direction_theme:
                plan_for_sec8.direction_theme = node_direction

    sec8_lines = ["【第8章：総括・人生のテーマと課題の統合】", ""]
    if plan_for_sec8:
        main_theme = plan_for_sec8.main_theme if getattr(plan_for_sec8.main_theme, "role", "") == "main" else None
        conflict_theme = plan_for_sec8.conflict_theme if getattr(plan_for_sec8.conflict_theme, "role", "") == "conflict" else None
        direction_theme = plan_for_sec8.direction_theme if getattr(plan_for_sec8.direction_theme, "role", "") == "direction" else None
        summary_candidates = [
            _pick_theme_line(main_theme, ["summary"]),
            _pick_theme_line(main_theme, ["section8_text"]),
        ]
        summary_line = _pick_line_avoiding(used_texts, summary_candidates, allow_duplicate=True)
        if summary_line:
            used_texts.add(summary_line)
            protected_texts.add(summary_line)
        strength_candidates = [
            _pick_theme_line(main_theme, ["strength_text"]),
        ]
        strength_line = _pick_line_avoiding(used_texts, strength_candidates, allow_duplicate=True)
        if strength_line:
            used_texts.add(strength_line)
            protected_texts.add(strength_line)
        conflict_candidates = [
            _pick_theme_line(conflict_theme, ["section8_text"]),
            _pick_theme_line(conflict_theme, ["summary"]),
            _pick_theme_line(conflict_theme, ["problem_text"]),
        ]
        conflict_line = _pick_line_avoiding(used_texts, conflict_candidates, allow_duplicate=True)
        if conflict_line:
            used_texts.add(conflict_line)
            protected_texts.add(conflict_line)
        direction_candidates = [
            _pick_theme_line(direction_theme, ["section8_text"]),
            _pick_theme_line(direction_theme, ["summary"]),
            _pick_theme_line(direction_theme, ["growth_text"]),
        ]
        direction_line = _pick_line_avoiding(used_texts, direction_candidates, allow_duplicate=True)
        if direction_line:
            used_texts.add(direction_line)
            protected_texts.add(direction_line)
        if summary_line:
            sec8_lines.append("■ 人生テーマ")
            sec8_lines.append(summary_line)
            sec8_lines.append("")
        if strength_line:
            sec8_lines.append("■ 強み")
            sec8_lines.append(strength_line)
            sec8_lines.append("")
        if conflict_line:
            sec8_lines.append("■ 課題")
            sec8_lines.append(conflict_line)
            sec8_lines.append("")
        if direction_line:
            sec8_lines.append("■ 成熟方向")
            sec8_lines.append(direction_line)
            sec8_lines.append("")
    sec8 = "\n".join(sec8_lines).strip()

    parts = ["【鑑定結果】", "", sec1, "", sec2, "", sec3, "", sec4, "", sec5, "", sec6, "", sec7, "", sec8]
    lines = "\n".join(parts).strip().split("\n")
    global_used_texts: set[str] = set()
    deduped: List[str] = []
    for line in lines:
        if not line:
            deduped.append(line)
            continue
        if line.startswith("【") or line.startswith("■"):
            deduped.append(line)
            continue
        if line in global_used_texts and line not in protected_texts:
            continue
        global_used_texts.add(line)
        deduped.append(line)
    return "\n".join(deduped).strip()
