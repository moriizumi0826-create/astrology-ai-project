import React, {createContext, lazy, Suspense, useContext, useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {useAccess} from './access-context.jsx';
import {featurePolicy} from './feature-policy.mjs';
import {getJson, postJson, putJson, deleteJson} from './api.mjs';
import {currentLocalDate, getStoredReadingForm} from './reading-storage.js';
import {appendNoteDraft, orderedNoteTargets} from './calendar-note-merge.mjs';

const Calendar = lazy(()=>import('./dashboard-shared.jsx').then(m=>({default:m.DashboardV2CountdownCard})));
const Context = createContext(null);
export const useCalendarNotes = ()=>useContext(Context);
export const noteLength = value=>Array.from(value).length;

function Dialog({label,onClose,children,editor=false}) {
  const ref=useRef(null);
  useEffect(()=>{
    const previous=document.activeElement;
    ref.current?.focus();
    return ()=>previous?.isConnected && previous.focus();
  },[]);
  return createPortal(<div style={{zIndex:editor?7000:5000}} className="fixed inset-0 flex items-center justify-center bg-black/75 p-3" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <section ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label} className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-2xl border border-gold/30 bg-[#111827] p-4 text-starlight" onKeyDown={e=>{
      if(e.key==='Escape'){e.stopPropagation();onClose();}
      if(e.key==='Tab'){
        const controls=[...ref.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')].filter(el=>el.getClientRects().length);
        const first=controls[0],last=controls.at(-1);
        if(e.shiftKey && (document.activeElement===first || document.activeElement===ref.current)){e.preventDefault();last?.focus();}
        else if(!e.shiftKey && (document.activeElement===last || document.activeElement===ref.current)){e.preventDefault();first?.focus();}
      }
    }}><div className="mb-3 flex items-center justify-between"><h2>{label}</h2><button type="button" aria-label={`${label}を閉じる`} onClick={onClose}>閉じる ×</button></div>{children}</section>
  </div>,document.body);
}

export function CalendarWorkspace({children}) {
  const {session}=useAccess();
  const canWrite=featurePolicy(session).stellarForecast;
  const [notes,setNotes]=useState([]),[loaded,setLoaded]=useState(false),[error,setError]=useState('');
  const [open,setOpen]=useState(false),[data,setData]=useState(null),[loading,setLoading]=useState(false),[eventError,setEventError]=useState('');
  const [draft,setDraft]=useState(null),[busy,setBusy]=useState(false);
  const [destination,setDestination]=useState('new');
  const drafts=useRef(new Map());
  const sequence=useRef(0);
  const eventMapHandler=useRef(null);
  useEffect(()=>()=>{sequence.current++;},[]);
  async function reload(){
    if(!session?.user_id)return;
    const seq=sequence.current;
    setError('');
    try{const result=await getJson('/api/calendar-notes');if(seq===sequence.current){setNotes(result.notes);setLoaded(true);}}
    catch(e){if(seq===sequence.current)setError(e.message);}
  }
  async function openCalendar(onOpenEventMap=null){
    eventMapHandler.current=typeof onOpenEventMap==='function' ? onOpenEventMap : null;
    setOpen(true);if(!loaded)reload();
    if(canWrite && !data && !loading){
      const seq=sequence.current;setLoading(true);setEventError('');
      try{const result=await postJson('/api/readings/deferred',getStoredReadingForm());if(seq===sequence.current)setData(result.dashboard_data||{});}
      catch(e){if(seq===sequence.current)setEventError(e.message);}
      finally{if(seq===sequence.current)setLoading(false);}
    }
  }
  function openEventMap(event){
    try {
      eventMapHandler.current?.(event);
      setEventError('');setOpen(false);
    } catch(e) {setEventError(e.message);}
  }
  function edit(note){
    if(!canWrite)return;
    const initial={note_date:currentLocalDate(),content:'',...note};
    drafts.current=new Map([['new',initial]]);
    setDestination(note?.id?'edit':'new');setDraft(initial);
    if(!loaded)reload();setError('');
  }
  function chooseDestination(key){
    if(busy)return;
    if(destination!=='choose')drafts.current.set(destination,draft);
    const target=notes.find(n=>n.id===key);
    if(!['new','choose'].includes(key)&&!target)return;
    const next=drafts.current.get(key) || (target ? appendNoteDraft(target,drafts.current.get('new')) : drafts.current.get('new'));
    setDestination(key);setDraft(next);setError('');
  }
  function closeDraft(){if(!busy && (!draft?.content || window.confirm('編集中のメモを閉じますか？未保存の内容は失われます。')))setDraft(null);}
  async function save(e){
    e.preventDefault();if(busy||!canWrite||destination==='choose'||!loaded||!draft.content.trim()||noteLength(draft.content)>1000)return;
    setBusy(true);setError('');
    try{
      const payload={note_date:draft.note_date,content:draft.content};
      if(draft.id){payload.id=draft.id;payload.revision=draft.revision;}
      const result=await putJson('/api/calendar-notes',payload);
      setNotes(values=>[...values.filter(n=>n.id!==result.saved.id),result.saved]);setDraft(null);
    }catch(e){setError(e.message);}finally{setBusy(false);}
  }
  async function remove(note){
    if(busy||!window.confirm('このメモを削除しますか？'))return;
    setBusy(true);setError('');
    try{await deleteJson(`/api/calendar-notes/${note.id}`);setNotes(values=>values.filter(n=>n.id!==note.id));}
    catch(e){setError(e.message);}finally{setBusy(false);}
  }
  const value={notes,loaded,error,busy,canWrite,reload,edit,remove,openCalendar};
  return <Context.Provider value={value}>{children}
    {open && <Dialog label={canWrite?'天体イベントカレンダー':'保存済みメモ'} onClose={()=>setOpen(false)}>
      {!canWrite && <p className="mb-3 text-sm">有料期間終了後もメモの閲覧・削除は可能です。新規保存・編集と天体イベント情報は有料会員限定です。</p>}
      {loading && <p role="status">天体イベントを読み込み中…</p>}
      {eventError && <p role="alert">{eventError}<button className="ml-3 underline" onClick={()=>openCalendar(eventMapHandler.current)}>再試行</button></p>}
      <Suspense fallback={<p>カレンダーを読み込み中…</p>}><Calendar calendarOnly data={canWrite ? (data||{}) : {}} onOpenEventMap={canWrite && eventMapHandler.current ? openEventMap : null} /></Suspense>
    </Dialog>}
    {draft && <Dialog editor label="カレンダーにメモを保存" onClose={closeDraft}>
      <form onSubmit={save} className="space-y-3">
        {destination!=='edit' && <fieldset disabled={busy} className="space-y-3 rounded border border-white/15 p-3">
          <legend className="px-1 text-sm">保存方法</legend>
          <label className="mr-5 inline-flex items-center gap-2"><input type="radio" name="note-destination" checked={destination==='new'} onChange={()=>chooseDestination('new')} />新しいメモを作る</label>
          <label className="inline-flex items-center gap-2"><input type="radio" name="note-destination" checked={destination!=='new'} onChange={()=>chooseDestination('choose')} />既存のメモに追記する</label>
          {destination!=='new' && <>
            <label className="block text-sm">追記先（同じ日付を優先）<select aria-label="追記先のメモ" value={destination==='choose'?'':destination} disabled={!loaded} onChange={e=>chooseDestination(e.target.value||'choose')} className="mt-2 block w-full rounded bg-slate-800 p-2">
              <option value="">追記するメモを選んでください</option>
              {orderedNoteTargets(notes,drafts.current.get('new')?.note_date).map(n=><option key={n.id} value={n.id}>{n.note_date} · {Array.from(n.content.replace(/\s+/g,' ')).slice(0,60).join('')}</option>)}
            </select></label>
            <p className="text-xs text-mist">件数は増えません。追記先の日付を維持し、下の本文で保存後の内容を編集できます。</p>
            {loaded&&!notes.length&&<p>保存済みのメモがありません。新規作成を選んでください。</p>}
          </>}
        </fieldset>}
        <label className="block">日付<input aria-label="メモの日付" type="date" required disabled={busy||!['new','edit'].includes(destination)} value={draft.note_date} onChange={e=>setDraft({...draft,note_date:e.target.value})} className="ml-3 rounded bg-slate-800 p-2" /></label>
        <label className="block">メモ<textarea aria-label="メモ本文" rows={8} required disabled={busy||destination==='choose'} value={draft.content} onChange={e=>setDraft({...draft,content:e.target.value})} className="mt-2 block w-full rounded bg-slate-800 p-3" /></label>
        <p className="text-sm">{noteLength(draft.content)} / 1,000文字 · {notes.length} / 100件</p>
        {noteLength(draft.content)>1000 && <p role="alert">1,000文字以内に編集してください。自動では切り捨てません。</p>}
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={busy||!canWrite||!loaded||destination==='choose'||!draft.content.trim()||noteLength(draft.content)>1000||(!draft.id&&notes.length>=100)} className="rounded bg-gold/20 px-4 py-2 disabled:opacity-40">{busy?'保存中…':'アカウントに保存'}</button>
        {!draft.id&&notes.length>=100&&<p>100件に達しています。既存メモへの追記は可能です。</p>}
        {!canWrite && <p>新規保存・編集には有料会員の利用資格が必要です。</p>}
        {!loaded && <button type="button" onClick={reload}>メモを再読み込み</button>}
      </form>
    </Dialog>}
  </Context.Provider>;
}

export function CalendarNotesDay({date}) {
  const ctx=useCalendarNotes();
  useEffect(()=>{if(ctx&&!ctx.loaded)ctx.reload();},[]);
  if(!ctx)return null;
  return <section aria-label="この日のメモ" className="space-y-3 border-t border-white/20 p-4 text-sm">
    <div className="flex justify-between"><h4>この日のメモ（全{ctx.notes.length}/100件）</h4>{ctx.canWrite && <button onClick={()=>ctx.edit({note_date:date})}>＋ メモを追加</button>}</div>
    {ctx.error && <p role="alert">{ctx.error}<button onClick={ctx.reload}>再読み込み</button></p>}
    {ctx.notes.filter(n=>n.note_date===date).map(note=><article key={note.id} className="rounded bg-white/5 p-3"><p className="whitespace-pre-wrap break-words">{note.content}</p><div className="mt-2 flex gap-4">{ctx.canWrite&&<button disabled={ctx.busy} onClick={()=>ctx.edit(note)}>編集</button>}<button disabled={ctx.busy} onClick={()=>ctx.remove(note)}>削除</button></div></article>)}
    {ctx.loaded&&!ctx.notes.some(n=>n.note_date===date)&&<p>この日のメモはありません。</p>}
  </section>;
}
