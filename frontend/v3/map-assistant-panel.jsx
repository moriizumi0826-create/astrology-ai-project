import React, { useEffect, useRef, useState } from "react";
import { getJson, postJson } from "./api.mjs";
import FAQ from "./map-assistant-faq.json";
import {useCalendarNotes} from './calendar-workspace.jsx';

const SUGGESTED_QUESTIONS = Object.keys(FAQ);

export function MapAssistantPanel({ id, context, getContext, onClose, canAsk = false, open = true }) {
  const calendarNotes=useCalendarNotes();
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [questionsOpen, setQuestionsOpen] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [usage, setUsage] = useState(null);
  const [usageError, setUsageError] = useState('');
  const usageRequest = useRef(0);
  async function refreshUsage() {
    const version=++usageRequest.current;
    try {
      const next=await getJson('/api/map-assistant/usage');
      if (!Number.isInteger(next.remaining) || !Number.isFinite(Date.parse(next.reset_at))) throw new Error('invalid usage');
      if(version===usageRequest.current){setUsage(next);setUsageError('');}
    } catch {
      if(version===usageRequest.current){setUsage(null);setUsageError('残り回数を取得できませんでした。');}
    }
  }
  useEffect(()=>{
    if(!open || !canAsk) return;
    refreshUsage();
    const focus=()=>refreshUsage();
    window.addEventListener('focus',focus);
    return ()=>{++usageRequest.current;window.removeEventListener('focus',focus);};
  },[open,canAsk]);
  useEffect(()=>{
    if(!open || !canAsk || !usage?.reset_at) return;
    const timer=setTimeout(()=>{setUsage(null);refreshUsage();},Math.max(1000,Date.parse(usage.reset_at)-Date.now()+100));
    return ()=>clearTimeout(timer);
  },[open,canAsk,usage?.reset_at]);
  const [infoOpen, setInfoOpen] = useState(false);
  const infoRef = useRef(null);
  const infoButtonRef = useRef(null);
  useEffect(() => {
    if (!open) setInfoOpen(false);
  }, [open]);
  useEffect(() => {
    if (!infoOpen) return;
    infoRef.current?.focus();
    const outside = event => {
      if (!infoRef.current?.contains(event.target) && !infoButtonRef.current?.contains(event.target)) setInfoOpen(false);
    };
    const escape = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setInfoOpen(false); infoButtonRef.current?.focus(); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape, true); };
  }, [infoOpen]);

  async function ask(rawQuestion) {
    const question = rawQuestion.trim();
    if (!question || pending) return;
    if (Object.hasOwn(FAQ, question)) {
      setMessages((current) => [...current, { role: "user", content: question }, { role: "assistant", content: FAQ[question] }]);
      setDraft("");
      setError("");
      return;
    }
    if (!canAsk || !usage || usage.remaining<=0) return;
    const history = messages.slice(-6).map(({ role, content }) => ({ role, content: content.slice(0, 600) }));
    setMessages((current) => [...current, { role: "user", content: question }]);
    setDraft("");
    setError("");
    setPending(true);
    try {
      const result = await postJson("/api/map-assistant", { question, context: getContext ? getContext() : context, history });
      ++usageRequest.current;
      if(result.usage){setUsage(result.usage);setUsageError('');}else{refreshUsage();}
      setMessages((current) => [...current, { role: "assistant", content: result.answer, demo: result.mode === "demo" }]);
    } catch (cause) {
      setError(cause.message || "回答を取得できませんでした。");
      await refreshUsage();
    } finally {
      setPending(false);
    }
  }

  return (
    <section id={id} hidden={!open} style={open ? undefined : { display: "none" }} aria-label="3Dマップ AIガイド" className="absolute inset-x-3 bottom-14 z-[230] flex max-h-[min(75%,560px)] flex-col rounded-2xl border border-gold/30 bg-[#101827]/95 text-mist shadow-2xl backdrop-blur-xl sm:inset-x-auto sm:right-4 sm:w-[min(400px,calc(100%-2rem))]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div><div className="flex items-center gap-1"><h3 className="text-sm font-semibold text-starlight">3Dマップ AIガイド</h3><button ref={infoButtonRef} type="button" aria-label="AIへ送られる情報" aria-expanded={infoOpen} aria-controls={id+'-info'} onClick={()=>setInfoOpen(value=>!value)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-base text-gold hover:bg-white/10">ⓘ</button></div><p className="text-[10px] text-mist/65">固定質問はAIを使わずに回答します</p></div>
        <button type="button" onClick={onClose} aria-label="AIガイドを閉じる" className="rounded-lg px-2 py-1 text-lg hover:bg-white/10">×</button>
      </div>
      {infoOpen && <div ref={infoRef} id={id+'-info'} role="dialog" aria-label="AIへ送られる情報" tabIndex={-1} className="absolute inset-x-2 top-14 z-10 max-h-[calc(100%-4rem)] space-y-3 overflow-y-auto rounded-xl border border-gold/40 bg-[#101827] p-4 text-xs leading-6 shadow-2xl">
        <div className="flex items-center justify-between gap-2"><h4 className="font-semibold text-starlight">AIへ送られる情報</h4><button type="button" aria-label="情報の説明を閉じる" onClick={()=>{setInfoOpen(false);infoButtonRef.current?.focus();}} className="min-h-11 min-w-11 rounded-lg text-lg hover:bg-white/10">×</button></div>
        <p>自由入力の質問では、質問内容・直近の会話・出生日時・表示中の天体やアスペクトの情報を使用します。</p>
        <p>氏名・メールアドレス・出生地は自動送信されません。質問にご自身で入力した情報は送信対象となります。</p>
        <p>固定質問ではAIへの送信は行われません。</p>
      </div>}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3" role="log" aria-live="polite">
        {messages.length === 0 && <p className="text-xs leading-relaxed text-mist/80">「固定質問」から使い方を確認できます。</p>}
        {messages.map((message, index) => <div key={index} className={message.role === "user" ? "ml-6 rounded-xl bg-gold/15 px-3 py-2 text-xs text-starlight" : "mr-6 rounded-xl bg-white/10 px-3 py-2 text-xs leading-relaxed text-mist"}>
          {message.demo && <span className="mb-1 block text-[10px] text-gold">デモ回答（AI未接続）</span>}
          <span className="whitespace-pre-wrap">{message.content}</span>
          {message.role === "assistant" && calendarNotes?.canWrite && <button type="button" className="mt-2 block text-[10px] text-gold underline" onClick={()=>calendarNotes.edit({content:message.content,...(context?.date ? {note_date:context.date} : {})})}>カレンダーに保存</button>}
        </div>)}
        {pending && <p className="text-xs text-mist/60">回答を読み込み中…</p>}
      </div>
      <div className="space-y-2 border-t border-white/10 p-3">
        <button type="button" aria-expanded={questionsOpen} aria-controls={id + '-questions'} onClick={() => setQuestionsOpen(value => !value)} className="flex min-h-11 w-full items-center justify-between rounded-lg px-1 text-xs text-gold hover:bg-white/5">
          <span>固定質問</span><span>{questionsOpen ? '閉じる ▴' : '開く ▾'}</span>
        </button>
        <div id={id + '-questions'} hidden={!questionsOpen} style={questionsOpen ? undefined : { display: 'none' }} className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto overscroll-contain" aria-label="質問の候補">
          {SUGGESTED_QUESTIONS.map((question) => <button key={question} type="button" disabled={pending} onClick={() => ask(question)} className="rounded-full border border-gold/25 px-2.5 py-1 text-[10px] text-gold transition hover:bg-gold/10 disabled:opacity-50">{question}</button>)}
        </div>
        <form onSubmit={(event) => { event.preventDefault(); ask(draft); }} className="flex gap-2">
          <label htmlFor={id + "-question"} className="sr-only">質問を自由に入力</label>
          <input id={id + "-question"} disabled={!canAsk || pending} value={draft} maxLength={500} onChange={(event) => setDraft(event.target.value)} placeholder={canAsk ? "質問を自由に入力" : "自由入力は有料・招待会員限定"} className="min-w-0 flex-1 rounded-lg border border-white/15 bg-[#0a1120] px-3 py-2 text-xs text-starlight outline-none placeholder:text-mist/50 focus:border-gold/50 disabled:opacity-50" />
          <button type="submit" disabled={!canAsk || pending || !draft.trim() || (!Object.hasOwn(FAQ,draft.trim()) && (!usage || usage.remaining<=0))} className="rounded-lg bg-gold/20 px-3 py-2 text-xs text-gold disabled:opacity-40">送信</button>
        </form>
        {canAsk && <div className="text-[10px] text-mist/65" aria-live="polite">
          {usage ? <><p>AIへの質問：本日あと{usage.remaining}回／{usage.limit}回（日本時間0時更新）</p>{usage.remaining===0 && <p>本日の質問枠がありません。固定質問は引き続き利用できます。</p>}</> : usageError ? <p>{usageError}<button type="button" className="ml-2 text-gold underline" onClick={refreshUsage}>再試行</button></p> : <p>残り回数を確認中…</p>}
        </div>}
        {!canAsk && <p className="text-[10px] text-mist/65">🔒 AIへの自由な質問は有料・招待会員限定です。固定質問は無料で利用できます。</p>}
        {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
      </div>
    </section>
  );
}
