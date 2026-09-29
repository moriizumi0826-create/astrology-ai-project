"""Start the local V3 API with an OpenAI key entered without echoing or saving it."""

import getpass
import os
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))


def main() -> None:
    key = getpass.getpass("OpenAI API key (入力は表示されません): ").strip()
    if not key:
        raise SystemExit("APIキーが空です。起動を中止しました。")
    os.environ["OPENAI_API_KEY"] = key
    del key

    import uvicorn
    from backend.v3.app import create_app

    print("V3ローカルAPIを http://127.0.0.1:8104 で起動します。終了するには Ctrl+C。")
    uvicorn.run(create_app(auth_mode="local_test"), host="127.0.0.1", port=8104, proxy_headers=False)


if __name__ == "__main__":
    main()
