"""Review or change a V3 invite grant; changes require an exact UUID confirmation."""
import argparse
import sys
from uuid import UUID

from backend.v3.billing import BillingStore
from backend.v3.deployment import environment, require_expected_supabase_project
from backend.v3.supabase_auth import SupabaseAuth


def main(argv=None):
    parser = argparse.ArgumentParser(description="V3招待枠を確認・手動付与・解除します。既定は読み取りのみ。")
    parser.add_argument("--user-id", required=True, help="Supabase Authの会員UUID")
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--grant", action="store_true", help="招待枠を付与する")
    action.add_argument("--revoke", action="store_true", help="招待枠を解除する")
    parser.add_argument("--confirm", help="変更時には会員UUIDをもう一度指定する")
    args = parser.parse_args(argv)
    try:
        user_id = str(UUID(args.user_id))
        if (args.grant or args.revoke) and args.confirm != user_id:
            raise ValueError("変更時は--confirmに同じ会員UUIDを指定してください。")
        deployment = environment()
        auth = SupabaseAuth(deployment)
        if not auth.configured:
            raise RuntimeError("Supabase認証設定が必要です。")
        require_expected_supabase_project(deployment, auth.project)
        store = BillingStore(auth.url, deployment)
        if not store.configured:
            raise RuntimeError("Supabase Secret keyが必要です。")
        if args.grant or args.revoke:
            store.request("POST", "rpc/v3_set_manual_invite",
                json={"p_user_id": user_id, "p_grant": args.grant})
        print({"user_id": user_id, "invited": store.invite(user_id),
               "action": "grant" if args.grant else "revoke" if args.revoke else "inspect"})
        return 0
    except (RuntimeError, ValueError) as exc:
        print(f"Invite management error: {exc}", file=sys.stderr)
        return 2
    except Exception:
        # Never echo HTTP response bodies or credentials from the management path.
        print("Invite management error: Supabase request failed.", file=sys.stderr)
        return 3


if __name__ == "__main__":
    sys.exit(main())
