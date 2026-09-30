import React, { useState } from "react";
import { postJson } from "./api.mjs";
import FAQ from "./map-assistant-faq.json";

const SUGGESTED_QUESTIONS = Object.keys(FAQ);

export function MapAssistantPanel({ id, context, onClose, canAsk = false }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function ask(rawQuestion) {
    const question = rawQuestion.trim();
    if (!question || pending) return;
    if (Object.hasOwn(FAQ, question)) {
      setMessages((current) => [...current, { role: "user", content: question }, { role: "assistant", content: FAQ[question] }]);
      setDraft("");
      setError("");
      return;
    }
    if (!canAsk) return;
    const history = messages.slice(-6).map(({ role, content }) => ({ role, content: content.slice(0, 600) }));
    setMessages((current) => [...current, { role: "user", content: question }]);
    setDraft("");
    setError("");
    setPending(true);
    try {
      const result = await postJson("/api/map-assistant", { question, context, history });
      setMessages((current) => [...current, { role: "assistant", content: result.answer, demo: result.mode === "demo" }]);
    } catch (cause) {
      setError(cause.message || "回答を取得できませんでした。");
    } finally {
      setPending(false);
    }
  }

  return (
    <section id={id} aria-label="3Dマップ AIガイド" className="absolute inset-x-3 bottom-14 z-[230] flex max-h-[min(75%,560px)] flex-col rounded-2xl border border-gold/30 bg-[#101827]/95 text-mist shadow-2xl backdrop-blur-xl sm:inset-x-auto sm:right-4 sm:w-[min(400px,calc(100%-2rem))]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div><h3 className="text-sm font-semibold text-starlight">3Dマップ AIガイド</h3><p className="text-[10px] text-mist/65">固定質問はAIを使わずに回答します</p></div>
        <button type="button" onClick={onClose} aria-label="AIガイドを閉じる" className="rounded-lg px-2 py-1 text-lg hover:bg-white/10">×</button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3" role="log" aria-live="polite">
        {messages.length === 0 && <p className="text-xs leading-relaxed text-mist/80">下の固定質問から使い方を確認できます。自由入力では質問・直近の会話・表示日時・選択中の天体・表示モードをAIに送ります。出生情報フォームの内容は自動送信しません。</p>}
        {messages.map((message, index) => <div key={index} className={message.role === "user" ? "ml-6 rounded-xl bg-gold/15 px-3 py-2 text-xs text-starlight" : "mr-6 rounded-xl bg-white/10 px-3 py-2 text-xs leading-relaxed text-mist"}>
          {message.demo && <span className="mb-1 block text-[10px] text-gold">デモ回答（AI未接続）</span>}
          <span className="whitespace-pre-wrap">{message.content}</span>
        </div>)}
        {pending && <p className="text-xs text-mist/60">回答を読み込み中…</p>}
      </div>
      <div className="space-y-2 border-t border-white/10 p-3">
        <div className="flex flex-wrap gap-1.5" aria-label="質問の候補">
          {SUGGESTED_QUESTIONS.map((question) => <button key={question} type="button" disabled={pending} onClick={() => ask(question)} className="rounded-full border border-gold/25 px-2.5 py-1 text-[10px] text-gold transition hover:bg-gold/10 disabled:opacity-50">{question}</button>)}
        </div>
        <form onSubmit={(event) => { event.preventDefault(); ask(draft); }} className="flex gap-2">
          <label htmlFor={id + "-question"} className="sr-only">質問を自由に入力</label>
          <input id={id + "-question"} disabled={!canAsk || pending} value={draft} maxLength={500} onChange={(event) => setDraft(event.target.value)} placeholder={canAsk ? "質問を自由に入力" : "自由入力は有料・招待会員限定"} className="min-w-0 flex-1 rounded-lg border border-white/15 bg-[#0a1120] px-3 py-2 text-xs text-starlight outline-none placeholder:text-mist/50 focus:border-gold/50 disabled:opacity-50" />
          <button type="submit" disabled={!canAsk || pending || !draft.trim()} className="rounded-lg bg-gold/20 px-3 py-2 text-xs text-gold disabled:opacity-40">送信</button>
        </form>
        {!canAsk && <p className="text-[10px] text-mist/65">🔒 AIへの自由な質問は有料・招待会員限定です。固定質問は無料で利用できます。</p>}
        {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
      </div>
    </section>
  );
}
