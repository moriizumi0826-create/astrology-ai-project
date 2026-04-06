from typing import Iterable, List, Optional, Sequence

from io_utils import (
    clean_text,
    get_conflict_direction_row,
    get_core_theme_row,
    get_node_theme_row,
    get_pattern_theme_row,
    get_stellium_theme_row,
    normalize_sign_name,
    normalize_planet_name,
    strengthen_stellium_text,
)
from models import ChartEvidenceBundle, CoreTheme, NarrativePlan

TAG_OVERLAP_THRESHOLD = 2
HOUSE_OVERLAP_THRESHOLD = 1
PLANET_OVERLAP_THRESHOLD = 2
OVERLAP_SCORE_THRESHOLD = 4


def build_theme_candidates(bundle: ChartEvidenceBundle, ctx: object | None = None) -> List[CoreTheme]:
    """Build raw theme candidates from an evidence bundle for later selection."""
    candidates: List[CoreTheme] = []
    included_planets: set[str] = set()

    def _append_planet_candidate(planet_name: str) -> None:
        evidence = bundle.planet_map.get(planet_name)
        if evidence is None:
            return

        summary = _select_planet_summary(evidence)
        tags = [
            normalize_planet_name(evidence.planet.name_en),
            normalize_sign_name(evidence.planet.sign_ja),
        ]
        if evidence.planet.house:
            tags.append(evidence.planet.house)
        theme_id = _resolve_planet_conflict_theme_id(evidence, ctx) or f"planet:{planet_name}"
        conflict_row = get_conflict_direction_row(theme_id, ctx) if theme_id else None
        label = clean_text(conflict_row.get("label")) if conflict_row else evidence.planet.name_ja
        summary = clean_text(conflict_row.get("summary")) or summary if conflict_row else summary
        role = clean_text(conflict_row.get("role")) if conflict_row else "support"
        score = evidence.dominance_score
        if planet_name == "Saturn":
            role = "conflict"
            score = max(evidence.dominance_score, 92)
        if planet_name == "Pluto":
            role = "conflict"
            score = max(evidence.dominance_score, 90)

        candidates.append(
            CoreTheme(
                theme_id=theme_id,
                label=label,
                summary=summary,
                source_type="planet",
                source_keys=[f"planet:{planet_name}"],
                score=score,
                role=role or "support",
                tags=tags,
                houses=[evidence.planet.house] if evidence.planet.house else [],
                planets=[planet_name],
            )
        )
        included_planets.add(planet_name)

    for planet_name in bundle.dominant_planets:
        _append_planet_candidate(planet_name)

    # Ensure Saturn / Pluto are always included
    for planet_name in ("Saturn", "Pluto"):
        if planet_name not in included_planets:
            _append_planet_candidate(planet_name)

    for stellium in bundle.stelliums:
        sign = str(stellium.get("sign_ja", "") or "")
        house = str(stellium.get("house", "") or "")
        sign_norm = normalize_sign_name(sign)
        members = list(stellium.get("members", []) or [])
        count = int(stellium.get("count", len(members)) or 0)
        strength = str(stellium.get("strength", "") or "")
        strength_bonus = {"strong": 25.0, "loose": 15.0, "unknown": 10.0}.get(
            strength, 10.0
        )
        house_label = f"{house}ハウス" if house else ""
        label = f"{sign_norm}{house_label}ステリウム"
        summary = "ステリウム配置です。"
        main_text = ""
        stellium_row = get_stellium_theme_row(sign_norm, house, count, ctx)
        theme_id = f"stellium:{sign_norm}:{house}"
        if stellium_row:
            theme_id = clean_text(stellium_row.get("theme_id")) or theme_id
            label = clean_text(stellium_row.get("label")) or label
            row_summary = clean_text(stellium_row.get("summary"))
            row_main = clean_text(stellium_row.get("main_text"))
            row_count_min = int(clean_text(stellium_row.get("count_min")) or "0")
            if (count == 4 and row_count_min < 4) or count >= 5:
                row_summary = strengthen_stellium_text(row_summary, count, "summary")
                row_main = strengthen_stellium_text(row_main, count, "main_text")
            main_text = row_main or main_text
            summary = row_summary or summary
        if not summary and main_text:
            summary = main_text

        candidates.append(
            CoreTheme(
                theme_id=theme_id,
                label=label,
                summary=summary,
                source_type="stellium",
                source_keys=[f"stellium:{sign_norm}:{house}"],
                score=(count * 20.0) + strength_bonus,
                role="main",
                tags=[tag for tag in (sign_norm, house, "stellium") if tag],
                houses=[house] if house else [],
                planets=[getattr(member, "name_en", "") for member in members if getattr(member, "name_en", "")],
            )
        )

    node_evidence = bundle.node_evidence
    if node_evidence is not None:
        north_node = node_evidence.north_node
        south_node = node_evidence.south_node
        summary = (
            _select_text_from_text_set(node_evidence.axis_text_set)
            or _select_text_from_text_set(node_evidence.north_text_set)
            or node_evidence.axis_text
            or node_evidence.north_text
        )
        tags = ["node", "growth"]
        houses: List[str] = []
        planets: List[str] = []

        for node in (north_node, south_node):
            if node is None:
                continue
            tags.append(normalize_sign_name(node.sign_ja))
            if node.house:
                tags.append(node.house)
                houses.append(node.house)
            planets.append(node.name_en)

        theme_id = _resolve_node_direction_theme_id(node_evidence, ctx) or "node:axis"
        direction_row = get_conflict_direction_row(theme_id, ctx) if theme_id else None
        node_row = get_node_theme_row(theme_id, ctx) if theme_id else None
        row = direction_row or node_row
        if direction_row:
            summary = clean_text(direction_row.get("summary")) or summary
        elif node_row:
            summary = clean_text(node_row.get("summary")) or summary

        candidates.append(
            CoreTheme(
                theme_id=theme_id,
                label=clean_text(row.get("label")) if row else "ノード軸",
                summary=summary or (clean_text(row.get("summary")) if row else "ノード配置です。"),
                source_type="node",
                source_keys=["node:axis"],
                score=85.0,
                role="direction",
                tags=tags,
                houses=houses,
                planets=planets,
            )
        )

    for pattern_type, pattern_list in bundle.patterns_by_type.items():
        for pattern in pattern_list:
            members = [member for member in getattr(pattern, "members", ()) if member]
            apex = getattr(pattern, "apex", "") or ""
            if pattern_type in {"t_square", "yod"}:
                role = "conflict"
            elif pattern_type in {"grand_trine", "kite"}:
                role = "support"
            else:
                role = "support"

            summary = ""
            member_key = ",".join(members)
            source_key = f"pattern:{pattern_type}:{member_key}:{apex}"
            theme_id = _resolve_pattern_conflict_theme_id(pattern_type, ctx) or source_key
            pattern_row = get_conflict_direction_row(theme_id, ctx) if theme_id != source_key else None
            if not pattern_row:
                pattern_row = _resolve_pattern_theme_row(pattern_type, ctx)
            if not pattern_row:
                pattern_row = get_pattern_theme_row(pattern_type, "", ctx)
            label = clean_text(pattern_row.get("label")) if pattern_row else _pattern_label(pattern_type, ctx)
            summary = clean_text(pattern_row.get("summary")) or summary if pattern_row else _build_pattern_summary(pattern_type, members, apex, ctx)

            candidates.append(
                CoreTheme(
                    theme_id=theme_id,
                    label=label,
                    summary=summary,
                    source_type="pattern",
                    source_keys=[source_key],
                    score=float(getattr(pattern, "score", 0.0)),
                    role=clean_text(pattern_row.get("role")) or role if pattern_row else role,
                    tags=[pattern_type, "pattern"],
                    planets=members,
                )
            )

    return candidates


def _select_planet_summary(evidence: object) -> str:
    """Pick the best available one-line summary for a planet-derived theme."""
    return _select_text_from_text_set(getattr(evidence, "text_set", None))


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


def _pattern_label(pattern_type: str, ctx: object | None = None) -> str:
    """Return a short label for a pattern-derived theme."""
    row = get_pattern_theme_row(pattern_type, "", ctx) if ctx else None
    return clean_text(row.get("label")) if row else pattern_type


def _build_pattern_summary(
    pattern_type: str, members: Sequence[str], apex: str, ctx: object | None = None
) -> str:
    """Build a short natural-language summary for a pattern-derived theme."""
    row = get_pattern_theme_row(pattern_type, "", ctx) if ctx else None
    summary = clean_text(row.get("summary")) if row else ""
    if summary:
        return summary
    _ = members
    _ = apex
    return ""


def _resolve_pattern_theme_row(pattern_type: str, ctx: object | None) -> Optional[dict]:
    # TODO: pattern_theme.csv 参照を追加
    return get_pattern_theme_row(pattern_type, "", ctx) if ctx else None


def suppress_overlaps(
    candidates: Sequence[CoreTheme],
    selected_theme: Optional[CoreTheme],
) -> List[CoreTheme]:
    """Remove candidates that conflict with the already selected theme."""
    if selected_theme is None:
        return list(candidates)

    remaining: List[CoreTheme] = []

    for candidate in candidates:
        if candidate.theme_id == selected_theme.theme_id:
            continue
        if _should_suppress_candidate(candidate, selected_theme):
            continue
        remaining.append(candidate)

    return remaining


def collect_suppressed_theme_ids(
    candidates: Sequence[CoreTheme],
    selected_theme: Optional[CoreTheme],
) -> List[str]:
    """Return theme ids that would be suppressed by the selected theme."""
    if selected_theme is None:
        return []

    suppressed: List[str] = []
    for candidate in candidates:
        if candidate.theme_id == selected_theme.theme_id:
            continue
        if _should_suppress_candidate(candidate, selected_theme):
            suppressed.append(candidate.theme_id)
    return suppressed


def select_best(
    candidates: Sequence[CoreTheme],
    role: str,
    prefer_types: Optional[Iterable[str]] = None,
    exclude_types: Optional[Iterable[str]] = None,
) -> Optional[CoreTheme]:
    """Pick the best candidate for a role with optional source-type preferences."""
    filtered = [candidate for candidate in candidates if candidate.role == role]

    exclude_type_set = set(exclude_types or [])
    if exclude_type_set:
        filtered = [
            candidate
            for candidate in filtered
            if candidate.source_type not in exclude_type_set
        ]

    prefer_type_set = set(prefer_types or [])
    preferred = [
        candidate for candidate in filtered if candidate.source_type in prefer_type_set
    ]
    pool = preferred or filtered

    if not pool:
        return None

    return max(pool, key=lambda candidate: candidate.score)


def select_core_themes(bundle: ChartEvidenceBundle, ctx: object | None = None) -> NarrativePlan:
    """Select the core narrative themes from theme candidates."""
    candidates = build_theme_candidates(bundle, ctx=ctx)
    if not candidates:
        return NarrativePlan()

    main_candidates = [
        candidate for candidate in candidates if candidate.source_type != "node"
    ]
    main_theme = select_best(
        main_candidates,
        role="main",
        prefer_types=("stellium",),
        exclude_types=("node",),
    )
    if main_theme is None and main_candidates:
        main_theme = max(main_candidates, key=lambda candidate: candidate.score)

    remaining_after_main = suppress_overlaps(candidates, main_theme)

    conflict_candidates = [
        candidate
        for candidate in remaining_after_main
        if (not main_theme or candidate.theme_id != main_theme.theme_id)
        and getattr(candidate, "role", "") == "conflict"
    ]
    def _conflict_priority_score(candidate: CoreTheme) -> float:
        score = float(getattr(candidate, "score", 0.0))
        tags = set(getattr(candidate, "tags", []) or [])
        planets = set(getattr(candidate, "planets", []) or [])
        if candidate.source_type == "pattern" and {"t_square", "yod"} & tags:
            score += 100.0
        if "Saturn" in planets:
            score += 80.0
        if "Pluto" in planets:
            score += 70.0
        return score

    def _is_priority_conflict(candidate: CoreTheme) -> bool:
        tags = set(getattr(candidate, "tags", []) or [])
        planets = set(getattr(candidate, "planets", []) or [])
        if candidate.source_type == "pattern" and {"t_square", "yod"} & tags:
            return True
        return bool({"Saturn", "Pluto"} & planets)

    def _is_mercury_mars_only(candidate: CoreTheme) -> bool:
        planets = set(getattr(candidate, "planets", []) or [])
        return bool(planets) and planets.issubset({"Mercury", "Mars"})

    conflict_theme = None
    priority_conflicts = [c for c in conflict_candidates if _is_priority_conflict(c)]
    if priority_conflicts:
        conflict_theme = max(priority_conflicts, key=_conflict_priority_score)
    else:
        non_short_term = [c for c in conflict_candidates if not _is_mercury_mars_only(c)]
        if non_short_term:
            conflict_theme = max(non_short_term, key=_conflict_priority_score)

    remaining_after_conflict = suppress_overlaps(remaining_after_main, conflict_theme)

    direction_priority = [
        candidate
        for candidate in remaining_after_conflict
        if candidate.source_type == "node" or candidate.theme_id == "node:axis"
    ]
    direction_theme = None
    if direction_priority:
        direction_theme = max(direction_priority, key=lambda candidate: candidate.score)
    else:
        growth_candidates = [
            candidate
            for candidate in remaining_after_conflict
            if _has_direction_signal(candidate)
        ]
        if growth_candidates:
            direction_theme = max(
                growth_candidates, key=lambda candidate: candidate.score
            )
        else:
            fallback_direction = [
                candidate
                for candidate in remaining_after_conflict
                if not main_theme or candidate.theme_id != main_theme.theme_id
            ]
            if fallback_direction:
                direction_theme = max(
                    fallback_direction, key=lambda candidate: candidate.score
                )

    if main_theme is None:
        main_theme = next(
            (candidate for candidate in candidates if candidate.source_type != "node"),
            candidates[0],
        )

    if conflict_theme is None:
        fallback_conflict = [
            candidate
            for candidate in candidates
            if candidate.theme_id != main_theme.theme_id
        ]
        if fallback_conflict:
            conflict_theme = max(
                fallback_conflict, key=lambda candidate: candidate.score
            )

    if direction_theme is None:
        fallback_direction = [
            candidate
            for candidate in candidates
            if candidate.theme_id not in {
                main_theme.theme_id,
                conflict_theme.theme_id if conflict_theme else "",
            }
        ]
        if fallback_direction:
            direction_theme = max(
                fallback_direction, key=lambda candidate: candidate.score
            )
        elif candidates:
            direction_theme = candidates[0]

    return NarrativePlan(
        core_themes=candidates,
        main_theme=main_theme,
        conflict_theme=conflict_theme,
        direction_theme=direction_theme,
        support_themes=[],
    )


def build_narrative_plan(bundle: ChartEvidenceBundle, ctx: object) -> NarrativePlan:
    """Build a narrative plan from evidence and surrounding chart context."""
    plan = select_core_themes(bundle, ctx=ctx)
    plan.main_theme = _enrich_main_theme(plan.main_theme, ctx)
    plan.conflict_theme = _enrich_conflict_theme(plan.conflict_theme, ctx)
    plan.direction_theme = _enrich_direction_theme(plan.direction_theme, ctx)
    enriched: List[CoreTheme] = []
    for theme in plan.core_themes:
        if getattr(theme, "role", "") == "main":
            enriched.append(_enrich_main_theme(theme, ctx) or theme)
        elif getattr(theme, "role", "") == "conflict":
            enriched.append(_enrich_conflict_theme(theme, ctx) or theme)
        elif getattr(theme, "role", "") == "direction":
            enriched.append(_enrich_direction_theme(theme, ctx) or theme)
        else:
            enriched.append(theme)
    plan.core_themes = enriched
    return plan


def _resolve_planet_conflict_theme_id(evidence: object, ctx: object | None) -> str:
    planet_name = clean_text(getattr(getattr(evidence, "planet", None), "name_en", "")).lower()
    house = clean_text(getattr(getattr(evidence, "planet", None), "house", ""))
    if planet_name not in {"saturn", "pluto"} or not house:
        return ""
    return _find_conflict_direction_theme_id_by_prefix(f"{planet_name}_{house}h_", "conflict", ctx)


def _resolve_node_direction_theme_id(node_evidence: object, ctx: object | None) -> str:
    north_node = getattr(node_evidence, "north_node", None)
    sign_en = clean_text(getattr(north_node, "sign_en", "")).lower()
    house = clean_text(getattr(north_node, "house", ""))
    if not sign_en or not house:
        return ""
    theme_id = f"node_{sign_en}_{house}h_direction"
    row = get_conflict_direction_row(theme_id, ctx)
    if row and clean_text(row.get("role")) == "direction":
        return theme_id
    return ""


def _resolve_pattern_conflict_theme_id(pattern_type: str, ctx: object | None) -> str:
    mapping = {
        "t_square": "t_square_core_conflict",
        "yod": "yod_core_conflict",
    }
    theme_id = mapping.get(pattern_type, "")
    row = get_conflict_direction_row(theme_id, ctx) if theme_id else None
    if row and clean_text(row.get("role")) == "conflict":
        return theme_id
    return ""


def _find_conflict_direction_theme_id_by_prefix(prefix: str, role: str, ctx: object | None) -> str:
    index = getattr(ctx, "conflict_direction_index", {}) if ctx is not None else {}
    if not isinstance(index, dict):
        return ""
    for theme_id in sorted(index.keys()):
        row = index.get(theme_id)
        if (
            isinstance(row, dict)
            and str(theme_id).startswith(prefix)
            and clean_text(row.get("role")) == role
        ):
            return str(theme_id)
    return ""


def _apply_theme_row(theme: Optional[CoreTheme], row: Optional[dict]) -> Optional[CoreTheme]:
    if theme is None or not isinstance(row, dict):
        return theme
    theme.label = clean_text(row.get("label")) or theme.label
    theme.summary = clean_text(row.get("summary")) or theme.summary
    theme.section2_text = clean_text(row.get("section2_text"))
    theme.section5_text = clean_text(row.get("section5_text"))
    theme.section8_text = clean_text(row.get("section8_text"))
    theme.strength_text = clean_text(row.get("strength_text"))
    theme.caution_text = clean_text(row.get("caution_text"))
    theme.growth_text = clean_text(row.get("growth_text"))
    theme.problem_text = clean_text(row.get("problem_text"))
    row_tags = _parse_theme_tags(row.get("tags"))
    if row_tags:
        theme.tags = list({*theme.tags, *row_tags})
    return theme


def _parse_theme_tags(value: object) -> List[str]:
    text = clean_text(value)
    if not text:
        return []
    normalized = text.replace("、", ",").replace("/", ",")
    tags = [tag.strip() for tag in normalized.split(",") if tag.strip()]
    normalized_tags: List[str] = []
    for tag in tags:
        tag = normalize_sign_name(tag)
        tag = normalize_planet_name(tag)
        normalized_tags.append(tag)
    return normalized_tags


def _enrich_main_theme(theme: Optional[CoreTheme], ctx: object | None) -> Optional[CoreTheme]:
    row = get_core_theme_row(getattr(theme, "theme_id", ""), ctx) if theme else None
    return _apply_theme_row(theme, row)


def _enrich_conflict_theme(theme: Optional[CoreTheme], ctx: object | None) -> Optional[CoreTheme]:
    row = get_conflict_direction_row(getattr(theme, "theme_id", ""), ctx) if theme else None
    if row and clean_text(row.get("role")) == "conflict":
        return _apply_theme_row(theme, row)
    return theme


def _enrich_direction_theme(theme: Optional[CoreTheme], ctx: object | None) -> Optional[CoreTheme]:
    row = get_conflict_direction_row(getattr(theme, "theme_id", ""), ctx) if theme else None
    if row and clean_text(row.get("role")) == "direction":
        return _apply_theme_row(theme, row)
    return theme


def _is_conflict_priority_theme(candidate: CoreTheme) -> bool:
    """Return True when a theme should be prioritized for the conflict slot."""
    if candidate.source_type == "pattern" and (
        "t_square" in candidate.tags or "yod" in candidate.tags
    ):
        return True

    planet_set = set(candidate.planets)
    tag_set = set(candidate.tags)
    return bool({"Saturn", "Pluto"} & planet_set) or bool(
        {"Saturn", "Pluto", "土星", "冥王星"} & tag_set
    )


def _has_direction_signal(candidate: CoreTheme) -> bool:
    """Return True when a theme looks suitable for the direction slot."""
    if candidate.theme_id == "node:axis":
        return True

    lowered_tags = {tag.lower() for tag in candidate.tags}
    if "growth" in lowered_tags:
        return True

    return "MC" in candidate.planets or "MC" in candidate.tags


def _should_suppress_candidate(
    candidate: CoreTheme, selected_theme: CoreTheme
) -> bool:
    """Return True when a candidate is too semantically close to the selected one."""
    if candidate.theme_id == selected_theme.theme_id:
        return True

    suppressed_keys = set(selected_theme.suppress_keys)
    selected_source_keys = set(selected_theme.source_keys)
    if suppressed_keys.intersection(candidate.source_keys):
        return True
    if set(candidate.suppress_keys).intersection(selected_source_keys):
        return True

    if (
        selected_theme.source_type == "stellium"
        and candidate.source_type == "planet"
        and set(candidate.planets).intersection(selected_theme.planets)
    ):
        return True

    if (
        candidate.source_type == "stellium"
        and selected_theme.source_type == "planet"
        and set(candidate.planets).intersection(selected_theme.planets)
    ):
        return True

    overlap = _compute_overlap_stats(candidate, selected_theme)
    if overlap["tags"] >= TAG_OVERLAP_THRESHOLD and overlap["planets"] >= 1:
        return True
    if (
        overlap["houses"] >= HOUSE_OVERLAP_THRESHOLD
        and overlap["planets"] >= PLANET_OVERLAP_THRESHOLD
    ):
        return True
    if overlap["score"] >= OVERLAP_SCORE_THRESHOLD:
        return True

    return False


def _compute_overlap_stats(
    candidate: CoreTheme, selected_theme: CoreTheme
) -> dict[str, int]:
    """Compute overlap counts across tags, houses, and planets."""
    candidate_tags = set(candidate.tags)
    selected_tags = set(selected_theme.tags)
    candidate_houses = set(candidate.houses)
    selected_houses = set(selected_theme.houses)
    candidate_planets = set(candidate.planets)
    selected_planets = set(selected_theme.planets)

    tag_overlap = len(candidate_tags.intersection(selected_tags))
    house_overlap = len(candidate_houses.intersection(selected_houses))
    planet_overlap = len(candidate_planets.intersection(selected_planets))

    return {
        "tags": tag_overlap,
        "houses": house_overlap,
        "planets": planet_overlap,
        "score": tag_overlap + (house_overlap * 2) + (planet_overlap * 2),
    }
