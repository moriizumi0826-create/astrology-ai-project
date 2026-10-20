# V3 ユニークアクセス数

本番のみ集計。ブラウザのlocalStorageにランダムな匿名IDを保存し、日本時間の1日につき1件を記録します。LP・ログイン・アプリ間の移動や再読込は重複しません。DBの複合主キーで同時送信も重複排除します。

人の人数そのものではありません。別端末・別ブラウザ・ストレージ削除は別人扱いです。共有ブラウザは1件です。Do Not Track、ストレージ禁止、通信失敗、JavaScript非実行のアクセスは数えないことがあります。不正な大量リクエストへの簡易制限はありますが、厳密なボット判定は行いません。

保存するのは匿名IDと日付のみ。アカウント・メール・出生情報・閲覧URL・流入元・IPアドレスは集計DBに保存しません（ホスティングの通常アクセスログは別）。登録や鑑定を待たせず、失敗しても画面にエラーを出しません。

## 導入

1. 本番SupabaseのSQL Editorで `backend/v3/sql/012_unique_visits.sql` を1回実行。
2. フロント・バックエンドをデプロイ。既存のバックエンド専用Supabaseキーを使うため、新しいキーは不要。
3. 以下のSQLで確認。一般ユーザーから集計値・生データは読み取れません。

日別（新しい日が上）:
```sql
select visit_date, count(*) as unique_browsers
from public.v3_daily_visitors
group by visit_date order by visit_date desc;
```

計測開始からの累計ユニーク数（日別の合計ではありません）:
```sql
select count(distinct visitor_id) as total_unique_browsers
from public.v3_daily_visitors;
```

導入前のアクセスは復元できません。月別等は `count(distinct visitor_id)` を期間条件で集計します。閲覧専用の管理画面は今回追加していません。
