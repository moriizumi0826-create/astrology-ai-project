import React, { useState } from "react";
import { ChevronDown, MapPin, PencilLine, Search, Sparkles } from "lucide-react";
import {
  birthFormSnapshot,
  buildReadingRequest,
  initialBirthData,
  PREFECTURE_OPTIONS,
} from "./birth-data.mjs";

function cx(...values) {
  return values.filter(Boolean).join(" ");
}

const fieldClass = "w-full rounded-xl border border-white/10 bg-white/[0.035] px-3 py-3 text-sm text-[#f3f3f0] outline-none transition placeholder:text-[#c7c6cc]/35 focus:border-[#e9c349]/55 focus:ring-2 focus:ring-[#e9c349]/15 disabled:cursor-not-allowed disabled:opacity-45";
const labelClass = "mb-2 block font-mono text-[9px] font-black uppercase tracking-[0.2em] text-[#e9c349]";

export function BirthDataEditor({ initialForm = {}, meta = {}, onSearchLocations, onRecalculate }) {
  const hasBirthData = Boolean(initialForm?.birth_date || meta?.birth_date);
  const [open, setOpen] = useState(!hasBirthData);
  const [form, setForm] = useState(() => initialBirthData(initialForm, meta));
  const [locationResults, setLocationResults] = useState([]);
  const [locationMessage, setLocationMessage] = useState("");
  const [locationError, setLocationError] = useState(false);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const updateField = (name, value) => {
    setForm((current) => ({ ...current, [name]: value }));
    setError("");
    setSuccess("");
  };

  const invalidateLocation = (name, value) => {
    setForm((current) => ({
      ...current,
      [name]: value,
      resolved_birthplace: "",
      latitude: "",
      longitude: "",
    }));
    setLocationResults([]);
    setLocationMessage("");
    setError("");
    setSuccess("");
  };

  const resetAndToggle = () => {
    if (!open) {
      setForm(initialBirthData(initialForm, meta));
      setLocationResults([]);
      setLocationMessage("");
      setError("");
    }
    setOpen((value) => !value);
  };

  const searchLocations = async () => {
    const city = String(form.birthplace || "").trim();
    const prefecture = String(form.birth_prefecture || "").trim();
    if (!prefecture || !city) {
      setLocationError(true);
      setLocationMessage("都道府県と市区町村を入力してください。");
      return;
    }
    setSearching(true);
    setLocationError(false);
    setLocationMessage("出生地候補を検索しています…");
    setLocationResults([]);
    try {
      const payload = await onSearchLocations({
        q: city,
        prefecture,
        birth_date: form.birth_date,
        birth_time: form.birth_time_unknown ? "" : form.birth_time,
        birth_time_unknown: form.birth_time_unknown,
      });
      const results = Array.isArray(payload?.results) ? payload.results : [];
      setLocationResults(results);
      setLocationError(!results.length);
      setLocationMessage(results.length ? "候補から出生地を選択してください。" : "候補が見つかりませんでした。地名を変えてお試しください。");
    } catch (searchError) {
      setLocationError(true);
      setLocationMessage(searchError?.message || "出生地検索に失敗しました。");
    } finally {
      setSearching(false);
    }
  };

  const selectLocation = (result) => {
    setForm((current) => ({
      ...current,
      resolved_birthplace: String(result.display_name || ""),
      latitude: Number(result.latitude).toFixed(4),
      longitude: Number(result.longitude).toFixed(4),
      timezone_offset: result.timezone_offset === null || result.timezone_offset === undefined
        ? current.timezone_offset
        : String(result.timezone_offset),
      timezone_name: String(result.timezone_name || current.timezone_name || "Asia/Tokyo"),
    }));
    setLocationResults([]);
    setLocationError(false);
    setLocationMessage(`${result.display_name} を出生地として設定しました。`);
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    let request;
    try {
      request = buildReadingRequest(form);
    } catch (validationError) {
      setError(validationError?.message || "入力内容を確認してください。");
      return;
    }

    setSubmitting(true);
    try {
      await onRecalculate({ request, snapshot: birthFormSnapshot(form) });
      setSuccess("出生情報を更新し、ホロスコープを再計算しました。");
      setOpen(false);
    } catch (submitError) {
      setError(submitError?.message || "ホロスコープの再計算に失敗しました。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mb-5 overflow-hidden rounded-2xl border border-white/10 bg-[#121414]/80 shadow-[0_18px_42px_rgba(0,0,0,0.22)] backdrop-blur-md">
      <button
        type="button"
        onClick={resetAndToggle}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-white/[0.035] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#e9c349]/30"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#e9c349]/30 bg-[#e9c349]/10 text-[#e9c349]">
            <PencilLine size={16} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block font-mono text-[9px] font-black uppercase tracking-[0.24em] text-[#e9c349]">Birth Data</span>
            <span className="mt-1 block text-sm font-semibold text-[#f3f3f0]">出生情報を編集して再計算</span>
          </span>
        </span>
        <ChevronDown size={18} className={cx("shrink-0 text-[#c7c6cc] transition", open && "rotate-180")} aria-hidden="true" />
      </button>

      {success && !open ? (
        <p className="border-t border-[#e9c349]/15 bg-[#e9c349]/[0.055] px-5 py-3 text-xs leading-5 text-[#e9c349]" role="status">{success}</p>
      ) : null}

      {open ? (
        <form onSubmit={submit} className="border-t border-white/10 px-5 py-5">
          <div className="grid gap-5 md:grid-cols-2">
            <label className="md:col-span-2">
              <span className={labelClass}>Full Name / 氏名</span>
              <input
                className={fieldClass}
                type="text"
                value={form.full_name}
                onChange={(event) => updateField("full_name", event.target.value)}
                placeholder="山田 太郎"
                autoComplete="name"
                required
              />
            </label>
            <label>
              <span className={labelClass}>Date of Birth / 生年月日</span>
              <input
                className={fieldClass}
                type="date"
                value={form.birth_date}
                onChange={(event) => updateField("birth_date", event.target.value)}
                required
              />
            </label>
            <div>
              <label>
                <span className={labelClass}>Birth Time / 出生時刻</span>
                <input
                  className={fieldClass}
                  type="time"
                  step="60"
                  value={form.birth_time}
                  onChange={(event) => updateField("birth_time", event.target.value)}
                  disabled={form.birth_time_unknown}
                  required={!form.birth_time_unknown}
                />
              </label>
              <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs leading-5 text-[#c7c6cc]">
                <input
                  className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/5 text-[#e9c349] focus:ring-[#e9c349]/35"
                  type="checkbox"
                  checked={form.birth_time_unknown}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    birth_time_unknown: event.target.checked,
                    birth_time: event.target.checked ? "" : current.birth_time,
                  }))}
                />
                <span>出生時間不明（12:00を仮時刻として計算し、ASC・MC・ハウスは表示しません）</span>
              </label>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
            <div className="mb-4 flex items-center gap-2 text-[#f3f3f0]">
              <MapPin size={15} className="text-[#e9c349]" aria-hidden="true" />
              <p className="text-sm font-semibold">出生地</p>
            </div>
            <div className="grid gap-4 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto] md:items-end">
              <label>
                <span className={labelClass}>Prefecture / 都道府県</span>
                <select
                  className={fieldClass}
                  value={form.birth_prefecture}
                  onChange={(event) => invalidateLocation("birth_prefecture", event.target.value)}
                >
                  <option value="">都道府県を選択</option>
                  {PREFECTURE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label>
                <span className={labelClass}>City / 市区町村</span>
                <input
                  className={fieldClass}
                  type="text"
                  value={form.birthplace}
                  onChange={(event) => invalidateLocation("birthplace", event.target.value)}
                  placeholder="世田谷区 / 札幌市"
                />
              </label>
              <button
                type="button"
                onClick={searchLocations}
                disabled={searching}
                className="inline-flex h-[46px] items-center justify-center gap-2 rounded-xl border border-[#e9c349]/35 bg-[#e9c349]/10 px-4 font-mono text-[10px] font-black tracking-[0.14em] text-[#e9c349] transition hover:bg-[#e9c349]/20 disabled:cursor-wait disabled:opacity-60"
              >
                <Search size={14} aria-hidden="true" />
                {searching ? "検索中" : "検索する"}
              </button>
            </div>

            {locationMessage ? (
              <p className={cx("mt-3 text-xs leading-5", locationError ? "text-[#ffb4ab]" : "text-[#c7c6cc]")} role="status">{locationMessage}</p>
            ) : null}
            {locationResults.length ? (
              <div className="mt-3 grid gap-2">
                {locationResults.map((result, index) => (
                  <button
                    key={`${result.display_name || "location"}-${index}`}
                    type="button"
                    onClick={() => selectLocation(result)}
                    className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 text-left text-xs leading-5 text-[#f3f3f0] transition hover:border-[#e9c349]/35 hover:bg-[#e9c349]/[0.055]"
                  >
                    {result.display_name}
                  </button>
                ))}
              </div>
            ) : null}

            {form.resolved_birthplace ? (
              <p className="mt-3 rounded-xl border border-[#e9c349]/20 bg-[#e9c349]/[0.045] px-3 py-2 text-xs leading-5 text-[#e9c349]">
                設定中: {form.resolved_birthplace}
              </p>
            ) : null}

            <details className="mt-4 text-xs text-[#c7c6cc]">
              <summary className="cursor-pointer select-none font-mono text-[9px] font-black uppercase tracking-[0.18em] text-[#c7c6cc]/70">位置情報を確認・手動入力</summary>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <label>
                  <span className={labelClass}>Latitude / 緯度</span>
                  <input className={fieldClass} type="number" step="0.0001" value={form.latitude} onChange={(event) => updateField("latitude", event.target.value)} placeholder="35.6812" />
                </label>
                <label>
                  <span className={labelClass}>Longitude / 経度</span>
                  <input className={fieldClass} type="number" step="0.0001" value={form.longitude} onChange={(event) => updateField("longitude", event.target.value)} placeholder="139.7671" />
                </label>
              </div>
            </details>
          </div>

          {error ? (
            <p className="mt-4 rounded-xl border border-[#ffb4ab]/25 bg-[#3a1d1d]/55 px-4 py-3 text-xs leading-5 text-[#ffb4ab]" role="alert">{error}</p>
          ) : null}

          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            {hasBirthData ? (
              <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-white/10 px-5 py-3 text-xs font-semibold text-[#c7c6cc] transition hover:bg-white/[0.04]">キャンセル</button>
            ) : null}
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#e9c349] px-6 py-3 text-xs font-black text-[#121414] transition hover:bg-[#f2d76b] disabled:cursor-wait disabled:opacity-60"
            >
              <Sparkles size={15} aria-hidden="true" />
              {submitting ? "再計算しています…" : "この出生情報で再計算"}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
