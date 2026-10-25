from collections import deque
from types import SimpleNamespace
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from backend.app import alignment_ai_routes as routes
from backend.app.services import alignment_ai_service as ai
from backend.app.settings import Settings


def answers():
    return dict(wish=["product"], interest=["make"], experience=["craft"], style=["both"],
                value=["change"], boundary=["limit"], offer=["partner"], theme="自分の軸で生きること")


def report():
    return ai.GeneratedReport(sections=[ai.InterpretationSection(id=key,
        points=[ai.InterpretationPoint(text="日々の工夫を形にすることが、望む提供方法とつながる仮説です。", fact_ids=["answer:wish", "house:2"])],
        change="initial", reason="") for key in ai.SECTION_IDS])


class AlignmentAITests(unittest.TestCase):
    def test_dedicated_config_never_falls_back_and_reloads_saved_key(self):
        settings = Settings()
        settings.openai_api_key = "unrelated-placeholder"
        settings.money_ai_api_key = ""
        with TemporaryDirectory() as folder, patch('backend.app.settings.PROJECT_ROOT', Path(folder)):
            self.assertEqual(settings.money_ai_config()[0], "")
            path = Path(folder) / '.env.money-ai'
            path.write_text('MONEY_AI_API_KEY=dedicated-placeholder\nMONEY_AI_MODEL=gpt-4.1\n', encoding='utf-8')
            self.assertEqual(settings.money_ai_config(), ('dedicated-placeholder', 'gpt-4.1'))
            path.write_text('MONEY_AI_API_KEY=\n', encoding='utf-8')
            self.assertEqual(settings.money_ai_config()[0], '')

    def test_client_uses_only_dedicated_key_and_disables_response_storage(self):
        with patch.object(ai.settings, 'money_ai_config', return_value=('dedicated-placeholder', 'gpt-6.1-sol')), patch.object(ai, 'OpenAI') as client:
            client.return_value.__enter__.return_value.responses.parse.return_value = SimpleNamespace(output_parsed=ai.GeneratedQuestions(questions=['誰に届けたいですか？']))
            result = ai.structured_response(ai.GeneratedQuestions, '質問を作成', {'answers': {}})
            self.assertEqual(result.questions, ['誰に届けたいですか？'])
            self.assertEqual(client.call_args.kwargs['api_key'], 'dedicated-placeholder')
            self.assertFalse(client.return_value.__enter__.return_value.responses.parse.call_args.kwargs['store'])
            self.assertEqual(client.return_value.__enter__.return_value.responses.parse.call_args.kwargs['reasoning'], {'effort': 'low'})

    def test_answers_are_canonical_and_unknown_is_not_negative(self):
        payload = ai.AnswersRequest(answers=answers(), supplements={"wish": "売ることは分担したい"})
        facts = ai.answer_facts(payload)
        self.assertIn("商品", facts["answer:wish"])
        self.assertEqual(facts["supplement:wish"], "売ることは分担したい")
        for patch_values in [{"wish": ["fabricated"]}, {"wish": ["product", "unknown"]}, {"interest": []}]:
            with self.assertRaises(ValueError):
                ai.AnswersRequest(answers={**answers(), **patch_values})

    def test_questions_use_answers_only_and_are_bounded(self):
        with patch.object(ai, "structured_response", return_value=ai.GeneratedQuestions(questions=["どんな相手に届けたいですか？"])) as mock:
            ai.generate_questions(ai.AnswersRequest(answers=answers()))
        self.assertEqual(set(mock.call_args.args[2]), {"answers"})
        with self.assertRaises(ValueError):
            ai.GeneratedQuestions(questions=["a", "b", "c", "d"])

    def test_fabricated_references_and_position_claims_are_rejected(self):
        facts = {"answer:wish": "商品", "house:2": "2ハウス：牡牛座"}
        valid = report()
        ai.validate_report(valid, facts)
        for text, refs in [("金星が2ハウスにある", ["house:2"]), ("自分に合う方法", ["invented:aspect"]), ("あなたの金運は99点です", ["house:2"])]:
            bad = report()
            bad.sections[0].points[0].text = text
            bad.sections[0].points[0].fact_ids = refs
            with self.assertRaises(HTTPException) as caught:
                ai.validate_report(bad, facts)
            self.assertEqual(caught.exception.status_code, 502)

    def test_report_requires_exactly_four_distinct_sections(self):
        data = report().model_dump()
        data["sections"][1]["id"] = "overlap"
        with self.assertRaises(ValueError):
            ai.GeneratedReport.model_validate(data)

    def test_analysis_recalculates_chart_and_never_accepts_client_chart(self):
        app = FastAPI()
        app.include_router(routes.router)
        payload = dict(answers=answers(), birth=dict(birth_date="1984-08-26", birth_time="19:20", birthplace="埼玉県",
            latitude=35.85694, longitude=139.64889, timezone_name="Asia/Tokyo"), conversation=[])
        with patch.object(routes, "reserve"), patch.object(routes, "_slots"), patch.object(routes, "calculate_alignment_chart", return_value={"trusted": True}) as calc, patch.object(ai, "generate_report", return_value={"sections": [], "report": {}}) as generate:
            response = TestClient(app).post('/api/alignment/analysis', json=payload)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["chart"], {"trusted": True})
            calc.assert_called_once()
            self.assertEqual(generate.call_args.args[1], {"trusted": True})
            payload["chart"] = {"fake": True}
            self.assertEqual(TestClient(app).post('/api/alignment/analysis', json=payload).status_code, 422)

    def test_rate_limit_and_missing_key_fail_before_model_call(self):
        request = SimpleNamespace(client=SimpleNamespace(host="test"))
        with patch.object(routes.settings, "money_ai_config", return_value=("", "gpt-4.1")):
            with self.assertRaises(HTTPException) as caught:
                routes.reserve(request)
            self.assertEqual(caught.exception.status_code, 503)
        with patch.object(routes.settings, "money_ai_config", return_value=("test-placeholder", "gpt-4.1")), patch.object(routes, "_client_calls", {}), patch.object(routes, "_global_calls", deque()), patch.object(routes, "_slots"):
            for _ in range(12):
                routes.reserve(request)
            with self.assertRaises(HTTPException) as caught:
                routes.reserve(request)
            self.assertEqual(caught.exception.status_code, 429)

    def test_updated_report_carries_real_evidence_and_change_reason(self):
        payload = SimpleNamespace(answers=answers(), supplements={}, conversation=[ai.Conversation(question="対応範囲は？", answer="深追いしない")],
            revisions=[ai.Revision(section="tension", kind="different", note="必要なところだけ分担したい")], previous=report())
        generated = report()
        for section in generated.sections:
            section.change = "revised"
            section.reason = "本人の補足で、分担する範囲を絞りました。"
            section.points[0].fact_ids = ["house:2", "revision:0"]
        chart = {"planets": [], "houses": [dict(number=2, sign="牡牛座", degree=1, ruler="金星")], "aspects": [], "house_system": "Placidus", "ruler_system": "traditional"}
        with patch.object(ai, "structured_response", return_value=generated):
            result = ai.generate_report(payload, chart)
        self.assertTrue(result["aiConnected"])
        self.assertEqual(result["scores"]["version"], "alignment-match-1")
        self.assertIsNone(result["scores"]["total"])
        self.assertIn("分担", result["sections"][0]["changeReason"])
        self.assertIn("牡牛座", result["sections"][0]["chartNotes"][0])
        self.assertTrue(result["sections"][0]["original"])


if __name__ == '__main__':
    unittest.main()
