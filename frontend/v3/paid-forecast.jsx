// Main paid views, loaded only after the V3 session gate.
import { TransitNatalSunMap, Horoscope3DMap } from "./horoscope-map.jsx";
import { getJson, postJson, requestJson, formatApiError, resolveApiBaseUrl, getQueryReadingForm, reloadCsvMasters } from "./api.mjs";
import { useAccess } from "./access-context.jsx";
import { featurePolicy } from "./feature-policy.mjs";
import React, { useEffect, useMemo, useState } from "react";

import { Activity, BriefcaseBusiness, CalendarDays, ChevronDown, CircleDot, HandHeart, LockKeyhole, Maximize2, Menu, Minimize2, Minus, Move, Pause, Play, Plus, RefreshCw, Shield, SlidersHorizontal, Sparkles, WalletCards } from "lucide-react";

import {
  currentLocalDate,
  getStoredReadingForm,
  getStoredReadingResult,
  getStoredReadingResultAsync,
  normalizeReadingRequest,
  storedMasterVersion,
  storeReadingResult,
} from "./reading-storage.js";

import {
  DashboardDailyDetailContentLayer,
  DashboardV2HoroscopePage,
  dashboardData as fallbackDashboardData,
} from "./dashboard-shared.jsx";

import { readableErrorMessage } from "../src/error-message.mjs";

import { createSingleFlightRequester, retryTransientRequest } from "../src/request-control.mjs";

import { MonthlyOverviewContent } from "../src/monthly-overview-content.jsx";

import { hasMonthlyOverviewMonth, monthlyOverviewForDay } from "../src/monthly-overview.mjs";

import forecastGalaxyBg from "../src/assets/daily-detail-galaxy-bg.jpg";

const IS_TEST_VERSION = /(?:^|\/)forecast-detail-v2\.html$/.test(window.location.pathname);

const APP_BRAND = IS_TEST_VERSION
  ? "The Celestial Atelier テストversion"
  : "The Celestial Atelier";

const ENTRY_PAGE_PATH = "/entry.html";

const runYearlyForecastSingleFlight = createSingleFlightRequester();

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const MONTH_LABELS = Array.from({ length: 12 }, (_, index) => `${index + 1}月`);

const SCORE_KEYS = [
  { key: "general", label: "全般・健康", color: "#43c5c7" },
  { key: "work", label: "仕事", color: "#7ba7ff" },
  { key: "love", label: "恋愛・対人", color: "#ff8b84" },
  { key: "money", label: "お金", color: "#f2c14e" },
];

const ANNUAL_GENRE_ASPECT_MIN_COMPONENT_SCORE = 55;

const ANNUAL_GENERAL_ASPECT_MIN_COMPONENT_SCORE = 65;

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
  NORTH_NODE: "☊",
  SOUTH_NODE: "☋",
};

function cx(...values) {
  return values.filter(Boolean).join(" ");
}

function requestYearlyForecast(payload, year, { retryTransient = false } = {}) {
  const normalizedPayload = payload?.birth_date ? normalizeReadingRequest(payload) : payload;
  const requestKey = `${Number(year)}:${JSON.stringify(normalizedPayload || {})}`;
  const request = () => runYearlyForecastSingleFlight(
    requestKey,
    () => postJson(`/api/yearly-forecast?year=${year}`, normalizedPayload),
  );
  return retryTransient ? retryTransientRequest(request) : request();
}

function postJsonWithTransientRetry(path, payload) {
  return retryTransientRequest(() => postJson(path, payload));
}

function shouldForceRefresh() {
  try {
    const url = new URL(window.location.href);
    return url.searchParams.get("refresh") === "1";
  } catch {
    return false;
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

const MONTHLY_PEAK_CATEGORIES = [
  { key: "general_health", label: "一般・健康", Icon: Activity, color: "#43c5c7" },
  { key: "work", label: "仕事", Icon: BriefcaseBusiness, color: "#7ba7ff" },
  { key: "love", label: "恋愛・対人", Icon: HandHeart, color: "#ff8b84" },
  { key: "money", label: "金運", Icon: WalletCards, color: "#f2c14e" },
];

function annualAspectGenreDescriptions(event) {
  const source = event?.genre_descriptions || event?.genreDescriptions || {};
  const normalize = (value) => {
    const text = String(value || "").trim();
    return text === "-" ? "" : text;
  };
  return {
    general: normalize(
      source.general
      || source.general_health
      || event?.general_text_description
      || event?.generalHealthTextDescription
      || event?.description,
    ),
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
    general: normalize(source.general ?? source.general_health),
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
  return Object.fromEntries([["general", "general_health"], ["love", "love"], ["work", "work"], ["money", "money"]].map(([genre, sourceGenre]) => {
    const components = source?.[sourceGenre] || source?.[genre] || {};
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
      .map((value) => value === "general_health" ? "general" : value)
      .filter((value) => ["general", "love", "work", "money"].includes(value))
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
  const categories = { general: [], love: [], work: [], money: [] };
  items.forEach((item) => {
    const itemCategories = Array.isArray(item.applicableGenres)
      ? item.applicableGenres
      : annualAspectApplicableGenres(item);
    const scoreComponentsByCategory = annualAspectGenreScoreComponents(item);
    if (!itemCategories.includes("general")) {
      const generalComponents = scoreComponentsByCategory.general || {};
      if ([generalComponents.positive, generalComponents.negative].some((value) => Number.isFinite(value))) {
        itemCategories.push("general");
      }
    }
    Object.keys(categories).forEach((category) => {
      const scoreComponents = scoreComponentsByCategory[category] || {};
      const positiveImpact = scoreComponents.positive;
      const negativeImpact = scoreComponents.negative;
      const strongestImpact = Math.max(
        Number.isFinite(positiveImpact) ? positiveImpact : -Infinity,
        Number.isFinite(negativeImpact) ? negativeImpact : -Infinity,
      );
      const minimumScore = category === "general"
        ? ANNUAL_GENERAL_ASPECT_MIN_COMPONENT_SCORE
        : ANNUAL_GENRE_ASPECT_MIN_COMPONENT_SCORE;
      if (
        itemCategories.includes(category)
        && Number.isFinite(strongestImpact)
        && strongestImpact >= minimumScore
      ) {
        categories[category].push({
          ...item,
          description: item.genreDescriptions?.[category] || item.description || "",
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
      annual_category_aspects: mergePeriodItems("annual_category_aspects"),
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

function monthlyData(forecast) {
  const source = Array.isArray(forecast?.yearly_data) ? forecast.yearly_data : [];
  if (!source.length) return [];
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

const MIN_FORECAST_YEAR = 1900;

const MAX_FORECAST_YEAR = 2027;

const FORECAST_YEAR_OPTIONS = Array.from(
  { length: MAX_FORECAST_YEAR - MIN_FORECAST_YEAR + 1 },
  (_, index) => MIN_FORECAST_YEAR + index
);

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
  onSelectYear,
  calculatingYear,
  activeUnifiedView,
  setActiveUnifiedView,
  onSelectUnifiedView,
  dailyViewResetKey,
  detailLoadingKeys,
  onRequestDayDetail,
  onDailyDisplayDateChange,
}) {
  const monthlyTransitDays = useMemo(
    () => dailyDataForMonth(forecast, activeYear, selectedMonthlyMonthIndex),
    [forecast, activeYear, selectedMonthlyMonthIndex]
  );
  const [selectedUnifiedMonthlyDayIndex, setSelectedUnifiedMonthlyDayIndex] = useState(() => realtimeDayIndex(monthlyTransitDays));
  const [expandedForecastMapViews, setExpandedForecastMapViews] = useState({ monthly: false, annual: false });
  const [forecastYearSelectorOpen, setForecastYearSelectorOpen] = useState(false);
  const activeForecastYearButtonRef = React.useRef(null);
  const canSelectForecastYear = activeUnifiedView !== "daily";
  const displayedForecastYear = canSelectForecastYear
    ? activeYear
    : Number(String(currentLocalDate()).slice(0, 4)) || activeYear;
  const monthlyTransitDateRange = `${dateKey(monthlyTransitDays[0]?.date)}:${dateKey(monthlyTransitDays[monthlyTransitDays.length - 1]?.date)}:${monthlyTransitDays.length}`;
  useEffect(() => {
    setSelectedUnifiedMonthlyDayIndex(realtimeDayIndex(monthlyTransitDays));
  }, [monthlyTransitDateRange]);
  useEffect(() => {
    if (forecastYearSelectorOpen) {
      activeForecastYearButtonRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
    }
  }, [forecastYearSelectorOpen]);
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
  const forecastMapIsCollapsible = activeUnifiedView === "monthly" || activeUnifiedView === "annual";
  const forecastMapIsExpanded = !forecastMapIsCollapsible || Boolean(expandedForecastMapViews[activeUnifiedView]);
  const forecastMapTitle = activeUnifiedView === "monthly" ? "今月の星の配置" : "年間の星の配置";
  const forecastMapRegionId = `forecast-${activeUnifiedView}-star-map`;
  const toggleForecastMap = () => {
    if (!forecastMapIsCollapsible) return;
    setExpandedForecastMapViews((current) => ({
      ...current,
      [activeUnifiedView]: !current[activeUnifiedView],
    }));
  };
  useEffect(() => {
    if (forecastMapIsExpanded && mapDate && forecast?.yearly_data?.length && !yearlyDayDetailLoaded(forecast, mapDate)) {
      onRequestDayDetail(mapDate);
    }
  }, [forecast, forecastMapIsExpanded, mapDate, onRequestDayDetail]);

  return (
    <ForecastGalaxyBackground>
      <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-5">
        <div className="min-w-0">
          <h2 className="font-serif text-2xl font-semibold leading-tight text-starlight sm:text-4xl">星の見通し</h2>
        </div>
        <div className="flex shrink-0 rounded-full border border-white/10 bg-white/[0.06] p-1 font-mono text-[10px] font-bold text-mist shadow-[0_10px_28px_rgba(0,0,0,0.22)] sm:text-xs">
          {UNIFIED_FORECAST_TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setForecastYearSelectorOpen(false);
                onSelectUnifiedView(item.key);
              }}
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
          <div className="relative ml-1 border-l border-white/10 pl-1">
            <button
              type="button"
              onClick={() => setForecastYearSelectorOpen((current) => !current)}
              disabled={!canSelectForecastYear}
              className={cx(
                "rounded-full px-3 py-1.5 transition",
                canSelectForecastYear
                  ? "hover:bg-white/10 hover:text-starlight"
                  : "cursor-not-allowed text-mist/45"
              )}
              aria-expanded={forecastYearSelectorOpen}
              aria-disabled={!canSelectForecastYear}
              aria-label={`${displayedForecastYear}年の表示年を変更`}
            >
              {displayedForecastYear}年
            </button>
            {forecastYearSelectorOpen && canSelectForecastYear ? (
              <div className="absolute right-0 top-[calc(100%+0.35rem)] z-30 max-h-48 w-24 overflow-y-auto rounded-xl border border-white/15 bg-[#0d1220]/95 p-1 shadow-[0_16px_38px_rgba(0,0,0,0.45)] backdrop-blur-md [scrollbar-color:#e9c349_rgba(255,255,255,0.1)] [scrollbar-width:thin]">
                {FORECAST_YEAR_OPTIONS.map((year) => (
                  <button
                    key={year}
                    ref={year === activeYear ? activeForecastYearButtonRef : undefined}
                    type="button"
                    onClick={() => {
                      setForecastYearSelectorOpen(false);
                      if (year !== activeYear) onSelectYear(year);
                    }}
                    disabled={calculatingYear}
                    className={cx(
                      "block w-full rounded-lg px-2 py-1.5 text-right font-mono text-[10px] transition sm:text-xs",
                      year === activeYear
                        ? "bg-gold text-[#241a00]"
                        : "text-mist hover:bg-white/10 hover:text-starlight disabled:cursor-wait disabled:opacity-45"
                    )}
                    aria-pressed={year === activeYear}
                  >
                    {year}年
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className={cx(activeUnifiedView === "daily" ? "block" : "hidden")}>
        <DashboardDailyDetailContentLayer
          key={`daily-${dailyViewResetKey}`}
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
      {forecastMapIsCollapsible ? (
        <button
          type="button"
          onClick={toggleForecastMap}
          className="flex w-full items-center justify-between gap-4 rounded-2xl border border-gold/25 bg-[#1a1c1c]/62 px-4 py-4 text-left shadow-[0_24px_80px_rgba(0,0,0,0.32)] backdrop-blur-xl transition hover:border-gold/45 hover:bg-[#222424]/72 focus:outline-none focus:ring-2 focus:ring-gold/45 sm:px-6 sm:py-5"
          aria-expanded={forecastMapIsExpanded}
          aria-controls={forecastMapRegionId}
        >
          <span className="font-serif text-xl font-semibold text-starlight sm:text-3xl">{forecastMapTitle}</span>
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-gold" aria-hidden="true">
            {forecastMapIsExpanded ? <Minus size={18} /> : <Plus size={18} />}
          </span>
        </button>
      ) : null}
      {forecastMapIsExpanded ? (
        <div id={forecastMapRegionId}>
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
        </div>
      ) : null}
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
  const [isRefreshConfirmationVisible, setIsRefreshConfirmationVisible] = useState(false);
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
          : "最新版です";
  const isRefreshLabelVisible = isRefreshConfirmationVisible || refreshingLatest;
  const buttonLabel = refreshingLatest
    ? "最新版を取得しています"
    : isRefreshConfirmationVisible
      ? "最新版への更新を開始"
      : canRefresh
        ? "更新があります。最新版に更新ボタンを表示"
        : versionState?.error
          ? "更新確認に失敗しました"
          : isCheckingVersion
            ? "ページの読み込み完了後に更新状況を確認します"
            : "最新版です";

  useEffect(() => {
    return () => {
      if (tooltipTimerRef.current) {
        window.clearTimeout(tooltipTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!canRefresh || refreshingLatest || isCheckingVersion) {
      setIsRefreshConfirmationVisible(false);
    }
  }, [canRefresh, isCheckingVersion, refreshingLatest]);

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
    if (isCheckingVersion || refreshingLatest) return;
    if (!canRefresh) {
      showTooltipTemporarily();
      return;
    }
    if (!isRefreshConfirmationVisible) {
      setIsTooltipVisible(false);
      setIsRefreshConfirmationVisible(true);
      return;
    }
    setIsRefreshConfirmationVisible(false);
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
        disabled={isCheckingVersion || refreshingLatest}
        className={cx(
          "inline-flex h-9 items-center justify-center rounded-full border px-2.5 font-mono text-[10px] font-black tracking-[0.08em] shadow-sm transition-[background-color,border-color,color,width] duration-300 sm:h-10 sm:px-3 sm:text-xs",
          canRefresh
            ? "border-[#D4AF37]/70 bg-[#D4AF37] text-[#241a00] hover:bg-[#f2d56d]"
            : "cursor-not-allowed border-slate-200 bg-slate-100 text-[#0A192F]/35",
          (isCheckingVersion || refreshingLatest) && "cursor-wait"
        )}
        aria-label={buttonLabel}
        aria-expanded={canRefresh ? isRefreshConfirmationVisible : undefined}
      >
        <RefreshCw size={14} className={cx(refreshingLatest && "animate-spin")} />
        <span
          className={cx(
            "overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,margin,opacity] duration-300",
            isRefreshLabelVisible ? "ml-1.5 max-w-[8rem] opacity-100 sm:ml-2" : "ml-0 max-w-0"
          )}
          aria-hidden={!isRefreshLabelVisible}
        >
          {refreshingLatest ? "更新中" : "最新版に更新"}
        </span>
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
  activeView,
  setActiveView,
  forecast = null,
  readingPayload = null,
  dashboardData = null,
  versionState,
  onRefreshLatest,
  refreshingLatest,
  canAccessPremium = true,
  onPremiumRequired = () => {},
}) {
  const [isMobileUnifiedMenuOpen, setIsMobileUnifiedMenuOpen] = useState(false);
  const [isRetrogradeCalendarOpen, setIsRetrogradeCalendarOpen] = useState(false);
  const [retrogradeCalendarSort, setRetrogradeCalendarSort] = useState("date");
  const navItems = [
    { value: "unified", label: "星の見通し", requiresPremium: true },
    { value: "horoscope", label: "Horoscope", requiresPremium: false },
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
  return (
    <header style={{ top: "var(--v3-auth-bar-height, 0px)" }} className="fixed left-0 top-0 z-40 w-full border-b border-slate-200/90 bg-[#f8fafc]/95 backdrop-blur-xl">
      <div className="flex w-full max-w-none flex-wrap items-center justify-between gap-2 px-3 py-2 sm:gap-6 sm:px-8 sm:py-6 lg:mx-auto lg:max-w-[1760px]">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none sm:gap-8">
          <a href={ENTRY_PAGE_PATH} className="max-w-[66px] font-serif text-[11px] font-bold leading-[0.98] text-[#0A192F] sm:max-w-none sm:text-4xl sm:leading-none">{APP_BRAND}</a>
          <div className="relative flex min-w-0 flex-1 items-center gap-1 sm:flex-none sm:gap-1.5">
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
          {navItems.map(({ value, label, requiresPremium }) => (
            <React.Fragment key={value}>
              <button
                type="button"
                  onClick={() => {
                    if (requiresPremium && !canAccessPremium) {
                      onPremiumRequired();
                      return;
                    }
                    setActiveView(value);
                    setIsMobileUnifiedMenuOpen(false);
                  }}
                className={cx(
                  "pb-2 transition sm:pb-3",
                  activeView === value ? "border-b-2 border-[#D4AF37] text-[#0A192F]" : "hover:text-[#D4AF37]",
                  requiresPremium && !canAccessPremium && "text-[#0A192F]/45"
                )}
                aria-disabled={requiresPremium && !canAccessPremium}
              >
                {label}
                {requiresPremium && !canAccessPremium ? <LockKeyhole size={11} className="ml-1 inline-block align-[-1px]" aria-hidden="true" /> : null}
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
  const summaryColumns = summaryItemsFromForecast(forecast);
  const categorizedAspectItems = categorizedAnnualAspectItemsFromForecast(forecast);
  const activeCategoryAspectItems = {
    general: categorizedAspectItems.general ?? categorizedAspectItems.general_health,
    love: categorizedAspectItems.love,
    work: categorizedAspectItems.work,
    money: categorizedAspectItems.money,
  }[analysisMode] || [];
  const analysisTitle = {
    theme: "拡大と発展",
    themeSupplement: "補足",
    lesson: "成長課題",
    lessonSupplement: "補足",
    summary: "総括",
    general: "全般",
    love: "恋愛・対人",
    work: "仕事",
    money: "お金",
  }[analysisMode] || "総括";
  const isThemeSectionActive = analysisMode === "theme" || analysisMode === "themeSupplement";
  const isLessonSectionActive = analysisMode === "lesson" || analysisMode === "lessonSupplement";
  const fallbackThemeItems = [
    { color: "#e9c349", label: "THEME 01", body: "作成中" },
    { color: "#d3bcf9", label: "THEME 02", body: "作成中" },
    { color: "#ffb4ab", label: "THEME 03", body: "作成中" },
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
                拡大と発展
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
              ["general", "全般"],
              ["love", "恋愛・対人"],
              ["work", "仕事"],
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
        {["general", "love", "work", "money"].includes(analysisMode) ? (
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
          <h2 className="font-serif text-[18px] font-bold leading-tight text-starlight sm:text-3xl">年間運勢グラフ {activeYear}年</h2>
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
          月間運勢グラフ {activeYear}年{selectedMonth + 1}月
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
  const categorizedAspectItems = useMemo(
    () => categorizedAnnualAspectItemsFromForecast(forecast),
    [forecast],
  );
  const monthlyCategoryAspectItems = {
    general: monthlyItems(categorizedAspectItems.general ?? categorizedAspectItems.general_health, activeYear, selectedMonth),
    love: monthlyItems(categorizedAspectItems.love, activeYear, selectedMonth),
    work: monthlyItems(categorizedAspectItems.work, activeYear, selectedMonth),
    money: monthlyItems(categorizedAspectItems.money, activeYear, selectedMonth),
  };
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
    overview: "今月の総評",
    theme: "今月のテーマ",
    lesson: "今月のアクション",
    general: "全般",
    love: "恋愛・対人",
    work: "仕事",
    money: "お金",
  }[activeAnalysisMode] || "今月のテーマ";
  const modeKicker = activeAnalysisMode === "overview"
    ? "Monthly Overview"
    : ["general", "love", "work", "money"].includes(activeAnalysisMode)
      ? "今月のアスペクト"
      : "Main Theme";
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
          <div
            key={month}
            className="flex min-w-0 flex-col justify-end sm:shrink-0"
          >
            {index === MONTHS.length - 1 ? (
              <span className="mb-1 text-center font-mono text-[7px] font-bold leading-none tracking-[0.04em] text-gold/80 sm:text-[9px]">
                {activeYear}年
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setSelectedMonthIndex(index)}
              className={cx(
                "w-full min-w-0 rounded-full border px-0.5 py-1 transition sm:px-3 sm:py-1.5",
                selectedMonth === index ? "border-gold bg-gold text-[#241a00]" : "border-white/10 bg-white/[0.04] hover:border-white/20 hover:text-starlight"
              )}
            >
              {index + 1}月
            </button>
          </div>
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
              ["general", "全般"],
              ["love", "恋愛・対人"],
              ["work", "仕事"],
              ["money", "お金"],
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
        {["general", "love", "work", "money"].includes(activeAnalysisMode) ? (
          <TransitAspectList
            items={monthlyCategoryAspectItems[activeAnalysisMode] || []}
            openKeys={openMonthlyAspectKeys}
            onToggle={toggleMonthlyAspect}
            prefix={`monthly-${activeAnalysisMode}`}
          />
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
      <MonthlyScoreMatrix dailyData={dailyData} selectedSeriesKey={selectedSeriesKey} selectedDayIndex={safeSelectedDayIndex} />
      <MonthlyPeakDetailTable
        forecast={forecast}
        activeYear={activeYear}
        selectedMonth={selectedMonth}
      />
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
            min={MIN_FORECAST_YEAR}
            max={MAX_FORECAST_YEAR}
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

function PremiumAccessDialog({ open, onClose }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#08111f]/75 px-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="premium-access-title"
        className="w-full max-w-[460px] rounded-2xl border border-[#D4AF37]/40 bg-[#fffdf7] p-6 text-[#0A192F] shadow-[0_24px_90px_rgba(0,0,0,0.42)] sm:p-8"
      >
        <div className="flex items-start gap-4">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#D4AF37]/15 text-[#9d7620]">
            <LockKeyhole size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[#9d7620]">Premium Reading</p>
            <h2 id="premium-access-title" className="mt-2 font-serif text-2xl font-semibold sm:text-3xl">星の見通しは有料版限定です</h2>
            </div>
          </div>
        <p className="mt-6 text-sm leading-7 text-[#0A192F]/70">
          無料版では、生年月日から導いた Horoscope をご覧いただけます。年間・月間の星の見通しは、有料版でご利用いただけます。
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-7 h-12 w-full rounded-full bg-[#0A192F] font-mono text-xs font-black tracking-[0.16em] text-white transition hover:bg-[#1d3557]"
        >
          無料版に戻る
        </button>
      </div>
    </div>
  );
}

function ForecastDetailPage({ onHoroscope }) {
  const { session } = useAccess();
  const CAN_ACCESS_PREMIUM = featurePolicy(session).stellarForecast;
  const forceRefresh = shouldForceRefresh();
  const [forecast, setForecast] = useState(() => (CAN_ACCESS_PREMIUM ? getForecast() : null));
  const [readingPayload, setReadingPayload] = useState(() => getStoredReadingResult({ allowStale: true }) || {});
  const [readingStorageHydrated, setReadingStorageHydrated] = useState(forceRefresh);
  const activeYear = forecastYear(forecast);
  const [yearDialogOpen, setYearDialogOpen] = useState(false);
  const [premiumPromptOpen, setPremiumPromptOpen] = useState(false);
  const [targetYear, setTargetYear] = useState(String(activeYear));
  const [calculatingYear, setCalculatingYear] = useState(false);
  const [yearCalculationError, setYearCalculationError] = useState("");
  const [deferredContentLoading, setDeferredContentLoading] = useState(false);
  const [deferredContentError, setDeferredContentError] = useState("");
  const [forecastDetailLoadingKeys, setForecastDetailLoadingKeys] = useState(() => new Set());
  const [forecastDetailError, setForecastDetailError] = useState("");
  const forecastDetailRequestsRef = React.useRef(new Set());
  const latestRefreshInProgressRef = React.useRef(false);
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
          if (indexedForecast && CAN_ACCESS_PREMIUM) {
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
  const needsInitialForecast = CAN_ACCESS_PREMIUM
    && readingStorageHydrated
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
      ? requestYearlyForecast(formPayload, activeYear)
      : Promise.resolve(null);

    Promise.allSettled([widgetRequest, forecastRequest])
      .then(async ([widgetResult, forecastResult]) => {
        if (!active || latestRefreshInProgressRef.current) return;
        const storedPayload = await getStoredReadingResultAsync({ allowStale: true });
        if (!active || latestRefreshInProgressRef.current) return;
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
        if (active && !latestRefreshInProgressRef.current) {
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
    if (!yearDialogOpen) {
      setTargetYear(String(activeYear));
      setYearCalculationError("");
    }
  }, [activeYear, yearDialogOpen]);
  useEffect(() => {
    if (!forceRefresh || !CAN_ACCESS_PREMIUM) {
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
      .then(() => requestYearlyForecast(formPayload, activeYear, { retryTransient: true }))
      .then(async (nextForecast) => {
        if (!active) return;
        const selectedYearForecast = forecastWithSelectedYear(nextForecast, activeYear);
        setForecast(selectedYearForecast);
        setSelectedMonthIndex(realtimeMonthIndex(monthlyData(selectedYearForecast)));
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
  const data = useMemo(() => monthlyData(forecast), [forecast]);
  const stats = useMemo(() => aggregateStats(data), [data]);
  const [selectedSeriesKey, setSelectedSeriesKey] = useState("general");
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(() => realtimeMonthIndex(data));
  const [selectedMonthlyMonthIndex, setSelectedMonthlyMonthIndex] = useState(workdayMonthIndex);
  const [activeView, setActiveView] = useState(CAN_ACCESS_PREMIUM ? "unified" : "horoscope");
  const [activeUnifiedView, setActiveUnifiedView] = useState("daily");
  const [dailyViewResetKey, setDailyViewResetKey] = useState(0);
  const [dailyOverviewDate, setDailyOverviewDate] = useState(() => currentLocalDate());
  const handleSelectUnifiedView = React.useCallback((view) => {
    if (view === "daily") {
      setDailyOverviewDate(currentLocalDate());
      setDailyViewResetKey((current) => current + 1);
    }
    setActiveUnifiedView(view);
  }, []);
  const requestForecastDetail = React.useCallback(async (scope, options = {}) => {
    if (!CAN_ACCESS_PREMIUM) {
      setPremiumPromptOpen(true);
      return;
    }
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
  const initialPageContentSettled = Boolean(
    readingStorageHydrated
    && !deferredContentLoading
    && !calculatingYear
    && forecastDetailLoadingKeys.size === 0
    && (!(needsDeferredWidgets || needsInitialForecast) || deferredContentError)
    && (!dailyMonthlyOverviewPending || forecastDetailError)
    && (!forceRefresh || forecast || yearCalculationError)
  );
  useEffect(() => {
    if (!initialPageContentSettled) {
      setVersionState((current) => current.checking ? current : { ...current, checking: true });
      return () => {};
    }
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
  }, [initialPageContentSettled, readingPayload]);
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
      yearly_forecast: CAN_ACCESS_PREMIUM
        ? (forecast || storedPayload.yearly_forecast || storedPayload.yearlyForecast || sourceDashboard.yearly_forecast || null)
        : null,
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
    if (!CAN_ACCESS_PREMIUM) {
      setPremiumPromptOpen(true);
      return;
    }
    if (!versionState.isOutdated || refreshingLatest) {
      return;
    }
    const formPayload = getQueryReadingForm() || getStoredReadingForm();
    if (!formPayload) {
      setLatestUpdateError("保存済みの出生情報がないため、最新版に更新できません。入力画面から再計算してください。");
      return;
    }

    setRefreshingLatest(true);
    latestRefreshInProgressRef.current = true;
    setLatestUpdateError("");
    setDeferredContentError("");
    try {
      const nextReading = await postJsonWithTransientRetry("/api/paid-reading?defer_widgets=true", formPayload).catch((error) => {
        throw new Error(`ホロスコープの再計算に失敗しました: ${readableErrorMessage(error, "API通信に失敗しました")}`);
      });
      const nextForecastPayload = await requestYearlyForecast(formPayload, activeYear, { retryTransient: true }).catch((error) => {
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
      setSelectedMonthIndex(realtimeMonthIndex(monthlyData(selectedYearForecast)));
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
      latestRefreshInProgressRef.current = false;
      setRefreshingLatest(false);
    }
  };
  const handleCalculateYear = async (requestedYear = targetYear) => {
    if (!CAN_ACCESS_PREMIUM) {
      setPremiumPromptOpen(true);
      return;
    }
    if (calculatingYear) {
      return;
    }
    const normalizedYear = Number(requestedYear);
    if (!Number.isInteger(normalizedYear) || normalizedYear < MIN_FORECAST_YEAR || normalizedYear > MAX_FORECAST_YEAR) {
      setYearCalculationError(`${MIN_FORECAST_YEAR}年から${MAX_FORECAST_YEAR}年の範囲で年を入力してください。`);
      return;
    }
    if (normalizedYear === activeYear) {
      return;
    }

    const formPayload = getStoredReadingForm();
    if (!formPayload) {
      setYearCalculationError("出生データが見つかりません。入力画面から再計算してください。");
      return;
    }

    setCalculatingYear(true);
    setTargetYear(String(normalizedYear));
    setYearCalculationError("");
    try {
      const nextForecast = await requestYearlyForecast(formPayload, normalizedYear, { retryTransient: true });
      const selectedYearForecast = forecastWithSelectedYear(nextForecast, normalizedYear);
      setForecast(selectedYearForecast);
      setSelectedMonthIndex(realtimeMonthIndex(monthlyData(selectedYearForecast)));
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
        activeView={activeView}
        setActiveView={(view) => view === "horoscope" ? onHoroscope() : setActiveView(view)}
        forecast={forecast}
        readingPayload={readingPayload}
        dashboardData={dailyDetailData}
        versionState={versionState}
        onRefreshLatest={handleRefreshLatest}
        refreshingLatest={refreshingLatest}
        canAccessPremium={CAN_ACCESS_PREMIUM}
        onPremiumRequired={() => setPremiumPromptOpen(true)}
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
        {!latestUpdateError && deferredContentError ? (
          <div className="rounded-2xl border border-[#ffb4ab]/30 bg-[#3a1d1d]/45 px-4 py-3 text-xs leading-6 text-[#ffb4ab] sm:text-sm">
            {deferredContentError}
          </div>
        ) : null}
        {forecastDetailError ? (
          <div className="rounded-2xl border border-[#ffb4ab]/30 bg-[#3a1d1d]/45 px-4 py-3 text-xs leading-6 text-[#ffb4ab] sm:text-sm">
            {forecastDetailError}
          </div>
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
            onSelectYear={(year) => handleCalculateYear(year)}
            calculatingYear={calculatingYear}
            activeUnifiedView={activeUnifiedView}
            setActiveUnifiedView={setActiveUnifiedView}
            onSelectUnifiedView={handleSelectUnifiedView}
            dailyViewResetKey={dailyViewResetKey}
            detailLoadingKeys={forecastDetailLoadingKeys}
            onRequestDayDetail={requestForecastDayDetail}
            onDailyDisplayDateChange={setDailyOverviewDate}
          />
        ) : null}
        {activeView === "horoscope" ? (
          <ForecastGalaxyBackground innerClassName="block">
            <div className="-mx-5 -my-5 md:-mx-8 lg:-mx-14">
              <DashboardV2HoroscopePage
                data={dailyDetailData}
                belowMetaContent={<Horoscope3DMap data={dailyDetailData} />}
              />
            </div>
          </ForecastGalaxyBackground>
        ) : null}
      </main>
      <footer className="border-t border-slate-200/90 bg-[#f8fafc]/95 px-4 py-8 text-[#0A192F] sm:px-8 sm:py-10">
        <div className="mx-auto flex max-w-[1540px] flex-col gap-4 text-[#0A192F]/70 md:flex-row md:items-center md:justify-between">
          <p className="font-serif text-2xl font-semibold text-[#0A192F]">{APP_BRAND}</p>
          <a href={ENTRY_PAGE_PATH} className="font-mono text-xs uppercase tracking-[0.18em] text-[#0A192F]/70 hover:text-[#D4AF37]">Back to Entry</a>
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
      <PremiumAccessDialog
        open={premiumPromptOpen}
        onClose={() => setPremiumPromptOpen(false)}
      />
    </div>
  );
}

export default ForecastDetailPage;
