import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { featurePolicy, isLockedAspectMode } from "../v3/feature-policy.mjs";
import { requestPlaybackCharts } from "../v3/playback-request.mjs";
import { preloadTransitCharts } from "../src/transit-chart-preload.mjs";

const now = Date.parse("2026-09-14T00:00:00Z");
const paid = { state: "paid", valid_until: "2026-09-15T00:00:00Z", capabilities: {aspect_list:true, compound_aspects:true, stellar_forecast:true, playback_policy:"paid_existing"} };
test("only verified, unexpired capabilities enable paid features", () => {
  assert.deepEqual(featurePolicy(paid, now), {aspectList:true, compoundAspects:true, stellarForecast:true, freePlayback:false});
  for (const session of [null, {...paid,state:"anonymous"}, {...paid,state:"free"}, {...paid,state:"checking"}, {...paid,state:"unavailable"}, {...paid,valid_until:null}, {...paid,valid_until:"2026-09-14T00:00:00Z"}, {...paid,capabilities:{}}]) {
    assert.deepEqual(featurePolicy(session,now), {aspectList:false,compoundAspects:false,stellarForecast:false,freePlayback:true});
  }
});
test("free mode locks only compound presets, leaving all ordinary presets usable", () => {
  const free = featurePolicy(null,now);
  for (const mode of ["none", "transitNatal", "transitTransit", "natalNatal", "custom"]) assert.equal(isLockedAspectMode(mode, free), false);
  for (const mode of ["compositeTransit", "compositeTransitNatal", "compositeNatal"]) {
    assert.equal(isLockedAspectMode(mode, free), true);
    assert.equal(isLockedAspectMode(mode, featurePolicy(paid,now)), false);
  }
});
test("all list surfaces are gated, while planet-click detail remains available", () => {
  const source = readFileSync(new URL("../v3/horoscope-map.jsx", import.meta.url), "utf8");
  assert.equal((source.match(/\{canShowAspectList && \(/g)||[]).length, 3);
  assert.match(source,/canShowAspectList && isMobileAspectListDetached/);
  assert.equal((source.match(/disabled=\{isLockedAspectMode\(option.key, policy\)\}/g)||[]).length, 2);
  assert.match(source, /request: requestPlaybackCharts/);
  assert.match(source, /if \(isLockedAspectMode\(mode, policy\)\) return/);
  assert.match(source, /canShowCompoundAspects && \(isCompoundAspectMode/);
  assert.match(source, /if \(permissionVersion !== permissionVersionRef.current\) return/);
  assert.match(source, /setAspectTooltip\(nextFocus/);
});
test("V3 batch failures never fall back to unrestricted single requests", async t => {
  const previousFetch = globalThis.fetch;
  t.after(() => {globalThis.fetch = previousFetch;});
  for (const status of [403,404,405,503]) {
    const calls = [];
    globalThis.fetch = async url => { calls.push(url); return new Response(JSON.stringify({detail:"not allowed"}), {status}); };
    await assert.rejects(preloadTransitCharts({dates:["2026-09-14"], targetTime:"12:00",cache:new Map(),cacheKey:(d,t)=>d+t,request:requestPlaybackCharts,formPayload:{}}));
    assert.deepEqual(calls,["/api/v3/transit-charts"]);
  }
});
