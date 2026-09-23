# V3本番Supabase：手動バックアップ手順

更新日：2026-09-23

本番SupabaseのFreeプランには自動バックアップがない。運営者が定期的に論理バックアップを取得し、別の場所に保管する。これは**まだ実行・復元検証していない手順**であり、ファイルが一つ作れただけで公開前のバックアップ要件を完了とはしない。

## 対象と限界

- 対象：本番PostgreSQLの全スキーマ・データ。V3の出生情報、契約対応表、Stripeイベント記録、Supabase Authのユーザー情報を含むことを想定する。
- `pg_dump`のカスタム形式をAES-256-GCMで暗号化し、平文のダンプをディスクに作らない。DBパスワード・暗号化パスフレーズは対話入力し、Git・コマンド引数・出力ファイル名に残さない。
- `--no-owner --no-privileges --no-subscriptions`で取得するため、ロール・権限・外部設定までの完全な復元物ではない。V3のSQLマイグレーション、Supabase Auth設定、SMTP、Render・Stripe設定などは別途復旧が必要。新しいSupabaseプロジェクトへの復元には、管理スキーマの衝突に対する調整も必要になり得る。
- Supabase Storage内の実ファイルはDBダンプに含まれない。現V3コードにはStorage利用を確認していないが、将来使い始めたら別のバックアップが必要。
- 毎回のバックアップ間に生じた更新は失われ得る。一般公開後は少なくとも毎日、加えてDB変更・限定実決済の直前に取得する運用を検討する。

## 準備

1. Windowsで`pg_dump`が未導入なら、下記コマンドの`--setup-pg-dump`で[EDB提供のPostgreSQL 18.6バイナリ](https://www.enterprisedb.com/download-postgresql-binaries)を初回のみ自動取得する（約383 MBのダウンロード）。サーバーのインストール・起動は不要。既に利用可能ならダウンロードしない。
2. 使用するPythonで`cryptography`が読み込めるようにする。現在の開発環境では読み込める。別のPythonを使う場合は`python -m pip install cryptography`を実行する。
3. Supabase管理画面の本番プロジェクトで「Connect → Direct → Session pooler」を確認する。2026-09-23時点の接続先はスクリプトに固定済み。**DBパスワードはこの画面には表示されない。** 不明なら勝手にリセットせず、運営者と影響を確認する。
4. バックアップ保存先をGitリポジトリの外に決める。端末故障に備え、完成後に別媒体・別サービスにも暗号化ファイルを保管する。暗号化パスフレーズはバックアップ本体とは別に安全に保管する。

## 取得と検証

PowerShellで`C:\dev\astrology-v3`へ移動し、以下を実行する。保存先はGitリポジトリ外の絶対パスに置き換えられる。存在しない保存用フォルダーは作成される。パスワードやパスフレーズをコマンドに書かないこと。

```powershell
python scripts/v3_manual_backup.py backup --output-dir "C:\Users\morii\CelestialAtelierBackups" --setup-pg-dump
```

接続プール側の認証が失敗し、端末からIPv6で直接接続できる場合は、末尾に`--direct`を付ける。これにより[Supabaseがバックアップに推奨する直接接続](https://supabase.com/docs/guides/database/connecting-to-postgres)を使う。直接接続できないネットワークでは通常のSession pooler接続を使う。

2種類を対話入力する：Supabaseの**DBパスワード**、バックアップを開くための**16文字以上の暗号化パスフレーズ**。アカウントのログインパスワードやSupabase Secret keyとは別物。成功すると`.catv3`ファイルができ、暗号化の整合性が自動検証される。任意の再検証：

```powershell
python scripts/v3_manual_backup.py verify "C:\Users\morii\CelestialAtelierBackups\v3-supabase-実際のファイル名.catv3"
```

`.catv3`をGitHubや公開フォルダーに置かない。暗号化済みでも認証・出生・決済関連の個人データを含むものとして扱う。別の場所へ複製した後、その複製を`verify`し、取得日時・ファイル名・保管先・検証結果だけを運用記録に残す（パスフレーズは記録しない）。

## 公開前の復元確認

`verify`はファイルの改ざん・破損検出であり、復元の成功は保証しない。本番DBに上書きせず、**隔離したテスト用DB／別プロジェクト**へ実際に復元し、AuthユーザーとV3の4表の件数、RLS・ログイン・有料判定を確認する。この復元先と手順を確保するまでは「復元確認済み」としない。

隔離環境での復元に必要な場合だけ、暗号化ドライブなどのGit外へ平文アーカイブを取り出す。取り出したファイルは個人情報そのものなので、復元作業後に削除し、残存コピーも確認する。

```powershell
python scripts/v3_manual_backup.py extract "C:\Users\morii\CelestialAtelierBackups\v3-supabase-実際のファイル名.catv3" --output-file "C:\Users\morii\CelestialAtelierBackups\restore-test.dump" --acknowledge-plaintext
pg_restore --list "C:\Users\morii\CelestialAtelierBackups\restore-test.dump"
```

`pg_restore --list`も目録確認に過ぎない。実際の復元時は[Supabaseの移行・復元ガイド](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)を参照し、管理スキーマ・権限の差分を先に評価する。復元先が本番DBでないことを必ず確認する。

参考：[Supabaseのバックアップ説明](https://supabase.com/docs/guides/platform/backups)（FreeプランではCLI等による定期エクスポートとオフサイト保管を推奨）、[PostgreSQLの`pg_dump`説明](https://www.postgresql.org/docs/current/app-pgdump.html)。
