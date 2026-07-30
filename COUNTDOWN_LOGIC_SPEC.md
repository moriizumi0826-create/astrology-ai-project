# Countdown Logic Spec

## 目的

ダッシュボードのカウントダウンは、ネイタル天体とトランジット天体のアスペクトから、短期テーマと中長期テーマを表示するための仕組みです。

表示は以下を分けて扱います。

- ポジティブ: ピーク、最接近、到達までのカウントダウン
- ネガティブ: 影響下を抜けるまでのカウントダウン
- 短期テーマ: Transit Moon, Sun, Mercury, Venus, Mars
- 中長期テーマ: Transit Jupiter, Saturn, Uranus, Neptune, Pluto

## 参照ファイル

- `backend/app/services/reading_service.py`
- `database/M_Aspect_Interpretation*.csv`
- `database/M_Countdown_Master.csv`
- `database/M_Transit_Calendar_2026.csv`
- `frontend/src/dashboard-shared.jsx`

## CSVの役割

### M_Aspect_Interpretation

アスペクトごとの意味、スコア、候補選定条件を持ちます。

カウントダウンで特に使う列は以下です。

- `T_Planet`: トランジット天体
- `N_Planet`: ネイタル天体
- `Aspect_Angle`: アスペクト角度
- `Orb_Status`: `Applying` または `Separating`
- `Score_Impact`: ポジティブ、ネガティブの判定に使う
- `Priority`: 同一候補内の優先度
- `Countdown_ID`: `M_Countdown_Master.Trigger_ID` と対応する
- `Countdown_Label`: Master未ヒット時などの補助ラベル

`Score_Impact` は必ず明示するのが望ましいです。空欄の場合、バックエンドがフォールバック計算で補いますが、CSV上の意図と実行時の候補がズレる原因になります。

### M_Countdown_Master

表示タイトル、到達文、進行度バーの母数、しきい値を持ちます。

カウントダウンで使う列は以下です。

- `Trigger_ID`: `M_Aspect_Interpretation.Countdown_ID` と一致させる
- `Target_Category`: Love, Work, Money, General など
- `Display_Title`: 通常表示タイトル
- `Arrival_Text`: 到達時、または離脱完了時のタイトル
- `Threshold_Orb`: 影響下とみなすオーブ幅
- `Progress_Max_Days`: 進行度バーの標準母数
- `Next_Action_Hint`: カード下部の行動ヒント

`Progress_Max_Days` は「あと何日」の真実値ではありません。実際の残日数はエフェメリススキャンから取得します。`Progress_Max_Days` は進行度バーの表示母数、つまり演出上の標準期間です。

## Countdown_ID命名規則

既存のベースIDに、期間と符号を表す suffix を付けます。

```text
BASENAME_MOON_POS
BASENAME_MOON_NEG_EXIT
BASENAME_SHORT_POS
BASENAME_SHORT_NEG_EXIT
BASENAME_MID_POS
BASENAME_MID_NEG_EXIT
BASENAME_LONG_POS
BASENAME_LONG_NEG_EXIT
```

期間分類は以下です。

```text
MOON: Transit Moon
SHORT: Transit Sun, Mercury, Venus, Mars
MID: Transit Jupiter, Saturn
LONG: Transit Uranus, Neptune, Pluto
```

符号分類は以下です。

```text
POS: Score_Impact > 0
NEG_EXIT: Score_Impact < 0
```

`Score_Impact = 0` はカウントダウン候補には使いません。

## 候補選定

候補選定は `reading_service.py` の `_select_countdown_targets` と `build_dashboard_data_from_interpretations` で行います。

対象になる `Orb_Status` は以下です。

```text
Applying
Separating
```

ポジティブ候補の条件です。

```text
Score_Impact > 0
Orb_Status in Applying, Separating
```

ネガティブ候補の条件です。

```text
Score_Impact < 0
Orb_Status in Applying, Separating
```

表示件数は以下です。

```text
短期テーマ: ポジティブ3件 + ネガティブ3件
中長期テーマ: ポジティブ3件 + ネガティブ3件
```

ポジティブ候補は、スコアと優先度で多めに抽出してから実際の日数をscanします。表示時は `days_remaining > 0` の候補を優先し、次に `exact` の0日、最後にピーク通過済みの0日を使います。これにより、未来候補があるのに `turning_away / 0日` ばかりで埋まる状態を避けます。

ネガティブ候補は departure モードで計算し、`scan_status == "departing"` のものだけを表示します。

## arrival モード

arrival モードはポジティブ側で使います。

目的は「ピーク、最接近、到達までの日数」を出すことです。

処理概要です。

1. 現在日時から未来方向へエフェメリスをスキャンする
2. トランジット天体とネイタル天体のオーブを日単位で計算する
3. オーブが `0.5` 度以内になったら `exact`
4. 途中でオーブが増加し始めたら `turning_away`
5. 逆行カレンダー上の逆行開始がピーク前またはピーク時で、再接近が確認できる場合は `retrograde_turning_away`
6. それ以外で最小オーブへ向かう場合は `closest`

主な `scan_status` です。

```text
exact: 0.5度以内に到達
closest: 未来方向に最接近点がある
turning_away: すでに最接近点を過ぎて離れ始めている
retrograde_turning_away: 逆行開始により一度離れ、再接近する見込みがある
unknown: エフェメリススキャン不可
```

ピークを過ぎた場合、`days_remaining` は `0` です。以前のように `1` 日へ丸めません。

## departure モード

departure モードはネガティブ側で使います。

目的は「悪影響、負荷、緊張の影響下を抜けるまでの日数」を出すことです。

処理概要です。

1. 現在日時から未来方向へエフェメリスをスキャンする
2. オーブが `Threshold_Orb` 以内に入っている状態を影響下とみなす
3. 一度でも影響下に入ったあと、オーブが `Threshold_Orb` を超えた日を離脱日とする
4. 離脱日が取れた場合だけ `scan_status = "departing"` として表示対象にする

departure の `days_remaining` は、影響下を抜けるまでの日数です。

ネガティブが `Applying` の場合も、カードのメイン日数は現在の表示対象日数です。加えてフロントでは `scan.departure_day` が存在するときだけ、補助表示として以下を出します。

```text
(影響下を抜けるまで〇日)
```

`departure_day` が取れない場合、この補助文言は表示しません。

## 逆行判定

逆行そのものは Swiss Ephemeris の天体速度で判定します。

ただし `retrograde_turning_away` として表示するには、`M_Transit_Calendar_2026.csv` の逆行開始日も参照します。

条件は以下です。

```text
exact に到達していない
separating_day がある
逆行カレンダー上の retrograde start が separating_day までに存在する
逆行開始が peak_day より前、または peak_day と同日
その後 reapproach_day が確認できる
```

逆行開始がピーク後の場合は、通常の `turning_away` として扱います。

月は逆行しないため、月で逆行注記が出る状態は不正です。

## 日数と進行度

バックエンドが返す主な値です。

```text
days_remaining: 実天体計算で求めた残日数
total_days: 進行度バー用の母数
percent: 進行度バー用の割合
scan_status: exact, closest, turning_away, retrograde_turning_away, departing, unknown
scan: 詳細なスキャン結果
```

`days_remaining` は `Progress_Max_Days` から作りません。原則としてエフェメリススキャンの結果です。

`total_days` は `Progress_Max_Days` を元にします。ただし実際の `days_remaining` が `Progress_Max_Days` を超える場合、表示上の母数が残日数より小さくならないように、スキャン結果側で拡張されることがあります。

フロントの表示は以下の計算です。

```text
elapsedDays = totalDays - daysRemaining
percent = elapsedDays / totalDays * 100
進行度 elapsedDays/totalDays日
```

ピーク通過済みで `days_remaining = 0` の場合は、進行度は満了扱いです。

## タイトル表示

arrival モードのタイトル選択です。

```text
current_orb <= 0.5: Arrival_Text
それ以外: Countdown_Label
Countdown_Label がない場合: Display_Title
```

departure モードのタイトル選択です。

```text
days_remaining <= 0: Arrival_Text
それ以外: Countdown_Label
Countdown_Label がない場合: Display_Title
```

departure では、現在オーブが `0.5` 度以内でも離脱まで日数が残っている場合があります。そのため `current_orb` ではなく `days_remaining` で到達文を出し分けます。

カード下部のヒントは、基本的に `M_Aspect_Interpretation.Advised_Task` を使います。`Advised_Task` がない場合のみ `M_Countdown_Master.Next_Action_Hint` を使います。

## Master未ヒット時

`Countdown_ID` が `M_Countdown_Master.Trigger_ID` にヒットしない場合、バックエンドはフォールバック値を返します。

```text
days_remaining = 0
total_days = 1
percent = 0
title = Countdown_Label
note = Advised_Task または Countdown_Label
```

ただしフロントは `percent` を再計算するため、実表示上は以下になり得ます。

```text
進行度 1/1日 (100%)
```

この状態は望ましくありません。カウントダウン候補になる行の `Countdown_ID` は、必ず `M_Countdown_Master` に存在させます。

## CSV運用ルール

`M_Aspect_Interpretation` を追加、修正するときのルールです。

- `Score_Impact > 0` は `_POS` の `Countdown_ID` を使う
- `Score_Impact < 0` は `_NEG_EXIT` の `Countdown_ID` を使う
- `Transit Moon` は `_MOON_` 系を使う
- `Transit Sun, Mercury, Venus, Mars` は `_SHORT_` 系を使う
- `Transit Jupiter, Saturn` は `_MID_` 系を使う
- `Transit Uranus, Neptune, Pluto` は `_LONG_` 系を使う
- `Score_Impact` は空欄にしない
- `Orb_Status` は `Applying` または `Separating` を明示する
- `Countdown_ID` と `Countdown_Label` の意味を食い違わせない

`M_Countdown_Master` を追加、修正するときのルールです。

- `Trigger_ID` は `Countdown_ID` と完全一致させる
- `Display_Title` は `Countdown_Label` がない場合のフォールバックとして扱う
- ネガティブ系は「負荷を抜けるまで」の文脈にする
- `Arrival_Text` は到達済み、または離脱完了時の文にする
- `Progress_Max_Days` は表示母数であり、実残日数ではない
- 短期IDに60日以上の値を入れない
- Moon系は1から3日程度を基本にする

## 検証チェック

CSV更新後は以下を確認します。

```text
カウントダウン候補の Master未ヒットが 0
短期候補で Progress_Max_Days >= 31 が 0
Score_Impact > 0 なのに NEG_EXIT が付く行が 0
Score_Impact < 0 なのに POS が付く行が 0
```

テスト実行です。

```powershell
python -m unittest backend.tests.test_api -v
```

指定データでのスポット確認例です。

```text
1984/8/26 19:20
緯度 35.8078
経度 139.7241
timezone_offset 9
```

このデータでは、ピーク通過済みの `turning_away` は `days_remaining = 0` になることを確認します。
