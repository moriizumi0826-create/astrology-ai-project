# 年間現行天体ハウス遷移マスター入力ルール

対象CSV: `M_Annual_Transit_House_Transitions.csv`

## 対象天体

月を除く9天体（太陽・水星・金星・火星・木星・土星・天王星・海王星・冥王星）。

## 遷移種別

| `Transition_Type` | `Transition_Value` |
| --- | --- |
| `SIGN_INGRESS` | `ARIES`〜`PISCES` |
| `SOLAR_HOUSE_INGRESS` | `1`〜`12` |
| `NATAL_HOUSE_INGRESS` | `1`〜`12` |

## 入力列

- `Title`: 遷移の短い見出し
- `Text_Description`: 画面に表示する解釈文
- `Sort_Order`: CSV内の管理順

未入力の文章は `-` のままにする。天体の位置・サイン・ハウス・遷移日はAPIが出生データと天体暦から計算するため、CSVへ入力しない。

同一日・同一天体でサインとソーラーハウスが同時に変わる場合は、API側で1件へまとめて表示する。ネイタルハウスの遷移が同日なら、同じ件に併記する。

