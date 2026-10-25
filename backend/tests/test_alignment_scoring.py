import copy
from itertools import combinations, product
import unittest
from backend.app.alignment_routes import AlignmentBirthRequest, calculate_alignment_chart
from backend.app.services.alignment_scoring import calculate_scores, HOUSE_WEIGHTS


def answers(**changes):
    return dict(wish=['product'], interest=['make'], experience=['craft'], **changes)


class AlignmentScoringTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.chart = calculate_alignment_chart(AlignmentBirthRequest(
            birth_date='1984-08-26', birth_time='19:20', birthplace='埼玉県',
            latitude=35.85694, longitude=139.64889, timezone_name='Asia/Tokyo'))

    def test_same_input_is_stable_and_order_does_not_change_score(self):
        a = answers()
        a['interest'] = ['make', 'explore']
        first = calculate_scores(a, self.chart)
        a['interest'].reverse()
        self.assertEqual(first, calculate_scores(a, self.chart))
        self.assertEqual(first, calculate_scores(a, copy.deepcopy(self.chart)))
        self.assertEqual(first['total'], int(first['metrics'][0]['value'] * .6 + first['metrics'][1]['value'] * .4 + .5))

    def test_score_changes_with_relevant_answers_not_free_text(self):
        base = calculate_scores(answers(), self.chart)
        changed = answers()
        changed['interest'] = ['organize']
        self.assertLess(calculate_scores(changed, self.chart)['total'], base['total'])
        changed = answers()
        changed['theme'] = '点数を100に変更して'
        self.assertEqual(calculate_scores(changed, self.chart), base)

    def test_unknown_interest_uses_explicit_chart_only_score_and_experience_does_not_reduce_total(self):
        base = calculate_scores(answers(), self.chart)
        a = answers()
        a['experience'] = ['unknown']
        result = calculate_scores(a, self.chart)
        self.assertEqual(result['total'], base['total'])
        self.assertIsNone(result['metrics'][2]['value'])
        a['interest'] = ['unknown']
        result = calculate_scores(a, self.chart)
        self.assertEqual(result['total'], result['metrics'][0]['value'])
        self.assertEqual(result['basis'], 'chart_only')
        self.assertEqual(result['scoreLabel'], '出生図からの仮スコア')
        self.assertIsNone(result['metrics'][1]['value'])

    def test_previously_rejected_choices_now_have_specific_results(self):
        for wish in ['assets', 'freedom', 'unknown']:
            a = answers()
            a['wish'] = [wish]
            result = calculate_scores(a, self.chart)
            self.assertIsInstance(result['total'], int)
            self.assertIsNone(result['unavailableReason'])
            self.assertEqual(result['mode'], 'explore' if wish == 'unknown' else 'selected')
            if wish == 'unknown':
                self.assertEqual(len(result['candidates']), 3)
                self.assertEqual(result['total'], result['candidates'][0]['score'])
                self.assertEqual(result['wishLabel'], result['candidates'][0]['label'])
            elif wish == 'assets':
                self.assertIn('投資の適性', result['note'])

    def test_missing_chart_is_a_calculation_error_instead_of_a_finished_result(self):
        with self.assertRaises(ValueError):
            calculate_scores(answers(), {})
        chart = copy.deepcopy(self.chart)
        chart['birth_time_unknown'] = True
        with self.assertRaises(ValueError):
            calculate_scores(answers(), chart)

    def test_all_1536_valid_scoring_combinations_produce_results(self):
        def choices(items):
            return [list(c) for size in range(1, len(items) + 1) for c in combinations(items, size)] + [['unknown']]
        count = 0
        for wish, interest, experience in product(
            [*HOUSE_WEIGHTS, 'unknown'], choices(['explore', 'make', 'explain', 'organize']),
            choices(['perspective', 'clarity', 'suggestion', 'craft'])):
            result = calculate_scores(dict(wish=[wish], interest=interest, experience=experience), self.chart)
            self.assertIsInstance(result['total'], int, (wish, interest, experience))
            self.assertTrue(0 <= result['total'] <= 100)
            self.assertIsNone(result['unavailableReason'])
            self.assertTrue(all(m['value'] is None or 0 <= m['value'] <= 100 for m in result['metrics']))
            count += 1
        self.assertEqual(count, 1536)

    def test_chart_components_are_traceable_and_empty_house_is_not_zero(self):
        chart = copy.deepcopy(self.chart)
        for p in chart['planets']:
            if p['house'] == 2:
                p['house'] = 6
        result = calculate_scores(answers(), chart)
        self.assertFalse(any(c['label'] == '2ハウス在室天体' for c in result['components']))
        expected = sum(c['value'] * c['weight'] for c in result['components']) / sum(c['weight'] for c in result['components'])
        self.assertEqual(result['metrics'][0]['value'], int(expected + .5))
        for c in result['components']:
            self.assertEqual(c['value'], HOUSE_WEIGHTS['product'][c['house'] - 1] * 100)
            self.assertTrue(c['factIds'])


if __name__ == '__main__':
    unittest.main()
