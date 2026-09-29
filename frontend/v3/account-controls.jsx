import React, { useEffect, useRef, useState } from "react";
import { postJson } from "./api.mjs";
import { authClient, authMessage, isMemberMode } from "./auth-client.mjs";
import { configureStorage } from "./reading-storage.js";

export function AccountControls({ session }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const container = useRef(null);
  const toggle = useRef(null);
  const signedIn = Boolean(session?.user_id);

  useEffect(() => {
    if (!open) return;
    const closeOutside = event => {
      if (!container.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = event => {
      if (event.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const signOut = async () => {
    setBusy(true);
    setError("");
    try {
      if (__APP_ENVIRONMENT__ !== "local" || isMemberMode()) {
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

  return (
    <div ref={container} className="relative shrink-0 font-mono text-[10px] font-bold tracking-[0.06em] text-[#0A192F]/70 sm:text-xs">
      <button ref={toggle} type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} className="flex min-h-8 items-center gap-1.5 transition hover:text-[#D4AF37]">
        アカウント<span aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      {open && <nav aria-label="アカウントメニュー" className="absolute right-0 top-full z-50 mt-2 flex w-48 flex-col rounded-xl border border-slate-200 bg-white p-1.5 text-xs shadow-xl [&>a]:rounded-lg [&>a]:px-3 [&>a]:py-3 [&>a:hover]:bg-slate-100">
        {signedIn ? <>
          {isMemberMode() && <>
            <a href="/account.html">アカウント管理</a>
            <a href="/billing.html">{session.state === "paid" ? "契約管理" : "有料プラン"}</a>
          </>}
          <button type="button" onClick={signOut} disabled={busy} className="rounded-lg px-3 py-3 text-left hover:bg-slate-100 disabled:opacity-50">{busy ? "処理中" : "ログアウト"}</button>
        </> : <a href="/login.html">ログイン・新規登録</a>}
      </nav>}
      {error ? <span role="alert" className="absolute right-0 top-full mt-2 w-56 rounded bg-white px-2 py-1 text-right text-[10px] text-red-700 shadow">{error}</span> : null}
    </div>
  );
}
