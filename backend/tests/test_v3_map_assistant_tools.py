"""Grounding/tool-loop regression tests; all OpenAI calls are mocked."""
import json
import unittest
from unittest.mock import patch

import httpx
from fastapi import HTTPException
from backend.v3.map_assistant import MapContext, MapAssistantRequest, _request_answer
from backend.v3.map_assistant_tools import PLANETS, TOOLS, run_chart_tool


def context():
    natal = [(f'N:{planet}', 155 + i * 0.1) for i, planet in enumerate((*PLANETS, 'ASC', 'MC'))]
    return MapContext(date='2026-10-11', time='00:50:09', timezone='Asia/Tokyo',
                      query_positions=natal + [('T:SUN', 197), ('T:MOON', 197.001), ('T:VENUS', 215)],
                      query_houses=[('T:SUN', 6, 7, None, 2)],
                      selected_event={'title': '新月', 'type': 'new_moon', 'date': '2026-10-11', 'time': '00:50:09'})


def query(**overrides):
    return {'scope': 'transit_natal', 'points': ['T:SUN', 'T:MOON'], 'match': 'any', 'angle': None, **overrides}


def response(output, **extra):
    return httpx.Response(200, request=httpx.Request('POST', 'https://api.openai.com/v1/responses'),
                          json={'output': output, **extra})


def call(name='get_chart_aspects', arguments=None, call_id='facts'):
    return {'type': 'function_call', 'call_id': call_id, 'name': name,
            'arguments': json.dumps(query() if arguments is None else arguments)}


def message(text):
    return {'type': 'message', 'content': [{'type': 'output_text', 'text': text}]}


class ChartToolTests(unittest.TestCase):
    def test_new_moon_zero_is_explicit_and_does_not_use_wrong_history_or_display(self):
        ctx = context()
        ctx.aspects = [('T:SUN', 'N:SUN', 90, 4)]  # Stale/incorrect display does not override geometry.
        result = run_chart_tool('get_chart_aspects', query(), ctx)
        self.assertEqual(result['aspects'], [])
        self.assertTrue(result['zero_matches_confirmed'])
        self.assertTrue(result['complete'])
        self.assertEqual(result['time'], '00:50:09')
        self.assertEqual(result['orb_limits'][2]['orb'], 6)

    def test_other_planet_pair_is_found_with_actual_orb_and_circular_distance(self):
        ctx = context()
        ctx.query_positions += [('T:URANUS', 65.123)]
        result = run_chart_tool('get_chart_aspects', query(points=['N:SUN', 'T:URANUS'], match='all'), ctx)
        self.assertEqual(result['count'], 1)
        self.assertEqual(result['aspects'][0]['angle'], 90)
        self.assertAlmostEqual(result['aspects'][0]['orb'], 0.12)
        wrapped = MapContext(query_positions=[('T:SUN', 359), ('T:MOON', 1)])
        result = run_chart_tool('get_chart_aspects', query(scope='transit_transit', points=['T:SUN','T:MOON'], match='all'), wrapped)
        self.assertEqual(result['aspects'][0]['orb'], 2)
        self.assertEqual(result['aspects'][0]['angle'], 0)

    def test_missing_old_partial_context_and_unknown_requested_point_never_confirm_zero(self):
        for ctx in (MapContext(positions=[('N:SUN',155),('T:MOON',197)]),
                    MapContext(query_positions=[('N:SUN',155),('T:MOON',197)])):
            result = run_chart_tool('get_chart_aspects', query(), ctx)
            self.assertFalse(result['zero_matches_confirmed'])
            self.assertFalse(result['complete'])
        result = run_chart_tool('get_chart_aspects', query(points=['T:UNKNOWN']), context())
        self.assertIn('T:UNKNOWN', result['missing_points'])
        self.assertFalse(result['complete'])

    def test_scope_angle_filter_and_any_all_are_not_interchanged(self):
        ctx = context()
        result = run_chart_tool('get_chart_aspects', query(scope='transit_transit', match='all'), ctx)
        self.assertEqual(result['count'], 1)
        self.assertEqual(result['aspects'][0]['angle'], 0)
        result = run_chart_tool('get_chart_aspects', query(scope='transit_transit', match='all', angle=90), ctx)
        self.assertTrue(result['zero_matches_confirmed'])
        result = run_chart_tool('get_chart_aspects', query(scope='natal_natal', points=['N:SUN']), ctx)
        self.assertEqual(result['count'], 11)

    def test_raw_orb_boundary_is_not_rounded_before_classification(self):
        for longitude, expected in ((6.00001, 0), (6.0, 1)):
            ctx = MapContext(query_positions=[('N:SUN', 90), ('T:MOON', longitude)])
            result = run_chart_tool('get_chart_aspects', query(points=['N:SUN', 'T:MOON'], match='all', angle=90), ctx)
            # separation is 90-longitude, so longitude 6.00001 is outside the square orb.
            self.assertEqual(result['count'], expected)

    def test_displayed_results_are_separate_and_omitted_not_absent(self):
        ctx = MapContext(aspects=[('N:SUN', 'T:MARS', 90, 1)], aspects_omitted=1)
        result = run_chart_tool('get_chart_aspects', query(scope='displayed'), ctx)
        self.assertEqual(result['count'], 0)
        self.assertFalse(result['complete'])

    def test_named_houses_preserve_unknowns_and_hidden_points(self):
        result = run_chart_tool('get_chart_placements', {'points':['T:SUN']}, context())
        self.assertEqual(result['placements'][0], {'point':'T:SUN', 'longitude':197.0, 'sign':'天秤座',
                         'natal_house':7, 'chart_time_house':None, 'solar_house':2})
        self.assertTrue(result['complete'])

    def test_bad_arguments_and_arbitrary_function_names_are_rejected(self):
        for args in (None, [], {'points':[], 'orb':20}, query(angle=45), query(scope='execute')):
            self.assertEqual(run_chart_tool('get_chart_aspects', args, context())['error'], 'invalid_arguments')
        self.assertEqual(run_chart_tool('exec', {}, context())['error'], 'unknown_tool')
        for tool in TOOLS:
            self.assertTrue(tool['strict'])
            self.assertFalse(tool['parameters']['additionalProperties'])
            self.assertEqual(set(tool['parameters']['required']), set(tool['parameters']['properties']))


class ToolLoopTests(unittest.TestCase):
    def test_queries_then_answers_and_retains_stateless_reasoning_and_history(self):
        payload = MapAssistantRequest(question='今回の新月とのアスペクトは？', context=context(),
                                      history=[{'role':'assistant','content':'出生太陽とスクエアです'}])
        reasoning = {'type':'reasoning', 'id':'reasoning-1', 'summary':[]}
        with patch('backend.v3.map_assistant.httpx.post', side_effect=[
                response([reasoning, call()]), response([message('今回の新月とのアスペクトはありません。')])]) as post:
            answer = _request_answer(payload, payload.question, 'fake-key')
        self.assertIn('ありません', answer)
        first, second = [entry.kwargs['json'] for entry in post.call_args_list]
        self.assertEqual(first['tool_choice'], 'required')
        self.assertEqual(second['tool_choice'], 'auto')
        summary = json.loads(first['input'][0]['content'])['screen']
        self.assertNotIn('query_positions', summary)
        self.assertNotIn('aspects', summary)
        self.assertIn('T:MOON', summary['available_points'])
        self.assertIn(reasoning, second['input'])
        self.assertTrue(json.loads(second['input'][-1]['output'])['zero_matches_confirmed'])
        self.assertFalse(second['store'])

    def test_multiple_queries_in_one_response_keep_their_call_ids(self):
        with patch('backend.v3.map_assistant.httpx.post', side_effect=[
                response([call(call_id='a'), call('get_chart_placements', {'points':['T:SUN']}, 'b')]),
                response([message('回答')])]) as post:
            self.assertEqual(_request_answer(MapAssistantRequest(question='質問',context=context()), '質問','fake-key'), '回答')
        outputs = [row for row in post.call_args.kwargs['json']['input'] if row.get('type')=='function_call_output']
        self.assertEqual([row['call_id'] for row in outputs], ['a','b'])

    def test_answer_without_lookup_or_only_invalid_lookup_fails_closed(self):
        for upstream in ([response([message('捏造した回答')])],
                         [response([call('exec',{})]), response([message('捏造した回答')])]):
            with patch('backend.v3.map_assistant.httpx.post', side_effect=upstream), self.assertRaises(HTTPException):
                _request_answer(MapAssistantRequest(question='質問'), '質問','fake-key')

    def test_loop_limit_and_truncated_answer_fail_closed(self):
        for upstream in ([response([call()])]*4,
                         [response([call()]),response([message('途中の回答')],status='incomplete')]):
            with patch('backend.v3.map_assistant.httpx.post', side_effect=upstream) as post, self.assertRaises(HTTPException):
                _request_answer(MapAssistantRequest(question='質問',context=context()), '質問','fake-key')
            self.assertLessEqual(post.call_count,4)
