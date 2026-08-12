# 2026年8月 月間総評 完走進捗

## 工程1 基本総評144行

- 状態: 完了
- 対象: `database/M_Monthly_Overview_Editorial.csv` の `Edition_ID=2026_LEO`
- 構造: 144 / 144行
- 完成文章: 144 / 144行
- 完成範囲: `Solar_House=1-12`、各`Natal_House=1-12`
- 検証: PASS（総行数288、既存CANCER 144、LEO 144、組み合わせ重複0・欠落0、文章列・文字数・固定日付・トークン・完全重複、レンダリング目視）
- 次: 工程3のバックエンド接続へ進む

## 工程2 個人用長期背景277行

- 状態: 完了
- 構造: 277行（background 60、resonance 217）
- 完成・Active: 277 / 277行
- 完成範囲: background全60行、resonance全217行（same_natal_house 216行、same_sign 1行）
- 検証: PASS（277行、background 60、resonance 217、Active 277、空欄0・文章列・文字数・3-5文・時期表現・same_signのハウス固定なし・完全重複0・文字化け0・保護列不変、validator、全執筆単位のレンダリング目視）
- 次: 工程3の既存アーキテクチャ、読み込み経路、テスト構成を調査し、最初のテスト可能な実装単位を確定する

## 工程3 バックエンド・表示接続

- 状態: 完了
- 調査結果: 既存の`backend/app/services`サービス層と`backend/tests`のpytest構成へ接続する。月間ピークの既存集計は`monthly_peak_service.py`に保持し、月間総評4系統は同じサービス層の`monthly_overview_service.py`で扱う
- 実装済み: CSVローダー（基本総評、可変日付段落、複合配置、個人用長期背景）、必須列検証、UTF-8 BOM対応、ファイル更新追従キャッシュ、`Month_ID`形式検証、検索インデックス（Edition・Solar/Natalハウス、イベント全条件、複合配置アンカーハウス、長期背景Record Type・Natalハウス）、Active行限定、月ID整合性・一意キー重複検証、対象月初日の太陽星座によるEdition解決、基本総評のSolar/Natalハウス完全一致選択、可変日付段落の全条件一致選択と日付差し込み、複合配置の成立期間・既存計算結果・アンカー天体ハウス一致選択と競合・重複・日付解決、個人用長期背景の天体・星座・ネイタルハウス・有効期間一致、負荷／再構築側1件・木星・天王星候補のPriority比較、最大2件選択、resonanceの実配置・星座・ネイタルハウス・有効期間・Match Type一致、同一ペアのsame sign優先、Priority比較、最大1件選択、基本総評・可変段落・複合配置・長期背景・resonanceの独立表示構造への最終合成、Section Order整列、全系統間の完全重複除外、対象月外as of拒否、年運生成経路から月内トランジット・ソーラー／ネイタルハウス・星座／ハウス移動日・成立済み複合配置を接続、8月31日分の日別合成を`monthly_overviews`として既存APIレスポンスへ追加、CSV更新時のキャッシュ・master version連動、年運画面の選択月・選択日への日別総評接続、基本総評・Action・可変段落・複合配置・最大2件の長期背景・最大1件のresonanceを独立セクションで表示、未対応月は既存テーマへフォールバック
- 検証: PASS（バックエンド月間総評20 tests、年運API接続2 tests、長期背景validator 277行PASS。`npm test`は選択月・選択日・APIキー互換・未対応月フォールバックの2 tests PASS。`npm run build` PASS）
- 次: 工程4へ進み、3件以上の出生データ、全validator・単体・統合テスト、デスクトップ／モバイル表示を最終検証する

## 工程4 統合・最終検証

- 状態: 完了
- 出生データ検証: 3件、各31日、合計93件の日別月間総評を実生成。基本総評の選択は東京 `Solar_House=12 / Natal_House=5`、大阪 `7 / 7`、札幌 `10 / 7` で、全件 `Edition_ID=2026_LEO`
- 切替検証: 8月の太陽・水星・金星・火星の星座移動前後、可変日付段落の実日付、複合配置の有効期間境界、8月15日から16日の`LEO_GROWTH`競合切替、8月10日から11日の天王星・火星`same_sign` resonance切替、長期背景Priorityと最大2件、resonance最大1件を確認
- 逆行・順行検証: 8月内に逆行開始・終了日はないことをトランジット暦で確認し、直前の水星順行転換（7月24日）・土星逆行開始（7月27日）と直後の天王星逆行開始（9月11日）の前後状態、および8月中の木星・土星・天王星・海王星・冥王星の状態継続を確認
- 内容検証: 未置換トークン0、置換文字0、日別合成内の完全重複0、Selection_Group競合0、アンカー天体のSolar/Natalハウス一致、基本総評・複合配置・長期背景の文字数範囲を確認。既存の日別スコアとアスペクト出力が365日分維持されることを確認
- 表示検証: 実APIと年運画面を接続し、デスクトップ `1440 x 1000` とモバイル `390 x 844` で8月10日の総評冒頭・可変日付段落・複合配置・長期背景2件・resonanceを目視。文字化け、行ずれ、横見切れ、重なり、未置換トークン、`頃頃`の重複は0。長文は固定高の総評領域内で縦スクロールし、本文幅はデスクトップ・モバイルとも横オーバーフロー0
- 表示接続修正: 強制再計算時に未定義だった`reloadCsvMasters`を既存`/api/dev/reload-csv`へ接続。`local_day_or_approximate`の日付を、テンプレート側の`頃`と二重化しないよう差し込み処理を修正し、回帰テストを追加
- validator: `validate_monthly_overview_editorial.py` 144行PASS、`validate_monthly_overview_event_templates.py` 840行PASS、`validate_monthly_overview_aspect_clusters.py` 864行PASS、`validate_personal_long_term_background.py` 277行PASS
- テスト: `python -m pytest backend/tests -q` 144 tests PASS、`npm test` 2 tests PASS、`npm run build` PASS（既存のchunk size警告のみ）
- 残存リスク: Viteの既存chunk size警告のみ。月間総評の機能・文章・表示に関する未解決事項はなし
- 次: なし（工程1から工程4まで完走）

## 完了済み・保護対象

- 可変日付段落: 840 / 840行、Active 840、最終検証PASS
- 複合配置: 864 / 864行、Active 864、最終検証PASS
- 既存スコア、アスペクト計算条件、トランジット暦は変更しない
