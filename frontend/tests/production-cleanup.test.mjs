import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { build } from "vite";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("obsolete developer and snapshot entries are removed", async () => {
  for (const file of ["annual-biorhythm-dev.html", "src/annual-biorhythm-dev.jsx", "snapshot-personal.html", "src/snapshot-personal.jsx"]) {
    await assert.rejects(access(new URL(file, root)), { code: "ENOENT" });
  }
});

test("current main views and shared API calls remain, obsolete views do not", async () => {
  const dashboard = await source("src/dashboard-shared.jsx");
  const forecast = await source("src/forecast-detail.jsx");
  for (const name of ["DashboardV2CountdownCard", "DashboardV2DailyFlowCard", "DashboardV2DailyThemeCard", "DashboardV2HoroscopePage", "DashboardDailyDetailContentLayer"]) {
    assert.ok(dashboard.includes(`function ${name}(`), `${name} must remain`);
    assert.ok(`${dashboard}\n${forecast}`.includes(`<${name}`), `${name} must still be rendered`);
  }
  assert.doesNotMatch(dashboard, /function (?:Dashboard|DashboardV2|AnnualBiorhythmDeveloperView|DailyPerformanceDeveloperView|LunarCountdownWidget|WeeklyAspectList|FixedMotionSidebar|DashboardV2PersonalCard)\(/);
  assert.doesNotMatch(dashboard, /insightVariant/);
  assert.doesNotMatch(forecast, /function (?:planetTexture|earthTexture|earthCloudTexture|demoForecast)\(/);
  for (const name of ["loadPlanetSurfaceTexture", "loadEarthSurfaceTexture", "loadEarthCloudTexture"]) {
    assert.ok(forecast.includes(`${name}(`));
  }
  for (const endpoint of ["/api/dev/reload-csv", "/api/v2/aspect-interpretations", "/api/yearly-forecast", "/api/readings/deferred"]) {
    assert.ok(forecast.includes(endpoint), `${endpoint} is shared/live, not obsolete`);
  }
});

test("missing yearly data stays empty instead of generating demo scores", async () => {
  const forecast = await source("src/forecast-detail.jsx");
  const start = forecast.indexOf("function monthlyData(");
  const end = forecast.indexOf("function dailyDataForMonth(", start);
  assert.ok(start >= 0 && end > start);
  const monthlyData = runInNewContext(`${forecast.slice(start, end)}; monthlyData`);
  for (const input of [null, {}, { yearly_data: [] }]) {
    const result = monthlyData(input);
    assert.equal(Array.isArray(result), true);
    assert.equal(result.length, 0);
  }
});

test("production build keeps existing main and V2 URLs but no developer pages", async () => {
  const built = await build({
    root: fileURLToPath(root),
    configFile: fileURLToPath(new URL("vite.config.mjs", root)),
    logLevel: "silent",
    build: { write: false },
  });
  const output = (Array.isArray(built) ? built : [built]).flatMap((bundle) => bundle.output);
  assert.deepEqual(output.filter((item) => item.fileName.endsWith(".html")).map((item) => item.fileName).sort(), [
    "forecast-detail-v2.html", "forecast-detail.html", "index-v2.html", "index.html",
  ]);
  const modules = output.filter((item) => item.type === "chunk").flatMap((item) => Object.keys(item.modules));
  for (const name of ["forecast-detail.jsx", "dashboard-shared.jsx", "monthly-overview-content.jsx", "planet-surface-textures.mjs", "transit-chart-preload.mjs"]) {
    assert.ok(modules.some((id) => id.replaceAll("\\", "/").endsWith(`/src/${name}`)), `${name} must remain bundled`);
  }
  assert.ok(!modules.some((id) => /annual-biorhythm-dev|snapshot-personal/.test(id)));
});

test("deployment removes stale files only within main, not V2 or other previews", async () => {
  const workflow = await source("../.github/workflows/frontend-preview.yml");
  assert.match(workflow, /destination_dir: \$\{\{ env\.PREVIEW_PATH \}\}/);
  const expression = workflow.match(/keep_files: \$\{\{ (.+) \}\}/)?.[1];
  assert.ok(expression);
  for (const [ref, destination, expected] of [
    ["main", "main", false],
    ["preview/v2", "previews/preview-v2", true],
    ["preview/test", "previews/preview-test", true],
    ["main", "previews/preview-v2", true],
    ["main", "", true],
    ["preview/v2", "main", true],
  ]) {
    assert.equal(runInNewContext(expression, { github: { ref_name: ref }, env: { PREVIEW_PATH: destination } }), expected);
  }
});
