# V3 招待枠と30日無料お試し（実装・切替手順）

## 確定した仕様

- 知り合い向け期間は、運用開始時から **2026-10-31 23:59:59 JST** まで。期間内に新規作成され、同期間内にメール確認を終えた先着25アカウントに、期限なしの招待枠を付ける。既存アカウントは自動対象外。
- 枠はメール確認時にDB内で原子的に確保する。同時確認でも25を超えない。削除されたアカウントの枠は補充しない。上限後も無料会員登録は可能。
- 招待枠はStripe契約ではなく、カード登録・月額請求なしで有料機能を使える資格。手動付与・解除は自動25枠と別に可能。Stripe顧客が既に存在する会員への手動付与は、二重請求事故を避けるため拒否する。
- 通常申込は2026-11-01から。カードを登録し、Stripe顧客履歴のない初回対象者は30日無料、その後は月額400円。30日以内に解約すれば初回請求なし。カードの再試用はStripeのカード識別値で照合し、同じカードまたは同じアカウントの2回目を拒否する。Apple Pay等のトークン化・別カードによる回避は完全には検出できない。
- 招待枠と試用中の契約は、いずれもサーバーの資格判定で有料機能を解放する。フロントの表示だけでは解放しない。

## 安全な適用順序

1. `backend/v3/sql/006_invites_and_trials.sql` をV3本番Supabaseで一度だけ実行する。デフォルトではキャンペーンは**無効**。`backend/v3/sql/007_verify_invites_and_trials.sql` の全行が `OK` か確認する。既存の契約・料金は変更しない。
2. 対応するAPI・フロントをデプロイする。`V3_INVITE_ACCESS_ENABLED=false`、`V3_TRIAL_ENABLED=false` を維持する。既存の `V3_BILLING_ENABLED`・`V3_BILLING_ACCESS_MODE` も変えない。
3. 知り合い登録を始める直前に、既存会員が自動対象外になること、開始時刻と枠数を確認する。そのうえで `V3_INVITE_ACCESS_ENABLED=true` にし、Supabase SQL Editorで以下を一度だけ実行する。これは**実際に招待資格の自動付与を開始する操作**なので、別途ユーザー承認後に限る。

   ```sql
   update public.v3_invite_campaign
      set enabled = true, starts_at = now()
    where id = 1 and enabled = false and starts_at is null;
   ```

4. 11月1日以降、通常申込を開始する承認が出たら、Stripe本番Webhookが `checkout.session.completed`、`customer.subscription.created`、`customer.subscription.updated`、`customer.subscription.deleted`、`invoice.paid`、`invoice.payment_failed` を送る設定か確認する。Customer Portalの解約が無料期間の終了時に効く設定も確認する。次に `V3_TRIAL_ENABLED=true`、`V3_BILLING_ACCESS_MODE=public`、`V3_BILLING_ALLOWED_USER_ID` を空、`V3_BILLING_ENABLED=true` にする。**これらを10月中に切り替えない。**
5. テスト環境でカード登録→試用資格→期間内の解約予約→初回請求なし、期間経過後の初回請求、同じカードでの再試用拒否を確認してから一般向け導線を開く。実カード決済や本番の契約変更は別途承認を得る。

## 手動招待枠

リポジトリのルートで、設定済みのV3環境変数を利用して `python -m scripts.v3.manage_invite --user-id UUID` で読み取り確認する。付与は `--grant --confirm UUID`、解除は `--revoke --confirm UUID` を追加する。対象にはメールではなく、Supabase AuthのUUIDを指定する。**試用中・課金中を含め、Stripe顧客が存在するアカウントへの付与は拒否する。** その場合は契約の終了時期・返金要否を先に個別判断する。手動付与は先着25枠を消費しない。

## 未実施・注意

- この文書の作成時点で、SQLの本番適用、招待キャンペーン有効化、招待の実付与、Stripe本番設定の変更、本番決済は行っていない。
- 新しいSQL関数・auth確認トリガーは本番DBで未検証。適用後に読み取り検証と限定登録テストが必要。
- カード識別値はStripe由来の値をサーバー専用テーブルに保存し、カード番号は保存しない。アカウント削除後も、再試用防止のためカード識別値は利用者との紐付けを外して残る。利用者向けのプライバシー表示は更新したが、公開前の法務確認は別途必要。
