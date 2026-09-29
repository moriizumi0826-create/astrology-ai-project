import React, { useState } from "react";
import { postJson } from "./api.mjs";

const SUGGESTED_QUESTIONS = [
  "この3Dマップの基本的な見方は？",
  "天体を選ぶと何がわかる？",
  "アスペクトのラインは何を表す？",
  "連続再生はどう使う？",
];

export function MapAssistantPanel({ id, context, onClose }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function ask(rawQuestion) {
    const question = rawQuestion.trim();
    if (!question || pending) return;
    const history = messages.slice(-6).map(({ role, content }) => ({ role, content }));
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
    <section id={id} aria-label="3Dマップ AIガイド（ローカル試作）" className="absolute inset-x-3 bottom-14 z-[230] flex max-h-[min(75%,560px)] flex-col rounded-2xl border border-gold/30 bg-[#101827]/95 text-mist shadow-2xl backdrop-blur-xl sm:inset-x-auto sm:right-4 sm:w-[min(400px,calc(100%-2rem))]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div><h3 className="text-sm font-semibold text-starlight">3Dマップ AIガイド</h3><p className="text-[10px] text-mist/65">ローカル試作・質問時のみ送信</p></div>
        <button type="button" onClick={onClose} aria-label="AIガイドを閉じる" className="rounded-lg px-2 py-1 text-lg hover:bg-white/10">×</button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3" role="log" aria-live="polite">
        {messages.length === 0 && <p className="text-xs leading-relaxed text-mist/80">下の質問を選ぶか、自分の言葉で入力できます。表示日時・選択中の天体・表示モードだけを質問と一緒に送ります。出生情報フォームの内容は自動送信しません。</p>}
        {messages.map((message, index) => <div key={index} className={message.role === "user" ? "ml-6 rounded-xl bg-gold/15 px-3 py-2 text-xs text-starlight" : "mr-6 rounded-xl bg-white/10 px-3 py-2 text-xs leading-relaxed text-mist"}>
          {message.demo && <span className="mb-1 block text-[10px] text-gold">デモ回答（GPT未接続）</span>}
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
          <input id={id + "-question"} value={draft} maxLength={500} onChange={(event) => setDraft(event.target.value)} placeholder="質問を自由に入力" className="min-w-0 flex-1 rounded-lg border border-white/15 bg-[#0a1120] px-3 py-2 text-xs text-starlight outline-none placeholder:text-mist/50 focus:border-gold/50" />
          <button type="submit" disabled={pending || !draft.trim()} className="rounded-lg bg-gold/20 px-3 py-2 text-xs text-gold disabled:opacity-40">送信</button>
        </form>
        {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
      </div>
    </section>
  );
}
