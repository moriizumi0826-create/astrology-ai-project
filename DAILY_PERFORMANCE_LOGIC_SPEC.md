# デイリーパフォーマンス計算仕様

## 対象UI

V2ダッシュボードの `デイリーパフォーマンス` グラフ。

旧UIの `リソース最適化・タイムライン` とは別系統の表示として扱う。旧タイムラインの計算ロジックは残し、V2では新規レスポンス項目 `dailyPerformance` を使用する。

## 実装箇所

- バックエンド: `backend/app/services/reading_service.py`
- フロントエンド: `frontend/src/dashboard-shared.jsx`

主なバックエンド関数:

- `_build_daily_performance`
- `_daily_performance_dignity`
- `_daily_performance_mars_bonus`

レスポンス項目:

```json
"dailyPerformance": [
  {
    "time": "06:00",
    "hour": 6,
    "drive": 80,
    "flow": 48,
    "friction": 100,
    "marsActivity": 60,
    "sourceAspects": []
  }
]
```

## 時間スロット

3時間刻みで1日を評価する。

```text
06:00
09:00
12:00
15:00
18:00
21:00
00:00
03:00
```

`00:00` と `03:00` は翌日側の深夜として扱う。

## 3軸

### Drive

表示名:

```text
Drive
```

意味:

```text
集中力・突破力
```

主な材料:

- 太陽
- 水星
- 土星
- 火星の調和アスペクト
- 月、水星、火星など短周期天体のオーブ接近度

火星の扱い:

- 火星の `0度 / 60度 / 120度` を Drive に加算
- `Score_Impact` がプラスの火星アスペクトを推進力として扱う
- `Essential_Dignity_Score` がプラスの場合はDrive側に寄与

### Flow

表示名:

```text
Flow
```

意味:

```text
同調性・対人協調
```

主な材料:

- 月
- 金星
- 木星
- 月の `Sync_Flag`
- 月のオーブ接近度

火星はFlowには入れない。火星は対人協調よりも推進力または摩擦として扱う。

### Friction

表示名:

```text
Friction
```

意味:

```text
摩擦・焦燥警戒度
```

主な材料:

- 天王星
- 海王星
- 冥王星
- 火星の不調和アスペクト
- 月、水星、火星など短周期天体のハード影響

火星の扱い:

- 火星の `90度 / 150度 / 180度` を Friction に加算
- `Score_Impact` がマイナスの火星アスペクトを摩擦として扱う
- `Essential_Dignity_Score` がマイナスの場合はFriction側に寄与

## MarsActivity

表示名候補:

```text
Mars Total Activity
```

意味:

```text
火星の総アクティブ量
```

Drive / Friction の吉凶判定とは別に、火星がその時間帯にどれだけ強く作動しているかを数値化する。

計算材料:

- 火星アスペクトのオーブ接近度
- `Essential_Dignity_Score` の絶対値
- `M_Daily_Vibe_Logic` の火星イベント

基本方針:

- 吉角か凶角かは問わない
- 火星が強く働いていること自体を評価する
- UIではグラフ背景の赤系グローに反映する

## Essential_Dignity_Score の扱い

`M_Aspect_Interpretation` の `Essential_Dignity_Score` を使用する。

用途は2つ。

### 1. MarsActivity

火星総量では絶対値として使う。

理由:

```text
火星の出力が強いかどうかを見る指標であり、良い悪いを分ける指標ではないため
```

### 2. Drive / Friction

Drive / Friction では符号を見て使う。

- プラス品格: Drive側に寄与
- マイナス品格: Friction側に寄与

## Daily Vibe 連携

`M_Daily_Vibe_Logic` の火星イベントを `marsActivity` に加算する。

現在の扱い:

- 火星 `OUT_OF_BOUNDS`: `+50`
- 火星 `RETROGRADE START`: `+35`

これはDriveやFrictionへ直接入れるのではなく、火星総量として扱う。

## フロントエンド表示

`DashboardV2DailyFlowCard` は `data.dailyPerformance` を読む。

存在しない場合のみ固定フォールバック値を使う。

グラフ表示:

- Drive: 青ライン
- Flow: 緑ライン
- Friction: 赤ライン、下方向へ描画
- MarsActivity: 背景の赤系グロー
- 現在時刻: 縦のゴールドライン

## 旧UIタイムラインとの違い

旧UIの `リソース最適化・タイムライン` は、時間帯ごとに優先アスペクトを選び、`M_Timeline_Advice` と組み合わせてアドバイスを出す設計。

V2の `デイリーパフォーマンス` は、個別アドバイスよりも1日の状態変化を可視化する計器として扱う。

違い:

| 項目 | 旧UIタイムライン | V2デイリーパフォーマンス |
|---|---|---|
| 目的 | 時間帯ごとの行動提案 | 1日の状態変化の可視化 |
| 主な出力 | title, recommendation, score | Drive, Flow, Friction, MarsActivity |
| 表示形式 | タイムラインカード | 折れ線グラフ |
| 火星総量 | なし | あり |
| 外惑星 | スコアに直接影響 | 背景ノイズとして弱めに扱う |

## 現在の調整方針

B案を採用。

```text
外惑星は背景ノイズとして薄く残し、時間帯の山谷は月・水星・火星のオーブ変化で出す
```

理由:

- 外惑星は1日の中でほぼ動かない
- 外惑星を強く入れるとFrictionが固定値のように見える
- ダッシュボードの計器としては、短周期天体の時間変化を強めた方が意味が伝わりやすい

## 直近の検証値

テスト条件:

```text
birth_date: 1990-01-01
birth_time: 12:00
birthplace: Tokyo
date: 2026-05-20
```

出力例:

```text
06:00  Drive 80   Flow 48   Friction 100  Mars 60
09:00  Drive 91   Flow 58   Friction 100  Mars 59
12:00  Drive 100  Flow 69   Friction 94   Mars 59
15:00  Drive 100  Flow 75   Friction 78   Mars 59
18:00  Drive 95   Flow 64   Friction 69   Mars 59
21:00  Drive 86   Flow 54   Friction 64   Mars 59
00:00  Drive 86   Flow 48   Friction 77   Mars 100
03:00  Drive 86   Flow 46   Friction 88   Mars 100
```

## 注意点

ブラウザに保存済みの古い鑑定結果には `dailyPerformance` が入っていない。

その場合、フロントエンドは固定フォールバック値を表示する。実データ反映を確認するには、バックエンド再起動後にフォームから再計算する。

## 今後の調整候補

- Driveが100に張り付きやすい場合は `fast_drive` 係数を下げる
- Frictionが強すぎる場合は `fast_friction` または `mars_friction` 係数を下げる
- Flowの変化が弱い場合は月の `Sync_Flag` とオーブ接近度の係数を上げる
- `sourceAspects` をUIツールチップに出すと、各時間帯の根拠を説明できる
