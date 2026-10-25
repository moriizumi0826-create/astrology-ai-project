import copy
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

    def test_unknown_is_unavailable_and_experience_does_not_reduce_total(self):
        base = calculate_scores(answers(), self.chart)
        a = answers()
        a['experience'] = ['unknown']
        result = calculate_scores(a, self.chart)
        self.assertEqual(result['total'], base['total'])
        self.assertIsNone(result['metrics'][2]['value'])
        a['interest'] = ['unknown']
        result = calculate_scores(a, self.chart)
        self.assertIsNone(result['total'])
        self.assertIsNone(result['metrics'][1]['value'])

    def test_unsupported_wishes_and_missing_chart_are_not_fabricated_scores(self):
        for wish in ['assets', 'freedom', 'unknown']:
            a = answers()
            a['wish'] = [wish]
            result = calculate_scores(a, self.chart)
            self.assertIsNone(result['total'])
            self.assertTrue(all(m['value'] is None for m in result['metrics']))
        self.assertIsNone(calculate_scores(answers(), {})['total'])
        chart = copy.deepcopy(self.chart)
        chart['birth_time_unknown'] = True
        self.assertIsNone(calculate_scores(answers(), chart)['total'])

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
