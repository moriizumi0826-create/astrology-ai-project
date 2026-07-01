# デイリーパフォーマンス時間帯別アドバイス 修正プラン

## 目的

デイリーパフォーマンスの各指標をもとに、3時間ごとの推奨アクションをより自然に出し分ける。

現状は `High_Metric` と `Low_Metric` を1つずつ選び、その組み合わせで文章を決めている。
しかし、以下の問題がある。

- Mars は変化が少なく、低く出やすいため `Low_Metric` として拾われすぎる。
- Friction は能力値ではなく負荷・摩擦・焦りの指標なので、通常の「高い指標」と同列に扱うと意味が崩れる。
- 高い指標が2つある場合、低い指標が2つある場合、全体が平均的な場合を表現できない。
- 最大値と最小値の差が小さいときでも、無理に最高/最低を選んでしまう。
- 文章パターンが単純なペア前提になっており、実際の状態のニュアンスが抜ける。

## 基本方針

### 通常の主判定に使う指標

主判定は以下の3指標を中心にする。

- `Drive`
- `Flow`
- `Inspiration`

### 別扱いする指標

以下は通常の高低ペア判定から分離する。

- `Mars`
  - 行動量・身体的な起動力の補助情報として扱う。
  - 文章選択の主軸にはしない。
- `Friction`
  - 摩擦・焦り・負荷・消耗リスクとして扱う。
  - 高い場合は「良い特徴」ではなく注意補正として扱う。

## 必要なパターン分類

### 1. 通常ペア

`Drive / Flow / Inspiration` のうち、明確に高いものと低いものが1つずつある場合。

例:

- Drive 高 / Flow 低
- Flow 高 / Inspiration 低
- Inspiration 高 / Drive 低

用途:

- 作業適性をシンプルに出す。
- 現状CSVの `High_Metric / Low_Metric` に近い。

### 2. 高い指標が2つある

上位2指標の差が小さく、両方高い場合。

必要な組み合わせ:

- Drive + Flow
- Drive + Inspiration
- Flow + Inspiration

用途:

- Drive + Flow: 実務処理と調整の両方に向く。
- Drive + Inspiration: 設計、企画、文章化、集中して考える作業に向く。
- Flow + Inspiration: 対話、相談、アイデア共有、柔らかい調整に向く。

### 3. 低い指標が2つある

下位2指標の差が小さく、両方低い場合。

必要な組み合わせ:

- Drive + Flow 低
- Drive + Inspiration 低
- Flow + Inspiration 低

用途:

- 深い判断や対人調整を避ける。
- 確認、棚卸し、保留、軽作業、休養寄りの行動に誘導する。

### 4. 全体的に平均的で特徴がない

最大値と最小値の差が小さい場合。

分類案:

- `BALANCED_NEUTRAL`
- `BALANCED_SLIGHT_POSITIVE`
- `BALANCED_SLIGHT_HEAVY`

用途:

- 無理に「今日はこれが強い」と言わない。
- 予定通り、淡々と進める、細かい調整をする、という文章を出す。

### 5. 全体的に高い

Drive / Flow / Inspiration が全体的に高い場合。

分類案:

- `ALL_HIGH_STABLE`
- `ALL_HIGH_WITH_FRICTION`

用途:

- `ALL_HIGH_STABLE`: 大きめの作業、重要タスク、前進に向く。
- `ALL_HIGH_WITH_FRICTION`: 能力は出るが焦りや摩擦も強いので、短時間集中や優先順位制限を促す。

### 6. 全体的に低い

Drive / Flow / Inspiration が全体的に低い場合。

分類案:

- `ALL_LOW_RECOVERY`
- `ALL_LOW_MAINTENANCE`
- `ALL_LOW_DECISION_AVOID`

用途:

- 休養、最低限の確認、環境整備、判断保留に誘導する。
- 「何もするな」だけでなく、低負荷でできる行動を提示する。

### 7. Friction 高

Friction は高いほど良い指標ではないため、別分類にする。

分類案:

- `FRICTION_SPIKE_ONLY`
- `FRICTION_HIGH_WITH_DRIVE`
- `FRICTION_HIGH_WITH_FLOW`
- `FRICTION_HIGH_WITH_INSPIRATION`
- `FRICTION_HIGH_ALL_LOW`
- `FRICTION_HIGH_ALL_HIGH`

用途:

- 焦り、衝突、判断ミス、過負荷を避ける文を混ぜる。
- Drive が高い場合でも「押し切る」ではなく「短く区切る」「確認を挟む」に寄せる。

### 8. Mars 補助状態

Mars は文章選択の主軸にしない。
ただし補助情報として表示・文章調整には使える。

分類案:

- `MARS_HIGH`
- `MARS_NEUTRAL`
- `MARS_LOW`

用途:

- `MARS_HIGH`: 短時間の実行、移動、片付け、身体を使う作業を少し足す。
- `MARS_LOW`: 行動量を増やさず、省エネ進行にする。
- `MARS_NEUTRAL`: 特別な補正なし。

## 判定ロジック案

### 対象スコア

主判定:

- `drive`
- `flow`
- `inspiration`

補助判定:

- `friction`
- `marsActivity`

### 閾値案

- 高い: `70以上`
- 低い: `35以下`
- 平均帯: `40〜60`
- フラット判定: 最大値と最小値の差が `10未満`
- 上位2つ同等: 上位2指標の差が `5以内`
- 下位2つ同等: 下位2指標の差が `5以内`
- Friction高: `65以上`
- Friction強警戒: `80以上`
- Mars高: `70以上`
- Mars低: `35以下`

閾値は実データを見て調整する。

## CSV設計案

現状の `M_Daily_Performance_Action_Advice.csv` は以下の列を持つ。

- `Advice_ID`
- `Time_Block`
- `High_Metric`
- `High_Min`
- `Low_Metric`
- `Low_Max`
- `Priority`
- `Action_Mode`
- `Headline`
- `Recommended_Action`
- `Thinking_Style`
- `Rest_Guidance`
- `Variant`

今後追加したい列:

- `Pattern_Type`
- `Primary_High_Metric`
- `Secondary_High_Metric`
- `Primary_Low_Metric`
- `Secondary_Low_Metric`
- `Overall_Level`
- `Spread_Min`
- `Spread_Max`
- `Friction_State`
- `Mars_State`
- `Min_Score`
- `Max_Score`

### Pattern_Type 候補

- `PAIR_HIGH_LOW`
- `DUAL_HIGH`
- `DUAL_LOW`
- `BALANCED`
- `ALL_HIGH`
- `ALL_LOW`
- `FRICTION_SPIKE`
- `FRICTION_WITH_HIGH`
- `FRICTION_WITH_LOW`

## 実装ステップ

### Step 1. 判定関数を分離

`_daily_performance_metric_extremes` を拡張または置き換える。

新規関数案:

- `_daily_performance_action_pattern(point)`

返却例:

```json
{
  "patternType": "DUAL_HIGH",
  "primaryHighMetric": "DRIVE",
  "secondaryHighMetric": "INSPIRATION",
  "primaryLowMetric": "FLOW",
  "secondaryLowMetric": "",
  "overallLevel": "MIXED",
  "frictionState": "HIGH",
  "marsState": "LOW",
  "spread": 24
}
```

### Step 2. CSVを新設計に拡張

既存CSVを破壊せず、まず列追加で対応する。

優先追加:

- `Pattern_Type`
- `Primary_High_Metric`
- `Secondary_High_Metric`
- `Primary_Low_Metric`
- `Secondary_Low_Metric`
- `Friction_State`
- `Mars_State`

既存の `High_Metric / Low_Metric` は互換用に残す。

### Step 3. 文章パターンを増やす

最低限必要な行数目安:

- 通常ペア: 6通り × 3 Variant = 18
- Dual High: 3通り × 4 Variant = 12
- Dual Low: 3通り × 4 Variant = 12
- Balanced: 3分類 × 5 Variant = 15
- All High: 2分類 × 5 Variant = 10
- All Low: 3分類 × 5 Variant = 15
- Friction系: 6分類 × 4 Variant = 24

合計目安: 100行前後

### Step 4. 選択優先順位

判定優先順位案:

1. Friction 強警戒
2. All Low
3. All High
4. Balanced
5. Dual High
6. Dual Low
7. 通常ペア

Friction が高い場合は、基本パターンに上書きするか、`Friction_State` 条件付き行を優先する。

### Step 5. UI表示

時間帯別アドバイス枠では、主パターンと補助状態を分けて表示する。

表示案:

- 主状態: `Drive + Inspiration 高`
- 注意: `Friction 高`
- 補助: `Mars 低`

今のように `High / Low / Mars` を横並びにするだけでは、Frictionの意味が伝わりにくい。
Frictionは `注意` として別表示にする。

### Step 6. テスト

追加すべきテスト:

- Mars が低くても `Low_Metric` にならない。
- Friction が高い場合、通常の高指標ではなく `Friction_State` として扱われる。
- 上位2指標が近い場合 `DUAL_HIGH` になる。
- 下位2指標が近い場合 `DUAL_LOW` になる。
- 最大最小差が小さい場合 `BALANCED` になる。
- 全体高めの場合 `ALL_HIGH` になる。
- 全体低めの場合 `ALL_LOW` になる。
- CSV候補が複数ある場合、3時間ごとに Variant が分散する。

## 注意点

- Mars と Friction を除外しすぎると、実際の体感とズレる可能性がある。
- Mars は「行動量」、Friction は「負荷」なので、文章内では補助的に反映する。
- Friction 高 + Drive 高は、成果が出る可能性もあるが衝突リスクが高い。単純な休養案にしない。
- Balanced は退屈に見えやすいので、文章パターン数を多めにする。
- CSVの文章は占星術的意味ではなく、作業・思考・休養の適性に寄せる。

## 次にやること

1. `M_Daily_Performance_Action_Advice.csv` の新列案を確定する。
2. `_daily_performance_action_pattern` を実装する。
3. 既存CSVを互換維持しながら拡張する。
4. Pattern_Type別の文章行を追加する。
5. UIの指標表示を `主状態 / 注意 / 補助` に分ける。
6. テストを追加する。
