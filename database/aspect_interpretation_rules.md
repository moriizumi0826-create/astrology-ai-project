# M_Aspect_Interpretation ルール定義

## 1. 目的
`M_Aspect_Interpretation` は、トランジット天体とネイタル天体の組み合わせから、解釈文・スコア・カウントダウン連携情報を返すためのマスタです。

このファイルでは、特に次の 2 列について、定義と生成ルールを明文化します。

- `Essential_Dignity_Score`
- `Countdown_ID`

詳細な対応表は以下を参照してください。

- [aspect_interpretation_reference_tables.md](C:/Users/morii/OneDrive/デスクトップ/astrology_ai_project/database/aspect_interpretation_reference_tables.md)

生成コードの実体は以下です。

- [generate_aspect_master_ids.py](C:/Users/morii/OneDrive/デスクトップ/astrology_ai_project/scripts/generate_aspect_master_ids.py)

## 2. 対象列の前提
`M_Aspect_Interpretation` の主要列は次です。

1. `T_Planet`
2. `N_Planet`
3. `Aspect_Angle`
4. `Category`
5. `N_House`
6. `N_Sign_Element`
7. `T_Retrograde_Flag`
8. `Orb_Status`
9. `Text_Description`
10. `Countdown_Label`
11. `Countdown_ID`
12. `Essential_Dignity_Score`
13. `Score_Impact`
14. `Priority`
15. `Advised_Task`

## 3. Essential_Dignity_Score
### 3-1. 定義
`Essential_Dignity_Score` は、ネイタル天体が置かれているサイン要素に応じた品格補正値です。

現行実装では、伝統占星術の完全なドミサイルやエグザルテーション表ではなく、`N_Sign_Element` を使った簡易補正として生成します。

### 3-2. 生成元
生成元は [generate_aspect_master_ids.py](C:/Users/morii/OneDrive/デスクトップ/astrology_ai_project/scripts/generate_aspect_master_ids.py) の `ESSENTIAL_DIGNITY_BY_ELEMENT` と `compute_dignity_score(row)` です。

### 3-3. 生成ルール
生成手順は次です。

1. `N_Planet` を正規化する
2. `N_Sign_Element` を `Fire / Earth / Air / Water` のいずれかとして読む
3. `ESSENTIAL_DIGNITY_BY_ELEMENT[N_Planet][N_Sign_Element]` を参照する
4. 角度が `90 / 150 / 180` の場合は符号を反転する
5. 最終値を `Essential_Dignity_Score` に入れる

### 3-4. 生成式
擬似式で書くと次です。

```text
base_dignity = ESSENTIAL_DIGNITY_BY_ELEMENT[N_Planet][N_Sign_Element]
if Aspect_Angle in {90, 150, 180}:
    Essential_Dignity_Score = -base_dignity
else:
    Essential_Dignity_Score = base_dignity
```

### 3-5. Score_Impact との関係
`Essential_Dignity_Score` は単独では表示用の主スコアではありません。
最終的には `Score_Impact` の再計算に使われます。

```text
final Score_Impact = 元の Score_Impact + Essential_Dignity_Score + 状態補正
```

ここでいう状態補正は、`Applying / Separating / Retrograde` による補正です。

## 4. Countdown_ID
### 4-1. 定義
`Countdown_ID` は、そのアスペクト行がどのカウントダウン UI に紐づくかを示す識別子です。

バックエンドでは、`Countdown_ID` を `M_Countdown_Master.Trigger_ID` と一致照合し、以下を取得します。

- 表示タイトル
- 到達メッセージ
- 次の行動ヒント
- しきい値オーブ
- 最大進捗日数

### 4-2. 生成元
生成元は [generate_aspect_master_ids.py](C:/Users/morii/OneDrive/デスクトップ/astrology_ai_project/scripts/generate_aspect_master_ids.py) の `choose_countdown_id(row)` です。

### 4-3. 生成ルール
生成時に参照する主な条件は次です。

1. `Category`
2. `T_Planet`
3. `N_Planet`
4. `Aspect_Angle`

補助判定:

- 吉角: `0 / 60 / 120`
- 緊張角: `90 / 150 / 180`

### 4-4. 基本の生成手順
1. 行の `Category` を読む
2. `T_Planet`, `N_Planet`, `Aspect_Angle` を正規化する
3. 角度が吉角か緊張角かを判定する
4. `choose_countdown_id(row)` の分岐に従って ID を返す

### 4-5. 分岐の考え方
大枠は次です。

- `Love`
  - 金星、月、木星、土星、火星、天王星、冥王星系で分岐
- `Work`
  - 木星、MC、水星、土星、太陽、天王星、火星系で分岐
- `Money`
  - 土星なら貯蓄系、その他は吉角なら金運系
- `Health`
  - 月や海王星を優先し、それ以外は心身バランス系
- `General`
  - 天王星、冥王星、火星、月、金星、木星、太陽系の順で代表 ID を返す

詳細な条件表は [aspect_interpretation_reference_tables.md](C:/Users/morii/OneDrive/デスクトップ/astrology_ai_project/database/aspect_interpretation_reference_tables.md) の `Countdown_ID 分岐表` を参照してください。

## 5. 対応表との紐づけ
### 5-1. Essential_Dignity_Score 対応表の使い方
対応表は `N_Planet` と `N_Sign_Element` の 2 軸で読む表です。

例:

- `N_Planet = NATAL_MOON`
- `N_Sign_Element = Water`

この場合、対応表から `5` を取得します。
角度が `120` ならそのまま `5`、角度が `90` なら `-5` になります。

### 5-2. Countdown_ID 分岐表の使い方
分岐表は `Category` を入口にして読みます。

例:

- `Category = Work`
- `T_Planet = TRANSIT_MERCURY`
- `N_Planet = NATAL_JUPITER`

この場合、`Work` の水星分岐に入り、`STUDY_EFFICIENCY_MAX` を返します。

別の例:

- `Category = Love`
- `T_Planet = TRANSIT_VENUS`
- `Aspect_Angle = 120`

この場合、金星の吉角として `LUCKY_LOVE_VENUS` を返します。

## 6. 実装時の注意
1. `Essential_Dignity_Score` は単独の表示用スコアではなく、`Score_Impact` 補正値です。
2. `Countdown_ID` は表示文ではなく、`M_Countdown_Master` への接続キーです。
3. `Countdown_Label` は主キーではなく、マスタが見つからない場合のフォールバック表示です。
4. `General` は広いカテゴリなので、アプリ側の集計ロジックでは用途に応じて取り扱いを慎重に分ける必要があります。

## 2. 列構成とデータ定義


1. **T_Planet**: トランジット天体（TRANSIT_SUN, TRANSIT_MOON...）
2. **N_Planet**: ネイタル天体/感受点（NATAL_SUN...NATAL_ASC, NATAL_MCを含む12種）
3. **Aspect_Angle**: 角度（0, 60, 90, 120, 150, 180）
4. **Category**: 占いのジャンル（General, Work, Love, Health, Moneyのいずれか）
5. **N_House**: ネイタル天体が位置するハウス（1〜12）
6. **N_Sign_Element**: ネイタル天体の属性（Fire, Earth, Air, Water）
7. **T_Retrograde_Flag**: トランジット天体の逆行状態（0:順行, 1:逆行）
8. **Orb_Status**: オーブの状態（Applying:接近, Separating:離脱）
9. **Text_Description**: 具体的解釈。ハウス・属性・逆行・オーブの状態をすべて反映した文章。  『ネイタル〇〇とトランジット〇〇が何度』から開始すること。100～150文字で作成すること。
10. **Countdown_Label**: カウントダウン用ラベル（例：仕事の成功チャンス到来まで）。末尾は必ず『〇〇まで』で終わること。10～25文字で生成。

12. **Score_Impact**: 運勢の数値化（-100〜100）
13. **Priority**: 表示優先度（1〜10）
14. **Advised_Task**: その日の具体的な推奨アクション　15～30文字

## 3. 入力見本（CSV形式）
```csv
TRANSIT_MARS,NATAL_SUN,150,Work,10,Earth,0,Applying,仕事の目標に対し実務手順が微妙に噛み合わず微調整を強いられる時期です。接近中のこの違和感は精度を高めるための訓練と捉えてください,完璧な成果を出すための調整期まで,-20,6,作業工程を一度分解して非効率な部分を修正する
TRANSIT_SUN	NATAL_SUN	0	General	1	Fire	0	Applying	新しい1年のサイクルが始まる予兆があり活力が内側から高まっています。接近中の今は新しい目標を立てる準備に最適な時期です	新しい自分が目覚める日まで		85	10	これから1年で成し遂げたいことを3つ書き出す
TRANSIT_SUN	NATAL_MERCURY	90	Work	10	Earth	0	Separating	仕事上の立場と自分の考えが衝突した余韻が残っています。離脱中の今は議論を深めるよりも決定事項の事後処理に集中すべき時です	思考の混乱が収まるまで		-30	7	会議の議事録を見直し漏れがないか再確認する
TRANSIT_MERCURY	NATAL_SATURN	0	Work	6	Earth	1	Applying	実務において過去のミスや古い手順の見直しを迫られる予感があります。逆行かつ接近中の今は焦らずにシステムの再点検を行うべきです	知的な基盤が再構築されるまで		20	8	過去のプロジェクト資料を読み返し改善点を探す

```
原則として、わくわくや期待感を煽るようなニュアンスは出しつつも
詩的やドラマティック、大げさな表現は禁止。
あくまでも誰が見ても理解できる現実的な文言にすること。



### ③ 解釈文の書き分けルール
* **逆行（1）の場合**: 「再考」「復習」「過去の縁」「遅延による発見」のニュアンスを必ず含めること。
* **接近（Applying）の場合**: 「高まり」「準備」など、未来に向かうトーンにすること。
* **離脱（Separating）の場合**: 「余韻」「結果の定着」「振り返り」など、過去を消化するトーンにすること。
* **クインカンクス（150度）**: 「訓練」「しつけ」「異質なものの統合」といった、単純な吉凶ではない調整のニュアンスを含めること。

## 7. Impact_Type ????

`Impact_Type` Impact_TypeImpact_TypeImpact_TypeImpact_Type????

`Impact_Type` Impact_TypeImpact_TypeImpact_TypeImpact_TypeImpact_TypeImpact_TypeImpact_TypeImpact_TypeImpact_Type?

### 7-1. ????
1. Impact_TypeImpact_Type???
2. Impact_TypeImpact_TypeImpact_TypeImpact_TypeImpact_Type??
3. ?: `Impact_Type`, `????`, `??`, `????`, `????`, `????`, `????`?
4. `Advised_Task` ? `timeline_advise` Impact_TypeImpact_Type?
