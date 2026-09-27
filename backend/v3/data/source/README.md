# V3出生地検索データ

GeoNamesの2026-09-27配布版を同梱。ライセンスは[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)で、画面に[GeoNames](https://www.geonames.org/)への出典リンクを表示する。元データは[公式ダウンロード](https://download.geonames.org/export/dump/)から取得した。

| ファイル | SHA-256 |
| --- | --- |
| `cities500.zip` | `a99f1423b13c52d51e281d27fa924c2b11f05a57a96467ff7b8ea437e0b21b38` |
| `JP.zip` | `8bac690b3e08d8d0beb110782a228bb07c492cf992205807853145fbfeccf61d` |
| `admin1CodesASCII.txt` | `1da92a6323a5fec3176f3f743bf4cf4040fd56a876da55e46fbca23c863aa60a` |
| `countryInfo.txt` | `93bafc525813f22e4711ff9ed6d626343094ce48c26388dc7c49189b3d7d5512` |

`cities500.zip`の都市・集落と、`JP.zip`の追加の日本の都市・集落・市区町村を索引化する。観光施設・空港などは出生地候補から除外する。座標とIANAタイムゾーン名を使用し、出生当時の時差は既存の出生計算で求める。郵便番号データと現在年の時差表は使用しない。

更新時は4ファイルを同じ日の公式配布版に差し替え、SHA-256を更新してから以下を実行する。

```powershell
python -m scripts.build_v3_geonames --source-dir backend/v3/data/source --output backend/v3/data/geonames.sqlite
```

生成するSQLiteはGit管理せず、Renderのバックエンドビルド時に同じコマンドで再生成する。新データの候補品質・容量・検索時間を確認してからpushする。
