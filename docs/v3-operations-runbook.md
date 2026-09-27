# V3本番：監視・障害時の初動

更新日：2026-09-28

この手順は本番V3（`thecelestialatelier.com`／`api.thecelestialatelier.com`）用。現時点はURL非告知・新規課金停止中。2026-09-26に限定実決済を1件確認しており、既存契約の監視は必要。**状況確認の手順であり、障害訓練や復元テストを実施済みという意味ではない。**

## 現在の監視範囲

| 対象 | 確認済み | まだ確認・設定していないこと |
|---|---|---|
| 本番API | Render StarterのHTTP Health Check Pathは`/api/v3/health`。Renderワークスペースの通知先はEmail、既定は`Only failure notifications`で、APIサービスはその既定値を継承。2026-09-27に公開URLの応答`status=ok`・`environment=production`を確認 | Render自身の通知メールの実到達、アプリ内部のSupabase・Stripe依存状態 |
| 本番フロント | 2026-09-27に`/entry.html`と`/index.html`、それぞれの画面用JavaScriptがHTTP 200で応答 | 画面の動作まで含む監視 |
| 外部死活監視 | 2026-09-27にBetter Stack Freeでサイトトップと`https://api.thecelestialatelier.com/api/v3/health`の2件を登録。両方`Up`、3分間隔、メール通知オン。API監視のテスト通知がYahooメールに届いた。商用利用可能との公式記載を確認し継続利用を決定 | 実障害時の通知発火、ログイン・DB・Stripeまで含む監視 |
| 決済・認証 | 有料アクセスはサーバー側で判定。契約照合コマンドは既定で読み取り専用。StripeライブのWebhook配信失敗メール通知はON | Stripe通知メールの実到達・再送運用、Supabase Auth／DBの個別障害通知、実額決済を含む復旧訓練 |

APIの`/api/v3/health`はプロセスが応答することを示す軽量な検査であり、Supabaseへの接続やStripe決済の成功を保証しない。Renderは異常なサービス・デプロイ失敗を設定に応じて通知するが、フロントの内容や認証・決済の正常性まで監視するものではない。[Render Health Checks](https://render.com/docs/health-checks)／[Render Notifications](https://render.com/docs/notifications)

## 問い合わせ・障害連絡の一次対応

- 一次担当は運営者本人（森泉勇耶）。利用者からの連絡は公開の[お問い合わせページ](../frontend/v3/public/legal/contact.html)に記載したメールで受け、監視通知はBetter Stackの登録先メールで受ける。代行者・24時間対応体制は設けていない。
- 内部運用目標として、受信箱と監視通知を営業日に確認し、通常の問い合わせには原則2営業日以内に受付または状況を一次返信する。これは公開した回答期限や解決保証ではない。決済・ログインの広範な障害、情報漏えいの疑い、特商法の開示請求は通常の順番待ちにせず、気づき次第確認する。開示請求への回答は公開ページの「遅滞なく」に従う。
- 受付時に「発生日時とタイムゾーン／対象画面／操作／エラー表示／影響範囲／返信状況」を記録する。登録メールアドレスは必要な本人確認に限って扱い、共有する記録では伏せる。パスワード、カード情報、認証トークン、出生情報の全文はメールで求めない。
- 障害なら本書の「最初の切り分け」に従い、決済・有料権限が関わる場合はStripeライブの契約とWebhook送信結果を先に照合する。返金、契約変更、本番データ削除、Webhook再送、ロールバックは調査だけで実行しない。対応後は原因・実施操作・復旧確認・利用者への返信を同じ記録に残す。
- 担当者が受信箱を確認できない期間の代替担当・自動応答は未設定。一般告知前に、この内部目標を継続できるか確認する。

2026-09-27、Better Stack自身の[公式記事](https://betterstack.com/community/comparisons/uptime-robot-alternatives/)がFreeを商用プロジェクトにも利用可能と明記していることを確認し、運営者とBetter Stack Freeの継続利用を決定した。料金ページの「Free for personal projects」という見出しだけを理由に移行を勧めた以前の案内を訂正する。UptimeRobotへの移行案は採用せず、監視プランの選定は完了とする。既存のサイト・APIの2監視、3分間隔、メール通知を継続する。監視先は公開URLだけとし、認証情報や出生データを監視設定へ送らない。

### 公開URLの手動スモークチェック

リポジトリ直下から`python scripts/v3_public_health.py`を実行する。`entry.html`・`index.html`と同一ドメインの画面用JavaScript、法務・問い合わせ5ページのタイトル、APIの`status=ok`・`environment=production`を読み取り専用で確認し、異常時は終了コード1を返す。2026-09-27の単発実行は成功。**このスクリプト自体の定期実行・異常通知は未設定。**別途、Better StackでサイトトップとAPIのHTTP死活監視を実施している。この検査もログイン、Supabase、Stripeの動作を保証しない。

### APIが正常でも登録・決済に異常があるとき

当面の一次確認者は運営者本人。Better Stackの通知メールを起点とし、利用者からの報告や画面の異常でも同じ順に切り分ける。StripeライブのWebhook配信失敗メール通知はONだが到達未実測。Supabase Auth／DBの個別障害通知は設定確認が取れていないので、APIの監視が`Up`でも正常と判断しない。

| 症状 | 読み取り専用で確認する順番 | 注意点 |
|---|---|---|
| 登録・ログイン・出生情報の保存に失敗 | [Supabase Status](https://status.supabase.com/) → [本番プロジェクト](https://supabase.com/dashboard/project/sxkhgczqvsewtsrcnbbe)のLogsで発生時刻前後のAuth／Postgres／API関連のエラー → [Render API Logs](https://dashboard.render.com/web/srv-daomi02d0e5s73fiihmg/logs) | ステータスページが正常でも本番プロジェクトだけの異常はあり得る。ログの個人情報・トークンを共有しない。ログ設定の変更は初動では行わない。 |
| Checkout・Portalに進めない | [Stripe Status](https://status.stripe.com/) → Stripeライブの対象契約・決済状態 → Render API Logs | テストモードではなくライブモードを確認。画面の再試行前に、二重のCheckout・請求ができていないか確認する。 |
| 決済済みなのに有料解放されない／解約状態が反映されない | Stripeライブで対象Webhookの送信結果・HTTP応答・イベントID → Render API Logs → 対象会員の[読み取り専用契約照合](v3-billing-reconciliation.md) | Checkout完了画面だけを有料化の根拠にしない。失敗イベントを確認する前に再送やDB更新をしない。 |

SupabaseのLogsはAuth・Postgresなどの種別と時刻で絞り込める。[Supabase公式説明](https://supabase.com/docs/guides/observability/logs)。Stripeのイベントは配信失敗・保留で絞り込めるが、実際の原因は対象Webhookの送信結果とアプリ側の記録を突き合わせる。[StripeイベントAPI](https://docs.stripe.com/api/events/list)。

Stripeの具体的な確認場所は、本番アカウント（画面上部に「サンドボックス」の帯が**ない**状態）の「ワークベンチ → Webhook → `celestial-atelier-v3-production` → イベントの配信」。失敗をステータスで絞り、対象行のHTTPコード・レスポンス・発生時刻・イベントIDを控える。送信先の概要にある集計だけでは個別の決済を確認したことにならない。原因を特定する前に「再送する」は押さない。2026-09-26の限定決済ではこの画面で4件のHTTP 200を確認済みだが、失敗時の再送操作自体は未実施。

### 2026-09-28の制限・通知設定確認

| 対象 | 管理画面で確認した設定 | 残る確認 |
|---|---|---|
| Supabase Auth | 本番プロジェクトのサインアップ／サインインはIPごとに5分30回、トークン更新は5分150回、トークン検証は5分30回 | Auth／DBの個別障害メール通知は確認できていない。実際の上限到達テストは未実施 |
| Render本番API | Starterインスタンス。サービス通知はワークスペース既定の「失敗時のみ」を継承し、Health Check Pathは`/api/v3/health` | Render通知メールの実到達は未実測。アプリの各APIへのアクセス頻度制限を意味する設定ではない |
| Stripeライブ | 通信設定の「Webhook failures - Email」「API integration errors - Email」はON。Webhook event generation failures - EmailはOFF。本番Webhook送信先は有効で、管理画面の直近1週間の配信5件は失敗0件 | 失敗通知メールの到達とWebhook再送は未実測。イベント生成失敗の通知をONにするか判断が必要 |

V3アプリのPythonコードに、公開API全体を対象とする独自のIP別レート制限は見当たらない（ローカル用テストログインの制限とは別）。一般告知前に必要性を判断する。上記は設定の読み取り結果であり、障害や429を意図的に発生させた試験ではない。

### ログ・イベントの調査期限

障害の報告を受けたら、消える前に**発生時刻・イベントID・HTTP結果・デプロイID**を記録する。ログ本文に個人情報・認証情報があれば、そのまま文書やチャットに貼らない。

| 保存元 | 2026-09-27時点の公開条件 | この運用での扱い |
|---|---|---|
| Supabase Free | API・DBログは1日、Auth監査ログは1時間。[料金表](https://supabase.com/pricing) | 登録・ログイン障害は特に早く確認する。1時間後に認証監査ログが残ると期待しない。 |
| Render | ログはワークスペースがHobbyなら7日、Proなら14日、Scale／Enterpriseなら30日。[公式説明](https://render.com/docs/logging) | 2026-09-27に管理画面で本番ワークスペースがHobbyと確認。本番APIはStarter**インスタンス**だが、ログ保持はワークスペース基準の7日。 |
| Stripe | イベントIDを用いたAPI取得は作成から30日以内。[イベント取得仕様](https://docs.stripe.com/api/events/retrieve) | 本番Webhookの失敗を後回しにせず、イベントIDと送信結果を早期に確認する。Dashboardの表示保持期間を30日と断定しない。 |

ログを外部に長期保存する設定や有料プラン変更は未実施。現在は各サービス内で参照できる範囲で調査する。

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

### 支払い失敗・返金の現行動作

- 支払い失敗時は`invoice.payment_failed`を受けてStripeの現在の契約状態を保存する。`past_due`／`unpaid`なら有料機能を停止し、画面では支払い方法の確認を案内する。支払い後の`invoice.paid`で契約が`active`となり利用期限が更新されれば再開する。これはローカルテストとコードで確認した挙動であり、本番での失敗・再開は未実測。
- 返金イベントを受けて自動的に有料権限を停止する処理はない。返金だけを行っても、StripeのSubscriptionとアプリの有料状態が自動で一致するとは限らない。返金の要否と、返金後も期間終了まで利用を認めるか・契約を終了するかは運営者が個別に決める。その決定後、Stripeの契約状態、Webhook配信、アプリの利用資格を照合する。ここでは返金・契約変更・Webhook再送を実施していない。

#### 返金依頼を受けたときの確認順

1. 公開中の[返金条件](../frontend/v3/public/legal/commerce.html)と、対象のStripeライブ決済・請求書・契約を照合する。利用者の申告だけで返金済み・二重請求と判断しない。
2. 例外返金の可否と金額を**操作前に**運営者が決め、記録する。**全額返金を認める場合は、その契約を即時終了し、有料利用も即時終了する**。期間末の解約予約だけではこの方針を満たさない。一部返金の場合の利用期限は案件ごとに先に決める。返金操作だけではアプリの利用資格は自動停止しない。
3. 決定と利用者への説明を一致させてから、Stripeライブで対象決済の返金と対象Subscriptionの即時終了を同じ案件として扱い、それぞれの成功を個別に確認する。どちらかが失敗した場合は状態を照合してから再試行し、操作を重ねない。返金・契約変更をこの手順の作成だけで実行しない。
4. Stripeの返金状態・Subscription、対象Webhookの配信結果、アプリの契約表示・有料APIを照合し、次回請求と利用期限が決定どおりか確認する。不一致なら新たな操作を重ねず、[契約照合手順](v3-billing-reconciliation.md)で読み取り確認する。

この全額返金時の方針は2026-09-27に運営者が承認した。実際の返金・即時終了・有料権限停止を本番で実測したわけではない。確認用アカウントの無期限アクセスは契約と別の例外設定なので、返金フローの実測に使わない。[Stripeの即時解約仕様](https://docs.stripe.com/api/subscriptions/cancel)

### 出生情報・アカウントの削除依頼

1. 問い合わせは公開の「お問い合わせ」ページに記載した窓口で受ける。メールでパスワード、カード番号、出生データ全文を求めない。本人確認を要する回答では、まず登録メールアドレスと状況を確認し、第三者に契約・出生情報を開示しない。
2. **出生情報だけを消す**場合は、本人がログイン後のアカウント画面で「保存済みの出生情報を削除」を実行できる。これは会員・契約を終了しない。端末側に残る入力情報については、サーバー上の出生情報削除と同一視しない。
3. **アカウントを消す**場合は、先に契約管理画面で契約・支払い処理を確認する。`active`・`trialing`・`past_due`・`unpaid`・`paused`・`incomplete`ではAPIが削除を拒否する。解約予約だけでは利用期間終了前に削除できない。削除可能な状態になった後、本人が現在のパスワードで再認証し、確認文を入力して削除する。
4. アカウント削除APIはSupabase Authユーザーを削除し、DB定義上は出生情報・課金関連のユーザー行が連鎖削除される。一方、Stripe側の顧客・請求記録や取得済みバックアップまで、この操作が削除するものではない。個別の開示・消去依頼や削除失敗は、Stripeの契約状態と保存先を確認して運営者が対応を判断する。手動で本番DBやStripeのデータを消す前に別途承認を得る。

上記は実装から確認した案内手順であり、本番での削除操作を今回実施したわけではない。一次担当と内部の一次返信目標は上記のとおり。バックアップ・Stripe記録を含む個別の開示・消去依頼への対応は、保存先と契約状態を確認して判断する。

## 机上訓練の記録（2026-09-27）

実サービスを停止せず、コード・既存テスト・運用手順を照合した。以下は**手順の机上確認**であり、本番障害やWebhook再送を再現した結果ではない。

| 想定 | 確認できた初動・安全条件 | 未実施の実運用確認 |
|---|---|---|
| APIが応答しない | 外部監視の通知を起点にRender Events／Logsと直近デプロイを確認する。課金スイッチは既にOFFで、DBやStripeを先に変更しない。 | Render通知の実到達、実際のロールバックと復帰 |
| Stripe照会中にWebhook処理が失敗 | 現在契約の取得失敗ではHTTP 503を返し、契約を保存しない。ローカルテストでは同じイベントを再処理できた。失敗イベントの原因を確認し、修正後に再送を判断する。 | Stripeライブでの失敗配信・再送と、契約照合の実測 |
| Supabaseの契約情報を取得できない | ローカルテストでは有料APIがHTTP 503となり、利用資格不明のまま有料機能を解放しない。Supabase／Renderのログを確認する。 | 本番の依存障害時の通知、復旧後の契約一致確認 |
| コード起因で切り戻しが必要 | 対象デプロイ・課金スイッチ・本番接続先を先に特定する。Renderのロールバックは環境変数も巻き戻し得るため、実施後にも3点を確認する。 | 実際の切り戻し操作とフロント・API・既存契約の再確認 |

`python -m backend.v3.reconcile_billing --help`で`--user-id`必須、`--apply`・`--confirm`が別指定であることを確認した。**本番会員を指定した照合、`--apply`、Webhook再送、ロールバックは実行していない。**

## 残る運用準備

- [ ] Renderの通知メールが運営者に実際に届くことを確認する。
- [x] フロントとAPIをRender外から監視し、異常時の通知先・頻度を決める。Better Stackで3分ごと、メール通知を設定し、テストメール到着済み。
- [x] Supabase・Stripeの障害／Webhook失敗の一次確認者と確認先を暫定決定した。個別障害の自動通知は未設定。
- [x] Supabase FreeとStripeイベントAPIの調査期限を記録し、RenderワークスペースHobbyのログ保持7日を管理画面と公式仕様で確認した。
- [x] 問い合わせ・障害連絡の一次担当を運営者本人とし、受付・切り分け・記録・内部の一次返信目標を決める。代替担当・自動応答は未設定。
- [x] 障害・切り戻し・Webhook再送の机上手順を照合する（上記）。
- [ ] 実際の障害・切り戻し・Webhook再送を伴う模擬訓練を行う。
- [ ] 暗号化DBバックアップの定期取得と隔離環境への復元を確認する。復元テストは現在保留中。

公開前の全体状況は[本番移行フロー](v3-production-launch-flow.md)を参照する。

## 確認用アカウントの無期限アクセス

本番APIの`V3_OWNER_ACCESS_USER_ID`に対象会員のSupabase Auth UIDを1件だけ設定する。APIはSupabaseで本人確認したUIDだけを照合し、その会員に有料機能を無期限で許可する。未設定なら誰にも特別権限を与えない。共有の`test/test`ログインやフロント側の権限設定は使わない。

この許可はStripe契約とは別で、既存の請求を停止・解約しない。対象会員の新規Checkoutはサーバー側で拒否する。解除するときは環境変数を削除して再デプロイする。`V3_BILLING_ALLOWED_USER_ID`は限定決済の許可先であり、この設定の代用にはならない。
