import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, BriefcaseBusiness, CalendarDays, CircleDot, Eye, EyeOff, HandHeart, Maximize2, Menu, Minimize2, Minus, Move, Pause, Play, Plus, RefreshCw, Shield, SlidersHorizontal, Sparkles, WalletCards } from "lucide-react";
import * as THREE from "three";
import {
  currentTokyoDate,
  getStoredReadingForm,
  getStoredReadingResult,
  getStoredReadingResultAsync,
  storedMasterVersion,
  storeReadingResult,
} from "./reading-storage.js";
import {
  DashboardDailyDetailContentLayer,
  DashboardV2HoroscopePage,
  dashboardData as fallbackDashboardData,
} from "./dashboard-shared.jsx";
import { readableErrorMessage } from "./error-message.mjs";
import { MonthlyOverviewContent } from "./monthly-overview-content.jsx";
import { hasMonthlyOverviewMonth, monthlyOverviewForDay } from "./monthly-overview.mjs";
import forecastGalaxyBg from "./assets/daily-detail-galaxy-bg.jpg";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const MONTH_LABELS = Array.from({ length: 12 }, (_, index) => `${index + 1}月`);
const SCORE_KEYS = [
  { key: "general", label: "全般・健康", color: "#43c5c7" },
  { key: "work", label: "仕事", color: "#7ba7ff" },
  { key: "love", label: "恋愛・対人", color: "#ff8b84" },
  { key: "money", label: "お金", color: "#f2c14e" },
];
const ANNUAL_GENRE_ASPECT_MIN_COMPONENT_SCORE = 55;
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
const PLANET_SYMBOLS = {
  SUN: "☉",
  MOON: "☽",
  MERCURY: "☿",
  VENUS: "♀",
  MARS: "♂",
  JUPITER: "♃",
  SATURN: "♄",
  URANUS: "♅",
  NEPTUNE: "♆",
  PLUTO: "♇",
  ASC: "ASC",
  MC: "MC",
};
const TRANSIT_PLANET_ORDER = ["SUN", "MOON", "MERCURY", "VENUS", "MARS", "JUPITER", "SATURN", "URANUS", "NEPTUNE", "PLUTO"];
const NATAL_POINT_ORDER = ["SUN", "MOON", "MERCURY", "VENUS", "MARS", "JUPITER", "SATURN", "URANUS", "NEPTUNE", "PLUTO", "ASC", "MC"];
const SENSITIVE_POINT_ORDER = ["ASC", "MC"];
const ZODIAC_SIGN_NAMES = ["牡羊", "牡牛", "双子", "蟹", "獅子", "乙女", "天秤", "蠍", "射手", "山羊", "水瓶", "魚"];
const ZODIAC_SIGNS = ["♈︎", "♉︎", "♊︎", "♋︎", "♌︎", "♍︎", "♎︎", "♏︎", "♐︎", "♑︎", "♒︎", "♓︎"];
const PLANET_COLORS = {
  SUN: "#e9c349",
  MOON: "#c3c6d7",
  MERCURY: "#8bd3ff",
  VENUS: "#ffb4ab",
  MARS: "#ff7a59",
  JUPITER: "#d3bcf9",
  SATURN: "#b7a47a",
  URANUS: "#67e8f9",
  NEPTUNE: "#7aa7ff",
  PLUTO: "#c084fc",
  ASC: "#f2e7c9",
  MC: "#e0d6ff",
};
const LIVE_ASPECT_DEFS = [
  { angle: 0, orb: 8 },
  { angle: 60, orb: 4 },
  { angle: 90, orb: 6 },
  { angle: 120, orb: 6 },
  { angle: 150, orb: 3 },
  { angle: 180, orb: 8 },
];
const RENDERABLE_3D_ASPECT_ANGLES = [0, 60, 90, 120, 180];
const COMPOUND_ASPECT_ANGLES = [60, 90, 120, 150, 180];
const SOFT_ASPECT_LINE_COLOR = "#74d8ff";
const HARD_ASPECT_LINE_COLOR = "#ff5757";
const NEUTRAL_ASPECT_LINE_COLOR = "#e6c85f";

function normalizeAspectAngle(angle) {
  const numericAngle = Number(angle);
  if (!Number.isFinite(numericAngle)) return null;
  return Math.round(numericAngle);
}

function isRenderable3DAspectAngle(angle) {
  const normalizedAngle = normalizeAspectAngle(angle);
  return normalizedAngle !== null && RENDERABLE_3D_ASPECT_ANGLES.includes(normalizedAngle);
}

function aspectLineColor(angle, fallback = NEUTRAL_ASPECT_LINE_COLOR) {
  const normalizedAngle = normalizeAspectAngle(angle);
  if (normalizedAngle === 60 || normalizedAngle === 120) return SOFT_ASPECT_LINE_COLOR;
  if (normalizedAngle === 90 || normalizedAngle === 180) return HARD_ASPECT_LINE_COLOR;
  if (normalizedAngle === 0) return NEUTRAL_ASPECT_LINE_COLOR;
  return fallback;
}

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

async function getJson(path) {
  const response = await fetch(`${resolveApiBaseUrl()}${path}`, {
    method: "GET",
    headers: { "Accept": "application/json" },
  });
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json().catch(() => ({}))
    : { detail: await response.text().catch(() => "") };
  if (!response.ok) {
    throw new Error(formatApiError(data.detail, `Request failed: ${response.status}`));
  }
  return data;
}

async function reloadCsvMasters() {
  return postJson("/api/dev/reload-csv");
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

function payloadMasterVersion(payload) {
  return storedMasterVersion(payload);
}

function versionFromPayload(payload) {
  return String(payload?.masterVersion || payload?.master_version || payload?.dataVersion || "").trim();
}

function forecastDetailAssetFromDocument(doc, baseHref) {
  const script = Array.from(doc.querySelectorAll("script[src]")).find((item) => {
    const src = item.getAttribute("src") || "";
    return src.includes("forecastDetail") || src.includes("/src/forecast-detail.jsx");
  });
  if (!script) return "";
  try {
    return new URL(script.getAttribute("src") || "", baseHref).pathname;
  } catch {
    return script.getAttribute("src") || "";
  }
}

async function fetchFrontendVersionState() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { currentAppAsset: "", latestAppAsset: "", isAppOutdated: false };
  }
  const currentAppAsset = forecastDetailAssetFromDocument(document, window.location.href);
  const latestUrl = new URL(window.location.href);
  latestUrl.hash = "";
  latestUrl.searchParams.set("_app_version_check", String(Date.now()));
  const response = await fetch(latestUrl.toString(), {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" },
  });
  if (!response.ok) {
    throw new Error(`Frontend version check failed: ${response.status}`);
  }
  const html = await response.text();
  const latestDoc = new DOMParser().parseFromString(html, "text/html");
  const latestAppAsset = forecastDetailAssetFromDocument(latestDoc, latestUrl.toString());
  return {
    currentAppAsset,
    latestAppAsset,
    isAppOutdated: Boolean(currentAppAsset && latestAppAsset && currentAppAsset !== latestAppAsset),
  };
}

function forecastYear(forecast) {
  const fromCache = Number(forecast?.cache?.year);
  if (Number.isFinite(fromCache)) {
    return fromCache;
  }
  const fromForecastYear = Number(forecast?.year || forecast?.target_year || forecast?.targetYear || forecast?.meta?.year);
  if (Number.isFinite(fromForecastYear)) {
    return fromForecastYear;
  }
  const firstDate = String(forecast?.yearly_data?.[0]?.date || forecast?.reading_date || "");
  const parsed = Number.parseInt(firstDate.slice(0, 4), 10);
  return Number.isFinite(parsed) ? parsed : 2026;
}

function forecastWithSelectedYear(forecast, year) {
  if (!forecast || !Number.isFinite(Number(year))) return forecast;
  return {
    ...forecast,
    cache: {
      ...(forecast.cache || {}),
      year: Number(year),
    },
  };
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

function monthKey(value) {
  const monthMatch = String(value || "").match(/^(\d{4})[-/](\d{1,2})$/);
  if (monthMatch) {
    const [, year, month] = monthMatch;
    return `${year}-${month.padStart(2, "0")}`;
  }
  const normalized = dateKey(value);
  return normalized ? normalized.slice(0, 7) : "";
}

function addMonthsToMonthKey(value, months) {
  const normalized = monthKey(value);
  if (!normalized) return "";
  const date = new Date(`${normalized}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setMonth(date.getMonth() + Number(months || 0));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(value) {
  const normalized = monthKey(value);
  if (!normalized) return "";
  const [year, month] = normalized.split("-");
  return `${year}/${Number(month)}月`;
}

function calendarDaysForMonth(value) {
  const normalized = monthKey(value);
  if (!normalized) return [];
  const first = new Date(`${normalized}-01T00:00:00`);
  if (Number.isNaN(first.getTime())) return [];
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  });
}

function tenMinuteTimeOptions() {
  return Array.from({ length: 24 * 6 }, (_, index) => {
    const minutes = index * 10;
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  });
}

function currentTenMinuteTime() {
  const now = new Date();
  const totalMinutes = now.getHours() * 60 + now.getMinutes();
  const roundedMinutes = clamp(Math.round(totalMinutes / 10) * 10, 0, 24 * 60 - 10);
  return `${String(Math.floor(roundedMinutes / 60)).padStart(2, "0")}:${String(roundedMinutes % 60).padStart(2, "0")}`;
}

const TRANSIT_PLAYBACK_STEP_OPTIONS = [
  { days: 1, label: "1日/秒" },
  { days: 3, label: "3日/秒" },
];
const TRANSIT_PLAYBACK_RANGE_OPTIONS = [
  { key: "month", label: "1ヶ月", days: 31 },
  { key: "year", label: "1年間", days: 366 },
];
const ASPECT_LINE_SCOPE_OPTIONS = [
  { key: "transitNatal", label: "出生図との関係", shortLabel: "ネイタル×現行", title: "ネイタル天体×現行天体" },
  { key: "transitTransit", label: "現行天体同士", shortLabel: "現行×現行", title: "現行天体×現行天体" },
  { key: "natalNatal", label: "ネイタル天体同士", shortLabel: "ネイタル×ネイタル", title: "ネイタル天体×ネイタル天体" },
];
const ASPECT_DISPLAY_MODE_OPTIONS = [
  { key: "transitNatal", label: "出生図との関係", description: "ネイタル×現行" },
  { key: "transitTransit", label: "現行天体同士", description: "現行×現行" },
  { key: "natalNatal", label: "ネイタル同士", description: "ネイタル×ネイタル" },
  { key: "compositeTransit", label: "現行天体", description: "複合アスペクト" },
  { key: "compositeTransitNatal", label: "ネイタル×現行", description: "複合アスペクト" },
  { key: "custom", label: "カスタム", description: "表示対象を選択" },
];
const MONTHLY_PEAK_CATEGORIES = [
  { key: "general_health", label: "一般・健康", Icon: Activity, color: "#43c5c7" },
  { key: "work", label: "仕事", Icon: BriefcaseBusiness, color: "#7ba7ff" },
  { key: "love", label: "恋愛・対人", Icon: HandHeart, color: "#ff8b84" },
  { key: "money", label: "金運", Icon: WalletCards, color: "#f2c14e" },
];
const EMPTY_ASPECT_SELECTIONS = {
  transitNatal: { natal: [], transit: [] },
  transitTransit: { natal: [], transit: [] },
  natalNatal: { natal: [], transit: [] },
};

function addMinutesToTransitDateTime(dateValue, timeValue, minutes) {
  const normalizedDate = dateKey(dateValue);
  if (!normalizedDate || !timeValue) return null;
  const nextDate = new Date(`${normalizedDate}T${timeValue}:00`);
  if (Number.isNaN(nextDate.getTime())) return null;
  nextDate.setMinutes(nextDate.getMinutes() + Number(minutes || 0));
  return {
    date: `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}-${String(nextDate.getDate()).padStart(2, "0")}`,
    time: `${String(nextDate.getHours()).padStart(2, "0")}:${String(nextDate.getMinutes()).padStart(2, "0")}`,
  };
}

function transitChartCacheKey(dateValue, timeValue) {
  return `${dateKey(dateValue) || ""}T${timeValue || ""}`;
}

function zodiacSignLabel(value) {
  const key = String(value || "").trim().toUpperCase();
  const index = [
    "ARIES", "TAURUS", "GEMINI", "CANCER", "LEO", "VIRGO",
    "LIBRA", "SCORPIO", "SAGITTARIUS", "CAPRICORN", "AQUARIUS", "PISCES",
  ].indexOf(key);
  return index >= 0 ? `${ZODIAC_SIGN_NAMES[index]}座` : value || "";
}

function annualAspectGenreDescriptions(event) {
  const source = event?.genre_descriptions || event?.genreDescriptions || {};
  const normalize = (value) => {
    const text = String(value || "").trim();
    return text === "-" ? "" : text;
  };
  return {
    love: normalize(source.love || event?.love_text_description || event?.loveTextDescription),
    work: normalize(source.work || event?.work_text_description || event?.workTextDescription),
    money: normalize(source.money || event?.money_text_description || event?.moneyTextDescription),
  };
}

function annualAspectGenreNumbers(event, snakeKey, camelKey) {
  const source = event?.[snakeKey] || event?.[camelKey] || {};
  const normalize = (value) => {
    if (value === null || value === undefined || value === "" || value === "-") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };
  return {
    love: normalize(source.love),
    work: normalize(source.work),
    money: normalize(source.money),
  };
}

function annualAspectGenreScores(event) {
  return annualAspectGenreNumbers(event, "genre_score_impacts", "genreScoreImpacts");
}

function annualAspectGenreScoreComponents(event) {
  const source = event?.genre_score_components || event?.genreScoreComponents || {};
  const normalize = (value) => {
    if (value === null || value === undefined || value === "" || value === "-") return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  };
  return Object.fromEntries(["love", "work", "money"].map((genre) => {
    const components = source?.[genre] || {};
    return [genre, {
      positive: normalize(components.positive),
      negative: normalize(components.negative),
    }];
  }));
}

function annualAspectGenreImportanceScores(event) {
  return annualAspectGenreNumbers(event, "genre_importance_scores", "genreImportanceScores");
}

function annualAspectApplicableGenres(event) {
  const source = event?.genre_applicability || event?.genreApplicability || {};
  const values = Array.isArray(source.genres)
    ? source.genres
    : Array.isArray(event?.applicable_genres)
      ? event.applicable_genres
      : Array.isArray(event?.applicableGenres)
        ? event.applicableGenres
        : String(event?.category || event?.title || "").split(",");
  return [...new Set(
    values
      .map((value) => String(value || "").trim().toLowerCase())
      .filter((value) => ["love", "work", "money"].includes(value))
  )];
}

function hasAnnualAspectGenreDescriptions(forecast) {
  const descriptionSchema = Number(
    forecast?.aspect_genre_description_schema
    || forecast?.aspectGenreDescriptionSchema
    || 0
  );
  const applicabilitySchema = Number(
    forecast?.aspect_genre_applicability_schema
    || forecast?.aspectGenreApplicabilitySchema
    || 0
  );
  const scoreSchema = Number(
    forecast?.aspect_genre_score_schema
    || forecast?.aspectGenreScoreSchema
    || 0
  );
  return descriptionSchema >= 2 && applicabilitySchema >= 1 && scoreSchema >= 3;
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
    const natalHouse = event?.natal_house ?? event?.natalHouse ?? "";
    if (!date || (transitPlanetFilter && transitPlanet !== transitPlanetFilter) || !natalPlanet || angle === null || angle === undefined || angle === "") return;
    const numericAngle = Number(angle);
    const angleLabel = Number.isFinite(numericAngle) ? numericAngle : angle;
    rawItems.push({
      date,
      key: `${natalPlanet}-${transitPlanet}-${angleLabel}-${natalHouse}`,
      label: `ネイタル${planetLabel(natalPlanet)} × 現行${planetLabel(transitPlanet)} ${angleLabel}°`,
      title: event?.title || "",
      category: event?.category || event?.title || "",
      applicableGenres: annualAspectApplicableGenres(event),
      description: event?.description || "",
      genreDescriptions: annualAspectGenreDescriptions(event),
      genreScoreImpacts: annualAspectGenreScores(event),
      genreScoreComponents: annualAspectGenreScoreComponents(event),
      genreImportanceScores: annualAspectGenreImportanceScores(event),
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
      const natalHouse = event?.natal_house ?? event?.natalHouse ?? "";
      if ((transitPlanetFilter && transitPlanet !== transitPlanetFilter) || !natalPlanet || angle === null || angle === undefined || angle === "") return;
      const numericAngle = Number(angle);
      const angleLabel = Number.isFinite(numericAngle) ? numericAngle : angle;
      const label = `ネイタル${planetLabel(natalPlanet)} × 現行${planetLabel(transitPlanet)} ${angleLabel}°`;
      rawItems.push({
        date,
        key: `${natalPlanet}-${transitPlanet}-${angleLabel}-${natalHouse}`,
        label,
        title: event?.title || "",
        category: event?.category || event?.title || "",
        applicableGenres: annualAspectApplicableGenres(event),
        description: event?.description || "",
        genreDescriptions: annualAspectGenreDescriptions(event),
        genreScoreImpacts: annualAspectGenreScores(event),
        genreScoreComponents: annualAspectGenreScoreComponents(event),
        genreImportanceScores: annualAspectGenreImportanceScores(event),
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
        if (!previous.category && item.category) previous.category = item.category;
        previous.applicableGenres = [...new Set([
          ...previous.applicableGenres,
          ...item.applicableGenres,
        ])];
        if (!previous.description && item.description) previous.description = item.description;
        Object.keys(previous.genreDescriptions).forEach((genre) => {
          if (!previous.genreDescriptions[genre] && item.genreDescriptions[genre]) {
            previous.genreDescriptions[genre] = item.genreDescriptions[genre];
          }
          if (previous.genreScoreImpacts[genre] === null && item.genreScoreImpacts[genre] !== null) {
            previous.genreScoreImpacts[genre] = item.genreScoreImpacts[genre];
          }
          ["positive", "negative"].forEach((component) => {
            const previousValue = previous.genreScoreComponents[genre][component];
            const itemValue = item.genreScoreComponents[genre][component];
            if (itemValue !== null && (previousValue === null || itemValue > previousValue)) {
              previous.genreScoreComponents[genre][component] = itemValue;
            }
          });
          const previousImportance = previous.genreImportanceScores[genre];
          const itemImportance = item.genreImportanceScores[genre];
          if (itemImportance !== null && (previousImportance === null || itemImportance > previousImportance)) {
            previous.genreImportanceScores[genre] = itemImportance;
          }
        });
        if (!previous.advisedTask && item.advisedTask) previous.advisedTask = item.advisedTask;
        return;
      }
      grouped.push({
        key: item.key,
        label: item.label,
        title: item.title,
        category: item.category,
        applicableGenres: [...item.applicableGenres],
        description: item.description,
        genreDescriptions: { ...item.genreDescriptions },
        genreScoreImpacts: { ...item.genreScoreImpacts },
        genreScoreComponents: Object.fromEntries(
          Object.entries(item.genreScoreComponents).map(([genre, components]) => [genre, { ...components }])
        ),
        genreImportanceScores: { ...item.genreImportanceScores },
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
    reading_date: currentTokyoDate(),
    yearly_data,
  };
}

function categorizedAnnualAspectItemsFromForecast(forecast) {
  const compactPeriods = forecast?.annual_category_aspects || forecast?.annualCategoryAspects;
  const items = Array.isArray(compactPeriods)
    ? compactPeriods.map((event) => {
      const transitPlanet = String(event?.t_planet || event?.transit_planet || "").trim().toUpperCase();
      const natalPlanet = String(event?.n_planet || event?.natal_planet || "").trim().toUpperCase();
      const angle = event?.aspect_angle ?? event?.angle ?? event?.exact_angle;
      const natalHouse = event?.natal_house ?? event?.natalHouse ?? "";
      return {
        key: event?.key || `${natalPlanet}-${transitPlanet}-${angle}-${natalHouse}`,
        label: `ネイタル${planetLabel(natalPlanet)} × 現行${planetLabel(transitPlanet)} ${angle}°`,
        title: event?.title || "",
        category: event?.category || event?.title || "",
        applicableGenres: annualAspectApplicableGenres(event),
        description: event?.description || "",
        genreDescriptions: annualAspectGenreDescriptions(event),
        genreScoreImpacts: annualAspectGenreScores(event),
        genreScoreComponents: annualAspectGenreScoreComponents(event),
        genreImportanceScores: annualAspectGenreImportanceScores(event),
        advisedTask: event?.advised_task || event?.advisedTask || "",
        startDate: dateKey(event?.start_date || event?.startDate),
        endDate: dateKey(event?.end_date || event?.endDate),
      };
    })
    : transitAspectItemsFromForecast(
      forecast,
      "",
      [],
      ["all_aspects", "allAspects", "events"],
    );
  const categories = { love: [], work: [], money: [] };
  items.forEach((item) => {
    const itemCategories = Array.isArray(item.applicableGenres)
      ? item.applicableGenres
      : annualAspectApplicableGenres(item);
    Object.keys(categories).forEach((category) => {
      const scoreComponents = item.genreScoreComponents?.[category] || {};
      const positiveImpact = scoreComponents.positive;
      const negativeImpact = scoreComponents.negative;
      const strongestImpact = Math.max(
        Number.isFinite(positiveImpact) ? positiveImpact : -Infinity,
        Number.isFinite(negativeImpact) ? negativeImpact : -Infinity,
      );
      if (
        itemCategories.includes(category)
        && Number.isFinite(strongestImpact)
        && strongestImpact >= ANNUAL_GENRE_ASPECT_MIN_COMPONENT_SCORE
      ) {
        categories[category].push({
          ...item,
          description: item.genreDescriptions?.[category] || "",
          positiveImpact,
          negativeImpact,
        });
      }
    });
  });
  Object.keys(categories).forEach((category) => {
    categories[category] = categories[category]
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.key.localeCompare(b.key));
  });
  return categories;
}

function mergeUniqueForecastItems(existing, incoming, keyBuilder) {
  const merged = new Map();
  [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])]
    .forEach((item, index) => merged.set(keyBuilder(item, index), item));
  return Array.from(merged.values());
}

function mergeYearlyForecastDetail(forecast, detail) {
  const current = forecast || {};
  const scope = detail?.detail_scope || detail?.detailScope;
  const detailLoaded = current.detail_loaded || current.detailLoaded || { annual: false, months: [], days: [] };
  if (scope === "day") {
    const incomingDay = Array.isArray(detail?.yearly_data) ? detail.yearly_data[0] : null;
    if (!incomingDay) return current;
    const incomingDate = dateKey(incomingDay.date);
    return {
      ...current,
      yearly_data: (current.yearly_data || []).map((day) => (
        dateKey(day?.date) === incomingDate ? { ...day, ...incomingDay } : day
      )),
      detail_loaded: {
        ...detailLoaded,
        days: [...new Set([...(detailLoaded.days || []), incomingDate])],
      },
    };
  }
  if (scope === "month") {
    const detailMonth = Number(detail?.detail_month || detail?.detailMonth);
    const currentPeaks = current.monthly_peak_periods || current.monthlyPeakPeriods || {};
    const incomingPeaks = detail.monthly_peak_periods || detail.monthlyPeakPeriods || {};
    const mergedPeaks = {};
    new Set([...Object.keys(currentPeaks), ...Object.keys(incomingPeaks)]).forEach((genre) => {
      mergedPeaks[genre] = mergeUniqueForecastItems(
        currentPeaks[genre],
        incomingPeaks[genre],
        (item) => `${item?.start_date}-${item?.end_date}-${item?.peak_date}-${item?.title}`,
      );
    });
    const mergePeriodItems = (key) => mergeUniqueForecastItems(
      current[key],
      detail[key],
      (item) => `${item?.id || ""}-${item?.start_date || item?.date}-${item?.end_date || ""}-${item?.t_planet || ""}-${item?.n_planet || ""}-${item?.aspect_angle ?? ""}`,
    );
    const currentMonthlyOverviews = current.monthly_overviews || current.monthlyOverviews || {};
    const incomingMonthlyOverviews = detail.monthly_overviews || detail.monthlyOverviews || {};
    return {
      ...current,
      monthly_overviews: { ...currentMonthlyOverviews, ...incomingMonthlyOverviews },
      monthly_peak_periods: mergedPeaks,
      monthly_sun_themes: mergePeriodItems("monthly_sun_themes"),
      monthly_mars_themes: mergePeriodItems("monthly_mars_themes"),
      annual_sun_aspects: mergePeriodItems("annual_sun_aspects"),
      annual_mars_aspects: mergePeriodItems("annual_mars_aspects"),
      detail_loaded: {
        ...detailLoaded,
        months: [...new Set([...(detailLoaded.months || []), detailMonth])].filter(Number.isFinite),
      },
    };
  }
  if (scope === "annual") {
    return {
      ...current,
      ...detail,
      detail_loaded: { ...detailLoaded, annual: true },
    };
  }
  return current;
}

function yearlyDayDetailLoaded(forecast, value) {
  const targetDate = dateKey(value);
  const day = (forecast?.yearly_data || []).find((item) => dateKey(item?.date) === targetDate);
  return Boolean(day && Array.isArray(day.all_aspects) && day.transit_chart);
}

function yearlyMonthDetailLoaded(forecast, month) {
  const detailLoaded = forecast?.detail_loaded || forecast?.detailLoaded;
  if (!detailLoaded) return Boolean(forecast?.monthly_peak_periods || forecast?.monthlyPeakPeriods);
  return (detailLoaded.months || []).map(Number).includes(Number(month));
}

function yearlyAnnualDetailLoaded(forecast) {
  const detailLoaded = forecast?.detail_loaded || forecast?.detailLoaded;
  if (!detailLoaded) return Boolean(forecast?.annual_themes || forecast?.annualThemes);
  return detailLoaded.annual === true;
}

function normalizedPlanet(value) {
  return String(value || "").trim().toUpperCase().replace(/^TRANSIT_/, "");
}

function circularAngleDistance(a, b) {
  const diff = Math.abs(((Number(a) - Number(b) + 540) % 360) - 180);
  return Number.isFinite(diff) ? diff : null;
}

function longitudeAngle(longitude) {
  return THREE.MathUtils.degToRad(90 - Number(longitude));
}

function longitudePosition(longitude, radius, y = 0) {
  const angle = longitudeAngle(longitude);
  return new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
}

function positionTubeBetweenPoints(mesh, startPosition, endPosition) {
  if (!mesh || !startPosition || !endPosition) return;
  const direction = endPosition.clone().sub(startPosition);
  const distance = direction.length();
  if (!distance) return;
  mesh.position.copy(startPosition).add(endPosition).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.scale.set(1, distance, 1);
}

function interpolateLongitude(start, end, progress) {
  const delta = ((Number(end) - Number(start) + 540) % 360) - 180;
  const longitude = normalizeLongitude(Number(start) + delta * progress);
  return longitude ?? (Number(end) || 0);
}

function updateAspectLinePositions(state) {
  if (!state?.aspectGroup) return;
  state.aspectGroup.children.forEach((line) => {
    const link = line.userData?.aspectLink;
    if (!link) return;
    const transitPosition = state.transitPositions.get(link.transitPlanet);
    const otherTransitPosition = link.transitPlanetB ? state.transitPositions.get(link.transitPlanetB) : null;
    const natalEntry = link.natalPlanet ? state.natalMeshes.get(link.natalPlanet) : null;
    const otherNatalEntry = link.natalPlanetB ? state.natalMeshes.get(link.natalPlanetB) : null;
    const startPosition = otherTransitPosition ? transitPosition : natalEntry?.mesh?.position;
    const endPosition = otherTransitPosition || otherNatalEntry?.mesh?.position || transitPosition;
    if (!startPosition || !endPosition) return;
    if (line.userData?.aspectGlowTube) {
      positionTubeBetweenPoints(line, startPosition, endPosition);
      return;
    }
    const position = line.geometry?.attributes?.position;
    if (position && position.count >= 2) {
      position.setXYZ(0, startPosition.x, startPosition.y, startPosition.z);
      position.setXYZ(1, endPosition.x, endPosition.y, endPosition.z);
      position.needsUpdate = true;
    } else {
      line.geometry?.dispose?.();
      line.geometry = new THREE.BufferGeometry().setFromPoints([startPosition.clone(), endPosition.clone()]);
    }
  });
}

function liveAspectForAngle(angle) {
  if (angle === null || angle === undefined || !Number.isFinite(Number(angle))) return null;
  for (const aspect of LIVE_ASPECT_DEFS) {
    const orb = Math.abs(Number(angle) - aspect.angle);
    if (orb <= aspect.orb) {
      return { angle: aspect.angle, orb };
    }
  }
  return null;
}

function chartTransitMap(chart) {
  return new Map(
    (Array.isArray(chart?.transits) ? chart.transits : [])
      .map((item) => [item.planet, normalizeLongitude(item.longitude)])
      .filter(([, longitude]) => longitude !== null)
  );
}

function liveAspectsFromChart(chart, natalPoints = []) {
  const transits = Array.isArray(chart?.transits) ? chart.transits : [];
  return transits.flatMap((transit) => {
    const transitPlanet = normalizedPlanet(transit?.planet || transit?.name);
    const transitLongitude = normalizeLongitude(transit?.longitude);
    if (!TRANSIT_PLANET_ORDER.includes(transitPlanet) || transitLongitude === null) return [];
    return natalPoints
      .map((natal) => {
        const natalPlanet = normalizedPlanet(natal?.planet);
        const natalLongitude = normalizeLongitude(natal?.longitude);
        if (!NATAL_POINT_ORDER.includes(natalPlanet) || natalLongitude === null) return null;
        const aspect = liveAspectForAngle(circularAngleDistance(transitLongitude, natalLongitude));
        if (!aspect) return null;
        return {
          scope: "transitNatal",
          natalPlanet,
          transitPlanet,
          angle: aspect.angle,
          orb: aspect.orb,
          color: aspectLineColor(aspect.angle),
        };
      })
      .filter(Boolean);
  });
}

function transitTransitAspectsFromTransits(transits = []) {
  const normalizedTransits = transits
    .map((item) => ({
      planet: normalizedPlanet(item?.planet || item?.name),
      longitude: normalizeLongitude(item?.longitude),
    }))
    .filter((item) => TRANSIT_PLANET_ORDER.includes(item.planet) && item.longitude !== null);
  return normalizedTransits.flatMap((fromTransit, fromIndex) => normalizedTransits.slice(fromIndex + 1).map((toTransit) => {
    const aspect = liveAspectForAngle(circularAngleDistance(fromTransit.longitude, toTransit.longitude));
    if (!aspect) return null;
    return {
      scope: "transitTransit",
      transitPlanet: fromTransit.planet,
      transitPlanetB: toTransit.planet,
      angle: aspect.angle,
      orb: aspect.orb,
      color: aspectLineColor(aspect.angle),
    };
  }).filter(Boolean));
}

function liveTransitTransitAspectsFromChart(chart) {
  return transitTransitAspectsFromTransits(Array.isArray(chart?.transits) ? chart.transits : []);
}

function natalNatalAspectsFromPoints(natalPoints = []) {
  const normalizedNatalPoints = natalPoints
    .map((item) => ({
      planet: normalizedPlanet(item?.planet || item?.name),
      longitude: normalizeLongitude(item?.longitude),
    }))
    .filter((item) => NATAL_POINT_ORDER.includes(item.planet) && item.longitude !== null);
  return normalizedNatalPoints.flatMap((fromNatal, fromIndex) => normalizedNatalPoints.slice(fromIndex + 1).map((toNatal) => {
    const aspect = liveAspectForAngle(circularAngleDistance(fromNatal.longitude, toNatal.longitude));
    if (!aspect) return null;
    return {
      scope: "natalNatal",
      natalPlanet: fromNatal.planet,
      natalPlanetB: toNatal.planet,
      angle: aspect.angle,
      orb: aspect.orb,
      color: aspectLineColor(aspect.angle),
    };
  }).filter(Boolean));
}

function aspectMergeKey(aspect) {
  const scope = aspect?.scope || "transitNatal";
  const angle = normalizeAspectAngle(aspect?.angle);
  if (scope === "transitTransit") {
    return `tt-${aspect?.transitPlanet || ""}-${aspect?.transitPlanetB || ""}-${angle}`;
  }
  if (scope === "natalNatal") {
    return `nn-${aspect?.natalPlanet || ""}-${aspect?.natalPlanetB || ""}-${angle}`;
  }
  return `tn-${aspect?.transitPlanet || aspect?.planet || ""}-${aspect?.natalPlanet || ""}-${angle}`;
}

function aspectLineHighlightKey(aspect) {
  if (!aspect) return "";
  if (Array.isArray(aspect.components) && aspect.key) return `compound:${aspect.key}`;
  return `line:${aspectMergeKey(aspect)}`;
}

function aspectMatchesLineHighlight(aspect, highlightKey) {
  if (!aspect || !highlightKey) return false;
  if (highlightKey.startsWith("compound:")) {
    return aspect.compoundKey === highlightKey.slice("compound:".length);
  }
  return highlightKey === aspectLineHighlightKey(aspect);
}

function mergeAspectSources(preferred = [], supplemental = []) {
  const merged = [];
  const seen = new Set();
  [...preferred, ...supplemental].forEach((aspect) => {
    const key = aspectMergeKey(aspect);
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(aspect);
  });
  return merged;
}

function aspectEndpointIds(aspect) {
  if (!aspect) return [];
  if (aspect.scope === "transitTransit") {
    return [`T:${aspect.transitPlanet}`, `T:${aspect.transitPlanetB}`].filter((value) => value && !value.endsWith(":undefined"));
  }
  if (aspect.scope === "natalNatal") {
    return [`N:${aspect.natalPlanet}`, `N:${aspect.natalPlanetB}`].filter((value) => value && !value.endsWith(":undefined"));
  }
  return [`T:${aspect.transitPlanet || aspect.planet}`, `N:${aspect.natalPlanet}`].filter((value) => value && !value.endsWith(":undefined"));
}

function aspectEndpointLabel(id) {
  const [type, planet] = String(id || "").split(":");
  if (!planet) return "";
  return `${type === "N" ? "N" : "T"}${planetLabel(planet)}`;
}

function compoundAspectKey(ids, kind) {
  return `${kind}-${ids.slice().sort().join("-")}`;
}

function combinations(items, size) {
  const result = [];
  const walk = (start, chosen) => {
    if (chosen.length === size) {
      result.push(chosen);
      return;
    }
    for (let index = start; index <= items.length - (size - chosen.length); index += 1) {
      walk(index + 1, [...chosen, items[index]]);
    }
  };
  walk(0, []);
  return result;
}

function aspectCount(edges = []) {
  return edges.reduce((counts, edge) => {
    const angle = normalizeAspectAngle(edge?.angle);
    if (angle !== null) counts[angle] = (counts[angle] || 0) + 1;
    return counts;
  }, {});
}

function countMatches(counts, expected) {
  return Object.entries(expected).every(([angle, count]) => (counts[angle] || 0) === count);
}

function existingEdgesForIds(ids, pairMap) {
  return combinations(ids, 2)
    .map(([a, b]) => pairMap.get([a, b].sort().join("|")))
    .filter(Boolean);
}

function compoundNodeInfo(id) {
  const [type, planet] = String(id || "").split(":");
  return { type, planet: normalizedPlanet(planet) };
}

function isTenPlanetNode(id) {
  const { planet } = compoundNodeInfo(id);
  return TRANSIT_PLANET_ORDER.includes(planet);
}

function isNatalSensitiveNode(id) {
  const { type, planet } = compoundNodeInfo(id);
  return type === "N" && SENSITIVE_POINT_ORDER.includes(planet);
}

function isTransitSensitiveNode(id) {
  const { type, planet } = compoundNodeInfo(id);
  return type === "T" && SENSITIVE_POINT_ORDER.includes(planet);
}

function tSquareAllowsNatalSensitivePoint(ids = [], components = []) {
  const opposition = components.find((edge) => normalizeAspectAngle(edge?.angle) === 180);
  const baseIds = Array.isArray(opposition?.compoundEndpointIds) ? opposition.compoundEndpointIds : aspectEndpointIds(opposition);
  if (baseIds.length !== 2) return false;
  const apexId = ids.find((id) => !baseIds.includes(id));
  const apexInfo = compoundNodeInfo(apexId);
  if (apexInfo.type !== "T" || !isTenPlanetNode(apexId)) return false;
  return ids.filter(isNatalSensitiveNode).every((id) => baseIds.includes(id));
}

function sensitivePointsAreOnOppositionAxes(ids = [], components = []) {
  const oppositionEdges = components.filter((edge) => normalizeAspectAngle(edge?.angle) === 180);
  return ids.filter(isNatalSensitiveNode).every((id) => oppositionEdges.some((edge) => {
    const edgeIds = Array.isArray(edge?.compoundEndpointIds) ? edge.compoundEndpointIds : aspectEndpointIds(edge);
    return edgeIds.includes(id);
  }));
}

function boomerangAllowsNatalSensitivePoint(ids = [], components = []) {
  const sextileEdge = components.find((edge) => normalizeAspectAngle(edge?.angle) === 60);
  const sextileIds = Array.isArray(sextileEdge?.compoundEndpointIds) ? sextileEdge.compoundEndpointIds : aspectEndpointIds(sextileEdge);
  if (sextileIds.length !== 2) return false;
  return ids.filter(isNatalSensitiveNode).every((id) => !sextileIds.includes(id));
}

function shouldUseCompoundGroup({ ids = [], components = [], kind }) {
  const normalizedIds = ids.filter(Boolean);
  if (normalizedIds.some(isTransitSensitiveNode)) return false;
  const sensitiveIds = normalizedIds.filter(isNatalSensitiveNode);
  const planetCount = normalizedIds.filter(isTenPlanetNode).length;
  if (planetCount < 2) return false;
  if (!sensitiveIds.length) return true;
  if (kind === "grandTrine" || kind === "miniGrandTrine") return false;
  if (kind === "kite") return false;
  if (kind === "tSquare") return tSquareAllowsNatalSensitivePoint(normalizedIds, components);
  if (kind === "grandCross" || kind === "mysticRectangle") return sensitivePointsAreOnOppositionAxes(normalizedIds, components);
  if (kind === "boomerang") return boomerangAllowsNatalSensitivePoint(normalizedIds, components);
  return false;
}

function pushCompoundGroup(groups, { ids, components, kind, title, description, color }) {
  if (!components?.length) return;
  if (!shouldUseCompoundGroup({ ids, components, kind })) return;
  const labels = ids.map(aspectEndpointLabel).filter(Boolean);
  const key = compoundAspectKey(ids, kind);
  if (groups.some((group) => group.key === key)) return;
  groups.push({
    scope: "composite",
    ids,
    labels,
    components,
    orb: Math.max(...components.map((edge) => Math.abs(Number(edge.orb) || 0))),
    key,
    kind,
    title: `${title}: ${labels.join(" × ")}`,
    description,
    color,
  });
}

function compoundKindLabel(kind) {
  return ({
    tSquare: "Tスクエア",
    grandTrine: "グランド・トライン",
    yod: "ヨッド",
    miniGrandTrine: "小三角形 / ミニ・グランドトライン",
    grandCross: "グランド・クロス",
    kite: "カイト",
    mysticRectangle: "ミスティック・レクタングル",
    boomerang: "ブーメラン",
    homeBase: "ホームベース",
    grandSextile: "グランド・セクスタイル",
  })[kind] || "複合アスペクト";
}

function compoundKindDetailText(kind) {
  return ({
    tSquare: "180°×1 / 90°×2",
    grandTrine: "120°×3",
    yod: "150°×2 / 60°×1",
    miniGrandTrine: "120°×1 / 60°×2",
    grandCross: "180°×2 / 90°×4",
    kite: "180°×1 / 120°×3 / 60°×2",
    mysticRectangle: "180°×2 / 120°×2 / 60°×2",
    boomerang: "180°×1 / 150°×2 / 60°×1",
    homeBase: "60°連続",
    grandSextile: "180°×3 / 120°×6 / 60°×6",
  })[kind] || "";
}

function compoundGroupCategory(group) {
  const ids = Array.isArray(group?.ids) ? group.ids : [];
  const hasNatal = ids.some((id) => String(id).startsWith("N:"));
  const hasTransit = ids.some((id) => String(id).startsWith("T:"));
  if (hasNatal && hasTransit) return "mixed";
  if (hasTransit) return "transitOnly";
  return "natalOnly";
}

function isCompoundAspectMode(mode) {
  return ["composite", "compositeTransit", "compositeTransitNatal"].includes(mode);
}

function compoundCategoryForAspectMode(mode) {
  if (mode === "compositeTransit") return "transitOnly";
  if (mode === "compositeTransitNatal") return "mixed";
  return "";
}

function detectCompoundAspects(aspects = [], { realtimeOnly = false } = {}) {
  const pairMap = new Map();
  const nodeSet = new Set();
  const allowedAngles = realtimeOnly ? [90, 120, 180] : COMPOUND_ASPECT_ANGLES;
  aspects
    .forEach((aspect) => {
      const angle = normalizeAspectAngle(aspect.angle);
      if (!allowedAngles.includes(angle)) return;
      const ids = aspectEndpointIds(aspect);
      if (ids.length !== 2 || ids[0] === ids[1]) return;
      const sortedIds = ids.slice().sort();
      sortedIds.forEach((id) => nodeSet.add(id));
      const key = sortedIds.join("|");
      const current = pairMap.get(key);
      if (!current || Math.abs(Number(aspect.orb) || 99) < Math.abs(Number(current.orb) || 99)) {
        pairMap.set(key, { ...aspect, angle, compoundEndpointIds: sortedIds });
      }
    });

  const nodes = Array.from(nodeSet).sort();
  const groups = [];
  combinations(nodes, 3).forEach((ids) => {
    const edges = existingEdgesForIds(ids, pairMap);
    if (edges.length !== 3) return;
    const counts = aspectCount(edges);
    if (countMatches(counts, { 90: 2, 180: 1 })) {
      pushCompoundGroup(groups, {
        ids,
        components: edges,
        kind: "tSquare",
        title: "Tスクエア",
        description: "180度（オポジション）1本と90度（スクエア）2本で形成される複合アスペクトです。",
        color: HARD_ASPECT_LINE_COLOR,
      });
    } else if (countMatches(counts, { 120: 3 })) {
      pushCompoundGroup(groups, {
        ids,
        components: edges,
        kind: "grandTrine",
        title: "グランド・トライン",
        description: "120度（トライン）3本で形成される複合アスペクトです。",
        color: SOFT_ASPECT_LINE_COLOR,
      });
    } else if (!realtimeOnly && countMatches(counts, { 60: 1, 150: 2 })) {
      pushCompoundGroup(groups, {
        ids,
        components: edges,
        kind: "yod",
        title: "ヨッド",
        description: "60度（セクスタイル）1本と150度（インコンジャンクション）2本で形成される複合アスペクトです。",
        color: NEUTRAL_ASPECT_LINE_COLOR,
      });
    } else if (!realtimeOnly && countMatches(counts, { 60: 2, 120: 1 })) {
      pushCompoundGroup(groups, {
        ids,
        components: edges,
        kind: "miniGrandTrine",
        title: "小三角形 / ミニ・グランドトライン",
        description: "120度1本と60度2本で形成される複合アスペクトです。",
        color: SOFT_ASPECT_LINE_COLOR,
      });
    }
  });
  if (realtimeOnly) {
    return groups.sort((a, b) => (a.kind === b.kind ? a.key.localeCompare(b.key) : a.kind.localeCompare(b.kind)));
  }

  const edgeBetween = (a, b) => pairMap.get([a, b].sort().join("|")) || null;
  const edgeHasAngle = (edge, angle) => normalizeAspectAngle(edge?.angle) === angle;
  const baseGroupsByKind = (kind) => groups.filter((group) => group.kind === kind);
  const uniqueComponents = (edges = []) => {
    const seen = new Set();
    return edges.filter((edge) => {
      const key = aspectMergeKey(edge);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const matchingOppositionEdges = (aIds = [], bIds = []) => {
    const walk = (remainingA, remainingB, chosen) => {
      if (!remainingA.length) return chosen;
      const [currentA, ...nextA] = remainingA;
      for (const currentB of remainingB) {
        const edge = edgeBetween(currentA, currentB);
        if (!edgeHasAngle(edge, 180)) continue;
        const nextB = remainingB.filter((id) => id !== currentB);
        const result = walk(nextA, nextB, [...chosen, edge]);
        if (result) return result;
      }
      return null;
    };
    return walk(aIds, bIds, []);
  };

  baseGroupsByKind("tSquare").forEach((group) => {
    const apexId = group.ids.find((id) => (
      group.components.filter((edge) => edgeHasAngle(edge, 90) && edge.compoundEndpointIds?.includes(id)).length === 2
    ));
    if (!apexId) return;
    const baseIds = group.ids.filter((id) => id !== apexId);
    nodes.forEach((extraId) => {
      if (group.ids.includes(extraId)) return;
      const apexOpposition = edgeBetween(apexId, extraId);
      const squareA = edgeBetween(extraId, baseIds[0]);
      const squareB = edgeBetween(extraId, baseIds[1]);
      if (!edgeHasAngle(apexOpposition, 180) || !edgeHasAngle(squareA, 90) || !edgeHasAngle(squareB, 90)) return;
      pushCompoundGroup(groups, {
        ids: [...group.ids, extraId].sort(),
        components: [...group.components, apexOpposition, squareA, squareB],
        kind: "grandCross",
        title: "グランド・クロス",
        description: "180度2本と90度4本で形成される複合アスペクトです。",
        color: HARD_ASPECT_LINE_COLOR,
      });
    });
  });

  baseGroupsByKind("grandTrine").forEach((group) => {
    group.ids.forEach((anchorId) => {
      const sideIds = group.ids.filter((id) => id !== anchorId);
      nodes.forEach((extraId) => {
        if (group.ids.includes(extraId)) return;
        const opposition = edgeBetween(anchorId, extraId);
        const sextileA = edgeBetween(extraId, sideIds[0]);
        const sextileB = edgeBetween(extraId, sideIds[1]);
        if (!edgeHasAngle(opposition, 180) || !edgeHasAngle(sextileA, 60) || !edgeHasAngle(sextileB, 60)) return;
        pushCompoundGroup(groups, {
          ids: [...group.ids, extraId].sort(),
          components: [...group.components, opposition, sextileA, sextileB],
          kind: "kite",
          title: "カイト",
          description: "グランド・トラインに180度1本と60度2本が加わる複合アスペクトです。",
          color: SOFT_ASPECT_LINE_COLOR,
        });
      });
    });
  });

  baseGroupsByKind("yod").forEach((group) => {
    const apexId = group.ids.find((id) => (
      group.components.filter((edge) => edgeHasAngle(edge, 150) && edge.compoundEndpointIds?.includes(id)).length === 2
    ));
    if (!apexId) return;
    nodes.forEach((extraId) => {
      if (group.ids.includes(extraId)) return;
      const opposition = edgeBetween(apexId, extraId);
      if (!edgeHasAngle(opposition, 180)) return;
      pushCompoundGroup(groups, {
        ids: [...group.ids, extraId].sort(),
        components: [...group.components, opposition],
        kind: "boomerang",
        title: "ブーメラン",
        description: "ヨッドの頂点の真向かいに4つ目の天体がある複合アスペクトです。",
        color: NEUTRAL_ASPECT_LINE_COLOR,
      });
    });
  });

  const oppositionEdges = Array.from(pairMap.values()).filter((edge) => edgeHasAngle(edge, 180));
  combinations(oppositionEdges, 2).forEach(([firstOpposition, secondOpposition]) => {
    const firstIds = firstOpposition.compoundEndpointIds || aspectEndpointIds(firstOpposition);
    const secondIds = secondOpposition.compoundEndpointIds || aspectEndpointIds(secondOpposition);
    const ids = [...firstIds, ...secondIds].sort();
    if (new Set(ids).size !== 4) return;
    const softEdges = existingEdgesForIds(ids, pairMap)
      .filter((edge) => [60, 120].includes(normalizeAspectAngle(edge.angle)));
    const counts = aspectCount(softEdges);
    if (softEdges.length !== 4 || !countMatches(counts, { 60: 2, 120: 2 })) return;
    pushCompoundGroup(groups, {
      ids,
      components: [firstOpposition, secondOpposition, ...softEdges],
      kind: "mysticRectangle",
      title: "ミスティック・レクタングル",
      description: "180度2本、120度2本、60度2本で形成される複合アスペクトです。",
      color: SOFT_ASPECT_LINE_COLOR,
    });
  });

  baseGroupsByKind("mysticRectangle").forEach((group) => {
    const trineEdges = group.components.filter((edge) => edgeHasAngle(edge, 120));
    trineEdges.forEach((trineEdge) => {
      const trineIds = trineEdge.compoundEndpointIds || aspectEndpointIds(trineEdge);
      if (trineIds.length !== 2) return;
      nodes.forEach((extraId) => {
        if (group.ids.includes(extraId)) return;
        const sextileA = edgeBetween(extraId, trineIds[0]);
        const sextileB = edgeBetween(extraId, trineIds[1]);
        if (!edgeHasAngle(sextileA, 60) || !edgeHasAngle(sextileB, 60)) return;
        const ids = [...group.ids, extraId].sort();
        pushCompoundGroup(groups, {
          ids,
          components: uniqueComponents([...group.components, sextileA, sextileB]),
          kind: "homeBase",
          title: "ホームベース",
          description: "ミスティック・レクタングルの長辺に60度2本が加わる五角形型の複合アスペクトです。",
          color: SOFT_ASPECT_LINE_COLOR,
        });
      });
    });
  });

  combinations(baseGroupsByKind("grandTrine"), 2).forEach(([firstTrine, secondTrine]) => {
    const ids = [...firstTrine.ids, ...secondTrine.ids].sort();
    if (new Set(ids).size !== 6) return;
    const oppositionMatches = matchingOppositionEdges(firstTrine.ids, secondTrine.ids);
    if (!oppositionMatches || oppositionMatches.length !== 3) return;
    const displayEdges = existingEdgesForIds(ids, pairMap)
      .filter((edge) => [60, 120, 180].includes(normalizeAspectAngle(edge.angle)));
    pushCompoundGroup(groups, {
      ids,
      components: uniqueComponents([...firstTrine.components, ...secondTrine.components, ...oppositionMatches, ...displayEdges]),
      kind: "grandSextile",
      title: "グランド・セクスタイル",
      description: "6つの天体が六芒星を作る複合アスペクトです。",
      color: SOFT_ASPECT_LINE_COLOR,
    });
  });
  return groups.sort((a, b) => (a.kind === b.kind ? a.key.localeCompare(b.key) : a.kind.localeCompare(b.kind)));
}

function compoundAspectLineComponents(groups = []) {
  return groups.flatMap((group) => group.components.map((component) => ({
    ...component,
    color: group.color || component.color,
    compoundKey: group.key,
    compoundKind: group.kind,
    compoundCategory: compoundGroupCategory(group),
    compoundDescription: group.description,
    compoundGroupIds: group.ids,
  })));
}

function playbackAspectCacheForChart(chart, natalPoints = [], includeCompound = false, realtimeCompoundOnly = false) {
  const transitNatalAspects = liveAspectsFromChart(chart, natalPoints);
  const transitTransitAspects = liveTransitTransitAspectsFromChart(chart);
  const natalNatalAspects = natalNatalAspectsFromPoints(natalPoints);
  const allAspects = [
    ...transitNatalAspects,
    ...transitTransitAspects,
    ...natalNatalAspects,
  ];
  return {
    allAspects,
    compoundLineAspects: includeCompound ? compoundAspectLineComponents(detectCompoundAspects(allAspects, { realtimeOnly: realtimeCompoundOnly })) : [],
  };
}

function playbackAspectSourceForFrame(frame, mode) {
  const cache = frame?.aspectCache;
  if (!cache) return [];
  if (isCompoundAspectMode(mode)) return cache.compoundLineAspects || [];
  return cache.allAspects || [];
}

function aspectMatchesFocus(aspect, focus) {
  if (!focus?.type || !focus?.planet) return true;
  if (Array.isArray(aspect.compoundGroupIds) && aspect.compoundGroupIds.length) {
    return aspect.compoundGroupIds.includes(`${focus.type === "natal" ? "N" : "T"}:${focus.planet}`);
  }
  if (focus.type === "natal") return aspect.natalPlanet === focus.planet || aspect.natalPlanetB === focus.planet;
  if (focus.type === "transit") return aspect.transitPlanet === focus.planet || aspect.transitPlanetB === focus.planet;
  return true;
}

function filterAspectLinesForControls(aspects, { focus, selections, mode }) {
  const isCompoundMode = isCompoundAspectMode(mode);
  const renderableAspects = isCompoundMode
    ? aspects.filter((aspect) => COMPOUND_ASPECT_ANGLES.includes(normalizeAspectAngle(aspect.angle)))
    : aspects.filter((aspect) => isRenderable3DAspectAngle(aspect.angle));
  if (isCompoundMode) {
    const compoundCategory = compoundCategoryForAspectMode(mode);
    return renderableAspects.filter((aspect) => (
      Boolean(aspect.compoundKey)
      && (!compoundCategory || aspect.compoundCategory === compoundCategory)
      && aspectMatchesFocus(aspect, focus)
    ));
  }
  if (mode === "transitNatal") {
    return renderableAspects.filter((aspect) => {
      if ((aspect.scope || "transitNatal") !== "transitNatal") return false;
      return aspectMatchesFocus(aspect, focus);
    });
  }
  if (mode === "transitTransit") {
    return renderableAspects.filter((aspect) => {
      if (aspect.scope !== "transitTransit") return false;
      return aspectMatchesFocus(aspect, focus);
    });
  }
  if (mode === "natalNatal") {
    return renderableAspects.filter((aspect) => {
      if (aspect.scope !== "natalNatal") return false;
      return aspectMatchesFocus(aspect, focus);
    });
  }
  const natalSelections = new Set(selections?.transitNatal?.natal || []);
  const transitSelections = new Set(selections?.transitNatal?.transit || []);
  const transitTransitSelections = new Set(selections?.transitTransit?.transit || []);
  const natalNatalSelections = new Set(selections?.natalNatal?.natal || []);
  return renderableAspects.filter((aspect) => {
    const selectedByCustom = aspect.scope === "transitTransit"
      ? transitTransitSelections.has(aspect.transitPlanet) || transitTransitSelections.has(aspect.transitPlanetB)
      : aspect.scope === "natalNatal"
        ? natalNatalSelections.has(aspect.natalPlanet) || natalNatalSelections.has(aspect.natalPlanetB)
        : natalSelections.has(aspect.natalPlanet) || transitSelections.has(aspect.transitPlanet);
    return selectedByCustom && aspectMatchesFocus(aspect, focus);
  });
}

function aspectImportance(aspect) {
  const orb = Math.abs(Number(aspect?.orb));
  if (!Number.isFinite(orb)) return { label: "中", tone: "mid", score: 50 };
  if (orb <= 1.2) return { label: "強", tone: "high", score: 100 - orb };
  if (orb <= 3.2) return { label: "中", tone: "mid", score: 70 - orb };
  return { label: "弱", tone: "low", score: 40 - orb };
}

function aspectInterpretationFallback(aspect) {
  if (aspect?.scope === "transitTransit") {
    return "解釈文がありません。";
  }
  return "解釈文がありません。";
}

function aspectLineRenderSignature(state, aspects = [], showAll, transitLayerActive) {
  const focus = state?.aspectLineFocus;
  const focusKey = focus?.type && focus?.planet ? `${focus.type}:${focus.planet}` : "";
  const lineKeys = [];
  const seen = new Set();
  aspects.forEach((aspect) => {
    const key = aspectMergeKey(aspect);
    if (seen.has(key)) return;
    seen.add(key);
    lineKeys.push(`${key}:${aspectLineColor(aspect.angle, aspect.color)}`);
  });
  return [
    showAll ? "all" : "filtered",
    transitLayerActive ? "transit-on" : "transit-off",
    state?.natalLayerActive ? "natal-on" : "natal-off",
    focusKey,
    state?.selectedAspectLineHighlightKey || "",
    ...lineKeys.sort(),
  ].join("|");
}

function renderAspectLines(state, aspects, showAll, transitLayerActive) {
  if (!state?.aspectGroup) return;
  const nextSignature = aspectLineRenderSignature(state, aspects, showAll, transitLayerActive);
  if (state.aspectLineRenderSignature === nextSignature) {
    updateAspectLinePositions(state);
    return;
  }
  state.aspectLineRenderSignature = nextSignature;
  while (state.aspectGroup.children.length) {
    const child = state.aspectGroup.children.pop();
    child.geometry?.dispose?.();
    child.material?.dispose?.();
  }
  const renderedLineKeys = new Set();
  aspects.forEach((aspect) => {
    const lineKey = aspectMergeKey(aspect);
    if (renderedLineKeys.has(lineKey)) return;
    renderedLineKeys.add(lineKey);
    const transitPosition = state.transitPositions.get(aspect.transitPlanet);
    const otherTransitPosition = aspect.scope === "transitTransit" ? state.transitPositions.get(aspect.transitPlanetB) : null;
    const natalEntry = aspect.scope === "transitTransit" ? null : state.natalMeshes.get(aspect.natalPlanet);
    const otherNatalEntry = aspect.scope === "natalNatal" ? state.natalMeshes.get(aspect.natalPlanetB) : null;
    const startPosition = aspect.scope === "transitTransit" ? transitPosition : natalEntry?.mesh?.position;
    const endPosition = aspect.scope === "transitTransit"
      ? otherTransitPosition
      : aspect.scope === "natalNatal"
        ? otherNatalEntry?.mesh?.position
        : transitPosition;
    if (!startPosition || !endPosition) return;
    const shouldHighlightLine = Boolean(state.aspectLineFocus);
    const lineLayerActive = aspect.scope === "natalNatal" ? state.natalLayerActive : transitLayerActive;
    const colorValue = aspectLineColor(aspect.angle, aspect.color);
    const lineColor = new THREE.Color(colorValue);
    const isLineHighlighted = aspectMatchesLineHighlight(aspect, state.selectedAspectLineHighlightKey);
    const shouldDimUnrelatedLines = String(state.selectedAspectLineHighlightKey || "").startsWith("compound:");
    const baseLineOpacity = shouldDimUnrelatedLines && !isLineHighlighted
      ? 0.12
      : shouldHighlightLine ? 0.78 : showAll ? 0.34 : lineLayerActive ? 0.66 : 0.18;
    if (isLineHighlighted) {
      [
        { radius: 0.038, opacity: 0.3 },
        { radius: 0.074, opacity: 0.13 },
      ].forEach((glow, glowIndex) => {
        const glowLine = new THREE.Mesh(
          new THREE.CylinderGeometry(glow.radius, glow.radius, 1, 16, 1, true),
          new THREE.MeshBasicMaterial({
            color: lineColor.clone(),
            transparent: true,
            opacity: glow.opacity,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: false,
            side: THREE.DoubleSide,
          })
        );
        positionTubeBetweenPoints(glowLine, startPosition, endPosition);
        glowLine.renderOrder = 8 + glowIndex;
        glowLine.userData.aspectLink = {
          natalPlanet: aspect.natalPlanet,
          natalPlanetB: aspect.natalPlanetB,
          transitPlanet: aspect.transitPlanet,
          transitPlanetB: aspect.transitPlanetB,
        };
        glowLine.userData.aspectGlowTube = true;
        glowLine.userData.aspectGlowBaseOpacity = glow.opacity;
        state.aspectGroup.add(glowLine);
      });
    }
    const aspectLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([startPosition.clone(), endPosition.clone()]),
      new THREE.LineBasicMaterial({
        color: lineColor,
        transparent: true,
        opacity: isLineHighlighted ? 0.98 : baseLineOpacity,
      })
    );
    aspectLine.renderOrder = isLineHighlighted ? 10 : 1;
    aspectLine.userData.aspectLink = {
      natalPlanet: aspect.natalPlanet,
      natalPlanetB: aspect.natalPlanetB,
      transitPlanet: aspect.transitPlanet,
      transitPlanetB: aspect.transitPlanetB,
    };
    state.aspectGroup.add(aspectLine);
  });
}

function applyLiveAspectHighlights(state, aspects) {
  if (!state) return;
  const natalHighlights = new Set((aspects || []).flatMap((aspect) => [aspect.natalPlanet, aspect.natalPlanetB]).filter(Boolean));
  const transitHighlights = new Set((aspects || []).flatMap((aspect) => [aspect.transitPlanet, aspect.transitPlanetB]).filter(Boolean));
  if (state.aspectLineFocus?.type === "natal") {
    natalHighlights.add(state.aspectLineFocus.planet);
  } else if (state.aspectLineFocus?.type === "transit") {
    transitHighlights.add(state.aspectLineFocus.planet);
  }
  state.natalMeshes?.forEach(({ mesh, material, point }, planet) => {
    const shouldHighlight = natalHighlights.has(planet);
    const baseColor = new THREE.Color(point.color);
    material.color.copy(shouldHighlight ? new THREE.Color(0xffffff) : baseColor.lerp(new THREE.Color("#9ca3af"), state.natalLayerActive ? 0.12 : 0.58));
    material.emissive.copy(new THREE.Color(point.color));
    material.emissiveIntensity = state.isFlatMapView
      ? (shouldHighlight ? 0.38 : state.natalLayerActive ? 0.08 : 0.003)
      : shouldHighlight ? 1.15 : state.natalLayerActive ? 0.42 : 0.004;
    material.opacity = state.isFlatMapView
      ? (shouldHighlight ? 0.48 : state.natalLayerActive ? 0.28 : 0.035)
      : shouldHighlight ? 0.78 : state.natalLayerActive ? 0.58 : 0.045;
    mesh.renderOrder = shouldHighlight ? 3 : 1;
    mesh.scale.setScalar(shouldHighlight ? 1.32 : state.natalLayerActive ? 0.94 : 0.72);
  });
  state.natalPlanetSymbols?.forEach(({ sprite, planet, brightOpacity, dimOpacity, normalTexture, flatTexture }) => {
    const shouldHighlight = natalHighlights.has(planet);
    sprite.material.map = state.isFlatMapView && flatTexture ? flatTexture : normalTexture;
    sprite.material.needsUpdate = true;
    sprite.material.opacity = state.isFlatMapView
      ? (shouldHighlight ? 1 : state.natalLayerActive ? 1 : 0.08)
      : shouldHighlight ? 1 : state.natalLayerActive ? brightOpacity : Math.min(dimOpacity, 0.08);
  });
  state.transitLayerObjects?.forEach((entry) => {
    const object = entry.object || entry;
    const material = object.material;
    const shouldHighlight = transitHighlights.has(entry.planet);
    if (!material) return;
    material.transparent = true;
    const brightOpacity = state.isFlatMapView ? entry.flatBrightOpacity ?? (entry.object?.isMesh ? 0.26 : entry.brightOpacity ?? 1) : entry.brightOpacity ?? 1;
    const dimOpacity = state.isFlatMapView
      ? Math.min(entry.flatDimOpacity ?? (entry.object?.isMesh ? 0.09 : entry.dimOpacity ?? 0.18), 0.025)
      : Math.min(entry.dimOpacity ?? 0.18, 0.04);
    material.opacity = shouldHighlight ? Math.max(brightOpacity, 0.82) : state.transitLayerActive ? brightOpacity : dimOpacity;
    if (material.emissiveIntensity !== undefined) {
      material.emissiveIntensity = shouldHighlight
        ? Math.max(entry.brightEmissiveIntensity ?? material.emissiveIntensity ?? 0.08, state.isFlatMapView ? 0.12 : 0.55)
        : state.transitLayerActive
          ? state.isFlatMapView ? 0.06 : entry.brightEmissiveIntensity ?? material.emissiveIntensity
          : Math.min(entry.dimEmissiveIntensity ?? 0.02, 0.004);
    }
  });
  state.transitVisuals?.forEach((visual, planet) => {
    visual.mesh?.scale?.setScalar(transitHighlights.has(planet) ? 1.16 : 1);
  });
  state.selectedPulseMesh = state.aspectLineFocus?.type === "natal"
    ? state.natalMeshes?.get(state.aspectLineFocus.planet)?.mesh || null
    : state.aspectLineFocus?.type === "transit"
      ? state.transitVisuals?.get(state.aspectLineFocus.planet)?.mesh || null
    : null;
  state.selectedPulseBaseScale = state.aspectLineFocus?.type === "transit" ? 1.16 : 1.32;
}

function chartHouseCusps(chart) {
  return (Array.isArray(chart?.house_cusps) ? chart.house_cusps : [])
    .map(normalizeLongitude)
    .filter((longitude) => longitude !== null)
    .slice(0, 12);
}

function interpolatedTransitChart(fromFrame, toFrame, progress, dateValue, timeValue) {
  const fromChart = fromFrame?.chart || fromFrame;
  const toChart = toFrame?.chart || toFrame;
  const fromTransits = fromFrame?.transitMap || chartTransitMap(fromChart);
  const toTransits = toFrame?.transitMap || chartTransitMap(toChart);
  const transits = (Array.isArray(toChart?.transits) ? toChart.transits : []).map((item) => {
    const startLongitude = fromTransits.get(item.planet);
    const targetLongitude = toTransits.get(item.planet);
    return {
      ...item,
      longitude: startLongitude === undefined || targetLongitude === undefined
        ? item.longitude
        : interpolateLongitude(startLongitude, targetLongitude, progress),
    };
  });
  const fromCusps = fromFrame?.houseCusps || chartHouseCusps(fromChart);
  const toCusps = toFrame?.houseCusps || chartHouseCusps(toChart);
  const houseCusps = fromCusps.length >= 12 && toCusps.length >= 12
    ? fromCusps.map((longitude, index) => interpolateLongitude(longitude, toCusps[index], progress))
    : (Array.isArray(toChart?.house_cusps) ? toChart.house_cusps : []);
  return {
    ...(toChart || {}),
    date: dateKey(dateValue) || toChart?.date || "",
    time: timeValue || toChart?.time || "",
    transits,
    house_cusps: houseCusps,
  };
}

function playbackHasCheckedAspectTargets(state) {
  return Boolean(
    (state?.aspectLineMode || "transitNatal") !== "custom"
    ||
    state?.aspectLineSelections?.transitNatal?.natal?.length
    || state?.aspectLineSelections?.transitNatal?.transit?.length
    || state?.aspectLineSelections?.transitTransit?.transit?.length
    || state?.aspectLineSelections?.natalNatal?.natal?.length
  );
}

function playbackAspectControlsKey(state, frame) {
  const mode = state?.aspectLineMode || "transitNatal";
  const focus = state?.aspectLineFocus;
  return [
    mode,
    focus?.type || "",
    focus?.planet || "",
    Object.entries(state?.aspectLineSelections || {})
      .map(([scope, groups]) => `${scope}:${(groups?.natal || []).join(".")}:${(groups?.transit || []).join(".")}`)
      .join("|"),
    frame?.date || frame?.chart?.date || "",
    frame?.time || frame?.chart?.time || "",
  ].join(";");
}

function syncPlaybackAspectLines(state, frame, force = false) {
  if (!state?.aspectGroup || !frame) return;
  const hasCheckedAspectTargets = playbackHasCheckedAspectTargets(state);
  if (!hasCheckedAspectTargets && !state.aspectLineFocus && (state.aspectLineMode || "transitNatal") === "custom") {
    state.playbackAspectControlsKey = "";
    renderAspectLines(state, [], false, state.transitLayerActive);
    applyLiveAspectHighlights(state, []);
    return;
  }
  const controlsKey = playbackAspectControlsKey(state, frame);
  if (!force && state.playbackAspectControlsKey === controlsKey) return;
  state.playbackAspectControlsKey = controlsKey;
  const mode = state.aspectLineMode || "transitNatal";
  const sourceAspects = playbackAspectSourceForFrame(frame, mode);
  const filteredAspects = filterAspectLinesForControls(sourceAspects, {
    focus: state.aspectLineFocus,
    selections: state.aspectLineSelections,
    mode,
  });
  renderAspectLines(state, filteredAspects, hasCheckedAspectTargets, state.transitLayerActive);
  applyLiveAspectHighlights(state, filteredAspects);
}

function setTransitVisualsFromCharts(state, fromFrame, toFrame, progress) {
  if (!state?.transitVisuals) return;
  const fromChart = fromFrame?.chart || fromFrame;
  const toChart = toFrame?.chart || toFrame;
  const radii = state.mapRadii || {};
  const transitPlanetRadius = radii.transitPlanetRadius ?? 3.88;
  const transitHouseInnerRadius = radii.transitHouseInnerRadius ?? 3.28;
  const transitOrbitRadius = radii.transitOrbitRadius ?? 4.15;
  const transitHouseLabelRadius = radii.transitHouseLabelRadius ?? 3.72;
  const fromTransits = fromFrame?.transitMap || chartTransitMap(fromChart);
  const toTransits = toFrame?.transitMap || chartTransitMap(toChart);
  state.transitVisuals.forEach((visual, planet) => {
    const startLongitude = fromTransits.get(planet);
    const targetLongitude = toTransits.get(planet);
    if (startLongitude === undefined || targetLongitude === undefined) return;
    const longitude = interpolateLongitude(startLongitude, targetLongitude, progress);
    const position = longitudePosition(longitude, transitPlanetRadius, visual.baseY);
    visual.objects.forEach((object) => object.position.copy(position));
    visual.longitude = longitude;
    state.transitPositions.set(planet, position.clone());
  });
  const fromCusps = fromFrame?.houseCusps || chartHouseCusps(fromChart);
  const toCusps = toFrame?.houseCusps || chartHouseCusps(toChart);
  if (fromCusps.length >= 12 && toCusps.length >= 12) {
    const currentCusps = fromCusps.map((longitude, index) => interpolateLongitude(longitude, toCusps[index], progress));
    state.transitHouseLines.forEach(({ line, index }) => {
      const inner = longitudePosition(currentCusps[index], transitHouseInnerRadius, -0.03);
      const outer = longitudePosition(currentCusps[index], transitOrbitRadius, -0.03);
      const position = line.geometry?.attributes?.position;
      if (position && position.count >= 2) {
        position.setXYZ(0, inner.x, inner.y, inner.z);
        position.setXYZ(1, outer.x, outer.y, outer.z);
        position.needsUpdate = true;
      } else {
        line.geometry?.dispose?.();
        line.geometry = new THREE.BufferGeometry().setFromPoints([inner, outer]);
      }
    });
    state.transitHouseLabels.forEach(({ mesh, index }) => {
      const nextLongitude = currentCusps[(index + 1) % currentCusps.length];
      setOrbitTextPlaneTransform(mesh, midpointLongitude(currentCusps[index], nextLongitude), transitHouseLabelRadius, 0.07);
    });
  }
  updateAspectLinePositions(state);
}

function midpointLongitude(start, end) {
  const distance = ((Number(end) - Number(start) + 360) % 360) || 30;
  return (Number(start) + distance / 2) % 360;
}

function cameraYForTiltDegrees(degrees, zDistance = 10.5) {
  return Math.tan(THREE.MathUtils.degToRad(degrees)) * zDistance;
}

function orbitTextPlane(label, {
  color = "#e2e2e2",
  font = "800 78px JetBrains Mono, monospace",
  width = 192,
  height = 128,
  scaleX = 0.42,
  scaleY = 0.28,
  opacity = 0.72,
  strokeOnly = false,
  lineWidth = 3,
  glowColor = null,
  glowBlur = 0,
} = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, width, height);
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = glowColor || "rgba(0,0,0,0.86)";
  ctx.shadowBlur = glowBlur || 12;
  if (glowColor && glowBlur) {
    ctx.globalAlpha = 0.76;
    if (strokeOnly) {
      ctx.lineWidth = lineWidth + 2;
      ctx.strokeStyle = color;
      ctx.strokeText(String(label), width / 2, height / 2 + 2);
    } else {
      ctx.fillText(String(label), width / 2, height / 2 + 2);
    }
    ctx.globalAlpha = 1;
    ctx.shadowColor = "rgba(0,0,0,0.82)";
    ctx.shadowBlur = 8;
  }
  if (strokeOnly) {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = color;
    ctx.strokeText(String(label), width / 2, height / 2 + 2);
  } else {
    ctx.fillText(String(label), width / 2, height / 2 + 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(scaleX, scaleY),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    })
  );
  mesh.renderOrder = 4;
  return { mesh, texture };
}

function setOrbitTextPlaneTransform(mesh, longitude, radius, y = 0.05) {
  const angle = longitudeAngle(longitude);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  mesh.position.set(cos * radius, y, sin * radius);

  const xAxis = new THREE.Vector3(sin, 0, -cos);
  const yAxis = new THREE.Vector3(-cos, 0, -sin);
  const zAxis = new THREE.Vector3(0, 1, 0);
  const matrix = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
  mesh.setRotationFromMatrix(matrix);
}

function applyMapOffset(group, offset, flatView = false) {
  group.position.x = offset.x;
  if (flatView) {
    group.position.y = 0;
    group.position.z = offset.y;
  } else {
    group.position.y = offset.y;
    group.position.z = 0;
  }
}

function isMobileViewport() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(max-width: 639px)").matches ?? window.innerWidth < 640;
}

function defaultMapZoom() {
  return isMobileViewport() ? 0.84 : 1.13;
}

function defaultMapOffset() {
  return { x: 0, y: 0 };
}

function defaultFlatMapZoom() {
  return isMobileViewport() ? 0.72 : 1.05;
}

function minimumMapZoom() {
  return isMobileViewport() ? 0.38 : 0.52;
}

function compactDateLabel(value) {
  return value ? String(value).replaceAll("-", "/") : "--";
}

function planetTexture(planet) {
  const size = planet === "SUN" ? 512 : 320;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const noise = (seed) => {
    const value = Math.sin(seed * 127.1 + planet.length * 311.7) * 43758.5453;
    return value - Math.floor(value);
  };
  const palette = {
    SUN: ["#ff8f1f", "#e85a10", "#ffd15a"],
    MOON: ["#f4f1e7", "#b8b9bf", "#6c7078"],
    MERCURY: ["#c5b7a4", "#7f7468", "#3f3c38"],
    VENUS: ["#ffd3bd", "#d9917e", "#f7e0b1"],
    MARS: ["#f06b3e", "#9e2d1f", "#f2a060"],
    JUPITER: ["#f2d29b", "#b77d51", "#f7ead0"],
    SATURN: ["#dcc58f", "#8f7a54", "#f1dfb4"],
    URANUS: ["#9ff4ff", "#45b7c5", "#e3ffff"],
    NEPTUNE: ["#5f8dff", "#234aa6", "#9cc8ff"],
    PLUTO: ["#c7a0ff", "#6a4a8f", "#e6d8ff"],
    EARTH: ["#5aa7ff", "#1d5fb8", "#d9fbff"],
    ASC: ["#f8ecd2", "#9f8f70", "#fff7dd"],
    MC: ["#e7ddff", "#8172a5", "#ffffff"],
  }[planet] || ["#e2e2e2", "#7d7d86", "#ffffff"];
  const gradient = ctx.createRadialGradient(size * 0.34, size * 0.28, size * 0.06, size * 0.5, size * 0.5, size * 0.58);
  gradient.addColorStop(0, palette[2]);
  gradient.addColorStop(0.52, palette[0]);
  gradient.addColorStop(1, palette[1]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  for (let index = 0; index < 220; index += 1) {
    const alpha = planet === "SUN" ? 0.1 : 0.06;
    ctx.fillStyle = noise(index) > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
    ctx.fillRect(noise(index + 3) * size, noise(index + 7) * size, 1 + noise(index + 11) * 2, 1 + noise(index + 13) * 2);
  }

  if (planet === "EARTH") {
    for (let index = 0; index < 18; index += 1) {
      const x = noise(index + 31) * size;
      const y = noise(index + 59) * size;
      const width = 18 + noise(index + 83) * 42;
      const height = 8 + noise(index + 107) * 18;
      ctx.fillStyle = index % 3 === 0 ? "rgba(69,131,78,0.68)" : "rgba(73,153,91,0.54)";
      ctx.beginPath();
      ctx.ellipse(x, y, width, height, noise(index + 127) * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let index = 0; index < 12; index += 1) {
      ctx.strokeStyle = "rgba(245,250,255,0.42)";
      ctx.lineWidth = 4 + noise(index + 191) * 4;
      ctx.beginPath();
      ctx.ellipse(
        size * (0.22 + noise(index + 211) * 0.62),
        size * (0.18 + noise(index + 229) * 0.64),
        18 + noise(index + 251) * 48,
        5 + noise(index + 271) * 12,
        noise(index + 293) * Math.PI,
        0,
        Math.PI * 2
      );
      ctx.stroke();
    }
  } else if (planet === "JUPITER" || planet === "SATURN") {
    const bandStep = planet === "JUPITER" ? 20 : 26;
    for (let y = 8; y < size; y += bandStep) {
      const wobble = Math.sin(y * 0.08) * 5;
      ctx.fillStyle = y % (bandStep * 2) === 0 ? "rgba(87, 46, 24, 0.42)" : "rgba(255, 244, 214, 0.34)";
      ctx.beginPath();
      ctx.moveTo(0, y + wobble);
      for (let x = 0; x <= size; x += 16) {
        ctx.lineTo(x, y + Math.sin(x * 0.045 + y * 0.05) * 4 + wobble);
      }
      ctx.lineTo(size, y + (planet === "JUPITER" ? 11 : 8));
      ctx.lineTo(0, y + (planet === "JUPITER" ? 11 : 8));
      ctx.closePath();
      ctx.fill();
    }
    if (planet === "JUPITER") {
      ctx.fillStyle = "rgba(150, 57, 34, 0.76)";
      ctx.beginPath();
      ctx.ellipse(size * 0.68, size * 0.56, 24, 13, -0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,221,178,0.42)";
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    for (let y = 14; y < size; y += planet === "JUPITER" ? 13 : 18) {
      ctx.strokeStyle = planet === "JUPITER" ? "rgba(76,40,24,0.28)" : "rgba(92,75,48,0.22)";
      ctx.lineWidth = planet === "JUPITER" ? 2 : 1.4;
      ctx.beginPath();
      for (let x = 0; x <= size; x += 10) {
        const wave = Math.sin(x * 0.07 + y * 0.04) * 3 + Math.sin(x * 0.025) * 4;
        if (x === 0) ctx.moveTo(x, y + wave);
        else ctx.lineTo(x, y + wave);
      }
      ctx.stroke();
    }
  } else if (planet === "MOON" || planet === "MERCURY" || planet === "PLUTO") {
    for (let index = 0; index < 42; index += 1) {
      const x = noise(index + 23) * size;
      const y = noise(index + 47) * size;
      const radius = 3 + noise(index + 71) * (planet === "MOON" ? 11 : 7);
      ctx.fillStyle = "rgba(14,14,18,0.24)";
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.14)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    for (let index = 0; index < 26; index += 1) {
      const x = noise(index + 131) * size;
      const y = noise(index + 149) * size;
      const radius = 1.5 + noise(index + 167) * 4;
      ctx.fillStyle = "rgba(255,255,255,0.1)";
      ctx.beginPath();
      ctx.arc(x - radius * 0.32, y - radius * 0.32, radius * 0.65, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (planet === "MARS" || planet === "VENUS" || planet === "NEPTUNE" || planet === "URANUS") {
    for (let index = 0; index < 14; index += 1) {
      ctx.strokeStyle = index % 2 ? "rgba(255,255,255,0.2)" : "rgba(18,31,54,0.2)";
      ctx.lineWidth = 7 + (index % 4);
      ctx.beginPath();
      ctx.ellipse(size * 0.5, 18 + index * 17, size * 0.66, 10, 0.1 * index, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (planet === "MARS") {
      ctx.fillStyle = "rgba(80,31,20,0.28)";
      ctx.fillRect(size * 0.12, size * 0.58, size * 0.56, size * 0.1);
      ctx.fillStyle = "rgba(255,233,214,0.52)";
      ctx.beginPath();
      ctx.ellipse(size * 0.5, size * 0.1, size * 0.16, size * 0.035, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(size * 0.5, size * 0.9, size * 0.14, size * 0.032, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (planet === "NEPTUNE") {
      ctx.fillStyle = "rgba(10,23,83,0.36)";
      ctx.beginPath();
      ctx.ellipse(size * 0.66, size * 0.55, size * 0.11, size * 0.045, -0.25, 0, Math.PI * 2);
      ctx.fill();
    }
    if (planet === "VENUS") {
      ctx.strokeStyle = "rgba(255,248,222,0.34)";
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(size * 0.08, size * 0.38);
      ctx.bezierCurveTo(size * 0.34, size * 0.22, size * 0.58, size * 0.56, size * 0.92, size * 0.36);
      ctx.stroke();
    }
  } else if (planet === "SUN") {
    ctx.globalCompositeOperation = "screen";
    for (let index = 0; index < 1700; index += 1) {
      const x = noise(index + 401) * size;
      const y = noise(index + 409) * size;
      const distance = Math.hypot(x - size * 0.5, y - size * 0.5) / (size * 0.5);
      if (distance > 0.98) continue;
      const cell = 1.4 + noise(index + 419) * 6.6;
      const alpha = 0.075 + (1 - distance) * 0.18;
      ctx.fillStyle = noise(index + 431) > 0.58
        ? `rgba(255,154,34,${alpha})`
        : `rgba(226,75,8,${alpha * 0.98})`;
      ctx.beginPath();
      ctx.ellipse(x, y, cell * 1.55, cell, noise(index + 443) * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let index = 0; index < 18; index += 1) {
      const x = noise(index + 601) * size;
      const y = noise(index + 607) * size;
      const distance = Math.hypot(x - size * 0.5, y - size * 0.5) / (size * 0.5);
      if (distance > 0.92) continue;
      const radius = 11 + noise(index + 613) * 25;
      const activeGradient = ctx.createRadialGradient(x, y, 0, x, y, radius * 2.8);
      activeGradient.addColorStop(0, "rgba(255,236,178,0.62)");
      activeGradient.addColorStop(0.2, "rgba(255,159,39,0.42)");
      activeGradient.addColorStop(0.54, "rgba(225,76,8,0.22)");
      activeGradient.addColorStop(1, "rgba(177,34,0,0)");
      ctx.fillStyle = activeGradient;
      ctx.beginPath();
      ctx.ellipse(x, y, radius * 1.9, radius * 1.15, noise(index + 619) * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let index = 0; index < 46; index += 1) {
      const baseAngle = noise(index + 801) * Math.PI * 2;
      const radial = 0.12 + noise(index + 809) * 0.76;
      const baseX = size * 0.5 + Math.cos(baseAngle) * size * 0.5 * radial;
      const baseY = size * 0.5 + Math.sin(baseAngle) * size * 0.5 * radial;
      const distance = Math.hypot(baseX - size * 0.5, baseY - size * 0.5) / (size * 0.5);
      if (distance > 0.92) continue;
      const tangent = baseAngle + Math.PI / 2 + (noise(index + 817) - 0.5) * 1.2;
      const length = size * (0.08 + noise(index + 823) * 0.16);
      const width = size * (0.008 + noise(index + 829) * 0.018);
      const flameGradient = ctx.createLinearGradient(
        baseX - Math.cos(tangent) * length * 0.25,
        baseY - Math.sin(tangent) * length * 0.25,
        baseX + Math.cos(tangent) * length,
        baseY + Math.sin(tangent) * length
      );
      flameGradient.addColorStop(0, "rgba(255,85,0,0)");
      flameGradient.addColorStop(0.18, "rgba(213,54,0,0.28)");
      flameGradient.addColorStop(0.56, "rgba(255,126,18,0.38)");
      flameGradient.addColorStop(1, "rgba(255,202,88,0.1)");
      ctx.fillStyle = flameGradient;
      ctx.beginPath();
      ctx.moveTo(baseX - Math.cos(tangent + Math.PI / 2) * width, baseY - Math.sin(tangent + Math.PI / 2) * width);
      ctx.bezierCurveTo(
        baseX + Math.cos(tangent) * length * 0.25,
        baseY + Math.sin(tangent) * length * 0.25,
        baseX + Math.cos(tangent) * length * 0.72 + Math.cos(tangent + Math.PI / 2) * width * 2.2,
        baseY + Math.sin(tangent) * length * 0.72 + Math.sin(tangent + Math.PI / 2) * width * 2.2,
        baseX + Math.cos(tangent) * length,
        baseY + Math.sin(tangent) * length
      );
      ctx.bezierCurveTo(
        baseX + Math.cos(tangent) * length * 0.62 - Math.cos(tangent + Math.PI / 2) * width * 2.8,
        baseY + Math.sin(tangent) * length * 0.62 - Math.sin(tangent + Math.PI / 2) * width * 2.8,
        baseX + Math.cos(tangent) * length * 0.12,
        baseY + Math.sin(tangent) * length * 0.12,
        baseX + Math.cos(tangent + Math.PI / 2) * width,
        baseY + Math.sin(tangent + Math.PI / 2) * width
      );
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = "multiply";
    for (let index = 0; index < 18; index += 1) {
      const y = size * (0.18 + noise(index + 457) * 0.64);
      const startX = size * (0.08 + noise(index + 463) * 0.22);
      ctx.strokeStyle = "rgba(139,46,0,0.12)";
      ctx.lineWidth = 3 + noise(index + 467) * 8;
      ctx.beginPath();
      ctx.moveTo(startX, y);
      for (let step = 0; step < 7; step += 1) {
        const x = startX + step * size * 0.12;
        ctx.lineTo(x, y + Math.sin(step * 1.35 + index) * (8 + noise(index + step + 479) * 10));
      }
      ctx.stroke();
    }
    for (let index = 0; index < 4; index += 1) {
      const x = size * (0.18 + noise(index + 701) * 0.64);
      const y = size * (0.2 + noise(index + 709) * 0.56);
      const distance = Math.hypot(x - size * 0.5, y - size * 0.5) / (size * 0.5);
      if (distance > 0.78) continue;
      const radius = size * (0.018 + noise(index + 719) * 0.028);
      ctx.fillStyle = "rgba(72,17,0,0.28)";
      ctx.beginPath();
      ctx.ellipse(x, y, radius * 1.55, radius, noise(index + 727) * Math.PI, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(145,48,0,0.2)";
      ctx.beginPath();
      ctx.ellipse(x - radius * 0.14, y - radius * 0.16, radius * 2.35, radius * 1.45, noise(index + 733) * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "screen";
    for (let index = 0; index < 58; index += 1) {
      ctx.strokeStyle = index % 2 ? "rgba(255,174,44,0.24)" : "rgba(222,67,4,0.24)";
      ctx.lineWidth = 1.2 + noise(index + 503) * 3.8;
      ctx.beginPath();
      ctx.arc(
        size * (0.46 + (noise(index + 509) - 0.5) * 0.1),
        size * (0.5 + (noise(index + 521) - 0.5) * 0.12),
        18 + index * 4.2,
        index * 0.38,
        index * 0.38 + Math.PI * (0.35 + noise(index + 541) * 0.5)
      );
      ctx.stroke();
    }
    for (let index = 0; index < 32; index += 1) {
      const y = size * (0.14 + noise(index + 901) * 0.72);
      const xStart = size * (0.04 + noise(index + 907) * 0.22);
      ctx.strokeStyle = index % 3 === 0 ? "rgba(255,160,38,0.34)" : "rgba(214,61,0,0.28)";
      ctx.lineWidth = 2 + noise(index + 911) * 5.5;
      ctx.beginPath();
      for (let step = 0; step <= 12; step += 1) {
        const x = xStart + step * size * 0.075;
        const wave = Math.sin(step * 0.95 + index * 1.7) * (7 + noise(index + step + 919) * 13);
        const curl = Math.sin(step * 1.9 + index) * (noise(index + 929) * 5);
        if (step === 0) ctx.moveTo(x, y + wave);
        else ctx.lineTo(x, y + wave + curl);
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  const shade = ctx.createRadialGradient(size * 0.32, size * 0.26, size * 0.05, size * 0.5, size * 0.5, size * 0.7);
  shade.addColorStop(0, planet === "SUN" ? "rgba(255,191,82,0.3)" : "rgba(255,255,255,0.22)");
  shade.addColorStop(0.5, "rgba(255,255,255,0)");
  shade.addColorStop(0.86, planet === "SUN" ? "rgba(240,92,8,0.24)" : "rgba(0,0,0,0.24)");
  shade.addColorStop(1, planet === "SUN" ? "rgba(255,128,18,0.42)" : "rgba(0,0,0,0.58)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, size, size);

  ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = "source-over";

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function earthTexture() {
  const width = 768;
  const height = 384;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const noise = (seed) => {
    const value = Math.sin(seed * 193.37 + 17.11) * 43758.5453;
    return value - Math.floor(value);
  };

  const ocean = ctx.createLinearGradient(0, 0, width, height);
  ocean.addColorStop(0, "#061a46");
  ocean.addColorStop(0.34, "#0a3a86");
  ocean.addColorStop(0.58, "#0d5fb6");
  ocean.addColorStop(1, "#03112e");
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, width, height);

  for (let index = 0; index < 950; index += 1) {
    const x = noise(index + 3) * width;
    const y = noise(index + 7) * height;
    const alpha = 0.018 + noise(index + 11) * 0.038;
    ctx.fillStyle = noise(index + 13) > 0.45 ? `rgba(44,154,210,${alpha})` : `rgba(2,10,38,${alpha})`;
    ctx.fillRect(x, y, 1 + noise(index + 17) * 5, 1 + noise(index + 19) * 3);
  }

  const landMasses = [
    { x: 0.14, y: 0.34, w: 0.16, h: 0.2, r: -0.12, c: "#2f7c45" },
    { x: 0.22, y: 0.56, w: 0.1, h: 0.22, r: 0.18, c: "#2a6f3b" },
    { x: 0.47, y: 0.33, w: 0.17, h: 0.18, r: 0.08, c: "#78954f" },
    { x: 0.56, y: 0.51, w: 0.14, h: 0.22, r: -0.16, c: "#5d8643" },
    { x: 0.7, y: 0.41, w: 0.18, h: 0.16, r: 0.22, c: "#3d874d" },
    { x: 0.77, y: 0.68, w: 0.12, h: 0.1, r: 0.28, c: "#b4945c" },
    { x: 0.9, y: 0.58, w: 0.12, h: 0.18, r: -0.1, c: "#267044" },
  ];
  landMasses.forEach((land, landIndex) => {
    for (let index = 0; index < 9; index += 1) {
      const x = (land.x + (noise(landIndex * 41 + index) - 0.5) * land.w * 0.38) * width;
      const y = (land.y + (noise(landIndex * 43 + index) - 0.5) * land.h * 0.46) * height;
      const w = land.w * width * (0.42 + noise(landIndex * 47 + index) * 0.48);
      const h = land.h * height * (0.34 + noise(landIndex * 53 + index) * 0.48);
      const gradient = ctx.createRadialGradient(x - w * 0.2, y - h * 0.22, 1, x, y, Math.max(w, h));
      gradient.addColorStop(0, "#d0bd7a");
      gradient.addColorStop(0.18, land.c);
      gradient.addColorStop(0.72, "#1e5c35");
      gradient.addColorStop(1, "rgba(16,64,42,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.ellipse(x, y, w, h, land.r + (noise(landIndex * 59 + index) - 0.5) * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  ctx.strokeStyle = "rgba(227,244,255,0.16)";
  for (let index = 0; index < 38; index += 1) {
    const y = height * (0.12 + noise(index + 101) * 0.76);
    ctx.lineWidth = 2 + noise(index + 107) * 5;
    ctx.beginPath();
    for (let x = -20; x <= width + 20; x += 28) {
      const wave = Math.sin(x * 0.025 + index * 1.1) * (5 + noise(index + 113) * 11);
      if (x === -20) ctx.moveTo(x, y + wave);
      else ctx.lineTo(x, y + wave);
    }
    ctx.stroke();
  }

  const vignette = ctx.createRadialGradient(width * 0.36, height * 0.34, 8, width * 0.5, height * 0.5, width * 0.72);
  vignette.addColorStop(0, "rgba(255,255,255,0.2)");
  vignette.addColorStop(0.45, "rgba(255,255,255,0)");
  vignette.addColorStop(0.78, "rgba(3,13,41,0.2)");
  vignette.addColorStop(1, "rgba(0,0,0,0.58)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function earthCloudTexture() {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const noise = (seed) => {
    const value = Math.sin(seed * 241.73 + 91.5) * 43758.5453;
    return value - Math.floor(value);
  };
  ctx.clearRect(0, 0, size, size);
  for (let index = 0; index < 64; index += 1) {
    const x = noise(index + 3) * size;
    const y = noise(index + 7) * size;
    const w = 16 + noise(index + 11) * 72;
    const h = 4 + noise(index + 13) * 18;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, Math.max(w, h));
    gradient.addColorStop(0, "rgba(255,255,255,0.5)");
    gradient.addColorStop(0.4, "rgba(255,255,255,0.2)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, (noise(index + 17) - 0.5) * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function planetSymbolTexture(symbol, colorValue) {
  const size = 180;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  ctx.font = `900 ${symbol.length > 1 ? 64 : 104}px 'Segoe UI Symbol', 'Noto Sans Symbols', JetBrains Mono, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = colorValue;
  ctx.shadowBlur = 18;
  ctx.lineWidth = symbol.length > 1 ? 5 : 7;
  ctx.strokeStyle = "rgba(4,8,16,0.78)";
  ctx.strokeText(symbol, size / 2, size / 2 + (symbol.length > 1 ? 4 : 8));
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillText(symbol, size / 2, size / 2 + (symbol.length > 1 ? 4 : 8));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function planetSymbolOutlineTexture(symbol, colorValue) {
  const size = 180;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  ctx.font = `500 ${symbol.length > 1 ? 62 : 100}px 'Segoe UI Symbol', 'Noto Sans Symbols', JetBrains Mono, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.lineWidth = symbol.length > 1 ? 2.5 : 3.5;
  ctx.strokeStyle = colorValue;
  ctx.strokeText(symbol, size / 2, size / 2 + (symbol.length > 1 ? 4 : 8));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function planetGlowTexture(colorValue) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const color = new THREE.Color(colorValue);
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, `rgba(255,255,255,0.18)`);
  gradient.addColorStop(0.18, `rgba(${r},${g},${b},0.28)`);
  gradient.addColorStop(0.42, `rgba(${r},${g},${b},0.16)`);
  gradient.addColorStop(0.72, `rgba(${r},${g},${b},0.06)`);
  gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function solarFlameTexture() {
  const size = 384;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  const center = size / 2;
  const noise = (seed) => {
    const value = Math.sin(seed * 179.7 + 41.3) * 43758.5453;
    return value - Math.floor(value);
  };
  const radial = ctx.createRadialGradient(center, center, size * 0.18, center, center, size * 0.5);
  radial.addColorStop(0, "rgba(255,255,220,0)");
  radial.addColorStop(0.44, "rgba(255,210,64,0.18)");
  radial.addColorStop(0.68, "rgba(255,111,18,0.2)");
  radial.addColorStop(1, "rgba(255,46,0,0)");
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, size, size);

  ctx.globalCompositeOperation = "screen";
  for (let index = 0; index < 42; index += 1) {
    const angle = (index / 42) * Math.PI * 2 + (noise(index + 11) - 0.5) * 0.22;
    const inner = size * (0.24 + noise(index + 23) * 0.035);
    const outer = size * (0.38 + noise(index + 37) * 0.095);
    const width = 0.018 + noise(index + 53) * 0.028;
    const tangent = angle + Math.PI / 2;
    const x1 = center + Math.cos(angle) * inner;
    const y1 = center + Math.sin(angle) * inner;
    const x2 = center + Math.cos(angle - width) * size * 0.32;
    const y2 = center + Math.sin(angle - width) * size * 0.32;
    const x3 = center + Math.cos(angle) * outer;
    const y3 = center + Math.sin(angle) * outer;
    const x4 = center + Math.cos(angle + width) * size * 0.32;
    const y4 = center + Math.sin(angle + width) * size * 0.32;
    const flameGradient = ctx.createRadialGradient(x3, y3, 0, x3, y3, size * 0.14);
    flameGradient.addColorStop(0, "rgba(255,244,161,0.72)");
    flameGradient.addColorStop(0.34, "rgba(255,126,20,0.5)");
    flameGradient.addColorStop(1, "rgba(255,38,0,0)");
    ctx.fillStyle = flameGradient;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(
      x1 + Math.cos(tangent) * size * 0.045,
      y1 + Math.sin(tangent) * size * 0.045,
      x3 + Math.cos(tangent) * size * 0.025,
      y3 + Math.sin(tangent) * size * 0.025,
      x3,
      y3
    );
    ctx.bezierCurveTo(
      x3 - Math.cos(tangent) * size * 0.03,
      y3 - Math.sin(tangent) * size * 0.03,
      x4,
      y4,
      x1,
      y1
    );
    ctx.closePath();
    ctx.fill();
    if (noise(index + 71) > 0.58) {
      ctx.strokeStyle = "rgba(255,237,164,0.34)";
      ctx.lineWidth = 1.4 + noise(index + 79) * 1.6;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.quadraticCurveTo(
        center + Math.cos(angle) * size * 0.37,
        center + Math.sin(angle) * size * 0.37,
        center + Math.cos(angle + (noise(index + 89) - 0.5) * 0.12) * outer,
        center + Math.sin(angle + (noise(index + 89) - 0.5) * 0.12) * outer
      );
      ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = "destination-out";
  const clearCore = ctx.createRadialGradient(center, center, 0, center, center, size * 0.31);
  clearCore.addColorStop(0, "rgba(0,0,0,0.9)");
  clearCore.addColorStop(0.72, "rgba(0,0,0,0.34)");
  clearCore.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = clearCore;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = "source-over";
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function solarCoronaRayTexture() {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const center = size / 2;
  const noise = (seed) => {
    const value = Math.sin(seed * 313.91 + 63.7) * 43758.5453;
    return value - Math.floor(value);
  };
  ctx.clearRect(0, 0, size, size);
  const haze = ctx.createRadialGradient(center, center, size * 0.16, center, center, size * 0.5);
  haze.addColorStop(0, "rgba(255,255,230,0)");
  haze.addColorStop(0.35, "rgba(255,234,141,0.12)");
  haze.addColorStop(0.58, "rgba(255,128,28,0.13)");
  haze.addColorStop(1, "rgba(255,80,0,0)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = "screen";
  for (let index = 0; index < 72; index += 1) {
    const angle = (index / 72) * Math.PI * 2 + (noise(index + 5) - 0.5) * 0.08;
    const inner = size * (0.19 + noise(index + 11) * 0.04);
    const outer = size * (0.36 + noise(index + 17) * 0.14);
    const width = 0.006 + noise(index + 23) * 0.012;
    const gradient = ctx.createLinearGradient(
      center + Math.cos(angle) * inner,
      center + Math.sin(angle) * inner,
      center + Math.cos(angle) * outer,
      center + Math.sin(angle) * outer
    );
    gradient.addColorStop(0, "rgba(255,255,214,0.34)");
    gradient.addColorStop(0.42, "rgba(255,180,64,0.16)");
    gradient.addColorStop(1, "rgba(255,94,0,0)");
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 1 + noise(index + 31) * 2.4;
    ctx.beginPath();
    ctx.moveTo(center + Math.cos(angle - width) * inner, center + Math.sin(angle - width) * inner);
    ctx.lineTo(center + Math.cos(angle + width * 0.25) * outer, center + Math.sin(angle + width * 0.25) * outer);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "destination-out";
  const core = ctx.createRadialGradient(center, center, 0, center, center, size * 0.24);
  core.addColorStop(0, "rgba(0,0,0,0.95)");
  core.addColorStop(0.75, "rgba(0,0,0,0.45)");
  core.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = "source-over";
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function planetMaterial(item, textures) {
  const texture = planetTexture(item.planet);
  textures.push(texture);
  const baseColor = new THREE.Color(item.color);
  return new THREE.MeshStandardMaterial({
    map: texture,
    bumpMap: texture,
    bumpScale: item.planet === "SUN" ? 0.018 : ["MOON", "MERCURY", "MARS", "PLUTO"].includes(item.planet) ? 0.06 : 0.024,
    color: item.estimated ? baseColor.clone().lerp(new THREE.Color("#8f8f98"), 0.22) : 0xffffff,
    emissive: item.planet === "SUN" ? new THREE.Color("#f05a0a") : baseColor,
    emissiveIntensity: item.planet === "SUN" ? 2.18 : item.estimated ? 0.03 : 0.07,
    metalness: ["URANUS", "NEPTUNE"].includes(item.planet) ? 0.08 : 0.02,
    roughness: item.planet === "SUN" ? 0.36 : ["VENUS", "URANUS", "NEPTUNE"].includes(item.planet) ? 0.56 : 0.84,
  });
}

function fallbackTransitLongitude(planet, dateValue) {
  const dayOfYear = (() => {
    const date = new Date(`${dateKey(dateValue) || "2026-01-01"}T00:00:00`);
    if (Number.isNaN(date.getTime())) return 1;
    const start = new Date(`${date.getFullYear()}-01-01T00:00:00`);
    return Math.max(1, Math.round((date.getTime() - start.getTime()) / 86400000) + 1);
  })();
  const speeds = {
    SUN: 0.9856,
    MOON: 13.176,
    MERCURY: 1.28,
    VENUS: 1.02,
    MARS: 0.52,
    JUPITER: 0.083,
    SATURN: 0.033,
    URANUS: 0.012,
    NEPTUNE: 0.006,
    PLUTO: 0.004,
  };
  const offsets = {
    SUN: 280,
    MOON: 120,
    MERCURY: 250,
    VENUS: 310,
    MARS: 40,
    JUPITER: 92,
    SATURN: 355,
    URANUS: 60,
    NEPTUNE: 0,
    PLUTO: 305,
  };
  return (offsets[planet] + dayOfYear * speeds[planet]) % 360;
}

function fallbackNatalLongitude(planet) {
  const offsets = {
    SUN: 120,
    MOON: 244,
    MERCURY: 132,
    VENUS: 183,
    MARS: 159,
    JUPITER: 111,
    SATURN: 3,
    URANUS: 65,
    NEPTUNE: 1,
    PLUTO: 304,
    ASC: 92,
    MC: 8,
  };
  return offsets[planet] ?? 120;
}

function normalizeLongitude(value) {
  const longitude = Number(value);
  return Number.isFinite(longitude) ? ((longitude % 360) + 360) % 360 : null;
}

function collectNatalHouseCusps(forecast) {
  const source = Array.isArray(forecast?.natal_house_cusps)
    ? forecast.natal_house_cusps
    : Array.isArray(forecast?.natalHouseCusps)
      ? forecast.natalHouseCusps
      : Array.isArray(forecast?.house_cusps)
        ? forecast.house_cusps
        : Array.isArray(forecast?.houseCusps)
          ? forecast.houseCusps
          : [];
  const cusps = source
    .map((item) => normalizeLongitude(typeof item === "object" ? item?.longitude ?? item?.cusp ?? item?.degree : item))
    .filter((longitude) => longitude !== null);
  return cusps.length >= 12 ? cusps.slice(0, 12) : Array.from({ length: 12 }, (_, index) => index * 30);
}

function collectTransitHouseCusps(day, transits = []) {
  const transitChartCusps = Array.isArray(day?.transit_chart?.house_cusps)
    ? day.transit_chart.house_cusps
    : Array.isArray(day?.transitChart?.houseCusps)
      ? day.transitChart.houseCusps
      : [];
  const normalizedTransitChartCusps = transitChartCusps
    .map((item) => normalizeLongitude(typeof item === "object" ? item?.longitude ?? item?.cusp ?? item?.degree : item))
    .filter((longitude) => longitude !== null);
  if (normalizedTransitChartCusps.length >= 12) {
    return normalizedTransitChartCusps.slice(0, 12);
  }

  const sunLongitude = normalizeLongitude(transits.find((item) => item?.planet === "SUN")?.longitude) ?? 0;
  const firstHouseCusp = Math.floor(sunLongitude / 30) * 30;
  return Array.from({ length: 12 }, (_, index) => normalizeLongitude(firstHouseCusp + index * 30) ?? 0);
}

function houseForLongitude(longitudeValue, houseCusps = []) {
  const longitude = normalizeLongitude(longitudeValue);
  if (longitude === null || houseCusps.length < 12) return null;
  const cusps = houseCusps.map(normalizeLongitude);
  for (let index = 0; index < 12; index += 1) {
    const start = cusps[index];
    const end = cusps[(index + 1) % 12];
    if (start === null || end === null) continue;
    if (start <= end) {
      if (longitude >= start && longitude < end) return index + 1;
    } else if (longitude >= start || longitude < end) {
      return index + 1;
    }
  }
  return null;
}

function transitPositionLabel(item, houseCusps) {
  const longitude = normalizeLongitude(item?.longitude) ?? 0;
  const signIndex = clamp(Math.floor(longitude / 30), 0, 11);
  const degreeInSign = Math.floor(longitude % 30);
  const house = houseForLongitude(longitude, houseCusps);
  return `${ZODIAC_SIGN_NAMES[signIndex]} ${ZODIAC_SIGNS[signIndex]} / ${degreeInSign}° / ${house ? `${house}ハウス` : "-ハウス"}`;
}

function chartPositionParts(item, houseCusps) {
  const longitude = normalizeLongitude(item?.longitude) ?? 0;
  const signIndex = clamp(Math.floor(longitude / 30), 0, 11);
  const degreeInSign = Math.floor(longitude % 30);
  const house = houseForLongitude(longitude, houseCusps);
  return {
    signName: ZODIAC_SIGN_NAMES[signIndex],
    signSymbol: ZODIAC_SIGNS[signIndex],
    degree: `${degreeInSign}°`,
    house: house ? `${house}ハウス` : "-ハウス",
  };
}

function chartPositionLabel(item, houseCusps) {
  return transitPositionLabel(item, houseCusps);
}

function ChartPositionColumns({ item, houseCusps, className = "" }) {
  const position = chartPositionParts(item, houseCusps);
  return (
    <span className={cx("inline-flex min-w-0 shrink-0 items-center whitespace-nowrap tabular-nums", className)}>
      <span className="w-[4.25em] text-left">{position.signName} {position.signSymbol}</span>
      <span className="px-1.5 text-mist/45">/</span>
      <span className="w-[2.35em] text-right">{position.degree}</span>
      <span className="px-1.5 text-mist/45">/</span>
      <span className="w-[3.6em] text-right">{position.house}</span>
    </span>
  );
}

function ChartPositionCompact({ item, houseCusps, className = "" }) {
  const position = chartPositionParts(item, houseCusps);
  return (
    <span className={cx("grid w-full min-w-0 grid-cols-[2.7rem_1.45rem_minmax(2.45rem,1fr)] items-center gap-1 whitespace-nowrap tabular-nums", className)}>
      <span className="min-w-0 truncate text-left">
        {position.signName} <span className="text-violet-300">{position.signSymbol}</span>
      </span>
      <span className="text-right">{position.degree}</span>
      <span className="justify-self-end pr-[1ch] text-right">{position.house}</span>
    </span>
  );
}

function collectNatalPoints(forecast) {
  const byPlanet = new Map();
  const addPoint = (planetValue, longitudeValue, estimated = false) => {
    const planet = normalizedPlanet(planetValue);
    const longitude = normalizeLongitude(longitudeValue);
    if (!NATAL_POINT_ORDER.includes(planet) || longitude === null || byPlanet.has(planet)) return;
    byPlanet.set(planet, {
      planet,
      label: planet === "SUN" ? "ネイタル太陽" : `ネイタル${planetLabel(planet)}`,
      longitude,
      color: PLANET_COLORS[planet] || "#e2e2e2",
      estimated,
    });
  };

  const directPoints = Array.isArray(forecast?.natal_points)
    ? forecast.natal_points
    : Array.isArray(forecast?.natalPoints)
      ? forecast.natalPoints
      : [];
  directPoints.forEach((point) => addPoint(point?.planet || point?.name, point?.longitude));

  NATAL_POINT_ORDER.forEach((planet) => {
    if (!byPlanet.has(planet)) {
      addPoint(planet, fallbackNatalLongitude(planet), true);
    }
  });
  return NATAL_POINT_ORDER.map((planet) => byPlanet.get(planet)).filter(Boolean);
}

function transitSkyMapData(day, forecast, selectedNatalPlanet = "SUN") {
  const events = Array.isArray(day?.all_aspects)
    ? day.all_aspects
    : Array.isArray(day?.allAspects)
      ? day.allAspects
      : [];
  const transitChartItems = Array.isArray(day?.transit_chart?.transits)
    ? day.transit_chart.transits
    : Array.isArray(day?.transitChart?.transits)
      ? day.transitChart.transits
      : [];
  const byPlanet = new Map();
  let preciseTransitCount = 0;
  transitChartItems.forEach((item) => {
    const planet = normalizedPlanet(item?.planet || item?.name);
    const longitude = normalizeLongitude(item?.longitude);
    if (!TRANSIT_PLANET_ORDER.includes(planet) || longitude === null || byPlanet.has(planet)) return;
    preciseTransitCount += 1;
    byPlanet.set(planet, {
      planet,
      label: planetLabel(planet),
      longitude,
      color: PLANET_COLORS[planet] || "#e2e2e2",
      retrograde: Boolean(item?.retrograde),
    });
  });
  TRANSIT_PLANET_ORDER.forEach((planet) => {
    if (!byPlanet.has(planet)) {
      byPlanet.set(planet, {
        planet,
        label: planetLabel(planet),
        longitude: fallbackTransitLongitude(planet, day?.date),
        color: PLANET_COLORS[planet] || "#e2e2e2",
        estimated: true,
      });
    }
  });

  const natalPoints = collectNatalPoints(forecast);
  const natalHouseCusps = collectNatalHouseCusps(forecast);
  const transits = TRANSIT_PLANET_ORDER.map((planet) => byPlanet.get(planet));
  const transitHouseCusps = collectTransitHouseCusps(day, transits);
  const selectedNatal = natalPoints.find((point) => point.planet === selectedNatalPlanet) || natalPoints[0];
  const natalByPlanet = new Map(natalPoints.map((point) => [point.planet, point]));
  const allAspects = events
    .map((event) => {
      const natalPlanet = normalizedPlanet(event?.n_planet || event?.natal_planet);
      const transitPlanet = normalizedPlanet(event?.t_planet || event?.transit_planet);
      const transit = byPlanet.get(transitPlanet);
      const natal = natalByPlanet.get(natalPlanet);
      const exactAngle = Number(event?.aspect_angle ?? event?.angle ?? event?.exact_angle);
      if (!transit || !natal || !Number.isFinite(exactAngle)) return null;
      if (!isRenderable3DAspectAngle(exactAngle)) return null;
      return {
        natalPlanet,
        transitPlanet,
        angle: exactAngle,
        orb: Number(event?.orb),
        status: String(event?.orb_status || "").trim(),
        description: interpretationText(
          event?.description,
          event?.text_description,
          event?.Text_Description,
          event?.interpretation,
          event?.annual_interpretation,
          event?.monthly_interpretation
        ),
        color: aspectLineColor(exactAngle),
      };
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(Number(a.orb) || 99) - Math.abs(Number(b.orb) || 99));
  const selectedAspectEvents = events.filter((event) => normalizedPlanet(event?.n_planet || event?.natal_planet) === selectedNatal.planet);
  const aspects = selectedAspectEvents
    .map((event) => {
      const planet = normalizedPlanet(event?.t_planet || event?.transit_planet);
      const transit = byPlanet.get(planet);
      const exactAngle = Number(event?.aspect_angle ?? event?.angle ?? event?.exact_angle);
      if (!transit || !Number.isFinite(exactAngle)) return null;
      if (!isRenderable3DAspectAngle(exactAngle)) return null;
      const liveAngle = circularAngleDistance(transit.longitude, selectedNatal.longitude);
      return {
        planet,
        label: `${planetLabel(planet)} ${exactAngle}°`,
        angle: exactAngle,
        liveAngle,
        orb: Number(event?.orb),
        status: String(event?.orb_status || "").trim(),
        description: interpretationText(
          event?.description,
          event?.text_description,
          event?.Text_Description,
          event?.interpretation,
          event?.annual_interpretation,
          event?.monthly_interpretation
        ),
        color: aspectLineColor(exactAngle),
      };
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(Number(a.orb) || 99) - Math.abs(Number(b.orb) || 99));

  return {
    date: dateKey(day?.date) || day?.date || "",
    transits,
    natalPoints,
    natalHouseCusps,
    transitHouseCusps,
    selectedNatal,
    allAspects,
    aspects,
    hasPreciseData: preciseTransitCount >= TRANSIT_PLANET_ORDER.length && natalPoints.every((point) => !point.estimated),
  };
}

function TransitNatalSunMap({ day, forecast, availableDays = [], selectedDayIndex = 0, onSelectDayIndex = null }) {
  const mountRef = React.useRef(null);
  const frameRef = React.useRef(null);
  const sceneStateRef = React.useRef(null);
  const transitChartCacheRef = React.useRef(new Map());
  const aspectLineFocusRef = React.useRef(null);
  const preservedMapViewRef = React.useRef(null);
  const aspectListDragRef = React.useRef(null);
  const mobileAspectListDragRef = React.useRef(null);
  const aspectTooltipPanelRef = React.useRef(null);
  const aspectTooltipDragRef = React.useRef(null);
  const playbackUiUpdateEnabledRef = React.useRef(true);
  const hasManualMapPositionRef = React.useRef(false);
  const [selectedNatalPlanet, setSelectedNatalPlanet] = useState("SUN");
  const [selectedTransitTime, setSelectedTransitTime] = useState(() => currentTenMinuteTime());
  const [transitChart, setTransitChart] = useState(null);
  const [playbackTransitChart, setPlaybackTransitChart] = useState(null);
  const [transitChartLoading, setTransitChartLoading] = useState(false);
  const [transitChartError, setTransitChartError] = useState("");
  const [isTransitPlaybackActive, setIsTransitPlaybackActive] = useState(false);
  const [isTransitPlaybackPreloading, setIsTransitPlaybackPreloading] = useState(false);
  const [transitPlaybackPreloadProgress, setTransitPlaybackPreloadProgress] = useState(0);
  const [transitPlaybackCursor, setTransitPlaybackCursor] = useState(null);
  const [transitPlaybackStepDays, setTransitPlaybackStepDays] = useState(1);
  const [transitPlaybackRange, setTransitPlaybackRange] = useState("month");
  const [isPlaybackPanelOpen, setIsPlaybackPanelOpen] = useState(false);
  const [natalLayerActive, setNatalLayerActive] = useState(false);
  const [transitLayerActive, setTransitLayerActive] = useState(true);
  const [isTransitTableCollapsed, setIsTransitTableCollapsed] = useState(false);
  const [isNatalTableCollapsed, setIsNatalTableCollapsed] = useState(false);
  const [mobilePlanetTableTab, setMobilePlanetTableTab] = useState("transit");
  const [mobileMapPanelTab, setMobileMapPanelTab] = useState("display");
  const [isMapControlsMenuOpen, setIsMapControlsMenuOpen] = useState(false);
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const [isMapPositionPanelOpen, setIsMapPositionPanelOpen] = useState(false);
  const [mapZoom, setMapZoom] = useState(() => defaultMapZoom());
  const [mapOffset, setMapOffset] = useState(() => defaultMapOffset());
  const [isRotationPaused, setIsRotationPaused] = useState(false);
  const [isFlatMapView, setIsFlatMapView] = useState(false);
  const [aspectTooltip, setAspectTooltip] = useState(null);
  const [aspectLineFocus, setAspectLineFocus] = useState(null);
  const [isAspectPanelOpen, setIsAspectPanelOpen] = useState(false);
  const [isAspectListPanelOpen, setIsAspectListPanelOpen] = useState(false);
  const [aspectLineSelections, setAspectLineSelections] = useState(EMPTY_ASPECT_SELECTIONS);
  const [aspectLineMode, setAspectLineMode] = useState("transitTransit");
  const selectedAspectDisplayMode = useMemo(
    () => ASPECT_DISPLAY_MODE_OPTIONS.find((option) => option.key === aspectLineMode) || ASPECT_DISPLAY_MODE_OPTIONS[0],
    [aspectLineMode]
  );
  const [aspectInterpretationScope, setAspectInterpretationScope] = useState("all");
  const [compoundAspectListCategory, setCompoundAspectListCategory] = useState("mixed");
  const [tooltipCompositeTab, setTooltipCompositeTab] = useState("compound");
  const [openTooltipAspectKeys, setOpenTooltipAspectKeys] = useState(() => new Set());
  const [openAspectInterpretationKeys, setOpenAspectInterpretationKeys] = useState(() => new Set());
  const [selectedAspectLineHighlightKey, setSelectedAspectLineHighlightKey] = useState("");
  const [aspectTooltipPanelPosition, setAspectTooltipPanelPosition] = useState(null);
  const [aspectListPanelPosition, setAspectListPanelPosition] = useState({ x: 520, y: 104 });
  const [mobileAspectListPanelPosition, setMobileAspectListPanelPosition] = useState({ x: 10, y: 132 });
  const [isMobileAspectListDetached, setIsMobileAspectListDetached] = useState(false);
  const selectedDate = dateKey(day?.date);
  const [isTransitCalendarOpen, setIsTransitCalendarOpen] = useState(false);
  const [transitCalendarMonth, setTransitCalendarMonth] = useState(() => monthKey(day?.date));
  const displayedTransitDateTime = isTransitPlaybackActive && transitPlaybackCursor
    ? transitPlaybackCursor
    : playbackTransitChart
      ? {
        date: dateKey(playbackTransitChart.date) || selectedDate,
        time: playbackTransitChart.time || selectedTransitTime,
      }
      : { date: selectedDate, time: selectedTransitTime };
  const selectableDates = useMemo(() => availableDays.map((item) => dateKey(item?.date)).filter(Boolean), [availableDays]);
  const selectableDateSet = useMemo(() => new Set(selectableDates), [selectableDates]);
  const minSelectableDate = selectableDates[0] || selectedDate || "";
  const maxSelectableDate = selectableDates[selectableDates.length - 1] || selectedDate || "";
  useEffect(() => {
    if (!isTransitCalendarOpen) {
      setTransitCalendarMonth(monthKey(selectedDate));
    }
  }, [isTransitCalendarOpen, selectedDate]);
  const commitTransitDate = (value) => {
    setIsTransitPlaybackActive(false);
    setTransitPlaybackCursor(null);
    setPlaybackTransitChart(null);
    const nextDate = dateKey(value);
    if (!nextDate || !onSelectDayIndex) return;
    const nextIndex = selectableDates.indexOf(nextDate);
    if (nextIndex >= 0) {
      onSelectDayIndex(nextIndex);
      setIsTransitCalendarOpen(false);
      setTransitCalendarMonth(monthKey(nextDate));
    }
  };
  const handleTransitDateChange = (event) => {
    commitTransitDate(event.target.value);
  };
  const canMoveTransitCalendarMonth = (direction) => {
    const nextMonth = addMonthsToMonthKey(transitCalendarMonth || selectedDate, direction);
    if (!nextMonth) return false;
    if (direction < 0 && minSelectableDate) return nextMonth >= monthKey(minSelectableDate);
    if (direction > 0 && maxSelectableDate) return nextMonth <= monthKey(maxSelectableDate);
    return true;
  };
  const moveTransitCalendarMonth = (direction) => {
    const nextMonth = addMonthsToMonthKey(transitCalendarMonth || selectedDate, direction);
    if (!nextMonth) return;
    if (direction < 0 && minSelectableDate && nextMonth < monthKey(minSelectableDate)) return;
    if (direction > 0 && maxSelectableDate && nextMonth > monthKey(maxSelectableDate)) return;
    setTransitCalendarMonth(nextMonth);
  };
  const TransitDatePicker = ({ compact = false } = {}) => {
    const currentMonth = transitCalendarMonth || monthKey(displayedTransitDateTime.date) || monthKey(selectedDate);
    const calendarDays = calendarDaysForMonth(currentMonth);
    const calendarId = compact ? "mobile-transit-date-calendar" : "desktop-transit-date-calendar";
    const isDateSelectable = (date) => {
      if (!date) return false;
      if (selectableDateSet.has(date)) return true;
      if (minSelectableDate && date < minSelectableDate) return false;
      if (maxSelectableDate && date > maxSelectableDate) return false;
      return Boolean(minSelectableDate && maxSelectableDate);
    };
    const selectDateFromCalendar = (event, date) => {
      event.preventDefault();
      event.stopPropagation();
      commitTransitDate(date);
    };
    return (
      <div className="relative z-[90]">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setIsTransitCalendarOpen((value) => !value);
          }}
          disabled={!onSelectDayIndex}
          className={cx(
            "inline-flex h-7 items-center gap-1 rounded-md border border-transparent bg-transparent font-semibold text-starlight outline-none transition hover:border-white/10 hover:bg-[#121414]/40 focus:border-gold/50 focus:bg-[#121414]/70 focus:ring-2 focus:ring-gold/25 disabled:pointer-events-none disabled:opacity-100",
            compact ? "w-[82px] px-1 font-mono text-[10px]" : "px-1 text-xs sm:text-sm"
          )}
          aria-expanded={isTransitCalendarOpen}
          aria-controls={calendarId}
          aria-label="現行天体の計算日"
          title="日付を選択"
        >
          <span>{compact ? compactDateLabel(displayedTransitDateTime.date) : displayedTransitDateTime.date}</span>
          {!compact ? <CalendarDays size={13} className="text-mist/70" /> : null}
        </button>
        <div
          id={calendarId}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          className={cx(
            "absolute left-0 top-full z-[100] mt-1 w-[236px] overflow-hidden rounded-xl border border-white/10 bg-[#121414]/94 p-2 font-mono text-[10px] font-bold text-mist shadow-[0_18px_42px_rgba(0,0,0,0.42)] backdrop-blur-md transition",
            isTransitCalendarOpen ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0"
          )}
          aria-hidden={!isTransitCalendarOpen}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                moveTransitCalendarMonth(-1);
              }}
              disabled={!canMoveTransitCalendarMonth(-1)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] text-mist/75 transition hover:border-gold/35 hover:text-gold disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="前の月を表示"
            >
              ←
            </button>
            <p className="text-gold">{monthLabel(currentMonth)}</p>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                moveTransitCalendarMonth(1);
              }}
              disabled={!canMoveTransitCalendarMonth(1)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] text-mist/75 transition hover:border-gold/35 hover:text-gold disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="次の月を表示"
            >
              →
            </button>
          </div>
          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[8px] text-mist/45">
            {["日", "月", "火", "水", "木", "金", "土"].map((label) => <span key={label}>{label}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((date) => {
              const isCurrentMonth = monthKey(date) === currentMonth;
              const isSelected = date === displayedTransitDateTime.date;
              const isSelectable = isCurrentMonth && isDateSelectable(date);
              return (
                <button
                  key={date}
                  type="button"
                  onPointerUp={(event) => {
                    if (!isSelectable) return;
                    event.currentTarget.dataset.pointerSelected = "true";
                    selectDateFromCalendar(event, date);
                  }}
                  onClick={(event) => {
                    if (event.currentTarget.dataset.pointerSelected === "true") {
                      delete event.currentTarget.dataset.pointerSelected;
                      event.preventDefault();
                      event.stopPropagation();
                      return;
                    }
                    if (isSelectable) selectDateFromCalendar(event, date);
                  }}
                  disabled={!isSelectable}
                  className={cx(
                    "h-7 rounded-md border text-[9px] transition",
                    isSelected
                      ? "border-gold/60 bg-gold/20 text-gold"
                      : isSelectable
                        ? "border-white/10 bg-white/[0.03] text-starlight hover:border-gold/35 hover:text-gold"
                        : "border-transparent text-mist/18",
                    !isCurrentMonth && "opacity-35"
                  )}
                  aria-pressed={isSelected}
                  aria-label={`${date}を選択`}
                >
                  {Number(date.slice(8, 10))}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };
  const timeOptions = useMemo(() => tenMinuteTimeOptions(), []);
  const dayWithTransitChart = useMemo(() => (
    transitChart && transitChart.date === selectedDate && transitChart.time === selectedTransitTime
      ? { ...(day || {}), transit_chart: transitChart }
      : day
  ), [day, selectedDate, selectedTransitTime, transitChart]);
  const sceneSky = useMemo(() => transitSkyMapData(dayWithTransitChart, forecast, "SUN"), [dayWithTransitChart, forecast]);
  const sky = useMemo(() => transitSkyMapData(dayWithTransitChart, forecast, selectedNatalPlanet), [dayWithTransitChart, forecast, selectedNatalPlanet]);
  const tableDay = useMemo(() => (
    playbackTransitChart
      ? { ...(day || {}), transit_chart: playbackTransitChart }
      : dayWithTransitChart
  ), [day, dayWithTransitChart, playbackTransitChart]);
  const tableSky = useMemo(() => transitSkyMapData(tableDay, forecast, selectedNatalPlanet), [tableDay, forecast, selectedNatalPlanet]);
  const aspectLineSky = playbackTransitChart ? tableSky : sky;
  const livePlaybackAspects = useMemo(
    () => (isTransitPlaybackActive && playbackTransitChart
      ? liveAspectsFromChart(playbackTransitChart, tableSky.natalPoints)
      : null),
    [isTransitPlaybackActive, playbackTransitChart, tableSky.natalPoints]
  );
  const livePlaybackTransitTransitAspects = useMemo(
    () => (isTransitPlaybackActive && playbackTransitChart ? liveTransitTransitAspectsFromChart(playbackTransitChart) : null),
    [isTransitPlaybackActive, playbackTransitChart]
  );
  const currentLiveAspects = useMemo(() => {
    const preciseTransits = aspectLineSky.transits.filter((item) => !item.estimated);
    if (!preciseTransits.length) return [];
    return liveAspectsFromChart({ transits: preciseTransits }, aspectLineSky.natalPoints);
  }, [aspectLineSky.natalPoints, aspectLineSky.transits]);
  const currentTransitTransitAspects = useMemo(() => {
    const preciseTransits = aspectLineSky.transits.filter((item) => !item.estimated);
    if (preciseTransits.length < 2) return [];
    return transitTransitAspectsFromTransits(preciseTransits);
  }, [aspectLineSky.transits]);
  const transitNatalSourceAspects = useMemo(
    () => livePlaybackAspects || mergeAspectSources(aspectLineSky.allAspects, currentLiveAspects),
    [aspectLineSky.allAspects, currentLiveAspects, livePlaybackAspects]
  );
  const transitTransitSourceAspects = useMemo(
    () => livePlaybackTransitTransitAspects || currentTransitTransitAspects,
    [currentTransitTransitAspects, livePlaybackTransitTransitAspects]
  );
  const natalNatalSourceAspects = useMemo(
    () => natalNatalAspectsFromPoints(aspectLineSky.natalPoints),
    [aspectLineSky.natalPoints]
  );
  const aspectLineSourceAspects = useMemo(() => [
    ...transitNatalSourceAspects,
    ...transitTransitSourceAspects,
  ], [transitNatalSourceAspects, transitTransitSourceAspects]);
  const compoundModeCategory = compoundCategoryForAspectMode(aspectLineMode);
  const activeCompoundAspectListCategory = compoundModeCategory || compoundAspectListCategory;
  const shouldComputeCompoundAspects = isCompoundAspectMode(aspectLineMode) || aspectInterpretationScope === "composite";
  const compoundAspectSourceAspects = useMemo(() => (
    shouldComputeCompoundAspects
      ? [...aspectLineSourceAspects, ...natalNatalSourceAspects]
      : []
  ), [shouldComputeCompoundAspects, aspectLineSourceAspects, natalNatalSourceAspects]);
  const compoundAspectGroups = useMemo(() => (
    shouldComputeCompoundAspects ? detectCompoundAspects(compoundAspectSourceAspects, { realtimeOnly: isTransitPlaybackActive }) : []
  ), [shouldComputeCompoundAspects, compoundAspectSourceAspects, isTransitPlaybackActive]);
  const compoundLineAspects = useMemo(() => compoundAspectLineComponents(compoundAspectGroups), [compoundAspectGroups]);
  const aspectLineDisplaySourceAspects = useMemo(() => (
    isCompoundAspectMode(aspectLineMode)
      ? compoundLineAspects
      : aspectLineMode === "custom"
        ? [...aspectLineSourceAspects, ...natalNatalSourceAspects]
        : [...aspectLineSourceAspects, ...natalNatalSourceAspects]
  ), [aspectLineMode, aspectLineSourceAspects, compoundLineAspects, natalNatalSourceAspects]);
  const activeAspectLineAspects = useMemo(() => filterAspectLinesForControls(aspectLineDisplaySourceAspects, {
    focus: aspectLineFocus,
    selections: aspectLineSelections,
    mode: aspectLineMode,
  }), [aspectLineFocus, aspectLineSelections, aspectLineMode, aspectLineDisplaySourceAspects]);
  const focusedNatalPlanets = useMemo(() => new Set(
    activeAspectLineAspects.flatMap((aspect) => [aspect.natalPlanet, aspect.natalPlanetB]).filter(Boolean)
  ), [activeAspectLineAspects]);
  const focusedTransitPlanets = useMemo(() => new Set(
    activeAspectLineAspects.flatMap((aspect) => [aspect.transitPlanet, aspect.transitPlanetB]).filter(Boolean)
  ), [activeAspectLineAspects]);
  const aspectInterpretationBuckets = useMemo(() => {
    const descriptionLookup = new Map(
      aspectLineSky.allAspects.map((aspect) => [
        `${aspect.transitPlanet}-${aspect.natalPlanet}-${normalizeAspectAngle(aspect.angle)}`,
        aspect.description,
      ])
    );
    const compoundItems = compoundAspectGroups.map((group) => ({
        ...group,
        liveAngle: null,
        importance: aspectImportance(group),
        scopeLabel: "複合アスペクト",
        category: compoundGroupCategory(group),
        detailText: compoundKindDetailText(group.kind),
      }));
    const filteredCompoundItems = compoundItems.filter((item) => item.category === activeCompoundAspectListCategory);
    const singleSourceAspects = aspectInterpretationScope === "composite" ? compoundLineAspects : aspectLineSourceAspects;
    const singleItems = singleSourceAspects
      .filter((aspect) => aspectInterpretationScope === "composite" || isRenderable3DAspectAngle(aspect.angle))
      .filter((aspect) => (
        aspectInterpretationScope === "composite"
        || 
        aspectInterpretationScope === "all"
        || (aspectInterpretationScope === "transitNatal" && (aspect.scope || "transitNatal") === "transitNatal")
        || (aspectInterpretationScope === "transitTransit" && aspect.scope === "transitTransit")
      ))
      .map((aspect) => {
        const transit = aspectLineSky.transits.find((item) => item.planet === aspect.transitPlanet);
        const transitB = aspectLineSky.transits.find((item) => item.planet === aspect.transitPlanetB);
        const natal = aspectLineSky.natalPoints.find((item) => item.planet === aspect.natalPlanet);
        const liveAngle = aspect.scope === "transitTransit"
          ? transit && transitB ? circularAngleDistance(transit.longitude, transitB.longitude) : null
          : transit && natal ? circularAngleDistance(transit.longitude, natal.longitude) : null;
        const importance = aspectImportance(aspect);
        const descriptionKey = `${aspect.transitPlanet}-${aspect.natalPlanet}-${normalizeAspectAngle(aspect.angle)}`;
        return {
          ...aspect,
          key: aspect.scope === "transitTransit"
            ? `tt-${aspect.compoundKey || "single"}-${aspect.transitPlanet}-${aspect.transitPlanetB}-${aspect.angle}`
            : `tn-${aspect.compoundKey || "single"}-${aspect.transitPlanet}-${aspect.natalPlanet}-${aspect.angle}`,
          liveAngle,
          importance,
          description: aspect.description || descriptionLookup.get(descriptionKey) || aspectInterpretationFallback(aspect),
          title: aspect.scope === "transitTransit"
            ? `現行${planetLabel(aspect.transitPlanet)} × 現行${planetLabel(aspect.transitPlanetB)}　${aspect.angle}°`
            : `ネイタル${planetLabel(aspect.natalPlanet)} × 現行${planetLabel(aspect.transitPlanet)}　${aspect.angle}°`,
          scopeLabel: aspect.scope === "transitTransit" ? "現行天体同士" : "出生図との関係",
        };
      })
      .sort((a, b) => (b.importance.score - a.importance.score) || Math.abs(Number(a.orb) || 99) - Math.abs(Number(b.orb) || 99));
    const visibleItems = aspectInterpretationScope === "composite"
      ? filteredCompoundItems
      : aspectInterpretationScope === "all"
        ? singleItems
        : singleItems;
    return {
      compoundItems,
      filteredCompoundItems,
      singleItems,
      visibleItems,
    };
  }, [aspectInterpretationScope, activeCompoundAspectListCategory, aspectLineSky.allAspects, aspectLineSky.natalPoints, aspectLineSky.transits, aspectLineSourceAspects, compoundAspectGroups, compoundLineAspects]);
  const aspectInterpretationItems = aspectInterpretationBuckets.visibleItems;
  const selectAspectLineMode = (mode) => {
    setAspectLineMode(mode);
    if (mode === "custom") return;
    if (mode === "compositeTransit") {
      setCompoundAspectListCategory("transitOnly");
      setAspectInterpretationScope("composite");
    } else if (mode === "compositeTransitNatal") {
      setCompoundAspectListCategory("mixed");
      setAspectInterpretationScope("composite");
    } else {
      setAspectInterpretationScope(mode);
    }
    setIsAspectListPanelOpen(true);
  };
  const toggleAspectLineSelection = (scope, group, planet) => {
    setAspectLineSelections((current) => {
      const next = {
        transitNatal: {
          natal: [...(current?.transitNatal?.natal || [])],
          transit: [...(current?.transitNatal?.transit || [])],
        },
        transitTransit: {
          natal: [...(current?.transitTransit?.natal || [])],
          transit: [...(current?.transitTransit?.transit || [])],
        },
        natalNatal: {
          natal: [...(current?.natalNatal?.natal || [])],
          transit: [...(current?.natalNatal?.transit || [])],
        },
      };
      const list = next?.[scope]?.[group];
      if (!list) return current;
      if (list.includes(planet)) {
        next[scope][group] = list.filter((item) => item !== planet);
      } else {
        next[scope][group] = [...list, planet];
      }
      return next;
    });
  };
  const setAspectLineGroupSelection = (scope, mode) => {
    setAspectLineSelections((current) => {
      const next = {
        transitNatal: {
          natal: [...(current?.transitNatal?.natal || [])],
          transit: [...(current?.transitNatal?.transit || [])],
        },
        transitTransit: {
          natal: [...(current?.transitTransit?.natal || [])],
          transit: [...(current?.transitTransit?.transit || [])],
        },
        natalNatal: {
          natal: [...(current?.natalNatal?.natal || [])],
          transit: [...(current?.natalNatal?.transit || [])],
        },
      };
      if (!next[scope]) return current;
      next[scope] = mode === "all"
        ? {
          natal: scope === "transitNatal" || scope === "natalNatal" ? sky.natalPoints.map((item) => item.planet) : [],
          transit: scope === "natalNatal" ? [] : sky.transits.map((item) => item.planet),
        }
        : { natal: [], transit: [] };
      return next;
    });
  };
  const preserveCurrentMapView = React.useCallback(() => {
    const state = sceneStateRef.current;
    if (!state?.group) return;
    preservedMapViewRef.current = {
      groupRotationX: state.group.rotation.x,
      groupRotationY: state.group.rotation.y,
      cameraTiltDegrees: state.cameraTiltDegrees,
      hasManualTilt: state.hasManualTilt,
    };
  }, []);

  useEffect(() => {
    aspectLineFocusRef.current = aspectLineFocus;
  }, [aspectLineFocus]);

  useEffect(() => {
    playbackUiUpdateEnabledRef.current = Boolean(
      !isTransitTableCollapsed
      || !isNatalTableCollapsed
      || isAspectListPanelOpen
      || aspectTooltip
    );
  }, [isTransitTableCollapsed, isNatalTableCollapsed, isAspectListPanelOpen, aspectTooltip]);

  useEffect(() => {
    if (!aspectLineFocus) return;
    const hasFocusedPlanet = aspectLineFocus.type === "natal"
      ? sky.natalPoints.some((point) => point.planet === aspectLineFocus.planet)
      : sky.transits.some((point) => point.planet === aspectLineFocus.planet);
    if (!hasFocusedPlanet) {
      setAspectLineFocus(null);
    }
  }, [aspectLineFocus, sky.natalPoints, sky.transits]);

  useEffect(() => {
    if (isTransitPlaybackActive) return;
    if (!selectedDate) return;
    const formPayload = getQueryReadingForm() || getStoredReadingForm();
    if (!formPayload) return;
    const cacheKey = transitChartCacheKey(selectedDate, selectedTransitTime);
    const cachedChart = transitChartCacheRef.current.get(cacheKey);
    if (cachedChart) {
      setTransitChart(cachedChart);
      setTransitChartLoading(false);
      setTransitChartError("");
      return;
    }
    let active = true;
    setTransitChartLoading(true);
    setTransitChartError("");
    postJson("/api/transit-chart", {
      ...formPayload,
      target_date: selectedDate,
      target_time: selectedTransitTime,
    })
      .then((payload) => {
        if (active) {
          transitChartCacheRef.current.set(cacheKey, payload);
          setTransitChart(payload);
        }
      })
      .catch((error) => {
        if (active) {
          setTransitChartError(readableErrorMessage(error, "現行天体の再計算に失敗しました。"));
        }
      })
      .finally(() => {
        if (active) {
          setTransitChartLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [selectedDate, selectedTransitTime, isTransitPlaybackActive]);

  const fetchTransitChartFor = React.useCallback(async (targetDate, targetTime) => {
    const cacheKey = transitChartCacheKey(targetDate, targetTime);
    const cachedChart = transitChartCacheRef.current.get(cacheKey);
    if (cachedChart) return cachedChart;
    const formPayload = getQueryReadingForm() || getStoredReadingForm();
    if (!formPayload) throw new Error("出生データが見つかりません。");
    const payload = await postJson("/api/transit-chart", {
      ...formPayload,
      target_date: targetDate,
      target_time: targetTime,
    });
    transitChartCacheRef.current.set(cacheKey, payload);
    return payload;
  }, []);

  const preloadTransitChartsForDates = React.useCallback(async (targetTime, targetDates = null, onProgress = null) => {
    const dates = Array.isArray(targetDates) && targetDates.length
      ? targetDates
      : selectableDates.length ? selectableDates : [selectedDate].filter(Boolean);
    onProgress?.(0, dates.length);
    for (let index = 0; index < dates.length; index += 4) {
      const batch = dates.slice(index, index + 4);
      await Promise.all(batch.map((targetDate) => fetchTransitChartFor(targetDate, targetTime)));
      onProgress?.(Math.min(index + batch.length, dates.length), dates.length);
    }
  }, [fetchTransitChartFor, selectableDates, selectedDate]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return () => {};
    mount.innerHTML = "";

    const scene = new THREE.Scene();
    const textures = [];
    const spinningMeshes = [];
    const symbolBillboards = [];
    const hoverTargets = [];
    const natalMeshes = new Map();
    const natalHouseLabels = [];
    const natalLayerLabels = [];
    const natalPlanetSymbols = [];
    const transitLayerObjects = [];
    const transitHouseLabels = [];
    const transitHouseLines = [];
    const transitLayerLabels = [];
    const transitPositions = new Map();
    const transitVisuals = new Map();
    const aspectGroup = new THREE.Group();
    const preservedMapView = preservedMapViewRef.current;
    const initialCameraTiltDegrees = Number.isFinite(preservedMapView?.cameraTiltDegrees)
      ? preservedMapView.cameraTiltDegrees
      : isFlatMapView ? 84 : 17;
    const initialHasManualTilt = preservedMapView?.hasManualTilt ?? isFlatMapView;
    const initialGroupRotationX = Number.isFinite(preservedMapView?.groupRotationX)
      ? preservedMapView.groupRotationX
      : isFlatMapView ? 0 : 0.18;
    const initialGroupRotationY = Number.isFinite(preservedMapView?.groupRotationY)
      ? preservedMapView.groupRotationY
      : isFlatMapView ? 0 : 0.22;
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(
      0,
      isFlatMapView ? 13.5 : cameraYForTiltDegrees(initialCameraTiltDegrees),
      isFlatMapView ? 0.01 : 10.5
    );
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none";
    mount.appendChild(renderer.domElement);
    const tooltip = document.createElement("div");
    tooltip.style.position = "absolute";
    tooltip.style.zIndex = "30";
    tooltip.style.pointerEvents = "none";
    tooltip.style.display = "none";
    tooltip.style.maxWidth = "180px";
    tooltip.style.border = "1px solid rgba(233,195,73,0.38)";
    tooltip.style.borderRadius = "10px";
    tooltip.style.background = "rgba(13,14,15,0.84)";
    tooltip.style.boxShadow = "0 10px 28px rgba(0,0,0,0.34)";
    tooltip.style.backdropFilter = "blur(10px)";
    tooltip.style.padding = "7px 10px";
    tooltip.style.fontFamily = "JetBrains Mono, monospace";
    tooltip.style.fontSize = "10px";
    tooltip.style.fontWeight = "800";
    tooltip.style.letterSpacing = "0.06em";
    tooltip.style.color = "#e2e2e2";
    mount.parentElement?.appendChild(tooltip);

    const group = new THREE.Group();
    group.rotation.x = initialGroupRotationX;
    group.rotation.y = initialGroupRotationY;
    group.scale.setScalar(mapZoom);
    applyMapOffset(group, mapOffset, isFlatMapView);
    scene.add(group);

    scene.add(new THREE.AmbientLight(0xffffff, 0.34));
    const keyLight = new THREE.DirectionalLight(0xffe8b0, 2.65);
    keyLight.position.set(4.8, 7.5, 7.2);
    scene.add(keyLight);
    const coolLight = new THREE.DirectionalLight(0x8bd3ff, 0.72);
    coolLight.position.set(-5.5, 3.4, -4.5);
    scene.add(coolLight);
    const fillLight = new THREE.PointLight(0xffffff, 0.32, 16);
    fillLight.position.set(-1.5, 2.2, 3.5);
    scene.add(fillLight);

    const isMobileMapCanvas = window.matchMedia?.("(max-width: 639px)").matches ?? window.innerWidth < 640;
    const mapRadii = {
      natalOrbitRadius: isMobileMapCanvas ? 1.76 : 2.05,
      natalHouseInnerRadius: isMobileMapCanvas ? 1.46 : 1.72,
      natalHouseOuterRadius: isMobileMapCanvas ? 2.92 : 3.28,
      natalHouseLabelRadius: isMobileMapCanvas ? 2.26 : 2.58,
      transitHouseInnerRadius: isMobileMapCanvas ? 2.92 : 3.28,
      transitOrbitRadius: isMobileMapCanvas ? 3.66 : 4.15,
      transitHouseLabelRadius: isMobileMapCanvas ? 3.28 : 3.72,
      transitPlanetRadius: isMobileMapCanvas ? 3.42 : 3.88,
      zodiacOuterRadius: isMobileMapCanvas ? 4.16 : 4.72,
      zodiacLabelRadius: isMobileMapCanvas ? 3.92 : 4.45,
    };
    const {
      natalOrbitRadius,
      natalHouseInnerRadius,
      natalHouseOuterRadius,
      natalHouseLabelRadius,
      transitHouseInnerRadius,
      transitOrbitRadius,
      transitHouseLabelRadius,
      transitPlanetRadius,
      zodiacOuterRadius,
      zodiacLabelRadius,
    } = mapRadii;

    [
      { radius: natalOrbitRadius, color: 0xe9c349, opacity: 0.2 },
      { radius: natalHouseOuterRadius, color: 0xffffff, opacity: 0.08 },
      { radius: transitOrbitRadius, color: 0x8bd3ff, opacity: 0.18 },
      { radius: zodiacOuterRadius, color: 0xe9c349, opacity: 0.12 },
    ].forEach((item) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(item.radius, 0.01, 10, 160),
        new THREE.MeshBasicMaterial({ color: item.color, transparent: true, opacity: item.opacity })
      );
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
    });

    const earthSurfaceTexture = earthTexture();
    const earthCloudsTexture = earthCloudTexture();
    textures.push(earthSurfaceTexture);
    textures.push(earthCloudsTexture);
    const earthMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.38, 96, 54),
      new THREE.MeshStandardMaterial({
        map: earthSurfaceTexture,
        bumpMap: earthSurfaceTexture,
        bumpScale: 0.052,
        color: 0xffffff,
        emissive: new THREE.Color("#0b3d91"),
        emissiveIntensity: 0.045,
        metalness: 0.02,
        roughness: 0.72,
      })
    );
    earthMesh.position.set(0, 0.16, 0);
    earthMesh.rotation.z = 0.36;
    earthMesh.userData.tooltip = "地球";
    spinningMeshes.push({ mesh: earthMesh, speed: 0.0024 });
    hoverTargets.push(earthMesh);
    group.add(earthMesh);

    const earthCloudMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.388, 96, 54),
      new THREE.MeshStandardMaterial({
        map: earthCloudsTexture,
        alphaMap: earthCloudsTexture,
        color: 0xffffff,
        transparent: true,
        opacity: 0.52,
        depthWrite: false,
        roughness: 0.35,
        metalness: 0,
      })
    );
    earthCloudMesh.position.copy(earthMesh.position);
    earthCloudMesh.rotation.z = 0.36;
    spinningMeshes.push({ mesh: earthCloudMesh, speed: 0.0034 });
    group.add(earthCloudMesh);

    const earthGlowTexture = planetGlowTexture("#5ab7ff");
    textures.push(earthGlowTexture);
    const earthGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: earthGlowTexture,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
      })
    );
    earthGlow.position.copy(earthMesh.position);
    earthGlow.scale.set(1.58, 1.58, 1);
    earthGlow.renderOrder = -2;
    group.add(earthGlow);

    const earthAtmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.405, 96, 54),
      new THREE.MeshBasicMaterial({
        color: 0x86d9ff,
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    earthAtmosphere.position.copy(earthMesh.position);
    group.add(earthAtmosphere);

    sceneSky.natalHouseCusps.forEach((longitude, index) => {
      const inner = longitudePosition(longitude, natalHouseInnerRadius, -0.03);
      const outer = longitudePosition(longitude, natalHouseOuterRadius, -0.03);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([inner, outer]),
        new THREE.LineBasicMaterial({
          color: 0xe9c349,
          transparent: true,
          opacity: index === 0 ? 0.24 : 0.13,
        })
      );
      group.add(line);
    });
    sceneSky.natalHouseCusps.forEach((longitude, index) => {
      const nextLongitude = sceneSky.natalHouseCusps[(index + 1) % sceneSky.natalHouseCusps.length];
      const { mesh, texture } = orbitTextPlane(index + 1, {
        color: "#f4d66f",
        font: "800 114px JetBrains Mono, monospace",
        scaleX: index + 1 >= 10 ? 0.66 : 0.495,
        scaleY: 0.375,
        opacity: index === 0 ? 0.86 : 0.68,
        glowColor: index === 0 ? "rgba(255,224,96,0.95)" : "rgba(233,195,73,0.82)",
        glowBlur: index === 0 ? 34 : 28,
      });
      textures.push(texture);
      setOrbitTextPlaneTransform(mesh, midpointLongitude(longitude, nextLongitude), natalHouseLabelRadius, 0.07);
      natalHouseLabels.push({
        mesh,
        brightOpacity: index === 0 ? 0.98 : 0.84,
        dimOpacity: index === 0 ? 0.11 : 0.07,
      });
      group.add(mesh);
    });
    sceneSky.transitHouseCusps.forEach((longitude, index) => {
      const inner = longitudePosition(longitude, transitHouseInnerRadius, -0.03);
      const outer = longitudePosition(longitude, transitOrbitRadius, -0.03);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([inner, outer]),
        new THREE.LineBasicMaterial({
          color: 0x8bd3ff,
          transparent: true,
          opacity: index === 0 ? 0.22 : 0.12,
        })
      );
      transitHouseLines.push({
        line,
        index,
        brightOpacity: index === 0 ? 0.22 : 0.12,
      });
      group.add(line);
    });
    sceneSky.transitHouseCusps.forEach((longitude, index) => {
      const nextLongitude = sceneSky.transitHouseCusps[(index + 1) % sceneSky.transitHouseCusps.length];
      const { mesh, texture } = orbitTextPlane(index + 1, {
        color: index === 0 ? "#bfeaff" : "#d7d6dc",
        font: "800 126px JetBrains Mono, monospace",
        scaleX: index + 1 >= 10 ? 0.75 : 0.555,
        scaleY: 0.42,
        opacity: index === 0 ? 0.46 : 0.36,
        glowColor: "rgba(139,211,255,0.26)",
        glowBlur: 14,
      });
      textures.push(texture);
      setOrbitTextPlaneTransform(mesh, midpointLongitude(longitude, nextLongitude), transitHouseLabelRadius, 0.07);
      transitHouseLabels.push({
        mesh,
        index,
        brightOpacity: index === 0 ? 0.46 : 0.36,
      });
      group.add(mesh);
    });
    for (let index = 0; index < 12; index += 1) {
      const longitude = index * 30;
      const inner = longitudePosition(longitude, transitOrbitRadius, -0.03);
      const outer = longitudePosition(longitude, zodiacOuterRadius, -0.03);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([inner, outer]),
        new THREE.LineBasicMaterial({
          color: 0x8bd3ff,
          transparent: true,
          opacity: index % 3 === 0 ? 0.2 : 0.12,
        })
      );
      group.add(line);
    }
    ZODIAC_SIGNS.forEach((signSymbol, index) => {
      const { mesh, texture } = orbitTextPlane(signSymbol, {
        color: "#e9c349",
        font: "900 108px 'Noto Sans Symbols 2', 'Noto Sans Symbols', 'Segoe UI Symbol', 'Apple Symbols', 'DejaVu Sans', sans-serif",
        width: 160,
        height: 128,
        scaleX: isMobileMapCanvas ? 0.5 : 0.42,
        scaleY: isMobileMapCanvas ? 0.42 : 0.34,
        opacity: isMobileMapCanvas ? 0.88 : 0.72,
        strokeOnly: false,
        glowColor: "rgba(233,195,73,0.62)",
        glowBlur: 22,
      });
      textures.push(texture);
      setOrbitTextPlaneTransform(mesh, index * 30 + 15, zodiacLabelRadius, 0.05);
      group.add(mesh);
    });
    [
      { label: "ネイタル天体", longitude: 262, radius: natalOrbitRadius, color: "#e9c349", opacity: 0.74 },
      { label: "現行天体", longitude: 262, radius: transitOrbitRadius, color: "#8bd3ff", opacity: 0.72 },
    ].forEach((item) => {
      const { mesh, texture } = orbitTextPlane(item.label, {
        color: item.color,
        font: "900 58px 'Noto Sans JP', 'Yu Gothic', sans-serif",
        width: 380,
        height: 150,
        scaleX: 1.08,
        scaleY: 0.34,
        opacity: item.opacity,
        glowColor: item.label === "ネイタル天体" ? "rgba(255,224,96,0.9)" : "rgba(139,211,255,0.86)",
        glowBlur: 30,
      });
      textures.push(texture);
      setOrbitTextPlaneTransform(mesh, item.longitude, item.radius, 0.11);
      if (item.label === "ネイタル天体") {
        mesh.userData.tooltip = "ネイタル天体";
        mesh.userData.toggleNatalLayer = true;
        hoverTargets.push(mesh);
        natalLayerLabels.push({ mesh, brightOpacity: item.opacity, dimOpacity: 0.34 });
      } else if (item.label === "現行天体") {
        mesh.userData.tooltip = "現行天体";
        mesh.userData.toggleTransitLayer = true;
        hoverTargets.push(mesh);
        transitLayerLabels.push({ mesh, brightOpacity: item.opacity, dimOpacity: 0.34 });
      }
      group.add(mesh);
    });

    sceneSky.natalPoints.forEach((point, index) => {
      const position = longitudePosition(point.longitude, natalOrbitRadius, 0.42 + (index % 2) * 0.16);
      const texture = planetTexture(point.planet);
      textures.push(texture);
      const material = new THREE.MeshStandardMaterial({
        map: texture,
        color: new THREE.Color(point.color).lerp(new THREE.Color("#9ca3af"), 0.35),
        emissive: new THREE.Color(point.color),
        emissiveIntensity: 0.08,
        metalness: 0.06,
        roughness: 0.62,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.14, 48, 24), material);
      mesh.position.copy(position);
      mesh.userData.tooltip = `あなたの${planetLabel(point.planet)}`;
      mesh.userData.natalPlanet = point.planet;
      mesh.scale.setScalar(0.86);
      spinningMeshes.push({ mesh, speed: 0.0025 });
      hoverTargets.push(mesh);
      natalMeshes.set(point.planet, { mesh, material, point });
      group.add(mesh);

      const hitMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 32, 16),
        new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0,
          depthTest: false,
          depthWrite: false,
        })
      );
      hitMesh.position.copy(position);
      hitMesh.userData.tooltip = `あなたの${planetLabel(point.planet)}`;
      hitMesh.userData.natalPlanet = point.planet;
      hoverTargets.push(hitMesh);
      group.add(hitMesh);

      const symbol = PLANET_SYMBOLS[point.planet] || planetLabel(point.planet);
      const symbolTexture = planetSymbolTexture(symbol, point.color);
      const flatSymbolTexture = planetSymbolOutlineTexture(symbol, point.color);
      textures.push(symbolTexture);
      textures.push(flatSymbolTexture);
      const symbolSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: symbolTexture,
          transparent: true,
          opacity: 0.14,
          depthTest: false,
          depthWrite: false,
        })
      );
      const symbolScale = 0.44;
      symbolSprite.scale.set(symbolScale, symbolScale, 1);
      symbolSprite.renderOrder = 7;
      symbolSprite.userData.tooltip = `あなたの${planetLabel(point.planet)}`;
      symbolSprite.userData.natalPlanet = point.planet;
      hoverTargets.push(symbolSprite);
      symbolBillboards.push({ sprite: symbolSprite, target: mesh, offset: 0.18, baseScale: symbolScale, avoidOverlap: true });
      natalPlanetSymbols.push({
        sprite: symbolSprite,
        planet: point.planet,
        normalTexture: symbolTexture,
        flatTexture: flatSymbolTexture,
        brightOpacity: point.planet === "ASC" || point.planet === "MC" ? 0.74 : 0.82,
        dimOpacity: 0.14,
      });
      group.add(symbolSprite);
    });

    sceneSky.transits.forEach((item, index) => {
      const position = longitudePosition(item.longitude, transitPlanetRadius, (index % 2) * 0.18);
      transitPositions.set(item.planet, position.clone());
      const transitVisual = {
        longitude: item.longitude,
        baseY: (index % 2) * 0.18,
        objects: [],
      };
      const radius = {
        SUN: 0.24,
        MOON: 0.15,
        MERCURY: 0.14,
        VENUS: 0.18,
        MARS: 0.17,
        JUPITER: 0.3,
        SATURN: 0.27,
        URANUS: 0.2,
        NEPTUNE: 0.21,
        PLUTO: 0.13,
      }[item.planet] || 0.16;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 72, 38),
        planetMaterial(item, textures)
      );
      mesh.material.transparent = true;
      mesh.position.copy(position);
      mesh.rotation.z = item.planet === "URANUS" ? 1.25 : 0.15;
      mesh.userData.tooltip = item.label;
      mesh.userData.transitPlanet = item.planet;
      spinningMeshes.push({ mesh, speed: item.planet === "JUPITER" ? 0.01 : 0.004 + index * 0.00045 });
      hoverTargets.push(mesh);
      transitVisual.mesh = mesh;
      transitVisual.objects.push(mesh);
      transitLayerObjects.push({
        planet: item.planet,
        object: mesh,
        brightOpacity: 1,
        dimOpacity: item.planet === "SUN" ? 0.28 : 0.2,
        brightEmissiveIntensity: mesh.material.emissiveIntensity,
        dimEmissiveIntensity: item.planet === "SUN" ? 0.18 : 0.018,
      });
      group.add(mesh);

      const hitMesh = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(radius * 1.7, 0.32), 32, 16),
        new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0,
          depthTest: false,
          depthWrite: false,
        })
      );
      hitMesh.position.copy(position);
      hitMesh.userData.tooltip = item.label;
      hitMesh.userData.transitPlanet = item.planet;
      hoverTargets.push(hitMesh);
      transitVisual.objects.push(hitMesh);
      group.add(hitMesh);

      const symbolTexture = planetSymbolTexture(PLANET_SYMBOLS[item.planet] || item.label, item.color);
      textures.push(symbolTexture);
      const symbolSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: symbolTexture,
          transparent: true,
          opacity: 0.82,
          depthTest: false,
          depthWrite: false,
        })
      );
      const symbolScale = 0.44;
      symbolSprite.scale.set(symbolScale, symbolScale, 1);
      symbolSprite.renderOrder = 7;
      symbolSprite.userData.tooltip = item.label;
      symbolSprite.userData.transitPlanet = item.planet;
      hoverTargets.push(symbolSprite);
      symbolBillboards.push({ sprite: symbolSprite, target: mesh, offset: radius + 0.035, baseScale: symbolScale });
      transitLayerObjects.push({
        planet: item.planet,
        object: symbolSprite,
        brightOpacity: 0.82,
        dimOpacity: 0.16,
        flatBrightOpacity: 1,
        flatDimOpacity: 0.34,
      });
      group.add(symbolSprite);

      const glowTexture = planetGlowTexture(item.color);
      textures.push(glowTexture);
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture,
          color: 0xffffff,
          transparent: true,
          opacity: item.planet === "SUN" ? 0.46 : 0.28,
          blending: THREE.AdditiveBlending,
          depthTest: false,
          depthWrite: false,
        })
      );
      glow.position.copy(position);
      const glowScale = radius * (item.planet === "SUN" ? 4.55 : 3.9);
      glow.scale.set(glowScale, glowScale, 1);
      glow.renderOrder = -1;
      transitVisual.objects.push(glow);
      transitLayerObjects.push({
        planet: item.planet,
        object: glow,
        brightOpacity: glow.material.opacity,
        dimOpacity: item.planet === "SUN" ? 0.08 : 0.04,
      });
      group.add(glow);

      if (item.planet === "SUN") {
        const coronaTexture = planetGlowTexture("#f05a0a");
        const flameTexture = solarFlameTexture();
        const coronaRayTexture = solarCoronaRayTexture();
        textures.push(coronaTexture);
        textures.push(flameTexture);
        textures.push(coronaRayTexture);
        const corona = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: coronaTexture,
            color: 0xff7a18,
            transparent: true,
            opacity: 0.34,
            blending: THREE.AdditiveBlending,
            depthTest: false,
            depthWrite: false,
          })
        );
        corona.position.copy(position);
        corona.scale.set(radius * 5.2, radius * 5.2, 1);
        corona.renderOrder = -2;
        transitVisual.objects.push(corona);
        transitLayerObjects.push({
          planet: item.planet,
          object: corona,
          brightOpacity: 0.34,
          dimOpacity: 0.05,
        });
        group.add(corona);

        const coronaRays = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: coronaRayTexture,
            color: 0xff7b19,
            transparent: true,
            opacity: 0.18,
            blending: THREE.AdditiveBlending,
            depthTest: false,
            depthWrite: false,
          })
        );
        coronaRays.position.copy(position);
        coronaRays.scale.set(radius * 5.6, radius * 5.6, 1);
        coronaRays.renderOrder = -3;
        transitVisual.objects.push(coronaRays);
        spinningMeshes.push({ mesh: coronaRays, speed: 0.0011, materialRotation: true });
        transitLayerObjects.push({
          planet: item.planet,
          object: coronaRays,
          brightOpacity: 0.18,
          dimOpacity: 0.045,
        });
        group.add(coronaRays);

        [0, 1].forEach((flameIndex) => {
          const flame = new THREE.Sprite(
            new THREE.SpriteMaterial({
              map: flameTexture,
              color: flameIndex ? 0xe94f08 : 0xff8a1a,
              transparent: true,
              opacity: flameIndex ? 0.12 : 0.16,
              blending: THREE.AdditiveBlending,
              depthTest: false,
              depthWrite: false,
            })
          );
          flame.position.copy(position);
          const flameScale = radius * (flameIndex ? 3.9 : 3.6);
          flame.scale.set(flameScale, flameScale, 1);
          flame.renderOrder = -1;
          transitVisual.objects.push(flame);
          spinningMeshes.push({ mesh: flame, speed: flameIndex ? -0.0018 : 0.0026, materialRotation: true });
          transitLayerObjects.push({
            planet: item.planet,
            object: flame,
            brightOpacity: flame.material.opacity,
            dimOpacity: 0.045,
          });
          group.add(flame);
        });
      }

      if (item.planet === "SATURN") {
        [1.65, 2.08].forEach((scale, ringIndex) => {
          const saturnRing = new THREE.Mesh(
            new THREE.TorusGeometry(radius * scale, ringIndex ? 0.008 : 0.014, 8, 128),
            new THREE.MeshBasicMaterial({ color: ringIndex ? 0xb99d66 : 0xf1dfb4, transparent: true, opacity: ringIndex ? 0.42 : 0.66 })
          );
          saturnRing.position.copy(position);
          saturnRing.rotation.x = Math.PI / 2.6;
          saturnRing.rotation.z = 0.45;
          transitVisual.objects.push(saturnRing);
          transitLayerObjects.push({
            planet: item.planet,
            object: saturnRing,
            brightOpacity: saturnRing.material.opacity,
            dimOpacity: 0.08,
          });
          group.add(saturnRing);
        });
      }

      if (item.planet === "URANUS") {
        const uranusRing = new THREE.Mesh(
          new THREE.TorusGeometry(radius * 1.55, 0.006, 8, 96),
          new THREE.MeshBasicMaterial({ color: 0xb8fbff, transparent: true, opacity: 0.34 })
        );
        uranusRing.position.copy(position);
        uranusRing.rotation.x = Math.PI / 2.1;
        uranusRing.rotation.z = 1.15;
        transitVisual.objects.push(uranusRing);
        transitLayerObjects.push({
          planet: item.planet,
          object: uranusRing,
          brightOpacity: uranusRing.material.opacity,
          dimOpacity: 0.06,
        });
        group.add(uranusRing);
      }

      transitVisuals.set(item.planet, transitVisual);

    });
    group.add(aspectGroup);
    sceneStateRef.current = {
      group,
      camera,
      cameraTiltDegrees: initialCameraTiltDegrees,
      hasManualTilt: initialHasManualTilt,
      natalMeshes,
      natalPoints: sceneSky.natalPoints,
      natalHouseLabels,
      natalLayerLabels,
      natalPlanetSymbols,
      transitLayerObjects,
      transitHouseLabels,
      transitHouseLines,
      transitLayerLabels,
      transitPositions,
      transitVisuals,
      mapRadii,
      aspectGroup,
      selectedAspectLineHighlightKey,
      selectedPulseMesh: null,
      selectedPulseBaseScale: 1,
      isRotationPaused,
      isFlatMapView,
      natalLayerActive,
      transitLayerActive,
    aspectLineMode,
    aspectLineSelections,
  };
    let dragging = false;
    let previousX = 0;
    let previousY = 0;
    let pointerDownX = 0;
    let pointerDownY = 0;
    let pointerMoved = false;
    const isCoarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
    const dragThreshold = isCoarsePointer ? 18 : 8;
    const raycaster = new THREE.Raycaster();
    raycaster.params.Points = { threshold: isCoarsePointer ? 0.2 : 0.08 };
    raycaster.params.Line = { threshold: isCoarsePointer ? 0.2 : 0.08 };
    const pointer = new THREE.Vector2();
    const hideTooltip = () => {
      tooltip.style.display = "none";
    };
    const updateTooltip = (event) => {
      if (dragging || !hoverTargets.length) {
        hideTooltip();
        return;
      }
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(hoverTargets, false)[0];
      if (!hit?.object?.userData?.tooltip) {
        hideTooltip();
        return;
      }
      const frameRect = mount.parentElement?.getBoundingClientRect() || rect;
      tooltip.textContent = hit.object.userData.tooltip;
      tooltip.style.display = "block";
      tooltip.style.left = `${event.clientX - frameRect.left + 14}px`;
      tooltip.style.top = `${event.clientY - frameRect.top + 14}px`;
    };
    const onPointerDown = (event) => {
      dragging = true;
      hideTooltip();
      previousX = event.clientX;
      previousY = event.clientY;
      pointerDownX = event.clientX;
      pointerDownY = event.clientY;
      pointerMoved = false;
      renderer.domElement.setPointerCapture?.(event.pointerId);
    };
    const onPointerMove = (event) => {
      if (!dragging) {
        updateTooltip(event);
        return;
      }
      event.preventDefault();
      const dx = event.clientX - previousX;
      const dy = event.clientY - previousY;
      previousX = event.clientX;
      previousY = event.clientY;
      const movedDistance = Math.hypot(event.clientX - pointerDownX, event.clientY - pointerDownY);
      if (movedDistance <= dragThreshold) return;
      if (!pointerMoved) {
        setAspectTooltip(null);
        pointerMoved = true;
      }
      const state = sceneStateRef.current;
      if (state?.isFlatMapView) {
        setMapOffset((current) => ({
          x: current.x + dx * 0.012,
          y: current.y - dy * 0.012,
        }));
        return;
      }
      group.rotation.y += dx * 0.008;
      if (state && Math.abs(dy) > 0) {
        state.hasManualTilt = true;
        state.cameraTiltDegrees = clamp(state.cameraTiltDegrees - dy * 0.12, 17, 84);
        camera.position.y = cameraYForTiltDegrees(state.cameraTiltDegrees);
        camera.lookAt(0, 0, 0);
      }
    };
    const onPointerUp = (event) => {
      if (event?.clientX !== undefined && !pointerMoved) {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(hoverTargets, false)
          .find((item) => item?.object?.userData?.natalPlanet || item?.object?.userData?.transitPlanet || item?.object?.userData?.toggleNatalLayer || item?.object?.userData?.toggleTransitLayer);
        if (hit?.object?.userData?.toggleTransitLayer) {
          setTransitLayerActive((value) => !value);
          dragging = false;
          return;
        }
        if (hit?.object?.userData?.toggleNatalLayer) {
          setNatalLayerActive((value) => !value);
          dragging = false;
          return;
        }
        if (hit?.object?.userData?.natalPlanet) {
          const natalPlanet = hit.object.userData.natalPlanet;
          const currentFocus = aspectLineFocusRef.current;
          const nextFocus = currentFocus?.type === "natal" && currentFocus?.planet === natalPlanet ? null : { type: "natal", planet: natalPlanet };
          aspectLineFocusRef.current = nextFocus;
          setSelectedNatalPlanet(natalPlanet);
          setAspectLineFocus(nextFocus);
          setAspectTooltip(nextFocus ? { type: "natal", planet: natalPlanet } : null);
        } else if (hit?.object?.userData?.transitPlanet) {
          const transitPlanet = hit.object.userData.transitPlanet;
          const currentFocus = aspectLineFocusRef.current;
          const nextFocus = currentFocus?.type === "transit" && currentFocus?.planet === transitPlanet ? null : { type: "transit", planet: transitPlanet };
          aspectLineFocusRef.current = nextFocus;
          setAspectLineFocus(nextFocus);
          setAspectTooltip(nextFocus ? { type: "transit", planet: transitPlanet } : null);
        } else {
          setAspectTooltip(null);
        }
      }
      if (event?.pointerId !== undefined) {
        renderer.domElement.releasePointerCapture?.(event.pointerId);
      }
      dragging = false;
    };
    const onPointerCancel = (event) => {
      if (event?.pointerId !== undefined) {
        renderer.domElement.releasePointerCapture?.(event.pointerId);
      }
      dragging = false;
      pointerMoved = false;
      hideTooltip();
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove, { passive: false });
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointerleave", hideTooltip);
    renderer.domElement.addEventListener("pointercancel", onPointerCancel);
    const preventCanvasZoom = (event) => {
      if (sceneStateRef.current?.isFlatMapView) {
        event.preventDefault();
      }
    };
    renderer.domElement.addEventListener("wheel", preventCanvasZoom, { passive: false });
    renderer.domElement.addEventListener("gesturestart", preventCanvasZoom, { passive: false });
    renderer.domElement.addEventListener("gesturechange", preventCanvasZoom, { passive: false });

    const resize = () => {
      const width = Math.max(280, mount.clientWidth);
      const height = Math.max(300, mount.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      window.requestAnimationFrame(() => centerMapInViewport());
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    const projectedMapBounds = () => {
      const width = Math.max(1, renderer.domElement.clientWidth || mount.clientWidth);
      const height = Math.max(1, renderer.domElement.clientHeight || mount.clientHeight);
      group.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      const radius = zodiacOuterRadius * 1.04;
      const points = [];
      for (let index = 0; index < 32; index += 1) {
        const angle = (Math.PI * 2 * index) / 32;
        points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
      }
      points.push(new THREE.Vector3(0, 0, 0));
      const projectedPoints = points
        .map((point) => point.clone().applyMatrix4(group.matrixWorld).project(camera))
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
      if (!projectedPoints.length) return null;
      const xs = projectedPoints.map((point) => (point.x * 0.5 + 0.5) * width);
      const ys = projectedPoints.map((point) => (-point.y * 0.5 + 0.5) * height);
      const left = Math.min(...xs);
      const right = Math.max(...xs);
      const top = Math.min(...ys);
      const bottom = Math.max(...ys);
      return {
        width,
        height,
        centerX: (left + right) / 2,
        centerY: (top + bottom) / 2,
      };
    };

    const centerMapInViewport = () => {
      const state = sceneStateRef.current;
      if (dragging || state?.isFlatMapView || hasManualMapPositionRef.current) return;
      const current = projectedMapBounds();
      if (!current) return;
      const targetX = current.width * 0.5;
      const targetY = current.height * 0.5;
      const pixelDeltaX = targetX - current.centerX;
      const pixelDeltaY = targetY - current.centerY;
      if (Math.hypot(pixelDeltaX, pixelDeltaY) < 1.5) return;

      const originalX = group.position.x;
      const originalY = group.position.y;
      group.position.x = originalX + 1;
      const xMoved = projectedMapBounds();
      group.position.x = originalX;
      group.position.y = originalY + 1;
      const yMoved = projectedMapBounds();
      group.position.y = originalY;
      if (!xMoved || !yMoved) return;

      const xAxisX = xMoved.centerX - current.centerX;
      const xAxisY = xMoved.centerY - current.centerY;
      const yAxisX = yMoved.centerX - current.centerX;
      const yAxisY = yMoved.centerY - current.centerY;
      const determinant = xAxisX * yAxisY - yAxisX * xAxisY;
      if (Math.abs(determinant) < 0.001) return;

      const worldDeltaX = clamp((pixelDeltaX * yAxisY - pixelDeltaY * yAxisX) / determinant, -0.35, 0.35);
      const worldDeltaY = clamp((xAxisX * pixelDeltaY - xAxisY * pixelDeltaX) / determinant, -0.35, 0.35);
      group.position.x = originalX + worldDeltaX;
      group.position.y = originalY + worldDeltaY;
    };

    let frameId = 0;
    const animate = () => {
      frameId = window.requestAnimationFrame(animate);
      const currentSceneState = sceneStateRef.current;
      const playbackSequence = currentSceneState?.playbackSequence;
      const now = performance.now();
      if (playbackSequence?.active) {
        let currentKeyframe = playbackSequence.keyframes[playbackSequence.index];
        let nextKeyframe = playbackSequence.keyframes[playbackSequence.index + 1];
        if (!currentKeyframe || !nextKeyframe) {
          playbackSequence.active = false;
          playbackSequence.onComplete?.();
        } else {
          let rawProgress = (now - playbackSequence.segmentStartedAt) / playbackSequence.segmentDuration;
          while (rawProgress >= 1 && nextKeyframe) {
            setTransitVisualsFromCharts(currentSceneState, currentKeyframe, nextKeyframe, 1);
            syncPlaybackAspectLines(currentSceneState, nextKeyframe, true);
            playbackSequence.onFrame?.(nextKeyframe.chart);
            playbackSequence.index += 1;
            playbackSequence.segmentStartedAt += playbackSequence.segmentDuration;
            playbackSequence.onAdvance?.({ date: nextKeyframe.date, time: nextKeyframe.time });
            currentKeyframe = playbackSequence.keyframes[playbackSequence.index];
            nextKeyframe = playbackSequence.keyframes[playbackSequence.index + 1];
            rawProgress = (now - playbackSequence.segmentStartedAt) / playbackSequence.segmentDuration;
          }
          if (!nextKeyframe) {
            playbackSequence.active = false;
            playbackSequence.onComplete?.();
          } else {
            const progress = clamp(rawProgress, 0, 1);
            setTransitVisualsFromCharts(currentSceneState, currentKeyframe, nextKeyframe, progress);
            if (now - (playbackSequence.lastTableUpdateAt || 0) > 500) {
              playbackSequence.lastTableUpdateAt = now;
              playbackSequence.onFrame?.(interpolatedTransitChart(
                currentKeyframe,
                nextKeyframe,
                progress,
                currentKeyframe.date,
                currentKeyframe.time
              ));
            }
          }
        }
      }
      if (!dragging && !sceneStateRef.current?.isRotationPaused) group.rotation.y += 0.0022;
      if (!sceneStateRef.current?.isRotationPaused && !sceneStateRef.current?.hasManualTilt) {
        const tiltPhase = (Math.sin(Date.now() * 0.00035) + 1) / 2;
        const tiltDegrees = 17 + tiltPhase * 17;
        if (sceneStateRef.current) sceneStateRef.current.cameraTiltDegrees = tiltDegrees;
        camera.position.z = 10.5;
        camera.position.y = cameraYForTiltDegrees(tiltDegrees);
        camera.lookAt(0, 0, 0);
      }
      if (!playbackSequence?.active) {
        centerMapInViewport();
      }
      if (!playbackSequence?.active) {
        spinningMeshes.forEach((item) => {
          if (item.materialRotation && item.mesh.material) {
            item.mesh.material.rotation = (item.mesh.material.rotation || 0) + item.speed;
          } else {
            item.mesh.rotation.y += item.speed;
          }
        });
      }
      const cameraLocal = group.worldToLocal(camera.getWorldPosition(new THREE.Vector3()));
      const flatSymbolPlacements = [];
      symbolBillboards.forEach(({ sprite, target, offset, baseScale, avoidOverlap }) => {
        const direction = cameraLocal.clone().sub(target.position).normalize();
        sprite.position.copy(target.position).add(direction.multiplyScalar(offset));
        const symbolScale = baseScale * (sceneStateRef.current?.isFlatMapView ? 2 : 1);
        sprite.scale.set(symbolScale, symbolScale, 1);
        if (sceneStateRef.current?.isFlatMapView && avoidOverlap) {
          let shiftStep = 0;
          const overlapThreshold = 0.38;
          const collides = () => flatSymbolPlacements.some((position) => (
            Math.hypot(sprite.position.x - position.x, sprite.position.z - position.z) < overlapThreshold
          ));
          while (collides() && shiftStep < 5) {
            shiftStep += 1;
            const directionSign = shiftStep % 2 ? 1 : -1;
            const magnitude = Math.ceil(shiftStep / 2) * 0.18;
            sprite.position.x = target.position.x + directionSign * magnitude;
          }
          flatSymbolPlacements.push(sprite.position.clone());
        }
      });
      const selectedPulseMesh = sceneStateRef.current?.selectedPulseMesh;
      const selectedPulseBaseScale = sceneStateRef.current?.selectedPulseBaseScale || 1;
      if (selectedPulseMesh) {
        selectedPulseMesh.scale.setScalar(selectedPulseBaseScale * (1 + Math.sin(Date.now() * 0.004) * 0.055));
      }
      currentSceneState?.aspectGroup?.children?.forEach((line) => {
        const baseOpacity = line.userData?.aspectGlowBaseOpacity;
        if (!baseOpacity || !line.material) return;
        line.material.opacity = baseOpacity * (0.72 + Math.sin(now * 0.006) * 0.28);
      });
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      const state = sceneStateRef.current;
      if (state?.group) {
        preservedMapViewRef.current = {
          groupRotationX: state.group.rotation.x,
          groupRotationY: state.group.rotation.y,
          cameraTiltDegrees: state.cameraTiltDegrees,
          hasManualTilt: state.hasManualTilt,
        };
      }
      window.cancelAnimationFrame(frameId);
      if (sceneStateRef.current?.playbackSequence) {
        sceneStateRef.current.playbackSequence.active = false;
      }
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointerleave", hideTooltip);
      renderer.domElement.removeEventListener("pointercancel", onPointerCancel);
      renderer.domElement.removeEventListener("wheel", preventCanvasZoom);
      renderer.domElement.removeEventListener("gesturestart", preventCanvasZoom);
      renderer.domElement.removeEventListener("gesturechange", preventCanvasZoom);
      tooltip.remove();
      sceneStateRef.current = null;
      textures.forEach((texture) => texture.dispose());
      renderer.dispose();
      mount.innerHTML = "";
    };
  }, [sceneSky]);

  useEffect(() => {
    const state = sceneStateRef.current;
    if (!state) return;
    state.aspectLineFocus = aspectLineFocus;
    state.selectedAspectLineHighlightKey = selectedAspectLineHighlightKey;
    state.aspectLineMode = aspectLineMode;
    state.aspectLineSelections = aspectLineSelections;
    state.natalLayerActive = natalLayerActive;
    state.transitLayerActive = transitLayerActive;
    state.isFlatMapView = isFlatMapView;

    state.natalMeshes.forEach(({ mesh, material, point }, planet) => {
      const isAspectFocused = focusedNatalPlanets.has(planet);
      const shouldHighlight = isAspectFocused;
      const baseColor = new THREE.Color(point.color);
      material.color.copy(shouldHighlight ? new THREE.Color(0xffffff) : baseColor.lerp(new THREE.Color("#9ca3af"), natalLayerActive ? 0.12 : 0.58));
      material.emissive.copy(new THREE.Color(point.color));
      material.emissiveIntensity = isFlatMapView
        ? (shouldHighlight ? 0.38 : natalLayerActive ? 0.08 : 0.003)
        : shouldHighlight ? 1.15 : natalLayerActive ? 0.42 : 0.004;
      material.opacity = isFlatMapView
        ? (shouldHighlight ? 0.48 : natalLayerActive ? 0.28 : 0.035)
        : shouldHighlight ? 0.78 : natalLayerActive ? 0.58 : 0.045;
      mesh.renderOrder = shouldHighlight ? 3 : 1;
      mesh.scale.setScalar(shouldHighlight ? 1.32 : natalLayerActive ? 0.94 : 0.72);
    });

    state.selectedPulseMesh = aspectLineFocus?.type === "natal" ? state.natalMeshes.get(aspectLineFocus.planet)?.mesh || null : null;
    state.selectedPulseBaseScale = 1.32;

    state.natalHouseLabels.forEach(({ mesh, brightOpacity, dimOpacity }) => {
      mesh.material.opacity = natalLayerActive ? brightOpacity : dimOpacity;
    });
    state.natalLayerLabels.forEach(({ mesh, brightOpacity, dimOpacity }) => {
      mesh.material.opacity = natalLayerActive ? brightOpacity : dimOpacity;
    });
    state.natalPlanetSymbols.forEach(({ sprite, planet, brightOpacity, dimOpacity, normalTexture, flatTexture }) => {
      const isAspectFocused = focusedNatalPlanets.has(planet);
      const shouldHighlight = isAspectFocused;
      sprite.material.map = isFlatMapView && flatTexture ? flatTexture : normalTexture;
      sprite.material.needsUpdate = true;
      sprite.material.opacity = isFlatMapView
        ? (shouldHighlight ? 1 : natalLayerActive ? 1 : 0.08)
        : shouldHighlight ? 1 : natalLayerActive ? brightOpacity : Math.min(dimOpacity, 0.08);
    });
    state.transitLayerObjects.forEach((entry) => {
      const object = entry.object || entry;
      object.visible = true;
      const material = object.material;
      if (material) {
        material.transparent = true;
        const brightOpacity = isFlatMapView ? entry.flatBrightOpacity ?? (entry.object?.isMesh ? 0.26 : entry.brightOpacity ?? 1) : entry.brightOpacity ?? 1;
        const dimOpacity = isFlatMapView
          ? Math.min(entry.flatDimOpacity ?? (entry.object?.isMesh ? 0.09 : entry.dimOpacity ?? 0.18), 0.025)
          : Math.min(entry.dimOpacity ?? 0.18, 0.04);
        material.opacity = transitLayerActive ? brightOpacity : dimOpacity;
        if (material.emissiveIntensity !== undefined) {
          material.emissiveIntensity = transitLayerActive
            ? isFlatMapView ? 0.06 : entry.brightEmissiveIntensity ?? material.emissiveIntensity
            : Math.min(entry.dimEmissiveIntensity ?? 0.02, 0.004);
        }
      }
    });
    state.transitHouseLabels.forEach(({ mesh, brightOpacity }) => {
      mesh.material.opacity = transitLayerActive ? brightOpacity : 0.07;
      mesh.visible = true;
    });
    state.transitHouseLines.forEach(({ line, brightOpacity }) => {
      line.material.opacity = transitLayerActive ? brightOpacity : 0.045;
      line.visible = true;
    });
    state.transitLayerLabels.forEach(({ mesh, brightOpacity, dimOpacity }) => {
      mesh.material.opacity = transitLayerActive ? brightOpacity : dimOpacity;
    });

    const hasCheckedAspectTargets = Boolean(
      aspectLineMode !== "custom"
      ||
      aspectLineSelections?.transitNatal?.natal?.length
      || aspectLineSelections?.transitNatal?.transit?.length
      || aspectLineSelections?.transitTransit?.transit?.length
      || aspectLineSelections?.natalNatal?.natal?.length
    );
    if (!state.playbackSequence?.active) {
      renderAspectLines(state, activeAspectLineAspects, hasCheckedAspectTargets, transitLayerActive);
      applyLiveAspectHighlights(state, activeAspectLineAspects);
    } else {
      const playbackFrame = state.playbackSequence.keyframes?.[state.playbackSequence.index];
      syncPlaybackAspectLines(state, playbackFrame, true);
    }
  }, [sky, natalLayerActive, transitLayerActive, isFlatMapView, aspectLineFocus, selectedAspectLineHighlightKey, focusedNatalPlanets, activeAspectLineAspects, aspectLineSelections, aspectLineMode]);

  useEffect(() => {
    const state = sceneStateRef.current;
    if (!state?.group) return;
    state.group.scale.setScalar(mapZoom);
  }, [mapZoom]);

  useEffect(() => {
    const state = sceneStateRef.current;
    if (!state?.group) return;
    applyMapOffset(state.group, mapOffset, isFlatMapView);
  }, [mapOffset, isFlatMapView]);

  useEffect(() => {
    const state = sceneStateRef.current;
    if (!state) return;
    state.isRotationPaused = isRotationPaused;
  }, [isRotationPaused]);

  useEffect(() => {
    const state = sceneStateRef.current;
    if (!state) return;
    state.isFlatMapView = isFlatMapView;
  }, [isFlatMapView]);

  useEffect(() => {
    const updateFullscreenState = () => {
      setIsMapFullscreen(document.fullscreenElement === frameRef.current);
    };
    document.addEventListener("fullscreenchange", updateFullscreenState);
    updateFullscreenState();
    return () => document.removeEventListener("fullscreenchange", updateFullscreenState);
  }, []);

  const focusedNatalTooltipAspects = aspectTooltip?.type === "natal"
    ? activeAspectLineAspects
      .filter((aspect) => (
        ((aspect.scope || "transitNatal") === "transitNatal" && aspect.natalPlanet === aspectTooltip.planet)
        || (aspect.scope === "natalNatal" && (aspect.natalPlanet === aspectTooltip.planet || aspect.natalPlanetB === aspectTooltip.planet))
      ))
      .slice(0, 6)
      .map((aspect) => {
        const transit = aspectLineSky.transits.find((item) => item.planet === aspect.transitPlanet);
        const natal = aspectLineSky.natalPoints.find((item) => item.planet === aspect.natalPlanet);
        const natalB = aspectLineSky.natalPoints.find((item) => item.planet === aspect.natalPlanetB);
        if (aspect.scope === "natalNatal") {
          return {
            ...aspect,
            planet: aspect.natalPlanet,
            natalLabel: natal ? planetLabel(natal.planet) : planetLabel(aspect.natalPlanet),
            natalBLabel: natalB ? planetLabel(natalB.planet) : planetLabel(aspect.natalPlanetB),
            liveAngle: natal && natalB ? circularAngleDistance(natal.longitude, natalB.longitude) : null,
            description: aspect.description || aspectInterpretationFallback(aspect),
            title: `ネイタル${natal ? planetLabel(natal.planet) : planetLabel(aspect.natalPlanet)} × ネイタル${natalB ? planetLabel(natalB.planet) : planetLabel(aspect.natalPlanetB)}`,
          };
        }
        return {
          ...aspect,
          planet: aspect.transitPlanet,
          label: `${planetLabel(aspect.transitPlanet)} ${aspect.angle}°`,
          transitLabel: transit ? transit.label : planetLabel(aspect.transitPlanet),
          natalLabel: natal ? natal.label : planetLabel(aspect.natalPlanet),
          usesSelectedNatalLabel: natal?.planet === aspectTooltip.planet,
          liveAngle: transit && natal ? circularAngleDistance(transit.longitude, natal.longitude) : null,
          description: aspect.description || aspectInterpretationFallback(aspect),
        };
      })
    : [];
  const transitTooltipAspects = aspectTooltip?.type === "transit"
    ? activeAspectLineAspects
      .filter((aspect) => (
        aspect.scope === "transitTransit"
          ? aspect.transitPlanet === aspectTooltip.planet || aspect.transitPlanetB === aspectTooltip.planet
          : aspect.transitPlanet === aspectTooltip.planet
      ))
      .slice(0, 6)
      .map((aspect) => {
        const transit = aspectLineSky.transits.find((item) => item.planet === aspect.transitPlanet);
        const transitB = aspectLineSky.transits.find((item) => item.planet === aspect.transitPlanetB);
        const natal = aspectLineSky.natalPoints.find((item) => item.planet === aspect.natalPlanet);
        if (aspect.scope === "transitTransit") {
          return {
            ...aspect,
            planet: aspect.transitPlanet,
            transitLabel: transit ? transit.label : planetLabel(aspect.transitPlanet),
            transitBLabel: transitB ? transitB.label : planetLabel(aspect.transitPlanetB),
            liveAngle: transit && transitB ? circularAngleDistance(transit.longitude, transitB.longitude) : null,
            description: aspect.description || aspectInterpretationFallback(aspect),
            title: `現行${transit ? transit.label : planetLabel(aspect.transitPlanet)} × 現行${transitB ? transitB.label : planetLabel(aspect.transitPlanetB)}`,
          };
        }
        return {
          ...aspect,
          planet: aspect.transitPlanet,
          natalLabel: natal ? planetLabel(natal.planet) : planetLabel(aspect.natalPlanet),
          transitLabel: transit ? transit.label : planetLabel(aspect.transitPlanet),
          liveAngle: transit && natal ? circularAngleDistance(transit.longitude, natal.longitude) : null,
          description: aspect.description || aspectInterpretationFallback(aspect),
          title: `ネイタル${natal ? planetLabel(natal.planet) : planetLabel(aspect.natalPlanet)} × 現行${transit ? transit.label : planetLabel(aspect.transitPlanet)}`,
        };
      })
    : [];
  const tooltipAspects = aspectTooltip?.type === "transit"
    ? transitTooltipAspects
    : focusedNatalTooltipAspects;
  const tooltipCompoundGroups = useMemo(() => {
    if (!isCompoundAspectMode(aspectLineMode) || !tooltipAspects.length) return [];
    const grouped = new Map();
    tooltipAspects.forEach((aspect) => {
      if (!aspect.compoundKey) return;
      const labels = aspect.compoundGroupIds?.map(aspectEndpointLabel).filter(Boolean) || [];
      const baseTitle = compoundKindLabel(aspect.compoundKind);
      const entry = grouped.get(aspect.compoundKey) || {
        key: aspect.compoundKey,
        title: baseTitle,
        description: aspect.compoundDescription || "複合アスペクトです。",
        color: aspect.color || NEUTRAL_ASPECT_LINE_COLOR,
        compoundKind: aspect.compoundKind,
        labels,
        components: [],
      };
      entry.components.push(aspect);
      grouped.set(aspect.compoundKey, entry);
    });
    const compoundCategory = compoundCategoryForAspectMode(aspectLineMode);
    return Array.from(grouped.values())
      .filter((group) => !compoundCategory || compoundGroupCategory(group) === compoundCategory)
      .map((group) => ({
        ...group,
        detailText: compoundKindDetailText(group.compoundKind),
      }));
  }, [aspectLineMode, tooltipAspects]);
  const tooltipDisplayItems = isCompoundAspectMode(aspectLineMode) && tooltipCompoundGroups.length
    ? (tooltipCompositeTab === "compound" ? tooltipCompoundGroups : tooltipAspects)
    : tooltipAspects;
  const tooltipEmptyLabel = aspectTooltip?.type === "transit"
    ? `現行${planetLabel(aspectTooltip.planet)}から主要アスペクトはありません。`
    : `選択日に${planetLabel(aspectTooltip?.planet || sky.selectedNatal.planet)}への主要アスペクトはありません。`;
  useEffect(() => {
    setOpenTooltipAspectKeys(new Set());
    setTooltipCompositeTab("compound");
  }, [aspectTooltip?.type, aspectTooltip?.planet, aspectLineMode]);
  const selectAspectLineHighlight = (aspect) => {
    const key = aspectLineHighlightKey(aspect);
    if (key) setSelectedAspectLineHighlightKey(key);
  };
  const aspectModeForListItem = (aspect) => {
    if (!aspect) return "";
    if (aspect.scope === "composite") {
      if (aspect.category === "transitOnly") return "compositeTransit";
      return "compositeTransitNatal";
    }
    if (aspect.scope === "transitTransit") return "transitTransit";
    if (aspect.scope === "natalNatal") return "natalNatal";
    return "transitNatal";
  };
  const toggleTooltipAspect = (key, aspect = null) => {
    selectAspectLineHighlight(aspect);
    setOpenTooltipAspectKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };
  const toggleAspectInterpretation = (key, aspect = null) => {
    const nextMode = aspectModeForListItem(aspect);
    if (nextMode) {
      aspectLineFocusRef.current = null;
      setAspectLineFocus(null);
      setAspectTooltip(null);
      setAspectLineMode(nextMode);
      if (nextMode === "compositeTransit") {
        setCompoundAspectListCategory("transitOnly");
        setAspectInterpretationScope("composite");
      } else if (nextMode === "compositeTransitNatal") {
        setCompoundAspectListCategory("mixed");
        setAspectInterpretationScope("composite");
      } else {
        setAspectInterpretationScope(nextMode === "natalNatal" ? "all" : nextMode);
      }
    }
    selectAspectLineHighlight(aspect);
    setOpenAspectInterpretationKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };
  const beginAspectListDrag = (event) => {
    if (event.button !== 0) return;
    aspectListDragRef.current = {
      offsetX: event.clientX - aspectListPanelPosition.x,
      offsetY: event.clientY - aspectListPanelPosition.y,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const moveAspectListPanel = (event) => {
    const drag = aspectListDragRef.current;
    if (!drag) return;
    const panelWidth = Math.min(520, Math.max(260, window.innerWidth - 170));
    const panelHeight = 420;
    setAspectListPanelPosition({
      x: clamp(event.clientX - drag.offsetX, 8, Math.max(8, window.innerWidth - panelWidth - 8)),
      y: clamp(event.clientY - drag.offsetY, 8, Math.max(8, window.innerHeight - panelHeight - 8)),
    });
  };
  const endAspectListDrag = (event) => {
    aspectListDragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };
  const beginMobileAspectListDrag = (event) => {
    if (event.button !== 0) return;
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    mobileAspectListDragRef.current = {
      offsetX: event.clientX - rect.left - mobileAspectListPanelPosition.x,
      offsetY: event.clientY - rect.top - mobileAspectListPanelPosition.y,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const moveMobileAspectListPanel = (event) => {
    const drag = mobileAspectListDragRef.current;
    const frame = frameRef.current;
    if (!drag || !frame) return;
    const rect = frame.getBoundingClientRect();
    const panelWidth = Math.min(330, Math.max(280, rect.width - 24));
    const panelHeight = 380;
    setMobileAspectListPanelPosition({
      x: clamp(event.clientX - rect.left - drag.offsetX, 8, Math.max(8, rect.width - panelWidth - 8)),
      y: clamp(event.clientY - rect.top - drag.offsetY, 48, Math.max(48, rect.height - panelHeight - 8)),
    });
  };
  const endMobileAspectListDrag = (event) => {
    mobileAspectListDragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };
  const beginAspectTooltipDrag = (event) => {
    if (event.button !== 0) return;
    const frame = frameRef.current;
    const panel = aspectTooltipPanelRef.current;
    if (!frame || !panel) return;
    const frameRect = frame.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const currentX = aspectTooltipPanelPosition?.x ?? (panelRect.left - frameRect.left);
    const currentY = aspectTooltipPanelPosition?.y ?? (panelRect.top - frameRect.top);
    aspectTooltipDragRef.current = {
      offsetX: event.clientX - frameRect.left - currentX,
      offsetY: event.clientY - frameRect.top - currentY,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const moveAspectTooltipPanel = (event) => {
    const drag = aspectTooltipDragRef.current;
    const frame = frameRef.current;
    const panel = aspectTooltipPanelRef.current;
    if (!drag || !frame || !panel) return;
    const frameRect = frame.getBoundingClientRect();
    const panelWidth = panel.offsetWidth || Math.min(520, Math.max(300, frameRect.width - 16));
    const panelHeight = Math.min(panel.offsetHeight || 360, frameRect.height - 16);
    setAspectTooltipPanelPosition({
      x: clamp(event.clientX - frameRect.left - drag.offsetX, 8, Math.max(8, frameRect.width - panelWidth - 8)),
      y: clamp(event.clientY - frameRect.top - drag.offsetY, 8, Math.max(8, frameRect.height - panelHeight - 8)),
    });
  };
  const endAspectTooltipDrag = (event) => {
    aspectTooltipDragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };
  const commitTransitPlaybackPosition = (cursor) => {
    preserveCurrentMapView();
    if (!cursor?.date || !cursor?.time) {
      setTransitPlaybackCursor(null);
      setPlaybackTransitChart(null);
      return;
    }
    const cachedChart = transitChartCacheRef.current.get(transitChartCacheKey(cursor.date, cursor.time));
    if (cachedChart) {
      setPlaybackTransitChart(cachedChart);
    }
    setSelectedTransitTime(cursor.time);
    setTransitPlaybackCursor(null);
  };
  const toggleTransitPlayback = async () => {
    if (isTransitPlaybackPreloading) return;
    if (isTransitPlaybackActive) {
      const cursor = transitPlaybackCursor;
      preserveCurrentMapView();
      if (sceneStateRef.current?.playbackSequence) {
        sceneStateRef.current.playbackSequence.active = false;
      }
      setIsTransitPlaybackActive(false);
      commitTransitPlaybackPosition(cursor);
      return;
    }
    try {
      setIsTransitPlaybackPreloading(true);
      setTransitPlaybackPreloadProgress(0);
      setTransitChartError("");
      const isMobilePlayback = isMobileViewport();
      const playbackStartDate = displayedTransitDateTime.date || selectedDate;
      const startIndex = Math.max(0, selectableDates.indexOf(playbackStartDate));
      const rangeOption = isMobilePlayback
        ? TRANSIT_PLAYBACK_RANGE_OPTIONS.find((option) => option.key === "year")
        : TRANSIT_PLAYBACK_RANGE_OPTIONS.find((option) => option.key === transitPlaybackRange) || TRANSIT_PLAYBACK_RANGE_OPTIONS[0];
      const remainingDates = (selectableDates.length ? selectableDates.slice(startIndex, startIndex + rangeOption.days) : [playbackStartDate]).filter(Boolean);
      const playbackStepDays = isMobilePlayback ? 1 : transitPlaybackStepDays;
      const playbackDates = remainingDates.filter((_, index) => index % playbackStepDays === 0);
      const finalRemainingDate = remainingDates[remainingDates.length - 1];
      if (finalRemainingDate && playbackDates.length === 1 && finalRemainingDate !== playbackDates[0]) {
        playbackDates.push(finalRemainingDate);
      }
      await preloadTransitChartsForDates(selectedTransitTime, playbackDates, (completed, total) => {
        setTransitPlaybackPreloadProgress(total ? Math.round((completed / total) * 100) : 100);
      });
      setIsRotationPaused(true);
      const shouldPrecomputePlaybackCompound = isCompoundAspectMode(aspectLineMode) && (isMobilePlayback || transitPlaybackRange === "month");
      const keyframes = playbackDates
        .map((targetDate) => {
          const chart = transitChartCacheRef.current.get(transitChartCacheKey(targetDate, selectedTransitTime));
          return {
            date: targetDate,
            time: selectedTransitTime,
            chart,
            transitMap: chart ? chartTransitMap(chart) : null,
            houseCusps: chart ? chartHouseCusps(chart) : [],
            aspectCache: chart ? playbackAspectCacheForChart(chart, aspectLineSky.natalPoints, shouldPrecomputePlaybackCompound, true) : null,
          };
        })
        .filter((item) => item.chart);
      if (keyframes.length < 2) {
        setTransitChartError("再生できる日次データが不足しています。");
        setIsTransitPlaybackActive(false);
        return;
      }
      if (sceneStateRef.current) {
        sceneStateRef.current.playbackSequence = {
          active: true,
          keyframes,
          index: 0,
          segmentStartedAt: performance.now(),
          segmentDuration: 1000,
          lastTableUpdateAt: 0,
          onAdvance: (cursor) => setTransitPlaybackCursor(cursor),
          onFrame: (chart) => {
            if (playbackUiUpdateEnabledRef.current) setPlaybackTransitChart(chart);
          },
          onComplete: () => {
            const finalKeyframe = keyframes[keyframes.length - 1];
            setIsTransitPlaybackActive(false);
            commitTransitPlaybackPosition({ date: finalKeyframe.date, time: finalKeyframe.time });
          },
        };
        syncPlaybackAspectLines(sceneStateRef.current, keyframes[0], true);
      }
      setTransitPlaybackCursor({ date: playbackStartDate, time: selectedTransitTime });
      if (playbackUiUpdateEnabledRef.current) {
        setPlaybackTransitChart(keyframes[0].chart);
      }
      setIsTransitPlaybackActive(true);
    } catch (error) {
      setTransitChartError(readableErrorMessage(error, "現行天体の再生データ読み込みに失敗しました。"));
      setIsTransitPlaybackActive(false);
      setPlaybackTransitChart(null);
    } finally {
      setIsTransitPlaybackPreloading(false);
      setTransitPlaybackPreloadProgress(0);
    }
  };
  const toggleMapFullscreen = async () => {
    const frame = frameRef.current;
    if (!frame) return;
    try {
      if (document.fullscreenElement === frame) {
        await document.exitFullscreen?.();
      } else {
        await frame.requestFullscreen?.();
      }
    } catch {
      setIsMapFullscreen(false);
    }
  };
  const zoomOutMap = () => setMapZoom((value) => clamp(Number((value - 0.08).toFixed(2)), minimumMapZoom(), 1.35));
  const zoomInMap = () => setMapZoom((value) => clamp(Number((value + 0.08).toFixed(2)), minimumMapZoom(), 1.35));
  const nudgeMapPosition = (deltaX, deltaY) => {
    hasManualMapPositionRef.current = true;
    setMapOffset((current) => ({
      x: Number((current.x + deltaX).toFixed(2)),
      y: Number((current.y + deltaY).toFixed(2)),
    }));
  };
  const resetMapPosition = () => {
    hasManualMapPositionRef.current = false;
    setMapOffset(isFlatMapView ? { x: 0, y: 0 } : defaultMapOffset());
  };
  const toggleFlatMapView = () => {
    const state = sceneStateRef.current;
    const nextFlatView = !isFlatMapView;
    setIsFlatMapView(nextFlatView);
    setIsRotationPaused(nextFlatView);
    setMapZoom(nextFlatView ? defaultFlatMapZoom() : defaultMapZoom());
    const nextOffset = nextFlatView ? { x: 0, y: 0 } : defaultMapOffset();
    hasManualMapPositionRef.current = false;
    setMapOffset(nextOffset);
    if (!state?.camera || !state?.group) return;
    state.hasManualTilt = nextFlatView;
    state.cameraTiltDegrees = nextFlatView ? 84 : 17;
    state.camera.position.z = nextFlatView ? 0.01 : 10.5;
    state.camera.position.y = nextFlatView ? 13.5 : cameraYForTiltDegrees(state.cameraTiltDegrees);
    state.camera.lookAt(0, 0, 0);
    state.group.rotation.x = nextFlatView ? 0 : 0.18;
    state.group.rotation.y = nextFlatView ? 0 : 0.22;
    applyMapOffset(state.group, nextOffset, nextFlatView);
  };

  return (
    <GlassPanel className="overflow-hidden border-gold/25 p-3 sm:p-5 lg:p-6">
      <div className="grid gap-4 lg:items-stretch">
        <div
          ref={frameRef}
          className="relative min-h-[520px] overflow-hidden rounded-2xl border border-white/10 bg-[#101827] sm:min-h-[600px] lg:min-h-[700px] xl:min-h-[760px] [&:fullscreen]:h-screen [&:fullscreen]:min-h-screen [&:fullscreen]:rounded-none [&:fullscreen]:border-0"
          style={{
            backgroundImage: [
              "radial-gradient(circle at 18% 16%, rgba(139,211,255,0.18), transparent 30%)",
              "radial-gradient(circle at 76% 28%, rgba(211,188,249,0.12), transparent 28%)",
              "radial-gradient(circle at 48% 76%, rgba(233,195,73,0.08), transparent 32%)",
              "linear-gradient(145deg, #101827 0%, #121a2d 46%, #0d1322 100%)",
            ].join(", "),
            backgroundSize: "100% 100%, 100% 100%, 100% 100%, 100% 100%",
          }}
        >
          <div ref={mountRef} className="absolute inset-0" aria-label="現行天体とネイタル天体の3Dマップ" />
          <div className="absolute bottom-2 left-2 z-30 h-9 w-[96px]">
            <div
              id="map-position-panel"
              className={cx(
                "absolute bottom-10 left-0 grid w-[120px] origin-bottom-left rounded-xl border border-white/10 bg-[#121414]/76 p-1.5 font-mono text-[12px] font-bold text-mist shadow-[0_18px_42px_rgba(0,0,0,0.32)] backdrop-blur-md transition-all duration-200",
                isMapPositionPanelOpen ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0"
              )}
              aria-hidden={!isMapPositionPanelOpen}
            >
              <div className="grid grid-cols-[32px_32px_32px] justify-center gap-1.5">
                <span />
                <button type="button" onClick={() => nudgeMapPosition(0, 0.12)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/[0.035] transition hover:border-gold/35 hover:text-gold" aria-label="3Dマップを上へ移動" title="上へ">↑</button>
                <span />
                <button type="button" onClick={() => nudgeMapPosition(-0.12, 0)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/[0.035] transition hover:border-gold/35 hover:text-gold" aria-label="3Dマップを左へ移動" title="左へ">←</button>
                <button type="button" onClick={() => nudgeMapPosition(0, -0.12)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/[0.035] transition hover:border-gold/35 hover:text-gold" aria-label="3Dマップを下へ移動" title="下へ">↓</button>
                <button type="button" onClick={() => nudgeMapPosition(0.12, 0)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/[0.035] transition hover:border-gold/35 hover:text-gold" aria-label="3Dマップを右へ移動" title="右へ">→</button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsMapPositionPanelOpen((value) => !value)}
              onDoubleClick={resetMapPosition}
              className={cx(
                "absolute bottom-0 left-0 inline-flex h-9 w-[96px] items-center justify-center rounded-xl border px-2 font-mono text-[9px] font-bold shadow-[0_10px_26px_rgba(0,0,0,0.28)] backdrop-blur transition",
                isMapPositionPanelOpen ? "border-gold/35 bg-gold/15 text-gold" : "border-white/10 bg-[#121414]/72 text-mist hover:bg-white/10 hover:text-gold"
              )}
              aria-expanded={isMapPositionPanelOpen}
              aria-controls="map-position-panel"
              aria-label="3Dマップの位置調整"
              title="位置調整 / ダブルクリックでリセット"
            >
              位置調整
            </button>
          </div>
          <div className="absolute left-2 top-2 z-[90] grid gap-1 text-shadow-sm sm:hidden">
            <div className="flex items-center gap-0.5">
              <TransitDatePicker compact />
              <select
                value={displayedTransitDateTime.time || selectedTransitTime}
                onChange={(event) => {
                  setIsTransitPlaybackActive(false);
                  setTransitPlaybackCursor(null);
                  setPlaybackTransitChart(null);
                  setSelectedTransitTime(event.target.value);
                }}
                className="h-7 w-[66px] rounded-md border border-white/10 bg-[#121414]/70 px-1 font-mono text-[10px] font-bold text-starlight outline-none transition [color-scheme:dark] focus:border-gold/50 focus:ring-2 focus:ring-gold/25"
                aria-label="現行天体の計算時刻"
                title="現行天体の計算時刻"
              >
                {timeOptions.map((time) => (
                  <option key={time} value={time}>{time}</option>
                ))}
              </select>
              {transitChartLoading ? (
                <span className="font-mono text-[9px] font-bold text-mist/70">計算中</span>
              ) : null}
            </div>
            <div className="inline-flex w-max items-center gap-1 rounded-xl border border-white/10 bg-[#121414]/72 p-1 shadow-[0_10px_26px_rgba(0,0,0,0.28)] backdrop-blur">
              <button type="button" onClick={zoomOutMap} disabled={mapZoom <= minimumMapZoom()} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-mist transition hover:bg-white/10 hover:text-gold disabled:opacity-35" aria-label="3Dマップを縮小" title="縮小"><Minus size={15} /></button>
              <button type="button" onClick={zoomInMap} disabled={mapZoom >= 1.35} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-mist transition hover:bg-white/10 hover:text-gold disabled:opacity-35" aria-label="3Dマップを拡大" title="拡大"><Plus size={15} /></button>
              <button type="button" onClick={() => setIsRotationPaused((value) => !value)} className="inline-flex h-8 w-9 items-center justify-center rounded-lg font-mono text-[7px] font-bold leading-[0.95] text-mist transition hover:bg-white/10 hover:text-gold" aria-label={isRotationPaused ? "3Dマップの回転を再開" : "3Dマップの回転を停止"} title={isRotationPaused ? "回転再開" : "回転停止"}>
                <span>{isRotationPaused ? <>回転<br />再開</> : <>回転<br />停止</>}</span>
              </button>
              <button type="button" onClick={toggleFlatMapView} className="inline-flex h-8 w-8 items-center justify-center rounded-lg font-mono text-[9px] font-bold text-mist transition hover:bg-white/10 hover:text-gold" aria-label={isFlatMapView ? "3Dマップを立体表示に戻す" : "3Dマップを平面表示で見る"} title={isFlatMapView ? "3D表示" : "平面表示"}>{isFlatMapView ? "3D" : "2D"}</button>
              <button
                type="button"
                onClick={toggleTransitPlayback}
                className={cx(
                  "relative inline-flex h-8 w-12 items-center justify-center overflow-hidden rounded-lg text-mist transition hover:bg-white/10 hover:text-gold disabled:cursor-wait disabled:opacity-90",
                  isTransitPlaybackActive ? "text-gold" : "text-cyan-200/85 hover:text-cyan-100"
                )}
                disabled={isTransitPlaybackPreloading}
                aria-pressed={isTransitPlaybackActive}
                aria-label={isTransitPlaybackActive ? "現行天体の再生を停止" : "現行天体を再生"}
                title={isTransitPlaybackPreloading ? "読込中" : isTransitPlaybackActive ? "再生停止" : "再生"}
              >
                {isTransitPlaybackPreloading ? (
                  <>
                    <span
                      className="absolute inset-y-0 left-0 bg-cyan-300/25 transition-[width] duration-200"
                      style={{ width: `${Math.max(4, transitPlaybackPreloadProgress)}%` }}
                      aria-hidden="true"
                    />
                    <span className="relative z-10 whitespace-nowrap font-mono text-[8px] font-bold leading-none text-cyan-100">読込中</span>
                  </>
                ) : isTransitPlaybackActive ? <Pause size={14} /> : <Play size={14} />}
              </button>
            </div>
          </div>
          <div className="absolute right-2 top-2 z-30 sm:hidden">
            <button type="button" onClick={toggleMapFullscreen} className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-[#121414]/72 text-mist shadow-[0_10px_26px_rgba(0,0,0,0.28)] backdrop-blur transition hover:bg-white/10 hover:text-gold" aria-label={isMapFullscreen ? "3Dマップの全画面を閉じる" : "3Dマップを全画面で表示"} title={isMapFullscreen ? "全画面を閉じる" : "全画面"}>{isMapFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>
          </div>
          <div className="absolute bottom-2 right-2 z-30 sm:hidden">
            <button
              type="button"
              onClick={() => setIsAspectListPanelOpen((value) => !value)}
              className={cx(
                "inline-flex h-9 items-center gap-1 rounded-xl border px-2 font-mono text-[9px] font-bold shadow-[0_10px_26px_rgba(0,0,0,0.28)] backdrop-blur transition",
                isAspectListPanelOpen ? "border-gold/35 bg-gold/15 text-gold" : "border-white/10 bg-[#121414]/72 text-mist hover:bg-white/10 hover:text-gold"
              )}
              aria-expanded={isAspectListPanelOpen}
              aria-controls="mobile-aspect-interpretation-panel"
            >
              <span>{isAspectListPanelOpen ? "<<" : ">>"}</span>
              <span>アスペクト一覧</span>
            </button>
          </div>
          <div
            id="mobile-aspect-interpretation-panel"
            className={cx(
              "z-30 flex flex-col overflow-hidden rounded-xl border border-white/10 bg-[#121414]/48 p-2 font-mono text-[9px] font-bold text-mist shadow-[0_18px_42px_rgba(0,0,0,0.24)] backdrop-blur-sm transition-opacity duration-300 sm:hidden",
              isMobileAspectListDetached ? "hidden" : "absolute",
              isAspectListPanelOpen ? "opacity-100" : "pointer-events-none border-transparent opacity-0"
            )}
            style={isMobileAspectListDetached
              ? undefined
              : {
                left: `${mobileAspectListPanelPosition.x}px`,
                top: `${mobileAspectListPanelPosition.y}px`,
                width: "min(330px, calc(100% - 24px))",
                height: `min(380px, calc(100% - ${mobileAspectListPanelPosition.y + 12}px))`,
              }}
            aria-hidden={!isAspectListPanelOpen}
          >
            <button
              type="button"
              onClick={() => setIsAspectListPanelOpen(false)}
              onPointerDown={(event) => event.stopPropagation()}
              className="absolute right-1 top-1 z-10 inline-flex h-5 w-5 items-center justify-center rounded-md border border-white/10 bg-[#121414]/70 text-[11px] leading-none text-mist/70 transition hover:border-gold/35 hover:bg-gold/10 hover:text-gold focus:outline-none focus:ring-2 focus:ring-gold/35"
              aria-label="アスペクト一覧を閉じる"
              title="閉じる"
            >
              ×
            </button>
            <div
              className="mb-2 flex touch-none select-none flex-nowrap items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.055] px-2 py-1.5 pr-7 text-starlight"
              onPointerDown={isMobileAspectListDetached ? undefined : beginMobileAspectListDrag}
              onPointerMove={isMobileAspectListDetached ? undefined : moveMobileAspectListPanel}
              onPointerUp={isMobileAspectListDetached ? undefined : endMobileAspectListDrag}
              onPointerCancel={isMobileAspectListDetached ? undefined : endMobileAspectListDrag}
              title={isMobileAspectListDetached ? "画面外表示中" : "ドラッグで移動"}
            >
              <span className="shrink-0 whitespace-nowrap text-[9px]">アスペクト一覧</span>
              <span className="shrink-0 whitespace-nowrap rounded border border-white/10 bg-white/[0.035] px-1 py-0.5 text-[7px] text-mist/70">
                {displayedTransitDateTime.date} {displayedTransitDateTime.time || selectedTransitTime}
              </span>
              <button
                type="button"
                onClick={() => setIsMobileAspectListDetached((value) => !value)}
                onPointerDown={(event) => event.stopPropagation()}
                className="inline-flex h-5 shrink-0 items-center justify-center whitespace-nowrap rounded border border-white/10 bg-white/[0.04] px-1 text-[7px] text-mist/80 transition hover:border-gold/35 hover:bg-gold/10 hover:text-gold focus:outline-none focus:ring-2 focus:ring-gold/35"
                aria-label={isMobileAspectListDetached ? "アスペクト一覧をマップ内表示に戻す" : "アスペクト一覧を画面外表示にする"}
                title={isMobileAspectListDetached ? "マップ内表示" : "画面外表示"}
              >
                {isMobileAspectListDetached ? "マップ内表示" : "画面外表示"}
              </button>
              <button
                type="button"
                className={cx(
                  "inline-flex h-5 w-5 shrink-0 items-center justify-center text-starlight/85 transition hover:text-gold focus:outline-none focus:ring-2 focus:ring-gold/35",
                  isMobileAspectListDetached ? "opacity-35" : "cursor-move"
                )}
                onPointerDown={isMobileAspectListDetached ? undefined : beginMobileAspectListDrag}
                onPointerMove={isMobileAspectListDetached ? undefined : moveMobileAspectListPanel}
                onPointerUp={isMobileAspectListDetached ? undefined : endMobileAspectListDrag}
                onPointerCancel={isMobileAspectListDetached ? undefined : endMobileAspectListDrag}
                aria-label="アスペクト一覧を移動"
                title={isMobileAspectListDetached ? "マップ外表示中は固定" : "移動"}
              >
                <Move size={11} aria-hidden="true" />
              </button>
            </div>
            <div className="mb-2 flex flex-nowrap gap-1 rounded-lg border border-white/10 bg-white/[0.025] p-1">
              {[
                ["all", "全て"],
                ["transitNatal", "出生図との関係"],
                ["transitTransit", "現行天体同士"],
                ["composite", "複合アスペクト"],
              ].map(([value, label]) => (
                <button
                  key={`mobile-map-interpretation-${value}`}
                  type="button"
                  onClick={() => setAspectInterpretationScope(value)}
                  className={cx("h-7 min-w-0 flex-1 rounded-md px-1 text-[7px] leading-none transition", aspectInterpretationScope === value ? "bg-gold/18 text-gold ring-1 ring-gold/35" : "text-mist/65 hover:bg-white/10 hover:text-starlight")}
                  aria-pressed={aspectInterpretationScope === value}
                >
                  {label}
                </button>
              ))}
            </div>
            {aspectInterpretationScope === "composite" ? (
              <div className="mb-2 grid grid-cols-3 gap-1 rounded-lg border border-gold/15 bg-gold/[0.035] p-1">
                {[
                  ["mixed", "出生図絡み"],
                  ["transitOnly", "現行天体同士"],
                  ["natalOnly", "ネイタルのみ"],
                ].map(([value, label]) => (
                  <button
                    key={`mobile-compound-category-${value}`}
                    type="button"
                    onClick={() => setCompoundAspectListCategory(value)}
                    className={cx(
                      "h-7 rounded-md px-1 text-[7px] transition",
                      compoundAspectListCategory === value
                        ? "bg-gold/18 text-gold ring-1 ring-gold/35"
                        : "text-mist/65 hover:bg-white/10 hover:text-starlight"
                    )}
                    aria-pressed={compoundAspectListCategory === value}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="grid min-h-0 flex-1 grid-cols-[24px_1fr] gap-2 overflow-y-auto overscroll-contain pb-3 pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex self-stretch flex-col gap-0">
                <p className="shrink-0 text-center text-[7px] leading-none text-mist/65">影響度</p>
                <div className="relative flex min-h-0 flex-1 flex-col items-center justify-between rounded-full bg-gradient-to-b from-[#ff5c68] via-gold/45 to-white/10 py-0 text-[7px] leading-none text-gold shadow-[0_0_14px_rgba(255,92,104,0.22)]">
                  <span className="writing-mode-vertical-rl [writing-mode:vertical-rl] text-[#ffb4ab]">高</span>
                  <span className="writing-mode-vertical-rl [writing-mode:vertical-rl] text-mist/55">低</span>
                </div>
              </div>
              <div className="grid gap-1.5">
                {aspectInterpretationItems.length ? aspectInterpretationItems.map((aspect) => {
                  const isOpen = openAspectInterpretationKeys.has(aspect.key);
                  const isLineHighlighted = selectedAspectLineHighlightKey === aspectLineHighlightKey(aspect);
                  const isCompoundAspectItem = aspect.scope === "composite";
                  const toneClass = aspect.importance.tone === "high"
                    ? "border-gold/35 bg-gold/[0.09] text-gold"
                    : aspect.importance.tone === "mid"
                      ? "border-sky-300/25 bg-sky-300/[0.07] text-sky-100"
                      : "border-white/10 bg-white/[0.025] text-mist/70";
                  return (
                    <article
                      key={`mobile-map-${aspect.key}`}
                      className={cx("overflow-hidden rounded-lg border bg-white/[0.025] backdrop-blur-[2px]", isLineHighlighted ? "border-current" : "border-white/10")}
                      style={isLineHighlighted ? { color: aspect.color, boxShadow: `0 0 18px ${aspect.color}44` } : undefined}
                    >
                      <button
                        type="button"
                        onClick={() => toggleAspectInterpretation(aspect.key, aspect)}
                        className="flex w-full items-start gap-2 px-2.5 py-2 text-left transition hover:bg-white/[0.035] focus:outline-none focus:ring-2 focus:ring-gold/35"
                        aria-expanded={isOpen}
                      >
                        <span className="mt-1 h-2.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: aspect.color }} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[10px] text-starlight">
                            {isCompoundAspectItem ? `${compoundKindLabel(aspect.kind)}: ${aspect.detailText}` : aspect.title}
                          </span>
                          <span className="mt-0.5 block text-[8px] leading-4 text-mist/60">
                            {isCompoundAspectItem ? aspect.labels?.join(" × ") : aspect.detailText || `実角度 ${Number.isFinite(aspect.liveAngle) ? aspect.liveAngle.toFixed(1) : "-"}°`}
                            {!aspect.detailText && Number.isFinite(aspect.orb) ? ` / オーブ ${aspect.orb.toFixed(2)}°` : ""}
                            {aspect.status ? ` / ${aspect.status}` : ""}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className={cx("inline-flex rounded border px-1.5 py-0.5 text-[8px]", toneClass)}>{aspect.importance.label}</span>
                          <span className="mt-1 block text-[8px] text-mist/60">{isOpen ? "閉じる" : ">>解釈"}</span>
                        </span>
                      </button>
                      {isOpen ? <p className="border-t border-white/10 bg-white/[0.025] px-3 py-3 text-xs font-medium leading-6 text-mist">{aspect.description}</p> : null}
                    </article>
                  );
                }) : <p className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-4 text-xs leading-6 text-mist">このタイミングの主要アスペクトはありません。</p>}
              </div>
            </div>
          </div>
          <div className="absolute right-4 top-4 z-30 hidden items-center gap-1.5 rounded-xl border border-white/10 bg-[#121414]/72 p-1 shadow-[0_10px_26px_rgba(0,0,0,0.28)] backdrop-blur sm:flex">
            <button
              type="button"
              onClick={zoomOutMap}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-mist transition hover:bg-white/10 hover:text-gold focus:outline-none focus:ring-2 focus:ring-gold/45 disabled:cursor-not-allowed disabled:opacity-35"
              aria-label="3Dマップを縮小"
              title="縮小"
                  disabled={mapZoom <= minimumMapZoom()}
            >
              <Minus size={16} />
            </button>
            <button
              type="button"
              onClick={zoomInMap}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-mist transition hover:bg-white/10 hover:text-gold focus:outline-none focus:ring-2 focus:ring-gold/45 disabled:cursor-not-allowed disabled:opacity-35"
              aria-label="3Dマップを拡大"
              title="拡大"
              disabled={mapZoom >= 1.35}
            >
              <Plus size={16} />
            </button>
            <button
              type="button"
              onClick={() => setIsRotationPaused((value) => !value)}
              className="inline-flex h-8 items-center rounded-lg px-2 font-mono text-[9px] font-bold text-mist transition hover:bg-white/10 hover:text-gold focus:outline-none focus:ring-2 focus:ring-gold/45 sm:text-[10px]"
              aria-label={isRotationPaused ? "3Dマップの回転を再開" : "3Dマップの回転を停止"}
              title={isRotationPaused ? "回転再開" : "回転停止"}
            >
              <span>{isRotationPaused ? "回転再開" : "回転停止"}</span>
            </button>
            <button
              type="button"
              onClick={toggleFlatMapView}
              className="inline-flex h-8 items-center rounded-lg px-2 font-mono text-[9px] font-bold text-mist transition hover:bg-white/10 hover:text-gold focus:outline-none focus:ring-2 focus:ring-gold/45 sm:text-[10px]"
              aria-label={isFlatMapView ? "3Dマップを立体表示に戻す" : "3Dマップを平面表示で見る"}
              title={isFlatMapView ? "3D表示" : "平面表示"}
            >
              {isFlatMapView ? "3D表示" : "平面表示"}
            </button>
            <button
              type="button"
              onClick={toggleMapFullscreen}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-mist transition hover:bg-white/10 hover:text-gold focus:outline-none focus:ring-2 focus:ring-gold/45"
              aria-label={isMapFullscreen ? "3Dマップの全画面を閉じる" : "3Dマップを全画面で表示"}
              title={isMapFullscreen ? "全画面を閉じる" : "全画面"}
            >
              {isMapFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>
          <div
            className={cx(
              "absolute right-4 top-16 z-30 hidden justify-items-end gap-1.5 sm:grid"
            )}
          >
            <div className="flex items-start gap-1.5">
              <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#121414]/68 p-1.5 shadow-[0_10px_26px_rgba(0,0,0,0.24)] backdrop-blur">
                <button
                  type="button"
                  onClick={toggleTransitPlayback}
                  className={cx(
                    "inline-flex h-8 items-center gap-1.5 rounded-lg px-2 font-mono text-[9px] font-bold transition focus:outline-none focus:ring-2 focus:ring-gold/45 disabled:cursor-wait disabled:opacity-70 sm:text-[10px]",
                    isTransitPlaybackActive ? "bg-gold/15 text-gold" : "text-cyan-200/85 hover:bg-white/10 hover:text-cyan-100"
                  )}
                  aria-pressed={isTransitPlaybackActive}
                  aria-label={isTransitPlaybackActive ? "現行天体の再生を停止" : "現行天体を再生"}
                  title={isTransitPlaybackActive ? "再生停止" : "再生"}
                  disabled={isTransitPlaybackPreloading}
                >
                  {isTransitPlaybackActive ? <Pause size={14} /> : <Play size={14} />}
                  <span>{isTransitPlaybackPreloading ? "読込中" : isTransitPlaybackActive ? "停止" : "再生"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsPlaybackPanelOpen((value) => !value)}
                  className={cx(
                    "inline-flex h-8 items-center gap-1 rounded-lg border px-2 font-mono text-[9px] font-bold transition sm:text-[10px]",
                    isPlaybackPanelOpen
                      ? "border-gold/35 bg-gold/15 text-gold"
                      : "border-white/10 bg-[#121414]/60 text-mist hover:bg-white/10 hover:text-gold"
                  )}
                  aria-expanded={isPlaybackPanelOpen}
                  aria-controls="transit-playback-panel"
                >
                  <span>{isPlaybackPanelOpen ? "<<" : ">>"}</span>
                  <span>再生設定</span>
                </button>
              </div>
              <div
                id="transit-playback-panel"
                className={cx(
                  "flex h-[44px] origin-left items-center gap-2 overflow-hidden rounded-xl border border-white/10 bg-[#121414]/78 font-mono text-[9px] font-bold text-mist shadow-[0_18px_42px_rgba(0,0,0,0.32)] backdrop-blur-md transition-all duration-300 ease-out sm:text-[10px]",
                  isPlaybackPanelOpen
                    ? "w-max translate-x-0 px-2 opacity-100"
                    : "pointer-events-none w-0 -translate-x-4 border-transparent px-0 opacity-0"
                )}
                aria-hidden={!isPlaybackPanelOpen}
              >
                <div className="flex shrink-0 items-center gap-1">
                  <p className="shrink-0 text-[8px] uppercase tracking-[0.16em] text-mist">期間</p>
                  <div className="flex gap-1">
                    {TRANSIT_PLAYBACK_RANGE_OPTIONS.map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setTransitPlaybackRange(option.key)}
                        className={cx(
                          "h-7 whitespace-nowrap rounded-md border px-2 transition disabled:cursor-not-allowed disabled:opacity-60",
                          transitPlaybackRange === option.key ? "border-gold/40 bg-gold/15 text-gold" : "border-white/10 bg-white/[0.03] text-mist/70 hover:text-starlight"
                        )}
                        aria-pressed={transitPlaybackRange === option.key}
                        disabled={isTransitPlaybackActive || isTransitPlaybackPreloading}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <p className="shrink-0 text-[8px] uppercase tracking-[0.16em] text-mist">速度</p>
                  <div className="flex gap-1">
                    {TRANSIT_PLAYBACK_STEP_OPTIONS.map((option) => (
                      <button
                        key={option.days}
                        type="button"
                        onClick={() => setTransitPlaybackStepDays(option.days)}
                        className={cx(
                          "h-7 whitespace-nowrap rounded-md border px-2 transition disabled:cursor-not-allowed disabled:opacity-60",
                          transitPlaybackStepDays === option.days ? "border-gold/40 bg-gold/15 text-gold" : "border-white/10 bg-white/[0.03] text-mist/70 hover:text-starlight"
                        )}
                        aria-pressed={transitPlaybackStepDays === option.days}
                        disabled={isTransitPlaybackActive || isTransitPlaybackPreloading}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-start gap-1.5">
              <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#121414]/68 p-1.5 shadow-[0_10px_26px_rgba(0,0,0,0.24)] backdrop-blur">
                <button
                  type="button"
                  onClick={() => setIsAspectPanelOpen((value) => !value)}
                  className={cx(
                    "inline-flex h-8 items-center gap-1 rounded-lg border px-2 font-mono text-[9px] font-bold transition sm:text-[10px]",
                    isAspectPanelOpen
                      ? "border-gold/35 bg-gold/15 text-gold"
                      : "border-white/10 bg-[#121414]/60 text-mist hover:bg-white/10 hover:text-gold"
                  )}
                  aria-expanded={isAspectPanelOpen}
                  aria-controls="aspect-line-panel"
                >
                  <span>{isAspectPanelOpen ? "<<" : ">>"}</span>
                  <span>{isAspectPanelOpen ? "アスペクト表示" : selectedAspectDisplayMode.label}</span>
                </button>
              </div>
              <div
                id="aspect-line-panel"
                className={cx(
                  "grid origin-left gap-1.5 overflow-hidden rounded-xl border border-white/10 bg-[#121414]/78 font-mono text-[9px] font-bold text-mist shadow-[0_18px_42px_rgba(0,0,0,0.32)] backdrop-blur-md transition-all duration-300 ease-out sm:text-[10px]",
                  "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
                  isAspectPanelOpen
                    ? "w-[min(640px,calc(100vw-170px))] translate-x-0 p-1.5 opacity-100"
                    : "pointer-events-none w-0 -translate-x-4 border-transparent p-0 opacity-0"
                )}
                aria-hidden={!isAspectPanelOpen}
              >
                <div className="grid grid-cols-6 gap-1">
                  {ASPECT_DISPLAY_MODE_OPTIONS.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => selectAspectLineMode(option.key)}
                      className={cx(
                        "grid min-h-10 content-center rounded-lg border px-2 py-1 text-left transition",
                        aspectLineMode === option.key
                          ? "border-gold/60 bg-gold/18 text-gold shadow-[0_0_16px_rgba(245,211,107,0.18)] ring-1 ring-gold/35"
                          : "border-white/10 bg-white/[0.03] text-mist/75 hover:border-white/20 hover:text-starlight"
                      )}
                      aria-pressed={aspectLineMode === option.key}
                    >
                      <span className="text-[10px] leading-4">{option.label}</span>
                      <span className="text-[8px] leading-3 text-mist/55">{option.description}</span>
                    </button>
                  ))}
                </div>
                {aspectLineMode === "custom" ? (
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {ASPECT_LINE_SCOPE_OPTIONS.map((option) => (
                      <section key={option.key} className="rounded-lg border border-white/8 bg-white/[0.025] p-1.5">
                        <div className="mb-1 flex items-center justify-between gap-1">
                          <div className="min-w-0">
                            <p className="truncate text-[10px] text-starlight">{option.label}</p>
                            <p className="truncate text-[8px] text-mist/50">{option.shortLabel}</p>
                          </div>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => setAspectLineGroupSelection(option.key, "all")}
                              className="h-6 rounded border border-white/10 bg-white/[0.03] px-1.5 text-[8px] text-mist/70 transition hover:border-gold/35 hover:text-gold"
                            >
                              全選択
                            </button>
                            <button
                              type="button"
                              onClick={() => setAspectLineGroupSelection(option.key, "none")}
                              className="h-6 rounded border border-white/10 bg-white/[0.03] px-1.5 text-[8px] text-mist/70 transition hover:border-gold/35 hover:text-gold"
                            >
                              全解除
                            </button>
                          </div>
                        </div>
                        <div className="grid gap-1">
                          {option.key !== "natalNatal" ? (
                            <div className="grid grid-cols-5 gap-1" aria-label={`${option.title}の現行天体`}>
                              {sky.transits.map((item) => {
                                const checked = aspectLineSelections[option.key].transit.includes(item.planet);
                                return (
                                  <label
                                    key={`aspect-${option.key}-transit-${item.planet}`}
                                    className={cx(
                                      "flex h-6 cursor-pointer items-center justify-center rounded border text-[11px] transition",
                                      checked ? "border-sky-300/45 bg-sky-300/15 text-sky-100" : "border-white/10 bg-white/[0.03] text-mist/65 hover:text-starlight"
                                    )}
                                    title={`現行${planetLabel(item.planet)}`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => toggleAspectLineSelection(option.key, "transit", item.planet)}
                                      className="sr-only"
                                    />
                                    {PLANET_SYMBOLS[item.planet] || item.label}
                                  </label>
                                );
                              })}
                            </div>
                          ) : null}
                          {option.key !== "transitTransit" ? (
                            <div className="grid grid-cols-6 gap-1" aria-label={`${option.title}のネイタル天体`}>
                              {sky.natalPoints.map((item) => {
                                const checked = aspectLineSelections[option.key].natal.includes(item.planet);
                                return (
                                  <label
                                    key={`aspect-${option.key}-natal-${item.planet}`}
                                    className={cx(
                                      "flex h-6 cursor-pointer items-center justify-center rounded border text-[10px] transition",
                                      checked ? "border-gold/50 bg-gold/15 text-gold" : "border-white/10 bg-white/[0.03] text-mist/65 hover:text-starlight"
                                    )}
                                    title={`ネイタル${planetLabel(item.planet)}`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => toggleAspectLineSelection(option.key, "natal", item.planet)}
                                      className="sr-only"
                                    />
                                    {PLANET_SYMBOLS[item.planet] || planetLabel(item.planet)}
                                  </label>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="flex items-start gap-1.5">
              <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#121414]/68 p-1.5 shadow-[0_10px_26px_rgba(0,0,0,0.24)] backdrop-blur">
                <button
                  type="button"
                  onClick={() => setIsAspectListPanelOpen((value) => !value)}
                  className={cx(
                    "inline-flex h-8 items-center gap-1 rounded-lg border px-2 font-mono text-[9px] font-bold transition sm:text-[10px]",
                    isAspectListPanelOpen
                      ? "border-gold/35 bg-gold/15 text-gold"
                      : "border-white/10 bg-[#121414]/60 text-mist hover:bg-white/10 hover:text-gold"
                  )}
                  aria-expanded={isAspectListPanelOpen}
                  aria-controls="aspect-interpretation-panel"
                >
                  <span>{isAspectListPanelOpen ? "<<" : ">>"}</span>
                  <span>アスペクト一覧</span>
                </button>
              </div>
              <div
                id="aspect-interpretation-panel"
                className={cx(
                  "fixed z-50 origin-left overflow-hidden rounded-xl border border-white/10 bg-[#121414]/48 font-mono text-[9px] font-bold text-mist shadow-[0_18px_42px_rgba(0,0,0,0.24)] backdrop-blur-sm transition-[width,padding,opacity] duration-300 ease-out sm:text-[10px]",
                  isAspectListPanelOpen
                    ? "w-[min(520px,calc(100vw-170px))] p-2 opacity-100"
                    : "pointer-events-none w-0 border-transparent p-0 opacity-0"
                )}
                style={{
                  left: `${aspectListPanelPosition.x}px`,
                  top: `${aspectListPanelPosition.y}px`,
                }}
                aria-hidden={!isAspectListPanelOpen}
              >
                <button
                  type="button"
                  onClick={() => setIsAspectListPanelOpen(false)}
                  onPointerDown={(event) => event.stopPropagation()}
                  className="absolute right-1 top-1 z-10 inline-flex h-5 w-5 items-center justify-center rounded-md border border-white/10 bg-[#121414]/70 text-[11px] leading-none text-mist/70 transition hover:border-gold/35 hover:bg-gold/10 hover:text-gold focus:outline-none focus:ring-2 focus:ring-gold/35"
                  aria-label="アスペクト一覧を閉じる"
                  title="閉じる"
                >
                  ×
                </button>
                <div
                  className="mb-2 flex select-none items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 pr-14 text-starlight"
                  onPointerDown={beginAspectListDrag}
                  onPointerMove={moveAspectListPanel}
                  onPointerUp={endAspectListDrag}
                  onPointerCancel={endAspectListDrag}
                  title="ドラッグで移動"
                >
                  <span className="text-[10px]">アスペクト一覧</span>
                  <span className="truncate rounded border border-white/10 bg-white/[0.035] px-1.5 py-0.5 text-[8px] text-mist/65">
                    {displayedTransitDateTime.date} {displayedTransitDateTime.time || selectedTransitTime}
                  </span>
              <button
                type="button"
                    className="inline-flex h-5 w-5 shrink-0 cursor-move items-center justify-center text-starlight/85 transition hover:text-gold focus:outline-none focus:ring-2 focus:ring-gold/35"
                    onPointerDown={beginAspectListDrag}
                    onPointerMove={moveAspectListPanel}
                    onPointerUp={endAspectListDrag}
                    onPointerCancel={endAspectListDrag}
                    aria-label="アスペクト一覧を移動"
                    title="移動"
                  >
                    <Move size={11} aria-hidden="true" />
                  </button>
                  <span className="ml-auto" />
                </div>
                <div className="mb-2 grid grid-cols-4 gap-1 rounded-lg border border-white/10 bg-white/[0.025] p-1">
                  {[
                    ["all", "全て"],
                    ["transitNatal", "出生図との関係"],
                    ["transitTransit", "現行天体同士"],
                    ["composite", "複合アスペクト"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setAspectInterpretationScope(value)}
                      className={cx(
                        "h-7 rounded-md px-1 text-[8px] transition sm:text-[9px]",
                        aspectInterpretationScope === value
                          ? "bg-gold/18 text-gold ring-1 ring-gold/35"
                          : "text-mist/65 hover:bg-white/10 hover:text-starlight"
                      )}
                      aria-pressed={aspectInterpretationScope === value}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {aspectInterpretationScope === "composite" ? (
                  <div className="mb-2 grid grid-cols-3 gap-1 rounded-lg border border-gold/15 bg-gold/[0.035] p-1">
                    {[
                      ["mixed", "出生図絡み"],
                      ["transitOnly", "現行天体同士"],
                      ["natalOnly", "ネイタルのみ"],
                    ].map(([value, label]) => (
                      <button
                        key={`desktop-compound-category-${value}`}
                        type="button"
                        onClick={() => setCompoundAspectListCategory(value)}
                        className={cx(
                          "h-7 rounded-md px-1 text-[8px] transition sm:text-[9px]",
                          compoundAspectListCategory === value
                            ? "bg-gold/18 text-gold ring-1 ring-gold/35"
                            : "text-mist/65 hover:bg-white/10 hover:text-starlight"
                        )}
                        aria-pressed={compoundAspectListCategory === value}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="grid max-h-[360px] grid-cols-[24px_1fr] gap-2 overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <div className="flex self-stretch flex-col gap-0">
                    <p className="shrink-0 text-center text-[7px] leading-none text-mist/65">影響度</p>
                    <div className="relative flex min-h-0 flex-1 flex-col items-center justify-between rounded-full bg-gradient-to-b from-[#ff5c68] via-gold/45 to-white/10 py-0 text-[7px] leading-none text-gold shadow-[0_0_14px_rgba(255,92,104,0.22)]">
                      <span className="writing-mode-vertical-rl [writing-mode:vertical-rl] text-[#ffb4ab]">高</span>
                      <span className="writing-mode-vertical-rl [writing-mode:vertical-rl] text-mist/55">低</span>
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    {aspectInterpretationItems.length ? aspectInterpretationItems.map((aspect) => {
                      const isOpen = openAspectInterpretationKeys.has(aspect.key);
                      const isLineHighlighted = selectedAspectLineHighlightKey === aspectLineHighlightKey(aspect);
                      const toneClass = aspect.importance.tone === "high"
                        ? "border-gold/35 bg-gold/[0.09] text-gold"
                        : aspect.importance.tone === "mid"
                          ? "border-sky-300/25 bg-sky-300/[0.07] text-sky-100"
                          : "border-white/10 bg-white/[0.025] text-mist/70";
                      return (
                        <article
                          key={aspect.key}
                          className={cx("overflow-hidden rounded-lg border bg-white/[0.035]", isLineHighlighted ? "border-current" : "border-white/10")}
                          style={isLineHighlighted ? { color: aspect.color, boxShadow: `0 0 18px ${aspect.color}44` } : undefined}
                        >
                          <button
                            type="button"
                            onClick={() => toggleAspectInterpretation(aspect.key, aspect)}
                            className="flex w-full items-start gap-2 px-2.5 py-2 text-left transition hover:bg-white/[0.035] focus:outline-none focus:ring-2 focus:ring-gold/35"
                            aria-expanded={isOpen}
                          >
                            <span className="mt-1 h-2.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: aspect.color }} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[10px] text-starlight sm:text-[11px]">{aspect.title}</span>
                              <span className="mt-0.5 block text-[8px] leading-4 text-mist/60">
                                {aspect.detailText || `実角度 ${Number.isFinite(aspect.liveAngle) ? aspect.liveAngle.toFixed(1) : "-"}°`}
                                {!aspect.detailText && Number.isFinite(aspect.orb) ? ` / オーブ ${aspect.orb.toFixed(2)}°` : ""}
                                {aspect.status ? ` / ${aspect.status}` : ""}
                              </span>
                            </span>
                            <span className="shrink-0 text-right">
                              <span className={cx("inline-flex rounded border px-1.5 py-0.5 text-[8px]", toneClass)}>{aspect.importance.label}</span>
                              <span className="mt-1 block text-[8px] text-mist/60">{isOpen ? "閉じる" : ">>解釈"}</span>
                            </span>
                          </button>
                          {isOpen ? (
                            <p className="border-t border-white/10 bg-white/[0.025] px-3 py-3 text-xs font-medium leading-6 text-mist sm:text-sm sm:leading-7">
                              {aspect.description}
                            </p>
                          ) : null}
                        </article>
                      );
                    }) : (
                      <p className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-4 text-xs leading-6 text-mist">
                        このタイミングの主要アスペクトはありません。
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="absolute left-4 top-4 z-[90] hidden items-center gap-2 text-shadow-sm sm:flex">
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-gold">Transit Sky</p>
            <TransitDatePicker />
            <select
              value={displayedTransitDateTime.time || selectedTransitTime}
              onChange={(event) => {
                setIsTransitPlaybackActive(false);
                setTransitPlaybackCursor(null);
                setPlaybackTransitChart(null);
                setSelectedTransitTime(event.target.value);
              }}
              className="h-7 rounded-md border border-white/10 bg-[#121414]/70 px-2 font-mono text-[10px] font-bold text-starlight outline-none transition focus:border-gold/50 focus:ring-2 focus:ring-gold/25"
              aria-label="現行天体の計算時刻"
              title="現行天体の計算時刻"
            >
              {timeOptions.map((time) => (
                <option key={time} value={time}>{time}</option>
              ))}
            </select>
            {transitChartLoading ? (
              <span className="pointer-events-none font-mono text-[9px] font-bold text-mist/70">計算中</span>
            ) : null}
          </div>
          <div className="pointer-events-none absolute left-4 top-12 z-10 hidden w-[490px] space-y-2 sm:block">
            <button
              type="button"
              onClick={() => setIsMapControlsMenuOpen((value) => !value)}
              className={cx(
                "pointer-events-auto inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-[#121414]/72 px-3 font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-mist shadow-[0_10px_26px_rgba(0,0,0,0.22)] backdrop-blur-md transition hover:border-gold/30 hover:text-gold focus:outline-none focus:ring-2 focus:ring-gold/35 sm:text-[10px]",
                isMapControlsMenuOpen && "border-gold/25 bg-[#121414]/82 text-gold"
              )}
              aria-expanded={isMapControlsMenuOpen}
              aria-controls="map-layer-controls-menu"
              aria-label={isMapControlsMenuOpen ? "表示メニューを閉じる" : "表示メニューを開く"}
              title="表示"
            >
              <SlidersHorizontal size={15} />
              表示
            </button>
            <div
              id="map-layer-controls-menu"
              className={cx(
                "grid gap-2 overflow-hidden transition-all duration-300 ease-out",
                isMapControlsMenuOpen
                  ? "max-h-[760px] opacity-100"
                  : "pointer-events-none max-h-0 opacity-0"
              )}
              aria-hidden={!isMapControlsMenuOpen}
            >
            <div className="pointer-events-auto grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-[#121414]/72 p-1 font-mono text-[9px] font-bold sm:hidden">
              {[
                ["transit", "現行天体"],
                ["natal", "ネイタル天体"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMobilePlanetTableTab(value)}
                  className={cx(
                    "h-8 rounded-lg transition",
                    mobilePlanetTableTab === value
                      ? "bg-gold/18 text-gold ring-1 ring-gold/35"
                      : "text-mist/65 hover:bg-white/10 hover:text-starlight"
                  )}
                  aria-pressed={mobilePlanetTableTab === value}
                >
                  {label}
                </button>
              ))}
            </div>
            <div
              className={cx(
                "rounded-xl border p-2 backdrop-blur-md transition sm:block sm:p-2.5",
                mobilePlanetTableTab !== "transit" && "hidden",
                isTransitTableCollapsed && "w-fit",
                transitLayerActive
                  ? "border-white/10 bg-[#121414]/78"
                  : "border-white/8 bg-[#121414]/38"
              )}
            >
              {isTransitTableCollapsed ? (
                <button
                  type="button"
                  onClick={() => setIsTransitTableCollapsed(false)}
                  className={cx(
                    "pointer-events-auto block font-mono text-[8px] font-bold uppercase tracking-[0.16em] transition focus:outline-none focus:ring-2 focus:ring-gold/35",
                    transitLayerActive ? "text-gold/80" : "text-mist/45 hover:text-gold/80"
                  )}
                  aria-expanded="false"
                  aria-controls="transit-planet-table"
                  aria-label="現行天体の表を開く"
                >
                  現行天体
                </button>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setTransitLayerActive((value) => !value)}
                      className={cx(
                        "pointer-events-auto inline-flex items-center gap-1.5 font-mono text-[8px] font-bold uppercase tracking-[0.16em] transition focus:outline-none focus:ring-2 focus:ring-gold/35",
                        transitLayerActive ? "text-gold/80" : "text-mist/45 hover:text-gold/80"
                      )}
                      aria-pressed={transitLayerActive}
                      aria-label={transitLayerActive ? "現行天体を暗くする" : "現行天体を明るくする"}
                      title={transitLayerActive ? "現行天体を暗くする" : "現行天体を明るくする"}
                    >
                      {transitLayerActive ? <Eye size={13} /> : <EyeOff size={13} />}
                      現行天体
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsTransitTableCollapsed(true)}
                      className="pointer-events-auto inline-flex h-6 w-6 items-center justify-center rounded-md text-mist/60 transition hover:bg-white/10 hover:text-gold focus:outline-none focus:ring-2 focus:ring-gold/35"
                      aria-expanded="true"
                      aria-controls="transit-planet-table"
                      aria-label="現行天体の表を最小化"
                      title="最小化"
                    >
                      <Minus size={13} />
                    </button>
                  </div>
                  <div
                    id="transit-planet-table"
                    className={cx(
                      "mt-1.5 grid grid-cols-2 gap-1.5 font-mono text-[9px] font-bold transition sm:grid-cols-2 sm:gap-1.5 sm:text-[10px]",
                      transitLayerActive ? "text-mist opacity-100" : "text-mist/25"
                    )}
                  >
                    {tableSky.transits.map((item) => {
                      const isFocusedTransitRow = focusedTransitPlanets.has(item.planet);
                      return (
                        <div
                          key={item.planet}
                          className={cx(
                            "grid min-w-0 grid-cols-[0.5rem_2.35rem_minmax(0,1fr)] items-center gap-1.5 rounded-md border px-2 py-1.5 transition sm:grid-cols-[0.5rem_3rem_minmax(0,1fr)]",
                            isFocusedTransitRow
                              ? "border-sky-200/45 bg-sky-200/[0.11] text-starlight shadow-[0_0_18px_rgba(139,211,255,0.14)]"
                              : transitLayerActive ? "border-white/10 bg-white/[0.035]" : "border-white/[0.035] bg-white/[0.006]"
                          )}
                        >
                          <span
                            className="h-2 w-2 shrink-0 rounded-full transition"
                            style={{
                              backgroundColor: item.color,
                              boxShadow: isFocusedTransitRow || transitLayerActive ? `0 0 10px ${item.color}` : "none",
                              opacity: isFocusedTransitRow || transitLayerActive ? 1 : 0.18,
                            }}
                          />
                          <span className="min-w-0 truncate text-left">{item.label}</span>
                          <ChartPositionColumns
                            item={item}
                            houseCusps={tableSky.transitHouseCusps}
                            className={cx("text-[8px] sm:text-[9px]", isFocusedTransitRow ? "text-starlight" : transitLayerActive ? "text-mist/70" : "text-mist/25")}
                          />
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
            <div
              className={cx(
                "rounded-xl border p-2 backdrop-blur-md transition sm:block sm:p-2.5",
                mobilePlanetTableTab !== "natal" && "hidden",
                isNatalTableCollapsed && "w-fit",
                natalLayerActive
                  ? "border-gold/20 bg-[#121414]/76 shadow-[0_0_22px_rgba(233,195,73,0.08)]"
                  : "border-white/8 bg-[#121414]/42 opacity-55"
              )}
            >
              {isNatalTableCollapsed ? (
                <button
                  type="button"
                  onClick={() => setIsNatalTableCollapsed(false)}
                  className={cx(
                    "pointer-events-auto block font-mono text-[8px] font-bold uppercase tracking-[0.16em] transition focus:outline-none focus:ring-2 focus:ring-gold/35",
                    natalLayerActive ? "text-gold" : "text-mist/55 hover:text-gold/80"
                  )}
                  aria-expanded="false"
                  aria-controls="natal-planet-table"
                  aria-label="ネイタル天体の表を開く"
                >
                  ネイタル天体
                </button>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setNatalLayerActive((value) => !value)}
                      className={cx(
                        "pointer-events-auto inline-flex items-center gap-1.5 font-mono text-[8px] font-bold uppercase tracking-[0.16em] transition focus:outline-none focus:ring-2 focus:ring-gold/35",
                        natalLayerActive ? "text-gold" : "text-mist/55 hover:text-gold/80"
                      )}
                      aria-pressed={natalLayerActive}
                      aria-label={natalLayerActive ? "ネイタル天体を暗くする" : "ネイタル天体を明るくする"}
                      title={natalLayerActive ? "ネイタル天体を暗くする" : "ネイタル天体を明るくする"}
                    >
                      {natalLayerActive ? <Eye size={13} /> : <EyeOff size={13} />}
                      ネイタル天体
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsNatalTableCollapsed(true)}
                      className="pointer-events-auto inline-flex h-6 w-6 items-center justify-center rounded-md text-mist/60 transition hover:bg-white/10 hover:text-gold focus:outline-none focus:ring-2 focus:ring-gold/35"
                      aria-expanded="true"
                      aria-controls="natal-planet-table"
                      aria-label="ネイタル天体の表を最小化"
                      title="最小化"
                    >
                      <Minus size={13} />
                    </button>
                  </div>
                  <div
                    id="natal-planet-table"
                    className={cx(
                      "mt-1.5 grid grid-cols-2 gap-1.5 font-mono text-[9px] font-bold sm:grid-cols-2 sm:gap-1.5 sm:text-[10px]",
                      natalLayerActive ? "text-mist" : "text-mist/25"
                    )}
                  >
                    {sky.natalPoints.map((item) => {
                      const shouldHighlightNatalRow = focusedNatalPlanets.has(item.planet);
                      return (
                        <div
                          key={item.planet}
                          className={cx(
                            "grid min-w-0 grid-cols-[0.5rem_2.35rem_minmax(0,1fr)] items-center gap-1.5 rounded-md border px-2 py-1.5 transition sm:grid-cols-[0.5rem_3rem_minmax(0,1fr)]",
                            shouldHighlightNatalRow
                              ? "border-gold/45 bg-gold/[0.12] text-starlight shadow-[0_0_18px_rgba(233,195,73,0.14)]"
                              : natalLayerActive ? "border-white/10 bg-white/[0.035]" : "border-white/[0.035] bg-white/[0.006]"
                          )}
                        >
                          <span
                            className="h-2 w-2 shrink-0 rounded-full transition"
                            style={{
                              backgroundColor: item.color,
                              boxShadow: shouldHighlightNatalRow || natalLayerActive ? `0 0 10px ${item.color}` : "none",
                              opacity: shouldHighlightNatalRow || natalLayerActive ? 1 : 0.18,
                            }}
                          />
                          <span className="min-w-0 truncate text-left">{planetLabel(item.planet)}</span>
                          <ChartPositionColumns
                            item={item}
                            houseCusps={sky.natalHouseCusps}
                            className={cx("text-[8px] sm:text-[9px]", shouldHighlightNatalRow ? "text-starlight" : natalLayerActive ? "text-mist/70" : "text-mist/25")}
                          />
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
            </div>
          </div>
          {aspectTooltip ? (
            <div
              ref={aspectTooltipPanelRef}
              className={cx(
                "absolute z-30 max-h-[360px] overflow-y-auto rounded-2xl border border-gold/25 bg-[#121414]/82 p-3 shadow-[0_22px_54px_rgba(0,0,0,0.48)] backdrop-blur-md [scrollbar-width:none] sm:bg-[#121414]/86 sm:p-4 [&::-webkit-scrollbar]:hidden",
                aspectTooltipPanelPosition
                  ? "w-[min(520px,calc(100%-16px))]"
                  : "inset-x-2 top-[104px] sm:inset-x-auto sm:right-8 sm:top-[42%] sm:w-[min(520px,calc(100%-40px))] sm:-translate-y-1/2 lg:right-12 xl:right-16"
              )}
              style={aspectTooltipPanelPosition
                ? {
                  left: `${aspectTooltipPanelPosition.x}px`,
                  top: `${aspectTooltipPanelPosition.y}px`,
                }
                : undefined}
            >
              <button
                type="button"
                onClick={() => {
                  setAspectTooltip(null);
                }}
                className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-md text-mist/70 transition hover:bg-white/10 hover:text-starlight"
                aria-label="アスペクト情報を閉じる"
              >
                ×
              </button>
              <div
                className="mb-2 flex touch-none select-none items-center gap-2 rounded-lg border border-white/10 bg-white/[0.055] px-2 py-1.5 pr-8 font-mono text-[9px] font-bold text-starlight"
                onPointerDown={beginAspectTooltipDrag}
                onPointerMove={moveAspectTooltipPanel}
                onPointerUp={endAspectTooltipDrag}
                onPointerCancel={endAspectTooltipDrag}
                title="ドラッグで移動"
              >
                <Move size={11} aria-hidden="true" className="shrink-0 text-gold/85" />
                <span className="min-w-0 truncate">
                  {aspectTooltip.type === "transit" ? `現行${planetLabel(aspectTooltip.planet)}` : `ネイタル${planetLabel(aspectTooltip.planet)}`}
                </span>
              </div>
              <div className="grid gap-2.5 pr-1">
                {isCompoundAspectMode(aspectLineMode) && tooltipCompoundGroups.length ? (
                  <div className="grid grid-cols-2 gap-1 rounded-lg border border-gold/15 bg-gold/[0.035] p-1 font-mono text-[9px] font-bold">
                    {[
                      ["compound", "複合アスペクト"],
                      ["single", "個別アスペクト"],
                    ].map(([value, label]) => (
                      <button
                        key={`tooltip-composite-tab-${value}`}
                        type="button"
                        onClick={() => setTooltipCompositeTab(value)}
                        className={cx(
                          "h-8 rounded-md transition",
                          tooltipCompositeTab === value
                            ? "bg-gold/18 text-gold ring-1 ring-gold/35"
                            : "text-mist/65 hover:bg-white/10 hover:text-starlight"
                        )}
                        aria-pressed={tooltipCompositeTab === value}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                ) : null}
                {tooltipDisplayItems.length ? tooltipDisplayItems.map((aspect) => {
                  const aspectKey = aspect.key || (aspect.scope === "transitTransit"
                    ? `tt-${aspect.compoundKey || "single"}-${aspect.transitPlanet}-${aspect.transitPlanetB}-${aspect.angle}`
                    : `tn-${aspect.compoundKey || "single"}-${aspect.transitPlanet || aspect.planet}-${aspect.natalPlanet || sky.selectedNatal.planet}-${aspect.angle}`);
                  const isOpen = openTooltipAspectKeys.has(aspectKey);
                  const isLineHighlighted = selectedAspectLineHighlightKey === aspectLineHighlightKey(aspect);
                  return (
                    <article
                      key={aspectKey}
                      className={cx("overflow-hidden rounded-xl border bg-white/[0.045]", isLineHighlighted ? "border-current" : "border-white/10")}
                      style={isLineHighlighted ? { color: aspect.color, boxShadow: `0 0 18px ${aspect.color}44` } : undefined}
                    >
                      <button
                        type="button"
                        onClick={() => toggleTooltipAspect(aspectKey, aspect)}
                        className="flex w-full items-start gap-2 px-3 py-2.5 text-left transition hover:bg-white/[0.035] focus:outline-none focus:ring-2 focus:ring-gold/35"
                        aria-expanded={isOpen}
                      >
                        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: aspect.color }} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-starlight sm:text-[11px]">
                            {aspect.title || `${aspect.usesSelectedNatalLabel ? aspect.natalLabel : `ネイタル${aspect.natalLabel || sky.selectedNatal.label}`} × 現行${aspect.transitLabel || planetLabel(aspect.planet)}`}
                          </span>
                          <span className="mt-1 block text-xs leading-5 text-mist sm:text-sm sm:leading-6">
                            {aspect.labels?.length ? aspect.labels.join(" × ") : aspect.detailText || `実角度 ${Number.isFinite(aspect.liveAngle) ? aspect.liveAngle.toFixed(1) : "-"}°`}
                            {!aspect.detailText && !aspect.labels?.length && Number.isFinite(aspect.orb) ? ` / オーブ ${aspect.orb.toFixed(2)}°` : ""}
                            {aspect.status ? ` / ${aspect.status}` : ""}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block font-mono text-[10px] font-bold text-gold">{aspect.detailText || (aspect.angle !== null && aspect.angle !== undefined ? `${aspect.angle}°` : "")}</span>
                          <span className="block font-mono text-[10px] font-bold text-mist/70">{isOpen ? "閉じる" : ">>解釈"}</span>
                        </span>
                      </button>
                      {isOpen ? (
                        <p className="border-t border-white/10 bg-black/10 px-3 py-3 text-xs leading-6 text-mist sm:text-sm sm:leading-7">
                          {aspect.description || "解釈文がありません。"}
                        </p>
                      ) : null}
                    </article>
                  );
                }) : (
                  <div className="rounded-xl border border-white/10 bg-white/[0.045] px-4 py-5 text-sm leading-7 text-mist">
                    {tooltipEmptyLabel}
                  </div>
                )}
              </div>
            </div>
          ) : null}
          {transitChartError ? (
            <p className="pointer-events-none absolute bottom-3 right-3 z-10 max-w-[360px] text-right text-[10px] leading-5 text-rose-200/80 sm:bottom-4 sm:right-4">
              {transitChartError}
            </p>
          ) : null}
        </div>
        {isMobileAspectListDetached && isAspectListPanelOpen ? (
          <div
            id="mobile-aspect-interpretation-panel-detached"
            className="relative -mx-3 mb-3 flex max-h-[46vh] min-h-[260px] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#121414]/72 p-2 font-mono text-[9px] font-bold text-mist shadow-[0_18px_42px_rgba(0,0,0,0.24)] backdrop-blur-sm sm:hidden"
          >
            <button
              type="button"
              onClick={() => setIsAspectListPanelOpen(false)}
              onPointerDown={(event) => event.stopPropagation()}
              className="absolute right-1 top-1 z-10 inline-flex h-5 w-5 items-center justify-center rounded-md border border-white/10 bg-[#121414]/70 text-[11px] leading-none text-mist/70 transition hover:border-gold/35 hover:bg-gold/10 hover:text-gold focus:outline-none focus:ring-2 focus:ring-gold/35"
              aria-label="アスペクト一覧を閉じる"
              title="閉じる"
            >
              ×
            </button>
            <div className="relative mb-2 flex select-none flex-nowrap items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.055] px-2 py-1.5 pr-7 text-starlight">
              <span className="shrink-0 whitespace-nowrap text-[9px]">アスペクト一覧</span>
              <span className="shrink-0 whitespace-nowrap rounded border border-white/10 bg-white/[0.035] px-1 py-0.5 text-[7px] text-mist/70">
                {displayedTransitDateTime.date} {displayedTransitDateTime.time || selectedTransitTime}
              </span>
              <button
                type="button"
                onClick={() => setIsMobileAspectListDetached(false)}
                onPointerDown={(event) => event.stopPropagation()}
                className="inline-flex h-5 shrink-0 items-center justify-center whitespace-nowrap rounded border border-white/10 bg-white/[0.04] px-1 text-[7px] text-mist/80 transition hover:border-gold/35 hover:bg-gold/10 hover:text-gold focus:outline-none focus:ring-2 focus:ring-gold/35"
                aria-label="アスペクト一覧をマップ内表示に戻す"
                title="マップ内表示"
              >
                マップ内表示
              </button>
            </div>
            <div className="mb-2 flex flex-nowrap gap-1 rounded-lg border border-white/10 bg-white/[0.025] p-1">
              {[
                ["all", "全て"],
                ["transitNatal", "出生図との関係"],
                ["transitTransit", "現行天体同士"],
                ["composite", "複合アスペクト"],
              ].map(([value, label]) => (
                <button
                  key={`mobile-detached-interpretation-${value}`}
                  type="button"
                  onClick={() => setAspectInterpretationScope(value)}
                  className={cx("h-7 min-w-0 flex-1 rounded-md px-1 text-[7px] leading-none transition", aspectInterpretationScope === value ? "bg-gold/18 text-gold ring-1 ring-gold/35" : "text-mist/65 hover:bg-white/10 hover:text-starlight")}
                  aria-pressed={aspectInterpretationScope === value}
                >
                  {label}
                </button>
              ))}
            </div>
            {aspectInterpretationScope === "composite" ? (
              <div className="mb-2 grid grid-cols-3 gap-1 rounded-lg border border-gold/15 bg-gold/[0.035] p-1">
                {[
                  ["mixed", "出生図絡み"],
                  ["transitOnly", "現行天体同士"],
                  ["natalOnly", "ネイタルのみ"],
                ].map(([value, label]) => (
                  <button
                    key={`mobile-detached-compound-category-${value}`}
                    type="button"
                    onClick={() => setCompoundAspectListCategory(value)}
                    className={cx(
                      "h-7 rounded-md px-1 text-[7px] transition",
                      compoundAspectListCategory === value
                        ? "bg-gold/18 text-gold ring-1 ring-gold/35"
                        : "text-mist/65 hover:bg-white/10 hover:text-starlight"
                    )}
                    aria-pressed={compoundAspectListCategory === value}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="grid min-h-0 flex-1 grid-cols-[24px_1fr] gap-2 overflow-y-auto overscroll-contain pb-3 pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex self-stretch flex-col gap-0">
                <p className="shrink-0 text-center text-[7px] leading-none text-mist/65">影響度</p>
                <div className="relative flex min-h-0 flex-1 flex-col items-center justify-between rounded-full bg-gradient-to-b from-[#ff5c68] via-gold/45 to-white/10 py-0 text-[7px] leading-none text-gold shadow-[0_0_14px_rgba(255,92,104,0.22)]">
                  <span className="writing-mode-vertical-rl [writing-mode:vertical-rl] text-[#ffb4ab]">高</span>
                  <span className="writing-mode-vertical-rl [writing-mode:vertical-rl] text-mist/55">低</span>
                </div>
              </div>
              <div className="grid gap-1.5">
                {aspectInterpretationItems.length ? aspectInterpretationItems.map((aspect) => {
                  const isOpen = openAspectInterpretationKeys.has(aspect.key);
                  const isLineHighlighted = selectedAspectLineHighlightKey === aspectLineHighlightKey(aspect);
                  const isCompoundAspectItem = aspect.scope === "composite";
                  const toneClass = aspect.importance.tone === "high"
                    ? "border-gold/35 bg-gold/[0.09] text-gold"
                    : aspect.importance.tone === "mid"
                      ? "border-sky-300/25 bg-sky-300/[0.07] text-sky-100"
                      : "border-white/10 bg-white/[0.025] text-mist/70";
                  return (
                    <article
                      key={`mobile-detached-${aspect.key}`}
                      className={cx("overflow-hidden rounded-lg border bg-white/[0.025] backdrop-blur-[2px]", isLineHighlighted ? "border-current" : "border-white/10")}
                      style={isLineHighlighted ? { color: aspect.color, boxShadow: `0 0 18px ${aspect.color}44` } : undefined}
                    >
                      <button
                        type="button"
                        onClick={() => toggleAspectInterpretation(aspect.key, aspect)}
                        className="flex w-full items-start gap-2 px-2.5 py-2 text-left transition hover:bg-white/[0.035] focus:outline-none focus:ring-2 focus:ring-gold/35"
                        aria-expanded={isOpen}
                      >
                        <span className="mt-1 h-2.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: aspect.color }} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[10px] text-starlight">
                            {isCompoundAspectItem ? `${compoundKindLabel(aspect.kind)}: ${aspect.detailText}` : aspect.title}
                          </span>
                          <span className="mt-0.5 block text-[8px] leading-4 text-mist/60">
                            {isCompoundAspectItem ? aspect.labels?.join(" × ") : aspect.detailText || `実角度 ${Number.isFinite(aspect.liveAngle) ? aspect.liveAngle.toFixed(1) : "-"}°`}
                            {!aspect.detailText && Number.isFinite(aspect.orb) ? ` / オーブ ${aspect.orb.toFixed(2)}°` : ""}
                            {aspect.status ? ` / ${aspect.status}` : ""}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className={cx("inline-flex rounded border px-1.5 py-0.5 text-[8px]", toneClass)}>{aspect.importance.label}</span>
                          <span className="mt-1 block text-[8px] text-mist/60">{isOpen ? "閉じる" : ">>解釈"}</span>
                        </span>
                      </button>
                      {isOpen ? <p className="border-t border-white/10 bg-white/[0.025] px-3 py-3 text-xs font-medium leading-6 text-mist">{aspect.description}</p> : null}
                    </article>
                  );
                }) : <p className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-4 text-xs leading-6 text-mist">このタイミングの主要アスペクトはありません。</p>}
              </div>
            </div>
          </div>
        ) : null}
        <section className="-mx-3 grid gap-3 rounded-2xl border border-white/10 bg-[#121414]/76 p-2 shadow-[0_18px_42px_rgba(0,0,0,0.28)] backdrop-blur-md sm:hidden">
          <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-white/[0.035] p-1 font-mono text-[8px] font-bold text-mist">
            {[
              ["display", "天体表示"],
              ["aspect", "アスペクト表示"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMobileMapPanelTab(value)}
                className={cx(
                  "h-8 rounded-lg transition",
                  mobileMapPanelTab === value ? "bg-gold/18 text-gold ring-1 ring-gold/35" : "hover:bg-white/10 hover:text-starlight"
                )}
                aria-pressed={mobileMapPanelTab === value}
              >
                {label}
              </button>
            ))}
          </div>
          {mobileMapPanelTab === "display" ? (
            <div className="grid gap-2">
              <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-white/[0.025] p-1 font-mono text-[9px] font-bold">
                {[
                  ["transit", "現行天体"],
                  ["natal", "ネイタル天体"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMobilePlanetTableTab(value)}
                    className={cx(
                      "h-8 rounded-lg transition",
                      mobilePlanetTableTab === value ? "bg-gold/18 text-gold ring-1 ring-gold/35" : "text-mist/65 hover:bg-white/10 hover:text-starlight"
                    )}
                    aria-pressed={mobilePlanetTableTab === value}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {mobilePlanetTableTab === "transit" ? (
                <div className="rounded-xl border border-white/10 bg-white/[0.025] p-1.5">
                  <button
                    type="button"
                    onClick={() => setTransitLayerActive((value) => !value)}
                    className={cx("mb-2 inline-flex items-center gap-1.5 font-mono text-[9px] font-bold", transitLayerActive ? "text-gold/80" : "text-mist/45")}
                    aria-pressed={transitLayerActive}
                  >
                    {transitLayerActive ? <Eye size={13} /> : <EyeOff size={13} />}
                    現行天体
                  </button>
                  <div className="mb-1 grid grid-cols-[0.5rem_2.45rem_2.7rem_1.45rem_2.45rem] items-center gap-1 px-1 font-mono text-[8px] font-bold text-mist/45">
                    <span />
                    <span>天体</span>
                    <span>星座</span>
                    <span className="text-right">度数</span>
                    <span className="text-right">室</span>
                  </div>
                  <div className={cx("grid grid-cols-2 gap-1 font-mono text-[9px] font-bold", transitLayerActive ? "text-mist" : "text-mist/25")}>
                    {tableSky.transits.map((item) => {
                      const isFocusedTransitRow = focusedTransitPlanets.has(item.planet);
                      return (
                        <div
                          key={`mobile-transit-${item.planet}`}
                          className={cx(
                            "grid min-w-0 grid-cols-[0.5rem_2.45rem_minmax(0,1fr)] items-center gap-0.5 rounded-md border px-1 py-1.5",
                            isFocusedTransitRow ? "border-sky-200/45 bg-sky-200/[0.11] text-starlight" : "border-white/10 bg-white/[0.035]"
                          )}
                        >
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color, opacity: isFocusedTransitRow || transitLayerActive ? 1 : 0.18 }} />
                          <span className="min-w-0 truncate text-left">{item.label}</span>
                          <ChartPositionCompact item={item} houseCusps={tableSky.transitHouseCusps} className="min-w-0 text-[8px]" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-white/10 bg-white/[0.025] p-1.5">
                  <button
                    type="button"
                    onClick={() => setNatalLayerActive((value) => !value)}
                    className={cx("mb-2 inline-flex items-center gap-1.5 font-mono text-[9px] font-bold", natalLayerActive ? "text-gold" : "text-mist/55")}
                    aria-pressed={natalLayerActive}
                  >
                    {natalLayerActive ? <Eye size={13} /> : <EyeOff size={13} />}
                    ネイタル天体
                  </button>
                  <div className="mb-1 grid grid-cols-[0.5rem_2.45rem_2.7rem_1.45rem_2.45rem] items-center gap-1 px-1 font-mono text-[8px] font-bold text-mist/45">
                    <span />
                    <span>天体</span>
                    <span>星座</span>
                    <span className="text-right">度数</span>
                    <span className="text-right">室</span>
                  </div>
                  <div className={cx("grid grid-cols-2 gap-1 font-mono text-[9px] font-bold", natalLayerActive ? "text-mist" : "text-mist/25")}>
                    {sky.natalPoints.map((item) => {
                      const shouldHighlightNatalRow = focusedNatalPlanets.has(item.planet);
                      return (
                        <div
                          key={`mobile-natal-${item.planet}`}
                          className={cx(
                            "grid min-w-0 grid-cols-[0.5rem_2.45rem_minmax(0,1fr)] items-center gap-0.5 rounded-md border px-1 py-1.5",
                            shouldHighlightNatalRow ? "border-gold/45 bg-gold/[0.12] text-starlight" : "border-white/10 bg-white/[0.035]"
                          )}
                        >
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color, opacity: shouldHighlightNatalRow || natalLayerActive ? 1 : 0.18 }} />
                          <span className="min-w-0 truncate text-left">{planetLabel(item.planet)}</span>
                          <ChartPositionCompact item={item} houseCusps={sky.natalHouseCusps} className="min-w-0 text-[8px]" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {mobileMapPanelTab === "aspect" ? (
            <div className="grid gap-2 font-mono text-[9px] font-bold">
              <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-white/[0.025] p-1">
                {ASPECT_DISPLAY_MODE_OPTIONS.map((option) => (
                  <button
                    key={`mobile-aspect-mode-${option.key}`}
                    type="button"
                    onClick={() => selectAspectLineMode(option.key)}
                    className={cx("min-h-9 rounded-lg px-1 transition", aspectLineMode === option.key ? "bg-gold/18 text-gold ring-1 ring-gold/35" : "text-mist/65")}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {aspectLineMode === "custom" ? (
                <div className="grid gap-2">
                  {ASPECT_LINE_SCOPE_OPTIONS.map((option) => (
                    <section key={`mobile-aspect-custom-${option.key}`} className="rounded-xl border border-white/10 bg-white/[0.025] p-2">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[10px] text-starlight">{option.label}</p>
                          <p className="truncate text-[8px] text-mist/50">{option.shortLabel}</p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            onClick={() => setAspectLineGroupSelection(option.key, "all")}
                            className="h-7 rounded-md border border-white/10 bg-white/[0.03] px-2 text-[8px] text-mist/70 transition hover:border-gold/35 hover:text-gold"
                          >
                            全選択
                          </button>
                          <button
                            type="button"
                            onClick={() => setAspectLineGroupSelection(option.key, "none")}
                            className="h-7 rounded-md border border-white/10 bg-white/[0.03] px-2 text-[8px] text-mist/70 transition hover:border-gold/35 hover:text-gold"
                          >
                            全解除
                          </button>
                        </div>
                      </div>
                      <div className="grid gap-1">
                        {option.key !== "natalNatal" ? (
                          <div className="grid grid-cols-5 gap-1" aria-label={`${option.title}の現行天体`}>
                            {sky.transits.map((item) => {
                              const checked = aspectLineSelections[option.key].transit.includes(item.planet);
                              return (
                                <label
                                  key={`mobile-aspect-${option.key}-transit-${item.planet}`}
                                  className={cx(
                                    "flex h-7 cursor-pointer items-center justify-center rounded-md border text-[12px] transition",
                                    checked ? "border-sky-300/45 bg-sky-300/15 text-sky-100" : "border-white/10 bg-white/[0.03] text-mist/65"
                                  )}
                                  title={`現行${planetLabel(item.planet)}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleAspectLineSelection(option.key, "transit", item.planet)}
                                    className="sr-only"
                                  />
                                  {PLANET_SYMBOLS[item.planet] || item.label}
                                </label>
                              );
                            })}
                          </div>
                        ) : null}
                        {option.key !== "transitTransit" ? (
                          <div className="grid grid-cols-6 gap-1" aria-label={`${option.title}のネイタル天体`}>
                            {sky.natalPoints.map((item) => {
                              const checked = aspectLineSelections[option.key].natal.includes(item.planet);
                              return (
                                <label
                                  key={`mobile-aspect-${option.key}-natal-${item.planet}`}
                                  className={cx(
                                    "flex h-7 cursor-pointer items-center justify-center rounded-md border text-[11px] transition",
                                    checked ? "border-gold/50 bg-gold/15 text-gold" : "border-white/10 bg-white/[0.03] text-mist/65"
                                  )}
                                  title={`ネイタル${planetLabel(item.planet)}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleAspectLineSelection(option.key, "natal", item.planet)}
                                    className="sr-only"
                                  />
                                  {PLANET_SYMBOLS[item.planet] || planetLabel(item.planet)}
                                </label>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    </section>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </GlassPanel>
  );
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

function realtimeMonthIndex(data = []) {
  const today = new Date();
  const todayMonth = today.getMonth();
  const directIndex = data.findIndex((item) => monthIndex(item?.date) === todayMonth);
  return directIndex >= 0 ? directIndex : workdayMonthIndex();
}

function realtimeDayIndex(days = []) {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  const monthDay = `${month}-${day}`;
  const exactIndex = days.findIndex((item) => String(dateKey(item?.date)).slice(5) === monthDay);
  if (exactIndex >= 0) return exactIndex;
  const targetDay = today.getDate();
  const dayIndex = days.findIndex((item) => Number(String(item?.date || "").slice(8, 10)) === targetDay);
  return dayIndex >= 0 ? dayIndex : 0;
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

function annualTransitHouseTransitionItemsFromForecast(forecast) {
  const transitions = Array.isArray(forecast?.annual_transit_house_transitions)
    ? forecast.annual_transit_house_transitions
    : Array.isArray(forecast?.annualTransitHouseTransitions)
      ? forecast.annualTransitHouseTransitions
      : [];
  return transitions.map((transition) => {
    const changes = Array.isArray(transition?.changes) ? transition.changes : [];
    const changeLabels = changes.map((change) => {
      const type = String(change?.type || "").toUpperCase();
      if (type === "SIGN_INGRESS") return `${zodiacSignLabel(change?.value)}へ移動`;
      if (type === "SOLAR_HOUSE_INGRESS") return `ソーラー${change?.value || "-"}ハウスへ移動`;
      if (type === "NATAL_HOUSE_INGRESS") return `ネイタル${change?.value || "-"}ハウスへ移動`;
      return String(change?.value || "");
    }).filter(Boolean);
    const planet = String(transition?.planet || "").trim().toUpperCase();
    const date = formatThemeDate(transition?.date);
    const description = String(transition?.description || "").trim();
    return {
      color: PLANET_COLORS[planet] || "#c3c6d7",
      startRaw: transition?.date || "",
      label: `${date}: ${planetLabel(planet)} ${changeLabels.join(" / ")}`.trim(),
      body: !description || description === "-" ? "準備中" : description,
    };
  });
}

function annualHouseActivationItemsFromForecast(forecast) {
  const events = Array.isArray(forecast?.annual_house_activation_events)
    ? forecast.annual_house_activation_events
    : Array.isArray(forecast?.annualHouseActivationEvents)
      ? forecast.annualHouseActivationEvents
      : [];
  return events.map((event) => {
    const planets = Array.isArray(event?.planets) ? event.planets : [];
    const labels = planets.map((planet) => planetLabel(planet)).join("・");
    const houseType = String(event?.house_type || "natal").toLowerCase() === "solar" ? "ソーラー" : "ネイタル";
    const angle = event?.aspect_angle === null || event?.aspect_angle === undefined
      ? ""
      : ` ${event.aspect_angle}°`;
    let summary = `${labels}が${houseType}${event?.house || "-"}ハウスを強調`;
    if (event?.activation_type === "TRANSIT_TO_TRANSIT") {
      summary = `現行${labels}${angle} / ${houseType}${event?.house || "-"}ハウスを強調`;
    } else if (event?.activation_type === "TRANSIT_TO_NATAL") {
      summary = `現行${labels}${angle} × ネイタル${planetLabel(event?.natal_target)} / ネイタル${event?.house || "-"}ハウスを刺激`;
    } else if (event?.activation_type === "HOUSE_CLUSTER") {
      summary = `${labels}が${houseType}${event?.house || "-"}ハウスに集中`;
    }
    const description = String(event?.description || "").trim();
    return {
      color: PLANET_COLORS[planets[0]] || "#d3bcf9",
      startRaw: event?.date || "",
      label: `${formatThemeDate(event?.date)}: ${summary}`,
      body: !description || description === "-" ? "準備中" : description,
    };
  });
}

const YEARLY_MONTHLY_SCORE_SCALE = 1.0;

function yearlyMonthlyPercentile(values, percentile) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * percentile;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const ratio = position - lowerIndex;
  return sorted[lowerIndex] + ((sorted[upperIndex] - sorted[lowerIndex]) * ratio);
}

function monthlyScoreSummary(values) {
  if (!values.length) return { score: 0, low: 0, high: 0 };
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const scale = (value) => clamp(Math.round(value * YEARLY_MONTHLY_SCORE_SCALE), -100, 100);
  const score = scale(average);
  const percentileLow = scale(yearlyMonthlyPercentile(values, 0.1));
  const percentileHigh = scale(yearlyMonthlyPercentile(values, 0.9));
  return {
    score,
    low: Math.min(score, percentileLow),
    high: Math.max(score, percentileHigh),
  };
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
        scoreRanges: Object.fromEntries(["total", ...SCORE_KEYS.map((item) => item.key)].map((key) => [key, { low: 0, high: 0 }])),
        text_description: "",
      };
    }
    const scores = {};
    const scoreRanges = {};
    ["total", ...SCORE_KEYS.map((item) => item.key)].forEach((key) => {
      const values = items.map((day) => scoreFor(day, key)).filter((value) => Number.isFinite(value));
      const summary = monthlyScoreSummary(values);
      scores[key] = summary.score;
      scoreRanges[key] = { low: summary.low, high: summary.high };
    });
    return {
      ...items[Math.floor(items.length / 2)],
      scores,
      scoreRanges,
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

function dailyDataForYear(forecast, year) {
  const source = Array.isArray(forecast?.yearly_data) ? forecast.yearly_data : [];
  const byDate = new Map(source.map((day) => [dateKey(day?.date), day]).filter(([date]) => Boolean(date)));
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31);
  const items = [];
  for (const date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    items.push(byDate.get(key) || {
      date: key,
      scores: { total: 0, general: 0, work: 0, love: 0, money: 0 },
      text_description: "",
    });
  }
  return items;
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

function smoothPath(points, startCommand = "M") {
  if (!points.length) return "";
  if (points.length === 1) return `${startCommand} ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  const commands = [`${startCommand} ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`];
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

function GlassPanel({ children, className = "", variant = "default" }) {
  return (
    <section className={cx(
      "rounded-2xl border border-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.32)] backdrop-blur-xl",
      variant === "text" ? "bg-[#1a1c1c]/36" : "bg-[#1a1c1c]/62",
      "min-w-0",
      className
    )}>
      {children}
    </section>
  );
}

function ForecastLoadingPanel({ label = "読込中" }) {
  return (
    <GlassPanel className="flex min-h-[180px] items-center justify-center p-6 text-center">
      <div className="inline-flex items-center gap-3 font-mono text-xs font-bold tracking-[0.18em] text-mist">
        <RefreshCw size={16} className="animate-spin text-gold" />
        <span>{label}</span>
      </div>
    </GlassPanel>
  );
}

function ForecastGalaxyBackground({ children, className = "", innerClassName = "" }) {
  return (
    <section
      className={cx(
        "relative -mx-0.5 -my-3 min-h-[calc(100vh-168px)] overflow-hidden bg-[#05070f] px-0.5 py-3 sm:-mx-4 sm:px-4 sm:py-6 lg:-mx-6 lg:px-6 lg:py-8",
        className
      )}
      style={{
        backgroundImage: `linear-gradient(180deg, rgba(5,7,15,0.28), rgba(5,7,15,0.52)), url(${forecastGalaxyBg})`,
        backgroundAttachment: "fixed",
        backgroundPosition: "center center",
        backgroundSize: "cover",
      }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_8%,rgba(233,195,73,0.16),transparent_32%),linear-gradient(90deg,rgba(5,7,15,0.14),rgba(5,7,15,0.02)_42%,rgba(5,7,15,0.24))]" />
      <div className={cx("relative z-10 grid gap-3 sm:gap-6", innerClassName)}>
        {children}
      </div>
    </section>
  );
}

const UNIFIED_FORECAST_TABS = [
  { key: "daily", label: "日別" },
  { key: "monthly", label: "月間" },
  { key: "annual", label: "年間" },
];

function UnifiedForecastView({
  data,
  stats,
  forecast,
  activeYear,
  dailyDetailData,
  selectedSeriesKey,
  setSelectedSeriesKey,
  selectedMonthlyMonthIndex,
  setSelectedMonthlyMonthIndex,
  selectedMonthIndex,
  setSelectedMonthIndex,
  annualTransitDays,
  annualTransitDayIndex,
  setSelectedAnnualDayIndex,
  onOpenYearDialog,
  activeUnifiedView,
  setActiveUnifiedView,
  detailLoadingKeys,
  onRequestDayDetail,
  onDailyDisplayDateChange,
}) {
  const monthlyTransitDays = useMemo(
    () => dailyDataForMonth(forecast, activeYear, selectedMonthlyMonthIndex),
    [forecast, activeYear, selectedMonthlyMonthIndex]
  );
  const [selectedUnifiedMonthlyDayIndex, setSelectedUnifiedMonthlyDayIndex] = useState(() => realtimeDayIndex(monthlyTransitDays));
  const monthlyTransitDateRange = `${dateKey(monthlyTransitDays[0]?.date)}:${dateKey(monthlyTransitDays[monthlyTransitDays.length - 1]?.date)}:${monthlyTransitDays.length}`;
  useEffect(() => {
    setSelectedUnifiedMonthlyDayIndex(realtimeDayIndex(monthlyTransitDays));
  }, [monthlyTransitDateRange]);
  const unifiedMonthlyDayIndex = clamp(selectedUnifiedMonthlyDayIndex, 0, Math.max(0, monthlyTransitDays.length - 1));
  const mapConfig = activeUnifiedView === "monthly"
    ? {
      day: monthlyTransitDays[unifiedMonthlyDayIndex] || monthlyTransitDays[0],
      availableDays: monthlyTransitDays,
      selectedDayIndex: unifiedMonthlyDayIndex,
      onSelectDayIndex: setSelectedUnifiedMonthlyDayIndex,
    }
    : {
      day: annualTransitDays[annualTransitDayIndex] || data[clamp(selectedMonthIndex, 0, data.length - 1)] || data[0],
      availableDays: annualTransitDays,
      selectedDayIndex: annualTransitDayIndex,
      onSelectDayIndex: setSelectedAnnualDayIndex,
    };
  const mapDate = dateKey(mapConfig.day?.date);
  const mapDayPending = Boolean(mapDate && (
    detailLoadingKeys.has(`day:${mapDate}`) || !yearlyDayDetailLoaded(forecast, mapDate)
  ));
  const monthlyDetailPending = activeUnifiedView === "monthly" && (
    detailLoadingKeys.has(`month:${selectedMonthlyMonthIndex + 1}`)
    || !yearlyMonthDetailLoaded(forecast, selectedMonthlyMonthIndex + 1)
  );
  const annualDetailPending = activeUnifiedView === "annual" && (
    detailLoadingKeys.has("annual") || !yearlyAnnualDetailLoaded(forecast)
  );
  useEffect(() => {
    if (mapDate && forecast?.yearly_data?.length && !yearlyDayDetailLoaded(forecast, mapDate)) {
      onRequestDayDetail(mapDate);
    }
  }, [forecast, mapDate, onRequestDayDetail]);

  return (
    <ForecastGalaxyBackground>
      <div className="flex flex-wrap items-end gap-3 sm:gap-5">
        <div className="min-w-0">
          <h2 className="font-serif text-2xl font-semibold text-starlight sm:text-4xl">星の見通し</h2>
        </div>
        <div className="mb-0.5 flex shrink-0 rounded-full border border-white/10 bg-white/[0.06] p-1 font-mono text-[10px] font-bold text-mist shadow-[0_10px_28px_rgba(0,0,0,0.22)] sm:mb-1 sm:text-xs">
          {UNIFIED_FORECAST_TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setActiveUnifiedView(item.key)}
              className={cx(
                "rounded-full px-3 py-1.5 transition",
                activeUnifiedView === item.key
                  ? "bg-gold text-[#241a00]"
                  : "hover:bg-white/10 hover:text-starlight"
              )}
              aria-pressed={activeUnifiedView === item.key}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className={cx(activeUnifiedView === "daily" ? "block" : "hidden")}>
        <DashboardDailyDetailContentLayer
          data={dailyDetailData}
          onDisplayDateChange={onDailyDisplayDateChange}
        />
      </div>
      <div className={cx(activeUnifiedView === "monthly" ? "block" : "hidden")}>
        {monthlyDetailPending ? (
          <ForecastLoadingPanel label="月別詳細を読込中" />
        ) : <Matrix
          data={data}
          selectedSeriesKey={selectedSeriesKey}
          setSelectedSeriesKey={setSelectedSeriesKey}
          selectedMonthIndex={selectedMonthlyMonthIndex}
          setSelectedMonthIndex={setSelectedMonthlyMonthIndex}
          forecast={forecast}
          activeYear={activeYear}
          showTransitMap={false}
          variant="lead"
          selectedDayIndex={unifiedMonthlyDayIndex}
          setSelectedDayIndex={setSelectedUnifiedMonthlyDayIndex}
        />}
      </div>
      {activeUnifiedView === "annual" ? (
        annualDetailPending
          ? <ForecastLoadingPanel label="年間詳細を読込中" />
          : <OraclePanel stats={stats} forecast={forecast} />
      ) : null}
      {mapDayPending ? (
        <ForecastLoadingPanel label={`${formatShortDate(mapDate)}の天体・アスペクトを読込中`} />
      ) : (
        <TransitNatalSunMap
          day={mapConfig.day}
          forecast={forecast}
          availableDays={mapConfig.availableDays}
          selectedDayIndex={mapConfig.selectedDayIndex}
          onSelectDayIndex={mapConfig.onSelectDayIndex}
        />
      )}
      <div className={cx(activeUnifiedView === "monthly" ? "block" : "hidden")}>
        {!monthlyDetailPending ? <Matrix
          data={data}
          selectedSeriesKey={selectedSeriesKey}
          setSelectedSeriesKey={setSelectedSeriesKey}
          selectedMonthIndex={selectedMonthlyMonthIndex}
          setSelectedMonthIndex={setSelectedMonthlyMonthIndex}
          forecast={forecast}
          activeYear={activeYear}
          showTransitMap={false}
          variant="rest"
          selectedDayIndex={unifiedMonthlyDayIndex}
          setSelectedDayIndex={setSelectedUnifiedMonthlyDayIndex}
        /> : null}
      </div>
      {activeUnifiedView === "annual" ? (
        <div className="grid gap-4 sm:gap-7">
          <AnnualChart
            data={data}
            stats={stats}
            selectedSeriesKey={selectedSeriesKey}
            setSelectedSeriesKey={setSelectedSeriesKey}
            selectedMonthIndex={selectedMonthIndex}
            setSelectedMonthIndex={setSelectedMonthIndex}
            activeYear={activeYear}
            onOpenYearDialog={onOpenYearDialog}
          />
          <AnnualScoreMatrix data={data} selectedSeriesKey={selectedSeriesKey} selectedMonthIndex={selectedMonthIndex} />
          <FooterStats stats={stats} />
        </div>
      ) : null}
    </ForecastGalaxyBackground>
  );
}

function VersionRefreshButton({ versionState, onRefreshLatest, refreshingLatest }) {
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  const tooltipTimerRef = React.useRef(null);
  const isDataOutdated = Boolean(versionState?.isOutdated);
  const isAppOutdated = Boolean(versionState?.isAppOutdated);
  const canRefresh = isAppOutdated || isDataOutdated;
  const isCheckingVersion = Boolean(versionState?.checking);
  const refreshTooltip = refreshingLatest
    ? "最新版を取得しています"
    : isAppOutdated
      ? "アプリ画面が更新されています。クリックすると最新版の画面を読み込みます"
      : isDataOutdated
      ? "鑑定データが更新されています。クリックすると最新版で再計算します"
      : versionState?.error
        ? "更新確認に失敗しました。再読み込み後に再確認してください"
        : isCheckingVersion
          ? "更新状況を確認しています"
          : "現在表示中の内容は最新版です";

  useEffect(() => {
    return () => {
      if (tooltipTimerRef.current) {
        window.clearTimeout(tooltipTimerRef.current);
      }
    };
  }, []);

  const showTooltipTemporarily = () => {
    setIsTooltipVisible(true);
    if (tooltipTimerRef.current) {
      window.clearTimeout(tooltipTimerRef.current);
    }
    tooltipTimerRef.current = window.setTimeout(() => {
      setIsTooltipVisible(false);
      tooltipTimerRef.current = null;
    }, 3000);
  };

  const handleRefreshButtonClick = () => {
    showTooltipTemporarily();
    if (isAppOutdated) {
      const refreshUrl = new URL(window.location.href);
      refreshUrl.searchParams.set("_app_refresh", String(Date.now()));
      window.location.replace(refreshUrl.toString());
      return;
    }
    if (isDataOutdated && !refreshingLatest) {
      onRefreshLatest();
    }
  };

  return (
    <div className="group relative shrink-0">
      <div className={cx(
        "pointer-events-none fixed right-3 top-[54px] z-50 w-[min(320px,calc(100vw-24px))] rounded-lg border border-[#D4AF37]/45 bg-[#fffdf7] px-3 py-2 text-[11px] leading-5 text-[#0A192F] opacity-0 shadow-[0_12px_28px_rgba(15,23,42,0.18)] transition sm:invisible sm:opacity-0",
        isTooltipVisible && "opacity-100"
      )}>
        {refreshTooltip}
      </div>
      <button
        type="button"
        onClick={handleRefreshButtonClick}
        className={cx(
          "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 font-mono text-[10px] font-black tracking-[0.08em] shadow-sm transition sm:h-10 sm:gap-2 sm:px-4 sm:text-xs",
          canRefresh
            ? "border-[#D4AF37]/70 bg-[#D4AF37] text-[#241a00] hover:bg-[#f2d56d]"
            : "cursor-not-allowed border-slate-200 bg-white text-[#0A192F]/45"
        )}
        aria-disabled={!canRefresh || refreshingLatest}
      >
        <RefreshCw size={14} className={cx(refreshingLatest && "animate-spin")} />
        <span>最新版に更新</span>
      </button>
      <div className={cx(
        "pointer-events-none absolute right-0 top-full z-50 mt-2 hidden w-[320px] rounded-lg border border-[#D4AF37]/45 bg-[#fffdf7] px-3 py-2 text-xs leading-5 text-[#0A192F] opacity-0 shadow-[0_12px_28px_rgba(15,23,42,0.18)] transition sm:block",
        isTooltipVisible && "opacity-100"
      )}>
        {refreshTooltip}
      </div>
    </div>
  );
}

function RetrogradeCalendarPanel({
  id,
  isOpen,
  sortedRetrogradeCalendar,
  retrogradeCalendarSort,
  setRetrogradeCalendarSort,
  className = "",
}) {
  return (
    <div
      id={id}
      className={cx(
        "z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white/95 p-3 text-[#0A192F] shadow-[0_18px_45px_rgba(15,23,42,0.18)] backdrop-blur-xl transition",
        isOpen ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0",
        className
      )}
      aria-hidden={!isOpen}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[11px] font-black tracking-[0.16em] text-[#0A192F]">逆行カレンダー</p>
        <div className="flex rounded-full border border-slate-200 bg-slate-50 p-0.5 text-[9px]">
          {[
            ["date", "日付順"],
            ["planet", "天体別"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setRetrogradeCalendarSort(value)}
              className={cx(
                "rounded-full px-2 py-1 transition",
                retrogradeCalendarSort === value ? "bg-[#D4AF37] text-white" : "text-[#0A192F]/60 hover:text-[#0A192F]"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid max-h-[320px] gap-1 overflow-y-auto pr-1">
        {sortedRetrogradeCalendar.length ? sortedRetrogradeCalendar.map((item, index) => {
          const isRetrogradeStart = String(item.event_type || item.eventType || "").includes("RETROGRADE") || item.event_label === "逆行開始" || item.eventLabel === "逆行開始";
          return (
            <div key={`${item.planet || item.planet_label || index}-${item.event_date || item.eventDate || index}`} className="grid grid-cols-[4.6rem_1fr] gap-2 border-b border-slate-200/80 px-1 py-2 last:border-b-0">
              <span className={cx("inline-flex min-h-6 items-center justify-center whitespace-nowrap rounded-full px-2 py-1 text-center text-[9px] font-black", isRetrogradeStart ? "bg-[#D4AF37]/15 text-[#9d7620]" : "bg-cyan-100 text-cyan-800")}>
                {item.event_label || item.eventLabel || item.event_type || item.eventType || "-"}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[11px] font-black text-[#0A192F]">{item.planet_label || item.planetLabel || planetLabel(item.planet)}</p>
                <p className="mt-0.5 text-[10px] font-bold text-[#0A192F]/60">{formatHeaderCalendarDate(item.event_date || item.eventDate)} {item.degree_display || item.degreeDisplay || ""}</p>
              </div>
            </div>
          );
        }) : (
          <p className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-4 text-[11px] font-bold leading-5 text-[#0A192F]/60">
            逆行カレンダーを取得できませんでした。
          </p>
        )}
      </div>
    </div>
  );
}

function Header({
  activeYear,
  activeView,
  setActiveView,
  forecast = null,
  readingPayload = null,
  dashboardData = null,
  versionState,
  onRefreshLatest,
  refreshingLatest,
}) {
  const [isMobileUnifiedMenuOpen, setIsMobileUnifiedMenuOpen] = useState(false);
  const [isRetrogradeCalendarOpen, setIsRetrogradeCalendarOpen] = useState(false);
  const [retrogradeCalendarSort, setRetrogradeCalendarSort] = useState("date");
  const navItems = [
    ["unified", "星の見通し"],
    ["horoscope", "Horoscope"],
  ];
  const retrogradeCalendar = useMemo(() => {
    const storedPayload = getStoredReadingResult() || {};
    const payload = readingPayload || storedPayload;
    const sourceDashboard = dashboardData || payload?.dashboard_data || payload?.dashboardData || {};
    const sourceForecast = forecast || getForecast() || payload?.yearly_forecast || payload?.yearlyForecast || sourceDashboard?.yearly_forecast || sourceDashboard?.yearlyForecast || {};
    const items =
      sourceDashboard?.retrogradeCalendar ||
      sourceDashboard?.retrograde_calendar ||
      payload?.retrogradeCalendar ||
      payload?.retrograde_calendar ||
      sourceForecast?.retrogradeCalendar ||
      sourceForecast?.retrograde_calendar ||
      fallbackDashboardData?.retrogradeCalendar ||
      [];
    return Array.isArray(items) ? items : [];
  }, [dashboardData, forecast, readingPayload]);
  const sortedRetrogradeCalendar = useMemo(() => {
    return [...retrogradeCalendar].sort((a, b) => {
      if (retrogradeCalendarSort === "planet") {
        return String(a.planet_label || a.planetLabel || a.planet || "").localeCompare(String(b.planet_label || b.planetLabel || b.planet || ""), "ja")
          || String(a.event_date || a.eventDate || "").localeCompare(String(b.event_date || b.eventDate || ""));
      }
      return String(a.event_date || a.eventDate || "").localeCompare(String(b.event_date || b.eventDate || ""))
        || String(a.planet_label || a.planetLabel || a.planet || "").localeCompare(String(b.planet_label || b.planetLabel || b.planet || ""), "ja");
    });
  }, [retrogradeCalendar, retrogradeCalendarSort]);
  const forecastLabel = {
    unified: "星の見通し",
    horoscope: "Horoscope",
  }[activeView] || "星の見通し";
  const headerTitle = activeView === "horoscope" ? forecastLabel : `${activeYear}年 ${forecastLabel}`;
  return (
    <header className="fixed left-0 top-0 z-40 w-full border-b border-slate-200/90 bg-[#f8fafc]/95 backdrop-blur-xl">
      <div className="flex w-full max-w-none flex-wrap items-center justify-between gap-2 px-3 py-2 sm:gap-6 sm:px-8 sm:py-6 lg:mx-auto lg:max-w-[1760px]">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none sm:gap-8">
          <a href="/" className="max-w-[66px] font-serif text-[11px] font-bold leading-[0.98] text-[#0A192F] sm:max-w-none sm:text-4xl sm:leading-none">The Celestial Atelier</a>
          <span className="hidden h-10 w-px bg-slate-200 md:block" />
          <div className="relative flex min-w-0 flex-1 items-center gap-1 sm:flex-none sm:gap-1.5">
            <h1 className="hidden truncate font-serif font-semibold tracking-[0.04em] text-[#0A192F] sm:block sm:text-2xl md:text-3xl">
              {headerTitle}
            </h1>
            <h1 className="flex min-w-0 items-baseline gap-1 font-serif text-[13px] font-semibold tracking-[0] text-[#0A192F] sm:hidden">
              {activeView === "horoscope" ? (
                <span className="truncate">{forecastLabel}</span>
              ) : (
                <>
                  <span className="shrink-0 font-mono text-[10px] font-black text-[#0A192F]/70">{activeYear}年</span>
                  <span className="truncate">{forecastLabel}</span>
                </>
              )}
            </h1>
            <button
              type="button"
              onClick={() => setIsMobileUnifiedMenuOpen((value) => !value)}
              className={cx(
                "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-[#0A192F] shadow-sm transition",
                isMobileUnifiedMenuOpen ? "ring-1 ring-[#D4AF37]/45" : "hover:bg-[#fff7df] hover:text-[#D4AF37]"
              )}
              aria-expanded={isMobileUnifiedMenuOpen}
              aria-controls="forecast-mobile-nav"
              aria-label="ナビゲーションを開く"
              title="メニュー"
            >
              <Menu size={15} />
            </button>
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setIsRetrogradeCalendarOpen((value) => !value)}
                className={cx(
                  "inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-[#0A192F] shadow-sm transition",
                  isRetrogradeCalendarOpen ? "ring-1 ring-[#D4AF37]/45" : "hover:bg-[#fff7df] hover:text-[#D4AF37]"
                )}
                aria-expanded={isRetrogradeCalendarOpen}
                aria-controls="forecast-retrograde-calendar"
                aria-label="逆行カレンダーを開く"
                title="逆行カレンダー"
              >
                <CalendarDays size={15} />
              </button>
              <RetrogradeCalendarPanel
                id="forecast-retrograde-calendar"
                isOpen={isRetrogradeCalendarOpen}
                sortedRetrogradeCalendar={sortedRetrogradeCalendar}
                retrogradeCalendarSort={retrogradeCalendarSort}
                setRetrogradeCalendarSort={setRetrogradeCalendarSort}
                className="fixed left-3 right-3 top-[58px] sm:left-auto sm:right-8 sm:top-[88px] sm:w-[330px]"
              />
            </div>
          </div>
        </div>
        <VersionRefreshButton
          versionState={versionState}
          onRefreshLatest={onRefreshLatest}
          refreshingLatest={refreshingLatest}
        />
        <nav
          id="forecast-mobile-nav"
          className={cx(
            "order-last w-full items-center gap-5 overflow-x-auto border-t border-slate-200 pt-3 font-mono text-[10px] font-bold tracking-[0.1em] text-[#0A192F]/70 transition-all [scrollbar-width:none] sm:text-xs lg:gap-10 lg:tracking-[0.12em]",
            isMobileUnifiedMenuOpen ? "flex max-h-20 opacity-100" : "hidden max-h-0 opacity-0"
          )}
        >
          {navItems.map(([value, label]) => (
            <React.Fragment key={value}>
              <button
                type="button"
                  onClick={() => {
                    setActiveView(value);
                  }}
                className={cx(
                  "pb-2 transition sm:pb-3",
                  activeView === value ? "border-b-2 border-[#D4AF37] text-[#0A192F]" : "hover:text-[#D4AF37]"
                )}
              >
                {label}
              </button>
            </React.Fragment>
          ))}
        </nav>
      </div>
    </header>
  );
}

function formatHeaderCalendarDate(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return text || "-";
  return `${match[1]}/${Number(match[2])}/${Number(match[3])}`;
}

function OraclePanel({ stats, forecast }) {
  const [analysisMode, setAnalysisMode] = useState("summary");
  const [openTransitAspectKeys, setOpenTransitAspectKeys] = useState(() => new Set());
  const themeItems = themeItemsFromForecast(forecast);
  const lessonItems = lessonItemsFromForecast(forecast);
  const yearFlowItems = [
    ...annualTransitHouseTransitionItemsFromForecast(forecast),
    ...annualHouseActivationItemsFromForecast(forecast),
  ].sort((a, b) => a.startRaw.localeCompare(b.startRaw) || a.label.localeCompare(b.label));
  const summaryColumns = summaryItemsFromForecast(forecast);
  const categorizedAspectItems = categorizedAnnualAspectItemsFromForecast(forecast);
  const activeCategoryAspectItems = {
    test1: categorizedAspectItems.love,
    test2: categorizedAspectItems.work,
    money: categorizedAspectItems.money,
  }[analysisMode] || [];
  const analysisTitle = {
    theme: "幸運拡大",
    themeSupplement: "補足",
    lesson: "成長課題",
    lessonSupplement: "補足",
    summary: "総括",
    yearFlow: "今年の流れ",
    test1: "恋愛",
    test2: "仕事",
    money: "お金",
  }[analysisMode] || "総括";
  const isThemeSectionActive = analysisMode === "theme" || analysisMode === "themeSupplement";
  const isLessonSectionActive = analysisMode === "lesson" || analysisMode === "lessonSupplement";
  const fallbackThemeItems = [
    { color: "#e9c349", label: "THEME 01", body: "作成中" },
    { color: "#d3bcf9", label: "THEME 02", body: "作成中" },
    { color: "#ffb4ab", label: "THEME 03", body: "作成中" },
  ];
  const fallbackYearFlowItems = [
    { color: "#e9c349", label: "FLOW 01", body: "準備中" },
    { color: "#d3bcf9", label: "FLOW 02", body: "準備中" },
    { color: "#ffb4ab", label: "FLOW 03", body: "準備中" },
  ];
  const fallbackSummaryColumns = {
    environment: [{ color: "#e9c349", label: "1/1-12/31", startRaw: "2026-01-01", endRaw: "2026-12-31", title: "現実的変化", body: "作成中" }],
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
      <GlassPanel variant="text" className="flex h-[520px] flex-col overflow-hidden p-2 sm:h-[560px] sm:p-5 lg:h-[620px] lg:p-6">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-mono text-[8px] font-bold uppercase tracking-[0.18em] text-gold/75 sm:text-[9px]">
              Main Theme
            </p>
            <h2 className="mt-1 font-serif text-2xl font-semibold text-starlight sm:text-3xl">
              {analysisTitle}
            </h2>
          </div>
          <div className="flex w-full items-start overflow-x-auto rounded-full border border-white/10 bg-white/[0.04] p-1 font-mono text-[7px] font-bold text-mist [scrollbar-width:none] sm:w-auto sm:shrink-0 sm:text-[10px]">
            <div className="flex shrink-0 flex-col">
            {[["summary", "総括"]].map(([value, label]) => (
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
              <button
                type="button"
                onClick={() => setAnalysisMode("yearFlow")}
                className={cx(
                  "ml-2 rounded-full px-2 py-1 text-left text-[6px] transition sm:ml-3 sm:text-[8px]",
                  analysisMode === "yearFlow" ? "bg-white/15 text-gold" : "text-mist/70 hover:bg-white/10 hover:text-starlight"
                )}
              >
                今年の流れ
              </button>
            </div>
            <div className="flex shrink-0 flex-col border-l border-white/10 pl-1">
              <button
                type="button"
                onClick={() => setAnalysisMode("theme")}
                className={cx(
                  "rounded-full px-2 py-1.5 text-left transition sm:px-3",
                  isThemeSectionActive ? "bg-gold text-[#241a00]" : "hover:bg-white/10 hover:text-starlight"
                )}
              >
                幸運拡大
              </button>
              <button
                type="button"
                onClick={() => setAnalysisMode("themeSupplement")}
                className={cx(
                  "ml-2 rounded-full px-2 py-1 text-left text-[6px] transition sm:ml-3 sm:text-[8px]",
                  analysisMode === "themeSupplement" ? "bg-white/15 text-gold" : "text-mist/70 hover:bg-white/10 hover:text-starlight"
                )}
              >
                補足
              </button>
            </div>
            <div className="flex shrink-0 flex-col border-l border-white/10 pl-1">
              <button
                type="button"
                onClick={() => setAnalysisMode("lesson")}
                className={cx(
                  "rounded-full px-2 py-1.5 text-left transition sm:px-3",
                  isLessonSectionActive ? "bg-gold text-[#241a00]" : "hover:bg-white/10 hover:text-starlight"
                )}
              >
                成長課題
              </button>
              <button
                type="button"
                onClick={() => setAnalysisMode("lessonSupplement")}
                className={cx(
                  "ml-2 rounded-full px-2 py-1 text-left text-[6px] transition sm:ml-3 sm:text-[8px]",
                  analysisMode === "lessonSupplement" ? "bg-white/15 text-gold" : "text-mist/70 hover:bg-white/10 hover:text-starlight"
                )}
              >
                補足
              </button>
            </div>
            {[
              ["test1", "恋愛"],
              ["test2", "仕事"],
              ["money", "お金"],
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
                <span className="absolute left-0 top-0.5 h-3 w-3 rounded-full shadow-[0_0_18px_currentColor]" style={{ color: item.color, backgroundColor: item.color }} />
                <span className="absolute left-[5px] top-4 h-full w-px bg-white/15" />
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
                <span className="absolute left-0 top-0.5 h-3 w-3 rounded-full shadow-[0_0_18px_currentColor]" style={{ color: item.color, backgroundColor: item.color }} />
                <span className="absolute left-[5px] top-4 h-full w-px bg-white/15" />
                <p className="font-mono text-xs font-bold uppercase tracking-[0.12em]" style={{ color: item.color }}>
                  {item.label}
                </p>
                <p className="mt-3 whitespace-pre-line text-sm leading-7 text-mist sm:text-base sm:leading-8">{item.body}</p>
              </article>
            ))}
          </div>
        ) : null}
        {analysisMode === "yearFlow" ? (
          <div className="mt-6 grid min-h-0 flex-1 gap-6 overflow-y-auto pr-2 [scrollbar-color:#e9c349_rgba(255,255,255,0.08)] [scrollbar-width:thin] sm:mt-8 sm:gap-8">
            {(yearFlowItems.length ? yearFlowItems : fallbackYearFlowItems).map((item) => (
              <article key={`year-flow-${item.label}`} className="relative pl-8">
                <span className="absolute left-0 top-0.5 h-3 w-3 rounded-full shadow-[0_0_18px_currentColor]" style={{ color: item.color, backgroundColor: item.color }} />
                <span className="absolute left-[5px] top-4 h-full w-px bg-white/15" />
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
              <p>現実的変化</p>
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
        {["themeSupplement", "lessonSupplement"].includes(analysisMode) ? (
          <div className="mt-6 flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.035] p-6 font-mono text-xs font-bold tracking-[0.18em] text-mist sm:mt-8">
            準備中
          </div>
        ) : null}
        {["test1", "test2", "money"].includes(analysisMode) ? (
          <div className="mt-6 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-2 [scrollbar-color:#e9c349_rgba(255,255,255,0.08)] [scrollbar-width:thin] sm:mt-8">
            {activeCategoryAspectItems.length ? (
              activeCategoryAspectItems.map((item) => {
                const itemKey = `${analysisMode}-${item.key}-${item.startDate}`;
                const isOpen = openTransitAspectKeys.has(itemKey);
                return (
                <article key={`${analysisMode}-${item.key}-${item.startDate}`} className="shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.022]">
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
                該当するアスペクトはありません
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
  const selectedScore = scoreFor(selectedDay, selectedSeries.key);
  const selectedScoreRange = selectedDay?.scoreRanges?.[selectedSeries.key] || {};
  const selectedHighScore = Number.isFinite(Number(selectedScoreRange.high))
    ? Number(selectedScoreRange.high)
    : selectedScore;
  const selectedLowScore = Number.isFinite(Number(selectedScoreRange.low))
    ? Number(selectedScoreRange.low)
    : selectedScore;
  const tooltipX = chartX(selectedMonth, data.length);
  const tooltipY = chartY(selectedScore);
  const selectedPoints = data.map((day, index) => ({ x: chartX(index, data.length), y: chartY(scoreFor(day, selectedSeries.key)) }));
  const selectedRangeUpper = data.map((day, index) => ({
    x: chartX(index, data.length),
    y: chartY(day?.scoreRanges?.[selectedSeries.key]?.high ?? scoreFor(day, selectedSeries.key)),
  }));
  const selectedRangeLower = data.map((day, index) => ({
    x: chartX(index, data.length),
    y: chartY(day?.scoreRanges?.[selectedSeries.key]?.low ?? scoreFor(day, selectedSeries.key)),
  })).reverse();
  const selectedRangePath = `${smoothPath(selectedRangeUpper)} ${smoothPath(selectedRangeLower, "L")} Z`;
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
          <h2 className="font-serif text-[26px] font-bold leading-tight text-starlight sm:text-5xl">年間運勢グラフ（{activeYear}年）</h2>
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
        <path d={selectedRangePath} fill={selectedSeries.color} opacity="0.14" />
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
        <foreignObject x={clamp(tooltipX + 12, CHART.left, CHART.width - 190)} y={clamp(tooltipY - 78, 20, CHART.height - 154)} width="170" height="132">
          <div
            className="rounded-lg bg-[#1a1c1c]/80 p-3 backdrop-blur"
            style={{
              border: `1px solid ${selectedSeries.color}66`,
              boxShadow: `0 0 22px ${selectedSeries.color}1f`,
            }}
          >
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: selectedSeries.color }}>{MONTH_LABELS[selectedMonth]}</p>
            <p className="mt-1 font-serif text-xl font-semibold text-starlight">{selectedSeries.label}</p>
            <p className="font-serif text-2xl text-starlight">{formatScore(selectedScore)}</p>
            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-white/10 pt-2 font-mono text-[10px] font-bold text-mist">
              <span>上振れ <strong className="text-starlight">{formatScore(selectedHighScore)}</strong></span>
              <span>下振れ <strong className="text-starlight">{formatScore(selectedLowScore)}</strong></span>
            </div>
          </div>
        </foreignObject>
        {MONTH_LABELS.map((month, index) => (
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
          月間運勢グラフ（{selectedMonth + 1}月）
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

function monthlyPeakPeriodsForMonth(forecast, year, monthIndexValue) {
  const key = `${year}-${String(monthIndexValue + 1).padStart(2, "0")}`;
  const source = forecast?.monthly_peak_periods || forecast?.monthlyPeakPeriods || {};
  return Object.fromEntries(MONTHLY_PEAK_CATEGORIES.map(({ key: category }) => [
    category,
    (Array.isArray(source?.[category]) ? source[category] : [])
      .filter((period) => String(period?.start_date || period?.startDate || "").slice(0, 7) === key)
      .sort((first, second) => (
        Number(second?.activation || 0) + Number(second?.caution || 0)
        - Number(first?.activation || 0) - Number(first?.caution || 0)
      )),
  ]));
}

function peakPeriodDate(value) {
  const text = String(value || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text.slice(5).replace("-", "/") : "";
}

function PeakMeter({ label, value, color }) {
  const numericValue = Number(value || 0);
  const width = Math.max(0, Math.min(100, (numericValue / 16) * 100));
  return (
    <div className="grid grid-cols-[44px_minmax(0,1fr)_32px] items-center gap-2 text-[10px] sm:grid-cols-[52px_minmax(0,1fr)_38px] sm:text-xs">
      <span className="font-mono font-bold text-mist">{label}</span>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10" aria-label={`${label} ${numericValue}`}>
        <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${width}%`, backgroundColor: color }} />
      </div>
      <span className="text-right font-mono font-bold text-starlight">{numericValue}</span>
    </div>
  );
}

function MonthlyPeakDetailTable({ forecast, activeYear, selectedMonth }) {
  const periodByCategory = useMemo(
    () => monthlyPeakPeriodsForMonth(forecast, activeYear, selectedMonth),
    [forecast, activeYear, selectedMonth]
  );

  return (
    <GlassPanel className="border-gold/25 p-3 sm:p-6">
      <div className="flex items-baseline justify-between gap-3 border-b border-white/10 pb-3 sm:pb-4">
        <h2 className="font-serif text-xl font-semibold text-gold sm:text-3xl">月間ピーク詳細</h2>
        <span className="font-mono text-[10px] font-bold text-mist sm:text-xs">{MONTH_LABELS[selectedMonth]}</span>
      </div>
      <div className="divide-y divide-white/10">
        {MONTHLY_PEAK_CATEGORIES.map(({ key, label, Icon, color }) => {
          const period = periodByCategory[key]?.[0] || null;
          const factors = Array.isArray(period?.factors) ? period.factors.slice(0, 4) : [];
          const startDate = peakPeriodDate(period?.start_date || period?.startDate);
          const endDate = peakPeriodDate(period?.end_date || period?.endDate);
          const periodLabel = startDate && endDate ? `${startDate} - ${endDate}` : "大きな山は少なめ";
          return (
            <article key={key} className="grid gap-3 py-4 sm:py-5 lg:grid-cols-[150px_minmax(210px,0.8fr)_150px_minmax(0,1.45fr)] lg:items-start lg:gap-5">
              <div className="flex min-w-0 items-center gap-2">
                <span className="grid size-8 shrink-0 place-items-center rounded-md border border-white/10 bg-white/[0.04]" style={{ color }}>
                  <Icon size={16} aria-hidden="true" />
                </span>
                <h3 className="font-serif text-base font-semibold text-starlight sm:text-lg">{label}</h3>
              </div>
              <div className="grid gap-2">
                <PeakMeter label="活性度" value={period?.activation || 0} color={color} />
                <PeakMeter label="注意度" value={period?.caution || 0} color="#f59e71" />
              </div>
              <div className="min-w-0">
                <p className="font-mono text-[10px] font-bold text-mist">主要期間</p>
                <p className="mt-1 font-mono text-xs font-bold text-starlight sm:text-sm">{periodLabel}</p>
                {period?.peak_date ? <p className="mt-1 text-[10px] text-mist">山場 {peakPeriodDate(period.peak_date)}</p> : null}
              </div>
              <div className="min-w-0">
                {factors.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {factors.map((factor, index) => {
                      const factorLabel = typeof factor === "string" ? factor : factor?.label;
                      const tone = String(typeof factor === "string" ? "" : factor?.tone || "").toLowerCase();
                      const cautionTone = ["caution", "heavy", "review"].includes(tone);
                      return factorLabel ? (
                        <span
                          key={`${factorLabel}-${index}`}
                          className={cx(
                            "max-w-full truncate rounded px-2 py-1 font-mono text-[9px] font-bold sm:text-[10px]",
                            cautionTone ? "bg-[#f59e71]/15 text-[#ffc2a1]" : "bg-white/[0.07] text-starlight"
                          )}
                          title={factorLabel}
                        >
                          {factorLabel}
                        </span>
                      ) : null;
                    })}
                  </div>
                ) : null}
                <p className="mt-2 text-sm leading-6 text-starlight sm:text-[15px]">{period?.summary || "大きな山は少なめ。日々のペースを整える月です。"}</p>
                {period?.caution_text ? <p className="mt-1 text-xs leading-5 text-[#ffc2a1]">{period.caution_text}</p> : null}
              </div>
            </article>
          );
        })}
      </div>
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
                <th key={day.date || index} className="px-1 py-2 text-right">
                  <span className="inline-flex h-8 w-full min-w-[34px] items-center justify-end px-1 sm:h-10 sm:px-2">
                    {Number(String(day.date || "").slice(8, 10)) || index + 1}
                  </span>
                </th>
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
              {MONTH_LABELS.map((month) => (
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

function Matrix({
  data,
  selectedSeriesKey,
  setSelectedSeriesKey,
  selectedMonthIndex,
  setSelectedMonthIndex,
  forecast,
  activeYear,
  showTransitMap = true,
  variant = "full",
  selectedDayIndex: controlledSelectedDayIndex = null,
  setSelectedDayIndex: controlledSetSelectedDayIndex = null,
}) {
  const [analysisMode, setAnalysisMode] = useState("overview");
  const [openMonthlyAspectKeys, setOpenMonthlyAspectKeys] = useState(() => new Set());
  const selectedMonth = clamp(selectedMonthIndex, 0, data.length - 1);
  const dailyData = useMemo(() => dailyDataForMonth(forecast, activeYear, selectedMonth), [forecast, activeYear, selectedMonth]);
  const [localSelectedDayIndex, setLocalSelectedDayIndex] = useState(() => realtimeDayIndex(dailyData));
  const selectedDayIndex = controlledSelectedDayIndex ?? localSelectedDayIndex;
  const setSelectedDayIndex = controlledSetSelectedDayIndex ?? setLocalSelectedDayIndex;
  const dailyDateRange = `${dateKey(dailyData[0]?.date)}:${dateKey(dailyData[dailyData.length - 1]?.date)}:${dailyData.length}`;
  useEffect(() => {
    if (controlledSelectedDayIndex == null) {
      setLocalSelectedDayIndex(realtimeDayIndex(dailyData));
    }
  }, [controlledSelectedDayIndex, dailyDateRange, selectedMonth]);
  const safeSelectedDayIndex = clamp(selectedDayIndex, 0, dailyData.length - 1);
  const selectedDay = data[selectedMonth] || data[0];
  const selectedSeries = SCORE_KEYS.find((item) => item.key === selectedSeriesKey) || SCORE_KEYS[0];
  const sunThemeItems = monthlyItems(monthlyThemeItemsFromForecast(forecast, "monthly_sun_themes"), activeYear, selectedMonth);
  const marsThemeItems = monthlyItems(monthlyThemeItemsFromForecast(forecast, "monthly_mars_themes"), activeYear, selectedMonth);
  const sunAspectItems = monthlyItems(sunAspectItemsFromForecast(forecast), activeYear, selectedMonth);
  const marsAspectItems = monthlyItems(marsAspectItemsFromForecast(forecast), activeYear, selectedMonth);
  const monthlyOverview = useMemo(
    () => monthlyOverviewForDay(
      forecast,
      activeYear,
      selectedMonth,
      dailyData[safeSelectedDayIndex] || dailyData[0],
    ),
    [forecast, activeYear, selectedMonth, dailyData, safeSelectedDayIndex]
  );
  const activeAnalysisMode = analysisMode === "overview" && !monthlyOverview ? "theme" : analysisMode;
  const modeTitle = {
    overview: `${selectedMonth + 1}月の総評`,
    theme: "今月のテーマ",
    lesson: "今月のアクション",
    test1: "太陽の時期",
    test2: "火星の時期",
  }[activeAnalysisMode] || "今月のテーマ";
  const modeKicker = activeAnalysisMode === "overview" ? "Monthly Overview" : "Main Theme";
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
  const leadContent = (
    <>
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
      <GlassPanel variant="text" className="flex h-[520px] flex-col overflow-hidden border-gold/25 p-2 sm:h-[560px] sm:p-5 lg:h-[620px] lg:p-6">
        <div className="flex items-start justify-between gap-2 sm:items-center sm:gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[8px] font-bold uppercase tracking-[0.18em] text-gold/75 sm:text-[9px]">
              {modeKicker}
            </p>
            <h2 className="mt-1 break-words font-serif text-[17px] font-semibold leading-tight text-starlight sm:text-3xl">
              {modeTitle}
            </h2>
          </div>
          <div className="ml-auto flex w-fit max-w-full shrink-0 rounded-full border border-white/10 bg-white/[0.04] p-1 font-mono text-[7px] font-bold text-mist sm:text-[10px]">
            {[
              ...(monthlyOverview ? [["overview", "総評"]] : []),
              ["theme", "テーマ"],
              ["lesson", "アクション"],
              ["test1", "太陽時期"],
              ["test2", "火星時期"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setAnalysisMode(value)}
                className={cx(
                  "rounded-full px-1.5 py-1.5 transition sm:px-3",
                  activeAnalysisMode === value ? "bg-gold text-[#241a00]" : "hover:bg-white/10 hover:text-starlight"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 h-px bg-white/10 sm:mt-5" />
        {activeAnalysisMode === "overview" ? (
          <MonthlyOverviewContent overview={monthlyOverview} />
        ) : null}
        {activeAnalysisMode === "theme" ? (
          <MonthlyArticleList items={sunThemeItems.length ? sunThemeItems : fallbackItems} />
        ) : null}
        {activeAnalysisMode === "lesson" ? (
          <MonthlyArticleList items={marsThemeItems.length ? marsThemeItems : fallbackItems} />
        ) : null}
        {activeAnalysisMode === "test1" ? (
          <TransitAspectList items={sunAspectItems} openKeys={openMonthlyAspectKeys} onToggle={toggleMonthlyAspect} prefix="monthly-sun" />
        ) : null}
        {activeAnalysisMode === "test2" ? (
          <TransitAspectList items={marsAspectItems} openKeys={openMonthlyAspectKeys} onToggle={toggleMonthlyAspect} prefix="monthly-mars" />
        ) : null}
      </GlassPanel>
    </>
  );
  const restContent = (
    <>
      {showTransitMap ? (
        <TransitNatalSunMap
          day={dailyData[safeSelectedDayIndex] || dailyData[0]}
          forecast={forecast}
          availableDays={dailyData}
          selectedDayIndex={safeSelectedDayIndex}
          onSelectDayIndex={setSelectedDayIndex}
        />
      ) : null}
      <MonthlyChart
        dailyData={dailyData}
        selectedSeriesKey={selectedSeriesKey}
        setSelectedSeriesKey={setSelectedSeriesKey}
        selectedDayIndex={safeSelectedDayIndex}
        setSelectedDayIndex={setSelectedDayIndex}
        activeYear={activeYear}
        selectedMonth={selectedMonth}
      />
      <MonthlyPeakDetailTable
        forecast={forecast}
        activeYear={activeYear}
        selectedMonth={selectedMonth}
      />
      <MonthlyScoreMatrix dailyData={dailyData} selectedSeriesKey={selectedSeriesKey} selectedDayIndex={safeSelectedDayIndex} />
    </>
  );

  if (variant === "lead") {
    return <div className="grid gap-4 sm:gap-7">{leadContent}</div>;
  }
  if (variant === "rest") {
    return <div className="grid gap-4 sm:gap-7">{restContent}</div>;
  }

  return (
    <div className="grid gap-4 sm:gap-7">
      {leadContent}
      {restContent}
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
            compact ? "top-1 h-2 w-2 sm:top-1.5 sm:h-3 sm:w-3" : "top-0.5 h-3 w-3"
          )} style={{ color: item.color, backgroundColor: item.color }} />
          <span className={cx(
            "absolute w-px bg-white/15",
            compact ? "bottom-0 left-[3px] top-3.5 sm:left-[5px] sm:top-5" : "left-[5px] top-4 h-full"
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
            <article key={`${prefix}-${item.key}-${item.startDate}`} className="shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.022]">
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
      value: MONTH_LABELS[monthIndex(stats.peak?.date)],
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
  const [forecast, setForecast] = useState(() => getForecast() || null);
  const [readingPayload, setReadingPayload] = useState(() => getStoredReadingResult({ allowStale: true }) || {});
  const [readingStorageHydrated, setReadingStorageHydrated] = useState(forceRefresh);
  const activeYear = forecastYear(forecast);
  const [yearDialogOpen, setYearDialogOpen] = useState(false);
  const [targetYear, setTargetYear] = useState(String(activeYear));
  const [calculatingYear, setCalculatingYear] = useState(false);
  const [yearCalculationError, setYearCalculationError] = useState("");
  const [deferredContentLoading, setDeferredContentLoading] = useState(false);
  const [deferredContentError, setDeferredContentError] = useState("");
  const [forecastDetailLoadingKeys, setForecastDetailLoadingKeys] = useState(() => new Set());
  const [forecastDetailError, setForecastDetailError] = useState("");
  const forecastDetailRequestsRef = React.useRef(new Set());
  const [latestUpdateError, setLatestUpdateError] = useState("");
  const [refreshingLatest, setRefreshingLatest] = useState(false);
  const [versionState, setVersionState] = useState({
    checking: true,
    currentMasterVersion: "",
    savedMasterVersion: payloadMasterVersion(getStoredReadingResult({ allowStale: true }) || {}),
    isOutdated: false,
    currentAppAsset: "",
    latestAppAsset: "",
    isAppOutdated: false,
    error: "",
  });
  useEffect(() => {
    if (forceRefresh) {
      return () => {};
    }
    let active = true;
    getStoredReadingResultAsync({ allowStale: true })
      .then((payload) => {
        const indexedForecast = payload?.yearly_forecast || payload?.yearlyForecast || null;
        if (active && payload) {
          setReadingPayload(payload);
          if (indexedForecast) {
            setForecast(indexedForecast);
          }
        }
      })
      .finally(() => {
        if (active) {
          setReadingStorageHydrated(true);
        }
      });
    return () => {
      active = false;
    };
  }, [forceRefresh]);
  const storedDashboard = readingPayload?.dashboard_data || readingPayload?.dashboardData || {};
  const needsDeferredWidgets = readingStorageHydrated && !forceRefresh && storedDashboard?.deferred_widgets_pending === true;
  const needsInitialForecast = readingStorageHydrated
    && !forceRefresh
    && (
      !forecast
      || !hasAnnualAspectGenreDescriptions(forecast)
    );
  useEffect(() => {
    if (!needsDeferredWidgets && !needsInitialForecast) {
      return () => {};
    }
    const formPayload = getQueryReadingForm() || getStoredReadingForm();
    if (!formPayload) {
      setDeferredContentError("保存済みの出生情報がないため、追加データを取得できません。入力画面から再計算してください。");
      return () => {};
    }

    let active = true;
    setDeferredContentLoading(true);
    setDeferredContentError("");
    const widgetRequest = needsDeferredWidgets
      ? postJson("/api/readings/deferred", formPayload)
      : Promise.resolve(null);
    const forecastRequest = needsInitialForecast
      ? postJson(`/api/yearly-forecast?year=${activeYear}`, formPayload)
      : Promise.resolve(null);

    Promise.allSettled([widgetRequest, forecastRequest])
      .then(async ([widgetResult, forecastResult]) => {
        if (!active) return;
        const storedPayload = await getStoredReadingResultAsync({ allowStale: true });
        if (!active) return;
        let nextPayload = { ...(storedPayload || readingPayload || {}) };
        let nextForecast = forecast;
        let changed = false;
        const errors = [];

        if (needsDeferredWidgets) {
          if (widgetResult.status === "fulfilled") {
            const deferredDashboard = widgetResult.value?.dashboard_data || {};
            nextPayload = {
              ...nextPayload,
              dashboard_data: {
                ...(nextPayload.dashboard_data || nextPayload.dashboardData || {}),
                ...deferredDashboard,
                deferred_widgets_pending: false,
              },
            };
            changed = true;
          } else {
            errors.push(`追加ウィジェットの取得に失敗しました: ${readableErrorMessage(widgetResult.reason, "API通信に失敗しました")}`);
          }
        }

        if (needsInitialForecast) {
          if (forecastResult.status === "fulfilled") {
            nextForecast = forecastWithSelectedYear(forecastResult.value, activeYear);
            nextPayload = { ...nextPayload, yearly_forecast: nextForecast };
            changed = true;
          } else {
            errors.push(`年間予測の取得に失敗しました: ${readableErrorMessage(forecastResult.reason, "API通信に失敗しました")}`);
          }
        }

        if (changed) {
          await storeReadingResult(nextPayload);
          if (!active) return;
          setReadingPayload(nextPayload);
          if (nextForecast) {
            setForecast(nextForecast);
          }
        }
        setDeferredContentError(errors.join(" / "));
      })
      .catch((error) => {
        if (active) {
          setDeferredContentError(readableErrorMessage(error, "追加データの取得に失敗しました。"));
        }
      })
      .finally(() => {
        if (active) {
          setDeferredContentLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [activeYear, forceRefresh, needsDeferredWidgets, needsInitialForecast]);
  useEffect(() => {
    let active = true;
    Promise.allSettled([
      getJson("/api/master-version"),
      fetchFrontendVersionState(),
    ])
      .then(([masterResult, frontendResult]) => {
        if (!active) return;
        const masterPayload = masterResult.status === "fulfilled" ? masterResult.value : null;
        const frontendPayload = frontendResult.status === "fulfilled" ? frontendResult.value : {};
        const currentMasterVersion = versionFromPayload(masterPayload);
        const savedMasterVersion = payloadMasterVersion(readingPayload);
        const error = masterResult.status === "rejected" && frontendResult.status === "rejected"
          ? "更新確認に失敗しました。再読み込み後に再確認してください。"
          : "";
        setVersionState({
          checking: false,
          currentMasterVersion,
          savedMasterVersion,
          isOutdated: Boolean(currentMasterVersion && currentMasterVersion !== savedMasterVersion),
          currentAppAsset: frontendPayload.currentAppAsset || "",
          latestAppAsset: frontendPayload.latestAppAsset || "",
          isAppOutdated: Boolean(frontendPayload.isAppOutdated),
          error,
        });
      })
      .catch((error) => {
        if (!active) return;
        setVersionState((current) => ({
          ...current,
          checking: false,
          error: readableErrorMessage(error, "更新確認に失敗しました。"),
        }));
      });
    return () => {
      active = false;
    };
  }, [readingPayload]);
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
        const selectedYearForecast = forecastWithSelectedYear(nextForecast, activeYear);
        setForecast(selectedYearForecast);
        setSelectedMonthIndex(realtimeMonthIndex(monthlyData(selectedYearForecast, false)));
        setSelectedMonthlyMonthIndex(workdayMonthIndex());
        const storedPayload = await getStoredReadingResultAsync({ allowStale: true });
        const nextPayload = {
          ...(storedPayload || {}),
          yearly_forecast: selectedYearForecast,
        };
        await storeReadingResult(nextPayload);
        setReadingPayload(nextPayload);
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
  const data = useMemo(() => monthlyData(forecast, false), [forecast]);
  const stats = useMemo(() => aggregateStats(data), [data]);
  const [selectedSeriesKey, setSelectedSeriesKey] = useState("general");
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(() => realtimeMonthIndex(data));
  const [selectedMonthlyMonthIndex, setSelectedMonthlyMonthIndex] = useState(workdayMonthIndex);
  const [activeView, setActiveView] = useState("unified");
  const [activeUnifiedView, setActiveUnifiedView] = useState("daily");
  const [dailyOverviewDate, setDailyOverviewDate] = useState(() => currentTokyoDate());
  const requestForecastDetail = React.useCallback(async (scope, options = {}) => {
    const detailKey = scope === "day"
      ? `day:${dateKey(options.date)}`
      : scope === "month"
        ? `month:${Number(options.month)}`
        : "annual";
    if (forecastDetailRequestsRef.current.has(detailKey)) return;
    const formPayload = getQueryReadingForm() || getStoredReadingForm();
    if (!formPayload) {
      setForecastDetailError("保存済みの出生情報がないため、詳細データを取得できません。");
      return;
    }
    const params = new URLSearchParams({ year: String(activeYear), scope });
    if (scope === "day") params.set("date", dateKey(options.date));
    if (scope === "month") params.set("month", String(Number(options.month)));
    forecastDetailRequestsRef.current.add(detailKey);
    setForecastDetailLoadingKeys((current) => new Set([...current, detailKey]));
    setForecastDetailError("");
    try {
      const detail = await postJson(`/api/yearly-forecast/detail?${params.toString()}`, formPayload);
      setForecast((current) => mergeYearlyForecastDetail(current, detail));
    } catch (error) {
      setForecastDetailError(readableErrorMessage(error, "年間予測の詳細取得に失敗しました。"));
    } finally {
      forecastDetailRequestsRef.current.delete(detailKey);
      setForecastDetailLoadingKeys((current) => {
        const next = new Set(current);
        next.delete(detailKey);
        return next;
      });
    }
  }, [activeYear]);
  const requestForecastDayDetail = React.useCallback((value) => {
    requestForecastDetail("day", { date: value });
  }, [requestForecastDetail]);
  const dailyOverviewDateMatch = String(dailyOverviewDate || "").match(/^(\d{4})-(\d{2})/);
  const dailyOverviewYear = dailyOverviewDateMatch ? Number(dailyOverviewDateMatch[1]) : activeYear;
  const dailyOverviewMonth = dailyOverviewDateMatch ? Number(dailyOverviewDateMatch[2]) : 0;
  const dailyMonthlyOverviewPending = Boolean(
    readingStorageHydrated
    && forecast
    && dailyOverviewMonth >= 1
    && dailyOverviewMonth <= 12
    && !hasMonthlyOverviewMonth(forecast, dailyOverviewYear, dailyOverviewMonth - 1)
  );
  useEffect(() => {
    if (dailyMonthlyOverviewPending) {
      requestForecastDetail("month", { month: dailyOverviewMonth });
    }
  }, [dailyMonthlyOverviewPending, dailyOverviewMonth, requestForecastDetail]);
  useEffect(() => {
    if (!forecast || activeUnifiedView !== "monthly") return;
    const month = selectedMonthlyMonthIndex + 1;
    if (!yearlyMonthDetailLoaded(forecast, month)) {
      requestForecastDetail("month", { month });
    }
  }, [activeUnifiedView, forecast, requestForecastDetail, selectedMonthlyMonthIndex]);
  useEffect(() => {
    if (!forecast || activeUnifiedView !== "annual" || yearlyAnnualDetailLoaded(forecast)) return;
    requestForecastDetail("annual");
  }, [activeUnifiedView, forecast, requestForecastDetail]);
  const annualTransitDays = useMemo(
    () => dailyDataForYear(forecast, activeYear),
    [forecast, activeYear]
  );
  const [selectedAnnualDayIndex, setSelectedAnnualDayIndex] = useState(() => realtimeDayIndex(annualTransitDays));
  const annualTransitDateRange = `${dateKey(annualTransitDays[0]?.date)}:${dateKey(annualTransitDays[annualTransitDays.length - 1]?.date)}:${annualTransitDays.length}`;
  useEffect(() => {
    setSelectedAnnualDayIndex(realtimeDayIndex(annualTransitDays));
  }, [annualTransitDateRange]);
  const annualTransitDayIndex = clamp(selectedAnnualDayIndex, 0, Math.max(0, annualTransitDays.length - 1));
  const dailyDetailData = useMemo(() => {
    const storedPayload = readingPayload || {};
    const sourceDashboard = storedPayload.dashboard_data || storedPayload.dashboardData || {};
    const hasStoredDashboard = Boolean(storedPayload.dashboard_data || storedPayload.dashboardData);
    return {
      ...sourceDashboard,
      is_loading: !readingStorageHydrated || (needsDeferredWidgets && deferredContentLoading),
      readings: storedPayload.readings || sourceDashboard.readings || [],
      meta: storedPayload.meta || sourceDashboard.meta || {},
      chart_data: storedPayload.chart_data || storedPayload.chartData || sourceDashboard.chart_data || {},
      yearly_forecast: forecast || storedPayload.yearly_forecast || storedPayload.yearlyForecast || sourceDashboard.yearly_forecast || null,
      monthly_overview_loading: !readingStorageHydrated || (
        (needsInitialForecast || dailyMonthlyOverviewPending)
        && !deferredContentError
        && !forecastDetailError
      ),
      reading_date:
        hasStoredDashboard
          ? (
              sourceDashboard.reading_date ||
              sourceDashboard.readingDate ||
              storedPayload.meta?.reading_date ||
              storedPayload.meta?.date ||
              ""
            )
          : "",
    };
  }, [
    deferredContentError,
    deferredContentLoading,
    forecast,
    forecastDetailError,
    dailyMonthlyOverviewPending,
    needsDeferredWidgets,
    needsInitialForecast,
    readingPayload,
    readingStorageHydrated,
  ]);
  const handleRefreshLatest = async () => {
    if (!versionState.isOutdated || refreshingLatest) {
      return;
    }
    const formPayload = getQueryReadingForm() || getStoredReadingForm();
    if (!formPayload) {
      setLatestUpdateError("保存済みの出生情報がないため、最新版に更新できません。入力画面から再計算してください。");
      return;
    }

    setRefreshingLatest(true);
    setLatestUpdateError("");
    setDeferredContentError("");
    try {
      const nextReading = await postJson("/api/readings?defer_widgets=true", formPayload).catch((error) => {
        throw new Error(`ホロスコープの再計算に失敗しました: ${readableErrorMessage(error, "API通信に失敗しました")}`);
      });
      const nextForecastPayload = await postJson(`/api/yearly-forecast?year=${activeYear}`, formPayload).catch((error) => {
        throw new Error(`年次予測の再計算に失敗しました: ${readableErrorMessage(error, "API通信に失敗しました")}`);
      });
      const selectedYearForecast = forecastWithSelectedYear(nextForecastPayload, activeYear);
      const masterVersion = versionFromPayload(nextReading) || versionFromPayload(nextForecastPayload);
      if (!masterVersion) {
        throw new Error("再計算結果に最新版データのバージョン情報がありません。");
      }
      const nextPayload = {
        ...nextReading,
        master_version: masterVersion,
        masterVersion,
        yearly_forecast: {
          ...selectedYearForecast,
          master_version: masterVersion,
          masterVersion,
        },
      };
      await storeReadingResult(nextPayload);
      setReadingPayload(nextPayload);
      setForecast(selectedYearForecast);
      setSelectedMonthIndex(realtimeMonthIndex(monthlyData(selectedYearForecast, false)));
      setSelectedMonthlyMonthIndex(workdayMonthIndex());
      setVersionState({
        checking: false,
        currentMasterVersion: masterVersion,
        savedMasterVersion: masterVersion,
        isOutdated: false,
        currentAppAsset: versionState.currentAppAsset || "",
        latestAppAsset: versionState.latestAppAsset || "",
        isAppOutdated: false,
        error: "",
      });
    } catch (error) {
      setLatestUpdateError(readableErrorMessage(error, "最新版への更新に失敗しました。"));
    } finally {
      setRefreshingLatest(false);
    }
  };
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
      const selectedYearForecast = forecastWithSelectedYear(nextForecast, normalizedYear);
      setForecast(selectedYearForecast);
      setSelectedMonthIndex(realtimeMonthIndex(monthlyData(selectedYearForecast, false)));
      setSelectedMonthlyMonthIndex(workdayMonthIndex());

      const storedPayload = await getStoredReadingResultAsync({ allowStale: true });
      const nextPayload = {
        ...(storedPayload || {}),
        yearly_forecast: selectedYearForecast,
      };
      await storeReadingResult(nextPayload);
      setReadingPayload(nextPayload);
      setYearDialogOpen(false);
    } catch (error) {
      setYearCalculationError(readableErrorMessage(error, "年間予測の計算に失敗しました。"));
    } finally {
      setCalculatingYear(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden text-starlight">
      <Header
        activeYear={activeYear}
        activeView={activeView}
        setActiveView={setActiveView}
        forecast={forecast}
        readingPayload={readingPayload}
        dashboardData={dailyDetailData}
        versionState={versionState}
        onRefreshLatest={handleRefreshLatest}
        refreshingLatest={refreshingLatest}
      />
      <main className="mx-auto grid max-w-none gap-3 px-0.5 pb-4 pt-[56px] sm:gap-6 sm:px-4 sm:pb-10 sm:pt-36 lg:px-6 lg:pb-20 lg:pt-[136px]">
        {yearCalculationError ? (
          <div className="rounded-2xl border border-[#ffb4ab]/30 bg-[#3a1d1d]/45 px-4 py-3 text-xs leading-6 text-[#ffb4ab] sm:text-sm">
            {yearCalculationError}
          </div>
        ) : null}
        {latestUpdateError ? (
          <div className="rounded-2xl border border-[#ffb4ab]/30 bg-[#3a1d1d]/45 px-4 py-3 text-xs leading-6 text-[#ffb4ab] sm:text-sm">
            {latestUpdateError}
          </div>
        ) : null}
        {deferredContentError ? (
          <div className="rounded-2xl border border-[#ffb4ab]/30 bg-[#3a1d1d]/45 px-4 py-3 text-xs leading-6 text-[#ffb4ab] sm:text-sm">
            {deferredContentError}
          </div>
        ) : null}
        {forecastDetailError ? (
          <div className="rounded-2xl border border-[#ffb4ab]/30 bg-[#3a1d1d]/45 px-4 py-3 text-xs leading-6 text-[#ffb4ab] sm:text-sm">
            {forecastDetailError}
          </div>
        ) : null}
        {deferredContentLoading ? (
          <GlassPanel className="p-4 text-center font-mono text-xs font-bold uppercase tracking-[0.18em] text-mist">
            年間予測と追加ウィジェットを読み込み中...
          </GlassPanel>
        ) : null}
        {forceRefresh && calculatingYear && !forecast ? (
          <GlassPanel className="p-6 text-center font-mono text-xs font-bold uppercase tracking-[0.18em] text-mist">
            年間予測を再計算中...
          </GlassPanel>
        ) : null}
        {activeView === "unified" ? (
          <UnifiedForecastView
            data={data}
            stats={stats}
            forecast={forecast}
            activeYear={activeYear}
            dailyDetailData={dailyDetailData}
            selectedSeriesKey={selectedSeriesKey}
            setSelectedSeriesKey={setSelectedSeriesKey}
            selectedMonthlyMonthIndex={selectedMonthlyMonthIndex}
            setSelectedMonthlyMonthIndex={setSelectedMonthlyMonthIndex}
            selectedMonthIndex={selectedMonthIndex}
            setSelectedMonthIndex={setSelectedMonthIndex}
            annualTransitDays={annualTransitDays}
            annualTransitDayIndex={annualTransitDayIndex}
            setSelectedAnnualDayIndex={setSelectedAnnualDayIndex}
            onOpenYearDialog={() => setYearDialogOpen(true)}
            activeUnifiedView={activeUnifiedView}
            setActiveUnifiedView={setActiveUnifiedView}
            detailLoadingKeys={forecastDetailLoadingKeys}
            onRequestDayDetail={requestForecastDayDetail}
            onDailyDisplayDateChange={setDailyOverviewDate}
          />
        ) : null}
        {activeView === "horoscope" ? (
          <ForecastGalaxyBackground innerClassName="block">
            <div className="-mx-5 -my-5 md:-mx-8 lg:-mx-14">
              <DashboardV2HoroscopePage data={dailyDetailData} />
            </div>
          </ForecastGalaxyBackground>
        ) : null}
      </main>
      <footer className="border-t border-slate-200/90 bg-[#f8fafc]/95 px-4 py-8 text-[#0A192F] sm:px-8 sm:py-10">
        <div className="mx-auto flex max-w-[1540px] flex-col gap-4 text-[#0A192F]/70 md:flex-row md:items-center md:justify-between">
          <p className="font-serif text-2xl font-semibold text-[#0A192F]">The Celestial Atelier</p>
          <a href="/" className="font-mono text-xs uppercase tracking-[0.18em] text-[#0A192F]/70 hover:text-[#D4AF37]">Back to Entry</a>
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

