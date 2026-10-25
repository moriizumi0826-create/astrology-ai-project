import copy
import random
import unittest
from unittest.mock import patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend.app.alignment_routes import AlignmentBirthRequest, calculate_alignment_chart
from backend.app.alignment_ai_routes import router, AnalysisRequest
from backend.app.services.alignment_ai_service import AnswersRequest, answer_facts, generate_report, GeneratedReport, InterpretationSection, InterpretationPoint
from backend.app.services.alignment_work_style import BANK, VERSION, work_style_scores


def answers(value='3'):
    result={q['id']:[value if q.get('dimension') else q['options'][0][0]] for q in BANK['questions']}
    return result


class WorkStyleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.birth=dict(birth_date='1984-08-26',birth_time='19:20',birthplace='埼玉県',latitude=35.85694,longitude=139.64889,timezone_name='Asia/Tokyo')
        cls.chart=calculate_alignment_chart(AlignmentBirthRequest(**cls.birth))
        app=FastAPI()
        app.include_router(router)
        cls.client=TestClient(app)

    def test_questions_cover_seven_dimensions_three_times_and_are_shared(self):
        self.assertEqual(len(BANK['questions']),24)
        self.assertEqual(len({q['id'] for q in BANK['questions']}),24)
        for d in BANK['dimensions']:
            items=[q for q in BANK['questions'] if q.get('dimension')==d['id']]
            self.assertEqual(len(items),3)
            self.assertEqual(sum(bool(q.get('reverse')) for q in items),1)

    def test_every_choice_is_valid_and_returns_seven_scores_and_four_jobs(self):
        for q in BANK['questions']:
            for value,_ in q['options']:
                data=answers()
                data[q['id']]=[value]
                request=AnswersRequest(question_version=VERSION,answers=data)
                self.assertIn('answer:'+q['id'],answer_facts(request))
                result=work_style_scores(data,self.chart)
                self.assertEqual(len(result['profiles']),7)
                self.assertEqual(len(result['careers']),4)
                self.assertEqual(len({j['id'] for j in result['careers']}),4)
                self.assertTrue(all(0<=j['score']<=100 for j in result['careers']))

    def test_reverse_items_and_answers_change_the_relevant_dimension(self):
        data=answers('unknown')
        data['creation_1']=['4']; data['creation_2']=['1']; data['creation_3']=['4']
        high=work_style_scores(data,self.chart)
        high_creation=next(p for p in high['profiles'] if p['id']=='creation')
        self.assertEqual(high_creation['answerScore'],100)
        data['creation_1']=['1']; data['creation_2']=['4']; data['creation_3']=['1']
        low=work_style_scores(data,self.chart)
        low_creation=next(p for p in low['profiles'] if p['id']=='creation')
        self.assertEqual(low_creation['answerScore'],0)
        self.assertGreater(high_creation['value'],low_creation['value'])
        for other in ['resources','daily','role','clients','shared','network']:
            self.assertEqual(next(p['value'] for p in high['profiles'] if p['id']==other),next(p['value'] for p in low['profiles'] if p['id']==other))

    def test_all_unknowns_still_return_candidates_without_inventing_answers(self):
        data={q['id']:['unknown'] for q in BANK['questions']}
        result=work_style_scores(data,self.chart)
        self.assertEqual(result['coverage'],0)
        self.assertEqual(result['mode'],'explore')
        self.assertEqual(result['basis'],'separate_profiles')
        self.assertTrue(all(p['answerScore'] is None and p['value'] is None and p['basis']=='unanswered' for p in result['profiles']))
        self.assertIsNone(result['comparison']['level'])
        self.assertEqual(result['comparison']['comparedDimensions'],0)
        self.assertEqual(result['answerType']['style'],'探索中')
        self.assertEqual(len(result['careers']),4)
        self.assertEqual(result,work_style_scores(copy.deepcopy(data),copy.deepcopy(self.chart)))

    def test_bad_or_missing_answers_fail_at_request_validation(self):
        for change in ['missing','invalid','double','version']:
            data=answers()
            version=VERSION
            if change=='missing': del data['creation_1']
            elif change=='invalid': data['creation_1']=['100']
            elif change=='double': data['creation_1']=['3','4']
            else: version='invented'
            with self.assertRaises(ValueError): AnswersRequest(question_version=version,answers=data)

    def test_result_does_not_require_api_key_or_make_ai_calls(self):
        with patch('backend.app.alignment_ai_routes.reserve',side_effect=AssertionError('AI quota should not be used')),patch('backend.app.services.alignment_ai_service.structured_response',side_effect=AssertionError('No model needed')):
            self.assertEqual(self.client.post('/api/alignment/ready').json(),{'question_version':VERSION,'ready':True})
            for wish in ['expertise','product','cooperate','assets','freedom','unknown']:
                data=answers(); data['wish']=[wish]
                response=self.client.post('/api/alignment/result',json=dict(question_version=VERSION,answers=data,birth=self.birth))
                self.assertEqual(response.status_code,200,response.text)
                result=response.json()
                self.assertFalse(result['aiConnected'])
                self.assertIsNone(result['report'])
                self.assertEqual(result['scores']['version'],VERSION)
                self.assertEqual(len(result['scores']['careers']),4)

    def test_random_complete_inputs_remain_bounded_and_deterministic(self):
        rng=random.Random(12)
        for _ in range(300):
            data={q['id']:[rng.choice(q['options'])[0]] for q in BANK['questions']}
            result=work_style_scores(data,self.chart)
            self.assertTrue(result['total'] is None or 0<=result['total']<=99)
            self.assertTrue(all(p['value'] is None or 0<=p['value']<=100 for p in result['profiles']))
            self.assertEqual(result,work_style_scores(data,self.chart))

    def test_answer_and_chart_profiles_are_independent_and_ordered(self):
        high=answers('unknown'); high['creation_1']=['4']; high['creation_2']=['1']; high['creation_3']=['4']
        low=copy.deepcopy(high); low['creation_1']=['1']; low['creation_2']=['4']; low['creation_3']=['1']
        a=work_style_scores(high,self.chart); b=work_style_scores(low,self.chart)
        self.assertEqual([p['id'] for p in a['profiles']],[d['id'] for d in BANK['dimensions']])
        self.assertEqual([p['chartScore'] for p in a['profiles']],[p['chartScore'] for p in b['profiles']])
        self.assertEqual(a['chartType'],b['chartType'])
        self.assertEqual([(j['id'],j['score']) for j in a['careers']],[(j['id'],j['score']) for j in b['careers']])
        creation=next(p for p in a['profiles'] if p['id']=='creation')
        self.assertEqual(creation['value'],100)
        self.assertEqual(creation['answerScore'],100)
        changed_chart=copy.deepcopy(self.chart)
        for p in changed_chart['planets']: p['house']=1
        c=work_style_scores(high,changed_chart)
        self.assertEqual([p['answerScore'] for p in a['profiles']],[p['answerScore'] for p in c['profiles']])
        self.assertEqual(a['answerType'],c['answerType'])

    def test_optional_ai_keeps_the_same_scores_and_job_examples(self):
        payload=AnalysisRequest(question_version=VERSION,answers=answers(),birth=self.birth,
            revisions=[dict(section='overlap',kind='different',note='対話は短くして、制作に集中したい')])
        generated=GeneratedReport(sections=[InterpretationSection(id=key,
            points=[InterpretationPoint(text='制作を中心に、必要な対話を短く組み合わせる方向です。',fact_ids=['house:2','revision:0'])],
            change='revised',reason='本人の補足を優先しました。') for key in ['overlap','tension','action','unknown']])
        with patch('backend.app.services.alignment_ai_service.structured_response',return_value=generated) as generate:
            result=generate_report(payload,self.chart)
        self.assertEqual(result['scores'],work_style_scores(payload.answers,self.chart))
        self.assertEqual(generate.call_args.args[2]['score_summary']['profiles'],result['scores']['profiles'])
        self.assertTrue(result['aiConnected'])
        self.assertEqual(result['sections'][0]['change'],'revised')


if __name__=='__main__': unittest.main()
