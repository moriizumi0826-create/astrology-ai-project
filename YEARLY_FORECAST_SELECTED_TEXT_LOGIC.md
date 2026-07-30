# 2026運勢シミュレーション 選択日の説明文ロジック

## 結論

選択された日の `text_description` 欄には、選択中ジャンルの代表アスペクトの `description` が表示される。

対象ジャンルは以下。

- `general`
- `work`
- `love`
- `money`

## 代表アスペクトの選び方

バックエンドで、その日の全イベントからジャンルごとに代表アスペクトを選ぶ。

選定条件は以下の順。

1. `aspect_angle` が存在するイベントだけを対象にする
2. 選択中ジャンルと同じ `category` のイベントだけに絞る
3. `priority` が最も高いものを選ぶ
4. `priority` が同じ場合は `abs(weighted_score)` が大きいものを選ぶ

つまり、単純な `weighted_score` 最大ではなく、まず `priority` が優先される。

## weighted_score の計算

`weighted_score` は以下の要素から計算される。

```text
Score_Impact × priority_weight × orb_decay × yearly_weight
```

主な意味は以下。

- `Score_Impact`: CSV上の影響スコア
- `priority_weight`: priority から作る重み
- `orb_decay`: オーブがタイトなほど強くなる補正
- `yearly_weight`: 年運用マスターの重み

## 表示までの流れ

1. バックエンドが日ごとのイベントを生成する
2. `_category_highlights()` がジャンル別の代表アスペクトを作る
3. APIレスポンスの `day.category_highlights` に入る
4. フロントエンドが選択日と選択ジャンルから代表イベントを取得する
5. `selectedEvent.description` を画面の説明文として表示する

## 関連コード

バックエンドの代表選定:

```text
backend/app/services/yearly_forecast_service.py
_strongest_yearly_aspect()
_category_highlights()
```

フロントエンドの取得と表示:

```text
frontend/src/yearly-forecast.jsx
eventForSeries()
selectedEvent.description
```

## 注意点

`events` にはその日の上位イベントだけが入るが、`category_highlights` はその日の全イベントから作られる。

そのため、画面に表示されるジャンル別説明文は、`events` の上位5件に必ず含まれるとは限らない。
