# 年間運勢グラフ DB 作業計画書

## 1. 目的

年間運勢グラフを、固定表示の「絵」ではなく、天体運行・個人ネイタル・解釈マスタを組み合わせて再計算できる動的シミュレーションとして実装する。

ユーザーごとに「いつ、どのジャンルで、どのような運命の変化が起きるか」を 365 日の時系列スコアとして可視化し、グラフ上の山・谷・急変日・イングレス・逆行開始/終了をマイルストーンとして表示できる状態を目指す。

## 2. 採用方針

以下の 3 層構造を採用する。

1. `M_Transit_Calendar_2026`
   - 個人に依存しない、日別・天体別の運行データ。
2. `M_Yearly_Base_Logic`
   - 太陽星座から見たソーラーハウス別の年間ベース解釈。
3. `M_Aspect_Interpretation_Yearly`
   - 既存 `M_Aspect_Interpretation` を年間グラフ用に補正するビューまたは派生 CSV。

重要な設計判断として、`House_ID_Solar` は `M_Transit_Calendar_2026` に固定保存しない。ソーラーハウスはユーザーの太陽星座によって変わるため、サービス側で以下の式により動的算出する。

```text
solar_house = ((transit_sign_index - natal_sun_sign_index) % 12) + 1
```

## 3. DB 設計

### 3.1 M_Transit_Calendar_2026

個人のネイタルとは無関係に、2026 年の天体運行だけを記録する。

粒度は「365 行」ではなく「365 日 × 対象天体数」とする。

対象天体:

```text
SUN, MERCURY, VENUS, MARS, JUPITER, SATURN, URANUS, NEPTUNE, PLUTO
```

想定行数:

```text
365日 × 9天体 = 3285行
```

主キー:

```text
Date + Planet
```

列定義:

| Column | Type | Description |
| --- | --- | --- |
| Date | date | 対象日。2026-01-01 から 2026-12-31 |
| Planet | string | 天体 ID |
| Ecliptic_Longitude | float | 黄経。ネイタル天体とのオーブ計算に必須 |
| Sign_ID | string | 滞在星座 ID |
| Degree_In_Sign | float | 星座内度数 |
| Retrograde_Flag | int | 逆行中なら 1、順行なら 0 |
| Sign_Ingress_Flag | int | 前日から星座が変わった日なら 1 |
| Retrograde_Start_Flag | int | 前日が順行で当日が逆行なら 1 |
| Retrograde_End_Flag | int | 前日が逆行で当日が順行なら 1 |
| Station_Flag | int | 逆行開始または終了の日なら 1 |
| Speed | float | 黄経速度 |

保存先:

```text
database/M_Transit_Calendar_2026.csv
```

### 3.2 M_Yearly_Base_Logic

ソーラーサインベースの年間テーマを出すためのマスタ。

列定義:

| Column | Type | Description |
| --- | --- | --- |
| Target_Solar_Sign | string | ユーザーの太陽星座 |
| T_Planet | string | 主に外惑星。JUPITER, SATURN, URANUS, NEPTUNE, PLUTO |
| Transit_House | int | 太陽星座から数えたソーラーハウス |
| Text_Theme | string | 期間のメインテーマ |
| Base_Score | int | ハウス滞在による基礎点 |
| Category | string | Work, Love, Money, General |
| Priority | int | 10 が最重要、1 が軽微 |
| Milestone_Label | string | グラフ通知用の短いラベル |
| Duration_Type | string | LONG, MID, SHORT |

保存先:

```text
database/M_Yearly_Base_Logic.csv
```

### 3.3 M_Aspect_Interpretation_Yearly

既存 `M_Aspect_Interpretation` を年間グラフに使うための補正マスタ。

初期実装では新規 CSV として作成してよいが、将来的には既存マスタから生成するビューでもよい。

列定義:

| Column | Type | Description |
| --- | --- | --- |
| Aspect_Logic_ID | string | 既存の完全一意 ID |
| Priority | int | 年間グラフ上の優先度 |
| Duration_Type | string | LONG, MID, SHORT |
| Yearly_Weight | float | 年間グラフ用の追加係数 |
| Graph_Visibility | int | グラフ表示対象なら 1 |
| Milestone_Eligible | int | マイルストーン候補なら 1 |

`Duration_Type` の基準:

| Duration_Type | 対象 | 用途 |
| --- | --- | --- |
| LONG | 外惑星中心 | 年間グラフのベースライン |
| MID | 火星・金星中心 | 数週間単位の起伏 |
| SHORT | 太陽・水星・月 | 微細な変動。年間ではノイズ抑制対象 |

保存先:

```text
database/M_Aspect_Interpretation_Yearly.csv
```

## 4. スコア算出フロー

### Step 1: ベースライン構築

1. ユーザーのネイタル太陽星座を取得する。
2. `M_Transit_Calendar_2026` から対象日の天体位置を取得する。
3. 天体の `Sign_ID` とユーザーの太陽星座から `solar_house` を動的計算する。
4. `M_Yearly_Base_Logic` を以下で結合する。

```text
Target_Solar_Sign = natal_sun_sign
T_Planet = transit planet
Transit_House = calculated solar_house
```

5. `Base_Score` を日別・カテゴリ別に加算する。

### Step 2: 個人的な起伏を合成

1. `M_Transit_Calendar_2026.Ecliptic_Longitude` とユーザーのネイタル天体黄経から角度差を計算する。
2. 既存 `M_Aspect_Interpretation` から該当する `T_Planet / N_Planet / Aspect_Angle` を取得する。
3. `M_Aspect_Interpretation_Yearly` から `Duration_Type / Yearly_Weight / Graph_Visibility` を取得する。
4. 以下の計算式で日別スコアへ加算する。

```text
Daily_Aspect_Score =
  Score_Impact
  × Priority_Weight
  × Orb_Decay
  × Yearly_Weight
```

総合スコア:

```text
S(d) = Base_Score_Total + Daily_Aspect_Score_Total + Ingress_Bonus
```

### Step 3: Orb_Decay

オーブが 0 度に近いほど 1.0、許容オーブ境界に近いほど 0.2 に収束させる。

```text
Orb_Decay = 0.2 + (1 - abs(orb) / max_orb) × 0.8
```

下限と上限:

```text
0.2 <= Orb_Decay <= 1.0
```

### Step 4: Priority_Weight

```text
Priority 10    => 3.0
Priority 7-9   => 2.0
Priority 1-6   => 1.0
```

### Step 5: マイルストーン抽出

以下をマイルストーン候補にする。

1. 年間最大値の日
2. 年間最小値の日
3. 前日比でスコアが大きく変化した日
4. `Sign_Ingress_Flag = 1` の日
5. `Retrograde_Start_Flag = 1` の日
6. `Retrograde_End_Flag = 1` の日
7. `Orb_Status` が `Applying` から `Separating` に切り替わる日

マイルストーンには、可能な限り該当 `Aspect_Logic_ID` の `Text_Description` と `Advised_Task` を紐づける。

## 5. フロントエンド JSON 仕様

サービスは以下の形を返す。

```json
{
  "summary": "2026年は後半に向けて仕事運が上昇します",
  "yearly_data": [
    {
      "date": "2026-05-01",
      "scores": {
        "total": 75,
        "work": 85,
        "love": 40,
        "money": 55,
        "general": 60
      },
      "events": [
        {
          "title": "キャリアの黄金期",
          "description": "木星が10室に入り、長期的な努力が実を結び始めます",
          "advised_task": "長期目標を具体的な行動計画に落とし込む",
          "priority": 10,
          "category": "Work",
          "layer": "Main_Trend",
          "id": "LUCKY_GOLDEN_PERIOD"
        }
      ]
    }
  ],
  "milestones": [
    {
      "date": "2026-06-15",
      "label": "運命の分岐点",
      "id": "LUCKY_GOLDEN_PERIOD",
      "title": "キャリアの黄金期",
      "description": "木星が10室に入り、長期的な努力が実を結び始めます",
      "advised_task": "長期目標を具体的な行動計画に落とし込む",
      "priority": 10
    }
  ]
}
```

## 6. UI 表現ルール

折れ線:

| Line | Color | Meaning |
| --- | --- | --- |
| total | gold | 人生の主軸 |
| work | blue | 論理・社会 |
| love | pink | 感情・調和 |
| money | green | 収入・資産 |

背景:

| Score Range | Area Color |
| --- | --- |
| 0 以上 | light green |
| 0 未満 | light red |

インタラクション:

1. グラフの点をタップする。
2. 該当日の `events` を取得する。
3. 最優先イベントの `Advised_Task` を画面下部カードに表示する。
4. 複数イベントがある場合は `Priority` と `abs(weighted_score)` の高い順で表示する。

## 7. 実装タスク

### Phase 1: M_Transit_Calendar_2026 の生成

1. `scripts/generate_transit_calendar.py` を作成する。
2. Swiss Ephemeris で 2026 年の対象天体位置を日次取得する。
3. `Ecliptic_Longitude / Sign_ID / Degree_In_Sign / Speed / Retrograde_Flag` を出力する。
4. 前日差分から `Sign_Ingress_Flag` を算出する。
5. 前日差分から `Retrograde_Start_Flag / Retrograde_End_Flag / Station_Flag` を算出する。
6. `database/M_Transit_Calendar_2026.csv` を生成する。
7. 行数が 3285 行であることを検証する。

### Phase 2: M_Yearly_Base_Logic の作成

1. 12 星座 × 外惑星 × 12 ハウスをベースに雛形を作成する。
2. `Base_Score / Category / Priority / Text_Theme` を入力する。
3. まずは Work, Love, Money, General の主要パターンから埋める。
4. 空欄があってもサービス側でフォールバックできるようにする。

### Phase 3: M_Aspect_Interpretation_Yearly の作成

1. 既存 `M_Aspect_Interpretation` から `Aspect_Logic_ID` を抽出する。
2. T_Planet と N_Planet から `Duration_Type` を自動推定する。
3. 初期値として `Yearly_Weight` を設定する。
4. 年間グラフでノイズになる短期アスペクトは `Graph_Visibility = 0` にできるようにする。

初期 Weight 案:

| Duration_Type | Yearly_Weight |
| --- | --- |
| LONG | 1.0 |
| MID | 0.7 |
| SHORT | 0.35 |

### Phase 4: yearly_forecast_service.py の改修

1. 現在のリアルタイム天体計算を `M_Transit_Calendar_2026.csv` 参照に置き換える。
2. ソーラーハウス計算を追加する。
3. `M_Yearly_Base_Logic` を結合してベースラインを作る。
4. 既存 `M_Aspect_Interpretation` と `M_Aspect_Interpretation_Yearly` を結合して個人補正を加える。
5. `milestones` にイングレス・逆行開始/終了を含める。
6. API レスポンスの `events` に `advised_task` を必ず含める。

### Phase 5: Cache 連携

DB 層が用意できた段階で、以下を実装する。

1. `yearly_forecast_cache` テーブル作成。
2. ユーザー ID、対象年、出生情報ハッシュでキャッシュキーを作る。
3. ログイン時または週 1 回再計算する。
4. 再計算不要な場合はキャッシュを返す。

テーブル案:

| Column | Type | Description |
| --- | --- | --- |
| Cache_Key | string | ユーザー・出生情報・年のハッシュ |
| User_ID | string | ユーザー ID |
| Year | int | 対象年 |
| Payload_JSON | json | 年間予測レスポンス |
| Created_At | datetime | 作成日時 |
| Updated_At | datetime | 更新日時 |
| Expires_At | datetime | 再計算目安 |

## 8. テスト計画

### Unit Tests

1. `M_Transit_Calendar_2026.csv` が 3285 行で生成される。
2. `Date + Planet` が一意である。
3. `Sign_Ingress_Flag` が前日星座との差分と一致する。
4. `Retrograde_Start_Flag / Retrograde_End_Flag` が前日逆行状態との差分と一致する。
5. ソーラーハウス計算が 12 星座すべてで正しい。
6. `Orb_Decay` が 0.2～1.0 に収まる。
7. `Priority_Weight` が仕様通りになる。
8. `Graph_Visibility = 0` のアスペクトが年間スコアに入らない。
9. マイルストーンに最大値・最小値・イングレス・逆行開始/終了が含まれる。

### Integration Tests

1. 代表ユーザーの `generate_yearly_forecast` が 365 日分を返す。
2. 各日付に `scores.total / work / love / money / general` が存在する。
3. `events` に `title / description / advised_task / priority` が存在する。
4. `milestones` が空でない。
5. JSON がフロントエンドでそのまま描画可能な構造になっている。

## 9. 注意事項

1. `M_Transit_Calendar_2026` は個人非依存に保つ。
2. `House_ID_Solar` は保存せず、サービス側で動的算出する。
3. 年間グラフでは SHORT アスペクトを強くしすぎない。
4. 月は年間グラフでは原則除外または低 Weight にする。
5. イングレスと逆行は、スコアだけでなく通知イベントとして扱う。
6. `credentials.json` や仮想環境ディレクトリは絶対に Git 管理しない。

## 10. 最初に着手する作業

最初に作るべきものは `M_Transit_Calendar_2026.csv`。

理由:

1. 横軸である日付と天体位置が固定される。
2. ソーラーハウス、イングレス、逆行開始/終了の判定基盤になる。
3. 既存 `yearly_forecast_service.py` のリアルタイム計算を CSV 参照に置き換えられる。
4. キャッシュ生成の前提データになる。

初回成果物:

```text
scripts/generate_transit_calendar.py
database/M_Transit_Calendar_2026.csv
backend/tests/test_api.py に検証テスト追加
```
