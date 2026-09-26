"""Read-only public smoke check for the V3 production frontend and API."""

import argparse
import json
import sys
from html.parser import HTMLParser
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen


FRONTEND = "https://thecelestialatelier.com"
API = "https://api.thecelestialatelier.com"
LEGAL_PAGES = {
    "terms": "利用規約",
    "privacy": "プライバシーポリシー",
    "commerce": "特定商取引法に基づく表記",
    "disclaimer": "免責事項",
    "contact": "お問い合わせ",
}


class HealthFailure(Exception):
    pass


class PageAssets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.scripts = []
        self.title = ""
        self.in_title = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "title":
            self.in_title = True
        if tag == "script" and attrs.get("src"):
            self.scripts.append(attrs["src"])

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False

    def handle_data(self, data):
        if self.in_title:
            self.title += data


def fetch(url, timeout):
    request = Request(url, headers={"User-Agent": "CelestialAtelierV3Health/1.0"})
    try:
        with urlopen(request, timeout=timeout) as response:
            if response.status != 200 or urlsplit(response.geturl()).netloc != urlsplit(url).netloc:
                raise HealthFailure(f"unexpected response: {url}")
            return response.headers.get_content_type(), response.read(2_000_001)
    except (HTTPError, URLError, TimeoutError) as exc:
        raise HealthFailure(f"request failed: {url} ({type(exc).__name__})") from exc


def check_frontend(page, timeout):
    url = f"{FRONTEND}/{page}"
    content_type, body = fetch(url, timeout)
    if content_type != "text/html" or len(body) > 2_000_000:
        raise HealthFailure(f"invalid HTML response: {page}")
    parser = PageAssets()
    parser.feed(body.decode("utf-8"))
    if "The Celestial Atelier" not in parser.title or not parser.scripts:
        raise HealthFailure(f"missing V3 page content: {page}")
    same_origin_scripts = [urljoin(url, src) for src in parser.scripts
                           if urlsplit(urljoin(url, src)).netloc == urlsplit(url).netloc]
    if not same_origin_scripts:
        raise HealthFailure(f"missing local JavaScript: {page}")
    for script_url in same_origin_scripts:
        script_type, script = fetch(script_url, timeout)
        if script_type not in ("text/javascript", "application/javascript") or not script or len(script) > 2_000_000:
            raise HealthFailure(f"invalid JavaScript asset: {page}")


def check_api(timeout):
    content_type, body = fetch(f"{API}/api/v3/health", timeout)
    if content_type != "application/json" or len(body) > 2_000_000:
        raise HealthFailure("invalid API health response")
    try:
        result = json.loads(body)
    except (UnicodeDecodeError, ValueError) as exc:
        raise HealthFailure("invalid API health JSON") from exc
    if result.get("status") != "ok" or result.get("environment") != "production":
        raise HealthFailure("API is not healthy production")


def check_legal_pages(timeout):
    for slug, title in LEGAL_PAGES.items():
        page = f"legal/{slug}.html"
        content_type, body = fetch(f"{FRONTEND}/{page}", timeout)
        if content_type != "text/html" or len(body) > 2_000_000:
            raise HealthFailure(f"invalid legal HTML response: {page}")
        parser = PageAssets()
        try:
            parser.feed(body.decode("utf-8"))
        except UnicodeDecodeError as exc:
            raise HealthFailure(f"invalid legal HTML encoding: {page}") from exc
        if title not in parser.title or "The Celestial Atelier" not in parser.title:
            raise HealthFailure(f"missing legal page title: {page}")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--timeout", type=float, default=10.0)
    args = parser.parse_args(argv)
    if args.timeout <= 0:
        parser.error("--timeout must be positive")
    try:
        for page in ("entry.html", "index.html"):
            check_frontend(page, args.timeout)
        check_legal_pages(args.timeout)
        check_api(args.timeout)
    except HealthFailure as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1
    print("OK: V3 entry, horoscope, legal pages, JavaScript assets, and API health")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
