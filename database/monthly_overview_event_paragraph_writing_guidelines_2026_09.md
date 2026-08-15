# 2026年9月 可変日付段落 執筆ガイド

対象: `database/M_Monthly_Overview_Event_Paragraphs_2026_09.csv`

共通仕様は `monthly_overview_editorial_writing_guidelines.md` を正とし、このファイルは9月の採用イベント、執筆単位、検証条件を固定する。

## 1. 固定仕様

- 想定構造は840行。
- `sign_ingress`: 5イベント x 144行 = 720行。
- `natal_house_ingress`: 10天体星座区間 x 12行 = 120行。
- 編集列は `Paragraph_Template` と `Active_Flag` のみとする。
- 完成・検証済みの行だけ `Active_Flag=1` にする。
- `Template_ID`、`Month_ID`、イベント条件、ハウス、日付条件、Priorityを変更しない。
- 全ての完成段落に `{event_date}` を1回以上含め、固定日付は書かない。

## 2. sign_ingress 5イベント

次の5件だけを生成し、9月11日の天王星逆行開始は追加しない。

| 順 | 天体 | 移動 | Date_Key |
|---:|---|---|---|
| 1 | 金星 | 天秤座から蠍座 | `VENUS:sign_ingress:SCORPIO` |
| 2 | 水星 | 乙女座から天秤座 | `MERCURY:sign_ingress:LIBRA` |
| 3 | 太陽 | 乙女座から天秤座 | `SUN:sign_ingress:LIBRA` |
| 4 | 火星 | 蟹座から獅子座 | `MARS:sign_ingress:LEO` |
| 5 | 水星 | 天秤座から蠍座 | `MERCURY:sign_ingress:SCORPIO` |

各イベントは同一 `Solar_House_From/To` について `Natal_House_At_Event 1-12` を1単位とし、Solar_Houseの12通りを作る。1回の執筆では同一イベント・同一Solar_Houseの12行だけを扱う。

## 3. natal_house_ingress 10区間

対象は太陽、水星、金星、火星、木星の当月実配置だけとする。

- 太陽: VIRGO、LIBRA
- 水星: VIRGO、LIBRA、SCORPIO
- 金星: LIBRA、SCORPIO
- 火星: CANCER、LEO
- 木星: LEO

1区間につき、隣接する `Natal_House_From -> Natal_House_To` の12通りを作る。文章では移動前に中心だった事柄と、移動後に重点が移る先を一続きで書く。

## 4. 天体ごとの役割

- 太陽: 意識と生活の中心。乙女座の調整から天秤座の対話・均衡へ移る。
- 水星: 情報、判断、連絡。細部確認、合意形成、深い検証という段階差を書く。
- 金星: 心地よさ、関係、価値。公平な距離感から信頼と共有へ深まる。
- 火星: 行動と力の使い方。守る働きから表現と意思表示へ移る。
- 木星: 余地、拡大、楽しみ。獅子座らしい創造と自己表現を扱うが成果を保証しない。

## 5. 文章仕様

- 90-240文字、2-3文を目安にする。
- `{event_date}` と天体の変化を自然な日本語の一文へ組み込む。
- Solar_Houseは変化が前面化する人生領域、Natal_Houseは本人が実感する生活領域として分ける。
- 前後で何から何へ重点が移るかを具体的に書く。
- 条件違いの行で、天体名やハウス名だけを差し替えない。
- 不一致イベントはバックエンドが表示しないため、汎用的な逃げの文章を作らない。

## 6. 日付とトークン

- `sign_ingress` は `Date_Source=transit_calendar` と確定済みDate_Keyを使う。
- `natal_house_ingress` は `Date_Source=natal_house_calculation` を使う。
- `Date_Precision` は生成条件を変更しない。
- 完成段落へ `9月10日` などの固定日付を書かない。
- `{event_date}` 以外の未定義トークンを追加しない。

## 7. 禁止事項

- 9月に存在しない星座移動を追加しない。
- 天王星逆行をEvent CSVへ追加しない。
- 成功、利益、事故、破局、病気を断定しない。
- 8月文章を日付、星座、ハウスだけ変えて流用しない。
- Activeにした行へ空欄、固定日付、文字化け、未確定メモを残さない。

## 8. 執筆単位ごとの検証

1. 同一イベント・同一条件の12行だけを編集する。
2. 条件列を生成時スケルトンと比較する。
3. Active行の空欄、90-240文字、`{event_date}`、固定日付、未知トークンを検証する。
4. 正規化後の完全重複と機械的差し替えを確認する。
5. CSVをレンダリングし、文字化け、行ずれ、見切れを目視確認する。
6. PASSした12行だけを完成数へ加える。

## 9. 完成条件

- 実生成結果が840行で、IDと条件列がスケルトンと一致する。
- 720行のsign_ingressと120行のnatal_house_ingressが全て完成する。
- Active 840、validator PASS、全単位の目視PASSを満たす。

現在の完成数は0 / 840行。CSV構造の生成と保護列検証が終わるまで執筆を開始しない。
