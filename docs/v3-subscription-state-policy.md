# V3 契約状態と利用可否

Stripeの署名済みWebhookを契約状態の根拠とし、Supabaseに保存された状態から有料機能の利用可否を判定する。Checkoutから戻ったことやブラウザー内の値だけでは有料化しない。

| Stripe状態 | 有料機能 | 画面案内 | 新規Checkout |
|---|---|---|---|
| `active` / `trialing`かつ利用期限内 | 利用可 | 利用期限または解約予約を表示 | 不可 |
| `past_due` / `unpaid` | 停止 | 支払い方法の確認を案内 | 不可 |
| `paused` | 停止 | 契約管理画面での確認を案内 | 不可 |
| `incomplete` | 停止 | 処理中として再確認を案内 | 不可 |
| `incomplete_expired` | 停止 | 利用期間終了を表示 | 可 |
| `canceled` | 停止 | 契約終了を表示 | 可 |
| 不明な状態・期限不明 | 停止 | 状態を確認できない旨を表示 | 不可 |
| 契約なし | 無料版 | 無料会員と表示 | 可 |

## 支払い失敗時

`invoice.payment_failed`を受けたらStripeから対象Subscriptionの現在状態を取得し、`past_due`等をSupabaseへ保存する。以後の`/api/v3/session`は有料権限を返さず、課金画面からStripe Customer Portalへ誘導する。支払いが完了し、`invoice.paid`で`active`と新しい利用期限が保存された後に有料機能を再開する。

## 安全条件

- 支払い失敗中の新規Subscription作成を許可しない。
- 不明な契約状態を無料契約とみなして新規Checkoutを許可しない。
- Customer Portalでは既存契約の支払い方法変更と状態確認を行う。
- Webhookを取りこぼした場合は管理コマンドでStripeとSupabaseを照合する。
