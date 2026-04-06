from io_utils import clean_text, compact_texts
from models import NarrativeBundle, NarrativePlan, NarrativeSectionPlan


def build_integrated_life_story_v3(
    summary_bundle: dict,
    has_birth_time: bool = True,
    ctx: object | None = None,
    narrative_plan: NarrativePlan | None = None,
    narrative_section_plan: NarrativeSectionPlan | None = None,
    narrative_bundle: NarrativeBundle | None = None,
) -> str:
    lines = ["【第8章：総括・人生のテーマと課題の統合】", ""]

    summary_evidence = summary_bundle.get("summary_evidence")
    _ = has_birth_time
    _ = ctx

    main_axis_is_stellium = bool(
        narrative_bundle and narrative_bundle.primary_stellium_key
    )
    stellium_payload = (
        narrative_section_plan.stellium_payload
        if narrative_section_plan and main_axis_is_stellium
        else {}
    )
    stellium_texts = (
        narrative_section_plan.stellium_section_texts
        if narrative_section_plan and main_axis_is_stellium
        else {}
    )
    sec7_blocks = narrative_section_plan.section7_blocks if narrative_section_plan else {}
    sec7_core = clean_text(sec7_blocks.get("core", ""))
    sec7_integration = clean_text(sec7_blocks.get("integration", ""))

    theme_lines = []
    strength_lines = []
    challenge_lines = []
    growth_lines = []

    if narrative_plan and narrative_plan.main_theme:
        summary_line = clean_text(
            stellium_payload.get("summary", "")
            if main_axis_is_stellium
            else getattr(narrative_plan.main_theme, "summary", "")
        )
        section8_line = clean_text(
            stellium_texts.get("sec8", "")
            if main_axis_is_stellium
            else getattr(narrative_plan.main_theme, "section8_text", "")
        )
        if summary_line:
            theme_lines.append(summary_line)
        if section8_line and section8_line != summary_line:
            theme_lines.append(section8_line)
        strength_text = clean_text(getattr(narrative_plan.main_theme, "strength_text", ""))
        if strength_text:
            strength_lines.append(strength_text)

    if narrative_plan and narrative_plan.conflict_theme:
        conflict_line = clean_text(getattr(narrative_plan.conflict_theme, "section8_text", ""))
        if conflict_line and conflict_line == sec7_core:
            conflict_line = ""
        if not conflict_line:
            conflict_line = clean_text(getattr(narrative_plan.conflict_theme, "summary", ""))
        if conflict_line:
            challenge_lines.append(conflict_line)

    if narrative_plan and narrative_plan.direction_theme:
        direction_line = clean_text(getattr(narrative_plan.direction_theme, "section8_text", ""))
        if direction_line and direction_line == sec7_integration:
            direction_line = ""
        if not direction_line:
            direction_line = clean_text(getattr(narrative_plan.direction_theme, "summary", ""))
        if direction_line:
            growth_lines.append(direction_line)

    if summary_evidence:
        if not theme_lines:
            theme_lines.extend(summary_evidence.theme_texts)
        if not strength_lines:
            strength_lines.extend(summary_evidence.strength_texts[:2])
        if not challenge_lines:
            challenge_lines.extend(summary_evidence.challenge_texts)
        if not growth_lines:
            growth_lines.extend(summary_evidence.growth_texts)

    if theme_lines:
        lines.append("■ 人生テーマ")
        lines.extend(compact_texts(theme_lines, limit=2))
        lines.append("")
    if strength_lines:
        lines.append("■ 強み")
        lines.extend(compact_texts(strength_lines, limit=2))
        lines.append("")
    if challenge_lines:
        lines.append("■ 課題")
        lines.extend(compact_texts(challenge_lines, limit=2))
        lines.append("")
    if growth_lines:
        lines.append("■ 成熟方向")
        lines.extend(compact_texts(growth_lines, limit=2))
        lines.append("")

    return "\n".join(lines).strip()
