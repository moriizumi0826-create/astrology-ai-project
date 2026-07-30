# あなたの星模様 アスペクト表示ロジック

## 結論

「あなたの星模様」に表示されるアスペクトは、全アスペクトを単純にスコア順で並べたものではない。

まず短期天体のアスペクトだけに絞り、そのうえでポジティブとネガティブを別々に最大2件ずつ表示する。

## 対象になるトランジット天体

対象は以下の短期天体のみ。

- `MOON`
- `MERCURY`
- `VENUS`
- `MARS`

以下のような長期天体は、この「あなたの星模様」のアスペクト表示では除外される。

- `JUPITER`
- `SATURN`
- `URANUS`
- `NEPTUNE`
- `PLUTO`

## 表示グループ

アスペクトは `Score_Impact` の符号で2グループに分かれる。

### ポジティブ

条件:

```text
Score_Impact > 0
```

並び順:

1. `Score_Impact` が高い順
2. 同点なら `Priority` が高い順

表示件数:

```text
最大2件
```

### ネガティブ

条件:

```text
Score_Impact < 0
```

並び順:

1. `abs(Score_Impact)` が高い順
2. 同点なら `Priority` が高い順

表示件数:

```text
最大2件
```

## 画面に渡されるデータ

バックエンドは以下の形でフロントに渡す。

```text
hero.aspectHighlights.positive
hero.aspectHighlights.negative
```

フロントエンドはそれぞれ先頭2件を表示する。

## 関連コード

バックエンドの抽出と並び替え:

```text
backend/app/services/reading_service.py
PERSONAL_READING_TRANSIT_PLANETS
_top_hero_aspect_highlights()
```

フロントエンドの表示:

```text
frontend/src/dashboard-shared.jsx
PersonalAspectHighlights()
positiveHighlights
negativeHighlights
```

## 注意点

「あなたの星模様」は、今日の個人向け短期影響を見せる枠。

そのため、長期的に重要なアスペクトや、Priority が高い長期天体アスペクトがあっても、この枠には表示されない。

長期的な流れは、別枠のカウントダウンや2026運勢シミュレーション側で扱う。
