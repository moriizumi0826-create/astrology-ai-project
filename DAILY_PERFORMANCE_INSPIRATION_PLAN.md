# デイリーパフォーマンス Inspiration 追加計画

## 目的

`デイリーパフォーマンス` に `Inspiration` 指標を追加する。

現在の `Drive / Flow / Friction / Mars` だけでは、海王星・月・金星・水星由来の直感、発想、創造性を自然に扱いにくい。特に海王星絡みを `Drive` や `Flow` に入れると、指標の意味が濁る。

`Inspiration` を追加し、ユーザーがその時間帯に向く行動を判断しやすくする。

## 完成後の指標定義

| 指標 | 表示 | 役割 |
|---|---|---|
| Mars | 面グラフ | 行動量・熱量 |
| Drive | 青ライン | 集中・判断・実行 |
| Flow | 緑ライン | 対人・場のなじみ・協調 |
| Inspiration | 紫ライン | 直感・発想・創造・内省 |
| Friction | 赤ライン | 摩擦・焦燥・混乱・衝突 |

## 設計方針

### Mars

吉凶に関係なく、火星がその時間帯にどれだけ強く作動しているかを見る。

現在の面グラフ表示を維持する。

### Drive

実行、集中、決断、突破力に寄せる。

海王星絡みは原則としてDriveから外すか、大幅に減衰する。

主な対象:

- 太陽
- 水星
- 土星
- 火星の調和角
- 月・水星・火星など短周期天体の実務寄り調和

### Flow

対人協調、場へのなじみ、スムーズなやり取りに寄せる。

`Sync_Flag=1` でも、ハードアスペクト `90 / 150 / 180` はFlow加点しない。必要ならFrictionへ軽く寄せる。

主な対象:

- 月
- 金星
- 木星
- 対人・協調に寄与する調和角

### Inspiration

直感、発想、創作、イメージ、内省に寄せる。

海王星絡みの調和角を主な受け皿にする。

強く入れる候補:

- トランジット海王星 × ネイタル水星 `0 / 60 / 120`
- トランジット海王星 × ネイタル月 `0 / 60 / 120`
- トランジット海王星 × ネイタル金星 `0 / 60 / 120`
- トランジット月 × ネイタル海王星 `0 / 60 / 120`
- トランジット水星 × ネイタル海王星 `0 / 60 / 120`
- トランジット金星 × ネイタル海王星 `0 / 60 / 120`

弱めに入れる候補:

- 海王星 × 太陽
- 木星 × 海王星
- 金星 × 海王星
- 月 × 金星
- 月 × 木星

入れない、またはFriction寄り:

- `90 / 150 / 180` の海王星絡み
- 海王星 × 火星ハード
- 海王星 × 土星ハード
- 海王星 × 冥王星ハード

### Friction

摩擦、焦燥、混乱、衝突、外部ノイズに寄せる。

外惑星トランジットは日内変化が小さいため、係数を下げる。ゼロにはしない。

主な対象:

- 火星ハード
- 月・水星のハードで短時間に効くもの
- 天王星・海王星・冥王星のハード影響

## 想定バックエンド変更

対象ファイル:

```text
backend/app/services/reading_service.py
```

変更対象:

- `_build_daily_performance`
- `_daily_performance_aspect_breakdown`
- `dailyPerformance` レスポンス

追加予定のレスポンス例:

```json
{
  "time": "06:00",
  "hour": 6,
  "marsActivity": 36,
  "drive": 62,
  "flow": 67,
  "inspiration": 58,
  "friction": 64,
  "breakdown": {
    "mars": [],
    "drive": [],
    "flow": [],
    "inspiration": [],
    "friction": []
  }
}
```

追加する定数候補:

```python
DAILY_PERFORMANCE_INSPIRATION_PLANETS = {"MOON", "MERCURY", "VENUS", "JUPITER", "NEPTUNE"}
DAILY_PERFORMANCE_INSPIRATION_ANGLES = {0, 60, 120}
DAILY_PERFORMANCE_HARD_ANGLES = {90, 150, 180}
```

実装方針:

1. `inspiration_sum` または `fast_inspiration` を追加
2. 海王星調和角をInspirationに寄せる
3. 月・水星・金星の感性系調和角をInspirationに弱めに入れる
4. Flowのハード角加点を止める
5. Driveから海王星絡みを除外または減衰
6. `breakdown.inspiration` を開発者画面に返す

## 想定フロントエンド変更

対象ファイル:

```text
frontend/src/dashboard-shared.jsx
```

変更対象:

- `DashboardV2DailyFlowCard`
- `DailyPerformanceDeveloperView`
- iアイコン内の説明

UI方針:

- Mars: 面グラフのみ
- Drive: 青ライン
- Flow: 緑ライン
- Inspiration: 紫ライン
- Friction: 赤ライン

凡例追加:

```text
Inspiration
```

色候補:

```text
#a78bfa
```

ツールチップ追加:

```text
Inspiration 直感・発想・創造性
```

開発者画面:

- 右側の項目に `Inspiration` を追加
- `breakdown.inspiration` の全アスペクトを表示
- 各時間帯のスコアカードにも `Inspiration` を追加

## スコア妥当性チェック観点

実装後、以下を重点的に確認する。

### 1. Flow

`90 / 150 / 180` がFlowを押し上げていないか。

特に以下を確認:

```text
月 × 冥王星 90°
月 × 海王星 90°
金星 × 冥王星 180°
```

### 2. Drive

海王星絡みがDriveを過剰に押し上げていないか。

特に以下を確認:

```text
火星 × 海王星 120°
水星 × 海王星 60°
太陽 × 海王星 120°
```

### 3. Inspiration

海王星・月・金星・水星の調和角がInspirationに入っているか。

ただし、ハード角までInspirationを押し上げていないか確認する。

### 4. Friction

外惑星トランジットが強すぎて時間帯差を潰していないか。

外惑星は背景負荷として扱い、短時間変化の主役にしない。

### 5. Mars

火星総量は吉凶ではなく、火星の作動量として出ているか。

火星ハードはFrictionへ、火星調和はDriveへも反映する。

## 検証対象サンプル

まず以下の出生条件で確認する。

```text
出生日時: 1984-08-26 19:20
緯度: 35.8078
経度: 139.7241
```

重点確認時間帯:

```text
06:00
```

現状の課題:

- Flowに `月 × 冥王星 90°` が入っている
- Driveに `火星 × 海王星 120°` が強めに入っている
- Frictionが外惑星由来で厚くなりやすい
- contribution表示がダンピング前の値で、合計スコアとの関係が分かりにくい

## 実装順序

1. バックエンドに `inspiration` と `breakdown.inspiration` を追加
2. Flowのハード角加点を止める
3. Driveの海王星絡みを除外または減衰
4. 外惑星トランジット係数を再調整
5. フロントのグラフに紫ラインを追加
6. ツールチップとiアイコン説明にInspirationを追加
7. 開発者画面にInspiration内訳を追加
8. 指定出生条件で06:00の妥当性を再チェック

## 実装しないこと

この段階では以下は行わない。

- 新しい有料導線の追加
- 詳細レポートページへの統合
- 年運グラフ側へのInspiration追加
- CSVマスターの大規模修正

まずはデイリーパフォーマンス内で、海王星と感性系アスペクトの受け皿を作ることを優先する。
