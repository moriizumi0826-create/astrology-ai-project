import React from "react";

export function TransitPlaybackControls({ range, onRangeChange, start, end, onStartChange, onEndChange, min, max, disabled, error, options = [["month", "1ヶ月"], ["year", "1年間"], ["custom", "期間指定"]], rangeHint = "開始日・終了日を含む最大366日" }) {
  return (
    <fieldset disabled={disabled} className="grid min-w-0 gap-2 font-mono text-[10px] text-mist disabled:opacity-60">
      <legend className="sr-only">再生期間</legend>
      <div className="flex items-center gap-1">
        <span className="mr-1 text-[8px]">期間</span>
        {options.map(([key, label]) => (
          <button key={key} type="button" onClick={() => onRangeChange(key)} aria-pressed={range === key}
            className={`h-7 whitespace-nowrap rounded-md border px-2 transition disabled:cursor-not-allowed ${range === key ? "border-gold/40 bg-gold/15 text-gold" : "border-white/10 bg-white/[0.03] text-mist/70 hover:text-starlight"}`}>
            {label}
          </button>
        ))}
      </div>
      {range === "custom" && (
        <>
          <div className="flex flex-wrap gap-2">
            <label className="grid min-w-0 flex-1 gap-1">開始日
              <input type="date" value={start} min={min} max={max} onInput={(event) => onStartChange(event.currentTarget.value)}
                className="min-w-0 w-full rounded-md border border-white/15 bg-[#121414] px-2 py-1 text-starlight [color-scheme:dark]" />
            </label>
            <label className="grid min-w-0 flex-1 gap-1">終了日
              <input type="date" value={end} min={start || min} max={max} onInput={(event) => onEndChange(event.currentTarget.value)}
                className="min-w-0 w-full rounded-md border border-white/15 bg-[#121414] px-2 py-1 text-starlight [color-scheme:dark]" />
            </label>
          </div>
          <p className="text-[9px] text-mist/65">{rangeHint}</p>
          {error && <p role="alert" className="max-w-72 text-[10px] text-red-300">{error}</p>}
        </>
      )}
    </fieldset>
  );
}
