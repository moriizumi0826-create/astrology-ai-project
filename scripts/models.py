from dataclasses import dataclass, field
from typing import Optional, List, Tuple, Dict, Any

@dataclass
class PlanetData:
    name_en: str
    name_ja: str
    sign_en: str
    sign_ja: str
    house: str = ""
    retrograde: str = ""
    degree: str = ""
    kind: str = "planet"
    priority: int = 50
    
    @property
    def has_house(self) -> bool:
        return bool(self.house)

@dataclass
class AngleData:
    name_en: str
    name_ja: str
    sign_en: str
    sign_ja: str
    kind: str = "angle"
    priority: int = 50

@dataclass
class AspectData:
    planet1_en: str
    planet2_en: str
    planet1_ja: str
    planet2_ja: str
    aspect_en: str
    aspect_ja: str
    orb: str = ""
    priority: int = 50

    @property
    def orb_value(self) -> float:
        try:
            return float(self.orb)
        except ValueError:
            return 999.0

@dataclass
class NodeData:
    name_en: str
    name_ja: str
    sign_en: str
    sign_ja: str
    house: str = ""
    priority: int = 50

@dataclass
class ChartContext:
    has_birth_time: bool = False
    has_house_data: bool = False
    has_nodes: bool = False
    has_node_house: bool = False
    element_scores: dict = field(default_factory=dict)
    modality_scores: dict = field(default_factory=dict)
    stelliums: list = field(default_factory=list)
    patterns: list = field(default_factory=list)
    ruler_positions: list = field(default_factory=list)
    core_theme_index: Dict[str, Dict[str, str]] = field(default_factory=dict)
    conflict_direction_index: Dict[str, Dict[str, str]] = field(default_factory=dict)
    stellium_theme_index: Dict[Tuple[str, str], List[Dict[str, str]]] = field(default_factory=dict)
    pattern_theme_index: Dict[Any, Dict[str, str]] = field(default_factory=dict)
    aspect_theme_index: Dict[Tuple[str, ...], Dict[str, str]] = field(default_factory=dict)
    aspect_usage_index: Dict[str, Dict[str, str]] = field(default_factory=dict)
    career_axis_index: Dict[str, Dict[str, str]] = field(default_factory=dict)
    hemisphere_axis_index: Dict[Tuple[str, str], Dict[str, str]] = field(default_factory=dict)
    node_theme_index: Dict[str, Dict[str, str]] = field(default_factory=dict)
    house_master_index: Dict[str, Dict[str, Any]] = field(default_factory=dict)

@dataclass
class PlanetStrength:
    planet: PlanetData
    base_priority: float
    ruler_bonus: float = 0.0
    angle_house_bonus: float = 0.0
    dignity_bonus: float = 0.0
    retrograde_adjust: float = 0.0
    aspect_bonus: float = 0.0
    node_bonus: float = 0.0
    stellium_bonus: float = 0.0
    pattern_bonus: float = 0.0
    final_score: float = 0.0
    reasons: List[str] = field(default_factory=list)

@dataclass
class PatternStrength:
    pattern_type: str
    members: Tuple[str, ...]
    score: float
    apex: str = ""
    reasons: List[str] = field(default_factory=list)

@dataclass
class ChartDominanceProfile:
    dominant_planets: List[PlanetStrength]
    dominant_elements: List[Tuple[str, float]]
    dominant_modalities: List[Tuple[str, float]]
    dominant_houses: List[Tuple[str, int]]
    dominant_axes: List[str]
    dominant_patterns: List[PatternStrength]
    dominant_nodes: List[str]

@dataclass
class TextEvidence:
    source: str
    key: str
    text: str
    priority: float = 0.0

@dataclass
class FieldTextSet:
    theme: str = ""
    core: str = ""
    strengths: List[str] = field(default_factory=list)
    cautions: List[str] = field(default_factory=list)
    relationship: List[str] = field(default_factory=list)
    work: List[str] = field(default_factory=list)
    growth: List[str] = field(default_factory=list)
    summary: str = ""
    interpretation: str = ""

@dataclass
class PlanetEvidence:
    planet: PlanetData
    text_set: FieldTextSet = field(default_factory=FieldTextSet)
    sign_house_text: str = ""
    sign_text: str = ""
    house_text: str = ""
    aspect_texts: List[TextEvidence] = field(default_factory=list)
    node_texts: List[TextEvidence] = field(default_factory=list)
    pattern_texts: List[TextEvidence] = field(default_factory=list)
    ruler_texts: List[TextEvidence] = field(default_factory=list)
    dominance_score: float = 0.0
    dominance_rank: int = 0
    final_dispositor: bool = False
    is_unaspected: bool = False

@dataclass
class AngleEvidence:
    angle: AngleData
    text_set: FieldTextSet = field(default_factory=FieldTextSet)
    angle_text: str = ""
    ruler_evidences: List[PlanetEvidence] = field(default_factory=list)

@dataclass
class NodeEvidence:
    north_node: Optional[NodeData] = None
    south_node: Optional[NodeData] = None
    north_text_set: FieldTextSet = field(default_factory=FieldTextSet)
    south_text_set: FieldTextSet = field(default_factory=FieldTextSet)
    axis_text_set: FieldTextSet = field(default_factory=FieldTextSet)
    north_text: str = ""
    south_text: str = ""
    axis_text: str = ""
    related_aspects: List[TextEvidence] = field(default_factory=list)

@dataclass
class AspectEvidence:
    aspect: AspectData
    text_set: FieldTextSet = field(default_factory=FieldTextSet)
    priority: float = 0.0

@dataclass
class CareerEvidence:
    mc: Optional[AngleEvidence] = None
    jupiter: Optional[PlanetEvidence] = None
    house_2_texts: List[TextEvidence] = field(default_factory=list)
    house_6_texts: List[TextEvidence] = field(default_factory=list)
    house_10_texts: List[TextEvidence] = field(default_factory=list)
    linked_themes: List[str] = field(default_factory=list)
    work_texts: List[str] = field(default_factory=list)
    summary_texts: List[str] = field(default_factory=list)

@dataclass
class SummaryEvidence:
    theme_texts: List[str] = field(default_factory=list)
    strength_texts: List[str] = field(default_factory=list)
    challenge_texts: List[str] = field(default_factory=list)
    growth_texts: List[str] = field(default_factory=list)
    summary_texts: List[str] = field(default_factory=list)

@dataclass
class ChartEvidenceBundle:
    planet_map: Dict[str, PlanetEvidence]
    angle_map: Dict[str, AngleEvidence]
    node_evidence: Optional[NodeEvidence] = None
    career_evidence: Optional[CareerEvidence] = None
    pattern_evidences: List[TextEvidence] = field(default_factory=list)
    psychology_evidences: List[TextEvidence] = field(default_factory=list)
    aspect_evidences: List[AspectEvidence] = field(default_factory=list)
    summary_evidence: SummaryEvidence = field(default_factory=SummaryEvidence)
    dominant_planets: List[str] = field(default_factory=list)
    final_dispositor_name: str = ""
    chart_profile: Optional[ChartDominanceProfile] = None
    patterns_by_type: Dict[str, List[PatternStrength]] = field(default_factory=dict)
    stelliums: List[Dict[str, Any]] = field(default_factory=list)

@dataclass
class CoreTheme:
    theme_id: str
    label: str
    summary: str
    source_type: str
    source_keys: List[str]
    score: float
    role: str
    tags: List[str] = field(default_factory=list)
    houses: List[str] = field(default_factory=list)
    planets: List[str] = field(default_factory=list)
    suppress_keys: List[str] = field(default_factory=list)
    section2_text: str = ""
    section5_text: str = ""
    section8_text: str = ""
    strength_text: str = ""
    caution_text: str = ""
    growth_text: str = ""
    problem_text: str = ""

@dataclass
class NarrativePlan:
    core_themes: List[CoreTheme] = field(default_factory=list)
    main_theme: Optional[CoreTheme] = None
    conflict_theme: Optional[CoreTheme] = None
    direction_theme: Optional[CoreTheme] = None
    support_themes: List[CoreTheme] = field(default_factory=list)

@dataclass
class NarrativeAxis:
    theme_id: str = ""
    role: str = ""
    source_type: str = ""
    score: float = 0.0

@dataclass
class NarrativeBundle:
    main_axis_theme_id: str = ""
    core_theme_id: str = ""
    conflict_theme_id: str = ""
    direction_theme_id: str = ""
    primary_stellium_key: str = ""
    support_theme_ids: List[str] = field(default_factory=list)
    suppressed_theme_ids: List[str] = field(default_factory=list)

@dataclass
class NarrativeSectionPlan:
    main_axis: Optional[NarrativeAxis] = None
    core_theme: Optional[NarrativeAxis] = None
    conflict_theme: Optional[NarrativeAxis] = None
    direction_theme: Optional[NarrativeAxis] = None
    support_themes: List[NarrativeAxis] = field(default_factory=list)
    main_axis_theme_id: str = ""
    main_axis_source_type: str = ""
    stellium_payload: Dict[str, str] = field(default_factory=dict)
    stellium_section_texts: Dict[str, str] = field(default_factory=dict)
    career_axis_selection: Optional["CareerAxisSelection"] = None
    career_axis_row: Dict[str, str] = field(default_factory=dict)
    section6_blocks: Dict[str, str] = field(default_factory=dict)
    core_personality_blocks: Dict[str, str] = field(default_factory=dict)
    section7_plan: Optional["Section7Plan"] = None
    section7_blocks: Dict[str, Any] = field(default_factory=dict)
    allow_short_term_conflict: Dict[str, bool] = field(default_factory=dict)
    allow_growth_theme: Dict[str, bool] = field(default_factory=dict)
    allow_node_usage: Dict[str, bool] = field(default_factory=dict)

@dataclass
class CareerAxisSelection:
    career_id: str = ""
    mc_sign: str = ""
    mc_ruler: str = ""
    dominant_house_axis: str = ""
    jupiter_house: str = ""
    linked_theme_ids: List[str] = field(default_factory=list)
    main_work_tags: List[str] = field(default_factory=list)

@dataclass
class Section7AspectItem:
    aspect_key: str = ""
    role: str = ""
    priority: str = ""
    section7_summary: str = ""
    selected_column: str = ""
    source_row: Dict[str, Any] = field(default_factory=dict)
    conflict_weight: float = 0.0
    support_weight: float = 0.0
    direction_weight: float = 0.0
    source_theme_ids: List[str] = field(default_factory=list)

@dataclass
class Section7Plan:
    core_conflict_theme_id: str = ""
    conflict_summary: str = ""
    reinforcing_items: List[Section7AspectItem] = field(default_factory=list)
    core_item: Optional[Section7AspectItem] = None
    factor_items: List[Section7AspectItem] = field(default_factory=list)
    direction_item: Optional[Section7AspectItem] = None
    support_item: Optional[Section7AspectItem] = None
    integration_hint: str = ""
    suppressed_aspect_keys: List[str] = field(default_factory=list)
    section7_blocks: Dict[str, Any] = field(default_factory=dict)

@dataclass
class IntegratedReading:
    chart_profile: Optional[ChartDominanceProfile]
    section1: Dict[str, Any] = field(default_factory=dict)
    section2: Dict[str, Any] = field(default_factory=dict)
    section3: Dict[str, Any] = field(default_factory=dict)
    section4: Dict[str, Any] = field(default_factory=dict)
    section5: Dict[str, Any] = field(default_factory=dict)
    section6: Dict[str, Any] = field(default_factory=dict)
    section7: Dict[str, Any] = field(default_factory=dict)
    section8: Dict[str, Any] = field(default_factory=dict)
    narrative_plan: Optional[NarrativePlan] = None
    narrative_bundle: Optional[NarrativeBundle] = None
    narrative_section_plan: Optional[NarrativeSectionPlan] = None
