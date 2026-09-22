# V3 本番環境移行フロー

更新日：2026-09-23
対象：`C:\dev\astrology-v3` / `codex/v3-integration`

## 目的

公開プレビューで確認中のV3を、実際の会員登録・月額課金・有料機能提供ができる本番サービスへ移行するための手順を整理する。

本番の基本導線は次のとおり。

**LP・出生データ入力 → 無料版 → 会員登録／ログイン → Stripe Checkout → Webhookで契約確認 → 有料版を解放**

決済完了画面へ戻ったことだけでは有料化せず、Stripeの署名済みWebhookとサーバー保存済みの契約状態を根拠にする現在の構造を維持する。

## 現在地

本番Supabase、Renderの本番フロント・API、独自ドメイン、独自SMTP、Turnstile、法務ページ、Stripeライブ商品・Price・Portal・Webhookは構築済み。2026-09-23に本番APIのSupabase Secret keyの誤設定を修正し、ログイン済みの契約・アカウント画面で正常な読込を確認した。`V3_BILLING_ENABLED=false`を維持し、実課金は開始していない。現在は公開前の総合検証中。

| 項目 | 現在の状態 | 本番化で必要な対応 |
|---|---|---|
| V3フロント | 本番Static Siteと`thecelestialatelier.com`で稼働 | 実機スマホ・ログイン後の総合確認 |
| V3 API | 本番Web Serviceと`api.thecelestialatelier.com`で稼働 | 負荷・障害・監視の確認 |
| 認証 | 本番Supabase、独自SMTP、Turnstileを設定済み。ログイン・再設定を確認 | 新規登録から再訪まで本番実機で一連を確認 |
| 出生情報 | 本番DB・RLS・削除導線を設定済み。Supabase Freeプランには自動バックアップがない | 本番で保存・復元・削除を検証し、公開前にバックアップ方法を確定 |
| 決済 | Stripeライブ商品、JPY 400の月額Price、Portal、Webhookを接続済み | 総合検証後に運営者が実額400円の限定決済を実施 |
| 有料判定 | テスト環境で`invoice.paid`後の解放を確認。本番の課金停止スイッチはOFF | 本番実決済でWebhook・有料解放・解約を確認 |
| 共有テスト会員 | 公開プレビュー専用 | 本番に移行しない |
| main・V2 | 既存公開を維持 | V3公開確認後まで切り替えず、切り戻し先として残す |

公開プレビューでは、通常のSupabaseログイン、Stripeテスト決済、Webhook反映、有料ホロスコープ、契約管理画面まで確認済み。ログイン情報はGit管理外のローカルファイルに保存している。

## 本番移行の前提

### 本番・プレビューの環境分離を維持する

`production`と`preview`の境界、Stripeライブ／テストキーとPriceのモード検証、課金停止スイッチ、契約照合・復旧、退会・出生情報削除は実装済み。本番Renderには本番SupabaseとStripeライブ環境の値を設定し、プレビューの共有テスト会員・テスト決済とは分離している。限定実額決済の直前まで課金停止スイッチをOFFにする。

## 移行工程

### 1. 本番仕様と運用責任を確定する

- [x] 正式サービス名、運営者名、問い合わせ先を確定する。
- [x] 本番フロントURLと本番API URLを確定する。
- [x] 料金は当面「日本円・月額400円・年額なし・無料期間なし」とする。
- [x] USD 4.50は今回の本番対象に含めず、`V3_STRIPE_PRICE_USD`を設定しない。
- [x] 解約は期間終了時まで利用可能とする。
- [ ] 返金方針、支払い失敗時の利用停止、再開時の扱いを確定する。
- [x] 利用規約、プライバシーポリシー、特定商取引法に基づく表示、免責事項を用意する。
- [ ] 出生情報・アカウントの削除依頼と問い合わせ対応の手順を決める。

この工程で決まっていない運用を、コード側の都合だけで固定しない。

### 2. 本番モードをコードとして実装する

#### 環境境界

- [x] `V3_ENVIRONMENT=production`を正式な値として追加する。
- [x] `local`、`preview`、`production`ごとに許可Origin・Host・認証・課金モードを明示する。
- [x] `preview`は引き続きStripeテストキーだけ、`production`はライブキーだけを許可する。
- [x] 本番でローカル`test/test`認証や共有プレビュー会員へ到達できないことを自動テストする。
- [x] 本番フロントがプレビューAPIへ、本番APIがプレビューSupabase／Stripeへ接続できない構成にする。

#### Stripeライブモード

- [x] 本番環境では`sk_live_`／`rk_live_`を許可し、価格の`livemode=true`を必須にする。
- [x] プレビュー環境では`sk_test_`／`rk_test_`と`livemode=false`を必須にする。
- [x] 月額400円・JPY・1カ月周期・有効なPrice・想定Productであることを初回決済前に検証する。
- [x] Checkout、Customer Portal、Webhookの文言を環境に応じて切り替える。
- [x] `V3_BILLING_ENABLED=false`で新規Checkoutだけを安全に停止できるキルスイッチを追加する。

#### 契約状態と復旧

- [x] `customer.subscription.created`、`customer.subscription.updated`、`customer.subscription.deleted`、`invoice.paid`を本番でも処理する。
- [x] `invoice.payment_failed`、`past_due`、`unpaid`、`paused`の表示・利用可否・案内文を実装する。
- [ ] Webhookの重複、遅延、順序逆転を再テストする。
- [x] Webhookを取りこぼした場合に、StripeとSupabaseの契約状態を管理者が照合・復旧できる管理コマンドを用意する。
- [x] 既存契約者に対する新規Checkoutの二重作成を拒否する制御を維持する。

#### 本番UI・法務導線

- [x] LP、ログイン、課金、契約管理から利用規約・プライバシーポリシー・特商法表示・問い合わせ先へ移動できるようにする。
- [x] 課金確定前に、価格、更新周期、自動更新、解約方法、利用可能期間を表示する。
- [x] 「テスト運用版」「テスト決済」「実際の課金は発生しません」等の表記を本番ビルドから除外する。
- [x] アカウント削除と出生情報削除の処理を実装する。契約中の退会時は先に契約処理を案内する。

### 3. 本番用Supabaseを準備する

プレビュー用データと本番データを混在させないため、本番用Supabaseプロジェクトを分離する。

- [x] 本番用Supabaseプロジェクトを作成する。
- [ ] 管理アカウントとGitHubアカウントにMFAを設定する。
- [x] `backend/v3/sql/001_birth_profiles.sql`を実行する。
- [x] `backend/v3/sql/002_billing.sql`を実行する。
- [x] `backend/v3/sql/004_harden_automatic_rls.sql`を実行する。
- [x] 全テーブルのRLS、権限、インデックスを確認する。
- [ ] 匿名キー・ログインユーザーから契約テーブルを直接読めないことを実環境で確認する（匿名キーは3表ともHTTP 401を確認。ログインユーザーは未確認）。
- [x] 本番Site URLを正式URLへ設定する。
- [x] メール確認・パスワード再設定のRedirect URLを本番の正確なURLだけで登録する。
- [x] 独自SMTPを設定し、送信元ドメイン、SPF、DKIM、メール文面、到達性を確認する。
- [x] 登録・ログイン・再設定のレート制限とCAPTCHAを設定する。
- [ ] Security Advisor、SSL、Network Restrictions、バックアップ／PITR、プランを確認する。
- [ ] プレビューの共有テストユーザー、テスト出生情報、テスト契約を本番へコピーしない。

2026-09-22時点で、本番プロジェクト`celestial-atelier-v3-production`（Project Ref: `sxkhgczqvsewtsrcnbbe`、Sydney）を作成済み。`003_verify_v3_security.sql`の16項目はすべて`OK`、Security AdvisorはErrors 0・Warnings 0。Info 3件は、サーバー専用の課金3テーブルに意図的にブラウザー向けRLSポリシーを作成していないことを示す想定どおりの結果。

2026-09-23に本番プロジェクトの「Database → Backups」を確認。現在のFreeプランには自動バックアップがなく、時点復元（PITR）も利用できない。運営者は手動バックアップを選択し、[手順](v3-manual-backup.md)と暗号化バックアップ用スクリプトを用意した。実データの取得・別所保管・隔離環境への復元検証は未実施。これらを確認するまで実額決済・一般公開へ進まない。

2026-09-22に認証設定を再確認し、メール確認、TOTP方式MFA、MFA未完了セッションの15分制限が有効であることを確認した。ログイン・登録は同一IPあたり5分30回、トークン更新は5分150回、メールOTP有効期限は1時間・8桁。パスワード最小長をフロントと同じ12文字へ変更し、直近24時間以内に認証していないセッションからのパスワード変更を拒否する設定を有効化した。

CAPTCHAはCloudflare Turnstileを本番ドメイン用に作成し、Renderの`VITE_V3_TURNSTILE_SITE_KEY`とSupabaseのSecret Keyを設定して有効化済み。ログイン・登録・再設定・確認メール再送の全処理でトークンをSupabaseへ渡す。本番画面でTurnstileの成功表示と、CAPTCHA拒否ではなく通常の認証エラーが返るところまで確認済み。キーの値はGitやMarkdownへ記録しない。

独自SMTPはResend経由で設定済み。送信元ドメインのSPF・DKIM・DMARCと日本語メール文面を設定し、確認メールの受信と、ブラウザに依存しないtoken hash方式の再設定リンク表示を確認済み。

本番Renderへ登録するSupabase値は次の3つ。値そのものはMarkdownやGitへ書かない。

| 環境変数 | 用途 | 公開範囲 |
|---|---|---|
| `V3_SUPABASE_URL` | 本番Supabase Project URL | API設定 |
| `V3_SUPABASE_PUBLISHABLE_KEY` | 認証用Publishable key | ブラウザへ公開可能 |
| `V3_SUPABASE_SECRET_KEY` | 契約テーブル操作 | サーバーだけ。フロント・Git禁止 |

### 4. Stripe本番アカウントを準備する

- [x] Stripeアカウントの事業情報、本人確認、入金口座、明細表記、問い合わせ情報を完成させる。
- [x] ライブモードで本番商品を作成する。
- [x] ライブモードでJPY 400・毎月・定額のPriceを作成する。
- [x] Customer Portalで解約、支払い方法変更、請求履歴等の許可範囲を設定する。
- [x] 本番API URLの`/api/v3/billing/webhook`をライブWebhook送信先として作成する。
- [x] 契約作成・更新・削除、支払い成功・失敗の5イベントを購読する。
- [x] ライブWebhook固有の署名シークレットを取得する。テストWebhookの値を流用しない。
- [x] WebhookのStripe API versionを`2026-08-26.dahlia`へ固定する。

本番Renderへ登録するStripe値は次の3つ。

| 環境変数 | 用途 | 注意 |
|---|---|---|
| `V3_STRIPE_SECRET_KEY` | StripeライブAPI | 権限を限定した`rk_live_`。サーバーだけ |
| `V3_STRIPE_WEBHOOK_SECRET` | 本番Webhook署名検証 | 本番送信先に表示された`whsec_` |
| `V3_STRIPE_PRICE_JPY` | 月額400円のライブPrice ID | テストPrice IDは使用不可 |

### 5. Render本番環境を分離して構築する

プレビューサービスを本番へ改名・上書きせず、本番用のStatic SiteとWeb Serviceを新設する。

- [x] 本番用デプロイブランチまたはリリースタグの運用を決める。
- [x] 本番用`render-v3-production.yaml`相当を作成する。
- [x] 本番APIは無料インスタンスを避け、スリープによるCheckout・Webhook遅延がないプランを選ぶ。
- [x] APIのHealth Checkを`/api/v3/health`へ設定する。
- [x] フロントの`VITE_V3_API_BASE_URL`を本番API URLへ固定する。
- [x] APIの`V3_ALLOWED_ORIGINS`を本番フロントのHTTPSオリジンだけにする。
- [x] APIの`V3_ALLOWED_HOSTS`を本番APIホストだけにする。
- [x] `V3_ENVIRONMENT=production`と本番Supabase／Stripeの秘密値をRender Dashboardに設定する。
- [ ] ログにtoken、秘密鍵、出生情報、決済情報を出さないことを確認する（直近1時間のアプリログでは該当文字列なし。長期・異常系は未確認）。
- [x] カスタムドメインをRenderへ追加し、DNSとTLSを確認する。
- [x] Content Security Policy等の本番セキュリティヘッダーを確認する。
- [x] PreviewのURL・環境変数・Webhookを本番と分離したまま残す。

2026-09-22にRender Blueprint `celestial-atelier-v3-production`を作成。APIはStarter、フロントはStatic Siteで分離した。2026-09-23にStripeライブ設定と本番Supabase Secret keyを接続した。`V3_BILLING_ENABLED=false`は維持している。

- 本番フロント：`https://thecelestialatelier.com`（Render既定URLも維持）
- 本番API：`https://api.thecelestialatelier.com`（Render既定URLも維持）
- 確認済み：Health Check `200`、`environment=production`、本番OriginだけにCORS許可、未知OriginにはCORS許可なし、公開環境のテストログインAPI・画面は`404`

### 6. 本番公開前の総合検証を行う

#### 自動テスト

- [x] バックエンド全テスト（266件）。
- [x] フロント全テスト（70件）。
- [x] V3本番ビルド。
- [x] 本番依存関係監査（production dependenciesの脆弱性0件）と回帰テスト。
- [x] `production`でテストキーを拒否し、`preview`でライブキーを拒否する境界テスト。
- [x] 無料ユーザーが有料APIを直接呼んでも取得できない自動テスト。本番のログイン済み無料会員での実測は別途行う。

#### 実画面

- [ ] PC・スマホ実機でLPから無料ホロスコープまで確認する（PCブラウザとスマホ幅の表示は確認済み）。
- [ ] 新規登録、確認メール、ログイン、ログアウト、パスワード再設定を確認する。
- [ ] 無料版の任意日チャート、今日±15日再生、複合ロック、一覧非表示を実機でも確認する（PCブラウザとスマホ幅では確認済み）。
- [ ] 有料版の1カ月／1年再生、複合アスペクト、一覧、星の見通しを確認する。
- [ ] 星の見通しとHoroscopeを往復して、不要な再読み込みとレイアウト崩れがないことを確認する。
- [ ] 海外出生地、海外端末時刻、夏時間重複時刻、日付変更を確認する。
- [ ] API停止、Supabase障害、Stripe障害、Webhook遅延時に誤って有料化しないことを確認する。

#### 負荷・運用

- [ ] 30日／1年再生の計算時間、同時利用、RenderのCPU・メモリ・応答時間を測定する。
- [ ] Supabase Auth・DB、Stripe Webhook、Renderのレート制限とアラートを確認する。
- [ ] エラー監視、死活監視、ログ保存期間、問い合わせ対応者を決める。

#### 2026-09-23の確認記録

- V3の環境境界・課金・認証・無料／有料の対象テスト46件が成功した。全テスト266件、フロント70件、本番ビルド、依存関係監査は同日までに成功済み。今回コード変更は行っていない。
- 本番APIで未ログインの有料APIはHTTP 401、無料の任意日チャートはHTTP 200、無料枠外の連続再生はHTTP 403。本番Supabaseの課金3表はPublishable keyによる匿名アクセスでいずれもHTTP 401だった。ログイン済み無料会員による課金表・有料API直接アクセスは未確認。
- 本番の匿名LPから無料ホロスコープを算出し、PC画面と390pxのスマホ幅で期間表示、複合アスペクトの無効化、アスペクト一覧の非表示を確認した。再生枠外の日付は単日チャートで選択でき、再生は「今日±15日」から開始した。スマホ実機では未確認。
- ニューヨークの夏時間重複時刻では、fold指定なしをHTTP 400で拒否し、fold 0／1でUTC−4／UTC−5に分かれることを本番APIで確認した。
- 公開中の主要HTML 5件・エントリーJS 8件とローカル本番ビルドを走査し、Supabase Secret keyおよびStripeライブ／テストキーの実値パターンに一致するものはなかった。Render本番APIの直近1時間のApplication logsでも、Secret key、Stripeキー、Bearer token、出生日時、メールの該当文字列は見つからなかった。長期ログや異常系の網羅確認は別途行う。
- 本番アカウント画面はログイン済みで読込でき、「保存済みの出生情報はありません」と表示された。Render本番APIはLiveで、Health Check Pathは`/api/v3/health`。同URLへのGETはHTTP 200、`environment=production`を返した。通知・外部死活監視・復旧訓練は未確認。
- Supabase本番プロジェクトはFreeプランで、自動バックアップ・PITRは利用できない。これは公開前の未解決事項であり、バックアップ方法の選択と復元可能性の確認が必要。

### 7. 限定本番テストを行う

本番キーと本番商品を接続した後は、Stripeのテストカードを使用できない。公開前に運営者が実際のカードで月額400円を1回だけ決済し、次を確認する。

- [ ] 実決済が1回だけ作成される。
- [ ] ライブWebhookがHTTP 200になり、重複配信も安全に処理される。
- [ ] 有料機能が解放される。
- [ ] 再ログイン後も有料状態が維持される。
- [ ] Customer Portalを開ける。
- [ ] 解約予約と期間終了表示が方針どおりになる。
- [ ] 返金を行う場合は、Stripeとアプリの利用資格の扱いが一致する。

この工程では実際に400円の決済が発生する。実行時に、使用する本番アカウントとカードを明示して別途確認する。

### 8. 公開切り替えを行う

1. 公開対象コミットを固定し、テスト結果とDBバックアップ時刻を記録する。
2. 本番APIを配備し、Health Checkと認証設定を確認する。
3. StripeライブWebhookを有効化し、署名確認を行う。
4. 本番フロントを配備し、無料導線を確認する。
5. LP、SNS、案内ページのリンクをV3本番URLへ変更する。
6. 既存main・V2はすぐ削除せず、切り戻し先として一定期間維持する。
7. 公開直後は登録、メール送信、Checkout、Webhook、契約状態、APIエラーを重点監視する。

### 9. 公開後の監視と切り戻しを行う

#### 異常時の優先順位

1. `V3_BILLING_ENABLED=false`で新規Checkoutを停止する。
2. 課金導線にメンテナンス表示を出し、無料機能は可能な限り維持する。
3. Renderを直前の正常デプロイへロールバックする。
4. Stripe Webhookの失敗イベントを確認し、修正後に再送する。
5. StripeとSupabaseの契約状態を照合し、有料資格を復旧する。
6. 二重課金や誤課金が疑われる場合は、新規課金を止めて個別確認する。

フロントだけを旧版へ戻しても、すでに開始したサブスクリプションは自動停止しない。既存契約の継続・解約・返金はStripe側の状態を別途確認する。

## 推奨する実施順

```text
本番仕様確定
  ↓
本番モード・課金停止スイッチ・契約復旧処理を実装
  ↓
本番Supabase準備
  ↓
Stripe本番商品・価格・Webhook準備
  ↓
Render本番サービスとドメイン準備
  ↓
自動テスト・実画面・障害・負荷確認
  ↓
バックアップ方法・監視・障害時復旧手順を確定
  ↓
運営者による実額400円の限定決済
  ↓
一般公開
  ↓
監視・照合・必要時ロールバック
```

## 公開完了条件

- [ ] 本番ビルドにテストログイン・テスト決済表記・プレビュー用秘密値が含まれない。
- [ ] 未ログイン・無料・有料・期限切れ・支払い失敗の権限がサーバー側で正しく分離される。
- [ ] 新規登録、メール確認、出生情報保存、決済、有料解放、解約、再訪が本番環境で通る。
- [ ] 無料版から有料データを直接取得できない。
- [ ] Webhookの重複・遅延・順序逆転・再送に耐えられる。
- [ ] 障害時に新規課金を停止し、既存契約を壊さず切り戻せる。
- [ ] 利用規約、プライバシーポリシー、特商法表示、問い合わせ先、削除手順が公開されている。
- [ ] 監視、バックアップ、契約照合、問い合わせ対応の担当と手順が決まっている。

## 公式資料

- [Stripe：本番Webhookの準備](https://docs.stripe.com/webhooks/handling-payment-events)
- [Stripe：本番移行チェックリスト](https://docs.stripe.com/get-started/checklist/go-live)
- [Stripe：テスト環境とライブ環境](https://docs.stripe.com/testing)
- [Supabase：Production Checklist](https://supabase.com/docs/guides/deployment/going-into-prod)
- [Supabase：Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase：Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Render：Deploys](https://render.com/docs/deploys)
- [Render：Custom Domains](https://render.com/docs/custom-domains)
- [Render：Free instances](https://render.com/docs/free)

## 次に着手する作業

本番コード・基盤構築は完了し、公開前検証を進めている。次は以下の順で行う。

1. 本番のログイン済み無料会員で、有料APIと課金表への直接アクセスが拒否されることを確認する。
2. PC・スマホ実機で登録、ログイン、出生情報の保存・復元・削除、無料版の画面を確認する。
3. 選択済みの手動バックアップについて、`pg_dump`導入後に実データを暗号化して取得し、別所保管と隔離環境への復元を確認する。障害・負荷、通知・外部死活監視、復旧手順も実額決済より前に確認する。
4. 運営者本人による実額400円の限定決済は、対象アカウントとカードを明示した別途確認の後に実行する。
5. 有料解放、再ログイン、Portalでの解約まで確認してからソフトローンチ・一般公開へ進む。

`V3_BILLING_ENABLED=false`を維持し、限定決済の準備が整うまで新規課金を開始しない。
