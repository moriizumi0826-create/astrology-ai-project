import unittest
from unittest.mock import patch

from backend.tests.test_v3_access import local_test_client
from backend.v3.app import create_app


class MapAssistantPrototypeTests(unittest.TestCase):
    def setUp(self):
        self.client = local_test_client(create_app(auth_mode="local_test"))

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
        self.assertEqual(response.json(), {"answer": "天体を選んでください。", "mode": "openai"})
        self.assertEqual(post.call_args.args[0], "https://api.openai.com/v1/responses")
        self.assertFalse(post.call_args.kwargs["json"]["store"])
        self.assertEqual(post.call_args.kwargs["json"]["max_output_tokens"], 450)

    def test_input_limits(self):
        response = self.client.post("/api/v3/map-assistant", json={"question": "a" * 501})
        self.assertEqual(response.status_code, 422)
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


if __name__ == "__main__":
    unittest.main()
