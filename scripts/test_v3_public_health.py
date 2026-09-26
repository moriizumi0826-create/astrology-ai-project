import unittest
from unittest.mock import patch

from scripts import v3_public_health as health


class PublicHealthTests(unittest.TestCase):
    def test_frontend_checks_html_and_local_script(self):
        html = b'<title>The Celestial Atelier | Horoscope</title><script src="/assets/app.js"></script>'
        with patch.object(health, "fetch", side_effect=[("text/html", html),
                                                        ("text/javascript", b"console.log(1)")]) as fetch:
            health.check_frontend("index.html", 3)
        self.assertEqual(fetch.call_args_list[1].args[0],
                         "https://thecelestialatelier.com/assets/app.js")

    def test_frontend_rejects_missing_script(self):
        with patch.object(health, "fetch", return_value=("text/html", b"<title>The Celestial Atelier</title>")):
            with self.assertRaises(health.HealthFailure):
                health.check_frontend("index.html", 3)

    def test_api_requires_production_status(self):
        with patch.object(health, "fetch", return_value=("application/json", b'{"status":"ok","environment":"preview"}')):
            with self.assertRaises(health.HealthFailure):
                health.check_api(3)

    def test_legal_pages_require_their_own_titles(self):
        def legal_page(url, _timeout):
            slug = url.rsplit("/", 1)[-1].removesuffix(".html")
            title = health.LEGAL_PAGES[slug]
            return "text/html", f"<title>{title} | The Celestial Atelier</title>".encode()

        with patch.object(health, "fetch", side_effect=legal_page) as fetch:
            health.check_legal_pages(3)
        self.assertEqual(fetch.call_count, 5)

        with patch.object(health, "fetch", return_value=("text/html", b"<title>The Celestial Atelier | V3</title>")):
            with self.assertRaises(health.HealthFailure):
                health.check_legal_pages(3)


if __name__ == "__main__":
    unittest.main()
