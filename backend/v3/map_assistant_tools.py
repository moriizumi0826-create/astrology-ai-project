"""Read-only chart tools. Never let the model supply positions or orb limits."""

from itertools import combinations

from pydantic import BaseModel, ConfigDict, Field
from typing import Literal

from backend.app.services.chart_calculator import ASPECT_DEFS, get_angle_diff, get_aspect


SIGN_NAMES = ('牡羊座', '牡牛座', '双子座', '蟹座', '獅子座', '乙女座',
              '天秤座', '蠍座', '射手座', '山羊座', '水瓶座', '魚座')
PLANETS = ('SUN', 'MOON', 'MERCURY', 'VENUS', 'MARS', 'JUPITER', 'SATURN',
           'URANUS', 'NEPTUNE', 'PLUTO')
NATAL_POINTS = {f'N:{name}' for name in (*PLANETS, 'ASC', 'MC')}
TRANSIT_POINTS = {f'T:{name}' for name in PLANETS}


class PlacementQuery(BaseModel):
    model_config = ConfigDict(extra='forbid')
    points: list[str] = Field(max_length=32)


class AspectQuery(PlacementQuery):
    scope: Literal['all', 'transit_natal', 'transit_transit', 'natal_natal', 'displayed']
    match: Literal['any', 'all']
    angle: Literal[0, 60, 90, 120, 150, 180] | None


def _tool(name, description, properties):
    return {'type': 'function', 'name': name, 'description': description, 'strict': True,
            'parameters': {'type': 'object', 'properties': properties,
                           'required': list(properties), 'additionalProperties': False}}


_POINTS = {'type': 'array', 'items': {'type': 'string'}, 'maxItems': 32,
           'description': 'Exact point IDs, e.g. T:MOON or N:SUN. Empty means all available points.'}
TOOLS = [
    _tool('get_chart_placements',
          'Get calculated signs, longitudes and separately named house bases at the current chart time. '
          'Null means unavailable; never substitute another house basis.', {'points': _POINTS}),
    _tool('get_chart_aspects',
          'Calculate aspects from real positions at the current chart time, regardless of display filters. '
          'For a new/full moon and the birth chart use scope=transit_natal, points=[T:SUN,T:MOON], match=any. '
          'Use match=all to check a specific pair. Zero matches is not unknown: consult complete and missing_points. '
          'displayed queries only rendered lines and may be incomplete.',
          {'scope': {'type': 'string', 'enum': ['all', 'transit_natal', 'transit_transit', 'natal_natal', 'displayed']},
           'points': _POINTS, 'match': {'type': 'string', 'enum': ['any', 'all']},
           'angle': {'type': ['integer', 'null'], 'enum': [0, 60, 90, 120, 150, 180, None],
                     'description': 'Filter by exact aspect type, or null for all configured types.'}}),
]


def _snapshot(context):
    positions = context.query_positions if context.query_positions is not None else context.positions
    houses = context.query_houses if context.query_houses is not None else context.houses
    return dict(positions), {row[0]: row[1:] for row in houses}


def _metadata(context):
    return {'date': context.date, 'time': context.time, 'timezone': context.timezone,
            'selected_event': context.selected_event.model_dump(mode='json') if context.selected_event else None,
            'source': 'current_chart_snapshot', 'chart_subject': 'chart_birth, not necessarily member_birth'}


def run_chart_tool(name, arguments, context):
    """Validate arguments even with strict API schemas; no arbitrary execution/lookup."""
    if name not in ('get_chart_placements', 'get_chart_aspects'):
        return {'error': 'unknown_tool', 'message': 'Use only the registered read-only chart tools.'}
    try:
        query = (PlacementQuery if name == 'get_chart_placements' else AspectQuery).model_validate(arguments)
    except ValueError:
        return {'error': 'invalid_arguments', 'message': 'Arguments must follow the tool schema.'}
    positions, houses = _snapshot(context)
    requested = set(query.points)
    missing = requested - positions.keys()
    metadata = _metadata(context)
    if name == 'get_chart_placements':
        rows = []
        for point, longitude in positions.items():
            if requested and point not in requested:
                continue
            sign, natal_house, chart_house, solar_house = houses.get(
                point, (int(longitude % 360 // 30), None, None, None))
            rows.append({'point': point, 'longitude': longitude, 'sign': SIGN_NAMES[sign],
                         'natal_house': natal_house, 'chart_time_house': chart_house, 'solar_house': solar_house})
        return {**metadata, 'placements': rows, 'missing_points': sorted(missing),
                'complete': context.query_positions is not None and not missing}

    def matches(first, second, angle):
        pair = {first, second}
        return (query.angle is None or query.angle == angle) and (
            not requested or (requested <= pair if query.match == 'all' else bool(requested & pair)))

    if query.scope == 'displayed':
        rows = [{'point1': a, 'point2': b, 'angle': angle, 'orb': orb,
                 'id': ':'.join((*sorted((a, b)), str(int(angle))))}
                for a, b, angle, orb in context.aspects if matches(a, b, angle)]
        complete = context.aspects_omitted == 0
        evaluated = sorted({p for row in context.aspects for p in row[:2]})
    else:
        eligible = (NATAL_POINTS if query.scope == 'natal_natal' else
                    TRANSIT_POINTS if query.scope == 'transit_transit' else NATAL_POINTS | TRANSIT_POINTS)
        # With an any filter, only the selected layer and its counterpart are required.
        required = set(eligible)
        if requested:
            if query.match == 'all':
                required = requested
            elif query.scope == 'transit_natal':
                required = requested | (NATAL_POINTS if requested & TRANSIT_POINTS else set()) | (
                    TRANSIT_POINTS if requested & NATAL_POINTS else set())
        missing |= required - positions.keys()
        rows = []
        evaluated = sorted(eligible & positions.keys())
        for first, second in combinations(evaluated, 2):
            if query.scope == 'transit_natal' and first[0] == second[0]:
                continue
            separation = get_angle_diff(positions[first], positions[second])
            aspect_name, angle, orb = get_aspect(separation)
            if angle is not None and matches(first, second, angle):
                rows.append({'id': ':'.join((first, second, str(angle))), 'point1': first, 'point2': second,
                             'aspect': aspect_name, 'angle': angle, 'orb': orb,
                             'separation': round(separation, 4)})
        complete = context.query_positions is not None and not missing
    rows.sort(key=lambda row: row['orb'] if row['orb'] is not None else 999)
    return {**metadata, 'scope': query.scope, 'requested_points': query.points, 'match': query.match,
            'angle_filter': query.angle, 'aspects': rows, 'count': len(rows), 'complete': complete,
            'zero_matches_confirmed': complete and not rows, 'missing_points': sorted(missing),
            'evaluated_points': evaluated, 'orb_limits': ASPECT_DEFS,
            'note': 'Absence means no aspect within these orb limits and queried scope; not no personal influence.'}
