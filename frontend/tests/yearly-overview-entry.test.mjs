import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";


const dashboardSource = await readFile(new URL("../src/dashboard-shared.jsx", import.meta.url), "utf8");
const componentSource = await readFile(new URL("../src/yearly-overview-content.jsx", import.meta.url), "utf8");

test("places this-year fortune directly after this-month fortune", () => {
  assert.match(
    dashboardSource,
    /\["monthly", "今月の運気"\],\s*\["yearly", "今年の運気"\]/,
  );
  assert.match(dashboardSource, /<YearlyOverviewContent overview=\{yearlyOverview\}/);
});

test("renders the five yearly overview sections", () => {
  for (const label of ["今年の総合テーマ", "中心領域の変化", "主要天体の移動", "今年の流れ", "今年のアクション"]) {
    assert.match(componentSource, new RegExp(label));
  }
});
