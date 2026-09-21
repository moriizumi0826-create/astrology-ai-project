import React, { useState } from "react";
import { postJson } from "./api.mjs";
import { authClient, authMessage, isMemberMode } from "./auth-client.mjs";
import { configureStorage } from "./reading-storage.js";

export function AccountControls({ session }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const signedIn = Boolean(session?.user_id);

  const signOut = async () => {
    setBusy(true);
    setError("");
    try {
      if (isMemberMode()) {
        const client = await authClient();
        const { error: signOutError } = await client.auth.signOut({ scope: "local" });
        if (signOutError) throw new Error(authMessage(signOutError));
      } else {
        await postJson("/api/v3/test-auth/logout", {});
      }
      configureStorage(null);
      location.assign("/entry.html");
    } catch (failure) {
      setError(failure?.message || "ログアウトできませんでした。");
      setBusy(false);
    }
  };

  if (!signedIn) {
    return (
      <a href="/login.html" className="shrink-0 font-mono text-[10px] font-bold tracking-[0.08em] text-[#0A192F]/70 transition hover:text-[#D4AF37] sm:text-xs">
        ログイン
      </a>
    );
  }

  return (
    <div className="relative flex shrink-0 items-center gap-2 font-mono text-[9px] font-bold tracking-[0.06em] text-[#0A192F]/70 sm:gap-3 sm:text-xs">
      {isMemberMode() ? (
        <>
          <a href="/billing.html" className="transition hover:text-[#D4AF37]">
            {session.state === "paid" ? "契約管理" : "有料プラン"}
          </a>
          <a href="/account.html" className="transition hover:text-[#D4AF37]">アカウント</a>
        </>
      ) : null}
      <button type="button" onClick={signOut} disabled={busy} className="transition hover:text-[#D4AF37] disabled:opacity-50">
        {busy ? "処理中" : "ログアウト"}
      </button>
      {error ? <span role="alert" className="absolute right-0 top-full mt-2 w-56 rounded bg-white px-2 py-1 text-right text-[10px] text-red-700 shadow">{error}</span> : null}
    </div>
  );
}
