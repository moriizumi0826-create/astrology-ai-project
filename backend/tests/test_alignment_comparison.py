import unittest
from backend.app.services.alignment_comparison import TYPE_NAMES, classify_profile, compare_profiles


class ComparisonTests(unittest.TestCase):
    def test_exact_matches_are_lv99_and_opposites_lv0(self):
        self.assertEqual(compare_profiles([dict(answerScore=70,chartScore=70)])['level'],99)
        self.assertEqual(compare_profiles([dict(answerScore=0,chartScore=100)])['level'],0)
        self.assertEqual(compare_profiles([dict(answerScore=40,chartScore=60)])['level'],79)

    def test_compares_each_axis_not_the_averages(self):
        opposite=[dict(answerScore=0,chartScore=100),dict(answerScore=100,chartScore=0)]
        self.assertEqual(compare_profiles(opposite)['level'],0)
        self.assertEqual(compare_profiles([dict(answerScore=50,chartScore=50)]*2)['level'],99)

    def test_unknown_is_not_zero_or_an_automatic_match(self):
        result=compare_profiles([dict(answerScore=None,chartScore=90),dict(answerScore=40,chartScore=60)])
        self.assertEqual(result['level'],79)
        self.assertEqual(result['comparedDimensions'],1)
        self.assertEqual(result['totalDimensions'],2)
        self.assertIsNone(compare_profiles([dict(answerScore=None,chartScore=90)])['level'])

    def test_level_decreases_with_distance_and_is_symmetric(self):
        previous=100
        for gap in range(101):
            forward=compare_profiles([dict(answerScore=gap,chartScore=0)])['level']
            backward=compare_profiles([dict(answerScore=0,chartScore=gap)])['level']
            self.assertEqual(forward,backward)
            self.assertLessEqual(forward,previous)
            self.assertTrue(0<=forward<=99)
            previous=forward

    def test_42_pair_names_and_three_styles_are_distinct_and_reachable(self):
        ids=list(TYPE_NAMES)
        names=[]; codes=set()
        for first in ids:
            self.assertEqual(set(TYPE_NAMES[first]),set(ids)-{first})
            for second in TYPE_NAMES[first]:
                names.append(TYPE_NAMES[first][second])
                for style,values in [('balanced',(80,79,72)),('focused',(95,70,20)),('mixed',(90,80,20))]:
                    profiles=[dict(id=key,label=key,answerScore=values[0] if key==first else values[1] if key==second else values[2]) for key in ids]
                    result=classify_profile(profiles,'answerScore')
                    self.assertEqual(result['label'],TYPE_NAMES[first][second])
                    self.assertEqual(result['code'],f'{first}-{second}-{style}')
                    codes.add(result['code'])
        self.assertEqual(len(set(names)),42)
        self.assertEqual(len(codes),126)

    def test_type_on_each_side_uses_only_its_own_values(self):
        profiles=[dict(id=key,label=key,answerScore=90-i*10,chartScore=30+i*10) for i,key in enumerate(TYPE_NAMES)]
        answer=classify_profile(profiles,'answerScore'); natal=classify_profile(profiles,'chartScore')
        self.assertNotEqual(answer['code'],natal['code'])
        profiles[0]['chartScore']=100
        self.assertEqual(classify_profile(profiles,'answerScore'),answer)


if __name__=='__main__': unittest.main()
