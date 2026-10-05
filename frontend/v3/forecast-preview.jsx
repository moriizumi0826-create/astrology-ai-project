import React from "react";
import desktopPreview from "./assets/forecast-preview-desktop.jpg";
import mobilePreview from "./assets/forecast-preview-mobile.jpg";

// Static screenshots only: do not import the paid view or fetch paid readings.
export function ForecastPreview({ session, onHoroscope }) {
  const signedIn = Boolean(session?.user_id);
  return <section aria-labelledby="forecast-preview-heading" className="mx-auto max-w-[1400px] px-3 pb-12 pt-6 sm:px-8">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="mb-2 text-xs tracking-widest text-gold">有料版の画面プレビュー</p>
        <h1 id="forecast-preview-heading" className="font-serif text-2xl text-starlight sm:text-3xl">星の見通し · 日別</h1>
        <p className="mt-3 text-sm leading-7 text-slate-300">今日の星の流れ、デイリーパフォーマンス、天体イベントカレンダーで、その日の過ごし方を見通せます。</p>
      </div>
      <button type="button" onClick={onHoroscope} className="shrink-0 rounded-lg border border-gold/30 px-4 py-2 text-sm text-gold">Horoscopeへ戻る</button>
    </div>
    <figure className="overflow-hidden rounded-xl border border-gold/25 bg-[#101827]">
      <figcaption className="border-b border-gold/20 px-4 py-3 text-xs leading-6 text-slate-300">サンプルの出生データによる表示例です。画像内のボタンやカレンダーは操作できません。</figcaption>
      <picture>
        <source media="(max-width: 767px)" srcSet={mobilePreview} width="360" height="2187" />
        <img src={desktopPreview} width="1336" height="1715" alt="有料版の日別画面。今日の星の流れ、デイリーパフォーマンス、Next Stellar Eventの補足と3Dマップ・AIへの導線、天体イベントカレンダーの表示例。" className="block h-auto w-full" decoding="async" />
      </picture>
    </figure>
    <div className="mt-6 rounded-xl border border-gold/25 bg-midnight/90 p-5 sm:p-7">
      <h2 className="text-lg text-gold">あなたの出生データで、星の見通しを</h2>
      <p className="mt-3 text-sm leading-7 text-slate-300">有料版では日別のほか、月間・年間の運気も確認できます。</p>
      {Date.now() < Date.parse("2026-11-01T00:00:00+09:00") && <aside aria-label="新規登録キャンペーン" className="mt-5 space-y-3 border-t border-gold/20 pt-5">
        <h3 className="text-base font-semibold leading-7 text-gold">10月末までの新規登録で、有料機能をずっと無料に</h3>
        <p className="text-sm leading-7">2026年10月31日まで（日本時間）に新規登録とメール認証を完了すると、招待会員として有料プランの機能を期限なく無料でご利用いただけます。</p>
        <p className="text-sm leading-7">カード登録不要・月額料金は発生しません。一定の人数に達し次第終了します。</p>
      </aside>}
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <a className="rounded-lg bg-gold px-5 py-3 text-sm font-bold text-midnight" href={signedIn ? "/billing.html" : "/login.html#signup"}>{signedIn ? "有料プランを見る" : "無料で新規登録"}</a>
        {!signedIn && <a className="text-sm text-gold underline" href="/login.html">登録済みの方はログイン</a>}
      </div>
    </div>
  </section>;
}
