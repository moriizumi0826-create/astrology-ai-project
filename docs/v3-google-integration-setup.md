# V3 Google連携の設定

## 実装の範囲

- Googleログイン：SupabaseのGoogle OAuthと既存のPKCE認証を使う。メール・パスワードのログインは残す。
- 天体イベント：詳細画面の「Googleカレンダーに追加」からGoogleの予定作成画面を開く。利用者が確認・保存する。予定の読み取り・自動同期・一括登録はしない。
- ログインとカレンダー追加は独立。Googleカレンダーのアクセス権限やRefresh Tokenをこのサイトで管理しない。

## Googleログインを有効にするために必要な設定

以下は外部サービスの設定であり、コード実装だけでは完了しない。OAuthのクライアントシークレットはチャット・Git・フロントに書かず、SupabaseのGoogleプロバイダー設定だけに入力する。

1. [Google Cloud](https://console.cloud.google.com/)で利用するプロジェクトを選ぶ。
2. [Google Auth Platform](https://console.cloud.google.com/auth/overview)でアプリ名・連絡先・対象ユーザーを設定する。ログインだけなのでCalendar APIの権限は追加しない。
3. Webアプリ用のOAuthクライアントを作成する。承認済みJavaScript生成元に `https://thecelestialatelier.com` を登録する。
4. Supabase本番プロジェクトのGoogleプロバイダー画面に表示されるCallback URLを、Googleの「承認済みリダイレクトURI」にそのまま登録する。通常は `https://<本番プロジェクトID>.supabase.co/auth/v1/callback`。サイトの `auth-callback.html` とは別。
5. Googleで発行したClient IDとClient SecretをSupabaseのGoogleプロバイダー設定に入力し、有効化する。
6. Supabaseの認証Redirect URLsに `https://thecelestialatelier.com/auth-callback.html?mode=google` を許可する。Site URLと既存のメール認証・再設定用URLは維持する。
7. ローカル確認も行う場合は、実際に使うポートの生成元と戻り先を追加する。例：`http://127.0.0.1:5176`、`http://127.0.0.1:5176/auth-callback.html?mode=google`。別ポートを使う場合はそのポートを指定する。本番とプレビューのSupabaseプロジェクトは混同しない。
8. テスト公開の場合はテスト利用者をGoogle側に登録する。通常利用を始める際は、Google側の対象ユーザー・公開状態・必要なブランド確認を確認する。

## 会員情報と認証後の動作

- 既存会員は同じメールアドレスのGoogleアカウントを使う。アカウント結合はSupabaseの認証機構に任せ、サイトでメール文字列だけによる独自の結合・権限付与をしない。
- 別のメールアドレスは別会員となる。別アカウントの出生データや有料権限を移さない。
- 新規会員・出生情報未登録：既存の出生データ登録画面へ進む。
- 登録済み：既存プロフィールを読み込み、ホロスコープへ進む。Googleプロフィールの名前等で出生情報を上書きしない。
- 招待キャンペーン・有料資格は既存のサーバー判定を使い、Googleログイン専用の無料枠や特別資格は追加しない。
- Google認証キャンセル・認証失敗はログイン画面への案内を表示する。

## カレンダーへ渡す内容

選択したイベントのタイトル・日時・説明のみ。出生年月日、メールアドレス、他の保存メモは追加URLに含めない。UTC／時差付き時刻を優先し、Googleでの表示タイムゾーンは端末のものを使用する。時刻のないイベントは終日予定、時刻のあるイベントは30分の予定として作成画面に入力する。30分は予定枠であり、占星術上の影響期間を意味しない。Google側で変更できる。

自動同期・重複防止はしない。同じイベントを繰り返し保存するとGoogle側で重複する場合がある。日時を確認できないイベントには追加リンクを出さない。

## 完了と未完了を分ける

- コード・ローカル検証と、Google/Supabase設定・実認証・Google側の予定保存は別々に記録する。
- Googleログインの実認証完了前に、実ページの更新履歴へ「利用可能」とは記載しない。
- 更新履歴への記載予定：10/1 AIチャット実装、10/4 Googleログインと天体イベントのGoogleカレンダー追加。ただしGoogle連携2件の完了を確認した後に掲載する。

参照：[Supabase Googleログイン](https://supabase.com/docs/guides/auth/social-login/auth-google)、[認証IDの結合](https://supabase.com/docs/guides/auth/auth-identity-linking)、[PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow)。
