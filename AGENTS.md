# AGENTS.md

## 目的

このリポジトリは、占星術の既存 Python ロジックを Web から呼べるテスト運用版として扱う。

## ディレクトリ

- `frontend/`: Stitch ベースの UI。Vite で起動する。
- `backend/`: FastAPI API。本番ではここを単独配備できる前提で編集する。
- `scripts/`: 既存の鑑定ロジックと CSV ローダー。破壊的な変更は避ける。
- `database/`: マスタ CSV / prompt。
- `output/`: ローカル出力用。API では一時ディレクトリを使う。

## 実行方法

- Backend: `python3 -m uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000`
- Frontend: `cd frontend && npm run dev -- --host 0.0.0.0 --port 5173`
- Tests: `python3 -m unittest backend.tests.test_api -v`

## ルール

- フロントとバックは分離を維持する。
- API キーや秘密情報をコードへ直書きしない。`.env` を使う。
- `pyswisseph` が入らない環境では live reading は動かない。検証時は API の起動確認とユニットテストを優先する。
- Stitch の見た目を大きく壊さず、色・余白・書体の方針を維持する。
- 既存の `scripts/` は再利用を優先し、大規模な全面改修は避ける。
- 本番移行を見据え、API URL と CORS は環境変数で管理する。
