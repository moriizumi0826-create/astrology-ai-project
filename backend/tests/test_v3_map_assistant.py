import unittest
import json
from types import SimpleNamespace
from unittest.mock import patch

from backend.tests.test_v3_access import local_test_client
from backend.v3.app import create_app
from backend.v3.access import AccessContext, get_access_context
from backend.v3.map_assistant import FAQ, MapContext, _model_screen
from datetime import datetime, timedelta, timezone


class MapAssistantPrototypeTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(auth_mode="local_test")
        self.app.dependency_overrides[get_access_context] = lambda: AccessContext(user_id="member", entitlement="owner")
        self.client = local_test_client(self.app)
        self.client.headers["origin"] = "http://127.0.0.1:5176"

    def test_free_anonymous_and_expired_cannot_call_openai(self):
        for context, status in [(AccessContext(), 401), (AccessContext(user_id="free"), 403),
                (AccessContext(user_id="expired", entitlement="active", valid_until=datetime.now(timezone.utc)-timedelta(days=1)),403)]:
            with self.subTest(status=status), patch("backend.v3.map_assistant.httpx.post") as post:
                self.app.dependency_overrides[get_access_context] = lambda: context
                response = self.client.post("/api/v3/map-assistant", json={"question":"質問"})
                self.assertEqual(response.status_code,status)
                post.assert_not_called()

    def test_fixed_answers_never_call_openai(self):
        with patch.dict("os.environ", {"OPENAI_API_KEY":"test-key"}), patch("backend.v3.map_assistant.httpx.post") as post:
            for question,answer in FAQ.items():
                response=self.client.post("/api/v3/map-assistant",json={"question":question})
                self.assertEqual(response.json(),{"answer":answer,"mode":"fixed"})
            post.assert_not_called()

    def test_split_usage_routes_local_owner_and_regular_members(self):
        import httpx
        upstream = httpx.Response(200, request=httpx.Request("POST", "https://api.openai.com/v1/responses"),
            json={"output": [{"type": "message", "content": [{"type": "output_text", "text": "回答"}]}]})
        for environment, entitlement, expected in [
            ("local", "active", "test-project-key"),
            ("production", "owner", "test-project-key"),
            ("production", "invite", "regular-project-key"),
            ("production", "active", "regular-project-key"),
        ]:
            with self.subTest(environment=environment, entitlement=entitlement):
                self.app.state.v3_environment = environment
                self.app.dependency_overrides[get_access_context] = lambda: AccessContext(
                    user_id="member", entitlement=entitlement, valid_until=datetime.now(timezone.utc)+timedelta(days=1))
                with patch.dict("os.environ", {"V3_MAP_ASSISTANT_SPLIT_USAGE": "true", "V3_MAP_ASSISTANT_ENABLED": "true",
                        "OPENAI_API_KEY": "regular-project-key", "OPENAI_TEST_API_KEY": "test-project-key"}), \
                        patch("backend.v3.map_assistant.quota", return_value={"remaining": 19}), \
                        patch("backend.v3.map_assistant.httpx.post", return_value=upstream) as post:
                    response = self.client.post("/api/v3/map-assistant", json={"question": "自由質問"})
                    self.assertEqual(response.status_code, 200)
                    self.assertEqual(post.call_args.kwargs["headers"]["Authorization"], f"Bearer {expected}")
                    self.assertNotIn(expected, response.text)
                    self.assertNotIn("usage_group", post.call_args.kwargs["json"]["input"])

    def test_split_missing_or_shared_test_key_never_falls_back(self):
        for test_key in ("", "regular-project-key"):
            with self.subTest(test_key=test_key), patch.dict("os.environ", {
                    "V3_MAP_ASSISTANT_SPLIT_USAGE": "true", "OPENAI_API_KEY": "regular-project-key", "OPENAI_TEST_API_KEY": test_key}), \
                    patch("backend.v3.map_assistant.httpx.post") as post:
                response = self.client.post("/api/v3/map-assistant", json={"question": "自由質問"})
                self.assertEqual(response.status_code, 503)
                post.assert_not_called()
                self.assertNotIn("regular-project-key", response.text)
                fixed = self.client.post("/api/v3/map-assistant", json={"question": next(iter(FAQ))})
                self.assertEqual(fixed.json()["mode"], "fixed")

    def test_split_cannot_be_selected_from_client_payload(self):
        with patch.dict("os.environ", {"V3_MAP_ASSISTANT_SPLIT_USAGE": "true"}), patch("backend.v3.map_assistant.httpx.post") as post:
            response = self.client.post("/api/v3/map-assistant", json={"question": "自由質問", "access_source": "owner"})
            self.assertEqual(response.status_code, 422)
            post.assert_not_called()

    def test_invalid_test_key_does_not_retry_using_regular_key(self):
        import httpx
        upstream = httpx.Response(401, request=httpx.Request("POST", "https://api.openai.com/v1/responses"))
        with patch.dict("os.environ", {"V3_MAP_ASSISTANT_SPLIT_USAGE": "true",
                "OPENAI_TEST_API_KEY": "invalid-test-key", "OPENAI_API_KEY": "regular-project-key"}), \
                patch("backend.v3.map_assistant.httpx.post", return_value=upstream) as post:
            response = self.client.post("/api/v3/map-assistant", json={"question": "自由質問"})
            self.assertEqual(response.status_code, 503)
            post.assert_called_once()
            self.assertEqual(post.call_args.kwargs["headers"]["Authorization"], "Bearer invalid-test-key")
            self.assertEqual(self.client.get("/api/v3/map-assistant/usage").json()["remaining"], 20)

    def test_production_disabled_or_missing_key_fails_closed(self):
        self.app.state.v3_environment="production"
        for enabled,key in [("false","test-key"),("true","")]:
            with patch.dict("os.environ", {"V3_MAP_ASSISTANT_ENABLED":enabled,"OPENAI_API_KEY":key}), patch("backend.v3.map_assistant.httpx.post") as post:
                response=self.client.post("/api/v3/map-assistant",json={"question":"質問"})
                self.assertEqual(response.status_code,503)
                post.assert_not_called()

    def test_untrusted_origin_is_rejected(self):
        with patch("backend.v3.map_assistant.httpx.post") as post:
            response=self.client.post("/api/v3/map-assistant",headers={"origin":"https://example.com"},json={"question":"質問"})
            self.assertEqual(response.status_code,403)
            post.assert_not_called()

    def test_production_owner_invite_and_subscription_can_call(self):
        import httpx
        self.app.state.v3_environment="production"
        def rpc(method,path,*,json):
            self.assertEqual((method,path),('POST','rpc/v3_map_chat_quota'))
            return self.app.state.map_chat_local_quota.call(json['p_user_id'],json['p_action'],json['p_token'],json['p_limit'])
        self.app.state.billing=SimpleNamespace(store=SimpleNamespace(configured=True,request=rpc))
        upstream=httpx.Response(200,request=httpx.Request("POST","https://api.openai.com/v1/responses"),json={"output":[{"type":"message","content":[{"type":"output_text","text":"回答"}]}]})
        for entitlement in ["owner","invite","active"]:
            self.app.dependency_overrides[get_access_context]=lambda: AccessContext(user_id="supabase:testproject:11111111-1111-1111-1111-111111111111",entitlement=entitlement,valid_until=datetime.now(timezone.utc)+timedelta(days=1))
            with patch.dict("os.environ", {"V3_MAP_ASSISTANT_ENABLED":"true","OPENAI_API_KEY":"test-key"}), patch("backend.v3.map_assistant.httpx.post",return_value=upstream) as post:
                response=self.client.post("/api/v3/map-assistant",json={"question":"質問"})
                self.assertEqual(response.status_code,200)
                post.assert_called_once()

    def test_without_key_returns_explicit_demo_answer(self):
        with patch.dict("os.environ", {"OPENAI_API_KEY": ""}):
            response = self.client.post("/api/v3/map-assistant", json={"question": "再生はどう使う？"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["mode"], "demo")
        self.assertIn("再生ボタン", response.json()["answer"])

    def test_with_key_sends_bounded_request_to_responses_api(self):
        class FakeResponse:
            def raise_for_status(self):
                pass

            def json(self):
                return {"output": [{"type": "message", "content": [{"type": "output_text", "text": "天体を選んでください。"}]}]}

        with patch.dict("os.environ", {"OPENAI_API_KEY": "test-key"}), patch("backend.v3.map_assistant.httpx.post", return_value=FakeResponse()) as post:
            response = self.client.post("/api/v3/map-assistant", json={"question": "この地図の見方は？", "context": {"selected_planet": "現行太陽"}})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['answer'], "天体を選んでください。")
        self.assertEqual(response.json()['mode'], 'openai')
        self.assertEqual(response.json()['usage']['remaining'], 19)
        self.assertEqual(post.call_args.args[0], "https://api.openai.com/v1/responses")
        self.assertFalse(post.call_args.kwargs["json"]["store"])
        self.assertEqual(post.call_args.kwargs["json"]["max_output_tokens"], 750)

    def test_input_limits(self):
        response = self.client.post("/api/v3/map-assistant", json={"question": "a" * 501})
        self.assertEqual(response.status_code, 422)

    def test_compact_screen_context_reaches_openai(self):
        import httpx
        screen = {"member_birth":{"date":"2000-01-01","time":"12:00","timezone":"Asia/Tokyo"},
                  "chart_birth":{"date":"1990-02-03"},
                  "aspects":[["T:SUN","N:MOON",90,0.24]], "aspects_total":25,"aspects_omitted":1,
                  "positions":[["T:SUN",120.5]],"planet_mode":"transit",
                  "houses":[["T:SUN",4,3,1,12]],"chart_natal_sun_sign":5}
        upstream = httpx.Response(200,request=httpx.Request("POST","https://api.openai.com/v1/responses"),
                                 json={"output":[{"type":"message","content":[{"type":"output_text","text":"回答"}]}]})
        with patch.dict("os.environ",{"OPENAI_API_KEY":"test-key"}), patch("backend.v3.map_assistant.httpx.post",return_value=upstream) as post:
            response=self.client.post("/api/v3/map-assistant",json={"question":"表示中のアスペクトを説明して","context":screen})
        self.assertEqual(response.status_code,200)
        forwarded=json.loads(post.call_args.kwargs['json']['input'])['screen']
        expected = {**screen, 'houses': [{'point': 'T:SUN', 'sign': '獅子座',
                                         'natal_house': 3, 'chart_time_house': 1, 'solar_house': 12}]}
        self.assertEqual(forwarded,expected)
        self.assertNotIn('tools',post.call_args.kwargs['json'])

    def test_named_house_bases_preserve_unknowns_and_do_not_mutate_input(self):
        context = MapContext(houses=[('T:MARS', 4, None, 2, 12), ('N:SUN', 5, 6, None, None)])
        before = context.model_dump()
        self.assertEqual(_model_screen(context)['houses'], [
            {'point': 'T:MARS', 'sign': '獅子座', 'natal_house': None, 'chart_time_house': 2, 'solar_house': 12},
            {'point': 'N:SUN', 'sign': '乙女座', 'natal_house': 6, 'chart_time_house': None, 'solar_house': None},
        ])
        self.assertEqual(context.model_dump(), before)

    def test_named_house_bases_preserve_distinct_numbers_and_all_signs(self):
        context = MapContext(houses=[('T:MARS', sign, 6, 2, 12) for sign in range(12)])
        rows = _model_screen(context)['houses']
        self.assertEqual(len({row['sign'] for row in rows}), 12)
        for row in rows:
            self.assertEqual((row['natal_house'], row['chart_time_house'], row['solar_house']), (6, 2, 12))
        self.assertNotIn('houses', _model_screen(MapContext()))

    def test_context_limits_and_private_extra_fields_rejected(self):
        for context in [
            {"aspects":[["T:SUN","N:MOON",90,1]]*25},
            {"positions":[["T:SUN",20]]*33},
            {"aspects":[["T:SUN","N:MOON",999,1]]},
            {"member_birth":{"date":"2000-01-01","full_name":"not allowed"}},
            {"member_birth":{"date":"invalid"}},
            {"houses":[["T:SUN",12,1,1,1]]},
            {"houses":[["T:SUN",1,0,1,1]]},
            {"planet_mode":"unknown"},
        ]:
            with patch("backend.v3.map_assistant.httpx.post") as post:
                self.assertEqual(self.client.post("/api/v3/map-assistant",json={"question":"test","context":context}).status_code,422)
                post.assert_not_called()
        response = self.client.post("/api/v3/map-assistant", json={"question": "test", "context": {"birth_date": "2000-01-01"}})
        self.assertEqual(response.status_code, 422)

    def test_invalid_key_has_actionable_error_without_exposing_key(self):
        import httpx

        request = httpx.Request("POST", "https://api.openai.com/v1/responses")
        upstream = httpx.Response(401, request=request)
        with patch.dict("os.environ", {"OPENAI_API_KEY": "test-secret"}), patch(
            "backend.v3.map_assistant.httpx.post", return_value=upstream
        ):
            response = self.client.post("/api/v3/map-assistant", json={"question": "使い方は？"})
        self.assertEqual(response.status_code, 503)
        self.assertIn("APIキー", response.json()["detail"])
        self.assertNotIn("test-secret", str(response.json()))
        self.assertEqual(self.client.get('/api/v3/map-assistant/usage').json()['remaining'],20)

    def test_twenty_successes_then_fixed_still_allowed(self):
        with patch.dict('os.environ',{'OPENAI_API_KEY':'test-key'}), patch('backend.v3.map_assistant.check_request_limit'), patch('backend.v3.map_assistant._request_answer',return_value='回答') as answer:
            for n in range(20):
                response=self.client.post('/api/v3/map-assistant',json={'question':'自由質問'})
                self.assertEqual(response.status_code,200)
                self.assertEqual(response.json()['usage']['remaining'],19-n)
            self.assertEqual(self.client.post('/api/v3/map-assistant',json={'question':'自由質問'}).status_code,429)
            self.assertEqual(self.client.post('/api/v3/map-assistant',json={'question':next(iter(FAQ))}).json()['mode'],'fixed')
            self.assertEqual(answer.call_count,20)

    def test_local_test_account_can_exceed_twenty_without_quota_rows(self):
        self.app.dependency_overrides[get_access_context] = lambda: AccessContext(user_id='local-test-user', entitlement='owner')
        self.assertTrue(self.client.get('/api/v3/map-assistant/usage').json()['unlimited'])
        with patch.dict('os.environ', {'OPENAI_API_KEY': 'test-key'}), patch('backend.v3.map_assistant.check_request_limit'), patch('backend.v3.map_assistant._request_answer', return_value='回答') as answer:
            for _ in range(25):
                response = self.client.post('/api/v3/map-assistant', json={'question': '自由質問'})
                self.assertEqual(response.status_code, 200)
                self.assertTrue(response.json()['usage']['unlimited'])
            self.assertEqual(answer.call_count, 25)
        self.assertEqual(self.app.state.map_chat_local_quota.rows, {})

    def test_failure_and_empty_answer_release_reservation(self):
        import httpx
        for result in [httpx.ConnectError('offline'),httpx.Response(200,request=httpx.Request('POST','https://api.openai.com/v1/responses'),json={'output':[]})]:
            kwargs={'side_effect':result} if isinstance(result,Exception) else {'return_value':result}
            with patch.dict('os.environ',{'OPENAI_API_KEY':'test-key'}), patch('backend.v3.map_assistant.httpx.post',**kwargs):
                self.assertEqual(self.client.post('/api/v3/map-assistant',json={'question':'自由質問'}).status_code,503)
                self.assertEqual(self.client.get('/api/v3/map-assistant/usage').json()['remaining'],20)

    def test_production_without_quota_store_fails_closed(self):
        self.app.state.v3_environment='production'
        with patch.dict('os.environ',{'V3_MAP_ASSISTANT_ENABLED':'true','OPENAI_API_KEY':'test-key'}), patch('backend.v3.map_assistant.httpx.post') as post:
            self.assertEqual(self.client.post('/api/v3/map-assistant',json={'question':'自由質問'}).status_code,503)
            post.assert_not_called()

    def test_usage_requires_paid_access(self):
        for context,status in [(AccessContext(),401),(AccessContext(user_id='free'),403)]:
            self.app.dependency_overrides[get_access_context]=lambda:context
            self.assertEqual(self.client.get('/api/v3/map-assistant/usage').status_code,status)

    def test_expired_reservation_never_returns_a_free_answer(self):
        with patch.dict('os.environ',{'OPENAI_API_KEY':'test-key'}), patch('backend.v3.map_assistant._request_answer',return_value='must not be returned'), patch('backend.v3.map_assistant.quota',side_effect=[{'error':None},{'error':'expired'},{'error':'expired'}]) as quota:
            response=self.client.post('/api/v3/map-assistant',json={'question':'自由質問'})
            self.assertEqual(response.status_code,503)
            self.assertNotIn('must not be returned',response.text)
            self.assertEqual([call.args[2] for call in quota.call_args_list],['reserve','success','failure'])


if __name__ == "__main__":
    unittest.main()
