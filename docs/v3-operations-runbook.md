# V3本番：監視・障害時の初動

更新日：2026-09-27

この手順は本番V3（`thecelestialatelier.com`／`api.thecelestialatelier.com`）用。現時点はURL非告知・新規課金停止中。2026-09-26に限定実決済を1件確認しており、既存契約の監視は必要。**状況確認の手順であり、障害訓練や復元テストを実施済みという意味ではない。**

## 現在の監視範囲

| 対象 | 確認済み | まだ確認・設定していないこと |
|---|---|---|
| 本番API | Render StarterのHTTP Health Check Pathは`/api/v3/health`。Renderワークスペースの通知先はEmail、既定は`Only failure notifications`で、APIサービスはその既定値を継承。2026-09-27に公開URLの応答`status=ok`・`environment=production`を確認 | Render自身の通知メールの実到達、アプリ内部のSupabase・Stripe依存状態 |
| 本番フロント | 2026-09-27に`/entry.html`と`/index.html`、それぞれの画面用JavaScriptがHTTP 200で応答 | 画面の動作まで含む監視 |
| 外部死活監視 | 2026-09-27にBetter Stack Freeでサイトトップと`https://api.thecelestialatelier.com/api/v3/health`の2件を登録。両方`Up`、3分間隔、メール通知オン。API監視のテスト通知がYahooメールに届いた | 実障害時の通知発火、ログイン・DB・Stripeまで含む監視。無料枠の商用利用条件の確認（下記） |
| 決済・認証 | 有料アクセスはサーバー側で判定。契約照合コマンドは既定で読み取り専用 | Stripe Webhook失敗の通知・再送運用、Supabase Auth／DB障害時の通知、実額決済を含む復旧訓練 |

APIの`/api/v3/health`はプロセスが応答することを示す軽量な検査であり、Supabaseへの接続やStripe決済の成功を保証しない。Renderは異常なサービス・デプロイ失敗を設定に応じて通知するが、フロントの内容や認証・決済の正常性まで監視するものではない。[Render Health Checks](https://render.com/docs/health-checks)／[Render Notifications](https://render.com/docs/notifications)

Better Stack Freeの商用利用については、2026-09-27時点の[料金ページ](https://betterstack.com/pricing)が「Free for personal projects」と表示する一方、同社の[Community記事](https://betterstack.com/community/comparisons/uptime-robot-alternatives/)は商用プロジェクトでもFreeを使えると記載する。[利用規約](https://betterstack.com/terms)にはFreeの商用利用禁止を明示した箇所を確認できなかったが、この食い違いから**公開後も無料枠を利用できると断定しない**。一般告知前に提供元へ条件を確認するか、有料プラン／別の監視手段を選ぶ。問い合わせやプラン変更は未実施。

### 公開URLの手動スモークチェック

リポジトリ直下から`python scripts/v3_public_health.py`を実行する。`entry.html`・`index.html`と同一ドメインの画面用JavaScript、APIの`status=ok`・`environment=production`を読み取り専用で確認し、異常時は終了コード1を返す。2026-09-27の単発実行は成功。**このスクリプト自体の定期実行・異常通知は未設定。**別途、Better StackでサイトトップとAPIのHTTP死活監視を実施している。この検査もログイン、Supabase、Stripeの動作を保証しない。

### APIが正常でも登録・決済に異常があるとき

当面の一次確認者は運営者本人。Better Stackの通知メールを起点とし、利用者からの報告や画面の異常でも同じ順に切り分ける。**Supabase Auth／DBとStripe Webhookの個別障害を自動通知する仕組みは未設定**なので、APIの監視が`Up`でも正常と判断しない。

| 症状 | 読み取り専用で確認する順番 | 注意点 |
|---|---|---|
| 登録・ログイン・出生情報の保存に失敗 | [Supabase Status](https://status.supabase.com/) → [本番プロジェクト](https://supabase.com/dashboard/project/sxkhgczqvsewtsrcnbbe)のLogsで発生時刻前後のAuth／Postgres／API関連のエラー → [Render API Logs](https://dashboard.render.com/web/srv-daomi02d0e5s73fiihmg/logs) | ステータスページが正常でも本番プロジェクトだけの異常はあり得る。ログの個人情報・トークンを共有しない。ログ設定の変更は初動では行わない。 |
| Checkout・Portalに進めない | [Stripe Status](https://status.stripe.com/) → Stripeライブの対象契約・決済状態 → Render API Logs | テストモードではなくライブモードを確認。画面の再試行前に、二重のCheckout・請求ができていないか確認する。 |
| 決済済みなのに有料解放されない／解約状態が反映されない | Stripeライブで対象Webhookの送信結果・HTTP応答・イベントID → Render API Logs → 対象会員の[読み取り専用契約照合](v3-billing-reconciliation.md) | Checkout完了画面だけを有料化の根拠にしない。失敗イベントを確認する前に再送やDB更新をしない。 |

SupabaseのLogsはAuth・Postgresなどの種別と時刻で絞り込める。[Supabase公式説明](https://supabase.com/docs/guides/observability/logs)。Stripeのイベントは配信失敗・保留で絞り込めるが、実際の原因は対象Webhookの送信結果とアプリ側の記録を突き合わせる。[StripeイベントAPI](https://docs.stripe.com/api/events/list)。

## 最初の切り分け

| 症状 | まず確認する場所 | 初動 |
|---|---|---|
| フロントが開かない・表示が壊れる | [本番フロントのDeploys](https://dashboard.render.com/static/srv-daomhvqd0e5s73fiihj0/deploys)、独自ドメイン、`/entry.html` | 最終正常デプロイと直近の変更を比較。APIは別に確認する |
| APIヘルスチェックが失敗 | [本番APIのEvents](https://dashboard.render.com/web/srv-daomi02d0e5s73fiihmg/events)・[Logs](https://dashboard.render.com/web/srv-daomi02d0e5s73fiihmg/logs)・[Metrics](https://dashboard.render.com/web/srv-daomi02d0e5s73fiihmg/metrics) | 最新デプロイ、再起動、エラー、CPU・メモリを確認。DB復元や秘密値変更を急がない |
| APIは正常だが登録・ログイン・出生情報が失敗 | 本番SupabaseのAuth・DB状態、本番API Logs | Supabase側の障害とアプリのエラーを切り分ける。他人のデータや契約状態を手動変更しない |
| 決済画面・Webhook・有料解放がおかしい | StripeライブのWebhook送信結果、Render API Logs、[契約照合手順](v3-billing-reconciliation.md) | 新規課金を止め、失敗イベントのHTTP応答とStripe上の実契約を先に確認する |

## 決済に影響する障害の優先順位

1. 新規Checkoutが可能な状態なら、本番APIの`V3_BILLING_ENABLED=false`で新規課金を停止し、画面で申込不可を確認する。現在の記録ではすでに`false`。このスイッチは既存サブスクリプションを解約しない。
2. 発生時刻、影響範囲、RenderのLiveデプロイ、StripeのイベントIDとHTTP結果を記録する。秘密鍵・Bearerトークン・出生情報・メール本文は記録しない。
3. コード起因なら、対象サービスのDeploysから直前の正常デプロイへのロールバックを検討する。Render DashboardでのロールバックはAuto-Deployを無効化し、対象デプロイの環境変数を再利用するため、**前後で課金スイッチと本番接続先を必ず確認**する。[Render Rollbacks](https://render.com/docs/rollbacks)
4. Webhook失敗はStripeの該当送信先・Failedイベントで原因を確認する。修正前に無差別に再送しない。修正後の再送と契約照合は[既存手順](v3-billing-reconciliation.md)に従い、照合はまず`--apply`なしで行う。[StripeのWebhook障害確認](https://support.stripe.com/questions/troubleshooting-webhook-delivery-issues)
5. 復旧後にフロントとAPIの応答、無料会員の有料API拒否、影響を受けた契約のStripe／Supabase一致を確認する。誤課金・二重課金の返金は個別に事実確認して運営者が判断する。

## 残る運用準備

- [ ] Renderの通知メールが運営者に実際に届くことを確認する。
- [x] フロントとAPIをRender外から監視し、異常時の通知先・頻度を決める。Better Stackで3分ごと、メール通知を設定し、テストメール到着済み。
- [x] Supabase・Stripeの障害／Webhook失敗の一次確認者と確認先を暫定決定した。個別障害の自動通知は未設定。
- [ ] ログ保存期間と、問い合わせ・障害連絡の担当者を決める。
- [ ] 障害・切り戻し・Webhook再送の模擬訓練を行う。
- [ ] 暗号化DBバックアップの定期取得と隔離環境への復元を確認する。復元テストは現在保留中。

公開前の全体状況は[本番移行フロー](v3-production-launch-flow.md)を参照する。
