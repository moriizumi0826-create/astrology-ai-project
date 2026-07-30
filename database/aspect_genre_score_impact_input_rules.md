# 年間ジャンル別・正負分離スコア入力ルール

## 入力単位

次の四要素の組み合わせごとに、代表行1行だけへ入力する。

- `T_Planet`
- `N_Planet`
- `Aspect_Angle`
- `N_House`

代表行の優先順は `Fire` → `Earth` → `Air` → `Water`、同一要素内は順行、Applyingを優先する。

## 入力列

- `Love_Positive_Impact`
- `Love_Negative_Impact`
- `Work_Positive_Impact`
- `Work_Negative_Impact`
- `Money_Positive_Impact`
- `Money_Negative_Impact`

## セルの使い分け

| 状態 | 入力値 |
| --- | --- |
| 代表行・適用ジャンル | 0〜100の整数（作用なしも `0`） |
| 代表行・非適用ジャンル | 空欄 |
| 代表行以外 | 6列すべて `-` |

プラス作用はPositive列、マイナス作用はNegative列へ絶対値で入力する。混合作用は両列へ入力する。負数は使用しない。

## 入力時の禁止事項

- 汎用 `Score_Impact`をコピーしない。
- `M_Monthly_Peak_Rules.csv`から点数を作らない。
- `Yearly_Weight`、`Priority`、orb、Applying/Separatingを点数へ加算しない。
- 解釈文3列や既存の本文を変更しない。
- 年間表示の件数へ合わせて点数を調整しない。

## 入力後の確認

1. 四要素キーごとの代表行が1行だけである。
2. 代表行以外の6列がすべて `-` である。
3. 適用ジャンルは2列とも数値、非適用ジャンルは2列とも空欄である。
4. 数値が0〜100の範囲内であり、負数がない。
5. 表示判定が `max(Positive, Negative) >= 55` になっている。
6. 60°に80点以上がない。
