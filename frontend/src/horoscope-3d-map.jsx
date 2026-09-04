import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  HandHeart,
  Maximize2,
  Minimize2,
  Minus,
  Move,
  Pause,
  Play,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  WalletCards,
} from "lucide-react";
import * as THREE from "three";
import { currentTokyoDate, getStoredReadingForm } from "./reading-storage.js";
import { readableErrorMessage } from "./error-message.mjs";
import {
  loadEarthCloudTexture,
  loadEarthSurfaceTexture,
  loadPlanetSurfaceTexture,
  loadSaturnRingTexture,
} from "./planet-surface-textures.mjs";
import {
  aspectHasCompoundMembership,
  compoundMembershipColor,
  compoundMembershipSignature,
  mergeAspectLineMemberships,
} from "./aspect-line-membership.mjs";
import {
  buildFreePlaybackDates,
  FREE_PLAYBACK_WINDOW_DAYS,
} from "./free-playback-window.mjs";

const MAP_PLANET_DISPLAY_MODE_OPTIONS = [
  { key: "natal", label: "ネイタル天体を表示" },
  { key: "transit", label: "現行天体を表示" },
  { key: "both", label: "両方表示" },
];

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
const TRANSIT_ANGLE_ORDER = ["ASC", "MC"];
const TRANSIT_MAP_POINT_ORDER = [...TRANSIT_PLANET_ORDER, ...TRANSIT_ANGLE_ORDER];
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
  NORTH_NODE: "#e9c349",
  SOUTH_NODE: "#a98f6c",
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

async function getJson(path) {
  const response = await requestJson(`${resolveApiBaseUrl()}${path}`, undefined, "GET");
  if (!response.ok) throw new Error(formatApiError(response.data?.detail, `Request failed: ${response.status}`));
  return response.data;
}

async function postJson(path, payload) {
  const apiBaseUrl = resolveApiBaseUrl();
  const response = await requestJson(`${apiBaseUrl}${path}`, payload, "POST");
  if (!response.ok) {
    const errorPayload = response.data || {};
    throw new Error(formatApiError(errorPayload.detail, `Request failed: ${response.status}`));
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

async function requestJson(url, payload, method = "POST") {
  const body = payload === undefined ? undefined : JSON.stringify(payload);
  if (typeof globalThis.fetch === "function") {
    const response = await globalThis.fetch(url, {
      method,
      headers: method === "GET" ? { Accept: "application/json" } : { "Content-Type": "application/json" },
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
    request.open(method, url, true);
    if (method !== "GET") request.setRequestHeader("Content-Type", "application/json");
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

function planetLabel(value) {
  const key = String(value || "").trim().toUpperCase();
  return PLANET_LABELS[key] || value || "";
}

function nodeTableRole(value) {
  const raw = String(value || "").trim();
  const key = raw.toUpperCase().replace(/[ -]/g, "_");
  if (key === "NODE" || key === "TRUE_NODE" || key === "NORTH_NODE" || key === "DRAGON_HEAD" || raw.includes("ドラゴンヘッド")) {
    return "NORTH_NODE";
  }
  if (key === "SOUTH_NODE" || key === "DRAGON_TAIL" || raw.includes("ドラゴンテール")) {
    return "SOUTH_NODE";
  }
  return "";
}

function nodeTableItems(sourceItems = []) {
  const byRole = new Map();
  (Array.isArray(sourceItems) ? sourceItems : []).forEach((item) => {
    const role = nodeTableRole(item?.planet || item?.name || item?.label);
    const longitude = normalizeLongitude(item?.longitude);
    if (!role || longitude === null || byRole.has(role)) return;
    byRole.set(role, {
      ...item,
      planet: role,
      label: planetLabel(role),
      color: PLANET_COLORS[role],
      longitude,
    });
  });

  const northNode = byRole.get("NORTH_NODE");
  if (northNode && !byRole.has("SOUTH_NODE")) {
    byRole.set("SOUTH_NODE", {
      ...northNode,
      planet: "SOUTH_NODE",
      label: planetLabel("SOUTH_NODE"),
      color: PLANET_COLORS.SOUTH_NODE,
      longitude: normalizeLongitude(northNode.longitude + 180),
      estimated: true,
    });
  }

  return ["NORTH_NODE", "SOUTH_NODE"].map((role) => byRole.get(role)).filter(Boolean);
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
  { key: "month", label: "今日±15日", days: FREE_PLAYBACK_WINDOW_DAYS },
];
const ASPECT_LINE_SCOPE_OPTIONS = [
  { key: "transitNatal", label: "出生図との関係", shortLabel: "ネイタル×現行", title: "ネイタル天体×現行天体" },
  { key: "transitTransit", label: "現行天体同士", shortLabel: "現行×現行", title: "現行天体×現行天体" },
  { key: "natalNatal", label: "ネイタル天体同士", shortLabel: "ネイタル×ネイタル", title: "ネイタル天体×ネイタル天体" },
];
const ASPECT_DISPLAY_MODE_OPTIONS = [
  { key: "none", label: "アスペクト表示なし", description: "アスペクト線を表示しない" },
  { key: "transitNatal", label: "出生図との関係", description: "ネイタル×現行" },
  { key: "transitTransit", label: "現行天体同士", description: "現行×現行" },
  { key: "natalNatal", label: "ネイタル同士", description: "ネイタル×ネイタル" },
  { key: "compositeTransit", label: "現行天体", description: "複合アスペクト" },
  { key: "compositeTransitNatal", label: "ネイタル×現行", description: "複合アスペクト" },
  { key: "compositeNatal", label: "ネイタル", description: "複合アスペクト" },
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

function aspectInterpretationKey(planet1, planet2, angle) {
  const normalizedAngle = normalizeAspectAngle(angle);
  if (normalizedAngle === null) return "";
  return [planet1, planet2].map((value) => normalizedPlanet(value)).sort().concat(String(normalizedAngle)).join("|");
}

function aspectSummary(lookup, scope, planet1, planet2, angle) {
  const normalizedAngle = normalizeAspectAngle(angle);
  if (normalizedAngle === null) return "";
  if (scope === "transitNatal") return lookup?.transitNatal?.[`${normalizedPlanet(planet1)}|${normalizedPlanet(planet2)}|${normalizedAngle}`] || "";
  const bucket = scope === "natalNatal" ? lookup?.natalNatal : lookup?.transitTransit;
  return bucket?.[aspectInterpretationKey(planet1, planet2, normalizedAngle)] || "";
}

function chartTransitMap(chart) {
  return new Map(
    (Array.isArray(chart?.transits) ? chart.transits : [])
      .map((item) => [item.planet, normalizeLongitude(item.longitude)])
      .filter(([, longitude]) => longitude !== null)
  );
}

function liveAspectsFromChart(chart, natalPoints = [], interpretationLookup = null) {
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
          description: aspectSummary(interpretationLookup, "transitNatal", transitPlanet, natalPlanet, aspect.angle),
        };
      })
      .filter(Boolean);
  });
}

function transitTransitAspectsFromTransits(transits = [], interpretationLookup = null) {
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
      description: aspectSummary(interpretationLookup, "transitTransit", fromTransit.planet, toTransit.planet, aspect.angle),
    };
  }).filter(Boolean));
}

function liveTransitTransitAspectsFromChart(chart, interpretationLookup = null) {
  return transitTransitAspectsFromTransits(Array.isArray(chart?.transits) ? chart.transits : [], interpretationLookup);
}

function natalNatalAspectsFromPoints(natalPoints = [], interpretationLookup = null) {
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
      description: aspectSummary(interpretationLookup, "natalNatal", fromNatal.planet, toNatal.planet, aspect.angle),
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
    return aspectHasCompoundMembership(aspect, highlightKey.slice("compound:".length));
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
  return ["composite", "compositeTransit", "compositeTransitNatal", "compositeNatal"].includes(mode);
}

function compoundCategoryForAspectMode(mode) {
  if (mode === "compositeTransit") return "transitOnly";
  if (mode === "compositeTransitNatal") return "mixed";
  if (mode === "compositeNatal") return "natalOnly";
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
  if (mode === "none") return [];
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
  if (mode === "none") return [];
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
  mergeAspectLineMemberships(aspects, aspectMergeKey).forEach((aspect) => {
    const key = aspectMergeKey(aspect);
    lineKeys.push(`${key}:${aspectLineColor(aspect.angle, aspect.color)}:${compoundMembershipSignature(aspect)}`);
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
  const mergedAspects = mergeAspectLineMemberships(aspects, aspectMergeKey);
  mergedAspects.forEach((aspect) => {
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
    const selectedCompoundKey = String(state.selectedAspectLineHighlightKey || "").startsWith("compound:")
      ? String(state.selectedAspectLineHighlightKey).slice("compound:".length)
      : "";
    const colorValue = aspectLineColor(aspect.angle, compoundMembershipColor(aspect, selectedCompoundKey));
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
  if (state?.aspectLineMode === "none") return false;
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
  const mode = state.aspectLineMode || "transitNatal";
  if (mode === "none") {
    state.playbackAspectControlsKey = "";
    renderAspectLines(state, [], false, state.transitLayerActive);
    applyLiveAspectHighlights(state, []);
    return;
  }
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
  const texture = loadPlanetSurfaceTexture(item.planet, textures);
  const baseColor = new THREE.Color(item.color);
  const isSun = item.planet === "SUN";
  return new THREE.MeshStandardMaterial({
    map: texture,
    color: item.estimated ? baseColor.clone().lerp(new THREE.Color("#8f8f98"), 0.22) : 0xffffff,
    emissive: isSun ? new THREE.Color(0xffffff) : baseColor,
    emissiveMap: isSun ? texture : null,
    emissiveIntensity: isSun ? 1.08 : item.estimated ? 0.006 : 0.015,
    metalness: 0,
    roughness: isSun ? 0.54 : ["VENUS", "URANUS", "NEPTUNE"].includes(item.planet) ? 0.72 : 0.88,
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
    if (!TRANSIT_MAP_POINT_ORDER.includes(planet) || longitude === null || byPlanet.has(planet)) return;
    if (TRANSIT_PLANET_ORDER.includes(planet)) preciseTransitCount += 1;
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
  const transits = TRANSIT_MAP_POINT_ORDER.map((planet) => byPlanet.get(planet)).filter(Boolean);
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

function TransitNatalSunMap({ day, forecast, availableDays = [], selectedDayIndex = 0, onSelectDayIndex = null, onSelectDate = null }) {
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
  const [aspectInterpretationLookup, setAspectInterpretationLookup] = useState(null);
  const [isTransitPlaybackActive, setIsTransitPlaybackActive] = useState(false);
  const [isTransitPlaybackPreloading, setIsTransitPlaybackPreloading] = useState(false);
  const [transitPlaybackPreloadProgress, setTransitPlaybackPreloadProgress] = useState(0);
  const [transitPlaybackCursor, setTransitPlaybackCursor] = useState(null);
  const [transitPlaybackStepDays, setTransitPlaybackStepDays] = useState(1);
  const [transitPlaybackRange, setTransitPlaybackRange] = useState("month");
  const [isPlaybackPanelOpen, setIsPlaybackPanelOpen] = useState(false);
  const natalLayerActive = true;
  const transitLayerActive = true;
  const [isTransitTableCollapsed, setIsTransitTableCollapsed] = useState(false);
  const [isNatalTableCollapsed, setIsNatalTableCollapsed] = useState(false);
  const [mobilePlanetTableTab, setMobilePlanetTableTab] = useState("transit");
  const [mapPlanetDisplayMode, setMapPlanetDisplayMode] = useState("both");
  const [isMapPlanetDisplayPanelOpen, setIsMapPlanetDisplayPanelOpen] = useState(false);
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
  const [aspectLineMode, setAspectLineMode] = useState("none");
  const selectedAspectDisplayMode = useMemo(
    () => ASPECT_DISPLAY_MODE_OPTIONS.find((option) => option.key === aspectLineMode) || ASPECT_DISPLAY_MODE_OPTIONS[0],
    [aspectLineMode]
  );
  const [aspectInterpretationScope, setAspectInterpretationScope] = useState("none");
  const [compoundAspectListCategory, setCompoundAspectListCategory] = useState("mixed");
  const [tooltipCompositeTab, setTooltipCompositeTab] = useState("compound");
  const [openTooltipAspectKeys, setOpenTooltipAspectKeys] = useState(() => new Set());
  const [openAspectInterpretationKeys, setOpenAspectInterpretationKeys] = useState(() => new Set());
  const [selectedAspectLineHighlightKey, setSelectedAspectLineHighlightKey] = useState("");
  const [aspectTooltipPanelPosition, setAspectTooltipPanelPosition] = useState(null);
  const [aspectListPanelPosition, setAspectListPanelPosition] = useState({ x: 520, y: 104 });
  const [mobileAspectListPanelPosition, setMobileAspectListPanelPosition] = useState({ x: 10, y: 132 });
  const [isMobileAspectListDetached, setIsMobileAspectListDetached] = useState(false);
  const [isMobileChartPanelDetached, setIsMobileChartPanelDetached] = useState(true);
  const [isFullscreenMobileChartPanelOpen, setIsFullscreenMobileChartPanelOpen] = useState(false);
  useEffect(() => {
    let active = true;
    getJson("/api/v2/aspect-interpretations").then((payload) => {
      if (active) setAspectInterpretationLookup(payload || {});
    }).catch(() => {
      if (active) setAspectInterpretationLookup({});
    });
    return () => { active = false; };
  }, []);
  const selectedDate = dateKey(day?.date);
  const [isTransitCalendarOpen, setIsTransitCalendarOpen] = useState(false);
  const selectedMapPlanetDisplayMode = MAP_PLANET_DISPLAY_MODE_OPTIONS.find((option) => option.key === mapPlanetDisplayMode)
    || MAP_PLANET_DISPLAY_MODE_OPTIONS[2];
  const showNatalMapLayer = mapPlanetDisplayMode !== "transit";
  const showTransitMapLayer = mapPlanetDisplayMode !== "natal";
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
  const hasDirectDateSelection = typeof onSelectDate === "function";
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
    if (!nextDate) return;
    if (hasDirectDateSelection) {
      onSelectDate(nextDate);
      setIsTransitCalendarOpen(false);
      setTransitCalendarMonth(monthKey(nextDate));
      return;
    }
    if (!onSelectDayIndex) return;
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
    if (hasDirectDateSelection) return true;
    if (direction < 0 && minSelectableDate) return nextMonth >= monthKey(minSelectableDate);
    if (direction > 0 && maxSelectableDate) return nextMonth <= monthKey(maxSelectableDate);
    return true;
  };
  const moveTransitCalendarMonth = (direction) => {
    const nextMonth = addMonthsToMonthKey(transitCalendarMonth || selectedDate, direction);
    if (!nextMonth) return;
    if (!hasDirectDateSelection) {
      if (direction < 0 && minSelectableDate && nextMonth < monthKey(minSelectableDate)) return;
      if (direction > 0 && maxSelectableDate && nextMonth > monthKey(maxSelectableDate)) return;
    }
    setTransitCalendarMonth(nextMonth);
  };
  const TransitDatePicker = ({ compact = false } = {}) => {
    const currentMonth = transitCalendarMonth || monthKey(displayedTransitDateTime.date) || monthKey(selectedDate);
    const calendarDays = calendarDaysForMonth(currentMonth);
    const calendarId = compact ? "mobile-transit-date-calendar" : "desktop-transit-date-calendar";
    const isDateSelectable = (date) => {
      if (!date) return false;
      if (hasDirectDateSelection) return true;
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
      <div className="relative z-[150]">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setIsTransitCalendarOpen((value) => !value);
          }}
          disabled={!hasDirectDateSelection && !onSelectDayIndex}
          className={cx(
            "inline-flex h-7 items-center gap-1 rounded-md border font-semibold text-starlight outline-none transition hover:border-gold/35 hover:bg-[#121414]/80 focus:border-gold/50 focus:bg-[#121414]/70 focus:ring-2 focus:ring-gold/25 disabled:pointer-events-none disabled:opacity-100",
            compact
              ? "w-[112px] justify-between border-white/10 bg-[#121414]/70 px-2 font-mono text-[10px]"
              : "border-transparent bg-transparent px-1 text-xs sm:text-sm"
          )}
          aria-expanded={isTransitCalendarOpen}
          aria-controls={calendarId}
          aria-label="現行天体の計算日"
          title="日付を選択"
        >
          {compact ? <CalendarDays size={12} className="shrink-0 text-mist/75" /> : null}
          <span>{compact ? compactDateLabel(displayedTransitDateTime.date) : displayedTransitDateTime.date}</span>
          {compact ? <ChevronDown size={12} className="shrink-0 text-mist/75" /> : <CalendarDays size={13} className="text-mist/70" />}
        </button>
        <div
          id={calendarId}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          className={cx(
            "absolute left-0 top-full z-[160] mt-1 w-[236px] overflow-hidden rounded-xl border border-white/10 bg-[#121414]/94 p-2 font-mono text-[10px] font-bold text-mist shadow-[0_18px_42px_rgba(0,0,0,0.42)] backdrop-blur-md transition",
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
  const tableTransitNodeItems = useMemo(
    () => nodeTableItems(tableDay?.transit_chart?.transits || tableDay?.transitChart?.transits),
    [tableDay]
  );
  const tableNatalNodeItems = useMemo(
    () => nodeTableItems(forecast?.natal_points || forecast?.natalPoints),
    [forecast]
  );
  const aspectLineSky = playbackTransitChart ? tableSky : sky;
  const livePlaybackAspects = useMemo(
    () => (isTransitPlaybackActive && playbackTransitChart
      ? liveAspectsFromChart(playbackTransitChart, tableSky.natalPoints, aspectInterpretationLookup)
      : null),
    [isTransitPlaybackActive, playbackTransitChart, tableSky.natalPoints, aspectInterpretationLookup]
  );
  const livePlaybackTransitTransitAspects = useMemo(
    () => (isTransitPlaybackActive && playbackTransitChart ? liveTransitTransitAspectsFromChart(playbackTransitChart, aspectInterpretationLookup) : null),
    [isTransitPlaybackActive, playbackTransitChart, aspectInterpretationLookup]
  );
  const currentLiveAspects = useMemo(() => {
    const preciseTransits = aspectLineSky.transits.filter((item) => !item.estimated);
    if (!preciseTransits.length) return [];
    return liveAspectsFromChart({ transits: preciseTransits }, aspectLineSky.natalPoints, aspectInterpretationLookup);
  }, [aspectLineSky.natalPoints, aspectLineSky.transits, aspectInterpretationLookup]);
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
    () => natalNatalAspectsFromPoints(aspectLineSky.natalPoints, aspectInterpretationLookup),
    [aspectLineSky.natalPoints, aspectInterpretationLookup]
  );
  const aspectLineSourceAspects = useMemo(() => [
    ...transitNatalSourceAspects,
    ...transitTransitSourceAspects,
  ], [transitNatalSourceAspects, transitTransitSourceAspects]);
  const activeCompoundAspectListCategory = compoundCategoryForAspectMode(aspectLineMode) || compoundAspectListCategory;
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
    aspectLineMode === "none"
      ? []
      : isCompoundAspectMode(aspectLineMode)
      ? compoundLineAspects
      : aspectLineMode === "custom"
        ? [...aspectLineSourceAspects, ...natalNatalSourceAspects]
        : [...aspectLineSourceAspects, ...natalNatalSourceAspects]
  ), [aspectLineMode, aspectLineSourceAspects, compoundLineAspects, natalNatalSourceAspects]);
  const activeAspectLineAspects = useMemo(() => filterAspectLinesForControls(
    aspectLineDisplaySourceAspects.map((aspect) => {
      const scope = aspect.scope || "transitNatal";
      return {
        ...aspect,
        scope,
        description: scope === "transitNatal"
          ? aspectSummary(aspectInterpretationLookup, scope, aspect.transitPlanet, aspect.natalPlanet, aspect.angle) || aspect.description
          : aspect.description,
      };
    }),
    { focus: aspectLineFocus, selections: aspectLineSelections, mode: aspectLineMode }
  ), [aspectInterpretationLookup, aspectLineFocus, aspectLineSelections, aspectLineMode, aspectLineDisplaySourceAspects]);
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
        const scope = aspect.scope || "transitNatal";
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
          description: scope === "transitNatal"
            ? aspectSummary(aspectInterpretationLookup, "transitNatal", aspect.transitPlanet, aspect.natalPlanet, aspect.angle)
              || aspect.description || descriptionLookup.get(descriptionKey) || aspectInterpretationFallback(aspect)
            : aspect.description || descriptionLookup.get(descriptionKey) || aspectInterpretationFallback(aspect),
          title: scope === "transitTransit"
            ? `現行${planetLabel(aspect.transitPlanet)} × 現行${planetLabel(aspect.transitPlanetB)}　${aspect.angle}°`
            : `ネイタル${planetLabel(aspect.natalPlanet)} × 現行${planetLabel(aspect.transitPlanet)}　${aspect.angle}°`,
          scopeLabel: scope === "transitTransit" ? "現行天体同士" : "出生図との関係",
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
  }, [aspectInterpretationLookup, aspectInterpretationScope, activeCompoundAspectListCategory, aspectLineSky.allAspects, aspectLineSky.natalPoints, aspectLineSky.transits, aspectLineSourceAspects, compoundAspectGroups, compoundLineAspects]);
  const aspectInterpretationItems = aspectInterpretationBuckets.visibleItems;
  const selectAspectLineMode = (mode) => {
    setAspectLineMode(mode);
    if (mode === "none") {
      setAspectInterpretationScope("none");
      setAspectLineFocus(null);
      setAspectTooltip(null);
      setSelectedAspectLineHighlightKey("");
      setIsAspectListPanelOpen(false);
      return;
    }
    if (mode === "custom") return;
    if (mode === "compositeTransit") {
      setCompoundAspectListCategory("transitOnly");
      setAspectInterpretationScope("composite");
    } else if (mode === "compositeTransitNatal") {
      setCompoundAspectListCategory("mixed");
      setAspectInterpretationScope("composite");
    } else if (mode === "compositeNatal") {
      setCompoundAspectListCategory("natalOnly");
      setAspectInterpretationScope("composite");
    } else {
      setAspectInterpretationScope(mode);
    }
    setIsAspectListPanelOpen(true);
  };
  const selectCompoundAspectListCategory = (category) => {
    const mode = ({
      mixed: "compositeTransitNatal",
      transitOnly: "compositeTransit",
      natalOnly: "compositeNatal",
    })[category];
    if (mode) selectAspectLineMode(mode);
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
    const natalHouseLines = [];
    const natalHouseLabels = [];
    const mapRings = [];
    const natalLayerLabels = [];
    const natalPlanetSymbols = [];
    const transitLayerObjects = [];
    const transitHouseLabels = [];
    const transitHouseLines = [];
    const transitZodiacLines = [];
    const zodiacDegreeTickLines = [];
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
    const natalHouseInnerRadiusBase = isMobileMapCanvas ? 1.46 : 1.72;
    const natalHouseOuterRadiusBase = isMobileMapCanvas ? 2.92 : 3.28;
    const transitHouseInnerRadiusBase = isMobileMapCanvas ? 2.92 : 3.28;
    const transitOrbitRadiusBase = isMobileMapCanvas ? 3.66 : 4.15;
    const natalHouseLabelRadiusBase = isMobileMapCanvas ? 2.26 : 2.58;
    const transitHouseLabelRadiusBase = isMobileMapCanvas ? 3.28 : 3.72;
    const natalOrbitRadiusValue = isMobileMapCanvas ? 1.76 : 2.05;
    const natalPlanetRadiusValue = natalHouseLabelRadiusBase;
    const transitPlanetRadiusValue = isMobileMapCanvas ? 3.42 : 3.88;
    const mapRadii = {
      natalOrbitRadius: natalOrbitRadiusValue,
      natalPlanetRadius: natalPlanetRadiusValue,
      natalHouseInnerRadius: natalHouseInnerRadiusBase,
      natalHouseOuterRadius: natalHouseOuterRadiusBase,
      natalHouseLabelRadius: natalHouseLabelRadiusBase,
      transitHouseInnerRadius: transitHouseInnerRadiusBase,
      transitOrbitRadius: transitOrbitRadiusBase,
      transitHouseLabelRadius: transitHouseLabelRadiusBase,
      transitPlanetRadius: transitPlanetRadiusValue,
      zodiacOuterRadius: isMobileMapCanvas ? 4.16 : 4.72,
      zodiacLabelRadius: isMobileMapCanvas ? 3.92 : 4.45,
    };
    const {
      natalOrbitRadius,
      natalPlanetRadius,
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
      { role: "natalOrbit", radius: natalOrbitRadius, color: 0xe9c349, opacity: 0.2, visible: true },
      { role: "natalOuter", radius: natalHouseOuterRadius, color: 0xffffff, opacity: 0.08, visible: true },
      { role: "transitInner", radius: transitHouseInnerRadius, color: 0x8bd3ff, opacity: 0.14, visible: false },
      { role: "transitOrbit", radius: transitOrbitRadius, color: 0x8bd3ff, opacity: 0.18, visible: true },
      { role: "zodiacOuter", radius: zodiacOuterRadius, color: 0xe9c349, opacity: 0.12, visible: true },
    ].forEach((item) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(item.radius, 0.01, 10, 160),
        new THREE.MeshBasicMaterial({ color: item.color, transparent: true, opacity: item.opacity })
      );
      ring.rotation.x = Math.PI / 2;
      ring.visible = item.visible;
      mapRings.push({ mesh: ring, ...item });
      group.add(ring);
    });

    const earthSurfaceTexture = loadEarthSurfaceTexture(textures);
    const earthCloudsTexture = loadEarthCloudTexture(textures);
    const earthMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.38, 96, 54),
      new THREE.MeshStandardMaterial({
        map: earthSurfaceTexture,
        color: 0xffffff,
        emissive: new THREE.Color(0x000000),
        emissiveIntensity: 0,
        metalness: 0,
        roughness: 0.82,
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
        color: 0xffffff,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        roughness: 0.58,
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
        natalHouseLines.push({ line, index });
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
          index,
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
        transitZodiacLines.push(line);
        group.add(line);
    }
    const zodiacBandWidth = zodiacOuterRadius - transitOrbitRadius;
    const zodiacDegreeTickOuterRadius = transitOrbitRadius - zodiacBandWidth * 0.05;
    for (let degree = 0; degree < 360; degree += 10) {
      const isSignBoundary = degree % 30 === 0;
      const zodiacDegreeTickInnerRadius = transitOrbitRadius - zodiacBandWidth * (isSignBoundary ? 0.34 : 0.23);
      const inner = longitudePosition(degree, zodiacDegreeTickInnerRadius, -0.031);
      const outer = longitudePosition(degree, zodiacDegreeTickOuterRadius, -0.031);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([inner, outer]),
        new THREE.LineBasicMaterial({
          color: 0xe9c349,
          transparent: true,
          opacity: isSignBoundary ? 0.5 : 0.34,
        })
      );
      zodiacDegreeTickLines.push(line);
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
        hoverTargets.push(mesh);
        natalLayerLabels.push({ mesh, brightOpacity: item.opacity, dimOpacity: 0.34 });
      } else if (item.label === "現行天体") {
        mesh.userData.tooltip = "現行天体";
        hoverTargets.push(mesh);
        transitLayerLabels.push({ mesh, brightOpacity: item.opacity, dimOpacity: 0.34 });
      }
      group.add(mesh);
    });

    sceneSky.natalPoints.forEach((point, index) => {
      const isNatalAngle = TRANSIT_ANGLE_ORDER.includes(point.planet);
      const baseY = 0.42 + (index % 2) * 0.16;
      const position = longitudePosition(point.longitude, natalPlanetRadius, baseY);
      const material = isNatalAngle
        ? new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color(point.color) })
        : planetMaterial({ ...point, estimated: false }, textures);
      material.transparent = true;
      material.opacity = isNatalAngle ? 0 : 0.24;
      material.depthWrite = false;
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.14, 72, 48), material);
      mesh.position.copy(position);
      mesh.visible = !isNatalAngle;
      mesh.userData.tooltip = `あなたの${planetLabel(point.planet)}`;
      mesh.userData.natalPlanet = point.planet;
      mesh.scale.setScalar(0.86);
      if (!isNatalAngle) {
        spinningMeshes.push({ mesh, speed: 0.0025 });
        hoverTargets.push(mesh);
      }
      const natalMeshEntry = { mesh, material, point, baseY, isAngle: isNatalAngle, hitMesh: null };
      natalMeshes.set(point.planet, natalMeshEntry);
      group.add(mesh);

      if (!isNatalAngle) {
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
        natalMeshEntry.hitMesh = hitMesh;
        hoverTargets.push(hitMesh);
        group.add(hitMesh);
      }

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
      const isTransitAngle = TRANSIT_ANGLE_ORDER.includes(item.planet);
      const position = longitudePosition(item.longitude, transitPlanetRadius, (index % 2) * 0.18);
      transitPositions.set(item.planet, position.clone());
      const transitVisual = {
        longitude: item.longitude,
        baseY: (index % 2) * 0.18,
        objects: [],
      };
      if (isTransitAngle) {
        const anchor = new THREE.Object3D();
        anchor.position.copy(position);
        transitVisual.objects.push(anchor);
        group.add(anchor);

        const symbolTexture = planetSymbolTexture(PLANET_SYMBOLS[item.planet] || item.label, item.color);
        textures.push(symbolTexture);
        const symbolSprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: symbolTexture,
            transparent: true,
            opacity: 0.9,
            depthTest: false,
            depthWrite: false,
          })
        );
        const symbolScale = 0.48;
        symbolSprite.scale.set(symbolScale, symbolScale, 1);
        symbolSprite.renderOrder = 7;
        symbolSprite.userData.tooltip = item.label;
        symbolSprite.userData.transitPlanet = item.planet;
        hoverTargets.push(symbolSprite);
        symbolBillboards.push({ sprite: symbolSprite, target: anchor, offset: 0, baseScale: symbolScale });
        transitLayerObjects.push({
          planet: item.planet,
          object: symbolSprite,
          brightOpacity: 0.9,
          dimOpacity: 0.18,
          flatBrightOpacity: 1,
          flatDimOpacity: 0.34,
        });
        group.add(symbolSprite);
        transitVisuals.set(item.planet, transitVisual);
        return;
      }
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
        new THREE.SphereGeometry(radius, 96, 64),
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
        const saturnRingTexture = loadSaturnRingTexture(textures);
        const saturnRing = new THREE.Mesh(
          new THREE.RingGeometry(radius * 1.1, radius * 2.32, 192),
          new THREE.MeshBasicMaterial({
            map: saturnRingTexture,
            color: 0xffffff,
            transparent: true,
            opacity: 0.92,
            alphaTest: 0.015,
            side: THREE.DoubleSide,
            depthWrite: false,
          })
        );
        saturnRing.position.copy(position);
        saturnRing.rotation.x = Math.PI / 2.6;
        saturnRing.rotation.z = 0.45;
        saturnRing.renderOrder = 1;
        transitVisual.objects.push(saturnRing);
        transitLayerObjects.push({
          planet: item.planet,
          object: saturnRing,
          brightOpacity: saturnRing.material.opacity,
          dimOpacity: 0.08,
        });
        group.add(saturnRing);
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
      natalHouseLines,
      natalHouseLabels,
      natalLayerLabels,
      natalPlanetSymbols,
      transitLayerObjects,
      transitHouseLabels,
      transitHouseLines,
      transitZodiacLines,
      zodiacDegreeTickLines,
      transitLayerLabels,
      transitPositions,
      transitVisuals,
      mapRadii,
      baseMapRadii: { ...mapRadii },
      mapRings,
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
          .find((item) => item?.object?.userData?.natalPlanet || item?.object?.userData?.transitPlanet);
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
        const outwardDirection = new THREE.Vector3(target.position.x, 0, target.position.z).normalize();
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
            const magnitude = Math.ceil(shiftStep / 2) * 0.18;
            sprite.position.x = target.position.x + outwardDirection.x * magnitude;
            sprite.position.z = target.position.z + outwardDirection.z * magnitude;
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
      mesh.visible = showNatalMapLayer && !TRANSIT_ANGLE_ORDER.includes(planet);
    });

    state.selectedPulseMesh = aspectLineFocus?.type === "natal" ? state.natalMeshes.get(aspectLineFocus.planet)?.mesh || null : null;
    state.selectedPulseBaseScale = 1.32;

    state.natalHouseLabels.forEach(({ mesh, brightOpacity, dimOpacity }) => {
      mesh.material.opacity = natalLayerActive ? brightOpacity : dimOpacity;
      mesh.visible = showNatalMapLayer;
    });
    state.natalLayerLabels.forEach(({ mesh, brightOpacity, dimOpacity }) => {
      mesh.material.opacity = natalLayerActive ? brightOpacity : dimOpacity;
      mesh.visible = showNatalMapLayer;
    });
    state.natalPlanetSymbols.forEach(({ sprite, planet, brightOpacity, dimOpacity, normalTexture, flatTexture }) => {
      const isAspectFocused = focusedNatalPlanets.has(planet);
      const shouldHighlight = isAspectFocused;
      sprite.material.map = isFlatMapView && flatTexture ? flatTexture : normalTexture;
      sprite.material.needsUpdate = true;
      sprite.material.opacity = isFlatMapView
        ? (shouldHighlight ? 1 : natalLayerActive ? 1 : 0.08)
        : shouldHighlight ? 1 : natalLayerActive ? brightOpacity : Math.min(dimOpacity, 0.08);
      sprite.visible = showNatalMapLayer;
    });
    state.transitLayerObjects.forEach((entry) => {
      const object = entry.object || entry;
      object.visible = showTransitMapLayer;
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
      mesh.visible = showTransitMapLayer;
    });
    state.transitHouseLines.forEach(({ line, brightOpacity }) => {
      line.material.opacity = transitLayerActive ? brightOpacity : 0.045;
      line.visible = showTransitMapLayer;
    });
    state.transitLayerLabels.forEach(({ mesh, brightOpacity, dimOpacity }) => {
      mesh.material.opacity = transitLayerActive ? brightOpacity : dimOpacity;
      mesh.visible = showTransitMapLayer;
    });

    const hasCheckedAspectTargets = Boolean(
      (aspectLineMode !== "custom" && aspectLineMode !== "none")
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
  }, [sky, natalLayerActive, transitLayerActive, isFlatMapView, aspectLineFocus, selectedAspectLineHighlightKey, focusedNatalPlanets, activeAspectLineAspects, aspectLineSelections, aspectLineMode, mapPlanetDisplayMode]);

  useEffect(() => {
    const state = sceneStateRef.current;
    if (!state?.group || !state.baseMapRadii) return;

    const natalOnly = mapPlanetDisplayMode === "natal";
    const transitOnly = mapPlanetDisplayMode === "transit";
    const showNatal = !transitOnly;
    const showTransit = !natalOnly;
    const base = state.baseMapRadii;
    const expandedPlanetRadius = (base.natalHouseInnerRadius + base.transitOrbitRadius) / 2;
    const targetRadii = {
      ...base,
      natalHouseOuterRadius: natalOnly ? base.transitOrbitRadius : base.natalHouseOuterRadius,
      natalHouseLabelRadius: natalOnly ? expandedPlanetRadius : base.natalHouseLabelRadius,
      natalPlanetRadius: natalOnly ? expandedPlanetRadius : base.natalPlanetRadius,
      transitHouseInnerRadius: transitOnly ? base.natalHouseInnerRadius : base.transitHouseInnerRadius,
      transitHouseLabelRadius: transitOnly ? expandedPlanetRadius : base.transitHouseLabelRadius,
      transitPlanetRadius: transitOnly ? expandedPlanetRadius : base.transitPlanetRadius,
    };
    const applyMapLayout = (radii, revealBothLayers = false) => {
      state.mapRadii = radii;
      const layoutShowNatal = revealBothLayers || showNatal;
      const layoutShowTransit = revealBothLayers || showTransit;

      const updateLine = (line, start, end) => {
        const position = line?.geometry?.attributes?.position;
        if (!position || position.count < 2) return;
        position.setXYZ(0, start.x, start.y, start.z);
        position.setXYZ(1, end.x, end.y, end.z);
        position.needsUpdate = true;
      };

      state.natalHouseLines.forEach(({ line, index }) => {
        const longitude = sceneSky.natalHouseCusps[index];
        if (longitude === undefined) return;
        updateLine(
          line,
          longitudePosition(longitude, radii.natalHouseInnerRadius, -0.03),
          longitudePosition(longitude, radii.natalHouseOuterRadius, -0.03)
        );
        line.visible = layoutShowNatal;
      });
      state.natalHouseLabels.forEach(({ mesh, index }) => {
        const longitude = sceneSky.natalHouseCusps[index];
        const nextLongitude = sceneSky.natalHouseCusps[(index + 1) % sceneSky.natalHouseCusps.length];
        if (longitude === undefined || nextLongitude === undefined) return;
        setOrbitTextPlaneTransform(mesh, midpointLongitude(longitude, nextLongitude), radii.natalHouseLabelRadius, 0.07);
        mesh.visible = layoutShowNatal;
      });

      state.transitHouseLines.forEach(({ line, index }) => {
        const longitude = sceneSky.transitHouseCusps[index];
        if (longitude === undefined) return;
        updateLine(
          line,
          longitudePosition(longitude, radii.transitHouseInnerRadius, -0.03),
          longitudePosition(longitude, radii.transitOrbitRadius, -0.03)
        );
        line.visible = layoutShowTransit;
      });
      state.transitHouseLabels.forEach(({ mesh, index }) => {
        const longitude = sceneSky.transitHouseCusps[index];
        const nextLongitude = sceneSky.transitHouseCusps[(index + 1) % sceneSky.transitHouseCusps.length];
        if (longitude === undefined || nextLongitude === undefined) return;
        setOrbitTextPlaneTransform(mesh, midpointLongitude(longitude, nextLongitude), radii.transitHouseLabelRadius, 0.07);
        mesh.visible = layoutShowTransit;
      });

      state.transitZodiacLines.forEach((line) => {
        line.visible = true;
      });
      state.zodiacDegreeTickLines.forEach((line) => {
        line.visible = true;
      });
      state.mapRings.forEach(({ mesh, role, radius }) => {
        const desiredRadius = role === "natalOuter"
          ? radii.natalHouseOuterRadius
          : role === "transitInner" ? radii.transitHouseInnerRadius : radius;
        mesh.visible = role === "zodiacOuter"
          || (role === "transitInner" ? revealBothLayers || transitOnly : false)
          || (role.startsWith("natal") && layoutShowNatal)
          || (role.startsWith("transit") && role !== "transitInner" && layoutShowTransit);
        mesh.scale.setScalar(radius ? desiredRadius / radius : 1);
      });

      state.natalLayerLabels.forEach(({ mesh }) => {
        setOrbitTextPlaneTransform(mesh, 262, base.natalOrbitRadius, 0.11);
        mesh.visible = layoutShowNatal;
      });
      state.transitLayerLabels.forEach(({ mesh }) => {
        setOrbitTextPlaneTransform(mesh, 262, base.transitOrbitRadius, 0.11);
        mesh.visible = layoutShowTransit;
      });

      state.natalMeshes.forEach(({ mesh, hitMesh, point, baseY, isAngle }) => {
        const position = longitudePosition(point.longitude, radii.natalPlanetRadius, baseY);
        mesh.position.copy(position);
        if (hitMesh) hitMesh.position.copy(position);
        mesh.visible = layoutShowNatal && !isAngle;
        if (hitMesh) hitMesh.visible = layoutShowNatal;
      });
      state.natalPlanetSymbols.forEach(({ sprite }) => {
        sprite.visible = layoutShowNatal;
      });

      state.transitVisuals.forEach((visual, planet) => {
        const position = longitudePosition(visual.longitude, radii.transitPlanetRadius, visual.baseY);
        visual.objects.forEach((object) => {
          object.position.copy(position);
          object.visible = layoutShowTransit;
        });
        state.transitPositions.set(planet, position.clone());
      });
      state.transitLayerObjects.forEach(({ object }) => {
        object.visible = layoutShowTransit;
      });
      state.aspectGroup.children.forEach((line) => {
        line.visible = showNatal && showTransit && line.userData?.aspectVisible !== false;
      });
      updateAspectLinePositions(state);
    };

    const startRadii = state.mapRadii || base;
    const duration = 560;
    const startedAt = performance.now();
    let animationFrame = 0;
    const animateLayout = (now) => {
      const progress = clamp((now - startedAt) / duration, 0, 1);
      const easedProgress = progress * progress * (3 - 2 * progress);
      const animatedRadii = Object.keys(base).reduce((result, key) => {
        const start = Number(startRadii[key] ?? base[key]);
        const target = Number(targetRadii[key] ?? base[key]);
        result[key] = start + (target - start) * easedProgress;
        return result;
      }, {});
      applyMapLayout(animatedRadii, progress < 1);
      if (progress < 1) {
        animationFrame = window.requestAnimationFrame(animateLayout);
      } else {
        applyMapLayout(targetRadii, false);
      }
    };
    animationFrame = window.requestAnimationFrame(animateLayout);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [mapPlanetDisplayMode, sceneSky]);

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
      const isFullscreen = document.fullscreenElement === frameRef.current;
      setIsMapFullscreen(isFullscreen);
      if (isMobileViewport()) {
        setIsMobileChartPanelDetached(!isFullscreen);
        setIsFullscreenMobileChartPanelOpen(false);
      }
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
      if (aspect.category === "natalOnly") return "compositeNatal";
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
      } else if (nextMode === "compositeNatal") {
        setCompoundAspectListCategory("natalOnly");
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
      const rangeOption = TRANSIT_PLAYBACK_RANGE_OPTIONS.find((option) => option.key === transitPlaybackRange)
        || TRANSIT_PLAYBACK_RANGE_OPTIONS[0];
      const remainingDates = (selectableDates.length
        ? selectableDates.slice(0, rangeOption.days)
        : [selectedDate]
      ).filter(Boolean);
      const playbackStartDate = remainingDates[0] || selectedDate;
      const playbackStepDays = isMobilePlayback ? 1 : transitPlaybackStepDays;
      const playbackDates = remainingDates.filter((_, index) => index % playbackStepDays === 0);
      const finalRemainingDate = remainingDates[remainingDates.length - 1];
      if (finalRemainingDate && playbackDates.length === 1 && finalRemainingDate !== playbackDates[0]) {
        playbackDates.push(finalRemainingDate);
      }
      await preloadTransitChartsForDates(selectedTransitTime, remainingDates, (completed, total) => {
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
  const resetMapSettings = () => {
    const state = sceneStateRef.current;
    if (state?.playbackSequence) state.playbackSequence.active = false;
    const nextOffset = defaultMapOffset();
    hasManualMapPositionRef.current = false;
    setMapZoom(defaultMapZoom());
    setMapOffset(nextOffset);
    setIsRotationPaused(false);
    setIsFlatMapView(false);
    setSelectedNatalPlanet("SUN");
    setIsTransitPlaybackActive(false);
    setIsTransitPlaybackPreloading(false);
    setTransitPlaybackPreloadProgress(0);
    setTransitPlaybackCursor(null);
    setPlaybackTransitChart(null);
    setTransitPlaybackStepDays(1);
    setTransitPlaybackRange("month");
    setIsTransitTableCollapsed(false);
    setIsNatalTableCollapsed(false);
    setMobilePlanetTableTab("transit");
    setMapPlanetDisplayMode("both");
    setIsMapPlanetDisplayPanelOpen(false);
    setIsMapControlsMenuOpen(false);
    setIsMapPositionPanelOpen(false);
    setIsPlaybackPanelOpen(false);
    setIsAspectPanelOpen(false);
    setIsAspectListPanelOpen(false);
    setIsMobileAspectListDetached(false);
    setIsMobileChartPanelDetached(true);
    setIsFullscreenMobileChartPanelOpen(false);
    setAspectLineMode("none");
    setAspectLineSelections(EMPTY_ASPECT_SELECTIONS);
    setAspectInterpretationScope("none");
    setCompoundAspectListCategory("mixed");
    setTooltipCompositeTab("compound");
    setAspectTooltip(null);
    setAspectLineFocus(null);
    setSelectedAspectLineHighlightKey("");
    setOpenTooltipAspectKeys(new Set());
    setOpenAspectInterpretationKeys(new Set());
    setAspectTooltipPanelPosition(null);
    setAspectListPanelPosition({ x: 520, y: 104 });
    setMobileAspectListPanelPosition({ x: 10, y: 132 });
    if (!state?.camera || !state?.group) return;
    state.hasManualTilt = false;
    state.cameraTiltDegrees = 17;
    state.camera.position.z = 10.5;
    state.camera.position.y = cameraYForTiltDegrees(state.cameraTiltDegrees);
    state.camera.lookAt(0, 0, 0);
    state.group.rotation.x = 0.18;
    state.group.rotation.y = 0.22;
    applyMapOffset(state.group, nextOffset, false);
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
  const selectMapPlanetDisplayMode = (mode) => {
    if (!MAP_PLANET_DISPLAY_MODE_OPTIONS.some((option) => option.key === mode)) return;
    setMapPlanetDisplayMode(mode);
    setIsMapPlanetDisplayPanelOpen(false);
  };
  const MapPlanetDisplaySelector = ({ compact = false } = {}) => {
    return (
      <div className={cx("relative z-[120] rounded-xl border border-white/10 bg-[#121414]/78 shadow-[0_10px_26px_rgba(0,0,0,0.24)] backdrop-blur-md", compact ? "w-max p-1" : "p-1.5")}>
        <button
          type="button"
          onClick={() => {
            setIsMapPlanetDisplayPanelOpen((value) => {
              const next = !value;
              if (next) {
                setIsPlaybackPanelOpen(false);
                setIsAspectPanelOpen(false);
              }
              return next;
            });
          }}
          className={cx("inline-flex items-center rounded-lg px-2 font-mono font-bold text-mist transition hover:bg-white/10 hover:text-gold focus:outline-none focus:ring-2 focus:ring-gold/45", compact ? "h-7 text-[8px]" : "h-8 w-max text-[9px] sm:text-[10px]")}
          aria-expanded={isMapPlanetDisplayPanelOpen}
          aria-controls={`map-planet-display-options-${compact ? "mobile" : "desktop"}`}
          aria-label={`表示天体: ${selectedMapPlanetDisplayMode.label}`}
          title="表示天体を切り替え"
        >
          <span>{selectedMapPlanetDisplayMode.label}</span>
        </button>
        <div
          id={`map-planet-display-options-${compact ? "mobile" : "desktop"}`}
          className={cx(
            "absolute top-0 z-[110] flex w-max gap-1 rounded-xl border border-white/10 bg-[#121414]/94 font-mono font-bold shadow-[0_18px_42px_rgba(0,0,0,0.42)] backdrop-blur-md transition",
            compact ? "left-full ml-1 p-1" : "right-full mr-1 p-1.5",
            isMapPlanetDisplayPanelOpen ? "pointer-events-auto translate-x-0 opacity-100" : "pointer-events-none translate-x-1 opacity-0"
          )}
          aria-hidden={!isMapPlanetDisplayPanelOpen}
        >
          {MAP_PLANET_DISPLAY_MODE_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              onPointerDown={(event) => {
                event.stopPropagation();
                selectMapPlanetDisplayMode(option.key);
              }}
              onPointerUp={(event) => {
                event.stopPropagation();
                selectMapPlanetDisplayMode(option.key);
              }}
              onClick={() => selectMapPlanetDisplayMode(option.key)}
              className={cx(
                "whitespace-nowrap rounded-lg px-2 text-left transition",
                compact ? "h-7 text-[8px]" : "py-2 text-[9px] sm:text-[10px]",
                mapPlanetDisplayMode === option.key ? "bg-gold/18 text-gold ring-1 ring-gold/35" : "text-mist/75 hover:bg-white/10 hover:text-starlight"
              )}
              aria-pressed={mapPlanetDisplayMode === option.key}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    );
  };
  const MobileChartDisplayPanel = () => (
    <>
      <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-white/[0.025] p-1 font-mono text-[9px] font-bold">
        {[
          ["transit", "現行天体"],
          ["natal", "ネイタル"],
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
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className={cx("font-mono text-[9px] font-bold", transitLayerActive ? "text-gold/80" : "text-mist/45")}>現行天体</span>
            {isMapFullscreen ? (
              <button
                type="button"
                onClick={() => setIsFullscreenMobileChartPanelOpen(false)}
                onPointerDown={(event) => event.stopPropagation()}
                className="inline-flex h-6 shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-white/10 bg-white/[0.04] px-1.5 font-mono text-[8px] font-bold text-mist/80 transition hover:border-gold/35 hover:bg-gold/10 hover:text-gold focus:outline-none focus:ring-2 focus:ring-gold/35"
                aria-label="現行天体チャートを最小化"
                title="最小化"
              >
                最小化
              </button>
            ) : null}
          </div>
          <div className="mb-1 grid grid-cols-[0.5rem_2.45rem_2.7rem_1.45rem_2.45rem] items-center gap-1 px-1 font-mono text-[8px] font-bold text-mist/45">
            <span />
            <span>天体</span>
            <span>星座</span>
            <span className="text-right">度数</span>
            <span className="text-right">室</span>
          </div>
          <div className={cx("grid grid-cols-2 gap-1 font-mono text-[9px] font-bold", transitLayerActive ? "text-mist" : "text-mist/25")}>
            {[...tableSky.transits, ...tableTransitNodeItems].map((item) => {
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
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className={cx("font-mono text-[9px] font-bold", natalLayerActive ? "text-gold" : "text-mist/55")}>ネイタル</span>
            {isMapFullscreen ? (
              <button
                type="button"
                onClick={() => setIsFullscreenMobileChartPanelOpen(false)}
                onPointerDown={(event) => event.stopPropagation()}
                className="inline-flex h-6 shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-white/10 bg-white/[0.04] px-1.5 font-mono text-[8px] font-bold text-mist/80 transition hover:border-gold/35 hover:bg-gold/10 hover:text-gold focus:outline-none focus:ring-2 focus:ring-gold/35"
                aria-label="ネイタルチャートを最小化"
                title="最小化"
              >
                最小化
              </button>
            ) : null}
          </div>
          <div className="mb-1 grid grid-cols-[0.5rem_2.45rem_2.7rem_1.45rem_2.45rem] items-center gap-1 px-1 font-mono text-[8px] font-bold text-mist/45">
            <span />
            <span>天体</span>
            <span>星座</span>
            <span className="text-right">度数</span>
            <span className="text-right">室</span>
          </div>
          <div className={cx("grid grid-cols-2 gap-1 font-mono text-[9px] font-bold", natalLayerActive ? "text-mist" : "text-mist/25")}>
            {[...sky.natalPoints, ...tableNatalNodeItems].map((item) => {
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
    </>
  );
  const MobileAspectDisplaySelector = () => (
    <div className="relative z-[119] flex w-max items-start font-mono text-[8px] font-bold sm:hidden">
      <div className="rounded-xl border border-white/10 bg-[#121414]/78 p-1 shadow-[0_10px_26px_rgba(0,0,0,0.24)] backdrop-blur-md">
        <button
          type="button"
          onClick={() => {
            setIsMapPlanetDisplayPanelOpen(false);
            setIsPlaybackPanelOpen(false);
            setIsAspectPanelOpen((value) => !value);
          }}
          className={cx(
            "inline-flex h-7 items-center gap-1 rounded-lg px-2 text-mist transition hover:bg-white/10 hover:text-gold focus:outline-none focus:ring-2 focus:ring-gold/45",
            isAspectPanelOpen && "bg-gold/15 text-gold"
          )}
          aria-expanded={isAspectPanelOpen}
          aria-controls="mobile-aspect-display-options"
        >
          <span>{isAspectPanelOpen ? "<<" : ">>"}</span>
          <span>{isAspectPanelOpen ? "アスペクト表示" : selectedAspectDisplayMode.label}</span>
        </button>
      </div>
      <div
        id="mobile-aspect-display-options"
        className={cx(
          "absolute left-full top-0 ml-1 max-h-[min(420px,calc(100dvh-170px))] overflow-y-auto rounded-xl border border-white/10 bg-[#121414]/94 font-mono font-bold text-mist shadow-[0_18px_42px_rgba(0,0,0,0.42)] backdrop-blur-md transition-all duration-300 ease-out [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          isAspectPanelOpen
            ? "pointer-events-auto w-[min(300px,calc(100vw-110px))] translate-x-0 p-1.5 opacity-100"
            : "pointer-events-none w-0 -translate-x-2 border-transparent p-0 opacity-0"
        )}
        aria-hidden={!isAspectPanelOpen}
      >
        <div className="grid grid-cols-2 gap-1">
          {ASPECT_DISPLAY_MODE_OPTIONS.map((option) => (
            <button
              key={`mobile-map-aspect-mode-${option.key}`}
              type="button"
              onClick={() => selectAspectLineMode(option.key)}
              className={cx(
                "min-h-9 rounded-lg border px-1 py-1 text-left transition",
                aspectLineMode === option.key
                  ? "border-gold/50 bg-gold/18 text-gold ring-1 ring-gold/35"
                  : "border-white/10 bg-white/[0.03] text-mist/65 hover:text-starlight"
              )}
              aria-pressed={aspectLineMode === option.key}
            >
              <span className="block text-[9px] leading-4">{option.label}</span>
              <span className="block text-[7px] leading-3 text-mist/50">{option.description}</span>
            </button>
          ))}
        </div>
        {aspectLineMode === "custom" ? (
          <div className="mt-1.5 grid gap-1.5">
            {ASPECT_LINE_SCOPE_OPTIONS.map((option) => (
              <section key={`mobile-map-aspect-custom-${option.key}`} className="rounded-lg border border-white/10 bg-white/[0.025] p-1.5">
                <div className="mb-1.5 flex items-center justify-between gap-1">
                  <div className="min-w-0">
                    <p className="truncate text-[9px] text-starlight">{option.label}</p>
                    <p className="truncate text-[7px] text-mist/50">{option.shortLabel}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => setAspectLineGroupSelection(option.key, "all")} className="h-6 rounded border border-white/10 bg-white/[0.03] px-1.5 text-[7px] text-mist/70">全選択</button>
                    <button type="button" onClick={() => setAspectLineGroupSelection(option.key, "none")} className="h-6 rounded border border-white/10 bg-white/[0.03] px-1.5 text-[7px] text-mist/70">全解除</button>
                  </div>
                </div>
                <div className="grid gap-1">
                  {option.key !== "natalNatal" ? (
                    <div className="grid grid-cols-5 gap-1" aria-label={`${option.title}の現行天体`}>
                      {sky.transits.map((item) => {
                        const checked = aspectLineSelections[option.key].transit.includes(item.planet);
                        return (
                          <label key={`mobile-map-aspect-${option.key}-transit-${item.planet}`} className={cx("flex h-7 cursor-pointer items-center justify-center rounded-md border text-[12px] transition", checked ? "border-sky-300/45 bg-sky-300/15 text-sky-100" : "border-white/10 bg-white/[0.03] text-mist/65")} title={`現行${planetLabel(item.planet)}`}>
                            <input type="checkbox" checked={checked} onChange={() => toggleAspectLineSelection(option.key, "transit", item.planet)} className="sr-only" />
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
                          <label key={`mobile-map-aspect-${option.key}-natal-${item.planet}`} className={cx("flex h-7 cursor-pointer items-center justify-center rounded-md border text-[11px] transition", checked ? "border-gold/50 bg-gold/15 text-gold" : "border-white/10 bg-white/[0.03] text-mist/65")} title={`ネイタル${planetLabel(item.planet)}`}>
                            <input type="checkbox" checked={checked} onChange={() => toggleAspectLineSelection(option.key, "natal", item.planet)} className="sr-only" />
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
  );

  return (
    <GlassPanel className="overflow-hidden border-gold/25 p-0">
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
            <div className="inline-flex w-max items-center gap-1">
              <button
                type="button"
                onClick={resetMapSettings}
                className="inline-flex h-8 items-center gap-1 rounded-xl border border-white/10 bg-[#121414]/72 px-2 font-mono text-[9px] font-bold text-mist shadow-[0_10px_26px_rgba(0,0,0,0.28)] backdrop-blur transition hover:bg-white/10 hover:text-gold focus:outline-none focus:ring-2 focus:ring-gold/45"
                aria-label="3Dマップの設定を初期状態に戻す"
                title="初期設定に戻す"
              >
                <RefreshCw size={13} />
                <span>リセット</span>
              </button>
              <div className="inline-flex h-8 items-center gap-1 rounded-xl border border-white/10 bg-[#121414]/72 px-0.5 shadow-[0_10px_26px_rgba(0,0,0,0.28)] backdrop-blur">
              <button type="button" onClick={zoomOutMap} disabled={mapZoom <= minimumMapZoom()} className="inline-flex h-7 w-8 items-center justify-center rounded-lg text-mist transition hover:bg-white/10 hover:text-gold disabled:opacity-35" aria-label="3Dマップを縮小" title="縮小"><Minus size={15} /></button>
              <button type="button" onClick={zoomInMap} disabled={mapZoom >= 1.35} className="inline-flex h-7 w-8 items-center justify-center rounded-lg text-mist transition hover:bg-white/10 hover:text-gold disabled:opacity-35" aria-label="3Dマップを拡大" title="拡大"><Plus size={15} /></button>
              <button type="button" onClick={() => setIsRotationPaused((value) => !value)} className="inline-flex h-7 w-9 items-center justify-center rounded-lg font-mono text-[7px] font-bold leading-[0.95] text-mist transition hover:bg-white/10 hover:text-gold" aria-label={isRotationPaused ? "3Dマップの回転を再開" : "3Dマップの回転を停止"} title={isRotationPaused ? "回転再開" : "回転停止"}>
                <span>{isRotationPaused ? <>回転<br />再開</> : <>回転<br />停止</>}</span>
              </button>
              <button type="button" onClick={toggleFlatMapView} className="inline-flex h-7 w-8 items-center justify-center rounded-lg font-mono text-[9px] font-bold text-mist transition hover:bg-white/10 hover:text-gold" aria-label={isFlatMapView ? "3Dマップを立体表示に戻す" : "3Dマップを平面表示で見る"} title={isFlatMapView ? "3D表示" : "平面表示"}>{isFlatMapView ? "3D" : "2D"}</button>
              <button
                type="button"
                onClick={toggleTransitPlayback}
                className={cx(
                  "relative inline-flex h-7 w-12 items-center justify-center overflow-hidden rounded-lg text-mist transition hover:bg-white/10 hover:text-gold disabled:cursor-wait disabled:opacity-90",
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
              <span
                className="inline-flex h-7 shrink-0 items-center gap-1 border-l border-white/10 px-1.5 font-mono text-[7px] font-bold text-mist/65"
                aria-label="連続再生期間は今日の前後15日"
              >
                <span>期間</span>
                <span className="text-cyan-100">今日±15</span>
              </span>
              </div>
            </div>
            <MapPlanetDisplaySelector compact />
            <MobileAspectDisplaySelector />
          </div>
          <div className="absolute right-2 top-2 z-30 sm:hidden">
            <button type="button" onClick={toggleMapFullscreen} className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-[#121414]/72 text-mist shadow-[0_10px_26px_rgba(0,0,0,0.28)] backdrop-blur transition hover:bg-white/10 hover:text-gold" aria-label={isMapFullscreen ? "3Dマップの全画面を閉じる" : "3Dマップを全画面で表示"} title={isMapFullscreen ? "全画面を閉じる" : "全画面"}>{isMapFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>
          </div>
          {!isMobileChartPanelDetached && (!isMapFullscreen || isFullscreenMobileChartPanelOpen) ? (
            <div
              className={cx(
                "absolute inset-x-2 z-30 overflow-y-auto rounded-2xl border border-white/10 bg-[#121414]/76 p-2 font-mono text-[9px] font-bold text-mist shadow-[0_18px_42px_rgba(0,0,0,0.28)] backdrop-blur-md sm:hidden",
                isMapFullscreen ? "bottom-12 max-h-[calc(100%-6rem)]" : "bottom-2 max-h-[calc(100%-3.5rem)]"
              )}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <MobileChartDisplayPanel />
            </div>
          ) : null}
          {isMapFullscreen && !isMobileChartPanelDetached ? (
            <div className="absolute bottom-2 left-1/2 z-30 -translate-x-1/2 sm:hidden">
              <button
                type="button"
                onClick={() => setIsFullscreenMobileChartPanelOpen((value) => !value)}
                className={cx(
                  "inline-flex h-9 items-center gap-1 rounded-xl border px-2 font-mono text-[9px] font-bold shadow-[0_10px_26px_rgba(0,0,0,0.28)] backdrop-blur transition",
                  isFullscreenMobileChartPanelOpen ? "border-gold/35 bg-gold/15 text-gold" : "border-white/10 bg-[#121414]/72 text-mist hover:bg-white/10 hover:text-gold"
                )}
                aria-expanded={isFullscreenMobileChartPanelOpen}
                aria-label={isFullscreenMobileChartPanelOpen ? "チャートを最小化" : "チャートを表示"}
              >
                <span>{isFullscreenMobileChartPanelOpen ? "<<" : ">>"}</span>
                <span>チャート</span>
              </button>
            </div>
          ) : null}
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
              "z-[130] flex flex-col overflow-hidden rounded-xl border border-white/10 bg-[#121414]/48 p-2 font-mono text-[9px] font-bold text-mist shadow-[0_18px_42px_rgba(0,0,0,0.24)] backdrop-blur-sm transition-opacity duration-300 sm:hidden",
              isMobileAspectListDetached ? "hidden" : "absolute inset-x-2 bottom-12 h-[min(380px,calc(100%-6rem))]",
              isAspectListPanelOpen ? "opacity-100" : "pointer-events-none border-transparent opacity-0"
            )}
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
              className="mb-2 flex select-none flex-nowrap items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.055] px-2 py-1.5 pr-7 text-starlight"
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
                    onClick={() => selectCompoundAspectListCategory(value)}
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
          <div className="absolute right-4 top-4 z-30 hidden items-center gap-1.5 sm:flex">
            <button
              type="button"
              onClick={resetMapSettings}
              className="inline-flex h-8 items-center gap-1 rounded-xl border border-white/10 bg-[#121414]/72 px-2 font-mono text-[9px] font-bold text-mist shadow-[0_10px_26px_rgba(0,0,0,0.28)] backdrop-blur transition hover:bg-white/10 hover:text-gold focus:outline-none focus:ring-2 focus:ring-gold/45 sm:text-[10px]"
              aria-label="3Dマップの設定を初期状態に戻す"
              title="初期設定に戻す"
            >
              <RefreshCw size={14} />
              <span>リセット</span>
            </button>
            <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#121414]/72 p-1 shadow-[0_10px_26px_rgba(0,0,0,0.28)] backdrop-blur">
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
          </div>
          <div
            className={cx(
              "absolute right-4 top-16 z-30 hidden justify-items-end gap-1.5 sm:grid"
            )}
          >
            <MapPlanetDisplaySelector />
            <div className="flex items-start gap-1.5">
              <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#121414]/68 p-1.5 shadow-[0_10px_26px_rgba(0,0,0,0.24)] backdrop-blur">
                <button
                  type="button"
                  onClick={toggleTransitPlayback}
                  className={cx(
                    "relative inline-flex h-8 items-center gap-1.5 overflow-hidden rounded-lg px-2 font-mono text-[9px] font-bold transition focus:outline-none focus:ring-2 focus:ring-gold/45 disabled:cursor-wait disabled:opacity-90 sm:text-[10px]",
                    isTransitPlaybackActive ? "bg-gold/15 text-gold" : "text-cyan-200/85 hover:bg-white/10 hover:text-cyan-100"
                  )}
                  aria-pressed={isTransitPlaybackActive}
                  aria-label={isTransitPlaybackActive ? "現行天体の再生を停止" : "現行天体を再生"}
                  title={isTransitPlaybackPreloading ? "読込中" : isTransitPlaybackActive ? "再生停止" : "再生"}
                  disabled={isTransitPlaybackPreloading}
                >
                  {isTransitPlaybackPreloading ? (
                    <>
                      <span
                        className="absolute inset-y-0 left-0 bg-cyan-300/25 transition-[width] duration-200"
                        style={{ width: `${Math.max(4, transitPlaybackPreloadProgress)}%` }}
                        aria-hidden="true"
                      />
                      <span className="relative z-10 whitespace-nowrap">読込中</span>
                    </>
                  ) : (
                    <>
                      {isTransitPlaybackActive ? <Pause size={14} /> : <Play size={14} />}
                      <span>{isTransitPlaybackActive ? "停止" : "再生"}</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsMapPlanetDisplayPanelOpen(false);
                    setIsPlaybackPanelOpen((value) => !value);
                  }}
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
                  onClick={() => {
                    setIsMapPlanetDisplayPanelOpen(false);
                    setIsAspectPanelOpen((value) => !value);
                  }}
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
                        onClick={() => selectCompoundAspectListCategory(value)}
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
              aria-label={isMapControlsMenuOpen ? "チャートメニューを閉じる" : "チャートメニューを開く"}
              title="チャート"
            >
              <SlidersHorizontal size={15} />
              チャート
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
                    <span className={cx("font-mono text-[8px] font-bold uppercase tracking-[0.16em]", transitLayerActive ? "text-gold/80" : "text-mist/45")}>現行天体</span>
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
                    {[...tableSky.transits, ...tableTransitNodeItems].map((item) => {
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
                    <span className={cx("font-mono text-[8px] font-bold uppercase tracking-[0.16em]", natalLayerActive ? "text-gold" : "text-mist/55")}>ネイタル天体</span>
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
                    {[...sky.natalPoints, ...tableNatalNodeItems].map((item) => {
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
            className="relative mx-0 mb-3 flex max-h-[46vh] min-h-[260px] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#121414]/72 p-2 font-mono text-[9px] font-bold text-mist shadow-[0_18px_42px_rgba(0,0,0,0.24)] backdrop-blur-sm sm:hidden"
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
                    onClick={() => selectCompoundAspectListCategory(value)}
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
        <section className={cx(
          "mx-0 grid gap-3 rounded-2xl border border-white/10 bg-[#121414]/76 p-2 shadow-[0_18px_42px_rgba(0,0,0,0.28)] backdrop-blur-md sm:hidden",
          !isMobileChartPanelDetached && "hidden"
        )}>
          <div className="grid gap-2"><MobileChartDisplayPanel /></div>
        </section>
      </div>
    </GlassPanel>
  );
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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

export function Horoscope3DMap({ data }) {
  const [freePlaybackAnchorDate] = useState(() => currentTokyoDate());
  const freePlaybackDays = useMemo(
    () => buildFreePlaybackDates(freePlaybackAnchorDate).map((date) => ({ date, all_aspects: [] })),
    [freePlaybackAnchorDate]
  );
  const [selectedMapDate, setSelectedMapDate] = useState(() => dateKey(data?.reading_date) || freePlaybackAnchorDate);
  const natalPoints = Array.isArray(data?.natal_points)
    ? data.natal_points
    : Array.isArray(data?.natalPoints)
      ? data.natalPoints
      : [];
  const natalHouseCusps = Array.isArray(data?.natal_house_cusps)
    ? data.natal_house_cusps
    : Array.isArray(data?.natalHouseCusps)
      ? data.natalHouseCusps
      : [];

  if (!natalPoints.length) return null;

  const mapDay = {
    date: selectedMapDate || freePlaybackAnchorDate,
    all_aspects: [],
  };
  const mapForecast = {
    natal_points: natalPoints,
    natal_house_cusps: natalHouseCusps,
  };
  const mapIdentity = [
    data?.meta?.birth_date,
    data?.meta?.birth_time,
    data?.meta?.birthplace,
    ...natalPoints.map((point) => `${point.planet || point.name}:${point.longitude ?? point.degree ?? ""}`),
  ].filter(Boolean).join("|");

  return (
    <div className="mb-5">
      <TransitNatalSunMap
        key={mapIdentity}
        day={mapDay}
        forecast={mapForecast}
        availableDays={freePlaybackDays}
        onSelectDate={setSelectedMapDate}
      />
    </div>
  );
}
