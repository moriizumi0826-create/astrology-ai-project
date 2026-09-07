# 2026年10月 可変日付段落 執筆ガイド

対象は `M_Monthly_Overview_Event_Paragraphs_2026_10.csv` 372行。共通仕様は `monthly_overview_editorial_writing_guidelines.md` を正とする。

## 1. 固定構造

- `sign_ingress`: 2イベント x 144行 = 288行。
- `natal_house_ingress`: 7天体星座区間 x 12行 = 84行。
- 編集列は `Paragraph_Template` と `Active_Flag` のみ。
- 全完成文に `{event_date}` を含め、固定日付を書かない。
- 1執筆単位は同一イベント・同一条件の12行とする。

## 2. sign_ingress

| 順 | 天体 | 移動 | Date_Key |
|---:|---|---|---|
| 1 | 太陽 | 天秤座から蠍座 | `SUN:sign_ingress:SCORPIO` |
| 2 | 金星（逆行） | 蠍座から天秤座 | `VENUS:sign_ingress:LIBRA` |

太陽は対話と調整から信頼と共有条件へ焦点が深まる移動として書く。金星は逆行中の戻りであることを反映し、関係や価値を新規に拡大するのではなく、釣り合いと合意を見直す流れとする。

## 3. natal_house_ingress

- 太陽: LIBRA、SCORPIO
- 水星: SCORPIO
- 金星: SCORPIO、LIBRA
- 火星: LEO
- 木星: LEO

1区間ごとに `Natal_House_From -> Natal_House_To` の12通りを作る。太陽は生活の中心、水星は情報と判断、金星は関係と価値、火星は行動と意思表示、木星は余地と幅として書き分ける。

## 4. 文章と検証

- 90-240文字、2-3文を目安とする。
- Solar_Houseは変化が前面化する領域、Natal_Houseは本人が実感する生活領域とする。
- 逆行開始や順行開始はEvent行として追加せず、基本総評、複合配置、長期背景に譲る。
- 完成し検証を通過した12行だけ `Active_Flag=1` にする。
- 各単位で再生成比較、重複、文字化け、固定日付、未知トークン、レンダリングを検証する。

現在の完成数は0 / 372行。
