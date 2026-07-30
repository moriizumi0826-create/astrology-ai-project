# デイリーパフォーマンス 時間帯別アドバイス / ラベル表示ロジック

## 対象

- Backend: `backend/app/services/reading_service.py`
- Frontend: `frontend/src/dashboard-shared.jsx`
- Master CSV: `database/M_Daily_Performance_Action_Advice.csv`

デイリーパフォーマンスのグラフ上をクリックすると、選択された時間帯の `actionAdvice` を表示する。
文章と内部ラベルは backend で決定し、frontend はその結果を表示する。

## クリック時の表示対象

frontend の `DashboardV2DailyFlowCard` で、グラフクリック位置から最も近い3時間刻みの index を選ぶ。

- 対象データ: `data.dailyPerformance` / `data.daily_performance`
- 選択時刻: `dailyPerformanceTimeLabel(...)`
- 選択アドバイス: `point.actionAdvice` / `point.action_advice`

`actionAdvice` が存在しない場合、時間帯別アドバイス枠は表示されない。

## backend 側の基本指標

時間帯別アドバイスの主判定に使う指標は以下の3つ。

| 内部名 | point field |
| --- | --- |
| `DRIVE` | `drive` |
| `FLOW` | `flow` |
| `INSPIRATION` | `inspiration` |

`Mars` と `Friction` は主判定からは外し、補助状態として別扱いする。

| 補助名 | point field |
| --- | --- |
| `MARS_ACTIVITY` | `marsActivity` |
| `FRICTION` | `friction` |

## 閾値

現在の閾値は `reading_service.py` に定義されている。

| 定数 | 値 | 用途 |
| --- | ---: | --- |
| `DAILY_PERFORMANCE_HIGH_THRESHOLD` | 70 | 全体高め判定 |
| `DAILY_PERFORMANCE_LOW_THRESHOLD` | 35 | 全体低め判定 |
| `DAILY_PERFORMANCE_BALANCED_SPREAD` | 10 | 最高値と最低値の差が小さい判定 |
| `DAILY_PERFORMANCE_DUAL_DELTA` | 5 | 2指標が同程度に高い/低い判定 |
| `DAILY_PERFORMANCE_DUAL_HIGH_MIN` | 60 | 2指標高め判定の下限 |
| `DAILY_PERFORMANCE_DUAL_LOW_MAX` | 45 | 2指標低め判定の上限 |
| `DAILY_PERFORMANCE_FRICTION_HIGH_THRESHOLD` | 65 | Friction 高 |
| `DAILY_PERFORMANCE_FRICTION_SPIKE_THRESHOLD` | 80 | Friction 強警戒 |

## patternType の決定順

各時間帯の `drive / flow / inspiration` から、最高指標・最低指標・平均・ばらつきを出す。
その後、以下の順で `patternType` を決定する。

1. `FRICTION_SPIKE`
   - Friction が 80 以上
2. `FRICTION_HIGH_ALL_LOW`
   - Friction が高く、3指標すべて低い
3. `FRICTION_HIGH_ALL_HIGH`
   - Friction が高く、3指標すべて高い
4. `FRICTION_WITH_HIGH`
   - Friction が高い
5. `ALL_LOW`
   - 3指標すべて低い
6. `ALL_HIGH`
   - 3指標すべて高い
7. `BALANCED`
   - 最高値と最低値の差が10未満
8. `DUAL_HIGH`
   - 上位2指標が近く、どちらも60以上
9. `DUAL_LOW`
   - 下位2指標が近く、どちらも45以下
10. `PAIR_HIGH_LOW`
   - 上記以外。最高指標と最低指標の組み合わせで見る

## overallLevel

`overallLevel` は全体感の補助ラベル。

| 条件 | overallLevel |
| --- | --- |
| 全指標高い | `HIGH` |
| 全指標低い | `LOW` |
| balanced かつ平均58以上 | `SLIGHT_POSITIVE` |
| balanced かつ平均42以下 | `SLIGHT_HEAVY` |
| balanced | `NEUTRAL` |
| その他 | `MIXED` |

## Mars / Friction の状態

Mars は主判定に混ぜず、補助状態として返す。

| 条件 | marsState | frontend 表示 |
| --- | --- | --- |
| `marsActivity >= 70` | `HIGH` | `高` |
| `marsActivity <= 35` | `LOW` | `低` |
| その他 | `NEUTRAL` | `中` |

Friction も主判定に混ぜず、警戒状態として返す。

| 条件 | frictionState | frontend 表示 |
| --- | --- | --- |
| `friction >= 80` | `SPIKE` | `強警戒` |
| `friction >= 65` | `HIGH` | `高` |
| `friction <= 35` | `LOW` | `低` |
| その他 | `NEUTRAL` | `中` |

## CSV候補の選定

CSVは `M_Daily_Performance_Action_Advice.csv`。

まず `Pattern_Type` と `Time_Block` で絞り込む。

- `Pattern_Type` が backend の `patternType` と一致
- `Time_Block` が以下のいずれか
  - 空
  - `ANY`
  - 選択時刻の `HH:00`

その後、以下の列を順にチェックする。
空欄は wildcard として扱い、一致条件を要求しない。

- `Primary_High_Metric`
- `Secondary_High_Metric`
- `Primary_Low_Metric`
- `Secondary_Low_Metric`
- `Overall_Level`
- `Friction_State`
- `Mars_State`

該当候補がない場合は旧方式の列で fallback する。

- `High_Metric`
- `Low_Metric`
- `High_Min`
- `Low_Max`

それでも候補がない場合は backend 内の fallback 文言を返す。

## Variant の散らし方

候補行は以下で並び替える。

1. `Priority` 降順
2. `Advice_ID` 昇順

その後、同じ条件で候補が複数ある場合は、時間帯によって行を散らす。

```python
row = candidates.iloc[(hour // 3) % len(candidates)]
```

つまり、同じ条件でも 0時、3時、6時...で別 Variant が選ばれる可能性がある。

## backend から返る actionAdvice

frontend に渡される主な項目は以下。

| field | 内容 |
| --- | --- |
| `adviceId` | CSVの `Advice_ID` |
| `timeBlock` | CSVの `Time_Block` |
| `patternType` | 判定されたパターン |
| `primaryHighMetric` | 主に高い指標 |
| `secondaryHighMetric` | 2つ目に高い指標。該当 pattern の時のみ |
| `primaryLowMetric` | 主に低い指標 |
| `secondaryLowMetric` | 2つ目に低い指標。該当 pattern の時のみ |
| `overallLevel` | 全体状態 |
| `highMetric` / `highScore` | 最高指標と値 |
| `lowMetric` / `lowScore` | 最低指標と値 |
| `frictionScore` / `frictionState` | Friction の値と状態 |
| `marsScore` / `marsState` | Mars の値と状態 |
| `actionMode` | CSVの `Action_Mode` |
| `headline` | CSVの `Headline` |
| `recommendedAction` | CSVの `Recommended_Action` |
| `thinkingStyle` | CSVの `Thinking_Style` |
| `restGuidance` | CSVの `Rest_Guidance` |
| `variant` | CSVの `Variant` |

## frontend の表示ロジック

アドバイス枠は開閉式。

閉じている時:

- 左に選択時刻ラベル
- 右に `headline`
- 下に1行だけ `recommendedAction` / `thinkingStyle` / `restGuidance` の先頭候補

開いている時:

- Friction バッジ
  - `注意: Friction {score} {状態ラベル}`
- Mars バッジ
  - `補助: Mars {score} {状態ラベル}`
- 本文3列
  - `recommendedAction`
  - `thinkingStyle`
  - `restGuidance`

## 現状の注意点

- 主判定は `Drive / Flow / Inspiration` の3指標のみ。
- `Mars` は常に最低/最高判定へ混ぜず、補助状態として表示する。
- `Friction` は高い場合に patternType を優先的に上書きする。
- CSV側の空欄は wildcard なので、条件を細かくしすぎない fallback 行として使える。
- 候補が複数ある場合、同じ条件でも3時間ごとに Variant が変わる。
