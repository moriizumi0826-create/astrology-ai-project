import unittest
from types import SimpleNamespace
from unittest.mock import patch

from backend.app.services import alignment_ai_service as ai
from backend.app import alignment_ai_routes as bounded_ai
from backend.app.services.alignment_work_style import BANK, VERSION
from backend.tests.test_alignment_ai import report
from backend.tests.test_v3_access import local_test_client
from backend.v3.app import create_app
from backend.v3 import alignment


def payload():
    return dict(question_version=VERSION,
        answers={q['id']:['3' if q.get('dimension') else q['options'][0][0]] for q in BANK['questions']},
        birth=dict(birth_date='1984-08-26',birth_time='19:20',birthplace='埼玉県',latitude=35.85694,longitude=139.64889,timezone_name='Asia/Tokyo'))


class V3AlignmentTests(unittest.TestCase):
    def setUp(self):
        self.app=create_app(auth_mode='local_test')
        self.client=local_test_client(self.app)
        self.headers={'Origin':'http://127.0.0.1:5176'}

    def test_anonymous_result_has_two_profiles_and_does_not_need_ai_key(self):
        with patch.object(ai.settings,'money_ai_config',return_value=('', 'gpt-6.1-sol')),patch.object(ai,'structured_response',side_effect=AssertionError('instant result must not call AI')):
            self.assertEqual(self.client.post('/api/v3/alignment/ready',headers=self.headers).status_code,200)
            result=self.client.post('/api/v3/alignment/result',json=payload(),headers=self.headers)
        self.assertEqual(result.status_code,200,result.text)
        scores=result.json()['scores']
        self.assertEqual(len(scores['profiles']),7)
        self.assertEqual(len(scores['careers']),4)
        self.assertEqual(scores['comparison']['maxLevel'],99)
        self.assertIn('answerType',scores)
        self.assertIn('chartType',scores)
        self.assertFalse(result.json()['aiConnected'])
        self.assertEqual(result.headers['cache-control'],'no-store')
        self.assertEqual(self.client.get('/api/v3/session').json()['state'],'anonymous')

    def test_origins_are_checked_before_calculation_or_ai(self):
        with patch.object(alignment,'calculate_alignment_chart',side_effect=AssertionError('forbidden origin')):
            for headers in [{},{'Origin':'https://unexpected.example'}]:
                self.assertEqual(self.client.post('/api/v3/alignment/result',json=payload(),headers=headers).status_code,403)
                self.assertEqual(self.client.post('/api/v3/alignment/ready',headers=headers).status_code,403)

    def test_old_legacy_routes_are_not_exposed(self):
        for path in ['/api/alignment/result','/api/alignment/analysis','/api/readings','/api/dev/reload-csv']:
            self.assertEqual(self.client.post(path,json=payload(),headers=self.headers).status_code,404)

    def test_missing_key_blocks_only_optional_ai(self):
        body=payload(); body.pop('birth')
        with patch.object(ai.settings,'money_ai_config',return_value=('', 'gpt-6.1-sol')):
            failed=self.client.post('/api/v3/alignment/questions',json=body,headers=self.headers)
        self.assertEqual(failed.status_code,503)
        self.assertEqual(self.client.post('/api/v3/alignment/result',json=payload(),headers=self.headers).status_code,200)

    def test_questions_and_analysis_use_dedicated_bounded_ai(self):
        body=payload(); body.pop('birth')
        with patch.object(ai.settings,'money_ai_config',return_value=('dedicated-placeholder','gpt-6.1-sol')),patch.object(ai,'structured_response',return_value=ai.GeneratedQuestions(questions=['どの工程を分担したいですか？'])):
            response=self.client.post('/api/v3/alignment/questions',json=body,headers=self.headers)
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(len(response.json()['questions']),1)
        with patch.object(ai.settings,'money_ai_config',return_value=('dedicated-placeholder','gpt-6.1-sol')),patch.object(ai,'structured_response',return_value=report()):
            response=self.client.post('/api/v3/alignment/analysis',json=payload(),headers=self.headers)
        self.assertEqual(response.status_code,200,response.text)
        self.assertTrue(response.json()['aiConnected'])
        self.assertEqual(response.json()['scores']['scoringVersion'],'separate-profiles-1')

    def test_calculation_limit_is_separate_for_each_anonymous_address(self):
        for _ in range(12):
            self.assertEqual(self.client.post('/api/v3/alignment/result',json=payload(),headers=self.headers).status_code,200)
        limited=self.client.post('/api/v3/alignment/result',json=payload(),headers=self.headers)
        self.assertEqual(limited.status_code,429)
        self.assertIn('retry-after',limited.headers)
        other=local_test_client(self.app,'127.0.0.2')
        self.assertEqual(other.post('/api/v3/alignment/result',json=payload(),headers=self.headers).status_code,200)

    def test_ai_uses_v3_subject_instead_of_shared_proxy_address(self):
        request=SimpleNamespace()
        with patch.object(alignment,'require_allowed_origin'),patch.object(alignment,'check_request_limit'),patch.object(alignment,'rate_limit_subject',return_value='ip:203.0.113.12'),patch.object(bounded_ai,'reserve') as reserve:
            alignment.reserve_ai(request)
        reserve.assert_called_once_with(request,subject='ip:203.0.113.12')

    def test_unknown_birth_time_and_missing_questions_are_rejected(self):
        unknown=payload(); unknown['birth']['birth_time_unknown']=True
        missing_time=payload(); missing_time['birth']['birth_time']=None
        for body in [unknown,missing_time]:
            self.assertEqual(self.client.post('/api/v3/alignment/result',json=body,headers=self.headers).status_code,422)
        missing=payload(); del missing['answers']['creation_1']
        self.assertEqual(self.client.post('/api/v3/alignment/result',json=missing,headers=self.headers).status_code,422)
