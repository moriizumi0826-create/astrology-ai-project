import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { build } from "vite";

const frontendRoot = new URL("../", import.meta.url);
const removedFiles = [
  "src/forecast-detail.jsx",
  "src/dashboard-shared.jsx",
  "src/monthly-overview-content.jsx",
  "src/monthly-overview.mjs",
  "tests/monthly-overview.test.mjs",
  "annual-biorhythm-dev.html",
  "src/annual-biorhythm-dev.jsx",
  "snapshot-personal.html",
  "src/snapshot-personal.jsx",
];

test("V2 no longer contains paid or developer-only frontend files", async () => {
  for (const file of removedFiles) {
    await assert.rejects(access(new URL(file, frontendRoot)), { code: "ENOENT" });
  }
});

test("legacy URLs redirect to free pages and preserve query parameters and hash", async () => {
  for (const [legacy, target] of [
    ["index.html", "index-v2.html"],
    ["forecast-detail.html", "forecast-detail-v2.html"],
  ]) {
    const html = await readFile(new URL(legacy, frontendRoot), "utf8");
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    assert.ok(script, `${legacy} must have a redirect`);
    assert.doesNotMatch(html, /src\/|tailwind|forecast-detail-root|reading-form/);
    assert.ok(html.includes(`href="./${target}"`), "no-JavaScript fallback link");
    for (const [search, hash] of [["", ""], ["?birth_date=2000-01-01&name=%E3%83%86%E3%82%B9%E3%83%88", "#horoscope"]]) {
      let destination;
      runInNewContext(script, {
        window: { location: { search, hash, replace: (url) => { destination = url; } } },
      });
      assert.equal(destination, `./${target}${search}${hash}`);
    }
  }
});

test("published build contains only free pages and legacy redirects", async () => {
  const result = await build({
    root: fileURLToPath(frontendRoot),
    configFile: fileURLToPath(new URL("vite.config.mjs", frontendRoot)),
    logLevel: "silent",
    build: { write: false },
  });
  const output = (Array.isArray(result) ? result : [result]).flatMap((item) => item.output);
  assert.deepEqual(output.filter((item) => item.fileName.endsWith(".html")).map((item) => item.fileName).sort(), [
    "forecast-detail-v2.html", "forecast-detail.html", "index-v2.html", "index.html",
  ]);
  const modules = output.filter((item) => item.type === "chunk")
    .flatMap((item) => Object.keys(item.modules)).map((id) => id.replaceAll("\\", "/"));
  for (const file of removedFiles) {
    assert.ok(!modules.some((id) => id.endsWith(`/${file}`)), `${file} must not be bundled`);
  }
  for (const file of [
    "main.js", "forecast-detail-free.jsx", "free-horoscope-content.jsx",
    "horoscope-3d-map.jsx", "birth-data-editor.jsx", "transit-chart-preload.mjs",
  ]) {
    assert.ok(modules.some((id) => id.endsWith(`/src/${file}`)), `${file} must remain bundled`);
  }
});

test("deployment cleans only the exact V2 destination, never main or other previews", async () => {
  const workflow = await readFile(new URL("../.github/workflows/frontend-preview.yml", frontendRoot), "utf8");
  assert.match(workflow, /destination_dir: \$\{\{ env\.PREVIEW_PATH \}\}/);
  const expression = workflow.match(/keep_files: \$\{\{ (.+) \}\}/)?.[1];
  assert.ok(expression);
  for (const [ref, destination, expected] of [
    ["preview/v2", "previews/preview-v2", false],
    ["main", "main", true],
    ["preview/other", "previews/preview-other", true],
    ["preview/v2", "main", true],
    ["preview/v2", "", true],
    ["main", "previews/preview-v2", true],
  ]) {
    assert.equal(runInNewContext(expression, {
      github: { ref_name: ref }, env: { PREVIEW_PATH: destination },
    }), expected, `${ref}: ${destination}`);
  }
});
