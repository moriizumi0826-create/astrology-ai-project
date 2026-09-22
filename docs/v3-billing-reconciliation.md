# V3 契約状態の照合・復旧

Stripeを正、Supabaseの`v3_subscriptions`をアプリ側の利用資格キャッシュとして照合する管理手順。公開APIではなく、秘密値が設定されたRender APIサービスのShell等から、対象ユーザーを1人ずつ指定して実行する。

## 1. 読み取り専用の照合

最初は必ず`--apply`なしで実行する。

```powershell
python -m backend.v3.reconcile_billing --user-id 00000000-0000-4000-8000-000000000000
```

確認項目：

- `differences`：StripeとSupabaseで異なる契約
- `database_only`：Supabaseにだけ存在する契約。自動修復せず個別確認する
- `skipped`：許可していないPrice、顧客対応不明等。自動修復しない
- `writes`：読み取り専用では必ず`0`

`database_only`または`skipped`がある場合、コマンドは終了コード`3`を返す。Stripe DashboardとWebhook履歴を確認し、原因が分かるまで更新しない。

## 2. 差異の反映

読み取り結果を確認後、同じUUIDを`--confirm`にも指定する。`--apply`だけでは更新できない。

```powershell
python -m backend.v3.reconcile_billing `
  --user-id 00000000-0000-4000-8000-000000000000 `
  --apply `
  --confirm 00000000-0000-4000-8000-000000000000
```

この操作はStripeの現在状態、Price、期間終了日時、解約予約をSupabaseへ反映する。Stripe側の契約・請求・支払いは変更しない。

## 安全条件

- `production`ではライブキー、`preview`ではテストキー以外を起動時に拒否する。
- 設定済みのPrice以外は書き込まない。
- 顧客IDとV3ユーザーの対応を確認できない契約は書き込まない。
- 既定は読み取り専用。更新は`--apply`とUUID完全一致の`--confirm`が必要。
- 実行結果を保存し、更新後に通常の`/api/v3/billing/status`と有料機能を再確認する。
