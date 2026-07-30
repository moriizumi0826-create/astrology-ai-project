# 占星術AIプロジェクト（Celestial Atelier）技術仕様書

本ドキュメントは、本プロジェクトのフロントエンドおよびバックエンドの仕様を詳細にまとめたものです。他のAIチャットや開発者がプロジェクトを引き継ぐ際のガイドラインとして利用してください。

---

## 1. プロジェクト概要

「Celestial Atelier」は、既存のPython占星術ロジックをWebインターフェースから利用可能にするためのテスト運用版アプリケーションです。ユーザーの出生情報（日時・場所）から出生図（ネイタルチャート）を計算し、AI（OpenAI API）を活用して詳細な鑑定文を生成します。

---

## 2. システム構成

- **フロントエンド**: Vite + Vanilla JS + Tailwind CSS (StitchベースのUI)
- **バックエンド**: FastAPI (Python)
- **計算エンジン**: 既存のPythonスクリプト群（`scripts/`） + `pyswisseph`
- **データ層**: CSV形式のマスターデータ（`database/`）

---

## 3. バックエンド仕様 (Backend)

### 3.1 ディレクトリ構造
- `backend/app/main.py`: エントリポイント、APIエンドポイント定義。
- `backend/app/schemas.py`: Pydanticモデル（リクエスト/レスポンス定義）。
- `backend/app/settings.py`: 環境変数および設定管理。
- `backend/app/services/`: 
    - `reading_service.py`: 鑑定生成のメインロジック。`scripts/`の呼び出しを担当。
    - `geocoding_service.py`: Open-MeteoおよびNominatim APIを使用したジオコーディング。
    - `chart_calculator.py`: 天体位置計算のラッパー。

### 3.2 APIエンドポイント

#### 1. ジオコーディング検索
- **URL**: `GET /api/location-search`
- **クエリパラメータ**:
    - `q` (str): 検索地名
    - `prefecture` (str, optional): 都道府県名
    - `birth_date` (date, optional): 時差計算用
    - `birth_time` (time, optional): 時差計算用
- **概要**: 入力された地名から緯度・経度・タイムゾーン・UTCオフセットを取得します。

#### 2. 鑑定生成
- **URL**: `POST /api/readings`
- **リクエストボディ**: `ReadingRequest` (JSON)
    - `full_name`, `birth_date`, `birth_time`, `birthplace`, `latitude`, `longitude`, `timezone_offset` 等
- **レスポンス**: `ReadingResponse` (JSON)
    - `meta`: 入力情報の復唱
    - `chart_data`: AIプロンプトに使用された天体データ（サイン・ハウス等）
    - `readings`: セクション別の鑑定文リスト
    - `transit_ready`: トランジット計算が可能かどうかのフラグ

### 3.3 環境変数 (`.env`)
- `OPENAI_API_KEY`: 鑑定文生成に使用するOpenAIのキー。
- `OPENAI_MODEL`: 使用するモデル（例: `gpt-4o`）。
- `API_CORS_ORIGINS`: フロントエンドのURL（カンマ区切り）。
- `GEOCODING_BASE_URL`: ジオコーディングAPIのベースURL。

---

## 4. フロントエンド仕様 (Frontend)

### 4.1 ディレクトリ構造
- `frontend/index.html`: 入力フォーム画面。
- `frontend/results.html`: 鑑定結果表示画面。
- `frontend/src/main.js`: フォーム入力、ジオコーディング連携、API送信ロジック。
- `frontend/src/results.js`: `sessionStorage`から結果を読み込み、画面にレンダリングするロジック。

### 4.2 主要機能
- **入力フォーム**: 名前、生年月日、出生時間（不明対応）、出生地（都道府県＋市区町村）。
- **ジオコーディング連携**: 地名入力時に「出生地を検索」ボタンでAPIを叩き、緯度・経度・タイムゾーンを自動補完します。
- **永続化**:
    - フォーム入力内容: `localStorage` (`celestial-atelier:last-reading-form`)
    - 鑑定結果: `sessionStorage` (`celestial-atelier:last-reading-result`)
- **結果表示**: 
    - 「第〇章」形式のテキストをパースし、アコーディオン形式で表示。
    - 特定のキーワード（恋愛、仕事等）に基づき、トピック別に内容を抽出・整理して表示。
- **ダッシュボード表示**: 鑑定結果の上部に、その日の運勢を視覚的に要約したダッシュボードを表示します（後述）。

### 4.3 デザインシステム
- **テーマ**: "Celestial Atelier" (高貴、神秘的、プレミアムなデザイン)。
- **フォント**: Noto Serif JP, Noto Sans JP。
- **コンポーネント**: StitchベースのTailwind CSSクラスを使用。

### 4.4 トランジット・ダッシュボード (Dashboard)

鑑定結果ページ（`results.html`）の最上部に表示される「Transit Operations Dashboard」は、ユーザーのその日の状態を直感的に把握するための高度なUIコンポーネントです。

#### 1. 構成と実装
- **技術スタック**: React + Lucide-react (アイコン)
- **エントリポイント**: `src/results-dashboard.jsx`
- **コンポーネント定義**: `src/dashboard-shared.jsx`
- **統合方法**: `results.html` 内の `#dashboard-prototype` 要素に対して React ルートをマウントしています。

#### 2. 主要サブコンポーネント
1.  **Status Dashboard (Hero)**: 
    - 今日の星模様ランク（B+など）と、それに基づく具体的な指針・要約を表示。
    - 「ロジック安定指標」として、意思決定の整合性や感情の同期率などをプログレスバーで視覚化。
2.  **Countdown Widget**: 
    - 「恋愛運・追い風モード」などの特定の運勢が切り替わるまでの残り日数を表示。
    - 準備率をプログレスバーで示し、再訪を促すフックとして機能します。
3.  **Resource Timeline**: 
    - 24時間を数ブロック（朝・昼・夜など）に分け、それぞれの時間帯の「スコア」と「推奨アクション」を表示。
    - ユーザーがどの時間帯に重要な決断や作業を行うべきかのガイドラインを提供します。
4.  **Topic Cards**: 
    - 「仕事」「対人バリア」「体調」といったカテゴリ別に、現在のステータスを数値とトーン（色）で表示。
5.  **Premium AI Preview**: 
    - 有料版で提供される「パーソナライズAIチャット」のプレビュー。
    - ロックされた（ボカシのかかった）回答例を表示し、アップセルを促進するUI。

#### 3. データ構造 (`dashboardData`)
現在は `dashboard-shared.jsx` 内に定義された静的な `dashboardData` オブジェクトを使用していますが、将来的にバックエンドの計算結果と連動することを想定した設計になっています。
- `hero`: ランク、タイトル、ガイドライン、サマリー、診断指標。
- `countdown`: タイトル、残り日数、総日数、注釈。
- `timeline`: 時間枠、スコア、推奨事項、詳細説明の配列。
- `topics`: カテゴリ名、アイコン、数値、説明文、カラーテーマ。

---

## 5. ロジック・データ仕様 (Scripts & Database)

### 5.1 占星術計算 (`scripts/`)
- `calc_planets.py`: `swisseph`を使用して天体の度数を算出。
- `natal_loader.py`: ネイタルチャートのデータをAPI向けに整形。
- `generate_reading.py`: AIプロンプトの組み立てとOpenAI APIの呼び出し。

### 5.2 マスターデータ (`database/`)
- `M_Aspect_Interpretation.csv`: アスペクト解釈のベースデータ。
- `planet_sign_house.csv`: 天体・サイン・ハウスの組み合わせ解釈。
- `ai_prompt.csv`: AIへの指示書（システムプロンプト）。

---

## 6. 引き継ぎ時の注意点

1. **`pyswisseph`の依存関係**: ローカル計算を行うにはCライブラリの`swisseph`が必要です。インストールできない環境ではエラーになるため、モック化するか環境を整える必要があります。
2. **AIプロンプトの調整**: 鑑定文の質を変えたい場合は、`database/ai_prompt.csv` または `scripts/generate_reading.py` 内のプロンプト構築ロジックを修正してください。
3. **CORS設定**: バックエンドをデプロイする際は、フロントエンドのドメインを `.env` の `API_CORS_ORIGINS` に必ず追加してください。
4. **結果のパース**: フロントエンドは `【第1章：...】` という形式の文字列をセクション区切りとして認識します。AIの出力フォーマットを変更する場合は、`results.js` の `splitReportSections` 関数も合わせて調整してください。
