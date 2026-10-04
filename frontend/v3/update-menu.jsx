import React, { useContext, useEffect, useId, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { AppVersionContext } from "./app-version-context.jsx";
import { reloadLatestApp } from "./app-version.mjs";

export function UpdateMenu({ versionState, onRefreshLatest, refreshingLatest = false }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState("main");
  const container = useRef(null);
  const toggle = useRef(null);
  const id = useId();
  const appVersion = useContext(AppVersionContext);
  const appState = appVersion?.state || versionState;
  const hasAppUpdate = Boolean(appState?.isAppOutdated);
  const hasDataUpdate = Boolean(versionState?.isOutdated);
  const hasUpdate = hasAppUpdate || hasDataUpdate;
  const checking = Boolean(appState?.checking);
  const heading = hasAppUpdate ? "新しいバージョンがあります" : hasDataUpdate ? "鑑定データの更新があります" : checking ? "更新状況を確認しています" : appState?.error ? "更新状況を確認できません" : appState ? "現在のバージョンは最新です" : "更新状況は未確認です";

  useEffect(() => {
    if (!open) return;
    const outside = event => { if (!container.current?.contains(event.target)) setOpen(false); };
    const escape = event => {
      if (event.key === "Escape") { setOpen(false); toggle.current?.focus(); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const refresh = () => {
    if (!hasAppUpdate) return;
    setOpen(false);
    reloadLatestApp(window.location);
  };

  return <div ref={container} className="relative shrink-0 text-[#0A192F]">
    <button ref={toggle} type="button" aria-label={hasUpdate ? "更新メニュー：新しいバージョンがあります" : "更新メニュー"} aria-expanded={open} aria-controls={id}
      onClick={() => { if (!open) appVersion?.check(true); setOpen(value => !value); setPage("main"); }}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border shadow-sm transition sm:h-10 sm:w-10 ${hasUpdate ? "border-blue-600 bg-blue-600 text-white hover:bg-blue-700" : "border-slate-200 bg-white hover:bg-slate-100"}`}>
      {hasUpdate && !refreshingLatest ? <span className="text-[9px] font-bold tracking-tight">NEW</span> : <RefreshCw size={15} className={refreshingLatest || checking ? "animate-spin" : ""} />}
    </button>
    {open && <section id={id} aria-label="更新メニュー" className="absolute right-0 top-full z-50 mt-2 w-[min(288px,calc(100vw-24px))] rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
      {page === "main" ? <>
        <h2 className="border-b border-slate-100 px-3 py-3 text-sm font-semibold leading-6">{heading}</h2>
        <div className="flex flex-col py-1 text-left text-xs [&>button]:min-h-11 [&>button]:rounded-lg [&>button]:px-3 [&>button]:text-left [&>button:hover]:bg-slate-100">
          <button type="button" onClick={() => setPage("refresh")} disabled={!hasAppUpdate} className="font-semibold disabled:cursor-not-allowed disabled:text-slate-400">最新版に更新</button>
          {hasDataUpdate && <button type="button" onClick={() => { setOpen(false); onRefreshLatest?.(); }} disabled={refreshingLatest || versionState?.checking || !onRefreshLatest} className="disabled:text-slate-400">{refreshingLatest ? "鑑定データを更新中…" : "鑑定データを更新（再計算）"}</button>}
          {appState?.error && <button type="button" onClick={() => appVersion?.check(true)} disabled={checking}>更新状況を再確認</button>}
          <button type="button" onClick={() => setPage("history")}>更新履歴</button>
          <button type="button" onClick={() => setPage("news")}>お知らせ</button>
        </div>
      </> : page === "refresh" ? <>
        <h2 className="px-3 py-3 text-sm font-semibold">最新版に更新</h2>
        <p className="px-3 pb-3 text-xs leading-6 text-slate-500">画面を再読み込みします。未保存の会話やメモは失われる場合があります。</p>
        <button type="button" onClick={refresh} disabled={!hasAppUpdate} className="min-h-11 w-full rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white disabled:opacity-50">更新する</button>
        <button type="button" onClick={() => setPage("main")} className="min-h-11 w-full rounded-lg px-3 text-left text-xs hover:bg-slate-100">キャンセル</button>
      </> : <>
        <h2 className="px-3 py-3 text-sm font-semibold">{page === "history" ? "更新履歴" : "お知らせ"}</h2>
        {page === "history" ? <ol className="max-h-[50vh] space-y-4 overflow-y-auto px-3 pb-3 text-xs leading-6">
          <li>
            <time dateTime="2026-10-04" className="font-semibold text-slate-500">2026/10/04</time>
            <p className="font-semibold">天体イベントから3Dマップを開けるようになりました</p>
            <p className="text-slate-600">日別の天体イベントカレンダーから、イベント日時の3Dマップへ移動し、出生図とのアスペクトを確認できます。AIチャットにはイベントの案内と質問候補が表示され、候補を選んで質問できます。</p>
          </li>
          <li>
            <time dateTime="2026-10-04" className="font-semibold text-slate-500">2026/10/04</time>
            <p className="font-semibold">Google連携を追加しました</p>
            <p className="text-slate-600">Googleアカウントでログイン・新規登録できるようになりました。天体イベントの詳細から、選んだイベントをGoogleカレンダーへ追加できます（Google側で確認・保存）。</p>
          </li>
          <li>
            <time dateTime="2026-10-01" className="font-semibold text-slate-500">2026/10/01</time>
            <p className="font-semibold">AIチャット機能を追加しました</p>
            <p className="text-slate-600">3Dマップの「AIに聞く」から、使い方の確認や表示中のチャートについて質問できるようになりました。</p>
          </li>
        </ol> : <p className="px-3 pb-3 text-xs leading-6 text-slate-500">お知らせは準備中です。</p>}
        <button type="button" onClick={() => setPage("main")} className="min-h-11 w-full rounded-lg px-3 text-left text-xs hover:bg-slate-100">← 更新メニューに戻る</button>
      </>}
    </section>}
  </div>;
}
