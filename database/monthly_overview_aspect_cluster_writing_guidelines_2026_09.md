# 2026年9月 複合配置 執筆ガイド

対象: `database/M_Monthly_Overview_Aspect_Clusters_2026_09.csv`

共通仕様は `monthly_overview_editorial_writing_guidelines.md` を正とする。採用Clusterは以下の5件、総行数は720行で固定する。

## 1. 固定仕様

- 1 Clusterは `Anchor_Solar_House 1-12 x Anchor_Natal_House 1-12` の144行。
- 5 Cluster x 144行 = 720行。
- 編集列は `Title`、`Paragraph_Template`、`Active_Flag` のみとする。
- 完成・検証済みの行だけ `Active_Flag=1` にする。
- ID、期間、天体、アスペクト、アンカー、日付条件、Selection_Group、Priorityを変更しない。
- 一度の執筆単位は同一Cluster・同一Anchor_Solar_Houseの12行とする。

## 2. 採用Cluster

### 2.1 月初4天体ネットワーク

- `Cluster_ID`: `2026_09_OPENING_FOUR_PLANET_NETWORK`
- 有効期間: 9月1日から3日
- 主ピーク: 9月1日
- 天体: MERCURY、MARS、JUPITER、SATURN
- 主構造: 木星・土星120度、火星・土星90度、水星・火星60度
- アンカー: SATURN
- `Selection_Group`: `SEP_OPENING_STRUCTURE`
- Priority: 100
- 主題: 広げる力と制約、行動の圧力、伝達の工夫を、続けられる手順へ組み直す。

### 2.2 水星と外惑星のネットワーク

- `Cluster_ID`: `2026_09_MERCURY_OUTER_NETWORK`
- 有効期間: 9月12日から15日
- 主ピーク: 9月13日、補助ピーク9月14日
- 天体: MERCURY、URANUS、NEPTUNE、PLUTO
- 主構造: 水星・冥王星120度、水星・海王星180度、水星・天王星120度
- アンカー: MERCURY
- `Selection_Group`: `SEP_MERCURY_OUTER_NETWORK`
- Priority: 100
- 主題: 深い洞察、曖昧さ、発想の更新が同時に働く。9月11日の天王星逆行開始を、考え直しが始まる背景として扱う。

### 2.3 金星・冥王星スクエア

- `Cluster_ID`: `2026_09_VENUS_PLUTO_SQUARE`
- 有効期間: 9月14日から18日
- 主ピーク: 9月16日
- 天体: VENUS、PLUTO
- 主構造: 金星・冥王星90度
- アンカー: VENUS
- `Selection_Group`: `SEP_VALUES_POWER`
- Priority: 90
- 主題: 好み、関係、共有価値の中にある力関係や執着を、断定せず見直す。

### 2.4 満月と外惑星のネットワーク

- `Cluster_ID`: `2026_09_FULL_MOON_OUTER_NETWORK`
- 有効期間: 9月26日から29日
- 主ピーク: 9月27日
- 天体: SUN、MOON、URANUS、NEPTUNE、PLUTO
- 主構造: 満月に太陽・月と天王星、海王星、冥王星の調和・対向関係が重なる。
- アンカー: SUN
- `Moon_Eligibility`: `lunation_plus_planet`
- `Selection_Group`: `SEP_FULL_MOON_OUTER_NETWORK`
- Priority: 100
- 主題: 感情と事実の区切りをつけ、変えられる部分と受け止める部分を分ける。

### 2.5 月末Tスクエア形成開始

- `Cluster_ID`: `2026_09_MONTH_END_TSQUARE_BUILDING`
- 有効期間: 9月30日
- 主ピーク: 10月2日、補助ピーク10月3日
- 天体: MERCURY、MARS、PLUTO
- 主構造: 水星・火星90度、水星・冥王星90度、火星・冥王星180度
- アンカー: MERCURY
- `Date_Precision`: `month_end`
- `Selection_Group`: `SEP_MONTH_END_PRESSURE`
- Priority: 100
- 主題: 月末から高まる判断と行動の圧力を、即断や対立の予言ではなく、確認と間合いの必要性として書く。

## 3. 日付トークン

- 全ての完成段落に `{event_date}` を含める。
- 補助ピークを文章で使うClusterは `{secondary_event_date}` も使用できる。
- `Date_Source=swiss_ephemeris`、`Date_Key`、`Peak_At`、`Date_Precision` は生成条件を変更しない。
- `Date_Key` の先頭日付は `Peak_At` の日付と一致させる。
- 月末Clusterでは、10月の完成時期を `{event_date}` から「9月末から10月初めにかけて」と解決する。
- 固定日付をTitleまたはParagraphへ直接書かない。

## 4. アンカーハウスの役割

- Anchor_Solar_House: 配置が今月どの人生領域で前面化するか。
- Anchor_Natal_House: 本人がどの生活領域で具体的に感じるか。
- SATURNアンカーは、責任、境界、持続可能な形への整理として書く。
- MERCURYアンカーは、情報、判断、交渉、伝え方の調整として書く。
- VENUSアンカーは、価値、関係、心地よさ、共有条件として書く。
- SUNアンカーは、意志、中心課題、一区切りとして書く。

同じAnchor_Solar_Houseの12行で主題を共有してよいが、Natal_Houseごとの実感と行動を明確に変える。

## 5. 文章仕様

### Title

- 14-30文字を目安にする。
- 配置名や天体名の羅列ではなく、本人にとっての焦点を示す。
- 同一Cluster内で完全重複させない。

### Paragraph_Template

- 120-260文字、2-4文を目安にする。
- `{event_date}`、配置の中心意味、アンカーハウスによる個人差、現実的な扱い方を含める。
- アスペクトの専門語を並べるだけにしない。
- 成功、利益、事故、破局、病気、対立の発生を断定しない。

## 6. 重複排除

- 各Clusterは固有の `Selection_Group` を持ち、同じ意味を別Clusterで繰り返さない。
- 月初ネットワークを8月の木星・土星トラインの文章から複製しない。
- 水星・土星オポジションと水星・木星セクスタイルを単独Clusterとして追加しない。
- 満月Clusterの区切りと月末Clusterの圧力を同じ「手放し」文章にしない。
- 基本総評、可変日付段落、長期背景の説明と重なる場合は、複合配置ならではの天体間の働きへ焦点を戻す。

## 7. 執筆単位ごとの検証

1. 同一Cluster・同一Anchor_Solar_Houseの12行だけを編集する。
2. 条件列を生成時スケルトンと比較する。
3. Active行のTitle、Paragraph、文字数、`{event_date}`、固定日付、未知トークンを検証する。
4. Cluster内と他系統の完全重複、意味重複、Selection_Group競合を確認する。
5. CSVをレンダリングし、文字化け、行ずれ、見切れを目視確認する。
6. PASSした12行だけを完成数へ加える。

## 8. 完成条件

- 5 Clusterが各144行あり、アンカーハウス12 x 12を1回ずつ持つ。
- 合計720行、Active 720、validator PASSを満たす。
- 条件列が生成時から不変で、全執筆単位の目視結果が進捗MDに記録されている。

現在の完成数は0 / 720行。CSV構造の生成と保護列検証が終わるまで執筆を開始しない。
