# 2026年9月 月間総評 完走進捗

## 0. このファイルの役割

このファイルを2026年9月分の作業状況と判断の正本にする。
作業再開時は、共通ガイド、9月用ガイド、このファイル、実データ、直近テスト結果の順に照合する。
記録と実データが食い違う場合は実データを優先し、このファイルを修正してから次へ進む。

## 1. 完了条件

次の全条件を満たした時だけ2026年9月分を完了とする。

- 基本総評 `Edition_ID=2026_VIRGO` が144 / 144行完成
- 可変日付段落CSVが確定構造の全行完成、全行Active
- 複合配置CSVが確定した全Clusterについて各144行完成、全行Active
- 個人用長期背景が276 / 276行完成、Active 276
- 月別3ファイルがバックエンドの自動検出対象になり、9月30日分を生成できる
- 基本総評、可変段落、複合配置、長期背景、resonanceが既存の選択規則で合成される
- 必須validator、単体テスト、統合テスト、本番ビルドがすべてPASS
- デスクトップとモバイルの実画面で文字化け、見切れ、重なり、未置換トークンがない
- 3件以上の出生データで期間境界、星座移動、9月11日の天王星逆行開始前後を確認済み

完了条件を満たすまでは、完了・100%・PAUSEDとして扱わない。

## 2. 保護対象

必要な接続修正または不具合修正を除き、次を変更しない。

- `database/M_Monthly_Overview_Event_Paragraphs_2026_08.csv`
- `database/M_Monthly_Overview_Aspect_Clusters_2026_08.csv`
- `database/M_Personal_Long_Term_Background_2026_08.csv`
- `database/M_Monthly_Overview_Editorial.csv` の既存Edition
- 既存スコア
- 既存アスペクト計算条件
- `database/M_Transit_Calendar_2026.csv`
- 既存の2026年8月文章

9月用CSV生成後は、ID、Month_ID、条件、天体、星座、ハウス、期間、Priorityなどの保護列を固定する。
文章執筆中に保護列を変更しない。

## 3. 参照ファイル

必ず読むもの:

- `database/monthly_overview_editorial_writing_guidelines.md`
- `database/monthly_overview_editorial_writing_guidelines_2026_09.md`（準備工程で作成）
- `database/monthly_overview_event_paragraph_writing_guidelines_2026_09.md`（準備工程で作成）
- `database/monthly_overview_aspect_cluster_writing_guidelines_2026_09.md`（準備工程で作成）
- `database/M_Transit_Calendar_2026.csv`
- `backend/app/services/monthly_overview_service.py`
- `backend/app/services/yearly_forecast_service.py`
- `backend/tests/test_monthly_overview.py`
- `backend/tests/test_monthly_overview_integration.py`

8月用ガイドは構造と検証手順の参考に限る。9月文章の流用元にはしない。

## 4. 2026年9月の確定済み暦条件

`M_Transit_Calendar_2026.csv` から確認済み:

| 日付 | 変化 |
|---|---|
| 2026-09-10 | 金星が天秤座から蠍座へ移動 |
| 2026-09-11 | 水星が乙女座から天秤座へ移動 |
| 2026-09-11 | 天王星が双子座で逆行開始 |
| 2026-09-23 | 太陽が乙女座から天秤座へ移動 |
| 2026-09-28 | 火星が蟹座から獅子座へ移動 |
| 2026-09-30 | 水星が天秤座から蠍座へ移動 |

月初配置と月内滞在星座:

- 太陽: 乙女座、9月23日から天秤座
- 水星: 乙女座、9月11日から天秤座、9月30日から蠍座
- 金星: 天秤座、9月10日から蠍座
- 火星: 蟹座、9月28日から獅子座
- 木星: 獅子座を通月運行
- 土星: 牡羊座で逆行継続
- 天王星: 双子座、9月11日から逆行
- 海王星: 牡羊座で逆行継続
- 冥王星: 水瓶座で逆行継続

固定日付を文章へ直接書き込まず、可変日付段落では`Date_Source`と`Date_Key`から解決する。

## 5. 成果物と現在数

| 系統 | 対象 | 構造数 | 完成数 | Active | 状態 |
|---|---|---:|---:|---:|---|
| 基本総評 | `M_Monthly_Overview_Editorial.csv` / `2026_VIRGO` | 144確定 | 0 | 対象外 | 未着手 |
| 可変日付段落 | `M_Monthly_Overview_Event_Paragraphs_2026_09.csv` | 840見込み | 0 | 0 | 未生成 |
| 複合配置 | `M_Monthly_Overview_Aspect_Clusters_2026_09.csv` | 720確定（5配置 x 144行） | 0 | 0 | Cluster一覧確定・CSV未生成 |
| 長期背景 | `M_Personal_Long_Term_Background_2026_09.csv` | 276確定 | 0 | 0 | 未生成 |

可変日付段落840行見込みの内訳:

- `sign_ingress`: 5イベント x 144行 = 720行
- `natal_house_ingress`: 10天体星座区間 x 12行 = 120行

実際の生成結果を検証するまで840を確定値として扱わない。

長期背景276行は、現行生成ロジックで書き込みなしの事前計算を行い確認済み:

- `background`: 60行
- `resonance / same_natal_house`: 216行
- `resonance / same_sign`: 0行
- 合計: 276行

## 6. 厳守する工程順

後工程へ飛ばさない。未完成の最上位工程だけを進める。

### 準備工程 条件と構造の確定

- [ ] 9月用基本総評ガイドを作成
- [ ] 9月用可変日付段落ガイドを作成
- [ ] 9月用複合配置ガイドを作成
- [x] 可変日付段落の採用イベント範囲を確定
- [x] 個人用長期背景の構成と表示上限を確定
- [x] 基本総評のEditionと月途中の扱いを確定
- [ ] `generate_monthly_overview_event_template_scaffold.py`を月汎用化
- [ ] `validate_monthly_overview_event_templates.py`を9月構造へ対応
- [x] 9月の重要複合配置、期間、アンカー、Selection_Group、Priorityを既存計算から確定
- [ ] `validate_monthly_overview_aspect_clusters.py`の8月固定条件を月別対応へ変更
- [ ] 可変日付段落CSVを生成し、行数・ID・条件・期間を検証
- [ ] 複合配置CSVを生成し、Clusterごとの144組を検証
- [ ] 長期背景CSVを生成し、276行と保護列を検証
- [ ] 各CSVの保護列スナップショットまたは比較方法を確立

準備工程の停止条件:

- 全CSVの構造数と条件列が確定するまで文章を書かない
- 複合配置のCluster一覧が確定するまで複合配置文章を書かない
- 既存アスペクト計算条件をCSV都合で変更しない

### 工程1 基本総評144行

2026年8月13日の確認で、9月全体の基本総評は`Edition_ID=2026_VIRGO`の144行を使用すると確定した。
9月23日の太陽・天秤座入りで基本総評を`2026_LIBRA`へ切り替えず、可変日付段落で月後半の変化を補足する。

- [ ] `Edition_ID=2026_VIRGO` の144組を追加
- [ ] Solar_House 1 / Natal_House 1-12
- [ ] Solar_House 2 / Natal_House 1-12
- [ ] Solar_House 3 / Natal_House 1-12
- [ ] Solar_House 4 / Natal_House 1-12
- [ ] Solar_House 5 / Natal_House 1-12
- [ ] Solar_House 6 / Natal_House 1-12
- [ ] Solar_House 7 / Natal_House 1-12
- [ ] Solar_House 8 / Natal_House 1-12
- [ ] Solar_House 9 / Natal_House 1-12
- [ ] Solar_House 10 / Natal_House 1-12
- [ ] Solar_House 11 / Natal_House 1-12
- [ ] Solar_House 12 / Natal_House 1-12
- [ ] 144行validator PASS
- [ ] 12行単位のレンダリング目視PASS

執筆単位は同一Solar_Houseの12行だけとする。
編集列は`Title`、`Summary`、`Interpretation`、`Action`のみ。

### 工程2 可変日付段落

2026年8月13日の確認で、可変日付段落は次の5回の星座移動を採用すると確定した。
9月11日の天王星逆行開始は可変日付段落へ追加せず、個人用長期背景の`State_Changes`と本文で扱う。

- [ ] 金星 天秤座 -> 蠍座のsign_ingress 144行
- [ ] 水星 乙女座 -> 天秤座のsign_ingress 144行
- [ ] 太陽 乙女座 -> 天秤座のsign_ingress 144行
- [ ] 火星 蟹座 -> 獅子座のsign_ingress 144行
- [ ] 水星 天秤座 -> 蠍座のsign_ingress 144行
- [ ] 太陽のnatal_house_ingress 24行見込み
- [ ] 水星のnatal_house_ingress 36行見込み
- [ ] 金星のnatal_house_ingress 24行見込み
- [ ] 火星のnatal_house_ingress 24行見込み
- [ ] 木星のnatal_house_ingress 12行見込み
- [ ] 全行validator PASS
- [ ] 全執筆単位のレンダリング目視PASS

1回の執筆単位は、同一イベント・同一条件の12行とする。
条件列、Date_Source、Date_Key、Priorityは変更しない。

### 工程3 複合配置

2026年9月の複合配置は、2026年8月13日の確認で次の5件に確定した。
水星・土星オポジションと水星・木星セクスタイルは単独Clusterにせず、文章過多と意味重複を避ける。

| Cluster_ID | 有効期間 | 主ピーク | アンカー | Selection_Group | Priority | 行数 |
|---|---|---|---|---|---:|---:|
| `2026_09_OPENING_FOUR_PLANET_NETWORK` | 9月1日-3日 | 9月1日（木星・土星120度、火星・土星90度、水星・火星60度） | SATURN | `SEP_OPENING_STRUCTURE` | 100 | 144 |
| `2026_09_MERCURY_OUTER_NETWORK` | 9月12日-15日 | 9月13日-14日（水星と冥王星・海王星・天王星） | MERCURY | `SEP_MERCURY_OUTER_NETWORK` | 100 | 144 |
| `2026_09_VENUS_PLUTO_SQUARE` | 9月14日-18日 | 9月16日03時34分頃 | VENUS | `SEP_VALUES_POWER` | 90 | 144 |
| `2026_09_FULL_MOON_OUTER_NETWORK` | 9月26日-29日 | 9月27日01時49分頃 | SUN | `SEP_FULL_MOON_OUTER_NETWORK` | 100 | 144 |
| `2026_09_MONTH_END_TSQUARE_BUILDING` | 9月30日 | 10月2日-3日（水星・火星・冥王星Tスクエア完成） | MERCURY | `SEP_MONTH_END_PRESSURE` | 100 | 144 |

技術条件:

- 月初ネットワークは8月CSVの木星・土星トラインを9月へ複製せず、9月1日に重なる4天体配置として統合する
- 水星外惑星ネットワークには、9月11日の天王星逆行開始を時期背景として反映する
- 満月ネットワークの月採用条件は`lunation_plus_planet`とする
- 月末Tスクエアは9月30日に形成開始として表示し、10月の完成を成功・事故などの断定へ結び付けない
- 水星・土星オポジションと水星・木星セクスタイルは不採用とし、別Clusterを生成しない

- [x] Cluster一覧確定（5配置・720行）
- [ ] 全Clusterでアンカーハウス12 x 12を生成
- [ ] 各Clusterを同一Anchor_Solar_Houseの12行単位で執筆
- [ ] Selection_Group競合とSupersedesを検証
- [ ] 全行validator PASS
- [ ] 全執筆単位のレンダリング目視PASS

総行数は`5配置 x 144 = 720行`とし、8月の864行を流用しない。

### 工程4 個人用長期背景276行

2026年8月13日の確認で、既存ルールを維持すると確定した。

- `background`: 60行
- `resonance / same_natal_house`: 216行
- `resonance / same_sign`: 0行
- 表示上限: 長期背景2件、resonance 1件
- 9月11日の天王星逆行開始は、該当する長期背景の`State_Changes`と本文で扱う

- [ ] background 60行
- [ ] resonance / same_natal_house 216行
- [ ] Active 276
- [ ] 長期背景validator PASS
- [ ] 全執筆単位のレンダリング目視PASS

執筆単位:

- backgroundは同一Primary_Planet・Primary_Sign・有効期間の12行
- same_natal_houseは同一天体ペア・星座組み合わせ・有効期間の12行
- 9月はsame_sign行なし

編集列は`Title`、`Interpretation`、`Active_Flag`のみ。
天王星を含み`State_Changes`に9月11日の逆行開始がある行は、転換時期と前後の意味を必ず書く。

### 工程5 接続・統合・表示検証

既存バックエンドは月別ファイル名を汎用解決し、次の3ファイルが揃う月を自動検出する。

- Event Paragraphs
- Aspect Clusters
- Personal Long-Term Background

したがって、新しいローダーを作らない。既存接続で9月が検出されない場合だけ不具合修正する。

- [ ] `_available_monthly_overview_ids(2026)`が`2026_09`を返す
- [ ] 9月1日から30日まで`monthly_overviews["2026-09"]`を生成
- [ ] 基本総評が`2026_VIRGO`から1行だけ選択される
- [ ] 可変日付段落の`{event_date}`がすべて置換される
- [ ] 複合配置の期間・アンカー・Selection_Groupが正しく切り替わる
- [ ] 長期背景最大2件、resonance最大1件を維持
- [ ] 文章系統間の完全重複・意味重複を確認
- [ ] 3件以上の出生データで30日分を生成
- [ ] デスクトップ目視PASS
- [ ] モバイル目視PASS
- [ ] 全validator・単体・統合テストPASS
- [ ] `npm run build` PASS

## 7. 必須検証コマンド

基本総評:

```powershell
python scripts/validate_monthly_overview_editorial.py database/M_Monthly_Overview_Editorial.csv 2026_VIRGO
```

可変日付段落:

```powershell
python scripts/validate_monthly_overview_event_templates.py database/M_Monthly_Overview_Event_Paragraphs_2026_09.csv
```

複合配置:

```powershell
python scripts/validate_monthly_overview_aspect_clusters.py database/M_Monthly_Overview_Aspect_Clusters_2026_09.csv
```

長期背景:

```powershell
python scripts/validate_personal_long_term_background.py database/M_Personal_Long_Term_Background_2026_09.csv
```

バックエンド:

```powershell
python -m pytest backend/tests/test_monthly_overview.py backend/tests/test_monthly_overview_integration.py backend/tests/test_yearly_forecast.py -q
```

フロントエンド:

```powershell
cd frontend
npm test
npm run build
```

最終段階では`python -m pytest backend/tests -q`も実行する。

## 8. バッチごとの記録欄

各執筆単位の直後に追記する。

| 日時 | 工程 | 対象単位 | 完成数 / 全数 | validator | 目視 | 条件列不変 | 次 |
|---|---|---|---:|---|---|---|---|
| 2026-08-13 | 準備前調査 | 9月暦・長期背景構造 | 0 / 未確定 | 未実行 | 未実行 | 未編集 | 準備工程のガイド・生成・validator整備 |
| 2026-08-13 | 準備工程 | 複合配置Cluster一覧 | 5 / 5配置（720行予定） | 暦・正確時刻照合済み | 対象外 | CSV未生成 | 事前決定2と9月用ガイド作成 |
| 2026-08-13 | 準備工程 | 可変日付段落の採用範囲 | 星座移動5件（840行見込み） | 暦照合済み | 対象外 | CSV未生成 | 事前決定3 |
| 2026-08-13 | 準備工程 | 長期背景の構成・表示上限 | 276行（60 + 216） | 生成ロジック事前計算済み | 対象外 | CSV未生成 | 事前決定4 |
| 2026-08-13 | 準備工程 | 基本総評Edition・月途中の扱い | `2026_VIRGO` 144行 | 読み込み仕様・暦照合済み | 対象外 | 既存Edition未編集 | 9月用ガイド作成 |

## 9. 現在の検証結果

- 9月暦の星座移動・逆行転換: 確認済み
- 基本総評Edition: `2026_VIRGO`と確認済み
- 基本総評の月途中切替: なし。9月23日の太陽移動は可変日付段落で扱うと確定
- 長期背景構造: 276行と事前計算済み
- 複合配置構造: 5配置・720行に確定
- 可変日付段落: 星座移動5件を採用、天王星逆行開始は長期背景で扱うと確定
- 個人用長期背景: 276行、same_signなし、長期背景2件・resonance 1件上限で確定
- 9月用CSV: 未生成
- 9月用validator: 未対応箇所あり
- バックエンド9月接続: 未検証
- 実画面: 未検証
- 共通表示順: `Event_Date`と`Peak_At`による時系列順へ修正済み。2026年8月13日の実画面で確認済み

## 10. 次に着手する作業

事前決定4項目は完了した。引き続き準備工程だけを進める。

1. 9月用ガイド3種類を作成する
2. 可変日付段落生成スクリプトを月汎用化する
3. EventとAspect Cluster validatorの8月固定条件を月別対応へ変更する
4. 4系統の条件構造を生成・検証し、このファイルの構造数を更新する

条件構造が確定するまで、文章執筆へ進まない。
