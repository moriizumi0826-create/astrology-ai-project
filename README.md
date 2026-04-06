# Celestial Atelier Test Site

Stitch で作成した UI をベースに、既存の Python 占星術ロジックを Web 画面から呼べるテスト運用版です。構成は `frontend` と `backend` を分離し、将来の VPS / レンタルサーバー移行を妨げない最小構成にしています。

## 構成

- `frontend/`: Vite で配信する静的フロントエンド。Stitch の HTML/Tailwind をベースにトップ、入力フォーム、結果表示を実装。
- `backend/`: FastAPI ベースの Python API。入力値を受けて出生図 CSV を一時計算し、既存の prompt / loader ロジックで鑑定を生成。
- `scripts/`: 既存ロジック。`natal_loader.py` と `transit_loader.py` を API から再利用。
- `database/`: prompt やマスタ CSV。
- `output/`: 既存のローカル出力置き場。API リクエスト処理では一時ディレクトリを使用。

## セットアップ

1. ルートに `.env` を作成

```bash
cp .env.example .env
```

2. `.env` に `OPENAI_API_KEY` を設定

3. Python 依存関係をインストール

```bash
python3 -m pip install --user --break-system-packages -r requirements.txt
```

`pyswisseph` は C 拡張です。Linux / WSL では `python3-dev` やビルドツールが必要になる場合があります。導入できない環境でも API の起動確認とユニットテストは可能ですが、実際の出生図計算は `swisseph` 導入後に有効になります。

4. フロントエンド依存関係をインストール

```bash
cd frontend
npm install
cd ..
```

## 起動方法

バックエンド:

```bash
python3 -m uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

フロントエンド:

```bash
cd frontend
npm run dev -- --host 0.0.0.0 --port 5173
```

アクセス先:

- Frontend: `http://localhost:5173`
- Backend health: `http://127.0.0.1:8000/api/health`

## API

### `POST /api/readings`

リクエスト JSON:

```json
{
  "full_name": "Test User",
  "birth_date": "1984-08-26",
  "birth_time": "19:20",
  "birthplace": "Tokyo",
  "latitude": 35.6812,
  "longitude": 139.7671,
  "timezone_offset": 9
}
```

レスポンス:

- `meta`: 入力情報
- `chart_data`: prompt 差し込みに使うネイタル要約
- `readings`: `personality`, `love`, `career`
- `transit_ready`: 将来の transit 拡張用データがロード可能かどうか

## テスト

```bash
python3 -m unittest backend.tests.test_api -v
```

フロントエンドのビルド確認:

```bash
cd frontend
npm run build
```

## テスト運用時の構成

- フロントは Vite でローカル配信し、将来は Vercel などへそのまま載せやすい構成です。
- バックエンドは FastAPI 単体で動くため、VPS / レンタルサーバーへ切り出しやすいです。
- API URL は `VITE_API_BASE_URL`、秘密情報は `OPENAI_API_KEY` で管理します。
- 認証は未実装ですが、`backend/app/main.py` に middleware や dependency を足せば拡張できます。
- 実際の出生図計算には `pyswisseph` が必要です。導入できないサンドボックスでは live reading 実行までの完全検証はできません。

## 将来移行時の注意点

- 本番では `.env` をホスティング側の環境変数へ移してください。
- `API_CORS_ORIGINS` に本番フロントの URL を追加してください。
- ジオコーディングは未実装です。運用で出生地名だけを受けたい場合は、別途 geocoding API を追加してください。
- 現在は OpenAI API を直接呼び出します。レート制御や簡易認証が必要になったら backend 側へ追加してください。
