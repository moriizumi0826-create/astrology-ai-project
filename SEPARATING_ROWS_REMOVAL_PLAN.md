# Separating行削除計画 実行書

## 目的

`M_Aspect_Interpretation*.csv`の容量と行数を削減するため、`Orb_Status = Separating`行を削除する。

ただし、`Separating`という状態自体は削除しない。アスペクト計算上の状態値としては保持し、文章・スコア・各種フラグの参照元だけを`Applying`行へ統一する。

## 基本方針

- CSV上の`Separating`行は削除対象。
- 実際のアスペクト状態としての`orb_status` / `_orb_status`は残す。
- 解釈文、タイトル、スコア、優先度、各種フラグ、カウントダウンIDなどのマスタ参照は`Applying`行を使う。
- `Separating`行削除後も、UI側では必要に応じて「ピーク前」「ピーク後」などを`_orb_status`から表示できる状態にする。
- `M_Aspect_Interpretation_Yearly.csv`は通常CSVの削除安定後に扱う。最初から同時削除しない。

## 削除対象ファイル

第一段階の対象:

- `database/M_Aspect_Interpretation sun,moon.csv`
- `database/M_Aspect_Interpretation mercury.csv`
- `database/M_Aspect_Interpretation venus,mars.csv`
- `database/M_Aspect_Interpretation jupiter,uranus.csv`
- `database/M_Aspect_Interpretation neptune,pluto.csv`

第二段階の検討対象:

- `database/M_Aspect_Interpretation_Yearly.csv`

## 現在の削減見込み

通常5ファイル:

| ファイル | 全行数 | Applying | Separating |
|---|---:|---:|---:|
| `M_Aspect_Interpretation jupiter,uranus.csv` | 41,469 | 20,745 | 20,724 |
| `M_Aspect_Interpretation mercury.csv` | 13,824 | 6,912 | 6,912 |
| `M_Aspect_Interpretation neptune,pluto.csv` | 27,657 | 13,829 | 13,828 |
| `M_Aspect_Interpretation sun,moon.csv` | 12,248 | 6,122 | 6,126 |
| `M_Aspect_Interpretation venus,mars.csv` | 27,648 | 13,824 | 13,824 |

通常5ファイル合計:

- 削除候補: 61,414行

`M_Aspect_Interpretation_Yearly.csv`:

- 削除候補: 15,350行

全体合計:

- 削除候補: 76,764行

## 事前に必要なコード修正

### 1. 年間予測側

対象:

- `backend/app/services/yearly_forecast_service.py`

対応済み方針:

- `orb_status`はイベント状態として保持する。
- 解釈行検索では、実際の`orb_status`ではなく`Applying`行を優先参照する。

確認ポイント:

- `event["orb_status"]`は`Separating`のまま残る。
- `event["description"]`や`event["title"]`はApplying行由来になる。
- test1で同一アスペクトのApplying/Separating期間が本文差分で分裂しない。

### 2. Dashboard / 今日の洞察 / 日次系

対象:

- `backend/app/services/reading_service.py`

必須修正:

- `get_aspect_interpretation()`で`Orb_Status`を文章選択キーとして使わない。
- `get_aspect_interpretation()`のマスタ参照は`Applying`行を優先する。
- `_orb_status`には実際の状態を残す。

影響箇所:

- Dashboard Heroスコア
- 今日の洞察
- 重要ポイント
- Diagnostic
- Topics
- Timeline
- Countdown
- Daily Performance
- developerMeta

### 3. カウントダウン

対象:

- `reading_service._select_countdown_targets()`
- `reading_service.build_countdown_data()`

方針:

- 対象選定では`_orb_status`を使ってよい。
- 表示文、`Countdown_ID`、`Countdown_Label`、`Score_Impact`、`Priority`はApplying行由来でよい。
- `departure`系表示が必要な場合も、CSVのSeparating行には依存しない。

### 4. Daily Performance

対象:

- `reading_service._build_daily_performance()`
- `reading_service._daily_performance_aspect_breakdown()`

方針:

- `Score_Impact`
- `Priority`
- `Decision_Flag`
- `Sync_Flag`
- `Noise_Flag`
- `Essential_Dignity_Score`

これらもApplying行を基準にする。

注意:

- Separating行とApplying行でスコアやフラグが異なる場合、削除後はスコアが変わる。
- この変化は仕様として許容するのか、削除前に差分確認する。

## CSV削除前チェック

### 1. Applying対応行の存在確認

`Separating`行を削除する前に、同じ条件の`Applying`行が存在するか確認する。

比較キー:

- `T_Planet`
- `N_Planet`
- `Aspect_Angle`
- `Category`
- `N_House`
- `T_Retrograde_Flag`

既知の注意:

- `sun,moon`に、対応ApplyingがないSeparating行が7件ある。
- この7件は削除前にApplying行を補完するか、Category不整合を修正する。

### 2. 削除対象条件

通常CSV:

```text
Orb_Status == Separating
```

Yearly CSV:

```text
Aspect_Logic_ID endswith "_Separating"
```

## 実行順

### Phase 1: 参照ロジック修正

1. `reading_service.get_aspect_interpretation()`をApplying優先参照へ変更。
2. `_orb_status`は実際の状態を保持することを確認。
3. 年間予測側とDashboard側で同じ参照方針になっていることを確認。

### Phase 2: 実データ回帰確認

最低限、以下の実データで確認する。

```text
birth_date: 1984-08-26
birth_time: 19:20
latitude: 35.8078
longitude: 139.7241
timezone_offset: 9
timezone_name: Asia/Tokyo
```

確認ページ:

- `dashboard.html`
- `forecast-detail.html`

確認項目:

- Dashboardが表示される。
- 今日の洞察が表示される。
- 重要ポイントが空にならない。
- Daily Performanceが表示される。
- Annual Forecastが表示される。
- Monthly Matrixが表示される。
- test1が表示される。
- test1で同一アスペクトが不自然に細切れにならない。
- カウントダウンが表示される。

### Phase 3: CSV補完

`sun,moon`の対応Applyingなし7件を修正する。

方針:

- 既存のSeparating行を元にApplying行を作る。
- `Orb_Status`を`Applying`へ変更。
- `Aspect_Logic_ID`末尾を`_Applying`へ変更。
- 本文は当面そのままでもよいが、後でApplying文へ整える。

### Phase 4: 通常5ファイルからSeparating行削除

対象:

- `M_Aspect_Interpretation sun,moon.csv`
- `M_Aspect_Interpretation mercury.csv`
- `M_Aspect_Interpretation venus,mars.csv`
- `M_Aspect_Interpretation jupiter,uranus.csv`
- `M_Aspect_Interpretation neptune,pluto.csv`

削除後に確認:

- 行数が想定通り減っている。
- CSVヘッダーが壊れていない。
- 文字コードが変わっていない。
- `csv.DictReader`で読める。
- `reading_service.reload_master_dataframes_if_changed()`後に正常に読める。

### Phase 5: 回帰テスト

必須:

```bash
python -m unittest backend.tests.test_api -v
python -m unittest backend.tests.test_yearly_forecast -v
cd frontend && npm run build
```

可能なら追加:

- 実APIでDashboard生成
- 実APIでYearly Forecast生成
- ブラウザでスマホ幅確認

### Phase 6: Yearly CSV削除検討

通常CSV削除後に問題がなければ、`M_Aspect_Interpretation_Yearly.csv`の`_Separating`行削除を検討する。

注意:

- 年間スコア、Graph Visibility、Milestone Eligible、Yearly Weightに影響する。
- 通常CSVよりも年間グラフへの影響が直接的。
- 先に`Aspect_Logic_ID`参照をApplying IDへ正規化する必要がある。

## 想定される影響

### 表示文

Separating専用文は表示されなくなる。

仕様:

- ピーク後でもApplying本文を表示する。
- ピーク後であることを表示したい場合は、本文ではなく`_orb_status`由来の小ラベルで対応する。

### スコア

Separating行とApplying行で`Score_Impact`が違う場合、スコアが変わる。

影響先:

- Dashboard Heroスコア
- Diagnostic
- Timeline
- Daily Performance
- Annual Forecast
- Monthly Matrix
- Countdown順位

### 参照元表示

developerMetaや検証ページ上の参照元はApplying行を指すようになる。

例:

```text
実際の状態: Separating
参照元CSV行: Applying
```

この状態は仕様として扱う。

## 削除してはいけないもの

- `orb_status`
- `_orb_status`
- トランジット計算上のApplying/Separating判定
- `Retrograde_Flag`
- `T_Retrograde_Flag`
- `M_Transit_Calendar_*.csv`上の逆行情報

## 完了条件

- 通常5ファイルの`Separating`行が削除されている。
- Dashboardが実データで動く。
- 今日の洞察が表示される。
- Daily Performanceが表示される。
- Annual Forecastが実データで動く。
- test1が実データで動く。
- カウントダウンが壊れていない。
- Backendテストが通る。
- Frontendビルドが通る。
- 参照元がApplying行になることを仕様として確認済み。

