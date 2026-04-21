from pathlib import Path
import sys

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from config import (
    PLANET_SIGN_HOUSE_REL,
    PLANET_SIGN_REL,
    PLANET_HOUSE_REL,
    ANGLE_SIGN_REL,
    ASPECT_MASTER_REL,
    PLANET_MASTER_REL,
    SIGN_MASTER_REL,
    HOUSE_MASTER_REL,
    MOTION_MASTER_REL,
    ASPECT_TYPE_MASTER_REL,
    NODE_AXIS_REL,
    NODE_SIGN_HOUSE_REL,
    CORE_THEME_CSV,
    CONFLICT_DIRECTION_CSV,
    STELLIUM_THEME_CSV,
    PATTERN_THEME_CSV,
    ASPECT_TO_THEME_CSV,
    CAREER_AXIS_CSV,
    HEMISPHERE_AXIS_CSV,
    NODE_THEME_CSV,
    OUTPUT_FILE_PATH,
)
from io_utils import ensure_output_dir, read_csv_rows, resolve_existing_path
from master_index import (
    build_angle_sign_index,
    build_aspect_index,
    build_aspect_type_index,
    build_aspect_theme_index,
    build_aspect_usage_index,
    build_career_axis_index,
    build_conflict_direction_index,
    build_core_theme_index,
    build_hemisphere_axis_index,
    build_house_master_index,
    build_motion_master_index,
    build_node_axis_index,
    build_node_sign_house_index,
    build_node_theme_index,
    build_pattern_theme_index,
    build_planet_house_index,
    build_planet_master_index,
    build_planet_sign_house_index,
    build_planet_sign_index,
    build_sign_master_index,
    build_stellium_theme_index,
    infer_has_birth_time,
    infer_has_house_data,
    infer_has_node_house,
    infer_has_nodes,
    load_angles,
    load_aspects,
    load_nodes,
    load_planets,
)
from models import ChartContext
from evidence_builder import build_chart_evidence_bundle
from analysis import integrate_chart_evidence
from selection import build_narrative_plan
from narrative import build_narrative_bundle, build_narrative_section_plan
from rendering import render_full_reading_v3 as render_full_reading


def _read_optional_csv_rows(relative_path: str):
    try:
        path = resolve_existing_path(relative_path)
    except FileNotFoundError:
        return []
    try:
        return read_csv_rows(path)
    except Exception:
        return []


def _build_master_indices() -> dict:
    psh_path = resolve_existing_path(PLANET_SIGN_HOUSE_REL)
    ps_path = resolve_existing_path(PLANET_SIGN_REL)
    ph_path = resolve_existing_path(PLANET_HOUSE_REL)
    angle_sign_path = resolve_existing_path(ANGLE_SIGN_REL)
    aspect_master_path = resolve_existing_path(ASPECT_MASTER_REL)
    planet_master_path = resolve_existing_path(PLANET_MASTER_REL)
    sign_master_path = resolve_existing_path(SIGN_MASTER_REL)
    house_master_path = resolve_existing_path(HOUSE_MASTER_REL)
    motion_master_path = resolve_existing_path(MOTION_MASTER_REL)
    aspect_type_master_path = resolve_existing_path(ASPECT_TYPE_MASTER_REL)
    node_axis_path = resolve_existing_path(NODE_AXIS_REL)
    node_sign_house_path = resolve_existing_path(NODE_SIGN_HOUSE_REL)

    psh_rows = read_csv_rows(psh_path)
    ps_rows = read_csv_rows(ps_path)
    ph_rows = read_csv_rows(ph_path)
    angle_sign_rows = read_csv_rows(angle_sign_path)
    aspect_rows = read_csv_rows(aspect_master_path)
    planet_master_rows = read_csv_rows(planet_master_path)
    sign_master_rows = read_csv_rows(sign_master_path)
    house_master_rows = read_csv_rows(house_master_path)
    motion_rows = read_csv_rows(motion_master_path)
    aspect_type_rows = read_csv_rows(aspect_type_master_path)
    node_axis_rows = read_csv_rows(node_axis_path)
    node_sign_house_rows = read_csv_rows(node_sign_house_path)
    core_theme_rows = _read_optional_csv_rows(CORE_THEME_CSV)
    conflict_direction_rows = _read_optional_csv_rows(CONFLICT_DIRECTION_CSV)
    stellium_theme_rows = _read_optional_csv_rows(STELLIUM_THEME_CSV)
    pattern_theme_rows = _read_optional_csv_rows(PATTERN_THEME_CSV)
    aspect_theme_rows = _read_optional_csv_rows(ASPECT_TO_THEME_CSV)
    career_axis_rows = _read_optional_csv_rows(CAREER_AXIS_CSV)
    hemisphere_axis_rows = _read_optional_csv_rows(HEMISPHERE_AXIS_CSV)
    node_theme_rows = _read_optional_csv_rows(NODE_THEME_CSV)

    return {
        "psh_index": build_planet_sign_house_index(psh_rows),
        "ps_index": build_planet_sign_index(ps_rows),
        "ph_index": build_planet_house_index(ph_rows),
        "angle_sign_index": build_angle_sign_index(angle_sign_rows),
        "aspect_index": build_aspect_index(aspect_rows),
        "planet_master_en": build_planet_master_index(planet_master_rows),
        "sign_master_en": build_sign_master_index(sign_master_rows),
        "house_master": build_house_master_index(house_master_rows),
        "motion_index": build_motion_master_index(motion_rows),
        "aspect_type_en": build_aspect_type_index(aspect_type_rows),
        "node_axis_index": build_node_axis_index(node_axis_rows),
        "node_sign_house_index": build_node_sign_house_index(node_sign_house_rows),
        "core_theme_index": build_core_theme_index(core_theme_rows),
        "conflict_direction_index": build_conflict_direction_index(conflict_direction_rows),
        "stellium_theme_index": build_stellium_theme_index(stellium_theme_rows),
        "pattern_theme_index": build_pattern_theme_index(pattern_theme_rows),
        "aspect_theme_index": build_aspect_theme_index(aspect_theme_rows),
        "aspect_usage_index": build_aspect_usage_index(aspect_theme_rows),
        "career_axis_index": build_career_axis_index(career_axis_rows),
        "hemisphere_axis_index": build_hemisphere_axis_index(hemisphere_axis_rows),
        "node_theme_index": build_node_theme_index(node_theme_rows),
    }


def generate_report_from_csvs(
    planets_file: Path,
    angles_file: Path,
    aspects_file: Path,
    output_path: Path | None = None,
) -> str:
    planets_file = Path(planets_file)
    angles_file = Path(angles_file)
    aspects_file = Path(aspects_file)
    raw_angles = load_angles(angle_input_file=angles_file)
    has_birth_time = infer_has_birth_time(raw_angles)
    planets = load_planets(has_birth_time=has_birth_time, planet_input_file=planets_file)
    angles = raw_angles if has_birth_time else []
    aspects = load_aspects(aspect_input_file=aspects_file)
    nodes = load_nodes(has_birth_time=has_birth_time, planet_input_file=planets_file)

    ctx = ChartContext()
    ctx.has_birth_time = has_birth_time
    ctx.has_house_data = infer_has_house_data(planets, has_birth_time)
    ctx.has_nodes = infer_has_nodes(nodes)
    ctx.has_node_house = infer_has_node_house(nodes)

    indices = _build_master_indices()
    ctx.core_theme_index = indices.get("core_theme_index", {}) or {}
    ctx.conflict_direction_index = indices.get("conflict_direction_index", {}) or {}
    ctx.stellium_theme_index = indices.get("stellium_theme_index", {}) or {}
    ctx.pattern_theme_index = indices.get("pattern_theme_index", {}) or {}
    ctx.aspect_theme_index = indices.get("aspect_theme_index", {}) or {}
    ctx.aspect_usage_index = indices.get("aspect_usage_index", {}) or {}
    ctx.career_axis_index = indices.get("career_axis_index", {}) or {}
    ctx.hemisphere_axis_index = indices.get("hemisphere_axis_index", {}) or {}
    ctx.node_theme_index = indices.get("node_theme_index", {}) or {}
    ctx.house_master_index = indices.get("house_master", {}) or {}

    bundle = build_chart_evidence_bundle(
        ctx=ctx,
        planets=planets,
        angles=angles,
        aspects=aspects,
        nodes=nodes,
        **indices,
    )

    narrative_plan = build_narrative_plan(bundle, ctx)
    narrative_bundle = build_narrative_bundle(bundle, narrative_plan, ctx)
    narrative_section_plan = build_narrative_section_plan(
        bundle,
        narrative_bundle,
        narrative_plan,
        ctx,
    )
    integrated = integrate_chart_evidence(
        bundle,
        ctx,
        narrative_plan=narrative_plan,
        narrative_bundle=narrative_bundle,
        narrative_section_plan=narrative_section_plan,
    )

    result_text = render_full_reading(ctx=ctx, integrated=integrated)

    if output_path is not None:
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(result_text, encoding="utf-8")

    return result_text


def main() -> None:
    ensure_output_dir()
    output_dir = OUTPUT_FILE_PATH.parent
    result_text = generate_report_from_csvs(
        planets_file=output_dir / "planets.csv",
        angles_file=output_dir / "angles.csv",
        aspects_file=output_dir / "aspects.csv",
        output_path=OUTPUT_FILE_PATH,
    )
    print("鑑定文を保存しました:", OUTPUT_FILE_PATH)
    print("----------")
    print(result_text)


if __name__ == "__main__":
    main()
