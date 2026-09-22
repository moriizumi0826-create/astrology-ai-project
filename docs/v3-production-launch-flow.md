# V3 本番環境移行フロー

更新日：2026-09-22
対象：`C:\dev\astrology-v3` / `codex/v3-integration`

## 目的

公開プレビューで確認中のV3を、実際の会員登録・月額課金・有料機能提供ができる本番サービスへ移行するための手順を整理する。

本番の基本導線は次のとおり。

**LP・出生データ入力 → 無料版 → 会員登録／ログイン → Stripe Checkout → Webhookで契約確認 → 有料版を解放**

決済完了画面へ戻ったことだけでは有料化せず、Stripeの署名済みWebhookとサーバー保存済みの契約状態を根拠にする現在の構造を維持する。

## 現在地

2026-09-22時点では、本番Supabaseと本番Renderの分離環境を作成済み。独自SMTPは接続済み。Stripeライブ課金と法務導線は未接続で、課金停止スイッチを閉じた状態にしている。

| 項目 | 現在の状態 | 本番化で必要な対応 |
|---|---|---|
| V3フロント | Render公開プレビューで稼働 | 本番用サービス・ドメインを分離して配備 |
| V3 API | Render公開プレビューで稼働 | 本番用APIとして別サービスを用意 |
| 認証 | 本番Supabaseで登録・確認・ログイン・再設定、独自SMTP、Turnstileを設定済み | 公開前に本番端末で一連の認証導線を再確認 |
| 出生情報 | Supabaseへ本人単位で保存・復元を確認 | 本番DBへSQL適用、RLS・バックアップ・削除運用を確認 |
| 決済 | Stripeテストモード、月額400円 | Stripe本番モードに商品・価格・Webhookを新規作成 |
| 有料判定 | `invoice.paid`後に有料機能が解放されることを確認 | 本番Webhook、更新・失敗・解約・照合運用を完成 |
| 共有テスト会員 | 公開プレビューで利用可能 | 本番には移行せず、プレビュー専用として残す |
| main・V2 | 既存公開を維持 | V3公開確認後まで切り替えない |

公開プレビューでは、通常のSupabaseログイン、Stripeテスト決済、Webhook反映、有料ホロスコープ、契約管理画面まで確認済み。ログイン情報はGit管理外のローカルファイルに保存している。

## 本番移行の前提

### 環境変数を入れ替えるだけでは本番化できない

現在の実装には、誤って実課金を開始しないための制限がある。

- `backend/v3/deployment.py`は`V3_ENVIRONMENT=local`または`preview`だけを許可し、`production`を拒否する。
- `backend/v3/billing.py`は`sk_test_`で始まるStripeテストキーだけを許可する。
- Stripe価格検証は`livemode=false`を前提にしている。
- API名、エラー文、課金画面、LPに「preview」「テスト運用版」「テスト決済」の表記が残っている。
- 本番用の課金停止スイッチ、定期的なStripe照合、退会・出生情報削除の導線は未実装。

したがって、先に本番モードを安全に扱えるコードを実装・検証し、その後に本番用キーを設定する。テスト制限を単純に削除してライブキーを入れる進め方は採用しない。

## 移行工程

### 1. 本番仕様と運用責任を確定する

- [ ] 正式サービス名、運営者名、問い合わせ先を確定する。
- [ ] 本番フロントURLと本番API URLを確定する。
- [ ] 料金は当面「日本円・月額400円・年額なし・無料期間なし」とする。
- [ ] USD 4.50は今回の本番対象に含めず、`V3_STRIPE_PRICE_USD`を設定しない。
- [ ] 解約は「期間終了時まで利用可能」とするか、即時停止とするかを確定する。
- [ ] 返金方針、支払い失敗時の利用停止、再開時の扱いを確定する。
- [ ] 利用規約、プライバシーポリシー、特定商取引法に基づく表示、免責事項を用意する。
- [ ] 出生情報・アカウントの削除依頼と問い合わせ対応の手順を決める。

この工程で決まっていない運用を、コード側の都合だけで固定しない。

### 2. 本番モードをコードとして実装する

#### 環境境界

- [ ] `V3_ENVIRONMENT=production`を正式な値として追加する。
- [ ] `local`、`preview`、`production`ごとに許可Origin・Host・認証・課金モードを明示する。
- [ ] `preview`は引き続きStripeテストキーだけ、`production`はライブキーだけを許可する。
- [ ] 本番でローカル`test/test`認証や共有プレビュー会員へ到達できないことを自動テストする。
- [ ] 本番フロントがプレビューAPIへ、本番APIがプレビューSupabase／Stripeへ接続できない構成にする。

#### Stripeライブモード

- [ ] 本番環境では`sk_live_`を許可し、価格の`livemode=true`を必須にする。
- [ ] プレビュー環境では従来どおり`sk_test_`と`livemode=false`を必須にする。
- [ ] 月額400円・JPY・1カ月周期・有効なPrice・想定Productであることを起動後または初回決済前に検証する。
- [ ] Checkout、Customer Portal、Webhookの文言から「テスト」を除去し、環境に応じた表示へ切り替える。
- [ ] `V3_BILLING_ENABLED=false`で新規Checkoutだけを安全に停止できるキルスイッチを追加する。

#### 契約状態と復旧

- [ ] 現在対応している`customer.subscription.created`、`customer.subscription.updated`、`customer.subscription.deleted`、`invoice.paid`を本番でも処理する。
- [ ] `invoice.payment_failed`、`past_due`、`unpaid`、`paused`の表示・利用可否・案内文を決めて実装する。
- [ ] Webhookの重複、遅延、順序逆転を再テストする。
- [ ] Webhookを取りこぼした場合に、Stripeの現在状態とSupabaseの契約状態を管理者が照合・復旧できる手順または管理コマンドを用意する。
- [ ] 既存契約者に対する新規Checkoutの二重作成を拒否する現在の制御を維持する。

#### 本番UI・法務導線

- [ ] LP、ログイン、課金、契約管理から利用規約・プライバシーポリシー・特商法表示・問い合わせ先へ移動できるようにする。
- [ ] 課金確定前に、価格、更新周期、自動更新、解約方法、利用可能期間を表示する。
- [ ] 「テスト運用版」「テスト決済」「実際の課金は発生しません」等の表記を本番ビルドから除外する。
- [ ] アカウント削除と出生情報削除の処理を実装する。契約中の退会時は先に契約処理を案内する。

### 3. 本番用Supabaseを準備する

プレビュー用データと本番データを混在させないため、本番用Supabaseプロジェクトを分離する。

- [x] 本番用Supabaseプロジェクトを作成する。
- [ ] 管理アカウントとGitHubアカウントにMFAを設定する。
- [x] `backend/v3/sql/001_birth_profiles.sql`を実行する。
- [x] `backend/v3/sql/002_billing.sql`を実行する。
- [x] `backend/v3/sql/004_harden_automatic_rls.sql`を実行する。
- [x] 全テーブルのRLS、権限、インデックスを確認する。
- [ ] 匿名キー・ログインユーザーから契約テーブルを直接読めないことを実環境で確認する。
- [x] 本番Site URLを正式URLへ設定する。
- [x] メール確認・パスワード再設定のRedirect URLを本番の正確なURLだけで登録する。
- [x] 独自SMTPを設定し、送信元ドメイン、SPF、DKIM、メール文面、到達性を確認する。
- [x] 登録・ログイン・再設定のレート制限とCAPTCHAを設定する。
- [ ] Security Advisor、SSL、Network Restrictions、バックアップ／PITR、プランを確認する。
- [ ] プレビューの共有テストユーザー、テスト出生情報、テスト契約を本番へコピーしない。

2026-09-22時点で、本番プロジェクト`celestial-atelier-v3-production`（Project Ref: `sxkhgczqvsewtsrcnbbe`、Sydney）を作成済み。`003_verify_v3_security.sql`の16項目はすべて`OK`、Security AdvisorはErrors 0・Warnings 0。Info 3件は、サーバー専用の課金3テーブルに意図的にブラウザー向けRLSポリシーを作成していないことを示す想定どおりの結果。

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

- [ ] Stripeアカウントの事業情報、本人確認、入金口座、明細表記、問い合わせ情報を完成させる。
- [ ] ライブモードで本番商品を作成する。
- [ ] ライブモードでJPY 400・毎月・定額のPriceを作成する。
- [ ] Customer Portalで解約、支払い方法変更、請求履歴等の許可範囲を設定する。
- [ ] 本番API URLの`/api/v3/billing/webhook`をライブWebhook送信先として作成する。
- [ ] 必要な4イベントを明示的に購読する。
- [ ] ライブWebhook固有の署名シークレットを取得する。テストWebhookの値を流用しない。
- [ ] WebhookのStripe API versionを固定し、コード・stripe-python・イベント構造の組み合わせを記録する。

本番Renderへ登録するStripe値は次の3つ。

| 環境変数 | 用途 | 注意 |
|---|---|---|
| `V3_STRIPE_SECRET_KEY` | StripeライブAPI | `sk_live_`。サーバーだけ |
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
- [ ] `V3_ENVIRONMENT=production`と本番Supabase／Stripeの秘密値をRender Dashboardに設定する。
- [ ] ログにtoken、秘密鍵、出生情報、決済情報を出さないことを確認する。
- [ ] カスタムドメインをRenderへ追加し、DNSとTLSを確認する。
- [ ] Content Security Policy等の本番セキュリティヘッダーを確認する。
- [ ] PreviewのURL・環境変数・Webhookを本番と明確に分離したまま残す。

2026-09-22にRender Blueprint `celestial-atelier-v3-production`を作成。APIはStarter、フロントはStatic Siteで分離し、`V3_BILLING_ENABLED=false`、Stripeライブ設定なしで配備した。

- 本番フロント：`https://celestial-atelier-v3-production.onrender.com`
- 本番API：`https://celestial-atelier-v3-production-api.onrender.com`
- 確認済み：Health Check `200`、`environment=production`、本番OriginだけにCORS許可、未知OriginにはCORS許可なし、公開環境のテストログインAPI・画面は`404`

### 6. 本番公開前の総合検証を行う

#### 自動テスト

- [ ] バックエンド全テスト。
- [ ] フロント全テスト。
- [ ] V3本番ビルド。
- [ ] 依存関係監査と、更新後の回帰テスト。
- [ ] `production`でテストキーを拒否し、`preview`でライブキーを拒否する境界テスト。
- [ ] 無料ユーザーが有料APIを直接呼んでも取得できない権限テスト。

#### 実画面

- [ ] PC・スマホでLPから無料ホロスコープまで確認する。
- [ ] 新規登録、確認メール、ログイン、ログアウト、パスワード再設定を確認する。
- [ ] 無料版の任意日チャート、今日±15日再生、複合ロック、一覧非表示を確認する。
- [ ] 有料版の1カ月／1年再生、複合アスペクト、一覧、星の見通しを確認する。
- [ ] 星の見通しとHoroscopeを往復して、不要な再読み込みとレイアウト崩れがないことを確認する。
- [ ] 海外出生地、海外端末時刻、夏時間重複時刻、日付変更を確認する。
- [ ] API停止、Supabase障害、Stripe障害、Webhook遅延時に誤って有料化しないことを確認する。

#### 負荷・運用

- [ ] 30日／1年再生の計算時間、同時利用、RenderのCPU・メモリ・応答時間を測定する。
- [ ] Supabase Auth・DB、Stripe Webhook、Renderのレート制限とアラートを確認する。
- [ ] エラー監視、死活監視、ログ保存期間、問い合わせ対応者を決める。

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

最初の実装作業は、工程2の「本番モードをコードとして実装する」。具体的には次の単位で進める。

1. `production`環境境界を追加する。
2. Stripeテスト／ライブキーとPriceの組み合わせを環境別に検証する。
3. 課金停止スイッチを追加する。
4. 本番ビルドからテスト表記とテスト用入口を除外する。
5. 境界テストを追加し、プレビュー環境が従来どおり動くことを確認する。

このコード変更と検証が完了するまで、StripeライブキーをRenderへ登録しない。
