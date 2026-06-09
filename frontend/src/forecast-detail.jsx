import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { CircleDot, Shield, Sparkles } from "lucide-react";
import {
  getStoredReadingForm,
  getStoredReadingResult,
  getStoredReadingResultAsync,
  storeReadingResult,
} from "./reading-storage.js";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const SCORE_KEYS = [
  { key: "general", label: "全般・健康", color: "#e9c349" },
  { key: "work", label: "仕事", color: "#d3bcf9" },
  { key: "love", label: "恋愛・対人", color: "#ffb4ab" },
  { key: "money", label: "お金", color: "#c3c6d7" },
];
const CHART = { width: 920, height: 360, left: 34, right: 18, top: 34, bottom: 42 };
const PLANET_LABELS = {
  SUN: "太陽",
  MOON: "月",
  MERCURY: "水星",
  VENUS: "金星",
  MARS: "火星",
  JUPITER: "木星",
  SATURN: "土星",
  URANUS: "天王星",
  NEPTUNE: "海王星",
  PLUTO: "冥王星",
  ASC: "ASC",
  MC: "MC",
};

function cx(...values) {
  return values.filter(Boolean).join(" ");
}

function resolveApiBaseUrl() {
  const configured = String(typeof __APP_API_BASE_URL__ === "undefined" ? "" : __APP_API_BASE_URL__ || "").trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  try {
    const params = new URL(window.location.href).searchParams;
    const requested = String(params.get("api_base") || "").trim();
    if (requested) {
      window.localStorage?.setItem("celestial_api_base_url", requested);
      return requested.replace(/\/$/, "");
    }
    const stored = String(window.localStorage?.getItem("celestial_api_base_url") || "").trim();
    if (stored) {
      return stored.replace(/\/$/, "");
    }
  } catch {
    // Ignore local developer override failures and fall back to the default endpoint.
  }
  if (["localhost", "127.0.0.1"].includes(window.location.hostname) && /^517\d$/.test(window.location.port)) {
    return "http://127.0.0.1:8000";
  }
  return window.location.origin.replace(/\/$/, "");
}

async function postJson(path, payload) {
  const apiBaseUrl = resolveApiBaseUrl();
  const response = await requestJson(`${apiBaseUrl}${path}`, payload);
  if (!response.ok) {
    const errorPayload = response.data || {};
    throw new Error(formatApiError(errorPayload.detail, `Request failed: ${response.status}`));
  }
  return response.data;
}

async function reloadCsvMasters() {
  const response = await requestJson(`${resolveApiBaseUrl()}/api/dev/reload-csv`);
  if (!response.ok) {
    const errorPayload = response.data || {};
    throw new Error(formatApiError(errorPayload.detail, `CSV reload failed: ${response.status}`));
  }
  return response.data;
}

function formatApiError(detail, fallback) {
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => {
      if (typeof item === "string") return item;
      const location = Array.isArray(item?.loc) ? item.loc.join(".") : "";
      const message = item?.msg || JSON.stringify(item);
      return location ? `${location}: ${message}` : message;
    }).join(" / ");
  }
  try {
    return JSON.stringify(detail);
  } catch {
    return fallback;
  }
}

async function requestJson(url, payload) {
  const body = payload === undefined ? undefined : JSON.stringify(payload);
  if (typeof globalThis.fetch === "function") {
    const response = await globalThis.fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    return {
      ok: response.ok,
      status: response.status,
      data: await response.json().catch(() => ({})),
    };
  }
  if (typeof globalThis.XMLHttpRequest !== "function") {
    throw new Error("このブラウザ環境でAPI通信機能が利用できません。");
  }
  return new Promise((resolve, reject) => {
    const request = new globalThis.XMLHttpRequest();
    request.open("POST", url, true);
    request.setRequestHeader("Content-Type", "application/json");
    request.onload = () => {
      let data = {};
      try {
        data = request.responseText ? JSON.parse(request.responseText) : {};
      } catch {
        data = {};
      }
      resolve({
        ok: request.status >= 200 && request.status < 300,
        status: request.status,
        data,
      });
    };
    request.onerror = () => reject(new Error("API通信に失敗しました。"));
    request.send(body);
  });
}

function shouldForceRefresh() {
  try {
    const url = new URL(window.location.href);
    return url.searchParams.get("refresh") === "1";
  } catch {
    return false;
  }
}

function getQueryReadingForm() {
  try {
    const params = new URL(window.location.href).searchParams;
    const birthDate = params.get("birth_date");
    const birthTime = params.get("birth_time");
    const latitude = Number(params.get("latitude"));
    const longitude = Number(params.get("longitude"));
    if (!birthDate || !birthTime || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }
    return {
      full_name: params.get("full_name") || "Test User",
      birth_date: birthDate,
      birth_time: birthTime,
      birth_time_unknown: false,
      birthplace: params.get("birthplace") || "指定地点",
      latitude,
      longitude,
      timezone_offset: Number(params.get("timezone_offset") || 9),
      timezone_name: params.get("timezone_name") || "Asia/Tokyo",
    };
  } catch {
    return null;
  }
}

function getForecast() {
  if (shouldForceRefresh()) {
    return null;
  }
  const payload = getStoredReadingResult();
  return payload?.yearly_forecast || payload?.yearlyForecast || null;
}

function forecastYear(forecast) {
  const fromCache = Number(forecast?.cache?.year);
  if (Number.isFinite(fromCache)) {
    return fromCache;
  }
  const firstDate = String(forecast?.yearly_data?.[0]?.date || forecast?.reading_date || "");
  const parsed = Number.parseInt(firstDate.slice(0, 4), 10);
  return Number.isFinite(parsed) ? parsed : 2026;
}

function readableErrorMessage(error, fallback) {
  const message = error?.message || error;
  if (!message) return fallback;
  if (typeof message === "string") return message;
  try {
    return JSON.stringify(message);
  } catch {
    return fallback;
  }
}

function planetLabel(value) {
  const key = String(value || "").trim().toUpperCase();
  return PLANET_LABELS[key] || value || "";
}

function dateKey(value) {
  const match = String(value || "").match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!match) return "";
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function addDays(value, days) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatShortDate(value) {
  const normalized = dateKey(value);
  if (!normalized) return value || "";
  const [, month, day] = normalized.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function formatShortPeriod(startDate, endDate) {
  const start = formatShortDate(startDate);
  const end = formatShortDate(endDate);
  return start === end ? start : `${start}-${end}`;
}

function transitAspectItemsFromForecast(forecast, transitPlanetName, annualKeys, dayKeys) {
  const transitPlanetFilter = String(transitPlanetName || "").trim().toUpperCase();
  const annualAspects = annualKeys.reduce((items, key) => {
    if (items.length) return items;
    const value = forecast?.[key];
    return Array.isArray(value) ? value : [];
  }, []);
  const yearlyData = Array.isArray(forecast?.yearly_data)
    ? forecast.yearly_data
    : Array.isArray(forecast?.yearlyData)
      ? forecast.yearlyData
      : [];
  const rawItems = [];
  annualAspects.forEach((event) => {
    const date = dateKey(event?.date);
    const transitPlanet = String(event?.t_planet || event?.transit_planet || "").trim().toUpperCase();
    const natalPlanet = String(event?.n_planet || event?.natal_planet || "").trim().toUpperCase();
    const angle = event?.aspect_angle ?? event?.angle ?? event?.exact_angle;
    if (!date || transitPlanet !== transitPlanetFilter || !natalPlanet || angle === null || angle === undefined || angle === "") return;
    const numericAngle = Number(angle);
    const angleLabel = Number.isFinite(numericAngle) ? numericAngle : angle;
    rawItems.push({
      date,
      key: `${natalPlanet}-${transitPlanet}-${angleLabel}`,
      label: `ネイタル${planetLabel(natalPlanet)} × トランジット${planetLabel(transitPlanet)} ${angleLabel}°`,
      title: event?.title || "",
      description: event?.description || "",
      advisedTask: event?.advised_task || event?.advisedTask || "",
    });
  });
  yearlyData.forEach((day) => {
    const date = dateKey(day?.date);
    if (!date) return;
    const events = annualAspects.length
      ? []
      : dayKeys.reduce((items, key) => {
          const value = day?.[key];
          return Array.isArray(value) ? [...items, ...value] : items;
        }, []);
    events.forEach((event) => {
      const transitPlanet = String(event?.t_planet || event?.transit_planet || "").trim().toUpperCase();
      const natalPlanet = String(event?.n_planet || event?.natal_planet || "").trim().toUpperCase();
      const angle = event?.aspect_angle ?? event?.angle ?? event?.exact_angle;
      if (transitPlanet !== transitPlanetFilter || !natalPlanet || angle === null || angle === undefined || angle === "") return;
      const numericAngle = Number(angle);
      const angleLabel = Number.isFinite(numericAngle) ? numericAngle : angle;
      const label = `ネイタル${planetLabel(natalPlanet)} × トランジット${planetLabel(transitPlanet)} ${angleLabel}°`;
      rawItems.push({
        date,
        key: `${natalPlanet}-${transitPlanet}-${angleLabel}`,
        label,
        title: event?.title || "",
        description: event?.description || "",
        advisedTask: event?.advised_task || event?.advisedTask || "",
      });
    });
  });

  const byAspect = new Map();
  rawItems.forEach((item) => {
    const aspect = byAspect.get(item.key) || {
      key: item.key,
      label: item.label,
      byDate: new Map(),
    };
    const existing = aspect.byDate.get(item.date);
    if (!existing || (!existing.description && item.description)) {
      aspect.byDate.set(item.date, item);
    }
    byAspect.set(item.key, aspect);
  });
  const grouped = [];
  byAspect.forEach((aspect) => {
    Array.from(aspect.byDate.keys()).sort().forEach((date) => {
      const item = aspect.byDate.get(date);
      const previous = grouped[grouped.length - 1];
      if (
        previous
        && previous.key === item.key
        && addDays(previous.endDate, 1) === date
      ) {
        previous.endDate = date;
        if (!previous.title && item.title) previous.title = item.title;
        if (!previous.description && item.description) previous.description = item.description;
        if (!previous.advisedTask && item.advisedTask) previous.advisedTask = item.advisedTask;
        return;
      }
      grouped.push({
        key: item.key,
        label: item.label,
        title: item.title,
        description: item.description,
        advisedTask: item.advisedTask,
        startDate: date,
        endDate: date,
      });
    });
  });

  return grouped.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.key.localeCompare(b.key));
}

function jupiterAspectItemsFromForecast(forecast) {
  return transitAspectItemsFromForecast(
    forecast,
    "JUPITER",
    ["annual_jupiter_aspects", "annualJupiterAspects"],
    ["jupiter_aspects", "jupiterAspects", "events"],
  );
}

function saturnAspectItemsFromForecast(forecast) {
  return transitAspectItemsFromForecast(
    forecast,
    "SATURN",
    ["annual_saturn_aspects", "annualSaturnAspects"],
    ["saturn_aspects", "saturnAspects", "events"],
  );
}

function sunAspectItemsFromForecast(forecast) {
  return transitAspectItemsFromForecast(
    forecast,
    "SUN",
    ["annual_sun_aspects", "annualSunAspects"],
    ["sun_aspects", "sunAspects", "events"],
  );
}

function marsAspectItemsFromForecast(forecast) {
  return transitAspectItemsFromForecast(
    forecast,
    "MARS",
    ["annual_mars_aspects", "annualMarsAspects"],
    ["mars_aspects", "marsAspects", "events"],
  );
}

function demoForecast() {
  const monthScores = {
    general: [45, 12, 88, 34, -15, 62, 41, 94, 20, -30, 5, 18],
    work: [22, -8, 56, 78, 44, -21, 89, 67, 32, 12, -10, 55],
    love: [-12, 34, 92, 45, 12, 56, 22, 98, -5, -40, 63, 77],
    money: [30, 45, -18, 12, 88, 56, -5, 33, 91, 22, 45, -22],
  };
  const yearly_data = Array.from({ length: 12 }, (_, index) => ({
    date: `2026-${String(index + 1).padStart(2, "0")}-15`,
    scores: {
      total: Math.round(
        (monthScores.general[index] + monthScores.work[index] + monthScores.love[index] + monthScores.money[index]) / 4
      ),
      general: monthScores.general[index],
      work: monthScores.work[index],
      love: monthScores.love[index],
      money: monthScores.money[index],
    },
    text_description: "年間の流れを確認し、強まるテーマに合わせて行動の優先順位を整えます。",
  }));
  return {
    summary: "2026年の運勢推移を、主要カテゴリごとのスコア変化として可視化します。",
    reading_date: "2026-05-20",
    yearly_data,
    milestones: [
      { date: "2026-03-15", title: "成長テーマの加速", score: 88 },
      { date: "2026-08-15", title: "年間ピーク", score: 94 },
      { date: "2026-10-15", title: "見直しの谷", score: -30 },
    ],
  };
}

function scoreFor(day, key) {
  return Number(day?.scores?.[key] ?? 0);
}

function formatScore(value) {
  const score = Math.round(Number(value) || 0);
  if (score > 0) return `+${score}`;
  if (score === 0) return "±0";
  return String(score);
}

function formatThemeDate(value) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value || "-";
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function summaryDurationDays(item) {
  const start = new Date(`${item?.startRaw || ""}T00:00:00`);
  const end = new Date(`${item?.endRaw || ""}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 30;
  }
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
}

function summaryTimelineHeight(item) {
  const days = summaryDurationDays(item);
  return { minHeight: `${Math.min(560, Math.max(112, days * 3))}px` };
}

function parseLocalDate(value) {
  const date = new Date(`${value || ""}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function summaryTimelineDayOffset(item, year) {
  const start = parseLocalDate(item?.startRaw);
  if (!start) return 0;
  const yearStart = new Date(`${year}-01-01T00:00:00`);
  return clamp(Math.round((start.getTime() - yearStart.getTime()) / 86400000), 0, 365);
}

function summaryTextHeightEstimate(item, viewportWidth = 1024) {
  const textLength = String(`${item?.label || ""}${item?.title || ""}${item?.body || ""}`).length;
  if (viewportWidth < 640) {
    return 48 + Math.ceil(textLength / 15) * 20;
  }
  const columnWidth = Math.max(240, (viewportWidth - 100) / 2);
  const charsPerLine = Math.max(28, Math.floor(columnWidth / 13));
  return 52 + Math.ceil(textLength / charsPerLine) * 28;
}

function summaryTimelineScale(items, viewportWidth) {
  return Math.max(
    10,
    ...items.map((item) => Math.ceil(summaryTextHeightEstimate(item, viewportWidth) / summaryDurationDays(item)))
  );
}

function summaryTimelineLayout(items, year, pxPerDay, viewportWidth) {
  let previousBottom = 0;
  const gap = viewportWidth < 640 ? 18 : 24;
  const maxGap = viewportWidth < 640 ? 34 : 56;
  const laidOutItems = items.map((item, index) => {
    const startOffset = summaryTimelineDayOffset(item, year);
    const textHeight = summaryTextHeightEstimate(item, viewportWidth);
    const rawTop = startOffset * pxPerDay;
    const top = index === 0
      ? rawTop
      : Math.max(previousBottom + gap, Math.min(rawTop, previousBottom + maxGap));
    previousBottom = top + textHeight;
    return {
      item,
      startOffset,
      textHeight,
      top,
      style: {
        top: `${top}px`,
      },
    };
  });
  return {
    items: laidOutItems,
    style: { minHeight: `${Math.max(366 * pxPerDay, previousBottom)}px` },
  };
}

function summaryTimelineLayoutsByColumn(columns, year, pxPerDay, viewportWidth) {
  const gap = viewportWidth < 640 ? 18 : 24;
  const dateStep = viewportWidth < 640 ? 16 : 28;
  const layouts = Object.fromEntries(
    Object.entries(columns).map(([key, items]) => [key, summaryTimelineLayout(items, year, pxPerDay, viewportWidth)])
  );
  const entries = Object.entries(layouts).flatMap(([columnKey, layout]) =>
    layout.items.map((entry) => ({ ...entry, columnKey }))
  ).sort((a, b) => a.startOffset - b.startOffset || a.columnKey.localeCompare(b.columnKey));
  const previousBottomByColumn = {};
  let previousStartOffset = null;
  let previousStartTop = 0;

  entries.forEach((entry) => {
    if (previousStartOffset === null) {
      previousStartOffset = entry.startOffset;
      previousStartTop = entry.top;
    } else if (entry.startOffset > previousStartOffset) {
      previousStartOffset = entry.startOffset;
      previousStartTop += dateStep;
    }
    const columnBottom = previousBottomByColumn[entry.columnKey] ?? -gap;
    const top = Math.max(entry.top, previousStartTop, columnBottom + gap);
    entry.top = top;
    previousStartTop = Math.max(previousStartTop, top);
    previousBottomByColumn[entry.columnKey] = top + entry.textHeight;
  });

  Object.entries(layouts).forEach(([columnKey, layout]) => {
    let columnBottom = 0;
    layout.items = layout.items.map((entry) => {
      const aligned = entries.find((candidate) => candidate.columnKey === columnKey && candidate.item === entry.item) || entry;
      columnBottom = Math.max(columnBottom, aligned.top + aligned.textHeight);
      return {
        item: aligned.item,
        style: {
          top: `${aligned.top}px`,
        },
      };
    });
    layout.style = { minHeight: `${Math.max(366 * pxPerDay, columnBottom)}px` };
  });

  return layouts;
}

function useViewportWidth() {
  const [width, setWidth] = useState(() => (typeof window === "undefined" ? 1024 : window.innerWidth));
  useEffect(() => {
    const updateWidth = () => setWidth(window.innerWidth);
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);
  return width;
}

function preserveThemeLineBreaks(value) {
  return String(value || "")
    .replaceAll("\\r\\n", "\n")
    .replaceAll("\\n", "\n")
    .replace(/\r\n?/g, "\n");
}

function splitCombinedSummaryTitle(value) {
  const text = preserveThemeLineBreaks(value || "作成中");
  const separatorIndex = text.indexOf("と");
  if (separatorIndex < 0) {
    return [text, "作成中"];
  }
  return [text.slice(0, separatorIndex), text.slice(separatorIndex + 1)];
}

function splitCombinedSummaryText(value) {
  const text = preserveThemeLineBreaks(value || "作成中");
  const separatorIndex = text.indexOf("\n");
  if (separatorIndex < 0) {
    return [text, "作成中"];
  }
  return [text.slice(0, separatorIndex), text.slice(separatorIndex + 1)];
}

function interpretationText(...values) {
  const value = values.find((item) => {
    const text = preserveThemeLineBreaks(item || "").trim();
    return text && text !== "----";
  });
  return preserveThemeLineBreaks(value || "作成中");
}

function themeItemsFromForecast(forecast) {
  const themes = Array.isArray(forecast?.annual_themes)
    ? forecast.annual_themes
    : Array.isArray(forecast?.annualThemes)
      ? forecast.annualThemes
      : [];
  const colors = ["#e9c349", "#d3bcf9", "#ffb4ab", "#c3c6d7"];
  return themes.map((theme, index) => {
    const startRaw = theme.start_date || theme.startDate;
    const endRaw = theme.end_date || theme.endDate;
    const period = `${formatThemeDate(theme.start_date || theme.startDate)}-${formatThemeDate(theme.end_date || theme.endDate)}`;
    const summary = interpretationText(theme.monthly_summary, theme.monthlySummary, theme.annual_summary, theme.annualSummary);
    return {
      color: colors[index % colors.length],
      startRaw,
      endRaw,
      title: summary,
      label: `${period}: ${summary}`,
      body: interpretationText(theme.monthly_interpretation, theme.monthlyInterpretation, theme.annual_interpretation, theme.annualInterpretation),
    };
  });
}

function lessonItemsFromForecast(forecast) {
  const lessons = Array.isArray(forecast?.annual_lessons)
    ? forecast.annual_lessons
    : Array.isArray(forecast?.annualLessons)
      ? forecast.annualLessons
      : [];
  const colors = ["#e9c349", "#d3bcf9", "#ffb4ab", "#c3c6d7"];
  return lessons.map((lesson, index) => {
    const startRaw = lesson.start_date || lesson.startDate;
    const endRaw = lesson.end_date || lesson.endDate;
    const period = `${formatThemeDate(lesson.start_date || lesson.startDate)}-${formatThemeDate(lesson.end_date || lesson.endDate)}`;
    const summary = interpretationText(lesson.monthly_summary, lesson.monthlySummary, lesson.annual_summary, lesson.annualSummary);
    return {
      color: colors[index % colors.length],
      startRaw,
      endRaw,
      title: summary,
      label: `${period}: ${summary}`,
      body: interpretationText(lesson.monthly_interpretation, lesson.monthlyInterpretation, lesson.annual_interpretation, lesson.annualInterpretation),
    };
  });
}

function monthlyThemeItemsFromForecast(forecast, key) {
  const source = Array.isArray(forecast?.[key]) ? forecast[key] : [];
  const colors = ["#e9c349", "#d3bcf9", "#ffb4ab", "#c3c6d7"];
  return source.map((theme, index) => {
    const startRaw = theme.start_date || theme.startDate;
    const endRaw = theme.end_date || theme.endDate;
    const period = `${formatThemeDate(startRaw)}-${formatThemeDate(endRaw)}`;
    const summary = interpretationText(theme.monthly_summary, theme.monthlySummary);
    return {
      color: colors[index % colors.length],
      startRaw,
      endRaw,
      title: summary,
      label: `${period}: ${summary}`,
      body: interpretationText(theme.monthly_interpretation, theme.monthlyInterpretation),
    };
  });
}

function mergeConsecutiveSummaryItems(items) {
  return items.reduce((merged, item) => {
    const previous = merged[merged.length - 1];
    if (previous && previous.title === item.title && previous.body === item.body) {
      previous.endDate = item.endDate;
      previous.endRaw = item.endRaw;
      previous.label = `${previous.startDate}-${item.endDate}`;
      return merged;
    }
    merged.push({ ...item });
    return merged;
  }, []);
}

function summaryItemsFromForecast(forecast) {
  const columns = forecast?.annual_summary_columns || forecast?.annualSummaryColumns || null;
  const columnColors = ["#e9c349", "#d3bcf9", "#ffb4ab", "#c3c6d7"];
  if (columns) {
    const formatColumnItem = (item, index) => {
      const startRaw = item.start_date || item.startDate;
      const endRaw = item.end_date || item.endDate;
      const startDate = formatThemeDate(startRaw);
      const endDate = formatThemeDate(endRaw);
      return {
        color: columnColors[index % columnColors.length],
        label: `${startDate}-${endDate}`,
        startDate,
        endDate,
        startRaw,
        endRaw,
        title: preserveThemeLineBreaks(item.title || "作成中"),
        body: preserveThemeLineBreaks(item.text || item.body || "作成中"),
      };
    };
    const environment = Array.isArray(columns.environment) ? columns.environment : [];
    const mental = Array.isArray(columns.mental) ? columns.mental : [];
    return {
      environment: mergeConsecutiveSummaryItems(environment.map(formatColumnItem)),
      mental: mergeConsecutiveSummaryItems(mental.map(formatColumnItem)),
    };
  }

  const summaries = Array.isArray(forecast?.annual_summaries)
    ? forecast.annual_summaries
    : Array.isArray(forecast?.annualSummaries)
      ? forecast.annualSummaries
      : [];
  const colors = ["#e9c349", "#d3bcf9", "#ffb4ab", "#c3c6d7"];
  const environment = [];
  const mental = [];
  summaries.forEach((summary, index) => {
    const startRaw = summary.start_date || summary.startDate;
    const endRaw = summary.end_date || summary.endDate;
    const startDate = formatThemeDate(startRaw);
    const endDate = formatThemeDate(endRaw);
    const period = `${startDate}-${endDate}`;
    const environmentChange = summary.environment_change || summary.environmentChange || {};
    const mentalChange = summary.mental_change || summary.mentalChange || {};
    const fallbackBodyParts = splitCombinedSummaryText(summary.annual_interpretation || summary.annualInterpretation);
    const fallbackTitleParts = splitCombinedSummaryTitle(summary.annual_summary || summary.annualSummary);
    environment.push({
      color: colors[index % colors.length],
      label: period,
      startDate,
      endDate,
      startRaw,
      endRaw,
      title: preserveThemeLineBreaks(environmentChange.title || fallbackTitleParts[0] || "作成中"),
      body: preserveThemeLineBreaks(environmentChange.text || environmentChange.body || fallbackBodyParts[0] || "作成中"),
    });
    mental.push({
      color: colors[index % colors.length],
      label: period,
      startDate,
      endDate,
      startRaw,
      endRaw,
      title: preserveThemeLineBreaks(mentalChange.title || fallbackTitleParts[1] || "作成中"),
      body: preserveThemeLineBreaks(mentalChange.text || mentalChange.body || fallbackBodyParts[1] || "作成中"),
    });
  });
  return {
    environment: mergeConsecutiveSummaryItems(environment),
    mental: mergeConsecutiveSummaryItems(mental),
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function monthIndex(dateValue) {
  const month = Number(String(dateValue || "").slice(5, 7));
  return Number.isFinite(month) && month >= 1 && month <= 12 ? month - 1 : 0;
}

function workdayMonthIndex() {
  const month = new Date().getMonth();
  return Number.isFinite(month) ? clamp(month, 0, 11) : 0;
}

function monthBounds(year, index) {
  const start = new Date(`${year}-${String(index + 1).padStart(2, "0")}-01T00:00:00`);
  const end = new Date(year, index + 1, 0);
  return { start, end };
}

function itemOverlapsMonth(item, year, index) {
  const start = parseLocalDate(item?.startRaw || item?.startDate);
  const end = parseLocalDate(item?.endRaw || item?.endDate);
  if (!start || !end) return true;
  const bounds = monthBounds(year, index);
  return start <= bounds.end && end >= bounds.start;
}

function monthlyItems(items, year, index) {
  return items.filter((item) => itemOverlapsMonth(item, year, index));
}

function monthlyData(forecast, useDemoFallback = true) {
  const source = Array.isArray(forecast?.yearly_data) ? forecast.yearly_data : [];
  if (!source.length) return useDemoFallback ? demoForecast().yearly_data : [];
  return Array.from({ length: 12 }, (_, index) => {
    const items = source.filter((day) => monthIndex(day.date) === index);
    if (!items.length) {
      return {
        date: `2026-${String(index + 1).padStart(2, "0")}-01`,
        scores: { total: 0, general: 0, work: 0, love: 0, money: 0 },
        text_description: "",
      };
    }
    const scores = {};
    ["total", ...SCORE_KEYS.map((item) => item.key)].forEach((key) => {
      const values = items.map((day) => scoreFor(day, key)).filter((value) => Number.isFinite(value));
      scores[key] = values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
    });
    return {
      ...items[Math.floor(items.length / 2)],
      scores,
    };
  });
}

function dailyDataForMonth(forecast, year, index) {
  const source = Array.isArray(forecast?.yearly_data) ? forecast.yearly_data : [];
  const items = source.filter((day) => monthIndex(day.date) === index);
  if (items.length) return items;
  const daysInMonth = new Date(year, index + 1, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, dayIndex) => ({
    date: `${year}-${String(index + 1).padStart(2, "0")}-${String(dayIndex + 1).padStart(2, "0")}`,
    scores: { total: 0, general: 0, work: 0, love: 0, money: 0 },
    text_description: "",
  }));
}

function chartX(index, count) {
  if (count <= 1) return CHART.left;
  return CHART.left + (index / (count - 1)) * (CHART.width - CHART.left - CHART.right);
}

function chartY(value) {
  const clamped = clamp(Number(value) || 0, -100, 100);
  return CHART.top + ((100 - clamped) / 200) * (CHART.height - CHART.top - CHART.bottom);
}

function nearestMonthIndexFromPointer(event, count) {
  const rect = event.currentTarget.ownerSVGElement
    ? event.currentTarget.ownerSVGElement.getBoundingClientRect()
    : event.currentTarget.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * CHART.width;
  const ratio = (x - CHART.left) / (CHART.width - CHART.left - CHART.right);
  return clamp(Math.round(ratio * (count - 1)), 0, count - 1);
}

function smoothPath(points) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  const commands = [`M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`];
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const controlX = (current.x + next.x) / 2;
    commands.push(
      `C ${controlX.toFixed(1)} ${current.y.toFixed(1)}, ${controlX.toFixed(1)} ${next.y.toFixed(1)}, ${next.x.toFixed(1)} ${next.y.toFixed(1)}`
    );
  }
  return commands.join(" ");
}

function aggregateStats(data) {
  if (!data.length) {
    return {
      peak: null,
      low: null,
      strongest: SCORE_KEYS[0],
      stability: 0,
    };
  }
  const totals = data.map((day) => scoreFor(day, "total"));
  const peakIndex = totals.reduce((best, score, index) => (score > totals[best] ? index : best), 0);
  const lowIndex = totals.reduce((best, score, index) => (score < totals[best] ? index : best), 0);
  const categoryAverages = SCORE_KEYS.map((item) => {
    const average = Math.round(data.reduce((sum, day) => sum + scoreFor(day, item.key), 0) / data.length);
    return { ...item, average };
  });
  const strongest = categoryAverages.reduce((best, item) => (item.average > best.average ? item : best), categoryAverages[0]);
  return {
    peak: data[peakIndex],
    low: data[lowIndex],
    strongest,
    stability: Math.round(100 - Math.min(70, Math.abs(scoreFor(data[peakIndex], "total") - scoreFor(data[lowIndex], "total")) / 2)),
  };
}

function GlassPanel({ children, className = "" }) {
  return (
    <section className={cx(
      "rounded-2xl border border-white/10 bg-[#1a1c1c]/62 shadow-[0_24px_80px_rgba(0,0,0,0.32)] backdrop-blur-xl",
      "min-w-0",
      className
    )}>
      {children}
    </section>
  );
}

function Header({ activeYear, activeView, setActiveView }) {
  const navItems = [
    ["annual", "年間予測"],
    ["monthly", "月間予測"],
    ["daily", "日別詳細"],
  ];
  const forecastLabel = activeView === "monthly" ? "月間予測" : "年間予測";
  return (
    <header className="fixed left-0 top-0 z-40 w-full border-b border-white/10 bg-[#0d0e0f]/92 backdrop-blur-xl">
      <div className="flex w-full max-w-none flex-wrap items-center justify-between gap-3 px-4 py-4 sm:gap-6 sm:px-8 sm:py-6 lg:mx-auto lg:max-w-[1760px]">
        <div className="flex min-w-0 items-center gap-4 sm:gap-8">
          <a href="/results.html" className="max-w-[150px] font-serif text-[22px] font-bold leading-[0.98] text-gold sm:max-w-none sm:text-4xl sm:leading-none">The Celestial Atelier</a>
          <span className="hidden h-10 w-px bg-white/20 md:block" />
          <h1 className="truncate font-serif text-lg font-semibold tracking-[0.04em] text-starlight sm:text-2xl md:text-3xl">
            {activeYear}年 {forecastLabel}
          </h1>
        </div>
        <nav className="order-last flex w-full items-center gap-7 overflow-x-auto border-t border-white/10 pt-3 font-mono text-[10px] font-bold tracking-[0.1em] text-mist [scrollbar-width:none] sm:text-xs lg:order-none lg:w-auto lg:gap-10 lg:border-t-0 lg:pt-0 lg:tracking-[0.12em]">
          {navItems.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => value !== "daily" && setActiveView(value)}
              className={cx(
                "pb-3 transition",
                activeView === value ? "border-b-2 border-gold text-gold" : "hover:text-starlight",
                value === "daily" && "cursor-default opacity-45 hover:text-mist"
              )}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}

function OraclePanel({ stats, forecast }) {
  const [analysisMode, setAnalysisMode] = useState("theme");
  const [openTransitAspectKeys, setOpenTransitAspectKeys] = useState(() => new Set());
  const themeItems = themeItemsFromForecast(forecast);
  const lessonItems = lessonItemsFromForecast(forecast);
  const summaryColumns = summaryItemsFromForecast(forecast);
  const jupiterAspectItems = jupiterAspectItemsFromForecast(forecast);
  const saturnAspectItems = saturnAspectItemsFromForecast(forecast);
  const analysisTitle = {
    theme: "幸運拡大",
    lesson: "成長課題",
    summary: "総括",
    test1: "test1",
    test2: "test2",
  }[analysisMode] || "幸運拡大";
  const fallbackThemeItems = [
    { color: "#e9c349", label: "THEME 01", body: "作成中" },
    { color: "#d3bcf9", label: "THEME 02", body: "作成中" },
    { color: "#ffb4ab", label: "THEME 03", body: "作成中" },
  ];
  const fallbackSummaryColumns = {
    environment: [{ color: "#e9c349", label: "1/1-12/31", startRaw: "2026-01-01", endRaw: "2026-12-31", title: "環境変化", body: "作成中" }],
    mental: [{ color: "#e9c349", label: "1/1-12/31", startRaw: "2026-01-01", endRaw: "2026-12-31", title: "精神的変化", body: "作成中" }],
  };
  const viewportWidth = useViewportWidth();
  const activeYear = forecastYear(forecast);
  const summaryEnvironmentItems = summaryColumns.environment.length ? summaryColumns.environment : fallbackSummaryColumns.environment;
  const summaryMentalItems = summaryColumns.mental.length ? summaryColumns.mental : fallbackSummaryColumns.mental;
  const summaryScale = summaryTimelineScale([...summaryEnvironmentItems, ...summaryMentalItems], viewportWidth);
  const summaryLayouts = summaryTimelineLayoutsByColumn({
    environment: summaryEnvironmentItems,
    mental: summaryMentalItems,
  }, activeYear, summaryScale, viewportWidth);
  const toggleTransitAspect = (key) => {
    setOpenTransitAspectKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };
  return (
    <div className="h-full">
      <GlassPanel className="flex h-[520px] flex-col overflow-hidden p-2 sm:h-[560px] sm:p-5 lg:h-[620px] lg:p-6">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-mono text-[8px] font-bold uppercase tracking-[0.18em] text-gold/75 sm:text-[9px]">
              Main Theme
            </p>
            <h2 className="mt-1 font-serif text-2xl font-semibold text-starlight sm:text-3xl">
              {analysisTitle}
            </h2>
          </div>
          <div className="flex w-full overflow-x-auto rounded-full border border-white/10 bg-white/[0.04] p-1 font-mono text-[7px] font-bold text-mist [scrollbar-width:none] sm:w-auto sm:shrink-0 sm:text-[10px]">
            {[ 
              ["theme", "幸運拡大"],
              ["lesson", "成長課題"],
              ["summary", "総括"],
              ["test1", "test1"],
              ["test2", "test2"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setAnalysisMode(value)}
                className={cx(
                  "shrink-0 rounded-full px-2 py-1.5 transition sm:px-3",
                  analysisMode === value ? "bg-gold text-[#241a00]" : "hover:bg-white/10 hover:text-starlight"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 h-px bg-white/10 sm:mt-5" />
        {analysisMode === "theme" ? (
          <div className="mt-6 grid min-h-0 flex-1 gap-6 overflow-y-auto pr-2 [scrollbar-color:#e9c349_rgba(255,255,255,0.08)] [scrollbar-width:thin] sm:mt-8 sm:gap-8">
            {(themeItems.length ? themeItems : fallbackThemeItems).map((item) => (
              <article key={item.label} className="relative pl-8">
                <span className="absolute left-0 top-1.5 h-3 w-3 rounded-full shadow-[0_0_18px_currentColor]" style={{ color: item.color, backgroundColor: item.color }} />
                <span className="absolute left-[5px] top-5 h-full w-px bg-white/15" />
                <p className="font-mono text-xs font-bold uppercase tracking-[0.12em]" style={{ color: item.color }}>
                  {item.label}
                </p>
                <p className="mt-3 whitespace-pre-line text-sm leading-7 text-mist sm:text-base sm:leading-8">{item.body}</p>
              </article>
            ))}
          </div>
        ) : null}
        {analysisMode === "lesson" ? (
          <div className="mt-6 grid min-h-0 flex-1 gap-6 overflow-y-auto pr-2 [scrollbar-color:#e9c349_rgba(255,255,255,0.08)] [scrollbar-width:thin] sm:mt-8 sm:gap-8">
            {(lessonItems.length ? lessonItems : fallbackThemeItems).map((item) => (
              <article key={`lesson-${item.label}`} className="relative pl-8">
                <span className="absolute left-0 top-1.5 h-3 w-3 rounded-full shadow-[0_0_18px_currentColor]" style={{ color: item.color, backgroundColor: item.color }} />
                <span className="absolute left-[5px] top-5 h-full w-px bg-white/15" />
                <p className="font-mono text-xs font-bold uppercase tracking-[0.12em]" style={{ color: item.color }}>
                  {item.label}
                </p>
                <p className="mt-3 whitespace-pre-line text-sm leading-7 text-mist sm:text-base sm:leading-8">{item.body}</p>
              </article>
            ))}
          </div>
        ) : null}
        {analysisMode === "summary" ? (
          <div className="mt-3 grid min-h-0 flex-1 gap-2 overflow-y-auto [scrollbar-color:#e9c349_rgba(255,255,255,0.08)] [scrollbar-width:thin] sm:mt-6 sm:gap-5 sm:pr-1 lg:gap-6">
            <div className="grid grid-cols-2 gap-1 pl-3 font-mono text-[10px] font-bold uppercase tracking-[0.05em] text-gold sm:gap-5 sm:pl-6 sm:text-xs sm:tracking-[0.1em] lg:gap-6">
              <p>環境変化</p>
              <p>精神的変化</p>
            </div>
            <div className="grid grid-cols-2 gap-1 sm:gap-5 lg:gap-6">
              {[
                ["environment", summaryLayouts.environment],
                ["mental", summaryLayouts.mental],
              ].map(([columnKey, layout]) => (
                <div key={columnKey} className="relative" style={layout.style}>
                  {layout.items.map(({ item, style }) => (
                    <article
                      key={`${columnKey}-${item.label}-${item.title}`}
                      className="absolute left-0 right-0 pl-3 sm:pl-6"
                      style={style}
                    >
                      <span className="absolute left-0 top-1 h-2 w-2 rounded-full shadow-[0_0_18px_currentColor] sm:top-1.5 sm:h-3 sm:w-3" style={{ color: item.color, backgroundColor: item.color }} />
                      <span className="absolute bottom-0 left-[3px] top-3.5 w-px bg-white/15 sm:left-[5px] sm:top-5" />
                      <p className="font-mono text-[9px] font-bold uppercase leading-4 tracking-[0.03em] sm:text-xs sm:leading-normal sm:tracking-[0.12em]" style={{ color: item.color }}>
                        {item.label}: {item.title || "作成中"}
                      </p>
                      <p className="mt-2 whitespace-pre-line text-[10px] leading-5 text-mist sm:mt-3 sm:text-sm sm:leading-7">{item.body || "作成中"}</p>
                    </article>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {analysisMode === "test1" ? (
          <div className="mt-6 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-2 [scrollbar-color:#e9c349_rgba(255,255,255,0.08)] [scrollbar-width:thin] sm:mt-8">
            {jupiterAspectItems.length ? (
              jupiterAspectItems.map((item) => {
                const itemKey = `jupiter-${item.key}-${item.startDate}`;
                const isOpen = openTransitAspectKeys.has(itemKey);
                return (
                <article key={`${item.key}-${item.startDate}`} className="shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]">
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-3 px-3 py-3 text-left sm:gap-4 sm:px-4"
                    aria-expanded={isOpen}
                    onClick={() => toggleTransitAspect(itemKey)}
                  >
                      <div className="min-w-0">
                        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-gold">
                          {formatShortPeriod(item.startDate, item.endDate)}
                        </p>
                        <p className="mt-2 text-xs font-semibold leading-5 text-mist sm:text-base sm:leading-6">{item.label}</p>
                      </div>
                      <span className={cx(
                        "mt-1 shrink-0 font-mono text-xs font-bold text-gold transition",
                        isOpen && "rotate-90"
                      )}>›</span>
                  </button>
                  {isOpen ? (
                    <div className="border-t border-white/10 px-3 pb-4 pt-3 sm:px-4">
                      <p className="whitespace-pre-line text-[11px] leading-6 text-mist sm:text-sm sm:leading-7">
                        {item.description || "解釈文がありません。"}
                      </p>
                    </div>
                  ) : null}
                </article>
                );
              })
            ) : (
              <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.035] p-6 font-mono text-xs font-bold uppercase tracking-[0.18em] text-mist">
                該当なし
              </div>
            )}
          </div>
        ) : null}
        {analysisMode === "test2" ? (
          <div className="mt-6 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-2 [scrollbar-color:#e9c349_rgba(255,255,255,0.08)] [scrollbar-width:thin] sm:mt-8">
            {saturnAspectItems.length ? (
              saturnAspectItems.map((item) => {
                const itemKey = `saturn-${item.key}-${item.startDate}`;
                const isOpen = openTransitAspectKeys.has(itemKey);
                return (
                <article key={`${item.key}-${item.startDate}`} className="shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]">
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-3 px-3 py-3 text-left sm:gap-4 sm:px-4"
                    aria-expanded={isOpen}
                    onClick={() => toggleTransitAspect(itemKey)}
                  >
                      <div className="min-w-0">
                        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-gold">
                          {formatShortPeriod(item.startDate, item.endDate)}
                        </p>
                        <p className="mt-2 text-xs font-semibold leading-5 text-mist sm:text-base sm:leading-6">{item.label}</p>
                      </div>
                      <span className={cx(
                        "mt-1 shrink-0 font-mono text-xs font-bold text-gold transition",
                        isOpen && "rotate-90"
                      )}>›</span>
                  </button>
                  {isOpen ? (
                    <div className="border-t border-white/10 px-3 pb-4 pt-3 sm:px-4">
                      <p className="whitespace-pre-line text-[11px] leading-6 text-mist sm:text-sm sm:leading-7">
                        {item.description || "解釈文がありません。"}
                      </p>
                    </div>
                  ) : null}
                </article>
                );
              })
            ) : (
              <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.035] p-6 font-mono text-xs font-bold uppercase tracking-[0.18em] text-mist">
                該当なし
              </div>
            )}
          </div>
        ) : null}
      </GlassPanel>
    </div>
  );
}

function AnnualChart({
  data,
  stats,
  selectedSeriesKey,
  setSelectedSeriesKey,
  selectedMonthIndex,
  setSelectedMonthIndex,
  activeYear,
  onOpenYearDialog,
}) {
  const selectedSeries = SCORE_KEYS.find((item) => item.key === selectedSeriesKey) || SCORE_KEYS[0];
  const selectedMonth = clamp(selectedMonthIndex, 0, data.length - 1);
  const selectedDay = data[selectedMonth] || data[0];
  const tooltipX = chartX(selectedMonth, data.length);
  const tooltipY = chartY(scoreFor(selectedDay, selectedSeries.key));
  const selectedPoints = data.map((day, index) => ({ x: chartX(index, data.length), y: chartY(scoreFor(day, selectedSeries.key)) }));
  const orderedSeries = [
    ...SCORE_KEYS.filter((item) => item.key !== selectedSeries.key),
    selectedSeries,
  ];
  const handleSeriesSelect = (event, key) => {
    setSelectedSeriesKey(key);
    setSelectedMonthIndex(nearestMonthIndexFromPointer(event, data.length));
  };
  return (
    <GlassPanel className="p-3 sm:p-8">
      <div className="flex flex-col gap-2 sm:gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <h2 className="font-serif text-[26px] font-bold leading-tight text-starlight sm:text-5xl">Annual Biorhythm {activeYear}</h2>
          <button
            type="button"
            onClick={onOpenYearDialog}
            className="inline-flex w-fit shrink-0 items-center justify-center rounded-full border border-gold/35 bg-gold/10 px-3 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-gold transition hover:border-gold/70 hover:bg-gold/20 sm:px-4 sm:py-2 sm:text-[10px] sm:tracking-[0.12em]"
          >
            他の年で計算する
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 font-mono text-[9px] font-bold tracking-[0.04em] text-mist sm:gap-5 sm:text-xs sm:tracking-[0.08em]">
          {SCORE_KEYS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setSelectedSeriesKey(item.key)}
              className={cx(
                "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 transition sm:gap-2 sm:px-2.5 sm:py-1",
                selectedSeries.key === item.key ? "border-white/20 bg-white/10 text-starlight" : "border-transparent hover:border-white/15 hover:bg-white/5"
              )}
            >
              <span className="h-2 w-2 rounded-full sm:h-3 sm:w-3" style={{ backgroundColor: item.color }} />
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <svg className="mt-2 h-[250px] w-full sm:mt-3 sm:h-[405px]" viewBox={`0 0 ${CHART.width} ${CHART.height}`} preserveAspectRatio="none" role="img" aria-label="年間運勢スコアグラフ">
        <defs>
          <linearGradient id="forecastGoldArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={selectedSeries.color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={selectedSeries.color} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {[75, 25, -25, -75].map((tick) => (
          <line key={tick} x1={CHART.left} x2={CHART.width - CHART.right} y1={chartY(tick)} y2={chartY(tick)} stroke="rgba(255,255,255,0.07)" />
        ))}
        <path
          d={`${smoothPath(selectedPoints)} L ${CHART.width - CHART.right} ${CHART.height - CHART.bottom} L ${CHART.left} ${CHART.height - CHART.bottom} Z`}
          fill="url(#forecastGoldArea)"
        />
        {orderedSeries.map((item) => (
          <path
            key={item.key}
            onClick={(event) => handleSeriesSelect(event, item.key)}
            d={smoothPath(data.map((day, index) => ({ x: chartX(index, data.length), y: chartY(scoreFor(day, item.key)) })))}
            fill="none"
            stroke={item.color}
            strokeWidth={selectedSeries.key === item.key ? 4.6 : 2.1}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={selectedSeries.key === item.key ? 1 : 0.48}
            filter={selectedSeries.key === item.key ? "drop-shadow(0 0 12px rgba(233,195,73,0.22))" : "none"}
            className="cursor-pointer transition-opacity"
          />
        ))}
        {orderedSeries.map((item) => (
          <path
            key={`${item.key}-hit`}
            onClick={(event) => handleSeriesSelect(event, item.key)}
            d={smoothPath(data.map((day, index) => ({ x: chartX(index, data.length), y: chartY(scoreFor(day, item.key)) })))}
            fill="none"
            stroke="transparent"
            strokeWidth="18"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="cursor-pointer"
          />
        ))}
        <line x1={tooltipX} x2={tooltipX} y1={CHART.top} y2={CHART.height - CHART.bottom} stroke={selectedSeries.color} strokeDasharray="4 5" opacity="0.55" />
        <circle cx={tooltipX} cy={tooltipY} r="6" fill={selectedSeries.color} />
        <foreignObject x={clamp(tooltipX + 12, CHART.left, CHART.width - 170)} y={clamp(tooltipY - 62, 20, CHART.height - 130)} width="150" height="96">
          <div
            className="rounded-lg bg-[#1a1c1c]/80 p-3 backdrop-blur"
            style={{
              border: `1px solid ${selectedSeries.color}66`,
              boxShadow: `0 0 22px ${selectedSeries.color}1f`,
            }}
          >
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: selectedSeries.color }}>{MONTHS[selectedMonth]}</p>
            <p className="mt-1 font-serif text-xl font-semibold text-starlight">{selectedSeries.label}</p>
            <p className="font-serif text-2xl text-starlight">{formatScore(scoreFor(selectedDay, selectedSeries.key))}</p>
          </div>
        </foreignObject>
        {MONTHS.map((month, index) => (
          <text key={month} x={chartX(index, data.length)} y={CHART.height - 8} textAnchor="middle" fill="#c7c6cc" fontSize="13" fontFamily="JetBrains Mono">
            {month}
          </text>
        ))}
      </svg>
    </GlassPanel>
  );
}

function MonthlyChart({
  dailyData,
  selectedSeriesKey,
  setSelectedSeriesKey,
  selectedDayIndex,
  setSelectedDayIndex,
  activeYear,
  selectedMonth,
}) {
  const selectedSeries = SCORE_KEYS.find((item) => item.key === selectedSeriesKey) || SCORE_KEYS[0];
  const selectedDay = dailyData[clamp(selectedDayIndex, 0, dailyData.length - 1)] || dailyData[0];
  const tooltipX = chartX(selectedDayIndex, dailyData.length);
  const tooltipY = chartY(scoreFor(selectedDay, selectedSeries.key));
  const selectedPoints = dailyData.map((day, index) => ({ x: chartX(index, dailyData.length), y: chartY(scoreFor(day, selectedSeries.key)) }));
  const orderedSeries = [
    ...SCORE_KEYS.filter((item) => item.key !== selectedSeries.key),
    selectedSeries,
  ];
  const handleSeriesSelect = (event, key) => {
    setSelectedSeriesKey(key);
    setSelectedDayIndex(nearestMonthIndexFromPointer(event, dailyData.length));
  };
  return (
    <GlassPanel className="p-3 sm:p-8">
      <div className="flex flex-col gap-2 sm:gap-4 lg:flex-row lg:items-start lg:justify-between">
        <h2 className="font-serif text-[26px] font-bold leading-tight text-starlight sm:text-5xl">
          Monthly Biorhythm {MONTHS[selectedMonth]} {activeYear}
        </h2>
        <div className="flex flex-wrap gap-1.5 font-mono text-[9px] font-bold tracking-[0.04em] text-mist sm:gap-5 sm:text-xs sm:tracking-[0.08em]">
          {SCORE_KEYS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setSelectedSeriesKey(item.key)}
              className={cx(
                "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 transition sm:gap-2 sm:px-2.5 sm:py-1",
                selectedSeries.key === item.key ? "border-white/20 bg-white/10 text-starlight" : "border-transparent hover:border-white/15 hover:bg-white/5"
              )}
            >
              <span className="h-2 w-2 rounded-full sm:h-3 sm:w-3" style={{ backgroundColor: item.color }} />
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <svg className="mt-2 h-[250px] w-full sm:mt-3 sm:h-[405px]" viewBox={`0 0 ${CHART.width} ${CHART.height}`} preserveAspectRatio="none" role="img" aria-label="月間運勢スコアグラフ">
        <defs>
          <linearGradient id="monthlyForecastArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={selectedSeries.color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={selectedSeries.color} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {[75, 25, -25, -75].map((tick) => (
          <line key={tick} x1={CHART.left} x2={CHART.width - CHART.right} y1={chartY(tick)} y2={chartY(tick)} stroke="rgba(255,255,255,0.07)" />
        ))}
        <path
          d={`${smoothPath(selectedPoints)} L ${CHART.width - CHART.right} ${CHART.height - CHART.bottom} L ${CHART.left} ${CHART.height - CHART.bottom} Z`}
          fill="url(#monthlyForecastArea)"
        />
        {orderedSeries.map((item) => (
          <path
            key={item.key}
            onClick={(event) => handleSeriesSelect(event, item.key)}
            d={smoothPath(dailyData.map((day, index) => ({ x: chartX(index, dailyData.length), y: chartY(scoreFor(day, item.key)) })))}
            fill="none"
            stroke={item.color}
            strokeWidth={selectedSeries.key === item.key ? 4.6 : 2.1}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={selectedSeries.key === item.key ? 1 : 0.48}
            filter={selectedSeries.key === item.key ? "drop-shadow(0 0 12px rgba(233,195,73,0.22))" : "none"}
            className="cursor-pointer transition-opacity"
          />
        ))}
        {orderedSeries.map((item) => (
          <path
            key={`${item.key}-hit`}
            onClick={(event) => handleSeriesSelect(event, item.key)}
            d={smoothPath(dailyData.map((day, index) => ({ x: chartX(index, dailyData.length), y: chartY(scoreFor(day, item.key)) })))}
            fill="none"
            stroke="transparent"
            strokeWidth="18"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="cursor-pointer"
          />
        ))}
        <line x1={tooltipX} x2={tooltipX} y1={CHART.top} y2={CHART.height - CHART.bottom} stroke={selectedSeries.color} strokeDasharray="4 5" opacity="0.55" />
        <circle cx={tooltipX} cy={tooltipY} r="6" fill={selectedSeries.color} />
        <foreignObject x={clamp(tooltipX + 12, CHART.left, CHART.width - 170)} y={clamp(tooltipY - 62, 20, CHART.height - 130)} width="150" height="96">
          <div
            className="rounded-lg bg-[#1a1c1c]/80 p-3 backdrop-blur"
            style={{
              border: `1px solid ${selectedSeries.color}66`,
              boxShadow: `0 0 22px ${selectedSeries.color}1f`,
            }}
          >
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: selectedSeries.color }}>{formatThemeDate(selectedDay?.date)}</p>
            <p className="mt-1 font-serif text-xl font-semibold text-starlight">{selectedSeries.label}</p>
            <p className="font-serif text-2xl text-starlight">{formatScore(scoreFor(selectedDay, selectedSeries.key))}</p>
          </div>
        </foreignObject>
        {dailyData.map((day, index) => {
          const dayNumber = Number(String(day.date || "").slice(8, 10));
          const shouldShow = index === 0 || dayNumber % 5 === 0;
          return shouldShow ? (
            <text key={day.date} x={chartX(index, dailyData.length)} y={CHART.height - 8} textAnchor="middle" fill="#c7c6cc" fontSize="12" fontFamily="JetBrains Mono">
              {dayNumber}
            </text>
          ) : null;
        })}
      </svg>
    </GlassPanel>
  );
}

function MonthlyScoreMatrix({ dailyData, selectedSeriesKey, selectedDayIndex }) {
  return (
    <GlassPanel className="border-gold/25 p-3 sm:p-8">
      <h2 className="font-serif text-xl font-semibold text-gold sm:text-3xl">Monthly Score Matrix</h2>
      <div className="mt-4 overflow-x-auto sm:mt-6">
        <table className="w-full min-w-[980px] table-fixed border-collapse font-mono text-[10px] sm:text-sm">
          <thead>
            <tr className="border-b border-white/15 text-[10px] uppercase tracking-[0.08em] text-mist sm:text-xs sm:tracking-[0.12em]">
              <th className="w-[130px] py-3 pr-4 text-left">Sector</th>
              {dailyData.map((day, index) => (
                <th key={day.date || index} className="px-1 py-3 text-right">{Number(String(day.date || "").slice(8, 10)) || index + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SCORE_KEYS.map((item) => (
              <tr key={item.key} className="border-b border-white/10 last:border-0">
                <th className="py-4 pr-4 text-left font-sans text-sm text-starlight sm:text-base">{item.label}</th>
                {dailyData.map((day, index) => {
                  const score = scoreFor(day, item.key);
                  const isSelectedCell = item.key === selectedSeriesKey && index === selectedDayIndex;
                  return (
                    <td key={`${item.key}-${day.date || index}`} className="px-1 py-2 text-right">
                      <span
                        className={cx(
                          "inline-flex h-8 w-full min-w-[34px] items-center justify-end rounded-md px-1 transition sm:h-10 sm:rounded-lg sm:px-2",
                          score >= 0 ? "text-gold" : "text-outline",
                          isSelectedCell && "border border-[#8b7cf6]/70 bg-[#4f3d71]/38 font-black text-[#ebdcff] shadow-[0_0_18px_rgba(139,124,246,0.3)]"
                        )}
                      >
                        {formatScore(score)}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassPanel>
  );
}

function AnnualScoreMatrix({ data, selectedSeriesKey, selectedMonthIndex }) {
  return (
    <GlassPanel className="border-gold/25 p-3 sm:p-8">
      <h2 className="font-serif text-xl font-semibold text-gold sm:text-3xl">Annual Forecast Matrix</h2>
      <div className="mt-4 overflow-hidden sm:mt-6 sm:overflow-x-auto">
        <table className="w-full table-fixed border-collapse font-mono text-[7px] sm:min-w-[860px] sm:text-sm">
          <thead>
            <tr className="border-b border-white/15 text-[7px] uppercase tracking-[0.04em] text-mist sm:text-xs sm:tracking-[0.12em]">
              <th className="w-[58px] py-2 pr-1 text-left sm:w-[150px] sm:py-3 sm:pr-5">Sector</th>
              {MONTHS.map((month) => (
                <th key={month} className="px-0.5 py-2 text-center sm:px-3 sm:py-3 sm:text-right">{month}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SCORE_KEYS.map((item) => (
              <tr key={item.key} className="border-b border-white/10 last:border-0">
                <th className="py-2 pr-1 text-left font-sans text-[8px] leading-3 text-starlight sm:py-5 sm:pr-5 sm:text-base sm:leading-normal">{item.label}</th>
                {data.map((day, index) => {
                  const score = scoreFor(day, item.key);
                  const isSelectedCell = item.key === selectedSeriesKey && index === selectedMonthIndex;
                  return (
                    <td
                      key={`${item.key}-${index}`}
                      className="px-0.5 py-1 text-center sm:px-2 sm:py-3 sm:text-right"
                    >
                      <span
                        className={cx(
                          "inline-flex h-6 w-full items-center justify-center rounded-md px-0.5 transition sm:h-10 sm:justify-end sm:rounded-lg sm:px-2",
                          score >= 0 ? "text-gold" : "text-outline",
                          isSelectedCell && "border border-[#8b7cf6]/70 bg-[#4f3d71]/38 text-[8px] font-black text-[#ebdcff] shadow-[0_0_14px_rgba(139,124,246,0.28)] sm:text-base sm:shadow-[0_0_24px_rgba(139,124,246,0.34)]"
                        )}
                      >
                        {formatScore(score)}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassPanel>
  );
}

function Matrix({ data, selectedSeriesKey, setSelectedSeriesKey, selectedMonthIndex, setSelectedMonthIndex, forecast, activeYear }) {
  const [analysisMode, setAnalysisMode] = useState("theme");
  const [openMonthlyAspectKeys, setOpenMonthlyAspectKeys] = useState(() => new Set());
  const selectedMonth = clamp(selectedMonthIndex, 0, data.length - 1);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  useEffect(() => {
    setSelectedDayIndex(0);
  }, [selectedMonth]);
  const dailyData = dailyDataForMonth(forecast, activeYear, selectedMonth);
  const safeSelectedDayIndex = clamp(selectedDayIndex, 0, dailyData.length - 1);
  const selectedDay = data[selectedMonth] || data[0];
  const selectedSeries = SCORE_KEYS.find((item) => item.key === selectedSeriesKey) || SCORE_KEYS[0];
  const sunThemeItems = monthlyItems(monthlyThemeItemsFromForecast(forecast, "monthly_sun_themes"), activeYear, selectedMonth);
  const marsThemeItems = monthlyItems(monthlyThemeItemsFromForecast(forecast, "monthly_mars_themes"), activeYear, selectedMonth);
  const sunAspectItems = monthlyItems(sunAspectItemsFromForecast(forecast), activeYear, selectedMonth);
  const marsAspectItems = monthlyItems(marsAspectItemsFromForecast(forecast), activeYear, selectedMonth);
  const emptySummaryItems = [];
  const modeTitle = {
    theme: "今月の主軸",
    lesson: "今月の熱量",
    summary: "今月の総括",
    test1: "test1",
    test2: "test2",
  }[analysisMode] || "今月の主軸";
  const toggleMonthlyAspect = (key) => {
    setOpenMonthlyAspectKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };
  const fallbackItems = [{ color: "#e9c349", label: `${MONTHS[selectedMonth]}: 作成中`, body: "作成中" }];
  return (
    <div className="grid gap-4 sm:gap-7">
      <div className="grid grid-cols-12 gap-0.5 pb-1 font-mono text-[7px] font-bold tracking-0 text-mist sm:flex sm:gap-2 sm:overflow-x-auto sm:text-xs sm:tracking-[0.06em] sm:[scrollbar-width:none]">
        {MONTHS.map((month, index) => (
          <button
            key={month}
            type="button"
            onClick={() => setSelectedMonthIndex(index)}
            className={cx(
              "min-w-0 rounded-full border px-0.5 py-1 transition sm:shrink-0 sm:px-3 sm:py-1.5",
              selectedMonth === index ? "border-gold bg-gold text-[#241a00]" : "border-white/10 bg-white/[0.04] hover:border-white/20 hover:text-starlight"
            )}
          >
            {index + 1}月
          </button>
        ))}
      </div>
      <GlassPanel className="flex h-[520px] flex-col overflow-hidden border-gold/25 p-2 sm:h-[560px] sm:p-5 lg:h-[620px] lg:p-6">
        <div className="flex items-start justify-between gap-2 sm:items-center sm:gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[8px] font-bold uppercase tracking-[0.18em] text-gold/75 sm:text-[9px]">
              Main Theme
            </p>
            <h2 className="mt-1 break-words font-serif text-[17px] font-semibold leading-tight text-starlight sm:text-3xl">
              {modeTitle}
            </h2>
          </div>
          <div className="ml-auto flex w-fit max-w-full shrink-0 rounded-full border border-white/10 bg-white/[0.04] p-1 font-mono text-[7px] font-bold text-mist sm:text-[10px]">
            {[
              ["theme", "主軸"],
              ["lesson", "熱量"],
              ["summary", "総括"],
              ["test1", "test1"],
              ["test2", "test2"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setAnalysisMode(value)}
                className={cx(
                  "rounded-full px-1.5 py-1.5 transition sm:px-3",
                  analysisMode === value ? "bg-gold text-[#241a00]" : "hover:bg-white/10 hover:text-starlight"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 h-px bg-white/10 sm:mt-5" />
        {analysisMode === "theme" ? (
          <MonthlyArticleList items={sunThemeItems.length ? sunThemeItems : fallbackItems} />
        ) : null}
        {analysisMode === "lesson" ? (
          <MonthlyArticleList items={marsThemeItems.length ? marsThemeItems : fallbackItems} />
        ) : null}
        {analysisMode === "summary" ? (
          <div className="mt-3 grid min-h-0 flex-1 gap-3 overflow-y-auto [scrollbar-color:#e9c349_rgba(255,255,255,0.08)] [scrollbar-width:thin] sm:mt-6 sm:gap-5 sm:pr-1">
            <MonthlyArticleList items={emptySummaryItems} />
          </div>
        ) : null}
        {analysisMode === "test1" ? (
          <TransitAspectList items={sunAspectItems} openKeys={openMonthlyAspectKeys} onToggle={toggleMonthlyAspect} prefix="monthly-sun" />
        ) : null}
        {analysisMode === "test2" ? (
          <TransitAspectList items={marsAspectItems} openKeys={openMonthlyAspectKeys} onToggle={toggleMonthlyAspect} prefix="monthly-mars" />
        ) : null}
      </GlassPanel>
      <MonthlyChart
        dailyData={dailyData}
        selectedSeriesKey={selectedSeriesKey}
        setSelectedSeriesKey={setSelectedSeriesKey}
        selectedDayIndex={safeSelectedDayIndex}
        setSelectedDayIndex={setSelectedDayIndex}
        activeYear={activeYear}
        selectedMonth={selectedMonth}
      />
      <MonthlyScoreMatrix dailyData={dailyData} selectedSeriesKey={selectedSeriesKey} selectedDayIndex={safeSelectedDayIndex} />
    </div>
  );
}

function MonthlyArticleList({ items, compact = false, emptyText = "" }) {
  if (!items.length) {
    return emptyText ? (
      <div className="min-h-0 flex-1 overflow-y-auto pr-2">
        <p className="text-sm leading-7 text-mist sm:text-base sm:leading-8">{emptyText}</p>
      </div>
    ) : null;
  }
  return (
    <div className={cx(
      "grid min-h-0 flex-1 overflow-y-auto pr-2 [scrollbar-color:#e9c349_rgba(255,255,255,0.08)] [scrollbar-width:thin]",
      compact ? "gap-4" : "mt-6 gap-6 sm:mt-8 sm:gap-8"
    )}>
      {items.map((item) => (
        <article key={`${item.label}-${item.title || ""}`} className={cx("relative", compact ? "pl-4 sm:pl-6" : "pl-8")}>
          <span className={cx(
            "absolute left-0 rounded-full shadow-[0_0_18px_currentColor]",
            compact ? "top-1 h-2 w-2 sm:top-1.5 sm:h-3 sm:w-3" : "top-1.5 h-3 w-3"
          )} style={{ color: item.color, backgroundColor: item.color }} />
          <span className={cx(
            "absolute w-px bg-white/15",
            compact ? "bottom-0 left-[3px] top-3.5 sm:left-[5px] sm:top-5" : "left-[5px] top-5 h-full"
          )} />
          <p className={cx(
            "font-mono font-bold uppercase",
            compact ? "text-[9px] leading-4 tracking-[0.03em] sm:text-xs" : "text-xs tracking-[0.12em]"
          )} style={{ color: item.color }}>
            {item.label}
          </p>
          <p className={cx(
            "mt-2 whitespace-pre-line text-mist",
            compact ? "text-[10px] leading-5 sm:text-sm sm:leading-7" : "text-sm leading-7 sm:mt-3 sm:text-base sm:leading-8"
          )}>{item.body || "作成中"}</p>
        </article>
      ))}
    </div>
  );
}

function TransitAspectList({ items, openKeys, onToggle, prefix }) {
  return (
    <div className="mt-6 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-2 [scrollbar-color:#e9c349_rgba(255,255,255,0.08)] [scrollbar-width:thin] sm:mt-8">
      {items.length ? (
        items.map((item) => {
          const itemKey = `${prefix}-${item.key}-${item.startDate}`;
          const isOpen = openKeys.has(itemKey);
          return (
            <article key={`${prefix}-${item.key}-${item.startDate}`} className="shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]">
              <button
                type="button"
                className="flex w-full items-start justify-between gap-3 px-3 py-3 text-left sm:gap-4 sm:px-4"
                aria-expanded={isOpen}
                onClick={() => onToggle(itemKey)}
              >
                <div className="min-w-0">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-gold">
                    {formatShortPeriod(item.startDate, item.endDate)}
                  </p>
                  <p className="mt-2 text-xs font-semibold leading-5 text-mist sm:text-base sm:leading-6">{item.label}</p>
                </div>
                <span className={cx(
                  "mt-1 shrink-0 font-mono text-xs font-bold text-gold transition",
                  isOpen && "rotate-90"
                )}>›</span>
              </button>
              {isOpen ? (
                <div className="border-t border-white/10 px-3 pb-4 pt-3 sm:px-4">
                  <p className="whitespace-pre-line text-[11px] leading-6 text-mist sm:text-sm sm:leading-7">
                    {item.description || "解釈文がありません。"}
                  </p>
                </div>
              ) : null}
            </article>
          );
        })
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.035] p-6 font-mono text-xs font-bold uppercase tracking-[0.18em] text-mist">
          該当なし
        </div>
      )}
    </div>
  );
}

function FooterStats({ stats }) {
  const items = [
    {
      label: "Annual Peak",
      value: MONTHS[monthIndex(stats.peak?.date)],
      description: "年間スコアが最も高く出る月。行動量を増やしやすいピーク時期です。",
      icon: <Sparkles size={30} />,
    },
    {
      label: "Dominant Sector",
      value: stats.strongest?.label || "-",
      description: "年間を通して最も強く反応している分野。意識的に使うと成果につながりやすい領域です。",
      icon: <CircleDot size={30} />,
    },
    {
      label: "Stability",
      value: `${stats.stability}%`,
      description: "年間推移の安定度。数値が高いほど月ごとの波が穏やかで、低いほど変化が大きい傾向です。",
      icon: <Shield size={30} />,
    },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-3 md:gap-6">
      {items.map((item) => (
        <GlassPanel key={item.label} className="flex items-start justify-between gap-5 p-5 sm:p-7">
          <div className="min-w-0">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.15em] text-mist">{item.label}</p>
            <p className="mt-3 font-serif text-3xl font-semibold text-starlight sm:mt-4 sm:text-4xl">{item.value}</p>
            <p className="mt-3 text-xs leading-6 text-mist sm:mt-4 sm:text-sm sm:leading-7">{item.description}</p>
          </div>
          <span className="shrink-0 text-gold">{item.icon}</span>
        </GlassPanel>
      ))}
    </div>
  );
}

function YearCalculationDialog({
  open,
  year,
  onYearChange,
  onClose,
  onCalculate,
  calculating,
  error,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-[420px] rounded-2xl border border-white/12 bg-[#151717] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.48)] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-gold">Annual Forecast</p>
            <h2 className="mt-2 font-serif text-3xl font-semibold text-starlight">他の年で計算する</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={calculating}
            className="rounded-full border border-white/12 px-3 py-1.5 font-mono text-xs font-bold text-mist transition hover:bg-white/8 disabled:opacity-40"
          >
            Close
          </button>
        </div>

        <label className="mt-7 block">
          <span className="font-mono text-xs font-bold uppercase tracking-[0.14em] text-mist">任意の年</span>
          <input
            type="number"
            min="2015"
            max="2028"
            step="1"
            value={year}
            onChange={(event) => onYearChange(event.target.value)}
            disabled={calculating}
            className="mt-3 h-12 w-full rounded-xl border border-white/12 bg-[#0d0e0f] px-4 font-mono text-lg font-bold text-starlight outline-none transition focus:border-gold/70 disabled:opacity-50"
          />
        </label>

        {error ? (
          <p className="mt-4 rounded-xl border border-[#ffb4ab]/30 bg-[#3a1d1d]/40 px-4 py-3 text-sm leading-6 text-[#ffb4ab]">{error}</p>
        ) : null}

        <button
          type="button"
          onClick={onCalculate}
          disabled={calculating}
          className="mt-6 h-12 w-full rounded-full bg-gold font-mono text-xs font-black uppercase tracking-[0.18em] text-[#241a00] shadow-[0_0_24px_rgba(233,195,73,0.18)] transition hover:bg-[#f2d56d] disabled:cursor-wait disabled:opacity-70"
        >
          {calculating ? "計算中..." : "計算する"}
        </button>
      </div>
    </div>
  );
}

function ForecastDetailPage() {
  const forceRefresh = shouldForceRefresh();
  const [forecast, setForecast] = useState(() => getForecast() || (forceRefresh ? null : demoForecast()));
  const activeYear = forecastYear(forecast);
  const [yearDialogOpen, setYearDialogOpen] = useState(false);
  const [targetYear, setTargetYear] = useState(String(activeYear));
  const [calculatingYear, setCalculatingYear] = useState(false);
  const [yearCalculationError, setYearCalculationError] = useState("");
  useEffect(() => {
    if (forceRefresh) {
      return () => {};
    }
    let active = true;
    getStoredReadingResultAsync({ allowStale: true }).then((payload) => {
      const indexedForecast = payload?.yearly_forecast || payload?.yearlyForecast || null;
      if (active && indexedForecast) {
        setForecast(indexedForecast);
      }
    });
    return () => {
      active = false;
    };
  }, [forceRefresh]);
  useEffect(() => {
    if (!yearDialogOpen) {
      setTargetYear(String(activeYear));
      setYearCalculationError("");
    }
  }, [activeYear, yearDialogOpen]);
  useEffect(() => {
    if (!forceRefresh) {
      return;
    }
    const formPayload = getQueryReadingForm() || getStoredReadingForm();
    if (!formPayload) {
      return;
    }
    let active = true;
    setCalculatingYear(true);
    setYearCalculationError("");
    reloadCsvMasters()
      .then(() => postJson(`/api/yearly-forecast?year=${activeYear}`, formPayload))
      .then(async (nextForecast) => {
        if (!active) return;
        setForecast(nextForecast);
        setSelectedMonthIndex(monthIndex(nextForecast?.summary?.peak?.date || nextForecast?.yearly_data?.[0]?.date));
        setSelectedMonthlyMonthIndex(workdayMonthIndex());
        const storedPayload = await getStoredReadingResultAsync({ allowStale: true });
        await storeReadingResult({
          ...(storedPayload || {}),
          yearly_forecast: nextForecast,
        });
      })
      .catch((error) => {
        if (active) {
          setYearCalculationError(readableErrorMessage(error, "年間予測の再計算に失敗しました。"));
        }
      })
      .finally(() => {
        if (active) {
          setCalculatingYear(false);
        }
      });
    return () => {
      active = false;
    };
  }, [activeYear, forceRefresh]);
  const data = useMemo(() => monthlyData(forecast, !forceRefresh), [forecast, forceRefresh]);
  const stats = useMemo(() => aggregateStats(data), [data]);
  const [selectedSeriesKey, setSelectedSeriesKey] = useState("general");
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(monthIndex(stats.peak?.date));
  const [selectedMonthlyMonthIndex, setSelectedMonthlyMonthIndex] = useState(workdayMonthIndex);
  const [activeView, setActiveView] = useState("annual");
  const handleCalculateYear = async () => {
    const normalizedYear = Number(targetYear);
    if (!Number.isInteger(normalizedYear) || normalizedYear < 2015 || normalizedYear > 2028) {
      setYearCalculationError("2015年から2028年の範囲で年を入力してください。");
      return;
    }

    const formPayload = getStoredReadingForm();
    if (!formPayload) {
      setYearCalculationError("出生データが見つかりません。入力画面から再計算してください。");
      return;
    }

    setCalculatingYear(true);
    setYearCalculationError("");
    try {
      const nextForecast = await postJson(`/api/yearly-forecast?year=${normalizedYear}`, formPayload);
      setForecast(nextForecast);
      setSelectedMonthIndex(monthIndex(nextForecast?.summary?.peak?.date || nextForecast?.yearly_data?.[0]?.date));
      setSelectedMonthlyMonthIndex(workdayMonthIndex());

      const storedPayload = await getStoredReadingResultAsync({ allowStale: true });
      await storeReadingResult({
        ...(storedPayload || {}),
        yearly_forecast: nextForecast,
      });
      setYearDialogOpen(false);
    } catch (error) {
      setYearCalculationError(readableErrorMessage(error, "年間予測の計算に失敗しました。"));
    } finally {
      setCalculatingYear(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden text-starlight">
      <Header activeYear={activeYear} activeView={activeView} setActiveView={setActiveView} />
      <main className="mx-auto grid max-w-none gap-3 px-0.5 pb-4 pt-[136px] sm:gap-6 sm:px-4 sm:pb-10 sm:pt-36 lg:px-6 lg:pb-20 lg:pt-[136px]">
        {yearCalculationError ? (
          <div className="rounded-2xl border border-[#ffb4ab]/30 bg-[#3a1d1d]/45 px-4 py-3 text-xs leading-6 text-[#ffb4ab] sm:text-sm">
            {yearCalculationError}
          </div>
        ) : null}
        {forceRefresh && calculatingYear && !forecast ? (
          <GlassPanel className="p-6 text-center font-mono text-xs font-bold uppercase tracking-[0.18em] text-mist">
            年間予測を再計算中...
          </GlassPanel>
        ) : null}
        {activeView === "annual" ? (
          <>
            <OraclePanel stats={stats} forecast={forecast} />
            <div className="grid gap-4 sm:gap-7">
              <AnnualChart
                data={data}
                stats={stats}
                selectedSeriesKey={selectedSeriesKey}
                setSelectedSeriesKey={setSelectedSeriesKey}
                selectedMonthIndex={selectedMonthIndex}
                setSelectedMonthIndex={setSelectedMonthIndex}
                activeYear={activeYear}
                onOpenYearDialog={() => setYearDialogOpen(true)}
              />
              <AnnualScoreMatrix data={data} selectedSeriesKey={selectedSeriesKey} selectedMonthIndex={selectedMonthIndex} />
              <FooterStats stats={stats} />
            </div>
          </>
        ) : null}
        {activeView === "monthly" ? (
          <Matrix
            data={data}
            selectedSeriesKey={selectedSeriesKey}
            setSelectedSeriesKey={setSelectedSeriesKey}
            selectedMonthIndex={selectedMonthlyMonthIndex}
            setSelectedMonthIndex={setSelectedMonthlyMonthIndex}
            forecast={forecast}
            activeYear={activeYear}
          />
        ) : null}
      </main>
      <footer className="border-t border-white/10 bg-[#0d0e0f]/80 px-4 py-8 sm:px-8 sm:py-10">
        <div className="mx-auto flex max-w-[1540px] flex-col gap-4 text-mist md:flex-row md:items-center md:justify-between">
          <p className="font-serif text-2xl font-semibold text-gold">The Celestial Atelier</p>
          <p className="text-sm">Annual forecast detail. Dashboard remains independent.</p>
          <a href="/results.html" className="font-mono text-xs uppercase tracking-[0.18em] text-mist hover:text-gold">Back to Results</a>
        </div>
      </footer>
      <YearCalculationDialog
        open={yearDialogOpen}
        year={targetYear}
        onYearChange={setTargetYear}
        onClose={() => setYearDialogOpen(false)}
        onCalculate={handleCalculateYear}
        calculating={calculatingYear}
        error={yearCalculationError}
      />
    </div>
  );
}

createRoot(document.getElementById("forecast-detail-root")).render(
  <React.StrictMode>
    <ForecastDetailPage />
  </React.StrictMode>
);

